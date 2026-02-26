/**
 * Transfer Tracker — tracks transfer outcomes, classifies success/failure,
 * generates narrative reasons, and applies scout accountability.
 *
 * Design notes:
 *  - Pure functional: no mutations, no side effects.
 *  - All randomness flows through the RNG instance passed in.
 *  - Outcome classification uses player CA trajectory, appearances, and
 *    injury history to determine WHY a transfer succeeded or failed.
 *
 * Flow:
 *  1. createTransferRecord()  — called when a transfer occurs for a scouted player.
 *  2. updateTransferRecords() — called at end-of-season to update CA and appearances.
 *  3. classifyOutcome()       — determines hit/decent/flop and narrative reason.
 *  4. applyScoutAccountability() — adjusts scout reputation based on outcome + conviction.
 */

import type { RNG } from "@/engine/rng";
import type {
  TransferRecord,
  TransferOutcome,
  TransferOutcomeReason,
  ConvictionLevel,
  Player,
  InboxMessage,
} from "@/engine/core/types";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Minimum seasons after a transfer before an outcome is classified.
 * Players need time to adapt; classifying too early would be unfair.
 */
const MIN_SEASONS_FOR_CLASSIFICATION = 2;

/**
 * CA gain threshold to classify as a "hit" (player improved significantly).
 */
const HIT_CA_GAIN_THRESHOLD = 10;

/**
 * CA loss threshold to classify as a "flop" (player regressed or stagnated).
 */
const FLOP_CA_CHANGE_THRESHOLD = -5;

/**
 * Appearance threshold below which a player is considered to have had
 * "low appearances" — suggests tactical mismatch or character issues.
 */
const LOW_APPEARANCES_THRESHOLD = 15;

/**
 * Scout accountability reputation deltas.
 * Keyed by conviction level, then outcome.
 */
const ACCOUNTABILITY_DELTAS: Record<
  ConvictionLevel,
  Partial<Record<TransferOutcome, number>>
> = {
  tablePound: { hit: 8, flop: -5 },
  strongRecommend: { hit: 5, flop: -3 },
  recommend: { hit: 3 },
  note: {},
};

// =============================================================================
// 1. createTransferRecord
// =============================================================================

/**
 * Create a new TransferRecord when a player the scout reported on is transferred.
 *
 * @param rng             Seeded RNG instance for generating unique IDs.
 * @param playerId        The player being transferred.
 * @param scoutId         The scout who recommended the player.
 * @param fromClubId      Source club.
 * @param toClubId        Destination club.
 * @param fee             Transfer fee.
 * @param week            Week the transfer occurred.
 * @param season          Season the transfer occurred.
 * @param conviction      Conviction level from the scout's report.
 * @param reportId        The report that led to the transfer.
 * @param playerCA        Player's current ability at time of transfer.
 */
export function createTransferRecord(
  rng: RNG,
  playerId: string,
  scoutId: string,
  fromClubId: string,
  toClubId: string,
  fee: number,
  week: number,
  season: number,
  conviction: ConvictionLevel,
  reportId: string,
  playerCA: number,
): TransferRecord {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 8; i++) {
    suffix += chars[rng.nextInt(0, chars.length - 1)];
  }

  return {
    id: `tr_${playerId}_${suffix}`,
    playerId,
    scoutId,
    fromClubId,
    toClubId,
    fee,
    transferWeek: week,
    transferSeason: season,
    scoutConviction: conviction,
    reportId,
    caAtTransfer: playerCA,
    currentCA: playerCA,
    seasonsSinceTransfer: 0,
    appearances: undefined,
    outcome: undefined,
    outcomeReason: undefined,
    accountabilityApplied: false,
  };
}

// =============================================================================
// 2. generateSeasonSnapshot — update records with current player data
// =============================================================================

/**
 * Simulated appearance count for a player over a season.
 * Based on injury weeks and form — healthy, in-form players get more appearances.
 *
 * A full season of 38 match weeks with no injuries ≈ 30–38 appearances.
 * Injuries and poor form reduce this significantly.
 */
function simulateAppearances(
  rng: RNG,
  player: Player,
  seasonsSinceTransfer: number,
): number {
  // Base appearances for a full season
  const BASE_APPEARANCES = 30;

  // Injury penalty: if currently injured, appearances drop significantly
  const injuryPenalty = player.injured
    ? Math.min(BASE_APPEARANCES, player.injuryWeeksRemaining * 2)
    : 0;

  // Form modifier: form ranges [-3, 3]; negative form reduces appearances
  const formModifier = Math.max(-8, Math.min(5, player.form * 2));

  // First-season adjustment: new signings may take time to integrate
  const adaptationPenalty = seasonsSinceTransfer === 1 ? rng.nextInt(3, 8) : 0;

  // Professionalism affects consistency of selection
  const profBonus = Math.max(0, (player.attributes.professionalism - 10) / 2);

  const appearances = Math.round(
    BASE_APPEARANCES - injuryPenalty + formModifier - adaptationPenalty + profBonus,
  );

  return Math.max(0, Math.min(38, appearances));
}

/**
 * Update all transfer records with end-of-season data.
 * Increments seasonsSinceTransfer, updates CA and appearances, and
 * classifies outcome when enough data exists.
 *
 * Returns updated records — input is not mutated.
 */
export function updateTransferRecords(
  rng: RNG,
  records: TransferRecord[],
  players: Record<string, Player>,
): TransferRecord[] {
  return records.map((record) => {
    const player = players[record.playerId];
    if (!player) return record;

    const newSeasonsSince = record.seasonsSinceTransfer + 1;
    const newAppearances = simulateAppearances(rng, player, newSeasonsSince);

    // Accumulate appearances across seasons
    const totalAppearances = (record.appearances ?? 0) + newAppearances;

    let updated: TransferRecord = {
      ...record,
      currentCA: player.currentAbility,
      seasonsSinceTransfer: newSeasonsSince,
      appearances: totalAppearances,
    };

    // Classify outcome once we have enough data and outcome is not yet set
    if (
      newSeasonsSince >= MIN_SEASONS_FOR_CLASSIFICATION &&
      updated.outcome === undefined
    ) {
      const classified = classifyOutcome(rng, updated, player);
      updated = { ...updated, ...classified };
    }

    return updated;
  });
}

// =============================================================================
// 3. classifyOutcome — determine hit/decent/flop and narrative reason
// =============================================================================

/**
 * Classify a transfer outcome and determine the narrative reason.
 *
 * Classification logic:
 *  - Hit:    CA increased by >= HIT_CA_GAIN_THRESHOLD since transfer
 *  - Flop:   CA decreased by >= |FLOP_CA_CHANGE_THRESHOLD| since transfer
 *  - Decent: Everything in between
 *
 * Reason logic depends on outcome and contextual factors:
 *  - Flop + low appearances → "tacticalMismatch" or "characterIssues"
 *  - Flop + player injured  → "injury"
 *  - Flop + decent appearances but low rating → "overrated"
 *  - Hit + high rating → "perfectFit" or "exceededExpectations"
 *  - Decent + improving trend → "slowAdaptation" or "lateBloom"
 */
export function classifyOutcome(
  rng: RNG,
  record: TransferRecord,
  player: Player,
): { outcome: TransferOutcome; outcomeReason: TransferOutcomeReason } {
  const caChange = (record.currentCA ?? player.currentAbility) - record.caAtTransfer;
  const appearances = record.appearances ?? 0;

  // Determine outcome classification
  let outcome: TransferOutcome;
  if (caChange >= HIT_CA_GAIN_THRESHOLD) {
    outcome = "hit";
  } else if (caChange <= FLOP_CA_CHANGE_THRESHOLD) {
    outcome = "flop";
  } else {
    outcome = "decent";
  }

  // Determine narrative reason
  let outcomeReason: TransferOutcomeReason;

  if (outcome === "flop") {
    if (player.injured || player.injuryWeeksRemaining > 0) {
      // Player has injury history — that's the primary reason
      outcomeReason = "injury";
    } else if (appearances < LOW_APPEARANCES_THRESHOLD * record.seasonsSinceTransfer) {
      // Low appearances suggests the player didn't fit
      outcomeReason = rng.chance(0.5) ? "tacticalMismatch" : "characterIssues";
    } else {
      // Had appearances but performed poorly — simply overrated
      outcomeReason = "overrated";
    }
  } else if (outcome === "hit") {
    // High-performing transfer
    if (caChange >= HIT_CA_GAIN_THRESHOLD * 2) {
      outcomeReason = "exceededExpectations";
    } else {
      outcomeReason = rng.chance(0.6) ? "perfectFit" : "exceededExpectations";
    }
  } else {
    // Decent outcome — check if the trend is improving
    if (caChange > 0) {
      outcomeReason = rng.chance(0.5) ? "slowAdaptation" : "lateBloom";
    } else {
      // Stagnated or slight decline, but not a flop
      outcomeReason = rng.chance(0.5) ? "slowAdaptation" : "tacticalMismatch";
    }
  }

  return { outcome, outcomeReason };
}

// =============================================================================
// 4. applyScoutAccountability
// =============================================================================

/**
 * Apply scout accountability for classified transfer outcomes.
 * Returns the reputation delta and any inbox messages to generate.
 *
 * Rules:
 *  - tablePound + flop:   reputation -5
 *  - tablePound + hit:    reputation +8
 *  - strongRecommend + flop: reputation -3
 *  - strongRecommend + hit:  reputation +5
 *  - recommend + hit:     reputation +3
 *
 * Generates an inbox message describing the outcome and its effect on reputation.
 */
export function applyScoutAccountability(
  records: TransferRecord[],
  players: Record<string, Player>,
  clubs: Record<string, { name: string; shortName: string }>,
  currentWeek: number,
  currentSeason: number,
): {
  updatedRecords: TransferRecord[];
  reputationDelta: number;
  messages: InboxMessage[];
} {
  let reputationDelta = 0;
  const messages: InboxMessage[] = [];

  const updatedRecords = records.map((record) => {
    // Only process records that have an outcome but accountability not yet applied
    if (!record.outcome || record.accountabilityApplied) return record;

    const delta =
      ACCOUNTABILITY_DELTAS[record.scoutConviction]?.[record.outcome] ?? 0;

    if (delta === 0) {
      // No accountability impact — just mark as applied
      return { ...record, accountabilityApplied: true };
    }

    reputationDelta += delta;

    // Build inbox message
    const player = players[record.playerId];
    const toClub = clubs[record.toClubId];
    const playerName = player
      ? `${player.firstName} ${player.lastName}`
      : "Unknown Player";
    const clubName = toClub?.name ?? "Unknown Club";

    const reasonLabel = OUTCOME_REASON_LABELS[record.outcomeReason ?? "overrated"];
    const isPositive = delta > 0;

    messages.push({
      id: `accountability_${record.id}_s${currentSeason}w${currentWeek}`,
      week: currentWeek,
      season: currentSeason,
      type: "feedback",
      title: `Transfer Outcome: ${playerName}`,
      body:
        `Your recommendation of ${playerName} to ${clubName} has been classified as a ${record.outcome}. ` +
        `${reasonLabel}. ` +
        `Your reputation has ${isPositive ? "increased" : "decreased"} by ${Math.abs(delta)}.`,
      read: false,
      actionRequired: false,
      relatedId: record.playerId,
    });

    return { ...record, accountabilityApplied: true };
  });

  return { updatedRecords, reputationDelta, messages };
}

// =============================================================================
// 5. linkReportsToTransfers
// =============================================================================

/**
 * Check whether any of the transfers this week match reports the scout has
 * submitted. If a transferred player has a scout report with conviction
 * "recommend" or higher and clubResponse "signed", create a TransferRecord.
 *
 * This function links the scout's reports to actual transfer activity so
 * that accountability can be tracked.
 */
export function linkReportsToTransfers(
  rng: RNG,
  transfers: Array<{
    playerId: string;
    fromClubId: string;
    toClubId: string;
    fee: number;
  }>,
  reports: Record<string, { playerId: string; scoutId: string; conviction: ConvictionLevel; clubResponse?: string; id: string }>,
  players: Record<string, Player>,
  scoutId: string,
  currentWeek: number,
  currentSeason: number,
  existingRecordPlayerIds: Set<string>,
): TransferRecord[] {
  const newRecords: TransferRecord[] = [];

  for (const transfer of transfers) {
    // Skip if we already have a record for this player
    if (existingRecordPlayerIds.has(transfer.playerId)) continue;

    // Find a matching scout report for this player
    const matchingReport = Object.values(reports).find(
      (r) =>
        r.playerId === transfer.playerId &&
        r.scoutId === scoutId &&
        r.conviction !== "note" &&
        (r.clubResponse === "signed" || r.clubResponse === "shortlisted" || r.clubResponse === undefined),
    );

    if (!matchingReport) continue;

    const player = players[transfer.playerId];
    if (!player) continue;

    newRecords.push(
      createTransferRecord(
        rng,
        transfer.playerId,
        scoutId,
        transfer.fromClubId,
        transfer.toClubId,
        transfer.fee,
        currentWeek,
        currentSeason,
        matchingReport.conviction,
        matchingReport.id,
        player.currentAbility,
      ),
    );
  }

  return newRecords;
}

// =============================================================================
// DISPLAY HELPERS
// =============================================================================

/**
 * Human-readable labels for outcome reasons.
 */
export const OUTCOME_REASON_LABELS: Record<TransferOutcomeReason, string> = {
  injury: "Persistent injuries prevented the player from establishing themselves",
  tacticalMismatch: "The player did not fit the club's tactical system",
  characterIssues: "Off-field character issues hindered their adaptation",
  overrated: "The player's ability was overestimated in the scouting report",
  perfectFit: "The player was a perfect fit for the club's system and culture",
  exceededExpectations: "The player exceeded all expectations and developed rapidly",
  slowAdaptation: "The player needed time to adapt but is showing steady improvement",
  lateBloom: "A late bloomer who is now beginning to fulfil their potential",
};

/**
 * Badge color class for each outcome.
 */
export const OUTCOME_COLORS: Record<TransferOutcome, string> = {
  hit: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  decent: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  flop: "bg-red-500/20 text-red-400 border-red-500/30",
};

/**
 * Badge color class for each outcome reason.
 */
export const OUTCOME_REASON_COLORS: Record<TransferOutcomeReason, string> = {
  injury: "bg-red-500/10 text-red-300 border-red-500/20",
  tacticalMismatch: "bg-orange-500/10 text-orange-300 border-orange-500/20",
  characterIssues: "bg-rose-500/10 text-rose-300 border-rose-500/20",
  overrated: "bg-red-500/10 text-red-400 border-red-500/20",
  perfectFit: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  exceededExpectations: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
  slowAdaptation: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  lateBloom: "bg-blue-500/10 text-blue-300 border-blue-500/20",
};

/**
 * Short labels for outcome reasons, suitable for badge text.
 */
export const OUTCOME_REASON_SHORT_LABELS: Record<TransferOutcomeReason, string> = {
  injury: "Injury",
  tacticalMismatch: "Tactical Mismatch",
  characterIssues: "Character Issues",
  overrated: "Overrated",
  perfectFit: "Perfect Fit",
  exceededExpectations: "Exceeded Expectations",
  slowAdaptation: "Slow Adaptation",
  lateBloom: "Late Bloom",
};
