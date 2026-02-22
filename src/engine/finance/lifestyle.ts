/**
 * Lifestyle system — replaces fixed TIER_RENT with player-chosen lifestyle tiers.
 *
 * Each lifestyle level provides a monthly cost (replacing rent), networking bonuses,
 * and salary offer bonuses. Living below your station at high tiers incurs a
 * reputation penalty.
 */

import type {
  FinancialRecord,
  LifestyleLevel,
  LifestyleConfig,
  CareerTier,
} from "../core/types";

// ---------------------------------------------------------------------------
// Lifestyle tier definitions
// ---------------------------------------------------------------------------

export const LIFESTYLE_TIERS: Record<LifestyleLevel, { name: string; config: LifestyleConfig }> = {
  1: {
    name: "Budget",
    config: { level: 1, monthlyCost: 200, networkingBonus: 0, salaryOfferBonus: 0 },
  },
  2: {
    name: "Comfortable",
    config: { level: 2, monthlyCost: 500, networkingBonus: 0.05, salaryOfferBonus: 0 },
  },
  3: {
    name: "Professional",
    config: { level: 3, monthlyCost: 1000, networkingBonus: 0.10, salaryOfferBonus: 0.05 },
  },
  4: {
    name: "Upscale",
    config: { level: 4, monthlyCost: 2000, networkingBonus: 0.15, salaryOfferBonus: 0.10 },
  },
  5: {
    name: "Luxury",
    config: { level: 5, monthlyCost: 5000, networkingBonus: 0.20, salaryOfferBonus: 0.15 },
  },
};

/**
 * Get the default lifestyle for a given career tier.
 */
export function getDefaultLifestyle(careerTier: CareerTier): LifestyleConfig {
  const tierToLifestyle: Record<CareerTier, LifestyleLevel> = {
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
  };
  return { ...LIFESTYLE_TIERS[tierToLifestyle[careerTier]].config };
}

/**
 * Change the scout's lifestyle level. Returns updated finances or null if
 * the level is the same.
 */
export function changeLifestyle(
  finances: FinancialRecord,
  level: LifestyleLevel,
): FinancialRecord | null {
  if (finances.lifestyle.level === level) return null;

  const newLifestyle = { ...LIFESTYLE_TIERS[level].config };

  return {
    ...finances,
    lifestyle: newLifestyle,
  };
}

/**
 * Calculate reputation penalty for living below station.
 * Applies at tier 4-5 if lifestyle is more than 1 level below career tier.
 * Returns 0 (no penalty) or a negative number.
 */
export function getLifestyleReputationPenalty(
  lifestyleLevel: LifestyleLevel,
  careerTier: CareerTier,
): number {
  if (careerTier < 4) return 0;

  const gap = careerTier - lifestyleLevel;
  if (gap <= 1) return 0;

  // -1 rep per level gap beyond 1
  return -(gap - 1);
}

/**
 * Get the networking modifier from the current lifestyle.
 */
export function getLifestyleNetworkingBonus(lifestyle: LifestyleConfig): number {
  return lifestyle.networkingBonus;
}
