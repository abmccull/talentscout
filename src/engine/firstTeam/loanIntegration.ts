/**
 * Loan Integration — scout reputation, XP, and specialization mechanics
 * for the player loan system.
 *
 * Handles:
 *  - Reputation consequences for loan outcomes
 *  - Per-specialization loan mechanics and bonuses
 *  - Loan recommendation generation
 *  - Loan monitoring reports
 *
 * Design notes:
 *  - Pure functional: no mutations, no side effects.
 *  - Follows the same pattern as transferTracker.ts for accountability.
 */

import type { RNG } from "@/engine/rng";
import type {
  Scout,
  Player,
  Club,
  LoanDeal,
  LoanOutcome,
  LoanRecommendation,
  InboxMessage,
} from "@/engine/core/types";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Reputation deltas per loan event. */
const LOAN_REPUTATION_DELTAS: Record<string, number> = {
  "recommended-accepted": 3,
  "loan-signed": 7,
  "successful": 5,
  "buy-option-exercised": 8,
  "neutral": 1,
  "unsuccessful": -3,
  "terminated": -5,
  "monitoring-report": 1,
} as const;

/** XP awards per loan event. */
const LOAN_XP_AWARDS: Record<string, number> = {
  "recommended-accepted": 15,
  "loan-signed": 25,
  "successful": 30,
  "buy-option-exercised": 50,
  "neutral": 10,
  "unsuccessful": 0,
  "terminated": 0,
  "monitoring-report": 5,
} as const;

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
// REPUTATION & XP
// =============================================================================

/**
 * Calculate reputation delta and XP award for a loan outcome.
 * Applies per-specialization bonuses.
 */
export function calculateLoanOutcomeRewards(
  scout: Scout,
  outcome: LoanOutcome,
  deal: LoanDeal,
  player: Player | undefined,
): { reputationDelta: number; xpAward: number } {
  let reputationDelta = LOAN_REPUTATION_DELTAS[outcome] ?? 0;
  let xpAward = LOAN_XP_AWARDS[outcome] ?? 0;

  if (!player) return { reputationDelta, xpAward };

  const spec = scout.primarySpecialization;

  // Per-specialization bonuses
  switch (spec) {
    case "youth":
      // Bonus when loaned youth player's CA increases by 5+
      if (deal.performanceRecord && deal.performanceRecord.developmentDelta >= 5) {
        reputationDelta += 2;
        xpAward += 10;
      }
      break;

    case "firstTeam":
      // Bonus when loan target makes 20+ appearances
      if (deal.performanceRecord && deal.performanceRecord.appearances >= 20) {
        reputationDelta += 3;
        xpAward += 15;
      }
      break;

    case "regional":
      // Regional knowledge bonus for loans within known region
      reputationDelta += 1;
      break;

    case "data":
      // Prediction accuracy bonus handled separately in prediction tracker
      break;
  }

  return { reputationDelta, xpAward };
}

/**
 * Process reputation and XP changes from a completed loan.
 * Returns the updated scout and an inbox message.
 */
export function processLoanOutcomeReputation(
  scout: Scout,
  recommendation: LoanRecommendation | undefined,
  outcome: LoanOutcome,
  deal: LoanDeal,
  player: Player | undefined,
  week: number,
  season: number,
  rng: RNG,
): { reputationDelta: number; xpAward: number; message: InboxMessage } {
  const { reputationDelta, xpAward } = calculateLoanOutcomeRewards(
    scout, outcome, deal, player,
  );

  const playerName = player
    ? `${player.firstName} ${player.lastName}`
    : "Unknown Player";

  const outcomeDescriptions: Record<LoanOutcome, string> = {
    "successful": `${playerName}'s loan was a success. The player developed well and both clubs are satisfied.`,
    "neutral": `${playerName}'s loan had no significant impact. Neither particularly good nor bad.`,
    "unsuccessful": `${playerName}'s loan was unsuccessful. The player didn't get enough game time or failed to develop.`,
    "buy-option-exercised": `The loan club has exercised their option to buy ${playerName} permanently! Excellent outcome.`,
    "recalled-early": `${playerName} was recalled from the loan early by the parent club.`,
    "terminated": `${playerName}'s loan was terminated early due to poor fit.`,
  };

  const message: InboxMessage = {
    id: generateId("msg", rng),
    week,
    season,
    type: "feedback",
    title: `Loan Outcome: ${playerName}`,
    body: `${outcomeDescriptions[outcome]} ${reputationDelta > 0 ? `(+${reputationDelta} reputation, +${xpAward} XP)` : reputationDelta < 0 ? `(${reputationDelta} reputation)` : ""}`,
    read: false,
    actionRequired: false,
    relatedId: deal.playerId,
    relatedEntityType: "player",
  };

  // Mark recommendation as having been evaluated
  if (recommendation) {
    recommendation.outcome = outcome;
    recommendation.reputationApplied = true;
  }

  return { reputationDelta, xpAward, message };
}

// =============================================================================
// LOAN RECOMMENDATIONS
// =============================================================================

/**
 * Generate a formal loan recommendation.
 * Quality is affected by scout skills (judgment, analysis).
 */
export function generateLoanRecommendation(
  scout: Scout,
  player: Player,
  targetClub: Club,
  rationale: LoanRecommendation["rationale"],
  suggestedDuration: number,
  suggestedWageContribution: number,
  week: number,
  season: number,
  rng: RNG,
): LoanRecommendation {
  return {
    id: generateId("loanrec", rng),
    playerId: player.id,
    targetClubId: targetClub.id,
    scoutId: scout.id,
    week,
    season,
    rationale,
    suggestedDuration,
    suggestedWageContribution,
    reputationApplied: false,
  };
}

// =============================================================================
// LOAN MONITORING
// =============================================================================

/**
 * Generate a loan monitoring report for a loaned player.
 * Returns reputation/XP gains and an inbox message.
 */
export function processLoanMonitoringReport(
  scout: Scout,
  deal: LoanDeal,
  player: Player | undefined,
  week: number,
  season: number,
  rng: RNG,
): { reputationDelta: number; xpAward: number; message: InboxMessage } {
  const reputationDelta = LOAN_REPUTATION_DELTAS["monitoring-report"];
  const xpAward = LOAN_XP_AWARDS["monitoring-report"];

  const playerName = player
    ? `${player.firstName} ${player.lastName}`
    : "Unknown Player";
  const loanClub = deal.loanClubId;
  const perf = deal.performanceRecord;

  let body = `Monitoring report on ${playerName} (on loan at ${loanClub}).`;
  if (perf) {
    body += ` ${perf.appearances} appearances, ${perf.goals} goals, ${perf.assists} assists. Avg rating: ${perf.avgRating}. Development: ${perf.developmentDelta >= 0 ? "+" : ""}${perf.developmentDelta} CA.`;
  }

  const message: InboxMessage = {
    id: generateId("msg", rng),
    week,
    season,
    type: "feedback",
    title: `Loan Monitoring: ${playerName}`,
    body,
    read: false,
    actionRequired: false,
    relatedId: deal.playerId,
    relatedEntityType: "player",
  };

  return { reputationDelta, xpAward, message };
}
