/**
 * Difficulty configuration for TalentScout.
 *
 * Each difficulty level defines a set of multipliers that are applied to
 * core game systems: finances, reputation, player development, and rival AI.
 *
 * All functions are pure — no side effects.
 */

import type { DifficultyLevel, DifficultyModifiers } from "./types";

// =============================================================================
// DIFFICULTY CONFIGS
// =============================================================================

export const DIFFICULTY_CONFIGS: Record<DifficultyLevel, DifficultyModifiers> = {
  casual: {
    incomeMultiplier: 2.0,
    expenseMultiplier: 0.5,
    // Reputation needs sign-aware scaling. Keep the legacy scalar neutral so
    // losses are not accidentally amplified by callers that still use it.
    reputationMultiplier: 1.0,
    rivalIntelligence: 0.75,
    developmentRate: 1.0,
    wonderkidRateMultiplier: 1.0,
    permadeath: false,
  },
  normal: {
    incomeMultiplier: 1.0,
    expenseMultiplier: 1.0,
    reputationMultiplier: 1.0,
    rivalIntelligence: 1.0,
    developmentRate: 1.0,
    wonderkidRateMultiplier: 1.0,
    permadeath: false,
  },
  hard: {
    incomeMultiplier: 0.5,
    expenseMultiplier: 1.5,
    reputationMultiplier: 1.0,
    rivalIntelligence: 1.3,
    developmentRate: 1.0,
    wonderkidRateMultiplier: 1.0,
    permadeath: false,
  },
  ironman: {
    incomeMultiplier: 0.5,
    expenseMultiplier: 1.5,
    reputationMultiplier: 1.0,
    rivalIntelligence: 1.55,
    developmentRate: 1.0,
    wonderkidRateMultiplier: 1.0,
    permadeath: true,
  },
};

export interface DifficultyChallengeProfile {
  /** How decisively rivals act on their imperfect rankings. */
  rivalDecisionSharpness: number;
  /** Multiplier for bounded rival discovery pressure. */
  rivalDiscoveryPressure: number;
  /** Added to rival report windows; negative values create more pressure. */
  rivalDeadlineOffsetWeeks: number;
  reputationGainMultiplier: number;
  reputationLossMultiplier: number;
}

const DIFFICULTY_CHALLENGE_PROFILES: Record<DifficultyLevel, DifficultyChallengeProfile> = {
  casual: {
    rivalDecisionSharpness: 0.85,
    rivalDiscoveryPressure: 0.85,
    rivalDeadlineOffsetWeeks: 1,
    reputationGainMultiplier: 1.25,
    reputationLossMultiplier: 0.75,
  },
  normal: {
    rivalDecisionSharpness: 1,
    rivalDiscoveryPressure: 1,
    rivalDeadlineOffsetWeeks: 0,
    reputationGainMultiplier: 1,
    reputationLossMultiplier: 1,
  },
  hard: {
    rivalDecisionSharpness: 1.15,
    rivalDiscoveryPressure: 1.1,
    rivalDeadlineOffsetWeeks: -1,
    reputationGainMultiplier: 0.85,
    reputationLossMultiplier: 1.15,
  },
  ironman: {
    rivalDecisionSharpness: 1.3,
    rivalDiscoveryPressure: 1.2,
    rivalDeadlineOffsetWeeks: -1,
    reputationGainMultiplier: 0.8,
    reputationLossMultiplier: 1.25,
  },
};

/**
 * Get the difficulty modifiers for a given level.
 * Returns normal modifiers for unknown levels (defensive fallback).
 */
export function getDifficultyModifiers(level: DifficultyLevel): DifficultyModifiers {
  return DIFFICULTY_CONFIGS[level] ?? DIFFICULTY_CONFIGS.normal;
}

export function getDifficultyChallengeProfile(
  level: DifficultyLevel,
): DifficultyChallengeProfile {
  return DIFFICULTY_CHALLENGE_PROFILES[level] ?? DIFFICULTY_CHALLENGE_PROFILES.normal;
}

/**
 * Scale reputation in the intended direction: easier modes soften losses and
 * improve gains, while harder modes do the reverse.
 */
export function scaleReputationChange(
  change: number,
  level: DifficultyLevel,
): number {
  if (!Number.isFinite(change) || change === 0) return 0;
  const profile = getDifficultyChallengeProfile(level);
  const multiplier = change > 0
    ? profile.reputationGainMultiplier
    : profile.reputationLossMultiplier;
  return Math.sign(change) * Math.round(Math.abs(change) * multiplier);
}

// =============================================================================
// UI DESCRIPTIONS
// =============================================================================

export const DIFFICULTY_DESCRIPTIONS: Record<DifficultyLevel, { name: string; description: string }> = {
  casual: {
    name: "Casual",
    description: "Relaxed finances, less accurate rivals, and more time to react.",
  },
  normal: {
    name: "Normal",
    description: "The intended experience. Balanced challenge.",
  },
  hard: {
    name: "Hard",
    description: "Tighter finances, sharper rival evidence, and faster market pressure.",
  },
  ironman: {
    name: "Ironman",
    description: "The strongest rivals and market pressure, with permanent dismissal.",
  },
};
