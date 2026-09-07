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
  Position,
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
import { calculatePlayerWeeklyWage, getContractWageBaseline } from "@/engine/finance/wages";
import { generatePlayer } from "@/engine/players/generation";
import { getClubAbilityMidpoint } from "@/engine/players/clubAbility";
import {
  COMPETITIVE_REGISTERED_FLOOR,
  countRegisteredAtClub,
  countRegisteredKeepers,
  wouldBreachCompetitiveOutflowGuard,
} from "@/engine/match/eligibleRoster";

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
const NPC_ACCEPTANCE_CHANCE = 0.40;

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

/** Outfield fill order for emergency journeyman depth when the FA pool is empty. */
const EMERGENCY_OUTFIELD_ORDER: readonly Position[] = [
  "CB", "CM", "ST", "LB", "RB", "CDM", "CAM", "LW", "RW",
];

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
    relaxWeeklyWageCap?: boolean;
  }>;
  /** Player IDs of free agents who retired or dropped out. */
  removedPlayerIds: string[];
  /** Inbox messages about NPC signings of tracked free agents. */
  messages: InboxMessage[];
  /** New mid-season releases to add to pool. */
  midSeasonReleases: FreeAgent[];
  /**
   * Newly generated unattached players for emergency XI/GK restock when the
   * free-agent market has no affordable body. Staged into the world before
   * freeAgentSigning lifecycle apply.
   */
  spawnedPlayers: Player[];
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
      // Recover free agents marked signed but never actually attached — a failed
      // lifecycle apply must not permanently remove them from the market.
      if (agent.status === "signed") {
        const player = state.players[agent.playerId];
        const attached = Boolean(player && (player.contractClubId ?? player.clubId));
        if (player && !attached) {
          updatedAgents.push({ ...agent, status: "available", npcInterest: [] });
        }
      }
      continue;
    }

    if (agent.status !== "available") {
      updatedAgents.push(agent);
      continue;
    }

    let updated = { ...agent };

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
    if (updated.weeksInPool >= agent.maxWeeksInPool) {
      const player = state.players[agent.playerId];
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
    const player = state.players[agent.playerId];
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
          state,
          affordabilityContext,
          rng,
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
      // Check if NPC offer gets accepted this week
      if (rng.chance(NPC_ACCEPTANCE_CHANCE * overflowMultiplier)) {
        npcSignedPlayerIds.push({
          playerId: agent.playerId,
          clubId: interest.clubId,
          wage: updated.wageExpectation,
          signingBonus: updated.signingBonusExpectation,
          contractLength: player && player.age >= 32 ? 1 : player && player.age >= 29 ? 2 : 3,
        });
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
    for (const player of Object.values(state.players)) {
      const ownerClubId = player.contractClubId ?? player.loanParentClubId ?? player.clubId;
      if (!ownerClubId || player.onLoan || player.clubId !== ownerClubId) continue;
      if (player.currentAbility > MID_SEASON_RELEASE_CA_CEILING) continue;
      if (player.age < 25) continue; // Young players don't get terminated mid-season
      if (!rng.chance(MID_SEASON_RELEASE_CHANCE)) continue;

      const club = state.clubs[ownerClubId];
      if (!club) continue;
      // Preserve competitive depth buffer and the last registered keeper.
      if (wouldBreachCompetitiveOutflowGuard(club, state.players, player.id)) continue;

      // Don't release if already in pool
      if (updatedAgents.some((a) => a.playerId === player.id)) continue;

      const maxWeeks = player.currentAbility >= 45 ? 16 : 20;
      const baseWage = getContractWageBaseline(player, club.reputation);
      const ageFactor = player.age > 30 ? 0.8 : 0.9;

      midSeasonReleases.push({
        playerId: player.id,
        country: resolveFreeAgentCountryKey(player, club, state),
        nationality: player.nationality,
        releasedFrom: club.id,
        releasedSeason: state.currentSeason,
        weeksInPool: 0,
        maxWeeksInPool: maxWeeks,
        wageExpectation: Math.max(MIN_WAGE, Math.round(baseWage * ageFactor)),
        signingBonusExpectation: Math.round(baseWage * ageFactor * 2),
        discoverySource: null,
        discoveredByScout: false,
        npcInterest: [],
        status: "available",
      });
    }
  }

  // 7. Emergency restock: funded clubs already below a competitive XI (or
  // without a keeper) claim available free agents before the week ends.
  // Same-tick mid-season releases are claimable (release still applies first
  // via lifecycle priority). When the market cannot supply a body, spawn a
  // journeyman so funded clubs are not stranded by an empty GK/depth pool.
  const pendingSigningsByClub = new Map<string, number>();
  const pendingKeepersByClub = new Map<string, number>();
  const claimedAgentIds = new Set(npcSignedPlayerIds.map((entry) => entry.playerId));
  const spawnedPlayers: Player[] = [];
  for (const signing of npcSignedPlayerIds) {
    pendingSigningsByClub.set(
      signing.clubId,
      (pendingSigningsByClub.get(signing.clubId) ?? 0) + 1,
    );
    const signedPlayer = state.players[signing.playerId];
    if (signedPlayer?.position === "GK") {
      pendingKeepersByClub.set(
        signing.clubId,
        (pendingKeepersByClub.get(signing.clubId) ?? 0) + 1,
      );
    }
  }
  const thinTargets = Object.values(state.clubs)
    .map((club) => {
      const registered = countRegisteredAtClub(club, state.players)
        + (pendingSigningsByClub.get(club.id) ?? 0);
      const keepers = countRegisteredKeepers(club, state.players)
        + (pendingKeepersByClub.get(club.id) ?? 0);
      return { club, registered, keepers };
    })
    .filter((entry) =>
      entry.registered < COMPETITIVE_REGISTERED_FLOOR || entry.keepers === 0)
    .sort((left, right) => left.registered - right.registered
      || left.keepers - right.keepers
      || left.club.id.localeCompare(right.club.id));

  const claimSources: Array<{ agents: FreeAgent[]; label: "pool" | "midSeason" }> = [
    { agents: updatedAgents, label: "pool" },
    { agents: midSeasonReleases, label: "midSeason" },
  ];

  for (const target of thinTargets) {
    let registered = target.registered;
    let keepers = target.keepers;
    const claimNext = (requireKeeper: boolean): boolean => {
      let chosenSource: (typeof claimSources)[number] | null = null;
      let chosenIndex = -1;
      let chosenWage = Number.POSITIVE_INFINITY;
      for (const source of claimSources) {
        for (let index = 0; index < source.agents.length; index += 1) {
          const agent = source.agents[index];
          if (agent.status !== "available" || claimedAgentIds.has(agent.playerId)) continue;
          if (agent.releasedFrom === target.club.id) continue;
          const player = state.players[agent.playerId];
          if (!player) continue;
          if (requireKeeper && player.position !== "GK") continue;
          const entry = affordabilityContext[target.club.id];
          if (!entry) continue;
          const emergencyDepth = requireKeeper || registered < COMPETITIVE_REGISTERED_FLOOR;
          // Depth/GK emergencies may temporarily exceed wage budget so a funded
          // club is not stranded one body short; signing bonus cash still gates.
          const affordability = assessClubAffordabilityFromContext(entry, {
            upfrontCost: agent.signingBonusExpectation,
            weeklyWageCommitment: emergencyDepth ? 0 : agent.wageExpectation,
          });
          const canPay = emergencyDepth
            ? affordability.remainingBudgetAfterReserve >= 0
            : affordability.affordable;
          if (!canPay) continue;
          // Missing keepers may recruit outside ordinary reputation bands; depth
          // restock still keeps a wide but finite band so funded lower clubs rebuild.
          if (!requireKeeper) {
            const playerReputation = player.currentAbility / 2;
            if (Math.abs(target.club.reputation - playerReputation) > 55) continue;
          }
          // Prefer the cheapest affordable body so thin clubs are not stranded one
          // signing short after spending headroom on expensive free agents.
          if (
            agent.wageExpectation < chosenWage
            || (agent.wageExpectation === chosenWage
              && (
                chosenIndex < 0
                || agent.playerId < (chosenSource?.agents[chosenIndex]?.playerId ?? "")
              ))
          ) {
            chosenSource = source;
            chosenIndex = index;
            chosenWage = agent.wageExpectation;
          }
        }
      }
      if (!chosenSource || chosenIndex < 0) return false;
      const agent = chosenSource.agents[chosenIndex];
      const player = state.players[agent.playerId]!;
      claimedAgentIds.add(agent.playerId);
      // Leave the agent available until lifecycle apply succeeds. Marking signed
      // here permanently orphans rejected claims from the free-agent market.
      chosenSource.agents[chosenIndex] = { ...agent, status: "available" };
      npcSignedPlayerIds.push({
        playerId: agent.playerId,
        clubId: target.club.id,
        wage: agent.wageExpectation,
        signingBonus: agent.signingBonusExpectation,
        contractLength: player.age >= 32 ? 1 : player.age >= 29 ? 2 : 3,
        relaxWeeklyWageCap: true,
      });
      // Keep subsequent claims on this club honest about remaining wage capacity.
      const entry = affordabilityContext[target.club.id];
      if (entry) {
        entry.currentWeeklyCommitment += Math.max(0, agent.wageExpectation);
      }
      registered += 1;
      if (player.position === "GK") keepers += 1;
      return true;
    };

    const spawnEmergency = (requireKeeper: boolean): boolean => {
      const entry = affordabilityContext[target.club.id];
      if (!entry) return false;
      // Journeymen carry no signing bonus; cash reserve must still clear.
      const affordability = assessClubAffordabilityFromContext(entry, {
        upfrontCost: 0,
        weeklyWageCommitment: 0,
      });
      if (affordability.remainingBudgetAfterReserve < 0) return false;

      const midpoint = getClubAbilityMidpoint(target.club.reputation);
      const ability = Math.max(20, Math.round(midpoint * 0.75));
      const position: Position = requireKeeper
        ? "GK"
        : EMERGENCY_OUTFIELD_ORDER[registered % EMERGENCY_OUTFIELD_ORDER.length]!;
      const nationality = state.leagues[target.club.leagueId]?.country ?? "English";
      const spawned = generatePlayer(rng, {
        position,
        ageRange: [24, 30],
        abilityRange: [Math.max(15, ability - 5), ability + 5],
        nationality,
        clubId: "",
        currentSeason: state.currentSeason,
        clubReputation: target.club.reputation,
        idNamespace: `emg_${target.club.id}`,
      });
      spawned.clubId = "";
      spawned.contractClubId = undefined;
      spawned.contractExpiry = 0;
      const wage = Math.max(
        MIN_WAGE,
        calculatePlayerWeeklyWage(spawned.currentAbility, target.club.reputation),
      );
      spawned.wage = wage;
      spawnedPlayers.push(spawned);
      claimedAgentIds.add(spawned.id);
      npcSignedPlayerIds.push({
        playerId: spawned.id,
        clubId: target.club.id,
        wage,
        signingBonus: 0,
        contractLength: spawned.age >= 29 ? 2 : 3,
        relaxWeeklyWageCap: true,
      });
      entry.currentWeeklyCommitment += wage;
      registered += 1;
      if (position === "GK") keepers += 1;
      return true;
    };

    while (keepers === 0) {
      if (claimNext(true)) continue;
      if (!spawnEmergency(true)) break;
    }
    while (registered < COMPETITIVE_REGISTERED_FLOOR) {
      if (claimNext(false)) continue;
      if (!spawnEmergency(false)) break;
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
    spawnedPlayers,
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
): Club | null {
  const candidates = Object.values(affordabilityContext).flatMap((entry) => {
    const club = entry.club;
    // Don't sign back to former club (if still exists)
    if (club.id === agent.releasedFrom) return [];
    const affordability = assessClubAffordabilityFromContext(entry, {
      upfrontCost: agent.signingBonusExpectation,
      weeklyWageCommitment: agent.wageExpectation,
    });
    if (!affordability.affordable) return [];
    // Reputation match: ordinary clubs stay within 25; critically thin squads
    // may look a little further so funded lower-league sides can restock.
    const playerReputation = player.currentAbility / 2;
    const repDiff = Math.abs(club.reputation - playerReputation);
    const registered = countRegisteredAtClub(club, state.players);
    const thinSquad = registered < COMPETITIVE_REGISTERED_FLOOR;
    const repBand = thinSquad ? 40 : 25;
    if (repDiff > repBand || club.playerIds.length >= 30) return [];
    const weight = scoreFreeAgentClubInterest(player, club, state, agent);
    if (weight < (thinSquad ? 0.05 : 0.25)) return [];
    return [{
      item: club,
      weight,
    }];
  });

  if (candidates.length === 0) return null;
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
  const coverage = positionCoverage({ ...player, id: "__candidate__" }, club, state);
  const squadNeed = coverage === 0 ? 2.35
    : coverage <= 1.35 ? 1.65
      : coverage <= 2.35 ? 0.95
        : 0.35;
  const registered = countRegisteredAtClub(club, state.players);
  const shortage = Math.max(0, COMPETITIVE_REGISTERED_FLOOR - registered);
  // Funded thin squads must out-compete healthy clubs for ordinary free agents.
  const depthUrgency = shortage === 0 ? 1
    : shortage <= 2 ? 2.4
      : shortage <= 5 ? 4.2
        : 6.5;
  const keepers = countRegisteredKeepers(club, state.players);
  const keeperUrgency = player.position === "GK" && keepers === 0 ? 3.2 : 1;
  const doctrine = deriveClubRecruitmentDoctrine({
    club,
    seed: state.seed,
    season: state.currentSeason,
    manager: state.managerProfiles[club.id],
    runManifest: state.runManifest,
  });
  const ageFit = 0.65 + scoreDoctrineAgeFit(player.age, doctrine) / 100 * 0.7;
  const targetReputation = player.currentAbility / 2;
  const reputationFit = Math.max(0.35, 1 - Math.abs(club.reputation - targetReputation) / 35);
  const geographyFit = geographyFitMultiplier(club, doctrine, state, agent);
  const manager = state.managerProfiles[club.id];
  const managerFit = !manager ? 1
    : tacticalPositions(manager.preferredFormation).has(player.position) ? 1.12
      : 0.6;
  return Math.max(
    0.01,
    squadNeed * depthUrgency * keeperUrgency * ageFit * reputationFit * geographyFit * managerFit,
  );
}
