/**
 * Explainable agency employee compensation and retention economics.
 *
 * Contract values are derived exclusively from information already visible to
 * the player: role, quality, experience, and the agency scout's reputation.
 * Keeping the formula here gives hiring, renegotiation, weekly simulation,
 * poaching, payroll, UI copy, and save migration one source of truth.
 */

import type {
  AgencyEmployee,
  AgencyEmployeeRole,
  FinancialRecord,
} from "../core/types";

export type EmployeePayPosition = "underMarket" | "fair" | "premium";

export interface EmployeeSalaryBand {
  minimum: number;
  fairMinimum: number;
  marketRate: number;
  fairMaximum: number;
  maximum: number;
  factors: {
    roleBase: number;
    qualityMultiplier: number;
    experienceMultiplier: number;
    reputationMultiplier: number;
  };
}

export interface EmployeePayEffects {
  position: EmployeePayPosition;
  payRatio: number;
  satisfactionTarget: number;
  weeklyMoraleDelta: number;
  retentionRisk: number;
  poachingChance: number;
  performanceMultiplier: number;
}

const ROLE_MARKET_BASE: Record<AgencyEmployeeRole, number> = {
  scout: 1_050,
  analyst: 850,
  administrator: 600,
  relationshipManager: 1_250,
  mentee: 375,
};

const PAYROLL_ROUNDING = 25;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundSalary(value: number): number {
  return Math.round(value / PAYROLL_ROUNDING) * PAYROLL_ROUNDING;
}

/**
 * Return the allowed and fair monthly salary band for an employee.
 *
 * Formula (all components are visible in the agency workspace):
 * - role establishes the base market rate;
 * - quality moves the rate from 75% at 1/20 to 140% at 20/20;
 * - experience adds up to 18% over the first 1,500 XP;
 * - agency reputation moves demand by at most +/-5%.
 */
export function getEmployeeSalaryBand(
  employee: Pick<AgencyEmployee, "role" | "quality" | "experience">,
  employerReputation = 50,
): EmployeeSalaryBand {
  const quality = clamp(
    Number.isFinite(employee.quality) ? employee.quality : 1,
    1,
    20,
  );
  const experience = clamp(
    Number.isFinite(employee.experience) ? employee.experience : 0,
    0,
    1_500,
  );
  const reputation = clamp(
    Number.isFinite(employerReputation) ? employerReputation : 50,
    0,
    100,
  );
  const roleBase = ROLE_MARKET_BASE[employee.role];
  const qualityMultiplier = 0.72 + (quality / 20) * 0.68;
  const experienceMultiplier = 1 + (experience / 1_500) * 0.18;
  const reputationMultiplier = 0.95 + (reputation / 100) * 0.1;
  const marketRate = Math.max(
    PAYROLL_ROUNDING,
    roundSalary(
      roleBase
      * qualityMultiplier
      * experienceMultiplier
      * reputationMultiplier,
    ),
  );
  const minimum = Math.max(PAYROLL_ROUNDING, roundSalary(marketRate * 0.8));
  const fairMinimum = Math.max(minimum, roundSalary(marketRate * 0.95));
  const fairMaximum = Math.max(fairMinimum, roundSalary(marketRate * 1.1));
  const maximum = Math.max(fairMaximum, roundSalary(marketRate * 1.35));

  return {
    minimum,
    fairMinimum,
    marketRate,
    fairMaximum,
    maximum,
    factors: {
      roleBase,
      qualityMultiplier,
      experienceMultiplier,
      reputationMultiplier,
    },
  };
}

export function getEmployeePayPosition(
  salary: number,
  band: EmployeeSalaryBand,
): EmployeePayPosition {
  if (salary < band.fairMinimum) return "underMarket";
  if (salary <= band.fairMaximum) return "fair";
  return "premium";
}

/**
 * Translate salary position into bounded weekly consequences.
 *
 * Under-market contracts preserve cash but damage satisfaction, output, and
 * retention. Fair contracts are stable. Premium contracts improve retention
 * and output modestly, but the final gains are deliberately capped so paying
 * the maximum is not an automatic best choice.
 */
export function getEmployeePayEffects(
  employee: AgencyEmployee,
  employerReputation = 50,
): EmployeePayEffects {
  const band = getEmployeeSalaryBand(employee, employerReputation);
  const allowedSalary = clamp(
    Number.isFinite(employee.salary) ? employee.salary : band.marketRate,
    band.minimum,
    band.maximum,
  );
  const payRatio = allowedSalary / band.marketRate;
  const position = getEmployeePayPosition(allowedSalary, band);
  const satisfaction = clamp(
    Number.isFinite(employee.paySatisfaction) ? employee.paySatisfaction! : 65,
    0,
    100,
  );

  if (position === "underMarket") {
    const underpaymentSeverity = clamp(
      (band.fairMinimum - allowedSalary) / Math.max(1, band.fairMinimum - band.minimum),
      0,
      1,
    );
    return {
      position,
      payRatio,
      satisfactionTarget: Math.round(48 - underpaymentSeverity * 23),
      weeklyMoraleDelta: underpaymentSeverity >= 0.5 ? -2 : -1,
      retentionRisk: clamp(
        0.01 + underpaymentSeverity * 0.08 + Math.max(0, 25 - satisfaction) * 0.002,
        0.01,
        0.15,
      ),
      poachingChance: clamp(0.02 + underpaymentSeverity * 0.07, 0.02, 0.1),
      performanceMultiplier: clamp(0.88 + satisfaction * 0.0012, 0.88, 1),
    };
  }

  if (position === "premium") {
    const premiumStrength = clamp(
      (allowedSalary - band.fairMaximum) / Math.max(1, band.maximum - band.fairMaximum),
      0,
      1,
    );
    return {
      position,
      payRatio,
      satisfactionTarget: Math.round(78 + premiumStrength * 10),
      weeklyMoraleDelta: 1,
      retentionRisk: clamp(0.006 - premiumStrength * 0.004, 0.002, 0.006),
      poachingChance: clamp(0.012 - premiumStrength * 0.008, 0.004, 0.012),
      performanceMultiplier: clamp(1.01 + premiumStrength * 0.03, 1.01, 1.04),
    };
  }

  return {
    position,
    payRatio,
    satisfactionTarget: 68,
    weeklyMoraleDelta: 0,
    retentionRisk: satisfaction < 25 ? 0.015 : 0.005,
    poachingChance: 0.018,
    performanceMultiplier: clamp(0.96 + satisfaction * 0.0006, 0.96, 1.02),
  };
}

/** Move salary satisfaction toward its pay-position target by a bounded step. */
export function processEmployeePaySatisfaction(
  employee: AgencyEmployee,
  employerReputation = 50,
): AgencyEmployee {
  const effects = getEmployeePayEffects(employee, employerReputation);
  const current = clamp(
    Number.isFinite(employee.paySatisfaction) ? employee.paySatisfaction! : 65,
    0,
    100,
  );
  const step = effects.position === "underMarket" ? 3 : 2;
  const next = current < effects.satisfactionTarget
    ? Math.min(effects.satisfactionTarget, current + step)
    : Math.max(effects.satisfactionTarget, current - step);
  return { ...employee, paySatisfaction: clamp(next, 0, 100) };
}

export interface NormalizedEmployeeContract {
  employee: AgencyEmployee;
  salaryChanged: boolean;
  previousSalary: number;
  band: EmployeeSalaryBand;
}

/**
 * Repair tampered or legacy contracts without randomness.
 * Valid salaries are preserved; only non-finite/out-of-band values are moved
 * to the nearest allowed boundary. Missing satisfaction receives a deterministic
 * default based on the repaired pay position.
 */
export function normalizeEmployeeContract(
  employee: AgencyEmployee,
  employerReputation = 50,
): NormalizedEmployeeContract {
  const band = getEmployeeSalaryBand(employee, employerReputation);
  const previousSalary = employee.salary;
  const finiteSalary = Number.isFinite(previousSalary)
    ? roundSalary(previousSalary)
    : band.marketRate;
  const salary = clamp(finiteSalary, band.minimum, band.maximum);
  const position = getEmployeePayPosition(salary, band);
  const defaultSatisfaction = position === "underMarket" ? 45 : position === "premium" ? 80 : 68;
  const paySatisfaction = clamp(
    Number.isFinite(employee.paySatisfaction)
      ? employee.paySatisfaction!
      : defaultSatisfaction,
    0,
    100,
  );

  return {
    employee: { ...employee, salary, paySatisfaction },
    salaryChanged: salary !== previousSalary,
    previousSalary,
    band,
  };
}

/** Normalize every contract and record each repaired wage agreement once. */
export function normalizeEmployeeContractsInRecord(
  finances: FinancialRecord,
  employerReputation = 50,
  week = 0,
  season = 1,
): FinancialRecord {
  if (finances.employees.length === 0) return finances;

  const normalized = finances.employees.map((employee) =>
    normalizeEmployeeContract(employee, employerReputation),
  );
  const changed = normalized.filter((result) => result.salaryChanged);
  const satisfactionMissing = finances.employees.some(
    (employee) => !Number.isFinite(employee.paySatisfaction),
  );
  if (changed.length === 0 && !satisfactionMissing) return finances;

  return {
    ...finances,
    employees: normalized.map((result) => result.employee),
    transactions: [
      ...finances.transactions,
      ...changed.map((result) => ({
        week,
        season,
        amount: 0,
        description: `Contract normalized: ${result.employee.name} from £${Number.isFinite(result.previousSalary) ? result.previousSalary : "invalid"} to £${result.employee.salary}/mo`,
        referenceId: `employee-contract-normalized:${result.employee.id}`,
      })),
    ],
  };
}

/**
 * Apply a player-requested salary change when it is inside the visible band.
 * Invalid, negative, and out-of-band offers fail closed without state changes.
 */
export function renegotiateEmployeeSalary(
  finances: FinancialRecord,
  employeeId: string,
  requestedSalary: number,
  employerReputation: number,
  week: number,
  season: number,
): FinancialRecord {
  const employee = finances.employees.find((candidate) => candidate.id === employeeId);
  if (!employee || !Number.isFinite(requestedSalary)) return finances;

  const band = getEmployeeSalaryBand(employee, employerReputation);
  const salary = roundSalary(requestedSalary);
  if (salary < band.minimum || salary > band.maximum || salary <= 0) return finances;
  if (salary === employee.salary) return finances;

  const priorSatisfaction = clamp(
    Number.isFinite(employee.paySatisfaction) ? employee.paySatisfaction! : 65,
    0,
    100,
  );
  const satisfactionChange = salary > employee.salary ? 6 : -6;

  return {
    ...finances,
    employees: finances.employees.map((candidate) =>
      candidate.id === employeeId
        ? {
            ...candidate,
            salary,
            paySatisfaction: clamp(priorSatisfaction + satisfactionChange, 0, 100),
          }
        : candidate,
    ),
    transactions: [
      ...finances.transactions,
      {
        week,
        season,
        amount: 0,
        description: `Salary agreement: ${employee.name} £${employee.salary} to £${salary}/mo`,
        referenceId: `employee-salary-change:${employee.id}:s${season}w${week}:${finances.transactions.length}`,
      },
    ],
  };
}
