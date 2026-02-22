/**
 * Agency management — independent tier 3+ hire employees, upgrade offices.
 * Employees generate reports and revenue autonomously.
 */

import type { RNG } from "../rng/index";
import type {
  FinancialRecord,
  AgencyEmployee,
  AgencyEmployeeRole,
  Office,
  OfficeTier,
} from "../core/types";

// ---------------------------------------------------------------------------
// Office tiers
// ---------------------------------------------------------------------------

const OFFICE_CONFIGS: Record<OfficeTier, Office> = {
  home: { tier: "home", monthlyCost: 0, qualityBonus: 0, maxEmployees: 0 },
  coworking: { tier: "coworking", monthlyCost: 200, qualityBonus: 0.05, maxEmployees: 1 },
  small: { tier: "small", monthlyCost: 500, qualityBonus: 0.10, maxEmployees: 3 },
  professional: { tier: "professional", monthlyCost: 1500, qualityBonus: 0.15, maxEmployees: 6 },
  hq: { tier: "hq", monthlyCost: 4000, qualityBonus: 0.20, maxEmployees: 12 },
};

export const OFFICE_TIERS = OFFICE_CONFIGS;

// ---------------------------------------------------------------------------
// Office management
// ---------------------------------------------------------------------------

/**
 * Upgrade to a new office tier. Returns null if can't afford first month.
 */
export function upgradeOffice(
  finances: FinancialRecord,
  newTier: OfficeTier,
): FinancialRecord | null {
  const newOffice = OFFICE_CONFIGS[newTier];

  // Can't downgrade check is left to UI; engine allows any tier change
  if (finances.balance < newOffice.monthlyCost) return null;

  return {
    ...finances,
    office: newOffice,
  };
}

// ---------------------------------------------------------------------------
// Employee management
// ---------------------------------------------------------------------------

/** Salary ranges by role */
const SALARY_BY_ROLE: Record<AgencyEmployeeRole, [number, number]> = {
  scout: [500, 2000],
  analyst: [400, 1500],
  administrator: [300, 1000],
  relationshipManager: [600, 2500],
};

/** First names pool for generated employees */
const FIRST_NAMES = [
  "James", "Maria", "David", "Sophie", "Marco", "Elena",
  "Carlos", "Anna", "Pierre", "Yuki", "Ahmed", "Ingrid",
  "Luis", "Sarah", "Dmitri", "Fatima", "Henrik", "Chiara",
];
const LAST_NAMES = [
  "Smith", "Garcia", "Mueller", "Rossi", "Martin", "Silva",
  "Chen", "Patel", "Kim", "Johansson", "Ali", "Dubois",
  "Santos", "Williams", "Petrov", "Tanaka", "Berg", "Costa",
];

/**
 * Hire a new employee. Returns null if at office capacity.
 */
export function hireEmployee(
  rng: RNG,
  finances: FinancialRecord,
  role: AgencyEmployeeRole,
): FinancialRecord | null {
  // Check office capacity
  if (finances.employees.length >= finances.office.maxEmployees) return null;

  const [minSalary, maxSalary] = SALARY_BY_ROLE[role];
  const quality = rng.nextInt(3, 15); // 1-20 scale, weighted toward average
  const salary = Math.round(minSalary + (quality / 20) * (maxSalary - minSalary));

  const firstName = rng.pick(FIRST_NAMES);
  const lastName = rng.pick(LAST_NAMES);

  const employee: AgencyEmployee = {
    id: `emp_${Date.now()}_${rng.nextInt(1000, 9999)}`,
    name: `${firstName} ${lastName}`,
    role,
    quality,
    salary,
    morale: 70,
    fatigue: 0,
  };

  return {
    ...finances,
    employees: [...finances.employees, employee],
  };
}

/**
 * Fire an employee by ID.
 */
export function fireEmployee(
  finances: FinancialRecord,
  employeeId: string,
): FinancialRecord {
  return {
    ...finances,
    employees: finances.employees.filter((e) => e.id !== employeeId),
  };
}

// ---------------------------------------------------------------------------
// Weekly processing
// ---------------------------------------------------------------------------

/**
 * Process one week of employee activity. Updates morale and fatigue.
 * Actual report generation happens in the game loop where world state is available.
 */
export function processEmployeeWeek(
  rng: RNG,
  finances: FinancialRecord,
): FinancialRecord {
  if (finances.employees.length === 0) return finances;

  const updatedEmployees = finances.employees.map((emp) => {
    // Fatigue naturally recovers
    const newFatigue = Math.max(0, emp.fatigue - 5 + rng.nextInt(0, 3));

    // Morale drifts toward 60 (neutral) with random variation
    const moraleDrift = emp.morale > 60 ? -1 : emp.morale < 60 ? 1 : 0;
    const moraleNoise = rng.nextInt(-2, 2);
    const newMorale = Math.max(10, Math.min(100, emp.morale + moraleDrift + moraleNoise));

    return { ...emp, fatigue: newFatigue, morale: newMorale };
  });

  return { ...finances, employees: updatedEmployees };
}

// ---------------------------------------------------------------------------
// Overhead calculation
// ---------------------------------------------------------------------------

/**
 * Calculate total agency overhead (monthly).
 */
export function calculateAgencyOverhead(finances: FinancialRecord): number {
  const officeCost = finances.office.monthlyCost;
  const salaries = finances.employees.reduce((sum, e) => sum + e.salary, 0);
  const insurance = finances.employees.length > 0
    ? Math.round(finances.employees.length * 50)
    : 0;

  return officeCost + salaries + insurance;
}
