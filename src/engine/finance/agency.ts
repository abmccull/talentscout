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
import { generateEmployeeSkills, deriveQuality, computeSalaryFromSkills, processSkillXp, processTrainingWeek } from "./employeeSkills";

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
export const SALARY_BY_ROLE: Record<AgencyEmployeeRole, [number, number]> = {
  scout: [500, 2000],
  analyst: [400, 1500],
  administrator: [300, 1000],
  relationshipManager: [600, 2500],
  mentee: [200, 600],
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
  week?: number,
  season?: number,
  regions?: string[],
): FinancialRecord | null {
  // Check office capacity
  if (finances.employees.length >= finances.office.maxEmployees) return null;

  const skills = generateEmployeeSkills(rng, role);
  const quality = deriveQuality(skills);
  const salary = computeSalaryFromSkills(skills, role);

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
    hiredWeek: week ?? 1,
    hiredSeason: season ?? 1,
    regionSpecialization: role === "scout" && regions && regions.length > 0 ? rng.pick(regions) : undefined,
    positionSpecialization: undefined,
    reportsGenerated: [],
    currentAssignment: undefined,
    experience: 0,
    weeklyLog: [],
    regionFocusWeeks: 0,
    skills,
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
 * XP thresholds at which an employee's quality increases by 1 point.
 * Ten milestones covering the full journey from quality 3 to 13+.
 */
const QUALITY_THRESHOLDS = [50, 120, 210, 320, 450, 600, 780, 990, 1230, 1500];

/**
 * Process one week of employee activity. Updates morale, fatigue, XP, quality.
 * Handles on-leave tracking, resignation checks, and region-focus accumulation.
 * Actual report generation happens in employeeWork.ts where world state is available.
 */
export function processEmployeeWeek(
  rng: RNG,
  finances: FinancialRecord,
): FinancialRecord {
  if (finances.employees.length === 0) return finances;

  const resignations: string[] = [];

  const updatedEmployees = finances.employees.map((emp) => {
    // Handle on-leave employees
    if (emp.onLeave) {
      if (emp.leaveReturnWeek !== undefined && emp.leaveReturnWeek <= 0) {
        return { ...emp, onLeave: false, leaveReturnWeek: undefined };
      }
      return { ...emp, leaveReturnWeek: (emp.leaveReturnWeek ?? 1) - 1 };
    }

    // Fatigue recovery (base -5, offset by noise)
    let newFatigue = Math.max(0, emp.fatigue - 5 + rng.nextInt(0, 3));

    // Morale calculation
    let moraleDelta = 0;
    // Base drift toward 60
    moraleDelta += emp.morale > 60 ? -1 : emp.morale < 60 ? 1 : 0;
    // Overwork penalty
    if (emp.fatigue > 70) moraleDelta -= 3;
    // Good office bonus
    if (finances.office.tier === "professional" || finances.office.tier === "hq") moraleDelta += 1;
    // Idle penalty
    if (!emp.currentAssignment || emp.currentAssignment.type === "idle") {
      moraleDelta -= 2;
    }
    // Random noise
    moraleDelta += rng.nextInt(-1, 1);

    const newMorale = Math.max(5, Math.min(100, emp.morale + moraleDelta));

    // Fatigue consequences
    if (newFatigue > 80 && rng.chance(0.05)) {
      // Sick leave — skip remaining processing
      return { ...emp, fatigue: newFatigue, morale: newMorale, onLeave: true, leaveReturnWeek: 2 };
    }
    if (newFatigue > 90 && rng.chance(0.10)) {
      resignations.push(emp.id);
      return emp;
    }

    // Morale consequences
    if (newMorale < 20 && rng.chance(0.03)) {
      resignations.push(emp.id);
      return emp;
    }
    if (newMorale < 10 && rng.chance(0.10)) {
      resignations.push(emp.id);
      return emp;
    }

    // Experience accumulation (only if actively working)
    let newExp = emp.experience;
    if (emp.currentAssignment && emp.currentAssignment.type !== "idle") {
      newExp += Math.round(5 + emp.quality * 0.5 + (emp.morale / 100) * 3);
    }

    // Quality improvement at XP thresholds (max quality 20)
    let newQuality = emp.quality;
    for (const threshold of QUALITY_THRESHOLDS) {
      if (emp.experience < threshold && newExp >= threshold && newQuality < 20) {
        newQuality++;
        break;
      }
    }

    // Region focus tracking for scouts
    let regionFocusWeeks = emp.regionFocusWeeks;
    if (
      emp.role === "scout" &&
      emp.currentAssignment?.type === "scoutRegion" &&
      emp.currentAssignment.targetRegion === emp.regionSpecialization
    ) {
      regionFocusWeeks++;
    } else {
      regionFocusWeeks = 0;
    }

    // Work fatigue from active assignments
    if (emp.currentAssignment && emp.currentAssignment.type !== "idle") {
      newFatigue = Math.min(100, newFatigue + rng.nextInt(3, 8));
    }

    let result: AgencyEmployee = { ...emp, fatigue: newFatigue, morale: newMorale, experience: newExp, quality: newQuality, regionFocusWeeks };
    // Process per-skill XP for employees with skills
    result = processSkillXp(rng, result);
    return result;
  });

  // Remove resigned employees
  const remaining = updatedEmployees.filter((e) => !resignations.includes(e.id));

  // Process training countdown for all employees
  let financesWithRemaining: FinancialRecord = { ...finances, employees: remaining };
  financesWithRemaining = processTrainingWeek(financesWithRemaining);
  return financesWithRemaining;
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
