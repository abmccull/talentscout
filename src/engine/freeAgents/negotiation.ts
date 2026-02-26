/**
 * Free Agent Negotiation — direct player/agent negotiation for unattached
 * players. Simpler than club-to-club transfers (no selling club, no fee).
 *
 * Pattern adapted from:
 *  - src/engine/firstTeam/negotiation.ts (state machine, rounds, counters)
 *  - src/engine/youth/placement.ts (conviction-based club acceptance)
 *
 * Pure functions: no side effects, no mutation.
 * All randomness flows through the RNG instance.
 */

import type { RNG } from "@/engine/rng";
import type {
  FreeAgent,
  FreeAgentNegotiation,
  FreeAgentPool,
  Player,
  Club,
  Scout,
  Observation,
  ConvictionLevel,
  InboxMessage,
} from "@/engine/core/types";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Maximum negotiation rounds before auto-rejection. */
const MAX_ROUNDS = 3;

/** Deadline: negotiations expire this many weeks after start. */
const NEGOTIATION_DEADLINE_WEEKS = 3;

/** Wage tolerance: player accepts if offer is within this % of expectation. */
const WAGE_ACCEPTANCE_TOLERANCE = 0.85;

/** How much the player concedes per round (fraction of gap). */
const COUNTER_CONCESSION_RATE = 0.30;

/** Contract length preferences by age bracket. */
const PREFERRED_CONTRACT_LENGTH: Record<string, number> = {
  young: 3,    // < 26
  prime: 2,    // 26-30
  veteran: 1,  // > 30
};

// =============================================================================
// CONVICTION SYSTEM (mirrors youth placement)
// =============================================================================

/**
 * Derive conviction level from observation count and average confidence.
 * Same thresholds as youth placement for consistency.
 */
function deriveConviction(
  observations: Observation[],
  playerId: string,
): ConvictionLevel {
  const playerObs = observations.filter((o) => o.playerId === playerId);
  const count = playerObs.length;
  if (count === 0) return "note";

  const avgConfidence =
    playerObs.flatMap((o) => o.attributeReadings).reduce((s, r) => s + r.confidence, 0) /
    Math.max(1, playerObs.flatMap((o) => o.attributeReadings).length);

  if (count >= 6 && avgConfidence > 0.6) return "tablePound";
  if (count >= 4 && avgConfidence > 0.5) return "strongRecommend";
  if (count >= 2) return "recommend";
  return "note";
}

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

/**
 * Start a free agent negotiation.
 *
 * The scout's club offers a wage, bonus, and contract length.
 * The player/agent evaluates and either accepts, counters, or rejects.
 */
export function initiateFreeAgentNegotiation(
  agent: FreeAgent,
  player: Player,
  offeredWage: number,
  offeredBonus: number,
  offeredContractLength: number,
  currentWeek: number,
  rng: RNG,
): FreeAgentNegotiation {
  const negotiation: FreeAgentNegotiation = {
    freeAgentId: agent.playerId,
    offeredWage,
    offeredBonus,
    offeredContractLength,
    round: 1,
    status: "pending",
    deadline: currentWeek + NEGOTIATION_DEADLINE_WEEKS,
  };

  // Evaluate initial offer
  return evaluateOffer(negotiation, agent, player, rng);
}

/**
 * Submit a revised offer in an ongoing negotiation.
 */
export function advanceFreeAgentNegotiation(
  negotiation: FreeAgentNegotiation,
  agent: FreeAgent,
  player: Player,
  newWage: number,
  newBonus: number,
  newContractLength: number,
  rng: RNG,
): FreeAgentNegotiation {
  if (negotiation.status !== "countered") return negotiation;
  if (negotiation.round >= MAX_ROUNDS) {
    return { ...negotiation, status: "rejected" };
  }

  const updated: FreeAgentNegotiation = {
    ...negotiation,
    offeredWage: newWage,
    offeredBonus: newBonus,
    offeredContractLength: newContractLength,
    round: negotiation.round + 1,
  };

  return evaluateOffer(updated, agent, player, rng);
}

/**
 * Calculate probability the scout's club accepts the free agent recommendation.
 *
 * Mirrors calculateClubAcceptanceChance from youth placement:
 *  - Base chance by conviction level
 *  - Scout reputation modifier
 *  - Club reputation vs player CA match
 *  - Squad need at position
 */
export function calculateFreeAgentAcceptance(
  player: Player,
  club: Club,
  scout: Scout,
  observations: Observation[],
): number {
  const conviction = deriveConviction(observations, player.id);

  const BASE_CHANCE: Record<ConvictionLevel, number> = {
    note: 0.08,
    recommend: 0.35,
    strongRecommend: 0.60,
    tablePound: 0.80,
  };

  let chance = BASE_CHANCE[conviction];

  // Scout reputation modifier: [0.5, 1.0]
  chance *= 0.5 + scout.reputation / 200;

  // Club selectivity: top clubs are pickier about free agents
  if (club.reputation > 75) {
    chance *= 0.6;
  } else if (club.reputation < 30) {
    chance *= 1.3;
  }

  // Player CA vs club reputation alignment
  const caClubMatch = 1 - Math.abs(player.currentAbility - club.reputation) / 100;
  chance *= Math.max(0.5, caClubMatch);

  // First-team scout bonus
  if (scout.primarySpecialization === "firstTeam") {
    chance *= 1.10;
  }

  return Math.min(0.95, Math.max(0.05, chance));
}

/**
 * Process a successful free agent signing — update player and club data.
 */
export function processFreeAgentSigning(
  player: Player,
  clubId: string,
  wage: number,
  contractLength: number,
  currentSeason: number,
): Player {
  return {
    ...player,
    clubId,
    wage,
    contractExpiry: currentSeason + contractLength,
  };
}

/**
 * Generate inbox messages for negotiation outcomes.
 */
export function generateNegotiationMessage(
  negotiation: FreeAgentNegotiation,
  player: Player,
  club: Club,
  rng: RNG,
  week: number,
  season: number,
): InboxMessage {
  if (negotiation.status === "accepted") {
    return {
      id: makeMessageId("fa_signed", rng),
      week,
      season,
      type: "event",
      title: `${player.firstName} ${player.lastName} Signs!`,
      body: `${player.firstName} ${player.lastName} has agreed terms and signed a ${negotiation.offeredContractLength}-season contract with ${club.name} on ${negotiation.offeredWage}/week.`,
      read: false,
      actionRequired: false,
    };
  }

  if (negotiation.status === "rejected") {
    return {
      id: makeMessageId("fa_rejected", rng),
      week,
      season,
      type: "event",
      title: `${player.firstName} ${player.lastName} Rejects Offer`,
      body: `${player.firstName} ${player.lastName} has rejected the offer from ${club.name}. The negotiation has broken down.`,
      read: false,
      actionRequired: false,
    };
  }

  // Countered
  return {
    id: makeMessageId("fa_counter", rng),
    week,
    season,
    type: "event",
    title: `${player.firstName} ${player.lastName} — Counter Offer`,
    body: `${player.firstName} ${player.lastName} has countered with a demand of ${negotiation.counterWage}/week and ${negotiation.counterBonus} signing bonus. You have until week ${negotiation.deadline} to respond.`,
    read: false,
    actionRequired: true,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Evaluate a wage/bonus offer against the free agent's expectations.
 */
function evaluateOffer(
  negotiation: FreeAgentNegotiation,
  agent: FreeAgent,
  player: Player,
  rng: RNG,
): FreeAgentNegotiation {
  const wageRatio = negotiation.offeredWage / Math.max(1, agent.wageExpectation);
  const bonusRatio = negotiation.offeredBonus / Math.max(1, agent.signingBonusExpectation);

  // Combined satisfaction (wage matters more than bonus)
  const satisfaction = wageRatio * 0.7 + bonusRatio * 0.3;

  // Contract length preference
  const ageBracket = player.age < 26 ? "young" : player.age <= 30 ? "prime" : "veteran";
  const preferredLength = PREFERRED_CONTRACT_LENGTH[ageBracket];
  const lengthBonus = negotiation.offeredContractLength >= preferredLength ? 0.05 : -0.05;

  // Weeks-in-pool desperation: longer in pool → more willing to accept
  const desperationBonus = Math.min(0.15, agent.weeksInPool * 0.01);

  const acceptanceThreshold = WAGE_ACCEPTANCE_TOLERANCE - lengthBonus - desperationBonus;

  if (satisfaction >= acceptanceThreshold) {
    return { ...negotiation, status: "accepted" };
  }

  // Check if offer is too far off (instant rejection)
  if (satisfaction < 0.50 || negotiation.round >= MAX_ROUNDS) {
    return { ...negotiation, status: "rejected" };
  }

  // Counter offer: split the difference
  const wageGap = agent.wageExpectation - negotiation.offeredWage;
  const bonusGap = agent.signingBonusExpectation - negotiation.offeredBonus;
  const concession = COUNTER_CONCESSION_RATE * negotiation.round;

  const counterWage = Math.round(
    agent.wageExpectation - wageGap * concession + rng.nextInt(-50, 50),
  );
  const counterBonus = Math.round(
    agent.signingBonusExpectation - bonusGap * concession + rng.nextInt(-100, 100),
  );

  return {
    ...negotiation,
    status: "countered",
    counterWage: Math.max(MIN_COUNTER_WAGE, counterWage),
    counterBonus: Math.max(0, counterBonus),
  };
}

const MIN_COUNTER_WAGE = 200;
