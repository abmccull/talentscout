/**
 * Club path enhancements — performance bonuses, signing bonuses, discovery
 * bonuses, and contract negotiation mechanics for scouts on the club path.
 */

import type {
  CareerTier,
  ConvictionLevel,
  PerformanceReview,
  JobOffer,
} from "../core/types";

// ---------------------------------------------------------------------------
// Performance bonuses
// ---------------------------------------------------------------------------

/**
 * Calculate the performance bonus amount based on review outcome and tier.
 * Only club-path scouts receive performance bonuses.
 */
export function calculatePerformanceBonusAmount(
  review: PerformanceReview,
  careerTier: CareerTier,
): number {
  if (careerTier < 2) return 0;

  const baseBonuses: Record<CareerTier, number> = {
    1: 0,
    2: 500,
    3: 2000,
    4: 5000,
    5: 10000,
  };

  const outcomeMultipliers: Record<PerformanceReview["outcome"], number> = {
    promoted: 2.5,
    retained: 1.0,
    warning: 0,
    fired: 0,
  };

  const base = baseBonuses[careerTier];
  const multiplier = outcomeMultipliers[review.outcome];

  return Math.round(base * multiplier);
}

// ---------------------------------------------------------------------------
// Signing bonuses
// ---------------------------------------------------------------------------

/**
 * Calculate the signing bonus for accepting a new job offer.
 * Only available at tier 3+.
 */
export function calculateSigningBonus(offer: JobOffer): number {
  if (offer.tier < 3) return 0;

  const signingBonuses: Record<CareerTier, number> = {
    1: 0,
    2: 0,
    3: 2000,
    4: 5000,
    5: 10000,
  };

  return signingBonuses[offer.tier];
}

// ---------------------------------------------------------------------------
// Discovery bonuses
// ---------------------------------------------------------------------------

/**
 * Calculate the discovery bonus when a scout's report matches a transferred
 * player. The scout earns a bonus based on the conviction level used and
 * the transfer fee.
 */
export function calculateDiscoveryBonus(
  transferFee: number,
  careerTier: CareerTier,
  conviction: ConvictionLevel,
): number {
  if (careerTier < 2) return 0;

  // Base bonus by tier
  const baseBonuses: Record<CareerTier, number> = {
    1: 0,
    2: 500,
    3: 1000,
    4: 1500,
    5: 2000,
  };

  // Conviction multiplier
  const convictionMultipliers: Record<ConvictionLevel, number> = {
    note: 0.5,
    recommend: 1.0,
    strongRecommend: 1.5,
    tablePound: 2.0,
  };

  const base = baseBonuses[careerTier];
  const mult = convictionMultipliers[conviction];

  return Math.round(base * mult);
}

// ---------------------------------------------------------------------------
// Department bonus pool (tier 4+)
// ---------------------------------------------------------------------------

/**
 * Calculate the department bonus pool for head scouts / directors.
 * Based on the number of successful signings from the department.
 */
export function calculateDepartmentBonusPool(
  successfulSignings: number,
  careerTier: CareerTier,
): number {
  if (careerTier < 4) return 0;

  const perSigning: Record<4 | 5, number> = {
    4: 5000,
    5: 10000,
  };

  const tier = careerTier as 4 | 5;
  const maxPool = careerTier === 5 ? 25000 : 15000;

  return Math.min(maxPool, successfulSignings * perSigning[tier]);
}

// ---------------------------------------------------------------------------
// Golden parachute (tier 5)
// ---------------------------------------------------------------------------

/**
 * Calculate the golden parachute payout when a tier 5 scout is fired.
 * Equal to contractLength * 4 * weekly salary.
 */
export function calculateGoldenParachute(
  salary: number,
  contractRemainingSeasons: number,
): number {
  if (contractRemainingSeasons <= 0) return 0;
  // 4 monthly payments per remaining season
  return contractRemainingSeasons * 4 * salary;
}
