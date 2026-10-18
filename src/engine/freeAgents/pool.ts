/**
 * Free Agent Pool Management — maintains the global pool of available
 * free agents, handles weekly decay, NPC signings, and visibility filtering.
 *
 * The pool is global (~100-200 agents at any time) but scouts only see
 * free agents from countries they have familiarity with.
 *
 * Pure functions: no side effects, no mutation.
 * All randomness flows through the RNG instance.
 */

import type { RNG } from "@/engine/rng";
import type {
  FreeAgent,
  FreeAgentPool,
  FreeAgentNPCInterest,
  GameState,
  Player,
  Club,
  InboxMessage,
} from "@/engine/core/types";
import {
  assessClubAffordabilityFromContext,
  buildClubAffordabilityContext,
  type ClubAffordabilityContext,
} from "@/engine/finance/clubEconomics";
import { countryKeyFromNationality, normalizeCountryKey } from "@/lib/country";
import { getScoutHomeCountry } from "@/engine/world/travel";
import {
  deriveClubRecruitmentDoctrine,
  scoreDoctrineAgeFit,
} from "@/engine/world/recruitmentIdentity";
import { formationPositions, parseFormation } from "@/engine/firstTeam/systemFit";
import { getMaxWeeksInPool } from "./expiry";
import { estimateContractWageBaseline } from "@/engine/players/wages";
import { canFundSquadCompletion, getEmergencySquadVacancies, getGoalkeeperRecruitmentNeed } from "./squadPlanning";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Probability an NPC club makes an offer per week (per free agent, scaled by CA). */
const NPC_OFFER_BASE_CHANCE = 0.08;
/** CA multiplier for NPC interest — higher CA attracts more interest. */
const NPC_OFFER_CA_MULTIPLIER = 0.003;
/** After this many weeks, NPC signing probability accelerates. */
const NPC_URGENCY_WEEK = 3;
/** Chance NPC offer is accepted per week while pending. */
export const NPC_ACCEPTANCE_CHANCE = 0.40;

/** Wage decay per week in pool (% reduction). */
const WAGE_DECAY_RATE = 0.03;
/** Minimum wage floor (won't drop below this regardless of decay). */
const MIN_WAGE = 200;

/** Maximum pool size — if exceeded, accelerate NPC signings. */
const POOL_OVERFLOW_THRESHOLD = 200;

/** Mid-season trickle: mutual termination chance per week per club. */
const MID_SEASON_RELEASE_CHANCE = 0.0008;
/** Only players below this CA can be mid-season released. */
const MID_SEASON_RELEASE_CA_CEILING = 60;

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

function resolveFreeAgentCountryKey(
  player: Player,
  releasedFromClub: Club,
  state: GameState,
): string {
  return (
    normalizeCountryKey(state.leagues[releasedFromClub.leagueId]?.country)
    ?? countryKeyFromNationality(player.nationality)
    ?? normalizeCountryKey(player.nationality)
    ?? getScoutHomeCountry(state.scout)
    ?? "england"
  );
}

function isTerminalStatus(status: FreeAgent["status"]): boolean {
  return status === "signed" || status === "retired" || status === "droppedOut";
}

function tacticalPositions(formation: string): ReadonlySet<Player["position"]> {
  const parsed = parseFormation(formation);
  return parsed
    ? formationPositions(parsed.defenders, parsed.midfielders, parsed.forwards)
    : new Set<Player["position"]>();
}

function positionCoverage(
  player: Pick<Player, "id" | "position">,
  club: Club,
  state: Pick<GameState, "players">,
): number {
  return club.playerIds.reduce((coverage, playerId) => {
    const squadPlayer = state.players[playerId];
    if (!squadPlayer || squadPlayer.id === player.id) return coverage;
    if (squadPlayer.position === player.position) return coverage + 1;
    if (squadPlayer.secondaryPositions?.includes(player.position)) return coverage + 0.35;
    return coverage;
  }, 0);
}

function seniorGoalkeeperCount(club: Club, state: Pick<GameState, "players">): number {
  return [...new Set(club.playerIds)].filter((id) => state.players[id]?.position === "GK").length;
}

/** Seek continuity before every existing keeper can leave the next planning horizon. */
function needsGoalkeeperSuccessor(club: Club, state: Pick<GameState, "players" | "currentSeason">): boolean {
  const keepers = [...new Set(club.playerIds)].map((id) => state.players[id])
    .filter((player): player is Player => Boolean(player) && player.position === "GK");
  return keepers.length > 0 && keepers.every((keeper) =>
    keeper.age >= 32 || keeper.onLoan || keeper.contractExpiry <= state.currentSeason,
  );
}

function hasRecruitmentSpace(club: Club, player: Player, state: Pick<GameState, "players">): boolean {
  const size = new Set(club.playerIds).size;
  if (size >= 30) return false;
  // Preserve the final place for a keeper when there is none in the squad.
  return player.position === "GK" || size < 29 || seniorGoalkeeperCount(club, state) > 0;
}

function clubCountryKey(
  club: Club,
  state: Pick<GameState, "leagues">,
): string | undefined {
  return normalizeCountryKey(state.leagues?.[club.leagueId]?.country);
}

function freeAgentCountryKey(
  agent: Pick<FreeAgent, "country" | "nationality"> | undefined,
): string | undefined {
  if (!agent) return undefined;
  return (
    normalizeCountryKey(agent.country)
    ?? countryKeyFromNationality(agent.country)
    ?? countryKeyFromNationality(agent.nationality)
    ?? normalizeCountryKey(agent.nationality)
  );
}

function geographyFitMultiplier(
  club: Club,
  doctrine: ReturnType<typeof deriveClubRecruitmentDoctrine>,
  state: Pick<GameState, "leagues">,
  agent?: Pick<FreeAgent, "country" | "nationality">,
): number {
  const clubCountry = clubCountryKey(club, state);
  const agentCountry = freeAgentCountryKey(agent);
  if (!clubCountry || !agentCountry) return 1;
  if (clubCountry === agentCountry) return 1.18;

  let multiplier = 0.55 + doctrine.adaptationTolerance / 100 * 0.35;
  if (doctrine.geographicReach === "global") multiplier += 0.22;
  else if (doctrine.geographicReach === "international") multiplier += 0.12;
  else if (doctrine.geographicReach === "regional") multiplier -= 0.06;
  else multiplier -= 0.18;
  return Math.max(0.35, Math.min(1.08, multiplier));
}

// =============================================================================
// PUBLIC API
// =============================================================================

/** Create an empty free agent pool for a new game. */
export function createEmptyPool(season: number): FreeAgentPool {
  return {
    agents: [],
    lastRefreshSeason: season,
    totalReleasedThisSeason: 0,
    totalSignedThisSeason: 0,
    totalRetiredThisSeason: 0,
  };
}

export interface PoolTickResult {
  /** Updated pool after weekly processing. */
  updatedPool: FreeAgentPool;
  /** Player IDs of free agents signed by NPC clubs this week. */
  npcSignedPlayerIds: Array<{
    playerId: string;
    clubId: string;
    wage: number;
    signingBonus: number;
    contractLength: number;
  }>;
  /** Player IDs of free agents who retired or dropped out. */
  removedPlayerIds: string[];
  /** Inbox messages about NPC signings of tracked free agents. */
  messages: InboxMessage[];
  /** New mid-season releases to add to pool. */
  midSeasonReleases: FreeAgent[];
}

/**
 * Weekly tick for the free agent pool.
 *
 * Each week:
 *  1. Increment weeksInPool for all available agents
 *  2. Decay wage expectations
 *  3. Process NPC interest and signings
 *  4. Remove expired agents (exceeded maxWeeksInPool)
 *  5. Generate mid-season trickle releases
 */
export function tickFreeAgentPool(
  state: GameState,
  rng: RNG,
  options: { allowMidSeasonReleases?: boolean } = {},
): PoolTickResult {
  const pool = state.freeAgentPool;
  const npcSignedPlayerIds: PoolTickResult["npcSignedPlayerIds"] = [];
  const removedPlayerIds: string[] = [];
  const messages: InboxMessage[] = [];
  const midSeasonReleases: FreeAgent[] = [];
  const recruitmentPlayers = { ...state.players };
  const recruitmentState = { ...state, players: recruitmentPlayers };
  // Scoped to this tick. Each accepted deal replaces its club object below.
  const interestContexts = new WeakMap<Club, ClubInterestContext>();
  const affordabilityContext = buildClubAffordabilityContext(
    state.clubs,
    state.players,
    { currentWeek: state.currentWeek, currentSeason: state.currentSeason },
  );

  // Determine if pool is overflowing (accelerate NPC signings)
  const overflowMultiplier = pool.agents.length > POOL_OVERFLOW_THRESHOLD ? 2.0 : 1.0;

  const updatedAgents: FreeAgent[] = [];

  for (const agent of pool.agents) {
    if (isTerminalStatus(agent.status)) {
      // Recover a legacy accepted offer whose ownership settlement never ran.
      // Active ownership/loans and genuinely retired careers are not revived.
      const player = state.players[agent.playerId];
      if (agent.status === "signed" && player && !player.clubId && !player.contractClubId
        && !player.loanParentClubId && !player.onLoan) {
        updatedAgents.push({ ...agent, status: "available", npcInterest: [] });
      }
      continue;
    }

    if (agent.status !== "available") {
      updatedAgents.push(agent);
      continue;
    }

    // Legacy saves may contain repeated offers from one club. Keep its first
    // offer so it cannot occupy multiple slots or roll acceptance repeatedly.
    const offeredClubs = new Set<string>();
    let updated = { ...agent, npcInterest: agent.npcInterest.filter((interest) => {
      if (offeredClubs.has(interest.clubId)) return false;
      offeredClubs.add(interest.clubId);
      return true;
    }) };
    const player = state.players[agent.playerId];
    if (player) {
      // Upgrade legacy short deadlines without reviving terminal careers.
      updated.maxWeeksInPool = Math.max(agent.maxWeeksInPool, getMaxWeeksInPool(player.currentAbility));
    }

    // 1. Increment time in pool
    updated.weeksInPool = agent.weeksInPool + 1;

    // 2. Decay wage expectations
    updated.wageExpectation = Math.max(
      MIN_WAGE,
      Math.round(agent.wageExpectation * (1 - WAGE_DECAY_RATE)),
    );
    updated.signingBonusExpectation = Math.max(
      0,
      Math.round(agent.signingBonusExpectation * (1 - WAGE_DECAY_RATE * 1.5)),
    );

    // 3. Check for expiry (max weeks exceeded)
    if (updated.weeksInPool >= updated.maxWeeksInPool) {
      if (player && player.age > 32) {
        updated.status = "retired";
        removedPlayerIds.push(agent.playerId);
      } else {
        updated.status = "droppedOut";
        removedPlayerIds.push(agent.playerId);
      }
      updatedAgents.push(updated);
      continue;
    }

    // 4. NPC interest generation
    if (player) {
      const caBonus = player.currentAbility * NPC_OFFER_CA_MULTIPLIER;
      const urgencyBonus = updated.weeksInPool > NPC_URGENCY_WEEK ? 0.05 : 0;
      const offerChance = Math.min(
        0.95,
        (NPC_OFFER_BASE_CHANCE + caBonus + urgencyBonus) * overflowMultiplier,
      );

      if (rng.chance(offerChance) && updated.npcInterest.length < 3) {
        const npcClub = findInterestedNPCClub(
          player,
          updated,
          recruitmentState,
          affordabilityContext,
          rng,
          interestContexts,
        );
        if (npcClub) {
          updated.npcInterest = [
            ...updated.npcInterest,
            { clubId: npcClub.id, offerWeek: state.currentWeek, accepted: false },
          ];
        }
      }
    }

    // 5. Process existing NPC interest — check for accepted offers
    const newInterest: FreeAgentNPCInterest[] = [];
    for (const interest of updated.npcInterest) {
      if (interest.accepted) {
        newInterest.push(interest);
        continue;
      }
      // Offers can outlive the squad space or financial headroom that created
      // them. Earlier agreements in this tick also consume those resources.
      const entry = affordabilityContext[interest.clubId];
      if (!player || !entry || !hasRecruitmentSpace(entry.club, player, state)) continue;
      const affordability = assessClubAffordabilityFromContext(entry, {
        upfrontCost: updated.signingBonusExpectation,
        weeklyWageCommitment: updated.wageExpectation,
      });
      if (!affordability.affordable || !canFundSquadCompletion(
        affordability.remainingWeeklyHeadroom, new Set([...entry.club.playerIds, player.id]).size, updated.wageExpectation,
        getGoalkeeperRecruitmentNeed(player, entry.club, recruitmentPlayers), getEmergencySquadVacancies(player, entry.club, recruitmentPlayers), player.age,
      )) continue;
      // Check if NPC offer gets accepted this week
      if (rng.chance(NPC_ACCEPTANCE_CHANCE * overflowMultiplier)) {
        npcSignedPlayerIds.push({
          playerId: agent.playerId,
          clubId: interest.clubId,
          wage: updated.wageExpectation,
          signingBonus: updated.signingBonusExpectation,
          contractLength: player && player.age >= 32 ? 1 : player && player.age >= 29 ? 2 : 3,
        });
        affordabilityContext[interest.clubId] = {
          club: {
            ...entry.club,
            budget: affordability.remainingBudget,
            playerIds: [...entry.club.playerIds, agent.playerId],
          },
          currentWeeklyCommitment: affordability.projectedWeeklyCommitment,
        };
        const acceptedDeal = npcSignedPlayerIds[npcSignedPlayerIds.length - 1];
        recruitmentPlayers[player.id] = {
          ...player,
          clubId: interest.clubId,
          contractClubId: interest.clubId,
          contractExpiry: state.currentSeason + acceptedDeal.contractLength,
          wage: acceptedDeal.wage,
          onLoan: false,
        };
        updated.status = "signed";
        // If the scout had discovered this player, notify them
        if (agent.discoveredByScout) {
          const npcClub = state.clubs[interest.clubId];
          const p = state.players[agent.playerId];
          if (p && npcClub) {
            messages.push({
              id: makeMessageId("fa_npc_sign", rng),
              week: state.currentWeek,
              season: state.currentSeason,
              type: "event",
              title: `${p.firstName} ${p.lastName} Signs with ${npcClub.name}`,
              body: `Free agent ${p.firstName} ${p.lastName} has signed with ${npcClub.name}. He is no longer available.`,
              read: false,
              actionRequired: false,
            });
          }
        }
        break;
      }
      newInterest.push(interest);
    }
    updated.npcInterest = newInterest;

    updatedAgents.push(updated);
  }

  // 6. Mid-season trickle — random releases from clubs
  if (options.allowMidSeasonReleases !== false) {
    const releasedThisTick = new Set<string>();
    for (const player of Object.values(state.players)) {
      const ownerClubId = player.contractClubId ?? player.loanParentClubId ?? player.clubId;
      if (!ownerClubId || player.onLoan || player.clubId !== ownerClubId) continue;
      if (player.currentAbility > MID_SEASON_RELEASE_CA_CEILING) continue;
      if (player.age < 25) continue; // Young players don't get terminated mid-season
      if (!rng.chance(MID_SEASON_RELEASE_CHANCE)) continue;

      const club = state.clubs[ownerClubId];
      if (!club) continue;
      const remainingSeniors = [...new Set(club.playerIds)].map((id) => state.players[id])
        .filter((teammate): teammate is Player => Boolean(teammate)
          && teammate.clubId === club.id && teammate.age >= 18
          && teammate.id !== player.id && !releasedThisTick.has(teammate.id));
      // A voluntary termination needs viable cover, including departures
      // already agreed in this batch. Loaned-out and academy players cannot fill it.
      if (remainingSeniors.length < 18) continue;
      if (player.position === "GK" && !remainingSeniors.some(
        (teammate) => teammate.position === "GK" && !teammate.injured,
      )) continue;

      // Don't release if already in pool
      if (updatedAgents.some((a) => a.playerId === player.id)) continue;

      const maxWeeks = player.currentAbility >= 45 ? 16 : 20;
      const baseWage = estimateContractWageBaseline(player.currentAbility, club.reputation, player.wage);
      const ageFactor = player.age > 30 ? 0.8 : 0.9;

      midSeasonReleases.push({
        playerId: player.id,
        country: resolveFreeAgentCountryKey(player, club, state),
        nationality: player.nationality,
        releasedFrom: club.id,
        releasedSeason: state.currentSeason,
        weeksInPool: 0,
        maxWeeksInPool: maxWeeks,
        wageExpectation: Math.round(baseWage * ageFactor),
        signingBonusExpectation: Math.round(baseWage * ageFactor * 2),
        discoverySource: null,
        discoveredByScout: false,
        npcInterest: [],
        status: "available",
      });
      releasedThisTick.add(player.id);
    }
  }

  // Build updated pool
  const updatedPool: FreeAgentPool = {
    agents: [...updatedAgents, ...midSeasonReleases],
    lastRefreshSeason: pool.lastRefreshSeason,
    totalReleasedThisSeason: pool.totalReleasedThisSeason + midSeasonReleases.length,
    totalSignedThisSeason: pool.totalSignedThisSeason + npcSignedPlayerIds.length,
    totalRetiredThisSeason: pool.totalRetiredThisSeason + removedPlayerIds.length,
  };

  return {
    updatedPool,
    npcSignedPlayerIds,
    removedPlayerIds,
    messages,
    midSeasonReleases,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Find an NPC club interested in signing a free agent.
 * Clubs must have budget and position need.
 */
function findInterestedNPCClub(
  player: Player,
  agent: FreeAgent,
  state: GameState,
  affordabilityContext: ClubAffordabilityContext,
  rng: RNG,
  interestContexts: WeakMap<Club, ClubInterestContext>,
): Club | null {
  const candidates: Array<{ item: Club; weight: number }> = [];
  for (const entry of Object.values(affordabilityContext)) {
    const club = entry.club;
    if (agent.npcInterest.some((interest) => interest.clubId === club.id)) continue;
    // Don't sign back to former club (if still exists)
    if (club.id === agent.releasedFrom) continue;
    // Reject an incompatible reputation before calculating financial and
    // positional cover for every club in a large, mature world's pool.
    // These gates consume no randomness and keep candidate order unchanged.
    const playerReputation = player.currentAbility / 2;
    if (Math.abs(club.reputation - playerReputation) > 25) continue;
    // Registration capacity is a cheap, pure gate. Full squads cannot make
    // an offer, so do not compute their finances and vacancy reserves for
    // every free agent in a mature career. Candidate order/RNG stay intact.
    if (!hasRecruitmentSpace(club, player, state)) continue;
    const affordability = assessClubAffordabilityFromContext(entry, {
      upfrontCost: agent.signingBonusExpectation,
      weeklyWageCommitment: agent.wageExpectation,
    });
    if (!affordability.affordable || !canFundSquadCompletion(
      affordability.remainingWeeklyHeadroom, new Set([...club.playerIds, player.id]).size, agent.wageExpectation,
      getGoalkeeperRecruitmentNeed(player, club, state.players), getEmergencySquadVacancies(player, club, state.players), player.age,
    )) continue;
    let context = interestContexts.get(club);
    if (!context) {
      context = buildClubInterestContext(club, state);
      interestContexts.set(club, context);
    }
    const weight = scoreClubInterest(player, club, state, agent, context);
    if (weight < 0.25) continue;
    candidates.push({
      item: club,
      weight,
    });
  }

  if (candidates.length === 0) return null;
  if (player.position === "GK") {
    const withoutKeeper = candidates.filter(({ item }) => seniorGoalkeeperCount(item, state) === 0);
    if (withoutKeeper.length > 0) return rng.pickWeighted(withoutKeeper);
    if (player.age < 32) {
      const succession = candidates.filter(({ item }) => needsGoalkeeperSuccessor(item, state));
      if (succession.length > 0) return rng.pickWeighted(succession);
    }
    // A sole keeper leaves no specialist cover for injury or an unexpected
    // departure. Fill this depth need before adding a third keeper elsewhere.
    const needsBackup = candidates.filter(({ item }) => seniorGoalkeeperCount(item, state) < 2);
    if (needsBackup.length > 0) return rng.pickWeighted(needsBackup);
  }
  return rng.pickWeighted(candidates);
}

/**
 * Explainable NPC interest score. Affordability remains a hard gate above;
 * this weight makes squad need and club doctrine decide among viable offers.
 */
export function scoreFreeAgentClubInterest(
  player: Pick<Player, "age" | "position" | "currentAbility">,
  club: Club,
  state: Pick<GameState, "players" | "managerProfiles" | "seed" | "currentSeason" | "leagues">
    & { runManifest?: Pick<GameState["runManifest"], "manifestVersion" | "contentDefinitionIds"> },
  agent?: Pick<FreeAgent, "country" | "nationality">,
): number {
  return scoreClubInterest(player, club, state, agent, buildClubInterestContext(club, state));
}

type InterestState = Parameters<typeof scoreFreeAgentClubInterest>[2];
interface ClubInterestContext {
  doctrine: ReturnType<typeof deriveClubRecruitmentDoctrine>;
  managerPositions: ReadonlySet<Player["position"]> | undefined;
  depthUrgency: number;
  coverage: Map<Player["position"], number>;
}

function buildClubInterestContext(club: Club, state: InterestState): ClubInterestContext {
  const doctrine = deriveClubRecruitmentDoctrine({
    club,
    seed: state.seed,
    season: state.currentSeason,
    manager: state.managerProfiles[club.id],
    runManifest: state.runManifest,
  });
  // Positional cover alone misses a depleted squad: one CM in an eight-player
  // team has a different recruitment urgency from one in a full squad.
  // Count reserved arrivals as well, so successful deals reduce this urgency.
  // A loan, expiring deal or late-career player provides current cover but
  // cannot be treated as a full secured place for the next planning horizon.
  // This is a risk allowance, not a prediction that retirement will occur.
  const squadSize = [...new Set(club.playerIds)].reduce((coverage, id) => {
    const member = state.players[id];
    if (!member) return coverage;
    const continuityRisk = member.onLoan || member.age >= 32
      || member.contractExpiry <= state.currentSeason;
    return coverage + (continuityRisk ? 0.5 : 1);
  }, 0);
  const depthUrgency = 1 + Math.min(2, Math.max(0, 18 - squadSize) / 7);
  const manager = state.managerProfiles[club.id];
  return { doctrine, depthUrgency, coverage: new Map(),
    managerPositions: manager ? tacticalPositions(manager.preferredFormation) : undefined };
}

function scoreClubInterest(
  player: Pick<Player, "age" | "position" | "currentAbility">,
  club: Club, state: InterestState,
  agent: Pick<FreeAgent, "country" | "nationality"> | undefined,
  context: ClubInterestContext,
): number {

  let coverage = context.coverage.get(player.position);
  if (coverage === undefined) {
    coverage = positionCoverage({ ...player, id: "__candidate__" }, club, state);
    context.coverage.set(player.position, coverage);
  }
  const squadNeed = coverage === 0 ? 2.35
    : coverage <= 1.35 ? 1.65
      : coverage <= 2.35 ? 0.95
        : 0.35;
  const { doctrine, depthUrgency, managerPositions } = context;
  const ageFit = 0.65 + scoreDoctrineAgeFit(player.age, doctrine) / 100 * 0.7;
  const targetReputation = player.currentAbility / 2;
  const reputationFit = Math.max(0.35, 1 - Math.abs(club.reputation - targetReputation) / 35);
  const geographyFit = geographyFitMultiplier(club, doctrine, state, agent);
  const managerFit = !managerPositions ? 1
    : managerPositions.has(player.position) ? 1.12
      : 0.6;
  return Math.max(0.01, squadNeed * depthUrgency * ageFit * reputationFit * geographyFit * managerFit);
}
