/**
 * Contract Expiry Processing — season-end engine that decides which players
 * are renewed, released (→ free agent pool), or retired.
 *
 * Pure function: no side effects, no mutation.
 * All randomness flows through the RNG instance.
 */

import type { RNG } from "@/engine/rng";
import type {
  GameState,
  Player,
  Club,
  FreeAgent,
  InboxMessage,
} from "@/engine/core/types";
import {
  assessClubAffordabilityFromContext,
  buildClubAffordabilityContext,
} from "@/engine/finance/clubEconomics";
import { formationPositions, parseFormation } from "@/engine/firstTeam/systemFit";
import { countryKeyFromNationality, normalizeCountryKey } from "@/lib/country";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Base renewal probabilities by CA tier. */
const RENEWAL_CHANCE_HIGH = 0.70;    // CA > 70
const RENEWAL_CHANCE_MID = 0.50;     // CA 50-70
const RENEWAL_CHANCE_LOW = 0.30;     // CA < 50

/** Club reputation tiers — top clubs renew more aggressively. */
const HIGH_REP_RENEWAL_BOOST = 0.15;   // rep > 75
const LOW_REP_RENEWAL_PENALTY = -0.10; // rep < 30

/** Senior contracts above this depth are allowed to expire by ability order. */
export const SENIOR_SQUAD_RENEWAL_CAP = 32;

/** Pool duration tiers by CA (max weeks before dropout). */
const POOL_DURATION_ELITE = 4;      // CA 75+
const POOL_DURATION_QUALITY = 8;    // CA 60-74
const POOL_DURATION_DEPTH = 16;     // CA 45-59
const POOL_DURATION_JOURNEYMAN = 20; // CA < 45

// =============================================================================
// ID GENERATION
// =============================================================================

function makeMessageId(prefix: string, rng: RNG): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 8; i++) {
    id += chars[rng.nextInt(0, chars.length - 1)];
  }
  return `${prefix}_${id}`;
}

// =============================================================================
// PUBLIC API
// =============================================================================

export interface ContractExpiryResult {
  /** Players who were released and should be added to the free agent pool. */
  releasedPlayers: FreeAgent[];
  /** Player IDs whose contracts were renewed (club extended them). */
  renewedPlayerIds: string[];
  /** Atomic renewal decisions for the player lifecycle resolver. */
  renewals: Array<{
    playerId: string;
    clubId: string;
    contractLength: number;
    wage: number;
  }>;
  /** Inbox messages about notable releases. */
  messages: InboxMessage[];
}

/**
 * Process all expiring contracts at the end of a season.
 *
 * For each player whose contractExpiry <= currentSeason:
 *   1. Roll for renewal (based on CA, club rep, form)
 *   2. If not renewed and old + low CA: roll for retirement
 *   3. Otherwise: release to free agent pool
 */
export function processContractExpiries(
  state: GameState,
  rng: RNG,
): ContractExpiryResult {
  const releasedPlayers: FreeAgent[] = [];
  const renewedPlayerIds: string[] = [];
  const renewals: ContractExpiryResult["renewals"] = [];
  const messages: InboxMessage[] = [];
  const affordabilityContext = buildClubAffordabilityContext(
    state.clubs,
    state.players,
    { currentWeek: state.currentWeek, currentSeason: state.currentSeason },
  );
  const renewalPriorityByClub = new Map<string, Set<string>>();
  for (const club of Object.values(state.clubs)) {
    const ranked = (club.playerIds ?? [])
      .map((playerId) => state.players[playerId])
      .filter((player): player is Player => Boolean(player))
      .sort(
        (a, b) =>
          b.currentAbility - a.currentAbility
          || b.potentialAbility - a.potentialAbility
          || a.age - b.age
          || a.id.localeCompare(b.id),
      )
      .slice(0, SENIOR_SQUAD_RENEWAL_CAP)
      .map((player) => player.id);
    renewalPriorityByClub.set(club.id, new Set(ranked));
  }

  for (const [playerId, player] of Object.entries(state.players)) {
    const ownerClubId = player.contractClubId ?? player.loanParentClubId ?? player.clubId;
    // Skip players without a contract owner (already unsigned/youth)
    if (!ownerClubId) continue;
    // Skip players whose contract hasn't expired
    if (player.contractExpiry > state.currentSeason) continue;

    const club = state.clubs[ownerClubId];
    if (!club) continue;
    const overCapacity = (club.playerIds?.length ?? 0) > SENIOR_SQUAD_RENEWAL_CAP;
    const retainedForSquadDepth = renewalPriorityByClub.get(ownerClubId)?.has(playerId) ?? false;

    const renewalChance = calculateContractRenewalChance(player, club, state);

    if ((!overCapacity || retainedForSquadDepth) && rng.chance(renewalChance)) {
      const appearances = currentSeasonAppearances(player.id, club.id, state);
      const extension = preferredRenewalLength(player, appearances, player.morale ?? 5);
      const renewedWage = renewalWageExpectation(
        player,
        extension,
        appearances,
        player.morale ?? 5,
      );
      const playerAcceptance = playerRenewalAcceptanceChance(player, club, state);
      const clubAffordability = affordabilityContext[ownerClubId];
      const affordability = clubAffordability && assessClubAffordabilityFromContext(
        clubAffordability,
        {
          weeklyWageCommitment: renewedWage,
          releasedWeeklyCommitment: Math.max(0, player.wage),
        },
      );
      if (!affordability?.affordable || !rng.chance(playerAcceptance)) {
        // Fall through to release when the club cannot carry the next deal.
      } else {
        renewals.push({
          playerId,
          clubId: ownerClubId,
          contractLength: extension,
          wage: renewedWage,
        });
        renewedPlayerIds.push(playerId);
        continue;
      }
    }

    // Release to free agent pool
    const countryKey =
      normalizeCountryKey(state.leagues[club.leagueId]?.country)
      ?? countryKeyFromNationality(player.nationality)
      ?? "england";
    const freeAgent = createFreeAgentFromPlayer(
      player,
      club,
      state.currentSeason,
      countryKey,
    );
    releasedPlayers.push(freeAgent);

    // Notable release message (CA > 65)
    if (player.currentAbility > 65) {
      messages.push({
        id: makeMessageId("fa_release", rng),
        week: state.currentWeek,
        season: state.currentSeason,
        type: "event",
        title: `${player.firstName} ${player.lastName} Released`,
        body: `${player.firstName} ${player.lastName} (${player.age}, ${player.position}) has been released by ${club.name} and is available as a free agent.`,
        read: false,
        actionRequired: false,
      });
    }
  }

  return {
    releasedPlayers,
    renewedPlayerIds,
    renewals,
    messages,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function getRenewalChance(ca: number): number {
  if (ca > 70) return RENEWAL_CHANCE_HIGH;
  if (ca >= 50) return RENEWAL_CHANCE_MID;
  return RENEWAL_CHANCE_LOW;
}

function getClubReputationModifier(reputation: number): number {
  if (reputation > 75) return HIGH_REP_RENEWAL_BOOST;
  if (reputation < 30) return LOW_REP_RENEWAL_PENALTY;
  return 0;
}

function currentSeasonAppearances(playerId: string, clubId: string, state: GameState): number {
  let appearances = 0;
  for (const [fixtureId, ratings] of Object.entries(state.matchRatings ?? {})) {
    const fixture = state.fixtures[fixtureId];
    if (
      !fixture?.played
      || fixture.season !== state.currentSeason
      || (fixture.homeClubId !== clubId && fixture.awayClubId !== clubId)
    ) continue;
    const rating = ratings[playerId];
    if (!rating) continue;
    if (rating.minutesPlayed !== undefined ? rating.minutesPlayed > 0 : rating.started ?? true) {
      appearances += 1;
    }
  }
  return appearances;
}

function tacticalPositions(formation: string): ReadonlySet<Player["position"]> {
  const parsed = parseFormation(formation);
  return parsed
    ? formationPositions(parsed.defenders, parsed.midfielders, parsed.forwards)
    : new Set<Player["position"]>();
}

function positionCoverage(player: Player, club: Club, state: Pick<GameState, "players">): number {
  return club.playerIds.reduce((coverage, playerId) => {
    if (playerId === player.id) return coverage;
    const teammate = state.players[playerId];
    if (!teammate) return coverage;
    if (teammate.position === player.position) return coverage + 1;
    if (teammate.secondaryPositions?.includes(player.position)) return coverage + 0.35;
    return coverage;
  }, 0);
}

function preferredRenewalLength(
  player: Player,
  appearances: number,
  morale: number,
): number {
  if (player.age <= 21) return appearances >= 6 && morale >= 5 ? 4 : 3;
  if (player.age <= 24) return 3;
  if (player.age <= 28) return appearances >= 12 && morale >= 6 ? 3 : 2;
  if (player.age <= 31) return 2;
  return 1;
}

function renewalWageExpectation(
  player: Player,
  contractLength: number,
  appearances: number,
  morale: number,
): number {
  const abilityBaseline = Math.round(player.currentAbility * 60);
  const usageMultiplier = appearances >= 12 ? 1.12
    : appearances >= 6 ? 1.05
      : appearances === 0 ? 0.94
        : 1;
  const moraleMultiplier = morale >= 7 ? 1.05
    : morale <= 3 ? 0.96
      : 1;
  const transferWillingness = player.personalityProfile?.transferWillingness ?? 0.5;
  const personalityMultiplier = transferWillingness >= 0.75 ? 1.08
    : transferWillingness <= 0.25 ? 0.96
      : 1;
  const ageMultiplier = player.age <= 21 ? 1.08
    : player.age >= 33 ? 0.9
      : player.age >= 30 ? 0.95
        : 1;
  const termMultiplier = contractLength >= 4 ? 1.04 : contractLength === 1 ? 0.94 : 1;

  return Math.max(
    100,
    Math.round(
      Math.max(player.wage, abilityBaseline)
      * usageMultiplier
      * moraleMultiplier
      * personalityMultiplier
      * ageMultiplier
      * termMultiplier,
    ),
  );
}

function playerRenewalAcceptanceChance(
  player: Player,
  club: Club,
  state: Pick<GameState, "players" | "fixtures" | "matchRatings" | "currentSeason" | "managerProfiles">,
): number {
  const morale = player.morale ?? 5;
  const appearances = currentSeasonAppearances(player.id, club.id, state as GameState);
  const coverage = positionCoverage(player, club, state);
  const transferWillingness = player.personalityProfile?.transferWillingness ?? 0.5;
  let chance = 0.48;

  chance += Math.max(-0.15, Math.min(0.15, (morale - 5) * 0.05));
  chance += appearances >= 12 ? 0.16
    : appearances >= 6 ? 0.08
      : appearances === 0 ? -0.16
        : -0.04;
  chance += coverage <= 1 ? 0.08 : coverage >= 4 ? -0.12 : 0;
  chance += transferWillingness <= 0.25 ? 0.14
    : transferWillingness >= 0.75 ? -0.14
      : 0;

  const manager = state.managerProfiles?.[club.id];
  if (manager) {
    const required = tacticalPositions(manager.preferredFormation);
    if (required.has(player.position)) chance += 0.08;
    else if (player.secondaryPositions?.some((position) => required.has(position))) chance += 0.02;
    else chance -= 0.12;
  }

  const playerLevel = player.currentAbility / 2;
  if (playerLevel > club.reputation + 15) chance -= 0.12;
  else if (club.reputation > playerLevel + 20) chance += 0.04;

  if (player.age >= 32) chance += 0.08;
  if (player.age <= 21 && appearances >= 6) chance += 0.06;

  return Math.min(0.96, Math.max(0.05, chance));
}

/**
 * Contract decisions combine sporting value with role, morale, career stage,
 * playing time and ambition. Affordability remains a separate hard gate so the
 * score stays understandable rather than becoming an accounting simulation.
 */
export function calculateContractRenewalChance(
  player: Player,
  club: Club,
  state: Pick<GameState, "players" | "fixtures" | "matchRatings" | "currentSeason" | "managerProfiles">,
): number {
  let chance = getRenewalChance(player.currentAbility);
  chance += getClubReputationModifier(club.reputation);
  chance += Math.max(-0.12, Math.min(0.12, player.form * 0.035));
  chance += Math.max(-0.12, Math.min(0.12, ((player.morale ?? 5) - 5) * 0.025));

  if (player.age <= 21) chance += 0.08;
  else if (player.age >= 34) chance -= 0.2;
  else if (player.age >= 31) chance -= 0.08;

  const coverage = positionCoverage(player, club, state);
  chance += coverage === 0 ? 0.12
    : coverage <= 1.35 ? 0.05
      : coverage >= 4 ? -0.12
        : 0;

  const appearances = currentSeasonAppearances(player.id, club.id, state as GameState);
  if (appearances >= 12) chance += 0.1;
  else if (appearances >= 6) chance += 0.04;
  else if (appearances === 0 && player.age >= 23) chance -= 0.12;

  const playerLevel = player.currentAbility / 2;
  if (playerLevel > club.reputation + 15) chance -= 0.12;
  else if (club.reputation > playerLevel + 20) chance += 0.04;

  const manager = state.managerProfiles?.[club.id];
  if (manager) {
    const required = tacticalPositions(manager.preferredFormation);
    if (required.has(player.position)) chance += 0.05;
    else if (!(player.secondaryPositions ?? []).some((position) => required.has(position))) chance -= 0.08;
  }

  return Math.min(0.95, Math.max(0.03, chance));
}

function getMaxWeeksInPool(ca: number): number {
  if (ca >= 75) return POOL_DURATION_ELITE;
  if (ca >= 60) return POOL_DURATION_QUALITY;
  if (ca >= 45) return POOL_DURATION_DEPTH;
  return POOL_DURATION_JOURNEYMAN;
}

function createFreeAgentFromPlayer(
  player: Player,
  club: Club,
  currentSeason: number,
  countryKey: string,
): FreeAgent {
  // Wage expectation based on CA and age
  const baseWage = Math.round(player.currentAbility * 80);
  // Older players accept lower wages
  const ageFactor = player.age > 30 ? 0.8 : player.age > 28 ? 0.9 : 1.0;
  const wageExpectation = Math.round(baseWage * ageFactor);

  // Signing bonus: 2-4 weeks wages
  const signingBonusExpectation = Math.round(wageExpectation * 3);

  return {
    playerId: player.id,
    country: countryKey,
    nationality: player.nationality,
    releasedFrom: club.id,
    releasedSeason: currentSeason,
    weeksInPool: 0,
    maxWeeksInPool: getMaxWeeksInPool(player.currentAbility),
    wageExpectation,
    signingBonusExpectation,
    discoverySource: null,
    discoveredByScout: false,
    npcInterest: [],
    status: "available",
  };
}
