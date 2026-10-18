import { expandPlayerPersonalityProfile } from "../players/playerStateArchive";
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
import { estimateContractWageBaseline } from "@/engine/players/wages";
import { canFundSquadCompletion, getEmergencySquadVacancies, getGoalkeeperRecruitmentNeed } from "./squadPlanning";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Senior contracts above this depth are allowed to expire by ability order. */
export const SENIOR_SQUAD_RENEWAL_CAP = 32;

/** Pool duration tiers by CA (max weeks before dropout). */
const POOL_DURATION_ELITE = 104;   // Two calendar years to find another level.
const POOL_DURATION_QUALITY = 78;
const POOL_DURATION_DEPTH = 52;
const POOL_DURATION_JOURNEYMAN = 52;

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
  const expiringPlayers = Object.values(state.players).filter((player) => {
    const owner = player.contractClubId ?? player.loanParentClubId ?? player.clubId;
    return Boolean(owner && state.clubs[owner]) && player.contractExpiry <= state.currentSeason;
  });
  const appearanceIndex = buildRenewalAppearanceIndex(state, expiringPlayers);
  // Expiry is one planning horizon: only ongoing contracts are committed.
  // Reserve accepted replacement deals below, rather than charging both the
  // old expiring payroll and the new deals during priority selection.
  for (const player of expiringPlayers) {
    const owner = player.contractClubId ?? player.loanParentClubId ?? player.clubId;
    const entry = affordabilityContext[owner!];
    entry.currentWeeklyCommitment = Math.max(
      0, entry.currentWeeklyCommitment - Math.max(0, Math.round(player.wage ?? 0)),
    );
  }
  const ongoingKeeperClubs = new Set(Object.values(state.players)
    .filter((player) => player.position === "GK" && player.age >= 18
      && player.contractExpiry > state.currentSeason && !player.onLoan)
    .map((player) => player.contractClubId ?? player.clubId));
  const compareSportingPriority = (a: Player, b: Player): number => {
    const ownerA = a.contractClubId ?? a.loanParentClubId ?? a.clubId;
    const ownerB = b.contractClubId ?? b.loanParentClubId ?? b.clubId;
    const keeperA = a.position === "GK" && a.age >= 18 && !ongoingKeeperClubs.has(ownerA);
    const keeperB = b.position === "GK" && b.age >= 18 && !ongoingKeeperClubs.has(ownerB);
    return Number(keeperB) - Number(keeperA)
      || b.currentAbility - a.currentAbility
      || b.potentialAbility - a.potentialAbility
      || a.age - b.age
      || a.id.localeCompare(b.id);
  };
  expiringPlayers.sort((a, b) => {
    const ownerA = a.contractClubId ?? a.loanParentClubId ?? a.clubId ?? "";
    const ownerB = b.contractClubId ?? b.loanParentClubId ?? b.clubId ?? "";
    return ownerA.localeCompare(ownerB) || compareSportingPriority(a, b);
  });
  const renewalPriorityByClub = new Map<string, Set<string>>();
  const committedRosterByClub = new Map<string, Set<string>>();
  for (const club of Object.values(state.clubs)) {
    // Next-season cover is ongoing owned contracts plus accepted renewals.
    // Other expiring deals and borrowed players are not secured replacements.
    committedRosterByClub.set(club.id, new Set(club.playerIds.filter((id) => {
      const candidate = state.players[id];
      return candidate && candidate.contractExpiry > state.currentSeason
        && !candidate.onLoan && candidate.clubId === club.id
        && (candidate.contractClubId ?? candidate.clubId) === club.id;
    })));
    const ranked = (club.playerIds ?? [])
      .map((playerId) => state.players[playerId])
      .filter((player): player is Player => Boolean(player))
      .sort(compareSportingPriority)
      .slice(0, SENIOR_SQUAD_RENEWAL_CAP)
      .map((player) => player.id);
    renewalPriorityByClub.set(club.id, new Set(ranked));
  }

  for (let index = 0; index < expiringPlayers.length; index++) {
    const first = expiringPlayers[index];
    const owner = first.contractClubId ?? first.loanParentClubId ?? first.clubId;
    const secured = [...(committedRosterByClub.get(owner) ?? [])].map(id => state.players[id]);
    const needsKeeper = !secured.some(member => member?.position === "GK");
    const needsOutfield = secured.filter(member => member && member.position !== "GK").length < 10;
    // Re-evaluate after each agreement or rejection. A first keeper's renewal
    // must not keep every reserve keeper ahead of missing outfield starters.
    const fillsPriority = (candidate: Player) => candidate.clubId === owner
      && !candidate.onLoan && candidate.age >= 18
      && (needsKeeper ? candidate.position === "GK" : needsOutfield && candidate.position !== "GK");
    let next = index;
    if (needsKeeper || needsOutfield) {
      for (let search = index; search < expiringPlayers.length; search++) {
        const candidate = expiringPlayers[search];
        if ((candidate.contractClubId ?? candidate.loanParentClubId ?? candidate.clubId) !== owner) break;
        if (fillsPriority(candidate)) { next = search; break; }
      }
    }
    const [player] = expiringPlayers.splice(next, 1);
    expiringPlayers.splice(index, 0, player);
    const playerId = player.id;
    const ownerClubId = player.contractClubId ?? player.loanParentClubId ?? player.clubId;
    // Skip players without a contract owner (already unsigned/youth)
    if (!ownerClubId) continue;
    // Skip players whose contract hasn't expired
    if (player.contractExpiry > state.currentSeason) continue;

    const club = state.clubs[ownerClubId];
    if (!club) continue;
    const overCapacity = (club.playerIds?.length ?? 0) > SENIOR_SQUAD_RENEWAL_CAP;
    const retainedForSquadDepth = renewalPriorityByClub.get(ownerClubId)?.has(playerId) ?? false;

    const committedRoster = committedRosterByClub.get(ownerClubId)!;
    const planningClub = { ...club, playerIds: [...committedRoster] };
    if (player.clubId === ownerClubId && !planningClub.playerIds.includes(playerId)) {
      planningClub.playerIds.push(playerId);
    }
    const appearances = appearanceIndex.get(club.id)?.get(player.id) ?? 0;
    const renewalChance = calculateRenewalChanceWithAppearances(player, planningClub, state, appearances);

    if ((!overCapacity || retainedForSquadDepth) && rng.chance(renewalChance)) {
      const extension = preferredRenewalLength(player, appearances, player.morale ?? 5);
      const renewedWage = renewalWageExpectation(
        player,
        club,
        extension,
        appearances,
        player.morale ?? 5,
      );
      const playerAcceptance = playerRenewalAcceptanceChance(player, club, state, appearances);
      const clubAffordability = affordabilityContext[ownerClubId];
      const affordability = clubAffordability && assessClubAffordabilityFromContext(
        clubAffordability,
        {
          weeklyWageCommitment: renewedWage,
        },
      );
      if (!affordability?.affordable
        || !canFundSquadCompletion(affordability.remainingWeeklyHeadroom, planningClub.playerIds.length, renewedWage,
          getGoalkeeperRecruitmentNeed(player, planningClub, state.players), getEmergencySquadVacancies(player, planningClub, state.players), player.age)
        || !rng.chance(playerAcceptance)) {
        // Fall through to release when the club cannot carry the next deal.
      } else {
        renewals.push({
          playerId,
          clubId: ownerClubId,
          contractLength: extension,
          wage: renewedWage,
        });
        renewedPlayerIds.push(playerId);
        if (player.clubId === ownerClubId && !player.onLoan) committedRoster.add(playerId);
        // Later negotiations must include every agreement already made here.
        affordabilityContext[ownerClubId] = {
          club: clubAffordability.club,
          currentWeeklyCommitment: affordability.projectedWeeklyCommitment,
        };
        continue;
      }
    }

    const release = createContractReleaseFeedback(player, club, state, rng);
    releasedPlayers.push(release.agent);
    messages.push(...release.messages);
  }

  return {
    releasedPlayers,
    renewedPlayerIds,
    renewals,
    messages,
  };
}

/** Shared prospective release terms; callers publish only applied releases. */
export function createContractReleaseFeedback(
  player: Player,
  club: Club,
  state: Pick<GameState, "leagues" | "currentWeek" | "currentSeason">,
  rng: RNG,
): { agent: FreeAgent; messages: InboxMessage[] } {
  const countryKey = normalizeCountryKey(state.leagues[club.leagueId]?.country)
    ?? countryKeyFromNationality(player.nationality) ?? "england";
  return {
    agent: createFreeAgentFromPlayer(player, club, state.currentSeason, countryKey),
    messages: player.currentAbility > 65 ? [{
      id: makeMessageId("fa_release", rng),
      week: state.currentWeek,
      season: state.currentSeason,
      type: "event",
      title: `${player.firstName} ${player.lastName} Released`,
      body: `${player.firstName} ${player.lastName} (${player.age}, ${player.position}) has been released by ${club.name} and is available as a free agent.`,
      read: false,
      actionRequired: false,
      relatedId: player.id,
      relatedEntityType: "player",
    }] : [],
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function sportingRenewalValue(player: Player, club: Club, players: GameState["players"]): number {
  const squad = [...new Set(club.playerIds)].map((id) => players[id])
    .filter((candidate): candidate is Player => Boolean(candidate) && Number.isFinite(candidate.currentAbility));
  const abilities = squad.map((candidate) => candidate.currentAbility).sort((a, b) => a - b);
  const typicalAbility = abilities.length
    ? abilities[Math.floor(abilities.length / 2)]
    : club.reputation * 2;
  const advantage = player.currentAbility - typicalAbility;
  const qualityValue = advantage >= 10 ? 0.85 : advantage >= -10 ? 0.7 : 0.4;
  // Sporting continuity matters before replacing a player: a short squad
  // should actively try to keep viable depth, even at a low playing level.
  return qualityValue + (squad.length < 18 ? 0.15 : 0);
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

function buildRenewalAppearanceIndex(
  state: GameState,
  expiringPlayers: readonly Player[],
): Map<string, Map<string, number>> {
  const index = new Map<string, Map<string, number>>();
  for (const player of expiringPlayers) {
    const owner = player.contractClubId ?? player.loanParentClubId ?? player.clubId;
    const club = state.clubs[owner];
    if (!club) continue;
    let counts = index.get(club.id);
    if (!counts) { counts = new Map(); index.set(club.id, counts); }
    counts.set(player.id, 0);
  }
  if (index.size === 0) return index;
  // Fixtures and ratings do not change during the negotiation batch. Query
  // only the expiring players for each fixture club, preserving the scalar
  // lookup's legacy/key semantics without repeated whole-ledger scans.
  for (const [fixtureId, ratings] of Object.entries(state.matchRatings ?? {})) {
    const fixture = state.fixtures[fixtureId];
    if (!fixture?.played || fixture.season !== state.currentSeason) continue;
    const clubIds = fixture.homeClubId === fixture.awayClubId
      ? [fixture.homeClubId] : [fixture.homeClubId, fixture.awayClubId];
    for (const clubId of clubIds) {
      const counts = index.get(clubId);
      if (!counts) continue;
      for (const playerId of counts.keys()) {
        const rating = ratings[playerId];
        if (rating && (rating.minutesPlayed !== undefined ? rating.minutesPlayed > 0 : rating.started ?? true)) {
          counts.set(playerId, counts.get(playerId)! + 1);
        }
      }
    }
  }
  return index;
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
  club: Club,
  contractLength: number,
  appearances: number,
  morale: number,
): number {
  const abilityBaseline = estimateContractWageBaseline(player.currentAbility, club.reputation, player.wage);
  const usageMultiplier = appearances >= 12 ? 1.12
    : appearances >= 6 ? 1.05
      : appearances === 0 ? 0.94
        : 1;
  const moraleMultiplier = morale >= 7 ? 1.05
    : morale <= 3 ? 0.96
      : 1;
  const transferWillingness = expandPlayerPersonalityProfile(player.personalityProfile)?.transferWillingness ?? 0.5;
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
      abilityBaseline
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
  appearances: number,
): number {
  const morale = player.morale ?? 5;
  const coverage = positionCoverage(player, club, state);
  const transferWillingness = expandPlayerPersonalityProfile(player.personalityProfile)?.transferWillingness ?? 0.5;
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
  return calculateRenewalChanceWithAppearances(
    player, club, state, currentSeasonAppearances(player.id, club.id, state as GameState),
  );
}

function calculateRenewalChanceWithAppearances(
  player: Player,
  club: Club,
  state: Pick<GameState, "players" | "fixtures" | "matchRatings" | "currentSeason" | "managerProfiles">,
  appearances: number,
): number {
  let chance = sportingRenewalValue(player, club, state.players);
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

export function getMaxWeeksInPool(ca: number): number {
  // Ability uses a 1–200 scale. Better players should have longer viable
  // careers, not disappear sooner because interest was expected to be fast.
  if (ca >= 150) return POOL_DURATION_ELITE;
  if (ca >= 120) return POOL_DURATION_QUALITY;
  if (ca >= 90) return POOL_DURATION_DEPTH;
  return POOL_DURATION_JOURNEYMAN;
}

export function createFreeAgentFromPlayer(
  player: Player,
  club: Club,
  currentSeason: number,
  countryKey: string,
): FreeAgent {
  const baseWage = estimateContractWageBaseline(player.currentAbility, club.reputation, player.wage);
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
