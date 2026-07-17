/**
 * Difficulty configuration for TalentScout.
 *
 * Each difficulty level defines a set of multipliers that are applied to
 * core game systems: finances, reputation, player development, and rival AI.
 *
 * All functions are pure — no side effects.
 */

import type {
  DifficultyLevel,
  DifficultyModifiers,
  ScoutReport,
} from "./types";

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
  /** Multiplies evidence variance without changing canonical player attributes. */
  evidenceNoiseMultiplier: number;
  /** Multiplies the usefulness of player-visible source evidence. */
  sourceReliabilityMultiplier: number;
  /** Added to the time available to verify a claim before it must be filed. */
  verificationWindowOffsetWeeks: number;
  /** Multiplies the public career/reputation cost of revising a filed judgment. */
  publicRevisionCostMultiplier: number;
  reputationGainMultiplier: number;
  reputationLossMultiplier: number;
}

const DIFFICULTY_CHALLENGE_PROFILES: Record<DifficultyLevel, DifficultyChallengeProfile> = {
  casual: {
    rivalDecisionSharpness: 0.85,
    rivalDiscoveryPressure: 0.85,
    rivalDeadlineOffsetWeeks: 1,
    evidenceNoiseMultiplier: 0.84,
    sourceReliabilityMultiplier: 1.08,
    verificationWindowOffsetWeeks: 2,
    publicRevisionCostMultiplier: 0.75,
    reputationGainMultiplier: 1.25,
    reputationLossMultiplier: 0.75,
  },
  normal: {
    rivalDecisionSharpness: 1,
    rivalDiscoveryPressure: 1,
    rivalDeadlineOffsetWeeks: 0,
    evidenceNoiseMultiplier: 1,
    sourceReliabilityMultiplier: 1,
    verificationWindowOffsetWeeks: 0,
    publicRevisionCostMultiplier: 1,
    reputationGainMultiplier: 1,
    reputationLossMultiplier: 1,
  },
  hard: {
    rivalDecisionSharpness: 1.15,
    rivalDiscoveryPressure: 1.1,
    rivalDeadlineOffsetWeeks: -1,
    evidenceNoiseMultiplier: 1.14,
    sourceReliabilityMultiplier: 0.9,
    verificationWindowOffsetWeeks: -1,
    publicRevisionCostMultiplier: 1.2,
    reputationGainMultiplier: 0.85,
    reputationLossMultiplier: 1.15,
  },
  ironman: {
    rivalDecisionSharpness: 1.3,
    rivalDiscoveryPressure: 1.2,
    rivalDeadlineOffsetWeeks: -1,
    evidenceNoiseMultiplier: 1.28,
    sourceReliabilityMultiplier: 0.82,
    verificationWindowOffsetWeeks: -2,
    publicRevisionCostMultiplier: 1.4,
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
  // Reputation deliberately supports fractional movement. Integer rounding
  // erased every mature report gain below 0.5 and made career progression
  // silently stall, especially on harder modes. Keep deterministic precision
  // while avoiding long floating-point tails in saves.
  return Math.round(change * multiplier * 1_000) / 1_000;
}

/**
 * Materially changing a filed recommendation spends public credibility. A
 * clarification that preserves conviction, role, and action remains free so
 * the system rewards honest evidence updates instead of punishing paperwork.
 */
export function calculatePublicRevisionReputationCost(
  previous: Pick<ScoutReport, "conviction" | "projectedRole" | "recommendedAction"> | undefined,
  next: Pick<ScoutReport, "conviction" | "projectedRole" | "recommendedAction">,
  level: DifficultyLevel,
): number {
  if (!previous) return 0;
  const materiallyChanged = previous.conviction !== next.conviction
    || previous.projectedRole !== next.projectedRole
    || previous.recommendedAction !== next.recommendedAction;
  if (!materiallyChanged) return 0;
  return Math.max(
    1,
    Math.round(3 * getDifficultyChallengeProfile(level).publicRevisionCostMultiplier),
  );
}

// =============================================================================
// UI DESCRIPTIONS
// =============================================================================

export const DIFFICULTY_DESCRIPTIONS: Record<DifficultyLevel, { name: string; description: string }> = {
  casual: {
    name: "Casual",
    description: "A forgiving information profile: clearer evidence, more reliable sources, longer verification windows, and softer revision costs alongside relaxed finances and rivals.",
  },
  normal: {
    name: "Normal",
    description: "The intended experience, with neutral evidence clarity, source reliability, verification windows, revision costs, finances, and rival pressure.",
  },
  hard: {
    name: "Hard",
    description: "Noisier evidence, less reliable sources, shorter verification windows, and costlier public revisions alongside tighter finances and sharper rivals.",
  },
  ironman: {
    name: "Ironman",
    description: "The harshest information profile and rival pressure: noisy evidence, unreliable sources, very short verification windows, costly revisions, and permanent dismissal.",
  },
};
