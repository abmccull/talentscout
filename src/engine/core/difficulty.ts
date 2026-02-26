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
    reputationMultiplier: 1.5,
    rivalIntelligence: 0.5,
    developmentRate: 1.3,
    permadeath: false,
  },
  normal: {
    incomeMultiplier: 1.0,
    expenseMultiplier: 1.0,
    reputationMultiplier: 1.0,
    rivalIntelligence: 1.0,
    developmentRate: 1.0,
    permadeath: false,
  },
  hard: {
    incomeMultiplier: 0.5,
    expenseMultiplier: 1.5,
    reputationMultiplier: 0.7,
    rivalIntelligence: 1.5,
    developmentRate: 0.8,
    permadeath: false,
  },
  ironman: {
    incomeMultiplier: 0.5,
    expenseMultiplier: 1.5,
    reputationMultiplier: 0.7,
    rivalIntelligence: 2.0,
    developmentRate: 0.8,
    permadeath: true,
  },
};

/**
 * Get the difficulty modifiers for a given level.
 * Returns normal modifiers for unknown levels (defensive fallback).
 */
export function getDifficultyModifiers(level: DifficultyLevel): DifficultyModifiers {
  return DIFFICULTY_CONFIGS[level] ?? DIFFICULTY_CONFIGS.normal;
}

// =============================================================================
// UI DESCRIPTIONS
// =============================================================================

export const DIFFICULTY_DESCRIPTIONS: Record<DifficultyLevel, { name: string; description: string }> = {
  casual: {
    name: "Casual",
    description: "Relaxed experience. Higher income, lower costs, faster progression.",
  },
  normal: {
    name: "Normal",
    description: "The intended experience. Balanced challenge.",
  },
  hard: {
    name: "Hard",
    description: "Demanding. Lower income, higher costs, smarter rivals.",
  },
  ironman: {
    name: "Ironman",
    description: "Ultimate challenge. Hard mode + permadeath if fired.",
  },
};
