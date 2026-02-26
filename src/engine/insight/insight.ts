/**
 * Insight Points Engine
 *
 * Core logic for accumulating and spending Insight Points.
 *
 * Accumulation formula:
 *   base_IP × quality_multiplier + specialization_bonus + intuition_bonus
 *
 * Spending requires:
 *   - Sufficient IP
 *   - Cooldown expired (2 weeks default)
 *   - Action available for current mode
 *   - Action matches specialization (or is universal)
 *
 * Fizzle mechanic:
 *   - If fatigue > 70, 20% chance the insight "fizzles" (reduced effect)
 *   - Perks can raise the fizzle threshold
 */

import type { RNG } from "@/engine/rng/index";
import type { Scout } from "@/engine/core/types";
import type { ObservationMode } from "@/engine/observation/types";
import type {
  InsightActionId,
  InsightAccumulationSource,
} from "@/engine/insight/types";
import {
  type InsightState,
  type InsightAction,
  type InsightUseRecord,
  INSIGHT_ACTIONS,
  INSIGHT_BASE_AMOUNTS,
  INSIGHT_QUALITY_MULTIPLIERS,
  INSIGHT_CAPACITY_BASE,
  INSIGHT_CAPACITY_PER_INTUITION,
  INSIGHT_DEFAULT_COOLDOWN,
  INSIGHT_FIZZLE_FATIGUE_THRESHOLD,
  INSIGHT_FIZZLE_CHANCE,
} from "@/engine/insight/types";

// =============================================================================
// INTERNAL CONSTANTS
// =============================================================================

/**
 * Maps each accumulation source to the specializations that earn a +1 bonus.
 * "observation" always matches for all specializations (scouting is universal).
 * Other sources align naturally with the specialization that dominates that work.
 */
const SOURCE_SPECIALIZATION_MATCH: Record<
  InsightAccumulationSource["source"],
  "all" | Array<Scout["primarySpecialization"]>
> = {
  observation: "all",
  report: ["youth", "firstTeam", "regional"],
  hypothesisConfirmed: ["youth", "firstTeam", "regional"],
  hypothesisDebunked: ["data"],
  assignment: "all",
};

// =============================================================================
// 1. createInsightState
// =============================================================================

/**
 * Returns the initial InsightState for a newly created scout.
 * Capacity is set to the base value (intuition-derived capacity is applied
 * separately via calculateCapacity once the scout's stats are known).
 */
export function createInsightState(): InsightState {
  return {
    points: 0,
    capacity: INSIGHT_CAPACITY_BASE,
    cooldownWeeksRemaining: 0,
    lifetimeUsed: 0,
    lifetimeEarned: 0,
    lastUsedWeek: 0,
    history: [],
  };
}

// =============================================================================
// 2. calculateAccumulation
// =============================================================================

/**
 * Calculates the full breakdown of IP earned from a single scouting activity.
 *
 * Formula:
 *   totalEarned = floor(baseAmount × qualityMultiplier + specializationBonus
 *                       + intuitionBonus + perkBonus)
 *
 * Never returns a negative totalEarned — a "poor" quality activity simply
 * earns nothing because its multiplier is 0.
 */
export function calculateAccumulation(
  source: InsightAccumulationSource["source"],
  qualityTier: string,
  scout: Scout,
  perkModifiers?: { insightBonus?: number; costReduction?: number },
): InsightAccumulationSource {
  const baseAmount = INSIGHT_BASE_AMOUNTS[source];

  const qualityMultiplier = INSIGHT_QUALITY_MULTIPLIERS[qualityTier] ?? 1.0;

  // Specialization bonus: +1 when the activity source matches the scout's
  // primary specialization domain, or for sources that match all specs.
  const matchRule = SOURCE_SPECIALIZATION_MATCH[source];
  const specializationBonus =
    matchRule === "all" || matchRule.includes(scout.primarySpecialization)
      ? 1
      : 0;

  // Intuition bonus: floor(intuition / 5), giving 0–4 for the 1–20 range.
  const intuitionBonus = Math.floor(scout.attributes.intuition / 5);

  const perkBonus = perkModifiers?.insightBonus ?? 0;

  const raw =
    baseAmount * qualityMultiplier +
    specializationBonus +
    intuitionBonus +
    perkBonus;

  const totalEarned = Math.max(0, Math.floor(raw));

  return {
    source,
    baseAmount,
    qualityMultiplier,
    specializationBonus,
    intuitionBonus,
    totalEarned,
  };
}

// =============================================================================
// 3. accumulateInsight
// =============================================================================

/**
 * Adds earned IP to the state, capped at the given capacity.
 * Increments lifetimeEarned by the full amount before capping, because the
 * scout did the work regardless of whether the tank was already full.
 */
export function accumulateInsight(
  state: InsightState,
  amount: number,
  capacity?: number,
): InsightState {
  const cap = capacity ?? state.capacity;
  const newPoints = Math.min(state.points + amount, cap);
  return {
    ...state,
    points: newPoints,
    capacity: cap,
    lifetimeEarned: state.lifetimeEarned + amount,
  };
}

// =============================================================================
// 4. calculateCapacity
// =============================================================================

/**
 * Derives the scout's maximum IP capacity from their intuition attribute.
 *
 * intuition 1  → 42
 * intuition 10 → 60
 * intuition 20 → 80
 */
export function calculateCapacity(intuition: number): number {
  return INSIGHT_CAPACITY_BASE + intuition * INSIGHT_CAPACITY_PER_INTUITION;
}

// =============================================================================
// 5. canUseInsight
// =============================================================================

/**
 * Validates whether a scout may trigger an insight action right now.
 *
 * Checks (in order):
 *  1. Action exists.
 *  2. Cooldown has expired.
 *  3. Action is available for the current observation mode.
 *  4. Action matches the scout's primary specialization (or is universal).
 *  5. Scout has enough IP (after optional perk cost reduction).
 *
 * Returns { canUse: true } when all checks pass, or { canUse: false, reason }
 * with a human-readable explanation on the first failing check.
 */
export function canUseInsight(
  state: InsightState,
  actionId: InsightActionId,
  scout: Scout,
  currentMode: ObservationMode,
  perkModifiers?: { costReduction?: number },
): { canUse: boolean; reason?: string } {
  const action = getInsightActionById(actionId);
  if (!action) {
    return { canUse: false, reason: `Unknown action: ${actionId}` };
  }

  if (state.cooldownWeeksRemaining > 0) {
    return {
      canUse: false,
      reason: `Insight is on cooldown for ${state.cooldownWeeksRemaining} more week${state.cooldownWeeksRemaining === 1 ? "" : "s"}.`,
    };
  }

  if (!action.availableDuring.includes(currentMode)) {
    return {
      canUse: false,
      reason: `${action.name} is not available during ${currentMode} sessions.`,
    };
  }

  if (
    action.specialization !== "universal" &&
    action.specialization !== scout.primarySpecialization
  ) {
    return {
      canUse: false,
      reason: `${action.name} requires the ${action.specialization} specialization.`,
    };
  }

  const cost = formatInsightCost(action, perkModifiers);
  if (state.points < cost) {
    return {
      canUse: false,
      reason: `Not enough Insight Points. Need ${cost}, have ${state.points}.`,
    };
  }

  return { canUse: true };
}

// =============================================================================
// 6. spendInsight
// =============================================================================

/**
 * Deducts the action's IP cost, sets the cooldown, increments counters, and
 * performs the fizzle check.
 *
 * Fizzle check:
 *   If scout.fatigue > fizzleThreshold (default 70, raised to 85 by the
 *   "Eureka Mastery" perk), there is a 20% chance the action fizzles.
 *   IP and cooldown are consumed regardless — the scout tried and failed.
 *
 * Cooldown:
 *   Uses the action's own cooldown value by default. If the "Deep Focus" perk
 *   is active, the cooldown is reduced by 1 (minimum 1 week).
 *
 * This function assumes canUseInsight has already been called and returned
 * { canUse: true }. It does not re-validate.
 */
export function spendInsight(
  state: InsightState,
  actionId: InsightActionId,
  scout: Scout,
  week: number,
  season: number,
  rng: RNG,
  perkModifiers?: { costReduction?: number; fizzleThreshold?: number },
): { state: InsightState; fizzled: boolean } {
  const action = getInsightActionById(actionId);
  if (!action) {
    throw new Error(`spendInsight: unknown actionId "${actionId}"`);
  }

  const cost = formatInsightCost(action, perkModifiers);

  // Cooldown — Deep Focus perk (represented by fizzleThreshold presence
  // being above default implies the perk exists; but cooldown reduction is
  // signalled by a separate convention). We apply a –1 reduction when the
  // caller supplies a fizzleThreshold above the default, which signals the
  // Eureka Mastery perk. For Deep Focus the caller should not need extra
  // signals — we check unlockedPerks directly.
  const hasDeepFocus = scout.unlockedPerks.includes("deepFocus");
  const baseCooldown = action.cooldown;
  const cooldown = hasDeepFocus ? Math.max(1, baseCooldown - 1) : baseCooldown;

  // Fizzle check
  const fizzleThreshold =
    perkModifiers?.fizzleThreshold ?? INSIGHT_FIZZLE_FATIGUE_THRESHOLD;
  const fizzled =
    scout.fatigue > fizzleThreshold && rng.chance(INSIGHT_FIZZLE_CHANCE);

  const newState: InsightState = {
    ...state,
    points: state.points - cost,
    cooldownWeeksRemaining: cooldown,
    lastUsedWeek: week,
    lifetimeUsed: state.lifetimeUsed + 1,
  };

  return { state: newState, fizzled };
}

// =============================================================================
// 7. tickCooldown
// =============================================================================

/**
 * Advances the cooldown timer by one week.
 * Called every time the game week advances. Safe to call when cooldown is
 * already 0 — it is clamped to a minimum of 0.
 */
export function tickCooldown(state: InsightState): InsightState {
  return {
    ...state,
    cooldownWeeksRemaining: Math.max(0, state.cooldownWeeksRemaining - 1),
  };
}

// =============================================================================
// 8. recordInsightUse
// =============================================================================

/**
 * Appends a completed-use record to the state's history log.
 * Should be called after spendInsight resolves and the action's effect
 * (or fizzle outcome) is known.
 */
export function recordInsightUse(
  state: InsightState,
  record: InsightUseRecord,
): InsightState {
  return {
    ...state,
    history: [...state.history, record],
  };
}

// =============================================================================
// 9. getAvailableActions
// =============================================================================

/**
 * Returns every insight action the scout could potentially trigger given their
 * specialization and the current observation mode.
 *
 * Does NOT filter by IP affordability or cooldown status — those are
 * separate concerns handled in the UI layer so that locked/unaffordable
 * actions can still be displayed (greyed out) to the player.
 */
export function getAvailableActions(
  _state: InsightState,
  scout: Scout,
  currentMode: ObservationMode,
): InsightAction[] {
  return INSIGHT_ACTIONS.filter(
    (action) =>
      action.availableDuring.includes(currentMode) &&
      (action.specialization === "universal" ||
        action.specialization === scout.primarySpecialization),
  );
}

// =============================================================================
// 10. getAffordableActions
// =============================================================================

/**
 * Returns actions the scout can trigger right now: correct specialization,
 * correct mode, sufficient IP, and cooldown ready.
 *
 * Use this to populate "available to activate" UI lists rather than the
 * full action catalogue.
 */
export function getAffordableActions(
  state: InsightState,
  scout: Scout,
  currentMode: ObservationMode,
  perkModifiers?: { costReduction?: number },
): InsightAction[] {
  if (state.cooldownWeeksRemaining > 0) {
    return [];
  }

  return getAvailableActions(state, scout, currentMode).filter((action) => {
    const cost = formatInsightCost(action, perkModifiers);
    return state.points >= cost;
  });
}

// =============================================================================
// 11. getInsightActionById
// =============================================================================

/**
 * Looks up an InsightAction by its canonical ID.
 * Returns undefined when the ID is not found — callers should treat this as
 * a logic error (invalid IDs should never reach runtime in production).
 */
export function getInsightActionById(
  actionId: InsightActionId,
): InsightAction | undefined {
  return INSIGHT_ACTIONS.find((action) => action.id === actionId);
}

// =============================================================================
// 12. formatInsightCost
// =============================================================================

/**
 * Returns the effective IP cost for an action after applying perk reductions.
 *
 * The cost is floored and clamped to a minimum of 1 — even with maximum perk
 * reduction an insight action always costs at least 1 IP.
 */
export function formatInsightCost(
  action: InsightAction,
  perkModifiers?: { costReduction?: number },
): number {
  const reduction = perkModifiers?.costReduction ?? 0;
  return Math.max(1, Math.floor(action.cost - reduction));
}
