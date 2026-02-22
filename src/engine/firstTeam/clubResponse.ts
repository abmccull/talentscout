/**
 * Club response pipeline — how the club reacts to submitted scout reports.
 *
 * The pipeline converts a first-team scout report into a structured club
 * decision (ignored, interested, trial, signed, etc.) with an associated
 * reputation delta and feedback message.
 *
 * Design notes:
 *  - Pure functions: no side effects, no mutation of inputs.
 *  - All randomness flows through the RNG instance.
 *  - Probabilities are weighted by report quality, scout persuasion, and the
 *    conviction level attached to the report.
 */

import type { RNG } from "@/engine/rng";
import type {
  ClubResponse,
  ClubResponseType,
  Club,
  ManagerProfile,
  ManagerDirective,
  Player,
  Scout,
  ScoutReport,
} from "@/engine/core/types";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Reputation change per response type. */
const REPUTATION_DELTAS: Record<ClubResponseType, number> = {
  ignored: -2,
  interested: 3,
  trial: 5,
  doesNotFit: 0,
  tooExpensive: 1,
  signed: 10,
  loanSigned: 7,
} as const;

/**
 * Base probability weights for outcome selection when a directive is matched.
 * Weights are relative (they do not need to sum to 1 before normalisation).
 */
const BASE_WEIGHTS: Record<ClubResponseType, number> = {
  interested: 60,
  trial: 25,
  signed: 10,
  doesNotFit: 5,
  // These outcomes are resolved via pre-checks before the weighted pick:
  ignored: 0,
  tooExpensive: 0,
  loanSigned: 0,
} as const;

// =============================================================================
// HELPERS
// =============================================================================

/** Bound a number within [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute the persuasion bonus to "signed" and "trial" weights from the
 * scout's persuasion attribute (1–20 scale).
 * The modifier is +2% per point above 10 (baseline), so:
 *   persuasion 10 → 0 bonus
 *   persuasion 20 → +20 bonus (percentage points added to the weight)
 */
function persuasionBonus(scout: Scout, outcome: "signed" | "trial"): number {
  const excess = Math.max(0, scout.attributes.persuasion - 10);
  // Distribute: +2 per point excess applies equally to signed and trial
  return excess * 2;
}

/**
 * Adjust the weight map for a conviction level boost.
 * "tablePound" → +20 to signed, +15 to trial.
 * "strongRecommend" → +10 to signed, +8 to trial.
 */
function convictionAdjustments(
  report: ScoutReport,
): { signedBonus: number; trialBonus: number } {
  switch (report.conviction) {
    case "tablePound":
      return { signedBonus: 20, trialBonus: 15 };
    case "strongRecommend":
      return { signedBonus: 10, trialBonus: 8 };
    case "recommend":
      return { signedBonus: 5, trialBonus: 4 };
    default:
      return { signedBonus: 0, trialBonus: 0 };
  }
}

/**
 * Check whether the manager's preferred formation is compatible with the
 * player's position.
 *
 * Parsing logic: "4-3-3" → 4 defenders, 3 midfielders, 3 forwards.
 * Returns true if the player's position is commonly used in that formation
 * shape, or if the formation cannot be parsed (fail-open).
 */
function formationFitsPlayer(formation: string, player: Player): boolean {
  const parts = formation.split("-").map(Number);
  if (parts.length < 3 || parts.some(isNaN)) return true; // unparseable → permissive

  const [def, mid, fwd] = parts;

  // Basic heuristic: classify roles by formation shape
  const defPositions = new Set<string>(["GK", "CB", "LB", "RB"]);
  // Wide defenders used when >4 defenders (e.g. 5-3-2)
  const midPositions = new Set<string>(["CDM", "CM", "CAM"]);
  const fwdPositions = new Set<string>(["LW", "RW", "ST"]);

  const pos = player.position;

  if (defPositions.has(pos)) {
    // Large defensive line accommodates wide defenders too
    return def >= 3;
  }
  if (midPositions.has(pos)) {
    // Formations with narrow midfields (mid <= 2) rarely use true CAM
    if (pos === "CAM" && mid <= 2) return false;
    return mid >= 2;
  }
  if (fwdPositions.has(pos)) {
    if ((pos === "LW" || pos === "RW") && fwd < 3) return false;
    return fwd >= 1;
  }

  return true;
}

/**
 * Generate human-readable feedback text for each response type.
 */
function buildFeedbackText(
  response: ClubResponseType,
  player: Player,
  directive: ManagerDirective | undefined,
  club: Club,
): string {
  const name = `${player.firstName} ${player.lastName}`;
  switch (response) {
    case "signed":
      return `${club.shortName} has agreed a deal to sign ${name}. Excellent recommendation — the manager is delighted.`;
    case "loanSigned":
      return `${club.shortName} has signed ${name} on loan. The manager sees this as a good short-term solution.`;
    case "trial":
      return `${club.shortName} want to see ${name} in a trial match before making a decision. Arrange the session.`;
    case "interested":
      return `${club.shortName} have added ${name} to the shortlist following your report. Stay close to developments.`;
    case "doesNotFit":
      return `The manager feels ${name} does not fit the current tactical system${directive ? ` (${directive.position} profile)` : ""}. No further action planned.`;
    case "tooExpensive":
      return `${name}'s market value exceeds the budget allocated for this position. The club cannot proceed at this time.`;
    case "ignored":
      return `Your report on ${name} did not align with any active manager directive. It has been noted but no action will be taken.`;
  }
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Generate a club response to a submitted scout report.
 *
 * Decision pipeline:
 *  1. No directive match → "ignored" with a small negative rep delta.
 *  2. Player market value > budgetAllocation × 1.5 → "tooExpensive".
 *  3. Formation mismatch with manager's preferred system → "doesNotFit".
 *  4. Otherwise, run a weighted probability pick over the remaining outcomes
 *     (interested / trial / signed / doesNotFit), adjusted for:
 *       - Scout persuasion attribute (+2 per point above 10)
 *       - tablePound conviction (+20 signed, +15 trial)
 *       - strongRecommend conviction (+10 signed, +8 trial)
 *       - Report quality bonus: qualityScore > 70 → +10 to signed weight
 *
 * @param rng       - Seeded PRNG instance.
 * @param report    - The submitted scout report.
 * @param player    - The player being recommended.
 * @param club      - The club receiving the report.
 * @param manager   - The club manager's profile.
 * @param directive - The matching directive (undefined if none matched).
 * @param scout     - The scout who submitted the report.
 */
export function generateClubResponse(
  rng: RNG,
  report: ScoutReport,
  player: Player,
  club: Club,
  manager: ManagerProfile,
  directive: ManagerDirective | undefined,
  scout: Scout,
): ClubResponse {
  const week = report.submittedWeek;
  const season = report.submittedSeason;

  // -------------------------------------------------------------------------
  // 1. No directive match → ignored
  // -------------------------------------------------------------------------
  if (!directive) {
    return {
      reportId: report.id,
      directiveId: undefined,
      response: "ignored",
      feedback: buildFeedbackText("ignored", player, undefined, club),
      reputationDelta: REPUTATION_DELTAS.ignored,
      week,
      season,
    };
  }

  // -------------------------------------------------------------------------
  // 2. Budget ceiling check → tooExpensive
  // -------------------------------------------------------------------------
  const budgetCeiling = directive.budgetAllocation * 1.5;
  if (player.marketValue > budgetCeiling) {
    return {
      reportId: report.id,
      directiveId: directive.id,
      response: "tooExpensive",
      feedback: buildFeedbackText("tooExpensive", player, directive, club),
      reputationDelta: REPUTATION_DELTAS.tooExpensive,
      week,
      season,
    };
  }

  // -------------------------------------------------------------------------
  // 3. Formation / tactical mismatch → doesNotFit
  //    Mismatch check: failed formation parse OR scouting preference conflict.
  //    "dataFirst" managers discount reports without statistical backing —
  //    penalise low qualityScore reports for dataFirst managers.
  // -------------------------------------------------------------------------
  const tacticalMismatch = !formationFitsPlayer(manager.preferredFormation, player);
  const dataPreferenceMismatch =
    manager.preference === "dataFirst" && report.qualityScore < 40;

  if (tacticalMismatch || dataPreferenceMismatch) {
    return {
      reportId: report.id,
      directiveId: directive.id,
      response: "doesNotFit",
      feedback: buildFeedbackText("doesNotFit", player, directive, club),
      reputationDelta: REPUTATION_DELTAS.doesNotFit,
      week,
      season,
    };
  }

  // -------------------------------------------------------------------------
  // 4. Weighted probability pick for remaining outcomes
  // -------------------------------------------------------------------------
  const { signedBonus, trialBonus } = convictionAdjustments(report);

  const weights: Record<ClubResponseType, number> = {
    ...BASE_WEIGHTS,
    signed: clamp(
      BASE_WEIGHTS.signed +
        signedBonus +
        persuasionBonus(scout, "signed") +
        (report.qualityScore > 70 ? 10 : 0),
      0,
      100,
    ),
    trial: clamp(
      BASE_WEIGHTS.trial + trialBonus + persuasionBonus(scout, "trial"),
      0,
      100,
    ),
  };

  // Build only the live outcomes (filter zero-weight items)
  const liveOutcomes: ClubResponseType[] = ["interested", "trial", "signed", "doesNotFit"];
  const weightedItems = liveOutcomes
    .filter((o) => weights[o] > 0)
    .map((o) => ({ item: o, weight: weights[o] }));

  const response: ClubResponseType = rng.pickWeighted(weightedItems);

  return {
    reportId: report.id,
    directiveId: directive.id,
    response,
    feedback: buildFeedbackText(response, player, directive, club),
    reputationDelta: REPUTATION_DELTAS[response],
    week,
    season,
  };
}

/**
 * Resolve the outcome of a trial match.
 *
 * Probability breakdown (base):
 *  - 60% "signed"     — player impressed during trial
 *  - 25% "interested" — good showing but club wants more time
 *  - 15% "doesNotFit" — trial did not convince the manager
 *
 * Modifiers:
 *  - Player form modifier (form is [-3, 3]): each positive point adds +3% to signed
 *    and subtracts from doesNotFit; each negative point does the reverse.
 *  - CA relative to squad average: if player CA > squadAvg → +5% to signed,
 *    if player CA < squadAvg * 0.8 → +10% to doesNotFit.
 *
 * @param rng     - Seeded PRNG instance.
 * @param player  - The player on trial.
 * @param club    - The club hosting the trial.
 * @param allPlayers - All players in the world (used to compute squad average CA).
 */
export function processTrialOutcome(
  rng: RNG,
  player: Player,
  club: Club,
  allPlayers: Record<string, Player>,
): ClubResponseType {
  const squad = Object.values(allPlayers).filter((p) => p.clubId === club.id);
  const squadAvgCA =
    squad.length === 0
      ? 100
      : squad.reduce((sum, p) => sum + p.currentAbility, 0) / squad.length;

  // Base weights
  let signedWeight = 60;
  let interestedWeight = 25;
  let doesNotFitWeight = 15;

  // Form modifier: form range is [-3, 3], each unit shifts weights by 3
  const formEffect = player.form * 3;
  signedWeight += formEffect;
  doesNotFitWeight -= formEffect;

  // CA vs squad average modifier
  if (player.currentAbility > squadAvgCA) {
    signedWeight += 5;
  } else if (player.currentAbility < squadAvgCA * 0.8) {
    doesNotFitWeight += 10;
    signedWeight -= 5;
  }

  // Clamp all weights to minimum 0 to avoid negative weight errors
  signedWeight = clamp(signedWeight, 0, 100);
  interestedWeight = clamp(interestedWeight, 0, 100);
  doesNotFitWeight = clamp(doesNotFitWeight, 0, 100);

  const items: Array<{ item: ClubResponseType; weight: number }> = [
    { item: "signed", weight: signedWeight },
    { item: "interested", weight: interestedWeight },
    { item: "doesNotFit", weight: doesNotFitWeight },
  ];

  // Ensure at least one non-zero weight (fallback to interested)
  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
  if (totalWeight <= 0) {
    return "interested";
  }

  return rng.pickWeighted(items);
}
