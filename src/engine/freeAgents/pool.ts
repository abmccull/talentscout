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

/** Add a free agent to the pool. */
export function addFreeAgent(pool: FreeAgentPool, agent: FreeAgent): FreeAgentPool {
  return {
    ...pool,
    agents: [...pool.agents, agent],
    totalReleasedThisSeason: pool.totalReleasedThisSeason + 1,
  };
}

/** Remove a free agent from the pool by playerId. */
export function removeFreeAgent(pool: FreeAgentPool, playerId: string): FreeAgentPool {
  return {
    ...pool,
    agents: pool.agents.filter((a) => a.playerId !== playerId),
  };
}

export interface PoolTickResult {
  /** Updated pool after weekly processing. */
  updatedPool: FreeAgentPool;
  /** Player IDs of free agents signed by NPC clubs this week. */
  npcSignedPlayerIds: { playerId: string; clubId: string }[];
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
): PoolTickResult {
  const pool = state.freeAgentPool;
  const npcSignedPlayerIds: { playerId: string; clubId: string }[] = [];
  const removedPlayerIds: string[] = [];
  const messages: InboxMessage[] = [];
  const midSeasonReleases: FreeAgent[] = [];

  // Determine if pool is overflowing (accelerate NPC signings)
  const overflowMultiplier = pool.agents.length > POOL_OVERFLOW_THRESHOLD ? 2.0 : 1.0;

  const updatedAgents: FreeAgent[] = [];

  for (const agent of pool.agents) {
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
      const offerChance = (NPC_OFFER_BASE_CHANCE + caBonus + urgencyBonus) * overflowMultiplier;

      if (rng.chance(offerChance) && updated.npcInterest.length < 3) {
        const npcClub = findInterestedNPCClub(player, state.clubs, rng);
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
    let signed = false;
    for (const interest of updated.npcInterest) {
      if (interest.accepted) {
        newInterest.push(interest);
        continue;
      }
      // Check if NPC offer gets accepted this week
      if (rng.chance(NPC_ACCEPTANCE_CHANCE * overflowMultiplier)) {
        npcSignedPlayerIds.push({ playerId: agent.playerId, clubId: interest.clubId });
        updated.status = "signed";
        signed = true;

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

    if (!signed) {
      updatedAgents.push(updated);
    } else {
      updatedAgents.push(updated);
    }
  }

  // 6. Mid-season trickle — random releases from clubs
  for (const player of Object.values(state.players)) {
    if (!player.clubId) continue;
    if (player.currentAbility > MID_SEASON_RELEASE_CA_CEILING) continue;
    if (player.age < 25) continue; // Young players don't get terminated mid-season
    if (!rng.chance(MID_SEASON_RELEASE_CHANCE)) continue;

    const club = state.clubs[player.clubId];
    if (!club) continue;

    // Don't release if already in pool
    if (updatedAgents.some((a) => a.playerId === player.id)) continue;

    const maxWeeks = player.currentAbility >= 45 ? 16 : 20;
    const baseWage = Math.round(player.currentAbility * 80);
    const ageFactor = player.age > 30 ? 0.8 : 0.9;

    midSeasonReleases.push({
      playerId: player.id,
      country: player.nationality,
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

/**
 * Get free agents visible to the scout based on regional familiarity.
 *
 * Visibility thresholds:
 *   0        → invisible
 *   1-19     → rumor only (no name/stats)
 *   20-39    → basic (name, age, position, former club)
 *   40-59    → standard (full profile with accuracy penalties)
 *   60-79    → good (reduced accuracy penalty)
 *   80-100   → expert (no accuracy penalty, proactive recommendations)
 */
export function getVisibleFreeAgents(
  pool: FreeAgentPool,
  countryFamiliarity: Record<string, number>,
): FreeAgent[] {
  return pool.agents.filter((agent) => {
    if (agent.status !== "available") return false;

    // Discovered by scout — always visible regardless of familiarity
    if (agent.discoveredByScout) return true;

    // Check familiarity with agent's country
    const familiarity = countryFamiliarity[agent.country] ?? 0;
    return familiarity >= 20; // Basic visibility threshold
  });
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
  clubs: Record<string, Club>,
  rng: RNG,
): Club | null {
  const candidates = Object.values(clubs).filter((club) => {
    // Don't sign back to former club (if still exists)
    if (club.id === player.clubId) return false;
    // Must have budget for the wage
    if (club.budget < player.currentAbility * 80 * 12) return false;
    // Reputation match: within 30 points
    const repDiff = Math.abs(club.reputation - player.currentAbility);
    return repDiff <= 30;
  });

  if (candidates.length === 0) return null;
  return rng.pick(candidates);
}
