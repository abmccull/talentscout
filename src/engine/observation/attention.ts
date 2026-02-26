/**
 * Attention & Focus System
 *
 * Manages focus token allocation, lens warmup/fatigue, and the
 * attention economy that drives interactive scouting choices.
 *
 * Key mechanics:
 * - Focus tokens are scarce (3 per half in Full Observation)
 * - Lenses provide domain-specific accuracy boosts
 * - First phase with a new lens gives partial reads (warmup)
 * - After 4+ consecutive phases with same lens, fatigue reduces accuracy
 */

import type {
  ObservationMode,
  LensType,
  FocusTokenState,
  FocusAllocation,
} from "@/engine/observation/types";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Tokens granted per half for each observation mode. */
const TOKENS_PER_HALF: Record<ObservationMode, number> = {
  fullObservation: 3,
  investigation: 2,
  analysis: 1,
  quickInteraction: 0,
};

/**
 * Effectiveness multiplier during warmup (first phase with a new lens).
 * Scout is still calibrating — readings are partial.
 */
const WARMUP_EFFECTIVENESS = 0.5;

/**
 * Effectiveness multiplier for normal focused observation (phases 2–4).
 * The scout is fully dialled in.
 */
const NORMAL_EFFECTIVENESS = 1.0;

/**
 * Minimum effectiveness before fatigue can decay no further.
 * Even an exhausted scout retains some observational value.
 */
const FATIGUE_EFFECTIVENESS_FLOOR = 0.7;

/**
 * Phase threshold after which fatigue begins to apply.
 * Consecutive phases 1–4: normal. Phase 5+: gradual decay.
 */
const FATIGUE_ONSET_PHASE = 4;

/**
 * How much effectiveness drops per phase beyond the fatigue threshold.
 * Phase 5 → 0.9, phase 6 → 0.8, phase 7+ → capped at 0.7.
 */
const FATIGUE_DECAY_PER_PHASE = 0.1;

/**
 * Maximum number of phases back in history that still counts as 'peripheral'
 * observation quality.
 */
const PERIPHERAL_PHASE_WINDOW = 2;

// =============================================================================
// TOKEN BUDGET QUERIES
// =============================================================================

/**
 * Returns the number of focus tokens granted per half for a given mode.
 *
 * Full Observation: 3 — high-intensity live watching
 * Investigation:    2 — dialogue-focused, some attention available
 * Analysis:         1 — data work, minimal free-form focus
 * Quick Interaction: 0 — no token economy; single-choice sessions
 */
export function getTokensPerHalf(mode: ObservationMode): number {
  return TOKENS_PER_HALF[mode];
}

// =============================================================================
// STATE FACTORY
// =============================================================================

/**
 * Creates the initial FocusTokenState for a new observation session.
 *
 * The available count is set to the per-half allowance. Allocations and
 * warmup tracking start empty — no focus has been spent yet.
 */
export function createFocusTokenState(mode: ObservationMode): FocusTokenState {
  const perHalf = getTokensPerHalf(mode);
  return {
    available: perHalf,
    total: perHalf,
    allocations: [],
    warmupPhases: {},
  };
}

// =============================================================================
// TOKEN LIFECYCLE
// =============================================================================

/**
 * Refreshes the available token count at half-time.
 *
 * The budget resets to the per-half amount. Existing allocations are preserved
 * — focus history and warmup tracking carry over into the second half.
 */
export function refreshTokens(
  state: FocusTokenState,
  mode: ObservationMode,
): FocusTokenState {
  const perHalf = getTokensPerHalf(mode);
  return {
    ...state,
    available: perHalf,
    total: perHalf,
  };
}

/**
 * Spends one focus token to allocate attention to a player with a given lens.
 *
 * Returns null if no tokens are available — callers must check before acting
 * on the result. On success, returns a new state with:
 * - available decremented by 1
 * - a new FocusAllocation appended (startPhase = currentPhase, phasesActive = 1)
 * - warmupPhases updated so that effectiveness starts at 0.5 for this combo
 */
export function spendToken(
  state: FocusTokenState,
  playerId: string,
  lens: LensType,
  currentPhase: number,
): FocusTokenState | null {
  if (state.available <= 0) {
    return null;
  }

  const allocation: FocusAllocation = {
    playerId,
    lens,
    startPhase: currentPhase,
    phasesActive: 1,
  };

  // Warmup key tracks when this player+lens combo was first activated.
  // Setting it to 0 signals "phase 1 of this lens" so getLensEffectiveness
  // can apply the warmup penalty on the first phase.
  const warmupKey = buildWarmupKey(playerId, lens);

  return {
    ...state,
    available: state.available - 1,
    allocations: [...state.allocations, allocation],
    warmupPhases: {
      ...state.warmupPhases,
      [warmupKey]: 0,
    },
  };
}

// =============================================================================
// LENS EFFECTIVENESS
// =============================================================================

/**
 * Returns a 0.0–1.0 multiplier representing how effective the active lens is
 * for a given player at the current phase.
 *
 * Rules:
 * - 0.0  — player has no active allocation (not focused at all)
 * - 0.5  — warmup: first phase using this lens on this player
 * - 1.0  — normal: phases 2–4 with the same lens
 * - 0.9  — phase 5 (fatigue begins)
 * - 0.8  — phase 6
 * - 0.7+ — phase 7 and beyond (floor, never drops below)
 *
 * The warmup tracker uses the phasesActive field on the most recent allocation
 * that covers the currentPhase.
 */
export function getLensEffectiveness(
  state: FocusTokenState,
  playerId: string,
  lens: LensType,
  currentPhase: number,
): number {
  const allocation = findActiveAllocation(state, playerId, currentPhase);
  if (allocation === undefined || allocation.lens !== lens) {
    return 0.0;
  }

  const warmupKey = buildWarmupKey(playerId, lens);
  const warmupPhaseCount = state.warmupPhases[warmupKey];

  // If the warmup entry is missing entirely, treat as phase 1 (warmup).
  if (warmupPhaseCount === undefined) {
    return WARMUP_EFFECTIVENESS;
  }

  // phasesActive is 1-based: the allocation was just created at phasesActive = 1.
  // warmupPhaseCount of 0 means we are still in the first phase with this lens.
  const consecutivePhases = allocation.phasesActive;

  if (consecutivePhases <= 1) {
    return WARMUP_EFFECTIVENESS;
  }

  if (consecutivePhases <= FATIGUE_ONSET_PHASE) {
    return NORMAL_EFFECTIVENESS;
  }

  // Fatigue: each phase beyond 4 reduces effectiveness by 0.1, floored at 0.7.
  const fatiguePhases = consecutivePhases - FATIGUE_ONSET_PHASE;
  const fatigued = NORMAL_EFFECTIVENESS - fatiguePhases * FATIGUE_DECAY_PER_PHASE;
  return Math.max(FATIGUE_EFFECTIVENESS_FLOOR, fatigued);
}

// =============================================================================
// OBSERVATION QUALITY
// =============================================================================

/**
 * Returns the quality tier for a player's observation at the given phase.
 *
 * - 'focused'    — the scout currently has an active allocation on this player
 * - 'peripheral' — the scout focused on this player within the last 2 phases
 * - 'unfocused'  — no recent attention; only ambient impressions available
 */
export function getObservationQuality(
  state: FocusTokenState,
  playerId: string,
  currentPhase: number,
): "focused" | "peripheral" | "unfocused" {
  // Check active focus first
  if (findActiveAllocation(state, playerId, currentPhase) !== undefined) {
    return "focused";
  }

  // Check recent allocations within the peripheral window
  for (const allocation of state.allocations) {
    if (allocation.playerId !== playerId) continue;
    const lastActivePhase =
      allocation.startPhase + allocation.phasesActive - 1;
    const phasesSince = currentPhase - lastActivePhase;
    if (phasesSince > 0 && phasesSince <= PERIPHERAL_PHASE_WINDOW) {
      return "peripheral";
    }
  }

  return "unfocused";
}

/**
 * Returns true if any allocation in the state is assigned to the given player.
 * Does not check phase — any historical allocation counts.
 */
export function isPlayerFocused(
  state: FocusTokenState,
  playerId: string,
): boolean {
  return state.allocations.some((a) => a.playerId === playerId);
}

// =============================================================================
// LENS ACCURACY BONUS
// =============================================================================

/**
 * Returns the attribute-domain accuracy bonuses conferred by a lens type.
 *
 * The bonus values mirror the LENS_SKILL_BOOST constants from the existing
 * match focus system (match/focus.ts) to keep the two systems consistent.
 * Keys are AttributeDomain strings; values are the bonus to accuracy.
 *
 * - technical: +3 to technical domain reads
 * - physical:  +3 to physical domain reads
 * - mental:    +3 to mental domain reads
 * - tactical:  +3 to tactical, +1 to mental (tactical decisions have
 *              a psychological component)
 * - general:   {} — no specific boost; covers all domains equally
 */
export function getLensAccuracyBonus(lens: LensType): Record<string, number> {
  switch (lens) {
    case "technical":
      return { technical: 3 };
    case "physical":
      return { physical: 3 };
    case "mental":
      return { mental: 3 };
    case "tactical":
      return { tactical: 3, mental: 1 };
    case "general":
      return {};
  }
}

// =============================================================================
// ALLOCATION ACCESSORS
// =============================================================================

/**
 * Returns all allocations currently held in the state.
 * Includes both current and historical allocations from the session.
 */
export function getActiveAllocations(
  state: FocusTokenState,
): FocusAllocation[] {
  return state.allocations;
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Builds the record key used to track warmup phase counts.
 * Format: `${playerId}:${lens}` — matches the FocusTokenState.warmupPhases spec.
 */
function buildWarmupKey(playerId: string, lens: LensType): string {
  return `${playerId}:${lens}`;
}

/**
 * Finds the most recent allocation for a player that covers the given phase.
 * An allocation covers a phase if:
 *   startPhase <= currentPhase < startPhase + phasesActive
 *
 * Returns undefined if no active allocation exists for this player at this phase.
 * When multiple allocations exist (e.g. after a token refresh), the last one wins.
 */
function findActiveAllocation(
  state: FocusTokenState,
  playerId: string,
  currentPhase: number,
): FocusAllocation | undefined {
  let best: FocusAllocation | undefined;

  for (const allocation of state.allocations) {
    if (allocation.playerId !== playerId) continue;
    const endPhase = allocation.startPhase + allocation.phasesActive;
    if (currentPhase >= allocation.startPhase && currentPhase < endPhase) {
      // Take the last matching allocation (most recent start)
      if (best === undefined || allocation.startPhase >= best.startPhase) {
        best = allocation;
      }
    }
  }

  return best;
}
