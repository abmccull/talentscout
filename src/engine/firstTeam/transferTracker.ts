/**
 * Transfer Tracker — tracks transfer outcomes, classifies success/failure,
 * generates narrative reasons, and applies scout accountability.
 *
 * Design notes:
 *  - Pure functional: no mutations, no side effects.
 *  - RNG is used only for record identity. Outcome evidence and classification
 *    are deterministic across save/reload and manual/batch advancement.
 *  - Outcome explanations use persisted match participation, ratings, dated
 *    injuries, and movement. A missing cause stays explicitly unresolved.
 *
 * Flow:
 *  1. createTransferRecord()  — called when a transfer occurs for a scouted player.
 *  2. updateTransferRecords() — captures an idempotent observable season ledger.
 *  3. classifyOutcome()       — determines supported hit/decent/flop evidence.
 *  4. applyScoutAccountability() — adjusts scout reputation based on outcome + conviction.
 */

import type { RNG } from "@/engine/rng";
import type {
  TransferRecord,
  TransferOutcome,
  TransferOutcomeReason,
  ConvictionLevel,
  Player,
  PlayerMatchRating,
  InboxMessage,
  Fixture,
  TransferSeasonParticipation,
  TransferEvidenceLevel,
  TransferMovementStatus,
} from "@/engine/core/types";
import { LEGACY_SEASON_LENGTH_WEEKS } from "@/engine/core/gameDate";
import { isFixtureInSeason } from "@/engine/world/fixtures";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Minimum seasons after a transfer before an outcome is classified.
 * Players need time to adapt; classifying too early would be unfair.
 */
const MIN_SEASONS_FOR_CLASSIFICATION = 2;

/** Minimum explicit rating samples before a performance claim is supportable. */
const MIN_RATING_SAMPLES = 5;

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
 * @param reportId        The prior report whose prediction will be reviewed.
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
    seasonParticipation: [],
    outcome: undefined,
    outcomeReason: undefined,
    accountabilityApplied: false,
  };
}

// =============================================================================
// 2. generateSeasonSnapshot — update records with current player data
// =============================================================================

export interface TransferRecordUpdateContext {
  fixtures: Record<string, Fixture>;
  completedSeason: number;
  /** Fixture-derived active season length. */
  seasonLength: number;
  retiredPlayerIds?: ReadonlySet<string> | readonly string[];
}

/**
 * Remove fabricated legacy appearance totals and randomized causal labels.
 * Historical classification/accountability is preserved because reputation
 * may already have changed; only unsupported evidence claims are withdrawn.
 */
export function migrateLegacyTransferParticipation(
  records: TransferRecord[] | undefined,
): TransferRecord[] {
  return (records ?? []).map((record) => {
    if (record.seasonParticipation !== undefined) return record;
    return {
      ...record,
      appearances: undefined,
      avgMatchRating: undefined,
      seasonParticipation: [],
      outcomeReason: record.outcomeReason ? "insufficientEvidence" : undefined,
      outcomeEvidenceLevel: "none",
      outcomeEvidence: [
        "Historical participation was not recorded by the match engine; no causal explanation is available.",
      ],
    };
  });
}

function hasRecordedParticipation(rating: PlayerMatchRating): boolean {
  if (rating.minutesPlayed !== undefined) return rating.minutesPlayed > 0;
  if (rating.started !== undefined) return rating.started;
  // Legacy rating rows represented participating players before the explicit
  // fields existed. They remain valid rating evidence, but never imply minutes.
  return true;
}

function resolveMovementStatus(
  record: TransferRecord,
  player: Player,
  retiredPlayerIds: ReadonlySet<string>,
): TransferMovementStatus {
  if (retiredPlayerIds.has(player.id)) return "retired";
  if (player.onLoan && player.loanParentClubId === record.toClubId) {
    return "loanedFromDestination";
  }
  if (player.clubId === record.toClubId || player.contractClubId === record.toClubId) {
    return "atDestination";
  }
  if (!player.clubId && !player.contractClubId) return "unattached";
  return "movedOn";
}

function isOnOrAfterTransfer(
  record: TransferRecord,
  season: number,
  week: number,
): boolean {
  return season > record.transferSeason
    || (season === record.transferSeason && week >= record.transferWeek);
}

function evidenceLevelFor(
  appearances: number,
  teamMatches: number,
  seasonLength: number,
  movementStatus: TransferMovementStatus,
  recordedInjuryWeeks: number,
): TransferEvidenceLevel {
  const requiredOpportunities = Math.max(5, Math.round(seasonLength * 0.13));
  const materialInjuryBurden = Math.max(4, Math.round(seasonLength * 0.13));
  if (
    appearances >= MIN_RATING_SAMPLES
    || teamMatches >= requiredOpportunities
    || recordedInjuryWeeks >= materialInjuryBurden
    || movementStatus !== "atDestination"
  ) {
    return "sufficient";
  }
  if (appearances > 0 || teamMatches > 0) return "limited";
  return "none";
}

/** Build one immutable season ledger row from canonical world evidence. */
export function buildTransferSeasonParticipation(
  record: TransferRecord,
  player: Player,
  matchRatings: Record<string, Record<string, PlayerMatchRating>>,
  context: TransferRecordUpdateContext,
): TransferSeasonParticipation {
  const retiredIds = context.retiredPlayerIds instanceof Set
    ? context.retiredPlayerIds
    : new Set(context.retiredPlayerIds ?? []);
  const relevantFixtures = Object.values(context.fixtures).filter((fixture) =>
    fixture.played
    && isFixtureInSeason(fixture, context.completedSeason)
    && isOnOrAfterTransfer(record, context.completedSeason, fixture.week)
    && (fixture.homeClubId === record.toClubId || fixture.awayClubId === record.toClubId)
  );

  const ratings: PlayerMatchRating[] = [];
  for (const fixture of relevantFixtures) {
    const rating = matchRatings[fixture.id]?.[record.playerId];
    if (rating && hasRecordedParticipation(rating)) ratings.push(rating);
  }

  const minutesRatings = ratings.filter((rating) => rating.minutesPlayed !== undefined);
  const minutesPlayed = minutesRatings.length > 0
    ? minutesRatings.reduce((total, rating) => total + (rating.minutesPlayed ?? 0), 0)
    : undefined;
  const avgMatchRating = ratings.length > 0
    ? Math.round(
      ratings.reduce((total, rating) => total + rating.rating, 0) / ratings.length * 10,
    ) / 10
    : undefined;
  const injuries = (player.injuryHistory?.injuries ?? []).filter((injury) =>
    injury.occurredSeason === context.completedSeason
    && isOnOrAfterTransfer(record, injury.occurredSeason, injury.occurredWeek)
  );
  const recordedInjuryWeeks = injuries.reduce(
    (total, injury) => total + Math.max(0, injury.recoveryWeeks),
    0,
  );
  const movementStatus = resolveMovementStatus(record, player, retiredIds);

  return {
    season: context.completedSeason,
    seasonLength: context.seasonLength,
    teamMatches: relevantFixtures.length,
    appearances: ratings.length,
    starts: ratings.filter((rating) => rating.started === true).length,
    ...(minutesPlayed !== undefined ? { minutesPlayed } : {}),
    appearancesWithoutMinutes: ratings.length - minutesRatings.length,
    ...(avgMatchRating !== undefined ? { avgMatchRating } : {}),
    injuryIncidents: injuries.length,
    recordedInjuryWeeks,
    movementStatus,
    evidenceLevel: evidenceLevelFor(
      ratings.length,
      relevantFixtures.length,
      context.seasonLength,
      movementStatus,
      recordedInjuryWeeks,
    ),
  };
}

function summarizeParticipation(
  seasons: TransferSeasonParticipation[],
): Pick<TransferRecord, "appearances" | "avgMatchRating" | "outcomeEvidenceLevel" | "outcomeEvidence"> {
  const appearances = seasons.reduce((total, season) => total + season.appearances, 0);
  const teamMatches = seasons.reduce((total, season) => total + season.teamMatches, 0);
  const ratingPoints = seasons.reduce(
    (total, season) => total + (season.avgMatchRating ?? 0) * season.appearances,
    0,
  );
  const avgMatchRating = appearances > 0
    ? Math.round(ratingPoints / appearances * 10) / 10
    : undefined;
  const explicitMinutes = seasons.reduce(
    (total, season) => total + (season.minutesPlayed ?? 0),
    0,
  );
  const appearancesWithoutMinutes = seasons.reduce(
    (total, season) => total + season.appearancesWithoutMinutes,
    0,
  );
  const injuryIncidents = seasons.reduce((total, season) => total + season.injuryIncidents, 0);
  const injuryWeeks = seasons.reduce((total, season) => total + season.recordedInjuryWeeks, 0);
  const evidenceLevel: TransferEvidenceLevel = seasons.some(
    (season) => season.evidenceLevel === "sufficient",
  )
    ? "sufficient"
    : seasons.some((season) => season.evidenceLevel === "limited")
      ? "limited"
      : "none";
  const latest = seasons.at(-1);
  const evidence = [
    `${appearances} recorded appearances in ${teamMatches} destination-club fixtures.`,
    ...(explicitMinutes > 0
      ? [`${explicitMinutes} explicitly recorded minutes.`]
      : []),
    ...(appearancesWithoutMinutes > 0
      ? [`Exact minutes were unavailable for ${appearancesWithoutMinutes} appearances.`]
      : []),
    ...(avgMatchRating !== undefined
      ? [`${avgMatchRating.toFixed(1)} average rating from recorded appearances.`]
      : []),
    ...(injuryIncidents > 0
      ? [`${injuryIncidents} dated injury incidents carrying ${injuryWeeks} recovery weeks.`]
      : []),
    ...(latest && latest.movementStatus !== "atDestination"
      ? [`Latest recorded movement status: ${latest.movementStatus}.`]
      : []),
  ];

  return {
    appearances,
    ...(avgMatchRating !== undefined ? { avgMatchRating } : {}),
    outcomeEvidenceLevel: evidenceLevel,
    outcomeEvidence: evidence,
  };
}

/**
 * Update all transfer records with end-of-season data.
 * Stores one idempotent evidence row per completed season, updates CA, and
 * classifies only when enough observable evidence exists.
 *
 * Returns updated records — input is not mutated.
 */
export function updateTransferRecords(
  rng: RNG,
  records: TransferRecord[],
  players: Record<string, Player>,
  matchRatings: Record<string, Record<string, PlayerMatchRating>> = {},
  context?: TransferRecordUpdateContext,
): TransferRecord[] {
  // Retained for API compatibility with older callers. Classification itself
  // deliberately consumes no random values.
  void rng;
  return records.map((record) => {
    const player = players[record.playerId];
    if (!player) return record;

    const completedSeason = context?.completedSeason
      ?? record.transferSeason + record.seasonsSinceTransfer;
    const effectiveContext: TransferRecordUpdateContext = context ?? {
      fixtures: {},
      completedSeason,
      seasonLength: LEGACY_SEASON_LENGTH_WEEKS,
    };
    const priorSeasons = [...(record.seasonParticipation ?? [])]
      .sort((left, right) => left.season - right.season);
    const alreadyRecorded = priorSeasons.some(
      (season) => season.season === effectiveContext.completedSeason,
    );
    const seasons = alreadyRecorded
      ? priorSeasons
      : [
          ...priorSeasons,
          buildTransferSeasonParticipation(record, player, matchRatings, effectiveContext),
        ].sort((left, right) => left.season - right.season);
    const summary = summarizeParticipation(seasons);
    const seasonsSinceTransfer = Math.max(
      record.seasonsSinceTransfer,
      effectiveContext.completedSeason - record.transferSeason + 1,
    );

    let updated: TransferRecord = {
      ...record,
      currentCA: player.currentAbility,
      seasonsSinceTransfer,
      seasonParticipation: seasons,
      ...summary,
    };

    // Classify once the minimum time and evidence gates are both met. An
    // unresolved record keeps being reviewed in later seasons.
    if (
      seasonsSinceTransfer >= MIN_SEASONS_FOR_CLASSIFICATION &&
      updated.outcome === undefined
    ) {
      const classified = classifyOutcome(updated, player);
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
 * Classification uses only observable destination-club participation and
 * ratings. Hidden current ability remains historical engine state, but cannot
 * by itself create a player-facing success/failure verdict.
 *
 * Reasons describe observable evidence, not inferred causes. In particular,
 * low participation never proves a tactical or character problem.
 */
export function classifyOutcome(
  record: TransferRecord,
  player: Player,
): {
  outcome?: TransferOutcome;
  outcomeReason: TransferOutcomeReason;
} {
  const seasons = [...(record.seasonParticipation ?? [])]
    .sort((left, right) => left.season - right.season);
  const evidenceLevel = record.outcomeEvidenceLevel
    ?? summarizeParticipation(seasons).outcomeEvidenceLevel;
  if (evidenceLevel !== "sufficient") {
    return { outcome: undefined, outcomeReason: "insufficientEvidence" };
  }

  void player;
  const appearances = record.appearances ?? 0;
  const avgRating = record.avgMatchRating;
  const latestMovement = seasons.at(-1)?.movementStatus;
  const teamMatches = seasons.reduce((total, season) => total + season.teamMatches, 0);
  const injuryWeeks = seasons.reduce(
    (total, season) => total + season.recordedInjuryWeeks,
    0,
  );
  const appearanceRate = teamMatches > 0 ? appearances / teamMatches : 0;
  const requiredOpportunities = Math.max(
    5,
    Math.round((seasons.at(-1)?.seasonLength ?? LEGACY_SEASON_LENGTH_WEEKS) * 0.13),
  );
  const injuryBurdenThreshold = Math.max(
    4,
    Math.round((seasons.at(-1)?.seasonLength ?? LEGACY_SEASON_LENGTH_WEEKS) * 0.13),
  );
  const ratingTrend = seasons
    .filter((season) => season.avgMatchRating !== undefined)
    .map((season) => season.avgMatchRating as number);

  let outcome: TransferOutcome | undefined;
  if (teamMatches >= requiredOpportunities && appearanceRate < 0.2) {
    outcome = "flop";
  } else if (avgRating !== undefined && appearances >= MIN_RATING_SAMPLES) {
    if (avgRating >= 7.2 && appearanceRate >= 0.4) outcome = "hit";
    else if (avgRating < 6 || appearanceRate < 0.2) outcome = "flop";
    else outcome = "decent";
  }

  // Determine an evidence label. These branches do not pretend to know why a
  // coach selected a player or how they behaved away from recorded matches.
  let outcomeReason: TransferOutcomeReason = "insufficientEvidence";

  if (latestMovement === "retired") {
    outcomeReason = "retired";
  } else if (latestMovement === "movedOn" || latestMovement === "unattached") {
    outcomeReason = "movedOn";
  } else if (injuryWeeks >= injuryBurdenThreshold && appearanceRate < 0.5) {
    outcomeReason = "injury";
  } else if (avgRating !== undefined && avgRating >= 7.2 && outcome === "hit") {
    outcomeReason = "strongPerformance";
  } else if (
    ratingTrend.length >= 2
    && ratingTrend.at(-1)! - ratingTrend[0] >= 0.4
  ) {
    outcomeReason = "slowAdaptation";
  } else if (appearanceRate < 0.35) {
    outcomeReason = "limitedOpportunity";
  } else if (avgRating !== undefined && avgRating >= 7.3) {
    outcomeReason = "strongPerformance";
  } else if (avgRating !== undefined && avgRating < 6) {
    outcomeReason = "underperformed";
  } else if (avgRating !== undefined && appearances >= MIN_RATING_SAMPLES) {
    outcomeReason = "steadyContribution";
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

    const reasonLabel = OUTCOME_REASON_LABELS[record.outcomeReason ?? "insufficientEvidence"];
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
 * This function links prior reports to later transfer activity so predictive
 * accountability can be tracked. It does not award causal placement credit;
 * that requires a destination-matching recruitment opportunity.
 */
export function linkReportsToTransfers(
  rng: RNG,
  transfers: Array<{
    playerId: string;
    fromClubId: string;
    toClubId: string;
    fee: number;
  }>,
  reports: Record<string, {
    playerId: string;
    scoutId: string;
    conviction: ConvictionLevel;
    clubResponse?: string;
    id: string;
    submittedWeek: number;
    submittedSeason: number;
  }>,
  players: Record<string, Player>,
  scoutId: string,
  currentWeek: number,
  currentSeason: number,
  existingTransferKeys: Set<string>,
): TransferRecord[] {
  const newRecords: TransferRecord[] = [];
  const latestReportByPlayer = new Map<string, (typeof reports)[string]>();

  // Eligibility is identical for every transfer in this weekly batch. Build
  // the latest-report index once instead of filtering and sorting the entire
  // report archive for each player movement.
  for (const report of Object.values(reports)) {
    if (
      report.scoutId !== scoutId
      || report.conviction === "note"
      || (
        report.submittedSeason > currentSeason
        || (report.submittedSeason === currentSeason && report.submittedWeek > currentWeek)
      )
      || !(
        report.clubResponse === "signed"
        || report.clubResponse === "shortlisted"
        || report.clubResponse === undefined
      )
    ) {
      continue;
    }
    const current = latestReportByPlayer.get(report.playerId);
    if (
      !current
      || report.submittedSeason > current.submittedSeason
      || (
        report.submittedSeason === current.submittedSeason
        && report.submittedWeek > current.submittedWeek
      )
    ) {
      latestReportByPlayer.set(report.playerId, report);
    }
  }

  for (const transfer of transfers) {
    // A player's later career move is a distinct accountability event. Only
    // suppress the exact transfer occurrence, not every future move.
    const transferKey = `${transfer.playerId}:${transfer.fromClubId}:${transfer.toClubId}:${currentSeason}:${currentWeek}`;
    if (existingTransferKeys.has(transferKey)) continue;

    // Use the most recent eligible report that existed before the transfer.
    // This prevents an old first report from winning forever after the scout
    // has reassessed the player.
    const matchingReport = latestReportByPlayer.get(transfer.playerId);

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
  injury: "Recorded injuries coincided with materially reduced availability",
  tacticalMismatch: "The player did not fit the club's tactical system",
  characterIssues: "Off-field character issues hindered their adaptation",
  overrated: "The player's ability was overestimated in the scouting report",
  perfectFit: "The player was a perfect fit for the club's system and culture",
  exceededExpectations: "The player exceeded all expectations and developed rapidly",
  slowAdaptation: "The player needed time to adapt but is showing steady improvement",
  lateBloom: "A late bloomer who is now beginning to fulfil their potential",
  limitedOpportunity: "The player recorded limited first-team involvement; no cause is inferred",
  strongPerformance: "Recorded match ratings show sustained strong performance",
  steadyContribution: "Recorded match ratings show a steady first-team contribution",
  underperformed: "Recorded match ratings remained below the expected performance benchmark",
  movedOn: "The player is no longer at the destination club",
  retired: "The player's retirement is recorded in the football world",
  insufficientEvidence: "There is not enough recorded evidence to explain the outcome yet",
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
  limitedOpportunity: "bg-zinc-500/10 text-zinc-300 border-zinc-500/20",
  strongPerformance: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  steadyContribution: "bg-sky-500/10 text-sky-300 border-sky-500/20",
  underperformed: "bg-red-500/10 text-red-300 border-red-500/20",
  movedOn: "bg-violet-500/10 text-violet-300 border-violet-500/20",
  retired: "bg-zinc-500/10 text-zinc-300 border-zinc-500/20",
  insufficientEvidence: "bg-zinc-500/10 text-zinc-300 border-zinc-500/20",
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
  limitedOpportunity: "Limited Opportunity",
  strongPerformance: "Strong Performance",
  steadyContribution: "Steady Contribution",
  underperformed: "Underperformed",
  movedOn: "Moved On",
  retired: "Retired",
  insufficientEvidence: "Evidence Pending",
};
