/**
 * Transfer Negotiation Engine (F4)
 *
 * Multi-round negotiation system for player transfers featuring:
 *  - Club personalities affecting negotiation behavior
 *  - Counter-offer generation with add-on clauses
 *  - Rival bid mechanics (5-15% chance per round)
 *  - Agent involvement and wage demands
 *  - Personality-driven transfer willingness (via F9)
 *
 * All functions are pure — no side effects, no React imports, no mutation.
 * All randomness flows through the RNG instance.
 */

import type { RNG } from "@/engine/rng";
import type {
  GameState,
  Player,
  Club,
  TransferNegotiation,
  NegotiationRound,
  TransferAddOn,
  RivalBid,
  ClubNegotiationPersonality,
  InboxMessage,
} from "@/engine/core/types";
import { evaluateTransferWillingness } from "@/engine/players/personalityEffects";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Minimum number of negotiation rounds. */
const MIN_ROUNDS = 2;
/** Maximum number of negotiation rounds. */
const MAX_ROUNDS = 4;

/** Deadline window: negotiations expire this many weeks after start. */
const NEGOTIATION_DEADLINE_WEEKS = 4;

/** Chance per round that a rival bid appears (5-15%). */
const RIVAL_BID_CHANCE_MIN = 0.05;
const RIVAL_BID_CHANCE_MAX = 0.15;

/** Chance that an agent is involved in a negotiation. */
const AGENT_INVOLVEMENT_CHANCE = 0.6;

/** Price multipliers by club personality. */
const PERSONALITY_PRICE_MULTIPLIERS: Record<ClubNegotiationPersonality, number> = {
  hardball: 1.20,
  reasonable: 1.00,
  desperate: 0.85,
  prestige: 1.10,
};

/** Number of max rounds by personality (base; jittered by RNG). */
const PERSONALITY_PATIENCE: Record<ClubNegotiationPersonality, number> = {
  hardball: 2,
  reasonable: 3,
  desperate: 4,
  prestige: 3,
};

/** How much the counter-offer drops per round (fraction of gap). */
const COUNTER_OFFER_CONCESSION: Record<ClubNegotiationPersonality, number> = {
  hardball: 0.10,
  reasonable: 0.25,
  desperate: 0.40,
  prestige: 0.20,
};

/** How willing each personality is to accept add-ons (0-1). */
const ADDON_ACCEPTANCE: Record<ClubNegotiationPersonality, number> = {
  hardball: 0.2,
  reasonable: 0.6,
  desperate: 0.9,
  prestige: 0.5,
};

// =============================================================================
// ID GENERATION
// =============================================================================

function generateId(prefix: string, rng: RNG): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 12; i++) {
    id += chars[rng.nextInt(0, chars.length - 1)];
  }
  return `${prefix}_${id}`;
}

// =============================================================================
// CLUB PERSONALITY DETERMINATION
// =============================================================================

/**
 * Determine a selling club's negotiation personality based on their
 * situation: reputation, budget pressure, and the player's importance.
 *
 * @param rng     Seeded RNG instance.
 * @param club    The selling club.
 * @param player  The player being sold.
 * @returns       A negotiation personality type.
 */
export function determineClubPersonality(
  rng: RNG,
  club: Club,
  player: Player,
): ClubNegotiationPersonality {
  // High-reputation clubs negotiate from a position of strength
  if (club.reputation >= 75) {
    return rng.chance(0.6) ? "prestige" : "hardball";
  }

  // Low budget clubs may be desperate to sell
  const playerValueRatio = player.marketValue / Math.max(club.budget, 1);
  if (playerValueRatio < 0.3 && club.budget < 5_000_000) {
    return rng.chance(0.5) ? "desperate" : "reasonable";
  }

  // Star players at mid-tier clubs → hardball
  if (player.currentAbility > 140) {
    return rng.chance(0.4) ? "hardball" : "reasonable";
  }

  // Default: weighted random selection
  const weights: Array<{ item: ClubNegotiationPersonality; weight: number }> = [
    { item: "hardball", weight: 20 },
    { item: "reasonable", weight: 45 },
    { item: "desperate", weight: 15 },
    { item: "prestige", weight: 20 },
  ];
  return rng.pickWeighted(weights);
}

// =============================================================================
// AGENT DEMANDS
// =============================================================================

/**
 * Generate agent demands for a transfer negotiation.
 * Agent demands scale with the player's current ability and market value.
 *
 * @param rng    Seeded RNG instance.
 * @param player The player being transferred.
 * @returns      Agent demands (wage premium percentage and signing bonus).
 */
export function processAgentDemands(
  rng: RNG,
  player: Player,
): { wagePremium: number; signingBonus: number } {
  // Wage premium: 10-50% above current wage, scaling with ability
  const abilityFactor = Math.min(player.currentAbility / 200, 1);
  const basePremium = 0.10 + abilityFactor * 0.40;
  const wagePremium = Math.round((basePremium + rng.nextFloat(-0.05, 0.05)) * 100) / 100;

  // Signing bonus: 5-20% of market value
  const bonusPercent = 0.05 + abilityFactor * 0.15 + rng.nextFloat(-0.02, 0.02);
  const signingBonus = Math.round(player.marketValue * Math.max(0, bonusPercent));

  return {
    wagePremium: Math.max(0.05, wagePremium),
    signingBonus: Math.max(0, signingBonus),
  };
}

// =============================================================================
// INITIATE NEGOTIATION
// =============================================================================

/**
 * Create a new transfer negotiation for a player.
 *
 * @param rng       Seeded RNG instance.
 * @param state     Current game state (read-only).
 * @param playerId  The player to negotiate for.
 * @param toClubId  The buying club (the scout's club).
 * @returns         A new TransferNegotiation, or null if conditions are not met.
 */
export function initiateNegotiation(
  rng: RNG,
  state: GameState,
  playerId: string,
  toClubId: string,
): TransferNegotiation | null {
  const player = state.players[playerId];
  if (!player) return null;

  const fromClub = state.clubs[player.clubId];
  const toClub = state.clubs[toClubId];
  if (!fromClub || !toClub) return null;

  // Cannot negotiate with own club
  if (player.clubId === toClubId) return null;

  // Check if there's already an active negotiation for this player
  const existing = (state.activeNegotiations ?? []).find(
    (n) => n.playerId === playerId && n.phase !== "completed" && n.phase !== "collapsed",
  );
  if (existing) return null;

  // Determine the selling club's personality
  const clubPersonality = determineClubPersonality(rng, fromClub, player);

  // Calculate asking price based on personality
  const priceMultiplier = PERSONALITY_PRICE_MULTIPLIERS[clubPersonality];
  const initialAskingPrice = Math.round(player.marketValue * priceMultiplier);

  // Determine max rounds (personality base + jitter)
  const basePatience = PERSONALITY_PATIENCE[clubPersonality];
  const maxRounds = Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, basePatience + rng.nextInt(-1, 1)));

  // Agent involvement
  const agentInvolved = rng.chance(AGENT_INVOLVEMENT_CHANCE);
  const agentDemands = agentInvolved ? processAgentDemands(rng, player) : undefined;

  const deadline = state.currentWeek + NEGOTIATION_DEADLINE_WEEKS;

  return {
    id: generateId("neg", rng),
    playerId,
    fromClubId: player.clubId,
    toClubId,
    phase: "initial",
    rounds: [],
    maxRounds,
    rivalBids: [],
    deadline,
    clubPersonality,
    agentInvolved,
    agentDemands,
    initialAskingPrice,
    season: state.currentSeason,
    startWeek: state.currentWeek,
  };
}

// =============================================================================
// COUNTER-OFFER GENERATION
// =============================================================================

/**
 * Generate a counter-offer from the selling club based on their personality,
 * the current offer, and how many rounds have elapsed.
 *
 * @param rng             Seeded RNG instance.
 * @param negotiation     The active negotiation.
 * @param offerAmount     The buying club's latest offer.
 * @returns               The counter-offer amount (new asking price).
 */
export function generateCounterOffer(
  rng: RNG,
  negotiation: TransferNegotiation,
  offerAmount: number,
): number {
  const currentAsking = negotiation.rounds.length > 0
    ? negotiation.rounds[negotiation.rounds.length - 1].askingAmount
    : negotiation.initialAskingPrice;

  // The gap between asking and offer
  const gap = currentAsking - offerAmount;
  if (gap <= 0) return currentAsking; // Already at or below asking

  // Concession factor based on personality
  const concessionRate = COUNTER_OFFER_CONCESSION[negotiation.clubPersonality];

  // Each round concedes a fraction of the gap, with diminishing returns
  const roundFactor = 1 + (negotiation.rounds.length * 0.1);
  const concession = Math.round(gap * concessionRate * roundFactor);

  // Add slight randomness
  const jitter = rng.nextInt(-Math.round(gap * 0.05), Math.round(gap * 0.05));

  const newAsking = Math.max(offerAmount, currentAsking - concession + jitter);

  // Rival bids push the asking price up
  if (negotiation.rivalBids.length > 0) {
    const highestRival = Math.max(...negotiation.rivalBids.map((b) => b.amount));
    // Asking price won't drop below the highest rival bid
    return Math.max(newAsking, highestRival);
  }

  return newAsking;
}

// =============================================================================
// ADD-ON VALUE CALCULATION
// =============================================================================

/**
 * Calculate the effective value of add-on clauses.
 * Selling clubs discount add-ons relative to their personality.
 *
 * @param addOns          The add-on clauses proposed.
 * @param personality     The selling club's personality.
 * @returns               The effective value of add-ons (discounted from face value).
 */
function calculateAddOnValue(
  addOns: TransferAddOn[],
  personality: ClubNegotiationPersonality,
): number {
  if (addOns.length === 0) return 0;

  const acceptanceRate = ADDON_ACCEPTANCE[personality];
  let total = 0;

  for (const addOn of addOns) {
    // Different add-on types have different perceived values
    let discount: number;
    switch (addOn.type) {
      case "appearanceBonus":
        discount = 0.6; // Likely to trigger
        break;
      case "performanceBonus":
        discount = 0.4; // Less certain
        break;
      case "sellOnClause":
        discount = 0.3; // Speculative
        break;
      case "relegationClause":
        discount = 0.2; // Unlikely
        break;
    }
    total += addOn.value * discount * acceptanceRate;
  }

  return Math.round(total);
}

// =============================================================================
// SUBMIT OFFER
// =============================================================================

/**
 * Submit an offer in an active negotiation.
 *
 * The selling club evaluates the offer against their asking price, accounting
 * for add-ons and their personality. Possible outcomes:
 *  - Accepted: offer meets or exceeds adjusted asking price
 *  - Countered: offer is below asking but within negotiation range
 *  - Rejected: offer is insultingly low or max rounds exceeded
 *
 * @param rng            Seeded RNG instance.
 * @param negotiation    The current negotiation state.
 * @param offerAmount    The buying club's offer amount.
 * @param addOns         Optional add-on clauses.
 * @param state          Current game state (for context).
 * @returns              Updated negotiation with the new round appended.
 */
export function submitOffer(
  rng: RNG,
  negotiation: TransferNegotiation,
  offerAmount: number,
  addOns: TransferAddOn[] | undefined,
  state: GameState,
): TransferNegotiation {
  const currentAsking = negotiation.rounds.length > 0
    ? negotiation.rounds[negotiation.rounds.length - 1].askingAmount
    : negotiation.initialAskingPrice;

  // Calculate effective offer including add-on value
  const addOnValue = addOns ? calculateAddOnValue(addOns, negotiation.clubPersonality) : 0;
  const effectiveOffer = offerAmount + addOnValue;

  // Determine response
  let response: NegotiationRound["response"];
  let newAsking = currentAsking;

  // Acceptance threshold: within 5% of asking price
  const acceptanceThreshold = currentAsking * 0.95;

  if (effectiveOffer >= acceptanceThreshold) {
    response = "accepted";
  } else if (negotiation.rounds.length >= negotiation.maxRounds - 1) {
    // Last round: if offer is within 15%, still a chance to accept
    const lastChanceThreshold = currentAsking * 0.85;
    if (effectiveOffer >= lastChanceThreshold && rng.chance(0.4)) {
      response = "accepted";
    } else {
      response = "rejected";
    }
  } else {
    // Insultingly low offer (< 50% of asking) → reject immediately
    if (effectiveOffer < currentAsking * 0.50) {
      response = "rejected";
    } else {
      response = "countered";
      newAsking = generateCounterOffer(rng, negotiation, offerAmount);
    }
  }

  const newRound: NegotiationRound = {
    roundNumber: negotiation.rounds.length + 1,
    offerAmount,
    askingAmount: response === "countered" ? newAsking : currentAsking,
    addOns,
    response,
    week: state.currentWeek,
  };

  // Determine new phase
  let newPhase = negotiation.phase;
  if (response === "accepted") {
    newPhase = "completed";
  } else if (response === "rejected") {
    newPhase = "collapsed";
  } else if (negotiation.rounds.length >= negotiation.maxRounds - 2) {
    newPhase = "finalOffer";
  } else {
    newPhase = "counterOffer";
  }

  return {
    ...negotiation,
    phase: newPhase,
    rounds: [...negotiation.rounds, newRound],
  };
}

// =============================================================================
// RIVAL BIDS
// =============================================================================

/**
 * Check for rival bids on a player under negotiation.
 * 5-15% chance per check, with higher chance for desirable players.
 *
 * @param rng            Seeded RNG instance.
 * @param state          Current game state.
 * @param negotiation    The active negotiation.
 * @returns              Updated negotiation with any new rival bid, plus inbox message.
 */
export function checkRivalBids(
  rng: RNG,
  state: GameState,
  negotiation: TransferNegotiation,
): { negotiation: TransferNegotiation; message?: InboxMessage } {
  // Only check if negotiation is still active
  if (negotiation.phase === "completed" || negotiation.phase === "collapsed") {
    return { negotiation };
  }

  // Calculate rival bid chance based on player desirability
  const player = state.players[negotiation.playerId];
  if (!player) return { negotiation };

  const desirabilityBonus = Math.min(player.currentAbility / 200, 1) * 0.05;
  const rivalChance = RIVAL_BID_CHANCE_MIN + desirabilityBonus +
    rng.nextFloat(0, RIVAL_BID_CHANCE_MAX - RIVAL_BID_CHANCE_MIN);

  if (!rng.chance(rivalChance)) {
    return { negotiation };
  }

  // Find a viable rival club
  const eligibleClubs = Object.values(state.clubs).filter((c) => {
    if (c.id === negotiation.toClubId) return false;
    if (c.id === negotiation.fromClubId) return false;
    if (c.budget < player.marketValue * 0.7) return false;
    // Reputation should be within a reasonable range
    const repDiff = Math.abs(c.reputation - (player.currentAbility / 2));
    return repDiff < 30;
  });

  if (eligibleClubs.length === 0) {
    return { negotiation };
  }

  const rivalClub = rng.pick(eligibleClubs);

  // Rival offers between 90-110% of market value
  const rivalAmount = Math.round(player.marketValue * rng.nextFloat(0.90, 1.10));

  const rivalBid: RivalBid = {
    clubId: rivalClub.id,
    amount: rivalAmount,
    week: state.currentWeek,
    scoutName: `${rivalClub.shortName} Scout`,
  };

  const message: InboxMessage = {
    id: generateId("msg_rival", rng),
    week: state.currentWeek,
    season: state.currentSeason,
    type: "transferUpdate",
    title: `Rival Bid: ${rivalClub.name} interested in ${player.firstName} ${player.lastName}`,
    body: `${rivalClub.name} have submitted a rival bid of ${formatCurrency(rivalAmount)} for ${player.firstName} ${player.lastName}. This may affect your negotiation — consider adjusting your offer.`,
    read: false,
    actionRequired: true,
    relatedId: negotiation.id,
    relatedEntityType: "transfer",
  };

  return {
    negotiation: {
      ...negotiation,
      rivalBids: [...negotiation.rivalBids, rivalBid],
    },
    message,
  };
}

// =============================================================================
// EVALUATE NEGOTIATION OUTCOME
// =============================================================================

/**
 * Evaluate whether a completed negotiation should result in a successful
 * transfer, considering the player's willingness to move.
 *
 * Called after the selling club has accepted the fee. The player may still
 * reject the move based on personality (F9 integration).
 *
 * @param negotiation    The completed negotiation.
 * @param player         The player being transferred.
 * @param fromClub       The selling club.
 * @param toClub         The buying club.
 * @returns              Whether the player accepts the move, and a reason.
 */
export function evaluateNegotiationOutcome(
  negotiation: TransferNegotiation,
  player: Player,
  fromClub: Club,
  toClub: Club,
): { accepted: boolean; reason: string } {
  // Use the personality system to evaluate willingness
  const willingness = evaluateTransferWillingness(
    player.personalityProfile,
    fromClub.reputation,
    toClub.reputation,
    player.age,
  );

  // Agent involvement increases the chance of acceptance (agents push deals through)
  const agentBonus = negotiation.agentInvolved ? 0.15 : 0;
  const finalWillingness = Math.min(1, willingness + agentBonus);

  // Willingness > 0.4 = accepts, with some determinism
  if (finalWillingness >= 0.6) {
    return {
      accepted: true,
      reason: `${player.firstName} ${player.lastName} is excited about the move to ${toClub.name}.`,
    };
  } else if (finalWillingness >= 0.4) {
    return {
      accepted: true,
      reason: `${player.firstName} ${player.lastName} has agreed to the move after some consideration.`,
    };
  } else if (finalWillingness >= 0.25) {
    return {
      accepted: false,
      reason: `${player.firstName} ${player.lastName} is reluctant to leave ${fromClub.name} and has rejected the personal terms.`,
    };
  } else {
    return {
      accepted: false,
      reason: `${player.firstName} ${player.lastName} has no interest in leaving ${fromClub.name}. The player refused to discuss personal terms.`,
    };
  }
}

// =============================================================================
// PROCESS ACTIVE NEGOTIATIONS (WEEKLY TICK)
// =============================================================================

/**
 * Process all active negotiations during the weekly tick.
 * Handles: deadline expiry, rival bid checks, and phase progression.
 *
 * @param state  Current game state (read-only).
 * @param rng    Seeded RNG instance.
 * @returns      Updated negotiations array and any new inbox messages.
 */
export function processActiveNegotiations(
  state: GameState,
  rng: RNG,
): { negotiations: TransferNegotiation[]; messages: InboxMessage[] } {
  const negotiations = state.activeNegotiations ?? [];
  if (negotiations.length === 0) {
    return { negotiations: [], messages: [] };
  }

  const messages: InboxMessage[] = [];
  const updatedNegotiations: TransferNegotiation[] = [];

  for (const neg of negotiations) {
    // Skip already completed/collapsed negotiations (keep them for history)
    if (neg.phase === "completed" || neg.phase === "collapsed") {
      updatedNegotiations.push(neg);
      continue;
    }

    // Check deadline expiry
    if (state.currentWeek >= neg.deadline) {
      const player = state.players[neg.playerId];
      const playerName = player
        ? `${player.firstName} ${player.lastName}`
        : "the player";

      updatedNegotiations.push({
        ...neg,
        phase: "collapsed",
      });

      messages.push({
        id: generateId("msg_negexp", rng),
        week: state.currentWeek,
        season: state.currentSeason,
        type: "transferUpdate",
        title: `Negotiation Expired: ${playerName}`,
        body: `The transfer negotiation for ${playerName} has expired. The selling club has withdrawn from discussions.`,
        read: false,
        actionRequired: false,
        relatedId: neg.id,
        relatedEntityType: "transfer",
      });
      continue;
    }

    // Check for rival bids
    const rivalResult = checkRivalBids(rng, state, neg);
    if (rivalResult.message) {
      messages.push(rivalResult.message);
    }

    updatedNegotiations.push(rivalResult.negotiation);
  }

  return { negotiations: updatedNegotiations, messages };
}

// =============================================================================
// COMPLETE TRANSFER
// =============================================================================

/**
 * Apply a completed negotiation to the game state, producing updated
 * clubs and players. Does NOT mutate inputs.
 *
 * @param negotiation  The completed negotiation (phase === "completed").
 * @param state        Current game state.
 * @returns            Updated state fragments: players, clubs, and inbox message.
 */
export function applyCompletedTransfer(
  negotiation: TransferNegotiation,
  state: GameState,
): {
  players: Record<string, Player>;
  clubs: Record<string, Club>;
  message: InboxMessage;
  transferFee: number;
} {
  const player = state.players[negotiation.playerId];
  const fromClub = state.clubs[negotiation.fromClubId];
  const toClub = state.clubs[negotiation.toClubId];

  // Determine final fee from the last round
  const lastRound = negotiation.rounds[negotiation.rounds.length - 1];
  const transferFee = lastRound ? lastRound.offerAmount : negotiation.initialAskingPrice;

  // Update player's club
  const updatedPlayer: Player = {
    ...player,
    clubId: negotiation.toClubId,
  };

  // Update club rosters
  const updatedFromClub: Club = fromClub
    ? {
        ...fromClub,
        playerIds: fromClub.playerIds.filter((id) => id !== negotiation.playerId),
        budget: fromClub.budget + transferFee,
      }
    : fromClub;

  const updatedToClub: Club = toClub
    ? {
        ...toClub,
        playerIds: [...toClub.playerIds, negotiation.playerId],
        budget: toClub.budget - transferFee,
      }
    : toClub;

  const playerName = `${player.firstName} ${player.lastName}`;
  const message: InboxMessage = {
    id: `transfer_${negotiation.id}`,
    week: state.currentWeek,
    season: state.currentSeason,
    type: "transferUpdate",
    title: `Transfer Complete: ${playerName}`,
    body: `${playerName} has completed a transfer from ${fromClub?.name ?? "Unknown"} to ${toClub?.name ?? "Unknown"} for ${formatCurrency(transferFee)}.${
      negotiation.agentInvolved && negotiation.agentDemands
        ? ` Agent demands: ${Math.round(negotiation.agentDemands.wagePremium * 100)}% wage premium, ${formatCurrency(negotiation.agentDemands.signingBonus)} signing bonus.`
        : ""
    }`,
    read: false,
    actionRequired: false,
    relatedId: negotiation.playerId,
    relatedEntityType: "player",
  };

  const updatedPlayers = { ...state.players, [negotiation.playerId]: updatedPlayer };
  const updatedClubs = {
    ...state.clubs,
    ...(updatedFromClub ? { [negotiation.fromClubId]: updatedFromClub } : {}),
    ...(updatedToClub ? { [negotiation.toClubId]: updatedToClub } : {}),
  };

  return { players: updatedPlayers, clubs: updatedClubs, message, transferFee };
}

// =============================================================================
// WALK AWAY
// =============================================================================

/**
 * The scout's club walks away from a negotiation.
 * Returns the updated negotiation (collapsed) and a reputation penalty message.
 *
 * @param negotiation  The active negotiation.
 * @param state        Current game state (for messaging context).
 * @param rng          Seeded RNG instance.
 * @returns            Updated negotiation and inbox message.
 */
export function walkAwayFromNegotiation(
  negotiation: TransferNegotiation,
  state: GameState,
  rng: RNG,
): { negotiation: TransferNegotiation; message: InboxMessage; reputationDelta: number } {
  const player = state.players[negotiation.playerId];
  const playerName = player
    ? `${player.firstName} ${player.lastName}`
    : "the player";

  // Reputation penalty depends on how far into negotiations we are
  const roundsCompleted = negotiation.rounds.length;
  const reputationDelta = roundsCompleted >= 2 ? -3 : -1;

  return {
    negotiation: {
      ...negotiation,
      phase: "collapsed",
    },
    message: {
      id: generateId("msg_walkaway", rng),
      week: state.currentWeek,
      season: state.currentSeason,
      type: "transferUpdate",
      title: `Negotiation Ended: ${playerName}`,
      body: `Your club has walked away from negotiations for ${playerName}. ${
        roundsCompleted >= 2
          ? "Walking away after extended negotiations has damaged your reputation."
          : "The selling club has been notified."
      }`,
      read: false,
      actionRequired: false,
      relatedId: negotiation.id,
      relatedEntityType: "transfer",
    },
    reputationDelta,
  };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Determine the recommended initial offer for a negotiation.
 * Helps the UI suggest a reasonable starting point.
 */
export function getRecommendedOffer(negotiation: TransferNegotiation): number {
  // Start at ~80% of asking for reasonable, less for hardball
  const discountMap: Record<ClubNegotiationPersonality, number> = {
    hardball: 0.70,
    reasonable: 0.80,
    desperate: 0.75,
    prestige: 0.85,
  };

  const discount = discountMap[negotiation.clubPersonality];
  return Math.round(negotiation.initialAskingPrice * discount);
}

/**
 * Get a human-readable description of the club's negotiation style.
 */
export function getPersonalityDescription(
  personality: ClubNegotiationPersonality,
): string {
  switch (personality) {
    case "hardball":
      return "This club drives a hard bargain. Expect high demands and limited patience.";
    case "reasonable":
      return "This club is open to fair negotiation. A reasonable offer should lead to productive talks.";
    case "desperate":
      return "This club appears eager to sell. You may be able to negotiate a favorable deal.";
    case "prestige":
      return "This is a prestigious club. They expect top offers but may be swayed by your club's reputation.";
  }
}

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `\u00A3${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `\u00A3${(amount / 1_000).toFixed(0)}K`;
  return `\u00A3${amount}`;
}
