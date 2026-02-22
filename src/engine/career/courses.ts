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
} from "@/engine/core/types";

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

/**
 * Enroll in a course. Deducts the cost and sets the active enrollment.
 * Returns null if the scout can't afford it or is already enrolled.
 */
export function enrollInCourse(
  finances: FinancialRecord,
  courseId: string,
  week: number,
  season: number,
): FinancialRecord | null {
  // Already enrolled in a course
  if (finances.activeEnrollment) return null;

  const course = COURSE_CATALOG.find((c) => c.id === courseId);
  if (!course) return null;

  // Can't afford
  if (finances.balance < course.cost) return null;

  // Already completed
  if (finances.completedCourses.includes(courseId)) return null;

  const enrollment: CourseEnrollment = {
    courseId,
    startWeek: week,
    startSeason: season,
    completionWeek: week + course.durationWeeks,
    completionSeason: season, // simplified: assumes no season boundary crossing
  };

  return {
    ...finances,
    balance: finances.balance - course.cost,
    activeEnrollment: enrollment,
    transactions: [
      ...finances.transactions,
      {
        week,
        season,
        amount: -course.cost,
        description: `Enrolled in ${course.name}`,
      },
    ],
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
  _season: number,
): FinancialRecord {
  if (!finances.activeEnrollment) return finances;

  const enrollment = finances.activeEnrollment;

  // Not yet complete
  if (week < enrollment.completionWeek) return finances;

  // Course completed
  return {
    ...finances,
    completedCourses: [...finances.completedCourses, enrollment.courseId],
    activeEnrollment: undefined,
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
