/**
 * Balance constants — central file for all pricing tables, salary bands,
 * fee percentages, lifestyle costs, office costs, employee salaries,
 * and loan rates. All finance modules should import constants from here.
 *
 * This file serves as the single source of truth for economic tuning.
 */

import type {
  CareerTier,
  ConvictionLevel,
  LifestyleLevel,
  OfficeTier,
  AgencyEmployeeRole,
  LoanType,
  ConsultingType,
  IndependentTier,
} from "../core/types";

// =============================================================================
// SALARY & INCOME
// =============================================================================

export const SALARY_BANDS: Record<CareerTier, { min: number; max: number }> = {
  1: { min: 0, max: 0 },
  2: { min: 500, max: 1500 },
  3: { min: 1500, max: 4000 },
  4: { min: 4000, max: 10000 },
  5: { min: 10000, max: 25000 },
};

// =============================================================================
// LIFESTYLE
// =============================================================================

export const LIFESTYLE_COSTS: Record<LifestyleLevel, number> = {
  1: 200,    // Budget
  2: 500,    // Comfortable
  3: 1000,   // Professional
  4: 2000,   // Upscale
  5: 5000,   // Luxury
};

export const LIFESTYLE_NETWORKING_BONUS: Record<LifestyleLevel, number> = {
  1: 0,
  2: 0.05,
  3: 0.10,
  4: 0.15,
  5: 0.20,
};

export const LIFESTYLE_SALARY_OFFER_BONUS: Record<LifestyleLevel, number> = {
  1: 0,
  2: 0,
  3: 0.05,
  4: 0.10,
  5: 0.15,
};

// =============================================================================
// OFFICE
// =============================================================================

export const OFFICE_COSTS: Record<OfficeTier, number> = {
  home: 0,
  coworking: 200,
  small: 500,
  professional: 1500,
  hq: 4000,
};

export const OFFICE_MAX_EMPLOYEES: Record<OfficeTier, number> = {
  home: 0,
  coworking: 1,
  small: 3,
  professional: 6,
  hq: 12,
};

export const OFFICE_QUALITY_BONUS: Record<OfficeTier, number> = {
  home: 0,
  coworking: 0.05,
  small: 0.10,
  professional: 0.15,
  hq: 0.20,
};

// =============================================================================
// EMPLOYEES
// =============================================================================

export const EMPLOYEE_SALARY_RANGES: Record<AgencyEmployeeRole, [number, number]> = {
  scout: [500, 2000],
  analyst: [400, 1500],
  administrator: [300, 1000],
  relationshipManager: [600, 2500],
};

export const INSURANCE_PER_EMPLOYEE = 50;

// =============================================================================
// REPORT MARKETPLACE
// =============================================================================

export const REPORT_BASE_PRICES: Record<ConvictionLevel, [number, number]> = {
  note: [100, 200],
  recommend: [400, 800],
  strongRecommend: [1200, 2000],
  tablePound: [3000, 5000],
};

export const MAX_LISTING_AGE_WEEKS = 8;

// =============================================================================
// PLACEMENT FEES
// =============================================================================

export const PLACEMENT_FEE_BASE_RATE = 0.02; // 2% of transfer fee
export const YOUTH_PLACEMENT_FEE_BASE = 1000;
export const YOUTH_PLACEMENT_FEE_PER_REP = 90;
export const STALE_REPORT_THRESHOLD_WEEKS = 26;

export const PLACEMENT_FEE_CONVICTION_MULTIPLIER: Record<ConvictionLevel, number> = {
  note: 0.5,
  recommend: 1.0,
  strongRecommend: 1.5,
  tablePound: 2.0,
};

export const SELL_ON_RATES: Record<ConvictionLevel, number> = {
  note: 0.001,
  recommend: 0.002,
  strongRecommend: 0.003,
  tablePound: 0.005,
};

// =============================================================================
// RETAINERS
// =============================================================================

export const RETAINER_FEES: Record<1 | 2 | 3 | 4, [number, number]> = {
  1: [500, 1000],
  2: [1500, 3000],
  3: [4000, 8000],
  4: [10000, 20000],
};

export const RETAINER_REQUIRED_REPORTS: Record<1 | 2 | 3 | 4, number> = {
  1: 2,
  2: 3,
  3: 5,
  4: 7,
};

export const MAX_RETAINERS_BY_TIER: Record<IndependentTier, number> = {
  1: 0,
  2: 1,
  3: 3,
  4: 6,
  5: 99,
};

// =============================================================================
// CLUB BONUSES
// =============================================================================

export const PERFORMANCE_BONUS_BASE: Record<CareerTier, number> = {
  1: 0,
  2: 500,
  3: 2000,
  4: 5000,
  5: 10000,
};

export const SIGNING_BONUS: Record<CareerTier, number> = {
  1: 0,
  2: 0,
  3: 2000,
  4: 5000,
  5: 10000,
};

export const DISCOVERY_BONUS_BASE: Record<CareerTier, number> = {
  1: 0,
  2: 500,
  3: 1000,
  4: 1500,
  5: 2000,
};

export const DEPARTMENT_BONUS_PER_SIGNING: Record<4 | 5, number> = {
  4: 5000,
  5: 10000,
};

export const DEPARTMENT_BONUS_MAX: Record<4 | 5, number> = {
  4: 15000,
  5: 25000,
};

// =============================================================================
// LOANS
// =============================================================================

export const LOAN_CONFIGS: Record<LoanType, { maxAmount: number; monthlyInterestRate: number; termMonths: number }> = {
  business: { maxAmount: 20000, monthlyInterestRate: 0.05, termMonths: 12 },
  equipment: { maxAmount: 10000, monthlyInterestRate: 0.10, termMonths: 6 },
  emergency: { maxAmount: 2000, monthlyInterestRate: 0.08, termMonths: 4 },
};

// =============================================================================
// CONSULTING
// =============================================================================

export const CONSULTING_FEES: Record<ConsultingType, [number, number]> = {
  transferAdvisory: [5000, 25000],
  youthAudit: [3000, 10000],
  dataPackage: [2000, 8000],
  talentWorkshop: [4000, 15000],
};

export const CONSULTING_DURATION_WEEKS: Record<ConsultingType, number> = {
  transferAdvisory: 4,
  youthAudit: 6,
  dataPackage: 3,
  talentWorkshop: 2,
};

// =============================================================================
// COURSES
// =============================================================================

export const COURSE_TIER_GATES: Record<CareerTier, string | null> = {
  1: null,
  2: null,
  3: null,
  4: "fa_level_3",
  5: "uefa_a",
};

// =============================================================================
// MARKET
// =============================================================================

export const MARKET_TEMPERATURE_MULTIPLIER = {
  cold: 0.7,
  normal: 1.0,
  hot: 1.3,
  deadline: 1.8,
} as const;

export const ECONOMIC_EVENT_CHANCE_PER_WEEK = 0.05;
export const MAX_CONCURRENT_EVENTS = 2;

// =============================================================================
// GENERAL
// =============================================================================

export const STARTING_BALANCE = 500;
export const BROKE_THRESHOLD = -500;

export const INDEPENDENT_TIER_REQUIREMENTS: Record<IndependentTier, {
  minReputation: number;
  minBalance: number;
  minReportsSubmitted: number;
  minRetainers: number;
  minEmployees: number;
}> = {
  1: { minReputation: 0, minBalance: 0, minReportsSubmitted: 0, minRetainers: 0, minEmployees: 0 },
  2: { minReputation: 20, minBalance: 1000, minReportsSubmitted: 5, minRetainers: 0, minEmployees: 0 },
  3: { minReputation: 40, minBalance: 5000, minReportsSubmitted: 20, minRetainers: 1, minEmployees: 0 },
  4: { minReputation: 60, minBalance: 15000, minReportsSubmitted: 50, minRetainers: 3, minEmployees: 1 },
  5: { minReputation: 80, minBalance: 50000, minReportsSubmitted: 100, minRetainers: 5, minEmployees: 3 },
};
