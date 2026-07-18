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
  Scout,
} from "../core/types";
import { generateEmployeeSkills, deriveQuality, computeSalaryFromSkills, processSkillXp, processTrainingWeek } from "./employeeSkills";
import {
  getEmployeePayEffects,
  getEmployeeSalaryBand,
  normalizeEmployeeContract,
  normalizeEmployeeContractsInRecord,
  processEmployeePaySatisfaction,
} from "./employeeEconomics";
import { calculateAgencyHealth } from "./dashboard";
import {
  getAgencyClientConcentration,
} from "./agencyCapacity";
import {
  getAgencyOperatingPolicyDefinition,
  normalizeAgencyStrategyState,
  type AgencyOperatingPolicy,
} from "./agencyStrategyState";

export type AgencyStrategicHealthStatus =
  | "resilient"
  | "stable"
  | "stretched"
  | "fragile"
  | "critical";

export type AgencyStrategicFailureMode =
  | "cashRunway"
  | "pipelineGap"
  | "clientShock"
  | "deliveryFailure"
  | "reputationSpiral";

export interface AgencyStrategicHealth {
  score: number;
  status: AgencyStrategicHealthStatus;
  policy: AgencyOperatingPolicy;
  runwayMonths: number | null;
  cashRunwayRisk: number;
  activeClientCount: number;
  dominantClientId?: string;
  clientConcentration: number;
  clientConcentrationRisk: number;
  qualityDebt: number;
  reputationExposure: number;
  rawMonthlyCapacity: number;
  effectiveMonthlyCapacity: number;
  committedWork: number;
  pressurePoints: string[];
  strengths: string[];
  failureModes: AgencyStrategicFailureMode[];
  recommendedPolicy: AgencyOperatingPolicy;
  seniorAgencyReady: boolean;
  promotionBlockers: string[];
}

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function agencyTier(scout: Scout, finances: FinancialRecord): number {
  return Math.max(
    scout.careerTier,
    scout.independentTier ?? 1,
    finances.independentTier ?? 1,
  );
}

export function isAgencyCareer(
  scout: Scout,
  finances: FinancialRecord,
): boolean {
  return scout.careerPath === "independent"
    && finances.careerPath === "independent"
    && agencyTier(scout, finances) >= 3;
}

function runwayRisk(runwayMonths: number | null): number {
  if (runwayMonths === null || runwayMonths >= 12) return 0;
  if (runwayMonths >= 6) return Math.round((12 - runwayMonths) * (25 / 6));
  if (runwayMonths >= 3) return Math.round(25 + (6 - runwayMonths) * 10);
  if (runwayMonths >= 1) return Math.round(55 + (3 - runwayMonths) * 15);
  return Math.round(85 + (1 - Math.max(0, runwayMonths)) * 15);
}

function concentrationRisk(dominantShare: number, activeClients: number): number {
  if (activeClients === 0) return 0;
  if (activeClients === 1) return 100;
  if (dominantShare <= 0.4) return 0;
  if (dominantShare <= 0.7) return Math.round(((dominantShare - 0.4) / 0.3) * 60);
  return Math.round(60 + ((dominantShare - 0.7) / 0.3) * 40);
}

function utilizationRisk(utilization: number): number {
  if (utilization <= 0.7) return 0;
  if (utilization <= 0.9) return Math.round(((utilization - 0.7) / 0.2) * 25);
  if (utilization <= 1) return Math.round(25 + ((utilization - 0.9) / 0.1) * 25);
  if (utilization <= 1.25) return Math.round(50 + ((utilization - 1) / 0.25) * 30);
  return Math.round(Math.min(100, 80 + (utilization - 1.25) * 40));
}

function average(numbers: number[], fallback = 0): number {
  return numbers.length > 0
    ? numbers.reduce((total, value) => total + value, 0) / numbers.length
    : fallback;
}

function deriveQualityDebt(
  finances: FinancialRecord,
  rawCapacity: number,
  committedWork: number,
  policy: AgencyOperatingPolicy,
): number {
  const activeEmployees = finances.employees.filter((employee) => !employee.onLeave);
  const rawUtilization = rawCapacity > 0 ? committedWork / rawCapacity : committedWork > 0 ? 2 : 0;
  const fatigueRisk = average(activeEmployees.map((employee) => employee.fatigue));
  const peopleConfidence = average(
    activeEmployees.map((employee) => (
      employee.morale + (employee.paySatisfaction ?? 65)
    ) / 2),
    75,
  );
  const peopleRisk = 100 - peopleConfidence;
  const awaitingReview = (finances.staffWorkProducts ?? []).filter(
    (product) => product.status === "awaitingReview",
  );
  const reviewDebtRisk = rawCapacity > 0
    ? Math.min(100, (awaitingReview.length / rawCapacity) * 100)
    : awaitingReview.length > 0 ? 100 : 0;
  const explicitReviewDebt = awaitingReview.reduce(
    (total, product) => total + Math.max(0, product.reviewDebtPenalty ?? 0),
    0,
  );
  const activeRetainers = (finances.retainerContracts ?? []).filter(
    (contract) => contract.status === "active" || contract.status === "suspended",
  );
  const missedPeriods = activeRetainers.reduce(
    (total, contract) => total + (contract.consecutivePeriodsMissed ?? 0),
    0,
  );
  const deliveryRisk = activeRetainers.length > 0
    ? Math.min(100, (missedPeriods / activeRetainers.length) * 35)
    : 0;
  const baseDebt = utilizationRisk(rawUtilization) * 0.4
    + fatigueRisk * 0.2
    + peopleRisk * 0.15
    + reviewDebtRisk * 0.15
    + deliveryRisk * 0.1
    + Math.min(15, explicitReviewDebt);
  const policyDefinition = getAgencyOperatingPolicyDefinition(policy);
  return Math.round(clamp(
    baseDebt + policyDefinition.qualityDebtAdjustment,
  ));
}

function recommendPosture(input: {
  cashRunwayRisk: number;
  clientConcentrationRisk: number;
  qualityDebt: number;
  reputationExposure: number;
  activeClientCount: number;
  rawUtilization: number;
}): AgencyOperatingPolicy {
  if (input.cashRunwayRisk >= 55) return "runwayDefense";
  if (input.qualityDebt >= 55 || input.reputationExposure >= 70) return "qualityDiscipline";
  if (input.activeClientCount > 0 && input.clientConcentrationRisk >= 55) {
    return "clientDiversification";
  }
  if (
    input.activeClientCount >= 2
    && input.rawUtilization <= 0.7
    && input.reputationExposure <= 35
  ) return "marketExpansion";
  return "balancedBook";
}

/**
 * Strategic health composes the canonical cash-flow/runway calculation with
 * grouped client exposure and delivery pressure. It stores no parallel totals.
 */
export function deriveAgencyStrategicHealth(
  finances: FinancialRecord,
  scout: Scout,
): AgencyStrategicHealth {
  const operatingHealth = calculateAgencyHealth(finances, scout);
  const policy = operatingHealth.capacity.policy;
  const policyDefinition = getAgencyOperatingPolicyDefinition(policy);
  const concentration = getAgencyClientConcentration(finances);
  const cashRunwayRisk = runwayRisk(operatingHealth.runwayMonths);
  const clientConcentrationRisk = concentrationRisk(
    concentration.dominantShare,
    concentration.activeClientCount,
  );
  const qualityDebt = deriveQualityDebt(
    finances,
    operatingHealth.capacity.rawMonthlyReportCapacity,
    operatingHealth.capacity.committedReportWork,
    policy,
  );
  const activeClientIds = new Set(Object.keys(concentration.valueByClient));
  const activeRelationships = finances.clientRelationships.filter(
    (relationship) => activeClientIds.has(relationship.clubId),
  );
  const satisfactionRisk = 100 - average(
    activeRelationships.map((relationship) => relationship.satisfaction),
    activeClientIds.size > 0 ? 65 : 75,
  );
  const failureRisk = Math.min(
    100,
    (finances.failedContractCount ?? 0) * 20
      + (finances.blacklistedClubs?.length ?? 0) * 15,
  );
  const reputationExposure = Math.round(clamp(
    qualityDebt * 0.45
      + clientConcentrationRisk * 0.25
      + satisfactionRisk * 0.2
      + failureRisk * 0.1
      + policyDefinition.reputationExposureAdjustment,
  ));
  const pipelineRisk = concentration.activeClientCount === 0 ? 65 : 0;
  const totalRisk = cashRunwayRisk * 0.3
    + clientConcentrationRisk * 0.15
    + qualityDebt * 0.3
    + reputationExposure * 0.2
    + pipelineRisk * 0.05;
  const score = Math.round(clamp(100 - totalRisk));
  const status: AgencyStrategicHealthStatus = score >= 80
    ? "resilient"
    : score >= 65
      ? "stable"
      : score >= 50
        ? "stretched"
        : score >= 35
          ? "fragile"
          : "critical";

  const pressurePoints: string[] = [];
  const strengths: string[] = [];
  const failureModes: AgencyStrategicFailureMode[] = [];
  if (cashRunwayRisk >= 50) {
    pressurePoints.push("Cash runway cannot absorb a sustained operating loss.");
    failureModes.push("cashRunway");
  } else if (operatingHealth.runwayMonths === null || operatingHealth.runwayMonths >= 9) {
    strengths.push("The current book is not consuming the operating reserve.");
  }
  if (concentration.activeClientCount === 0) {
    pressurePoints.push("The agency has no active contracted client pipeline.");
    failureModes.push("pipelineGap");
  } else if (clientConcentrationRisk >= 55) {
    pressurePoints.push("One client can destabilize revenue and market credibility.");
    failureModes.push("clientShock");
  } else if (concentration.activeClientCount >= 3) {
    strengths.push("Contracted demand is spread across several clients.");
  }
  if (qualityDebt >= 55) {
    pressurePoints.push("Committed work is outrunning staff review and recovery capacity.");
    failureModes.push("deliveryFailure");
  } else {
    strengths.push("Workload remains inside a defensible delivery standard.");
  }
  if (reputationExposure >= 60) {
    pressurePoints.push("A delivery failure would now spill across the agency's client book.");
    failureModes.push("reputationSpiral");
  } else {
    strengths.push("Current delivery risk is unlikely to damage the wider agency name.");
  }

  const promotionBlockers: string[] = [];
  if (status === "fragile" || status === "critical") {
    promotionBlockers.push("Agency strategy is too fragile for a larger operating mandate.");
  }
  if (operatingHealth.runwayMonths !== null && operatingHealth.runwayMonths < 3) {
    promotionBlockers.push("Fewer than three months of cash runway remain.");
  }
  if (qualityDebt >= 75) {
    promotionBlockers.push("Delivery quality debt is already at failure risk.");
  }
  if (reputationExposure >= 80) {
    promotionBlockers.push("Reputation exposure is too high to scale responsibly.");
  }
  if (concentration.activeClientCount < 2) {
    promotionBlockers.push("A senior agency needs at least two active clients.");
  }

  const rawUtilization = operatingHealth.capacity.rawMonthlyReportCapacity > 0
    ? operatingHealth.capacity.committedReportWork
      / operatingHealth.capacity.rawMonthlyReportCapacity
    : 0;
  return {
    score,
    status,
    policy,
    runwayMonths: operatingHealth.runwayMonths,
    cashRunwayRisk,
    activeClientCount: concentration.activeClientCount,
    dominantClientId: concentration.dominantClientId,
    clientConcentration: concentration.dominantShare,
    clientConcentrationRisk,
    qualityDebt,
    reputationExposure,
    rawMonthlyCapacity: operatingHealth.capacity.rawMonthlyReportCapacity,
    effectiveMonthlyCapacity: operatingHealth.capacity.monthlyReportCapacity,
    committedWork: operatingHealth.capacity.committedReportWork,
    pressurePoints,
    strengths,
    failureModes: [...new Set(failureModes)],
    recommendedPolicy: recommendPosture({
      cashRunwayRisk,
      clientConcentrationRisk,
      qualityDebt,
      reputationExposure,
      activeClientCount: concentration.activeClientCount,
      rawUtilization,
    }),
    seniorAgencyReady: promotionBlockers.length === 0,
    promotionBlockers,
  };
}

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

  // Cash defence is a real operating constraint: the player can reduce fixed
  // costs, but cannot quietly add them while that posture is active.
  const currentPolicy = normalizeAgencyStrategyState(finances.agencyStrategyState)?.policy;
  const currentPolicyDefinition = currentPolicy
    ? getAgencyOperatingPolicyDefinition(currentPolicy)
    : undefined;
  if (currentPolicyDefinition?.blocksFixedCostGrowth && newOffice.monthlyCost > finances.office.monthlyCost) {
    return null;
  }

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
  actionSequence = (finances.actionSequence ?? 0) + 1,
  employerReputation = 50,
): FinancialRecord | null {
  // Check office capacity
  if (finances.employees.length >= finances.office.maxEmployees) return null;
  const currentPolicy = normalizeAgencyStrategyState(finances.agencyStrategyState)?.policy;
  if (currentPolicy && getAgencyOperatingPolicyDefinition(currentPolicy).blocksFixedCostGrowth) return null;

  const skills = generateEmployeeSkills(rng, role);
  const quality = deriveQuality(skills);
  const legacySalary = computeSalaryFromSkills(skills, role);

  const firstName = rng.pick(FIRST_NAMES);
  const lastName = rng.pick(LAST_NAMES);

  const employeeDraft: AgencyEmployee = {
    id: `emp_s${season ?? 1}w${week ?? 1}_a${actionSequence}`,
    name: `${firstName} ${lastName}`,
    role,
    quality,
    salary: legacySalary,
    paySatisfaction: 68,
    morale: 70,
    fatigue: 0,
    hiredWeek: week ?? 1,
    hiredSeason: season ?? 1,
    regionSpecialization: role === "scout" && regions && regions.length > 0 ? rng.pick(regions) : undefined,
    positionSpecialization: undefined,
    workProductsGenerated: [],
    currentAssignment: undefined,
    experience: 0,
    weeklyLog: [],
    regionFocusWeeks: 0,
    skills,
  };
  const band = getEmployeeSalaryBand(employeeDraft, employerReputation);
  const employee = { ...employeeDraft, salary: band.marketRate };

  return {
    ...finances,
    actionSequence: Math.max(finances.actionSequence ?? 0, actionSequence),
    employees: [...finances.employees, employee],
    transactions: [
      ...finances.transactions,
      {
        week: week ?? 1,
        season: season ?? 1,
        amount: 0,
        description: `Employee hired: ${employee.name}, ${employee.role}, £${employee.salary}/mo`,
        referenceId: `employee-hired:${employee.id}`,
      },
    ],
  };
}

/**
 * Fire an employee by ID.
 */
export function fireEmployee(
  finances: FinancialRecord,
  employeeId: string,
  week = 0,
  season = 1,
): FinancialRecord {
  const employee = finances.employees.find((candidate) => candidate.id === employeeId);
  if (!employee) return finances;
  return {
    ...finances,
    employees: finances.employees.filter((e) => e.id !== employeeId),
    satelliteOffices: finances.satelliteOffices.map((office) => ({
      ...office,
      employeeIds: office.employeeIds.filter((id) => id !== employeeId),
    })),
    transactions: [
      ...finances.transactions,
      {
        week,
        season,
        amount: 0,
        description: `Employee contract ended: ${employee.name} at £${employee.salary}/mo`,
        referenceId: `employee-fired:${employee.id}:s${season}w${week}`,
      },
    ],
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
  employerReputation = 50,
  week = 0,
  season = 1,
): FinancialRecord {
  if (finances.employees.length === 0) return finances;
  if (
    week > 0
    && finances.lastEmployeeEconomicsWeek?.week === week
    && finances.lastEmployeeEconomicsWeek.season === season
  ) {
    return finances;
  }

  const baseFinances = normalizeEmployeeContractsInRecord(
    finances,
    employerReputation,
    week,
    season,
  );
  const resignations: string[] = [];

  const updatedEmployees = baseFinances.employees.map((rawEmployee) => {
    const emp = processEmployeePaySatisfaction(rawEmployee, employerReputation);
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
    if (baseFinances.office.tier === "professional" || baseFinances.office.tier === "hq") moraleDelta += 1;
    // Compensation is a strategic tradeoff, not a cosmetic field.
    const payEffects = getEmployeePayEffects(emp, employerReputation);
    moraleDelta += payEffects.weeklyMoraleDelta;
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
    // Persistently dissatisfied employees can leave even before morale fully
    // collapses. Seeded RNG keeps this reproducible across save/reload.
    if (
      (emp.paySatisfaction ?? 65) <= 25
      && newMorale <= 40
      && rng.chance(payEffects.retentionRisk)
    ) {
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
      newFatigue = Math.min(
        100,
        newFatigue + rng.nextInt(3, 8),
      );
    }

    let result: AgencyEmployee = { ...emp, fatigue: newFatigue, morale: newMorale, experience: newExp, quality: newQuality, regionFocusWeeks };
    // Process per-skill XP for employees with skills
    result = processSkillXp(rng, result);
    return result;
  });

  // Remove resigned employees
  const remaining = updatedEmployees.filter((e) => !resignations.includes(e.id));

  // Process training countdown for all employees
  let financesWithRemaining: FinancialRecord = {
    ...baseFinances,
    employees: remaining,
    satelliteOffices: baseFinances.satelliteOffices.map((office) => ({
      ...office,
      employeeIds: office.employeeIds.filter(
        (employeeId) => !resignations.includes(employeeId),
      ),
    })),
    lastEmployeeEconomicsWeek: week > 0 ? { week, season } : baseFinances.lastEmployeeEconomicsWeek,
    transactions: resignations.length > 0
      ? [
          ...baseFinances.transactions,
          ...resignations.map((employeeId) => {
            const employee = baseFinances.employees.find((candidate) => candidate.id === employeeId)!;
            return {
              week,
              season,
              amount: 0,
              description: `Employee resigned: ${employee.name} (morale ${employee.morale}, pay satisfaction ${employee.paySatisfaction ?? 65})`,
              referenceId: `employee-resigned:${employee.id}:s${season}w${week}`,
            };
          }),
        ]
      : baseFinances.transactions,
  };
  financesWithRemaining = processTrainingWeek(financesWithRemaining);
  return financesWithRemaining;
}

// ---------------------------------------------------------------------------
// Overhead calculation
// ---------------------------------------------------------------------------

/**
 * Calculate total agency overhead (monthly).
 */
export function calculateAgencyOverhead(
  finances: FinancialRecord,
  employerReputation = 50,
): number {
  const officeCost = finances.office.monthlyCost;
  const salaries = finances.employees.reduce(
    (sum, employee) => sum + normalizeEmployeeContract(
      employee,
      employerReputation,
    ).employee.salary,
    0,
  );
  const insurance = finances.employees.length > 0
    ? Math.round(finances.employees.length * 50)
    : 0;

  return officeCost + salaries + insurance;
}
