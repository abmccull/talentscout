/**
 * Employee skill system — role-specific skills, generation, training, auto-leveling.
 */

import type { RNG } from "../rng/index";
import type {
  AgencyEmployee,
  AgencyEmployeeRole,
  EmployeeSkills,
  EmployeeTraining,
  FinancialRecord,
} from "../core/types";

// ---------------------------------------------------------------------------
// Role skill definitions
// ---------------------------------------------------------------------------

export const ROLE_SKILL_NAMES: Record<AgencyEmployeeRole, [string, string, string]> = {
  scout: ["Coverage", "Accuracy", "Potential Eye"],
  analyst: ["Insight Depth", "Pattern Recognition", "Efficiency"],
  administrator: ["Cost Control", "Organization", "Paperwork"],
  relationshipManager: ["Prospecting", "Client Retention", "Negotiation"],
  mentee: ["Coverage", "Accuracy", "Potential Eye"], // Same as scout, lower start
};

export const ROLE_SKILL_DESCRIPTIONS: Record<AgencyEmployeeRole, [string, string, string]> = {
  scout: [
    "How many players found per week (report generation chance)",
    "How accurate attribute assessments are (error range)",
    "Ability to assess young player potential (PA star accuracy)",
  ],
  analyst: [
    "Quality boost added to reviewed reports",
    "Chance to detect trends and flag opportunities",
    "Number of reports processed per week",
  ],
  administrator: [
    "Percentage of office overhead reduced",
    "Team-wide fatigue reduction aura",
    "Speed and quality of retainer paperwork",
  ],
  relationshipManager: [
    "Chance of generating new client leads per week",
    "Bonus to client satisfaction ratings",
    "Quality of negotiated deal terms (higher fees)",
  ],
  mentee: [
    "How many players found per week (report generation chance)",
    "How accurate attribute assessments are (error range)",
    "Ability to assess young player potential (PA star accuracy)",
  ],
};

// Skill generation ranges by role. [min, max] for each of the 3 skills.
// Mentees get lower ranges; senior roles get wider spread.
const SKILL_GENERATION_RANGES: Record<
  AgencyEmployeeRole,
  [[number, number], [number, number], [number, number]]
> = {
  scout: [
    [4, 14],
    [3, 13],
    [3, 12],
  ],
  analyst: [
    [4, 14],
    [3, 12],
    [4, 13],
  ],
  administrator: [
    [4, 13],
    [3, 12],
    [4, 14],
  ],
  relationshipManager: [
    [4, 14],
    [3, 13],
    [4, 13],
  ],
  mentee: [
    [2, 7],
    [2, 6],
    [1, 6],
  ],
};

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/**
 * Generate skills for a new employee. Uses triangular distribution
 * (average of 2 rolls) to avoid extremes.
 */
export function generateEmployeeSkills(rng: RNG, role: AgencyEmployeeRole): EmployeeSkills {
  const ranges = SKILL_GENERATION_RANGES[role];
  const roll = (min: number, max: number) => {
    const a = rng.nextInt(min, max);
    const b = rng.nextInt(min, max);
    return Math.round((a + b) / 2);
  };
  return {
    skill1: roll(ranges[0][0], ranges[0][1]),
    skill2: roll(ranges[1][0], ranges[1][1]),
    skill3: roll(ranges[2][0], ranges[2][1]),
    xp1: 0,
    xp2: 0,
    xp3: 0,
  };
}

/**
 * Derive the flat `quality` value from skills. This is the average of all 3 skills.
 * Keeps backward compatibility with all code that reads `emp.quality`.
 */
export function deriveQuality(skills: EmployeeSkills): number {
  return Math.floor((skills.skill1 + skills.skill2 + skills.skill3) / 3);
}

/**
 * Compute salary from skills. Higher total skill = higher salary.
 * Uses role-specific salary bands.
 */
export function computeSalaryFromSkills(
  skills: EmployeeSkills,
  role: AgencyEmployeeRole,
): number {
  const SALARY_RANGES: Record<AgencyEmployeeRole, [number, number]> = {
    scout: [500, 2000],
    analyst: [400, 1500],
    administrator: [300, 1000],
    relationshipManager: [600, 2500],
    mentee: [200, 600],
  };
  const [min, max] = SALARY_RANGES[role];
  const quality = deriveQuality(skills);
  return Math.round(min + (quality / 20) * (max - min));
}

// ---------------------------------------------------------------------------
// Backward compatibility: migrate old employees
// ---------------------------------------------------------------------------

/**
 * Generate skills for a legacy employee that only has `quality`.
 * Centers skills around the existing quality +/- 1.
 */
export function migrateEmployeeSkills(rng: RNG, emp: AgencyEmployee): EmployeeSkills {
  const base = emp.quality;
  const jitter = () => rng.nextInt(-1, 1);
  return {
    skill1: Math.max(1, Math.min(20, base + jitter())),
    skill2: Math.max(1, Math.min(20, base + jitter())),
    skill3: Math.max(1, Math.min(20, base + jitter())),
    xp1: 0,
    xp2: 0,
    xp3: 0,
  };
}

/**
 * Ensure an employee has skills. If missing, migrate from quality.
 * Call this before accessing emp.skills in any engine code.
 */
export function ensureEmployeeSkills(rng: RNG, emp: AgencyEmployee): AgencyEmployee {
  if (emp.skills) return emp;
  const skills = migrateEmployeeSkills(rng, emp);
  return { ...emp, skills, quality: deriveQuality(skills) };
}

// ---------------------------------------------------------------------------
// Auto-leveling
// ---------------------------------------------------------------------------

/** XP threshold to level up a skill at a given level. Higher levels need more XP. */
function xpThreshold(level: number): number {
  return level * 15;
}

/** XP multiplier for mentees — they learn 50% faster. */
const MENTEE_XP_MULTIPLIER = 1.5;

/**
 * Process weekly skill XP gain for an active employee.
 * XP is distributed across the 3 skills based on their work assignment.
 * Returns the updated employee with any skill level-ups applied.
 */
export function processSkillXp(rng: RNG, emp: AgencyEmployee): AgencyEmployee {
  if (!emp.skills) return emp;
  if (!emp.currentAssignment || emp.currentAssignment.type === "idle") return emp;
  if (emp.onLeave) return emp;
  if (emp.activeTraining) return emp; // Training is separate

  const skills = { ...emp.skills };
  const isMentee = emp.role === "mentee";
  const multiplier = isMentee ? MENTEE_XP_MULTIPLIER : 1.0;

  // Base XP gain per week: 3-7 points spread across skills
  // Skill 1 gets more XP (primary work skill), 2 and 3 get less
  const baseXp1 = Math.round((rng.nextInt(3, 5) + emp.morale / 50) * multiplier);
  const baseXp2 = Math.round((rng.nextInt(2, 4) + emp.morale / 60) * multiplier);
  const baseXp3 = Math.round((rng.nextInt(1, 3) + emp.morale / 70) * multiplier);

  skills.xp1 += baseXp1;
  skills.xp2 += baseXp2;
  skills.xp3 += baseXp3;

  // Check for level-ups (max level 20)
  if (skills.skill1 < 20 && skills.xp1 >= xpThreshold(skills.skill1)) {
    skills.xp1 -= xpThreshold(skills.skill1);
    skills.skill1++;
  }
  if (skills.skill2 < 20 && skills.xp2 >= xpThreshold(skills.skill2)) {
    skills.xp2 -= xpThreshold(skills.skill2);
    skills.skill2++;
  }
  if (skills.skill3 < 20 && skills.xp3 >= xpThreshold(skills.skill3)) {
    skills.xp3 -= xpThreshold(skills.skill3);
    skills.skill3++;
  }

  const quality = deriveQuality(skills);
  return { ...emp, skills, quality };
}

// ---------------------------------------------------------------------------
// Training system
// ---------------------------------------------------------------------------

export interface TrainingOption {
  skillIndex: 1 | 2 | 3;
  skillName: string;
  currentLevel: number;
  cost: number;
  durationWeeks: number;
  canAfford: boolean;
  atMax: boolean;
}

/**
 * Get available training options for an employee.
 */
export function getTrainingOptions(emp: AgencyEmployee, balance: number): TrainingOption[] {
  if (!emp.skills) return [];
  if (emp.activeTraining) return []; // Already training
  if (emp.onLeave) return [];

  const skillNames = ROLE_SKILL_NAMES[emp.role];
  const levels = [emp.skills.skill1, emp.skills.skill2, emp.skills.skill3];

  return levels.map((level, i) => {
    const cost = 300 + level * 150;
    const duration = 2 + Math.floor(level / 5);
    return {
      skillIndex: (i + 1) as 1 | 2 | 3,
      skillName: skillNames[i],
      currentLevel: level,
      cost,
      durationWeeks: duration,
      canAfford: balance >= cost,
      atMax: level >= 20,
    };
  });
}

/**
 * Enroll an employee in training. Deducts cost, puts employee on training leave.
 * Returns null if can't afford, already training, or skill at max.
 */
export function enrollInTraining(
  finances: FinancialRecord,
  employeeId: string,
  skillIndex: 1 | 2 | 3,
): FinancialRecord | null {
  const emp = finances.employees.find((e) => e.id === employeeId);
  if (!emp?.skills) return null;
  if (emp.activeTraining || emp.onLeave) return null;

  const levels = [emp.skills.skill1, emp.skills.skill2, emp.skills.skill3];
  const level = levels[skillIndex - 1];
  if (level >= 20) return null;

  const skillNames = ROLE_SKILL_NAMES[emp.role];
  const cost = 300 + level * 150;
  const duration = 2 + Math.floor(level / 5);

  if (finances.balance < cost) return null;

  const training: EmployeeTraining = {
    skillIndex,
    skillName: skillNames[skillIndex - 1],
    weeksRemaining: duration,
    cost,
  };

  return {
    ...finances,
    balance: finances.balance - cost,
    employees: finances.employees.map((e) =>
      e.id === employeeId
        ? { ...e, activeTraining: training, onLeave: true, leaveReturnWeek: duration }
        : e,
    ),
    transactions: [
      ...finances.transactions,
      {
        week: 0, // Will be set by caller
        season: 0,
        amount: -cost,
        description: `Training: ${emp.name} — ${skillNames[skillIndex - 1]}`,
      },
    ],
  };
}

/**
 * Process one week of training for all employees.
 * When training completes, the skill gets +1 and the employee returns from leave.
 */
export function processTrainingWeek(finances: FinancialRecord): FinancialRecord {
  let changed = false;
  const updatedEmployees = finances.employees.map((emp) => {
    if (!emp.activeTraining || !emp.skills) return emp;

    const remaining = emp.activeTraining.weeksRemaining - 1;

    if (remaining <= 0) {
      // Training complete — apply +1 to the trained skill
      const skills = { ...emp.skills };
      if (emp.activeTraining.skillIndex === 1 && skills.skill1 < 20) {
        skills.skill1++;
        skills.xp1 = 0;
      } else if (emp.activeTraining.skillIndex === 2 && skills.skill2 < 20) {
        skills.skill2++;
        skills.xp2 = 0;
      } else if (emp.activeTraining.skillIndex === 3 && skills.skill3 < 20) {
        skills.skill3++;
        skills.xp3 = 0;
      }

      changed = true;
      return {
        ...emp,
        skills,
        quality: deriveQuality(skills),
        activeTraining: undefined,
        onLeave: false,
        leaveReturnWeek: undefined,
      };
    }

    changed = true;
    return {
      ...emp,
      activeTraining: { ...emp.activeTraining, weeksRemaining: remaining },
    };
  });

  if (!changed) return finances;
  return { ...finances, employees: updatedEmployees };
}

/**
 * Get a human-readable summary of an employee's skill profile.
 */
export function getSkillSummary(emp: AgencyEmployee): string {
  if (!emp.skills) return `Quality: ${emp.quality}/20`;
  const names = ROLE_SKILL_NAMES[emp.role];
  return `${names[0]}: ${emp.skills.skill1}, ${names[1]}: ${emp.skills.skill2}, ${names[2]}: ${emp.skills.skill3}`;
}
