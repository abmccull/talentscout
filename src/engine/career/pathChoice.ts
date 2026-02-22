/**
 * Career path choice — at the tier 1→2 transition, the player chooses between
 * the Club Scout path (employment, salary, bonuses) or the Independent Scout
 * path (freelance, marketplace, agency).
 *
 * All functions are pure: (state) => newState.
 */

import type {
  Scout,
  FinancialRecord,
  CareerPath,
  IndependentTier,
  CareerTier,
} from "@/engine/core/types";

// ---------------------------------------------------------------------------
// Independent tier requirements
// ---------------------------------------------------------------------------

interface IndependentTierRequirement {
  minReputation: number;
  minBalance: number;
  minReportsSubmitted: number;
  minRetainers?: number;
  minEmployees?: number;
  requiredCourses?: string[];
}

const INDEPENDENT_TIER_REQUIREMENTS: Record<IndependentTier, IndependentTierRequirement> = {
  1: { minReputation: 0, minBalance: 0, minReportsSubmitted: 0 },
  2: { minReputation: 20, minBalance: 1000, minReportsSubmitted: 5 },
  3: { minReputation: 40, minBalance: 5000, minReportsSubmitted: 20, minRetainers: 1 },
  4: { minReputation: 60, minBalance: 15000, minReportsSubmitted: 50, minRetainers: 3, minEmployees: 1 },
  5: { minReputation: 80, minBalance: 50000, minReportsSubmitted: 100, minRetainers: 5, minEmployees: 3 },
};

// ---------------------------------------------------------------------------
// Path eligibility
// ---------------------------------------------------------------------------

/**
 * Check if the scout meets the requirements to choose the independent path.
 * Called at the tier 1→2 transition point.
 */
export function canChooseIndependentPath(
  scout: Scout,
  finances: FinancialRecord,
): boolean {
  return (
    scout.reputation >= 15 &&
    scout.reportsSubmitted >= 1 &&
    finances.balance >= 500
  );
}

// ---------------------------------------------------------------------------
// Path selection
// ---------------------------------------------------------------------------

/**
 * Apply the chosen career path to the scout and financial record.
 * Called once when the player makes their choice at tier 1→2.
 */
export function chooseCareerPath(
  scout: Scout,
  finances: FinancialRecord,
  path: CareerPath,
): { scout: Scout; finances: FinancialRecord } {
  const updatedScout: Scout = {
    ...scout,
    careerPath: path,
    independentTier: path === "independent" ? 1 : undefined,
  };

  const updatedFinances: FinancialRecord = {
    ...finances,
    careerPath: path,
    independentTier: path === "independent" ? 1 : undefined,
  };

  return { scout: updatedScout, finances: updatedFinances };
}

// ---------------------------------------------------------------------------
// Independent tier advancement
// ---------------------------------------------------------------------------

/**
 * Get the requirements for a specific independent tier.
 */
export function getIndependentTierRequirements(
  tier: IndependentTier,
): IndependentTierRequirement {
  return INDEPENDENT_TIER_REQUIREMENTS[tier];
}

/**
 * Check if the scout qualifies for the next independent tier.
 * Returns the next tier number if eligible, or null if not.
 */
export function checkIndependentTierAdvancement(
  scout: Scout,
  finances: FinancialRecord,
): IndependentTier | null {
  if (scout.careerPath !== "independent") return null;

  const currentTier = scout.independentTier ?? 1;
  const nextTier = (currentTier + 1) as IndependentTier;
  if (nextTier > 5) return null;

  const req = INDEPENDENT_TIER_REQUIREMENTS[nextTier];

  if (scout.reputation < req.minReputation) return null;
  if (finances.balance < req.minBalance) return null;
  if (scout.reportsSubmitted < req.minReportsSubmitted) return null;
  if (req.minRetainers && finances.retainerContracts.filter(r => r.status === "active").length < req.minRetainers) return null;
  if (req.minEmployees && finances.employees.length < req.minEmployees) return null;
  if (req.requiredCourses) {
    for (const courseId of req.requiredCourses) {
      if (!finances.completedCourses.includes(courseId)) return null;
    }
  }

  return nextTier;
}

/**
 * Apply independent tier advancement effects.
 */
export function advanceIndependentTier(
  scout: Scout,
  finances: FinancialRecord,
  newTier: IndependentTier,
): { scout: Scout; finances: FinancialRecord } {
  // Map independent tier to equivalent career tier for game systems
  const equivalentCareerTier = newTier as CareerTier;

  const updatedScout: Scout = {
    ...scout,
    independentTier: newTier,
    careerTier: equivalentCareerTier,
  };

  const updatedFinances: FinancialRecord = {
    ...finances,
    independentTier: newTier,
  };

  return { scout: updatedScout, finances: updatedFinances };
}
