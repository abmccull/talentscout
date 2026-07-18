/**
 * Courses & Certifications — purchasable qualifications that gate abilities,
 * boost performance, and cost time + money.
 *
 * Courses require enrollment (upfront cost), take multiple weeks to complete,
 * and may restrict weekly activities while in progress.
 */

import type {
  Scout,
  FinancialRecord,
  Course,
  CourseEnrollment,
  CourseEffect,
  CareerTier,
  WeekSchedule,
} from "@/engine/core/types";
import {
  ACTIVITY_FATIGUE_COSTS,
  ACTIVITY_SLOT_COSTS,
} from "@/engine/core/calendar";
import {
  addGameWeeksWithSeasonLength,
  gameWeeksBetweenWithSeasonLength,
  LEGACY_SEASON_LENGTH_WEEKS,
} from "@/engine/core/gameDate";

// ---------------------------------------------------------------------------
// Course catalog
// ---------------------------------------------------------------------------

export const COURSE_CATALOG: Course[] = [
  // Coaching badges (prerequisite chain)
  {
    id: "fa_level_1",
    name: "FA Level 1 Scouting Badge",
    description: "Foundation scouting qualification. Required for professional recognition.",
    cost: 500,
    durationWeeks: 4,
    prerequisites: [],
    minTier: 1,
    effects: [
      { type: "reputationBonus", value: 5 },
      { type: "skillBonus", target: "playerJudgment", value: 1 },
    ],
    category: "scouting",
  },
  {
    id: "fa_level_2",
    name: "FA Level 2 Scouting Certificate",
    description: "Intermediate qualification demonstrating competent player evaluation.",
    cost: 1500,
    durationWeeks: 6,
    prerequisites: ["fa_level_1"],
    minTier: 2,
    effects: [
      { type: "reputationBonus", value: 8 },
      { type: "skillBonus", target: "technicalEye", value: 1 },
      { type: "skillBonus", target: "physicalAssessment", value: 1 },
    ],
    category: "scouting",
  },
  {
    id: "fa_level_3",
    name: "FA Level 3 Advanced Scouting Diploma",
    description: "Advanced diploma required for Head of Scouting roles.",
    cost: 4000,
    durationWeeks: 10,
    prerequisites: ["fa_level_2"],
    minTier: 3,
    effects: [
      { type: "reputationBonus", value: 12 },
      { type: "tierGate", target: "4", value: 1 },
      { type: "skillBonus", target: "potentialAssessment", value: 2 },
    ],
    category: "scouting",
  },
  {
    id: "uefa_a",
    name: "UEFA A Scouting License",
    description: "Elite European scouting license. Required for Director-level roles.",
    cost: 10000,
    durationWeeks: 16,
    prerequisites: ["fa_level_3"],
    minTier: 4,
    effects: [
      { type: "reputationBonus", value: 15 },
      { type: "tierGate", target: "5", value: 1 },
      { type: "skillBonus", target: "playerJudgment", value: 2 },
      { type: "skillBonus", target: "tacticalUnderstanding", value: 1 },
    ],
    category: "scouting",
  },
  {
    id: "uefa_pro",
    name: "UEFA Pro Scouting License",
    description: "The highest scouting qualification in European football.",
    cost: 25000,
    durationWeeks: 24,
    prerequisites: ["uefa_a"],
    minTier: 5,
    effects: [
      { type: "reputationBonus", value: 20 },
      { type: "skillBonus", target: "playerJudgment", value: 3 },
    ],
    category: "scouting",
  },

  // Specialization courses
  {
    id: "youth_development_methods",
    name: "Youth Development Methods",
    description: "Modern approaches to identifying and developing young talent.",
    cost: 800,
    durationWeeks: 6,
    prerequisites: [],
    minTier: 1,
    effects: [
      { type: "skillBonus", target: "potentialAssessment", value: 2 },
    ],
    category: "specialization",
  },
  {
    id: "data_analytics_fundamentals",
    name: "Data Analytics Fundamentals",
    description: "Introduction to statistical analysis in football scouting.",
    cost: 600,
    durationWeeks: 4,
    prerequisites: [],
    minTier: 1,
    effects: [
      { type: "skillBonus", target: "dataLiteracy", value: 2 },
    ],
    category: "specialization",
  },
  {
    id: "advanced_video_analysis",
    name: "Advanced Video Analysis",
    description: "Professional video analysis techniques for remote scouting.",
    cost: 1200,
    durationWeeks: 6,
    prerequisites: [],
    minTier: 2,
    effects: [
      { type: "skillBonus", target: "technicalEye", value: 1 },
      { type: "skillBonus", target: "tacticalUnderstanding", value: 1 },
    ],
    category: "specialization",
  },
  {
    id: "psychological_profiling",
    name: "Psychological Profiling",
    description: "Techniques for assessing player mentality and hidden attributes.",
    cost: 2000,
    durationWeeks: 8,
    prerequisites: ["fa_level_2"],
    minTier: 3,
    effects: [
      { type: "skillBonus", target: "psychologicalRead", value: 3 },
    ],
    category: "specialization",
  },
  {
    id: "cross_cultural_scouting",
    name: "Cross-Cultural Scouting",
    description: "Navigate cultural differences in international scouting missions.",
    cost: 1500,
    durationWeeks: 6,
    prerequisites: [],
    minTier: 2,
    effects: [
      { type: "attributeBonus", target: "adaptability", value: 2 },
    ],
    category: "specialization",
  },

  // Business courses (independent path focus)
  {
    id: "business_fundamentals",
    name: "Business Fundamentals",
    description: "Essential business skills for independent scouts and agency owners.",
    cost: 400,
    durationWeeks: 4,
    prerequisites: [],
    minTier: 1,
    effects: [
      { type: "attributeBonus", target: "networking", value: 1 },
    ],
    category: "business",
  },
  {
    id: "agency_management",
    name: "Agency Management",
    description: "How to build and manage a scouting agency.",
    cost: 3000,
    durationWeeks: 8,
    prerequisites: ["business_fundamentals"],
    minTier: 3,
    effects: [
      { type: "attributeBonus", target: "networking", value: 2 },
      { type: "attributeBonus", target: "persuasion", value: 1 },
    ],
    category: "business",
  },
  {
    id: "negotiation_masterclass",
    name: "Negotiation Masterclass",
    description: "Advanced negotiation tactics for contract and fee discussions.",
    cost: 2500,
    durationWeeks: 6,
    prerequisites: [],
    minTier: 2,
    effects: [
      { type: "attributeBonus", target: "persuasion", value: 3 },
    ],
    category: "business",
  },
];

// ---------------------------------------------------------------------------
// Course availability
// ---------------------------------------------------------------------------

/**
 * Get courses available to the scout based on prerequisites, tier, and
 * already-completed courses.
 */
export function getAvailableCourses(
  scout: Scout,
  completedCourses: string[],
): Course[] {
  return COURSE_CATALOG.filter((course) => {
    // Already completed
    if (completedCourses.includes(course.id)) return false;

    // Tier requirement
    if (scout.careerTier < course.minTier) return false;

    // Prerequisites
    for (const prereq of course.prerequisites) {
      if (!completedCourses.includes(prereq)) return false;
    }

    return true;
  });
}

// ---------------------------------------------------------------------------
// Enrollment
// ---------------------------------------------------------------------------

export type EnrollmentResult =
  | {
      success: true;
      finances: FinancialRecord;
      /** Amount paid directly by the scout's employer. */
      educationBudgetUsed: number;
      /** Amount paid from the scout's own cash balance. */
      personalCost: number;
    }
  | { success: false; reason: string };

type ProgressAwareCourseEnrollment = CourseEnrollment & {
  studyWeeksCompleted?: number;
  requiredStudyWeeks?: number;
};

export interface CourseStudyProgress {
  studyWeeksCompleted: number;
  requiredStudyWeeks: number;
  remainingStudyWeeks: number;
  estimatedFromCalendar: boolean;
}

export interface CoursePlannerStatusModel {
  progressPct: number;
  progressLabel: string;
  scheduledStudySessions: number;
  studyWeeksPlanned: number;
  paceLabel: string;
  workloadLabel: string;
  projectedCompletionLabel: string;
  guidance: string;
}

interface CourseStudyProgressOptions {
  courseDurationWeeks?: number;
  currentWeek?: number;
  currentSeason?: number;
  seasonLength?: number;
}

function clampStudyWeeks(value: number, requiredStudyWeeks: number): number {
  return Math.max(0, Math.min(requiredStudyWeeks, Math.floor(value)));
}

function asProgressAwareEnrollment(
  enrollment: CourseEnrollment,
): ProgressAwareCourseEnrollment {
  return enrollment as ProgressAwareCourseEnrollment;
}

const NORMAL_STUDY_WEEKS_PER_CYCLE = 1;
const MAX_STUDY_WEEKS_PER_CYCLE = 2;

export function getCourseStudyWeeksPlanned(
  studySessions: number,
  remainingStudyWeeks = Number.MAX_SAFE_INTEGER,
): number {
  const sanitizedStudySessions = Math.max(0, Math.floor(studySessions));
  const boundedRemainingStudyWeeks = Math.max(0, Math.floor(remainingStudyWeeks));
  if (sanitizedStudySessions === 0 || boundedRemainingStudyWeeks === 0) return 0;

  const plannedStudyWeeks = sanitizedStudySessions >= 2
    ? MAX_STUDY_WEEKS_PER_CYCLE
    : NORMAL_STUDY_WEEKS_PER_CYCLE;
  return Math.min(boundedRemainingStudyWeeks, plannedStudyWeeks);
}

export function countScheduledStudySessions(
  schedule?: WeekSchedule | null,
): number {
  return (schedule?.activities ?? []).filter((activity) => activity?.type === "study").length;
}

export function getCourseStudyProgress(
  enrollment: CourseEnrollment | undefined,
  options: CourseStudyProgressOptions = {},
): CourseStudyProgress | null {
  if (!enrollment) return null;

  const progressAwareEnrollment = asProgressAwareEnrollment(enrollment);
  const requiredStudyWeeks = Math.max(
    1,
    Math.floor(
      progressAwareEnrollment.requiredStudyWeeks
      ?? options.courseDurationWeeks
      ?? 1,
    ),
  );

  const storedProgress = progressAwareEnrollment.studyWeeksCompleted;
  if (storedProgress !== undefined) {
    const studyWeeksCompleted = clampStudyWeeks(storedProgress, requiredStudyWeeks);
    return {
      studyWeeksCompleted,
      requiredStudyWeeks,
      remainingStudyWeeks: Math.max(0, requiredStudyWeeks - studyWeeksCompleted),
      estimatedFromCalendar: false,
    };
  }

  if (
    options.currentWeek !== undefined
    && options.currentSeason !== undefined
  ) {
    const studyWeeksCompleted = clampStudyWeeks(
      gameWeeksBetweenWithSeasonLength(
        {
          season: enrollment.startSeason,
          week: enrollment.startWeek,
        },
        {
          season: options.currentSeason,
          week: options.currentWeek,
        },
        options.seasonLength ?? LEGACY_SEASON_LENGTH_WEEKS,
      ),
      requiredStudyWeeks,
    );
    return {
      studyWeeksCompleted,
      requiredStudyWeeks,
      remainingStudyWeeks: Math.max(0, requiredStudyWeeks - studyWeeksCompleted),
      estimatedFromCalendar: true,
    };
  }

  return {
    studyWeeksCompleted: 0,
    requiredStudyWeeks,
    remainingStudyWeeks: requiredStudyWeeks,
    estimatedFromCalendar: false,
  };
}

export function getProjectedCourseCompletionDate(
  enrollment: CourseEnrollment,
  currentWeek: number,
  currentSeason: number,
  studySessionsScheduledThisWeek: number,
  options: CourseStudyProgressOptions = {},
): { week: number; season: number } {
  const progress = getCourseStudyProgress(enrollment, {
    ...options,
    currentWeek,
    currentSeason,
  });
  if (!progress) {
    return { season: currentSeason, week: currentWeek };
  }

  const projectedStudyWeeksCompleted = Math.min(
    progress.requiredStudyWeeks,
    progress.studyWeeksCompleted
      + getCourseStudyWeeksPlanned(
        studySessionsScheduledThisWeek,
        progress.remainingStudyWeeks,
      ),
  );

  return addGameWeeksWithSeasonLength(
    { season: currentSeason, week: currentWeek },
    Math.max(0, progress.requiredStudyWeeks - projectedStudyWeeksCompleted),
    options.seasonLength ?? LEGACY_SEASON_LENGTH_WEEKS,
  );
}

function formatSeasonWeekLabel(season: number, week: number): string {
  return `Season ${season}, Week ${week}`;
}

export function getCoursePlannerStatusModel(input: {
  activeEnrollment: CourseEnrollment | null | undefined;
  courseDurationWeeks?: number;
  currentWeek: number;
  currentSeason: number;
  scheduledStudySessions: number;
  seasonLength: number;
}): CoursePlannerStatusModel | null {
  const {
    activeEnrollment,
    courseDurationWeeks,
    currentWeek,
    currentSeason,
    scheduledStudySessions,
    seasonLength,
  } = input;
  if (!activeEnrollment) return null;

  const progress = getCourseStudyProgress(activeEnrollment, {
    courseDurationWeeks,
    currentWeek,
    currentSeason,
    seasonLength,
  });
  if (!progress) return null;

  const projectedCompletion = getProjectedCourseCompletionDate(
    activeEnrollment,
    currentWeek,
    currentSeason,
    scheduledStudySessions,
    {
      courseDurationWeeks,
      seasonLength,
    },
  );
  const progressPct = Math.min(
    100,
    Math.round((progress.studyWeeksCompleted / progress.requiredStudyWeeks) * 100),
  );
  const studyWeeksPlanned = getCourseStudyWeeksPlanned(
    scheduledStudySessions,
    progress.remainingStudyWeeks,
  );
  const slotCost = scheduledStudySessions * ACTIVITY_SLOT_COSTS.study;
  const fatigueCost = scheduledStudySessions * ACTIVITY_FATIGUE_COSTS.study;
  const paceLabel = studyWeeksPlanned >= 2
    ? "Intensive pace"
    : studyWeeksPlanned === 1
      ? "Normal pace"
      : "No study booked";
  const workloadLabel = studyWeeksPlanned === 0
    ? "0 planner slots reserved for study"
    : `${slotCost} planner slot${slotCost === 1 ? "" : "s"} and ${fatigueCost} fatigue routed through weekly study activities`;

  return {
    progressPct,
    progressLabel: `${progress.studyWeeksCompleted}/${progress.requiredStudyWeeks} study weeks banked`,
    scheduledStudySessions,
    studyWeeksPlanned,
    paceLabel,
    workloadLabel,
    projectedCompletionLabel: scheduledStudySessions > 0
      ? `Projected finish ${formatSeasonWeekLabel(projectedCompletion.season, projectedCompletion.week)}`
      : `No study booked. Finish slips to ${formatSeasonWeekLabel(projectedCompletion.season, projectedCompletion.week)}`,
    guidance: studyWeeksPlanned >= 2
      ? `Planner ready. Close the week with ${scheduledStudySessions} scheduled Study sessions to bank 2 study weeks. This intensive pace costs extra planner capacity and fatigue through the existing weekly study activities.`
      : studyWeeksPlanned === 1
        ? "Planner ready. Close the week with 1 scheduled Study session to bank the normal 1 study week."
        : "Open Planner and schedule at least one Study session this week or this course will not advance.",
  };
}

/**
 * Enroll in a course. Deducts the cost and sets the active enrollment.
 * Validates prerequisites, tier requirements, affordability, and enrollment state.
 * Returns a structured result with either updated finances or an error reason.
 */
export function enrollInCourse(
  finances: FinancialRecord,
  courseId: string,
  week: number,
  season: number,
  scoutTier?: CareerTier,
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
  educationBudgetAvailable = 0,
): EnrollmentResult {
  // Already enrolled in a course
  if (finances.activeEnrollment) {
    return { success: false, reason: "Already enrolled in a course." };
  }

  const course = COURSE_CATALOG.find((c) => c.id === courseId);
  if (!course) {
    return { success: false, reason: "Course not found." };
  }

  // Already completed
  if (finances.completedCourses.includes(courseId)) {
    return { success: false, reason: "Course already completed." };
  }

  // Prerequisite check
  for (const prereqId of course.prerequisites) {
    if (!finances.completedCourses.includes(prereqId)) {
      const prereqCourse = COURSE_CATALOG.find((c) => c.id === prereqId);
      const prereqName = prereqCourse?.name ?? prereqId;
      return {
        success: false,
        reason: `Missing prerequisite: ${prereqName}.`,
      };
    }
  }

  // Tier requirement check
  if (scoutTier !== undefined && scoutTier < course.minTier) {
    return {
      success: false,
      reason: `Requires career tier ${course.minTier}. Current tier: ${scoutTier}.`,
    };
  }

  const educationBudgetUsed = Math.min(
    course.cost,
    Math.max(0, Math.floor(educationBudgetAvailable)),
  );
  const personalCost = course.cost - educationBudgetUsed;

  // Can't afford the part not covered by the employer.
  if (finances.balance < personalCost) {
    return {
      success: false,
      reason: `Insufficient funds. Need £${personalCost}, have £${Math.floor(finances.balance)}.`,
    };
  }

  const completion = addGameWeeksWithSeasonLength(
    { season, week },
    Math.max(0, course.durationWeeks - 1),
    seasonLength,
  );
  const enrollment = {
    courseId,
    startWeek: week,
    startSeason: season,
    completionWeek: completion.week,
    completionSeason: completion.season,
  } as CourseEnrollment;
  const progressAwareEnrollment = asProgressAwareEnrollment(enrollment);
  progressAwareEnrollment.studyWeeksCompleted = 0;
  progressAwareEnrollment.requiredStudyWeeks = Math.max(1, course.durationWeeks);

  return {
    success: true,
    educationBudgetUsed,
    personalCost,
    finances: {
      ...finances,
      balance: finances.balance - personalCost,
      activeEnrollment: enrollment,
      transactions: [
        ...finances.transactions,
        {
          week,
          season,
          amount: -personalCost,
          description: educationBudgetUsed > 0
            ? `Enrolled in ${course.name} (employer funded £${educationBudgetUsed})`
            : `Enrolled in ${course.name}`,
          referenceId: `course-enrollment:${course.id}:s${season}w${week}`,
          category: "operatingCost",
        },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Weekly progress
// ---------------------------------------------------------------------------

/**
 * Process one week of course progress. If the current week meets or exceeds
 * the completion week, the course is completed and added to completedCourses.
 */
export function processWeeklyCourseProgress(
  finances: FinancialRecord,
  week: number,
  season: number,
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
  studySessions = 0,
): FinancialRecord {
  if (!finances.activeEnrollment) return finances;

  const enrollment = finances.activeEnrollment;
  const course = COURSE_CATALOG.find((candidate) => candidate.id === enrollment.courseId);
  const progress = getCourseStudyProgress(enrollment, {
    courseDurationWeeks: course?.durationWeeks,
    currentWeek: week,
    currentSeason: season,
    seasonLength,
  });
  if (!progress) return finances;

  const studyWeeksEarned = getCourseStudyWeeksPlanned(
    studySessions,
    progress.remainingStudyWeeks,
  );
  const updatedStudyWeeksCompleted = Math.min(
    progress.requiredStudyWeeks,
    progress.studyWeeksCompleted + studyWeeksEarned,
  );

  if (updatedStudyWeeksCompleted >= progress.requiredStudyWeeks) {
    return {
      ...finances,
      completedCourses: [...finances.completedCourses, enrollment.courseId],
      activeEnrollment: undefined,
    };
  }

  const projectedCompletion = addGameWeeksWithSeasonLength(
    { season, week },
    Math.max(0, progress.requiredStudyWeeks - updatedStudyWeeksCompleted),
    seasonLength,
  );
  const updatedEnrollment = {
    ...enrollment,
    completionWeek: projectedCompletion.week,
    completionSeason: projectedCompletion.season,
  } as CourseEnrollment;
  const progressAwareEnrollment = asProgressAwareEnrollment(updatedEnrollment);
  progressAwareEnrollment.studyWeeksCompleted = updatedStudyWeeksCompleted;
  progressAwareEnrollment.requiredStudyWeeks = progress.requiredStudyWeeks;

  return {
    ...finances,
    activeEnrollment: updatedEnrollment,
  };
}

// ---------------------------------------------------------------------------
// Effect aggregation
// ---------------------------------------------------------------------------

/**
 * Aggregate all bonuses from completed courses into a lookup map.
 * Returns a map of effect descriptions to their cumulative values.
 */
export function getCourseEffects(
  completedCourses: string[],
): CourseEffect[] {
  const effects: CourseEffect[] = [];

  for (const courseId of completedCourses) {
    const course = COURSE_CATALOG.find((c) => c.id === courseId);
    if (!course) continue;
    effects.push(...course.effects);
  }

  return effects;
}

/**
 * Check if the scout has the required course completions for a tier advancement.
 * FA Level 3 is required for tier 4, UEFA A for tier 5.
 */
export function hasRequiredCoursesForTier(
  completedCourses: string[],
  targetTier: CareerTier,
): boolean {
  if (targetTier === 4 && !completedCourses.includes("fa_level_3")) return false;
  if (targetTier === 5 && !completedCourses.includes("uefa_a")) return false;
  return true;
}
