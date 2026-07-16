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
import {
  transitionToClubCareer,
  transitionToIndependentCareer,
} from "./transitions";
import { hasRequiredCoursesForTier } from "./courses";

// ---------------------------------------------------------------------------
// Independent tier requirements
// ---------------------------------------------------------------------------

interface IndependentTierRequirement {
  minReputation: number;
  minBalance: number;
  minReportsSubmitted: number;
  minRetainers?: number;
  minEmployees?: number;
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
  return canChooseCareerPath(scout, finances);
}

/**
 * Shared eligibility for the first deliberate career-path commitment.
 * Both options become available from the same body of earned work; the club
 * path must not be an easier hidden default than the independent path.
 */
export function canChooseCareerPath(
  scout: Scout,
  finances: FinancialRecord,
): boolean {
  return (
    scout.careerPathChosen !== true &&
    scout.careerTier >= 2 &&
    scout.reputation >= 20 &&
    scout.reportsSubmitted >= 5 &&
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
  const isInitialChoice = scout.careerPathChosen !== true;
  const transition = path === "independent"
    ? transitionToIndependentCareer(scout, finances)
    : transitionToClubCareer(scout, finances);
  return {
    scout: {
      ...transition.scout,
      careerPathChosen: true,
      ...(path === "independent" && isInitialChoice
        ? { independentTier: scout.careerTier }
        : {}),
    },
    finances: {
      ...transition.finances,
      ...(path === "independent" && isInitialChoice
        ? { independentTier: scout.careerTier }
        : {}),
    },
  };
}

// ---------------------------------------------------------------------------
// Independent tier advancement
// ---------------------------------------------------------------------------

export type CareerTierAdvancementSource =
  | "performanceReview"
  | "independentMilestone";

export type CareerTierAdvancementBlocker =
  | "maxTier"
  | "careerPath"
  | "activeEmployer"
  | "pathCommitment"
  | "finances"
  | "qualification"
  | "reputation"
  | "balance"
  | "reports"
  | "retainers"
  | "employees";

export interface CareerTierAdvancementDecision {
  source: CareerTierAdvancementSource;
  currentTier: CareerTier;
  targetTier?: CareerTier;
  eligible: boolean;
  blockers: CareerTierAdvancementBlocker[];
}

export interface CareerTierAdvancementResult {
  scout: Scout;
  finances?: FinancialRecord;
  decision: CareerTierAdvancementDecision;
}

function getAdvancementCurrentTier(
  scout: Scout,
  finances: FinancialRecord | undefined,
  source: CareerTierAdvancementSource,
): CareerTier {
  if (source === "performanceReview") return scout.careerTier;
  // Older saves may contain divergent mirrors after one promotion path wrote
  // only one field. Never demote those saves while reconciling on advancement.
  return Math.max(
    scout.careerTier,
    scout.independentTier ?? 1,
    finances?.independentTier ?? 1,
  ) as CareerTier;
}

/**
 * The canonical career-tier authority. Review promotions and independent
 * business milestones use one qualification gate and one state transition.
 */
export function attemptCareerTierAdvancement(
  scout: Scout,
  finances: FinancialRecord | undefined,
  source: CareerTierAdvancementSource,
): CareerTierAdvancementResult {
  const currentTier = getAdvancementCurrentTier(scout, finances, source);
  if (currentTier >= 5) {
    return {
      scout,
      finances,
      decision: {
        source,
        currentTier,
        eligible: false,
        blockers: ["maxTier"],
      },
    };
  }

  const targetTier = (currentTier + 1) as CareerTier;
  const blockers: CareerTierAdvancementBlocker[] = [];

  if (!hasRequiredCoursesForTier(
    finances?.completedCourses ?? [],
    targetTier,
  )) {
    blockers.push("qualification");
  }

  if (source === "performanceReview") {
    if (scout.careerPath !== "club") blockers.push("careerPath");
    if (!scout.currentClubId) blockers.push("activeEmployer");
  } else {
    if (scout.careerPath !== "independent") blockers.push("careerPath");
    if (!finances) {
      blockers.push("finances");
    } else {
      // Tier 2 is the shared choice threshold. Before the deliberate path
      // decision, no further independent promotion may happen silently.
      if (scout.careerPathChosen !== true && currentTier >= 2) {
        blockers.push("pathCommitment");
      }
      const requirement = INDEPENDENT_TIER_REQUIREMENTS[targetTier as IndependentTier];
      if (scout.reputation < requirement.minReputation) blockers.push("reputation");
      if (finances.balance < requirement.minBalance) blockers.push("balance");
      if (scout.reportsSubmitted < requirement.minReportsSubmitted) blockers.push("reports");
      if (
        requirement.minRetainers
        && (finances.retainerContracts ?? []).filter((retainer) => retainer.status === "active").length
          < requirement.minRetainers
      ) {
        blockers.push("retainers");
      }
      if (
        requirement.minEmployees
        && (finances.employees ?? []).length < requirement.minEmployees
      ) {
        blockers.push("employees");
      }
    }
  }

  const decision: CareerTierAdvancementDecision = {
    source,
    currentTier,
    targetTier,
    eligible: blockers.length === 0,
    blockers,
  };
  if (!decision.eligible) return { scout, finances, decision };

  const independentTier = targetTier as IndependentTier;
  return {
    scout: {
      ...scout,
      careerTier: targetTier,
      ...(source === "independentMilestone"
        ? { independentTier }
        : {}),
    },
    finances: finances
      ? {
          ...finances,
          ...(source === "independentMilestone"
            ? { independentTier }
            : {}),
        }
      : undefined,
    decision,
  };
}

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
  const result = attemptCareerTierAdvancement(
    scout,
    finances,
    "independentMilestone",
  );
  return result.decision.eligible
    ? result.decision.targetTier as IndependentTier
    : null;
}

/**
 * Apply independent tier advancement effects.
 */
export function advanceIndependentTier(
  scout: Scout,
  finances: FinancialRecord,
  newTier: IndependentTier,
): { scout: Scout; finances: FinancialRecord } {
  const result = attemptCareerTierAdvancement(
    scout,
    finances,
    "independentMilestone",
  );
  if (!result.decision.eligible || result.decision.targetTier !== newTier) {
    return { scout, finances };
  }
  return { scout: result.scout, finances: result.finances as FinancialRecord };
}
