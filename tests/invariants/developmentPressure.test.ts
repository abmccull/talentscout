import { describe, expect, it } from "vitest";
import { createWeekSchedule } from "@/engine/core/calendar";
import type {
  AgencyEmployee,
  ConsultingContract,
  FinancialRecord,
  NewGameConfig,
  RetainerContract,
  ScoutReport,
  Scout,
  StaffScoutingWorkProduct,
} from "@/engine/core/types";
import { projectDevelopmentPressure } from "@/engine/career/developmentPressure";
import { calculatePerformanceReview } from "@/engine/career/progression";
import { initializeFinances } from "@/engine/finance/expenses";
import { RNG } from "@/engine/rng";
import { createScout } from "@/engine/scout/creation";

const CONFIG: NewGameConfig = {
  scoutFirstName: "Pressure",
  scoutLastName: "Loop",
  scoutAge: 35,
  specialization: "youth",
  difficulty: "normal",
  worldSeed: "development-pressure",
  startingCountry: "england",
  selectedCountries: ["england"],
  skillAllocations: {
    technicalEye: 2,
    physicalAssessment: 1,
    psychologicalRead: 1,
    tacticalUnderstanding: 1,
    dataLiteracy: 1,
    playerJudgment: 1,
    potentialAssessment: 1,
  },
};

function scout(overrides: Partial<Scout> = {}): Scout {
  return {
    ...createScout(CONFIG, new RNG("development-pressure-scout")),
    careerPath: "club",
    careerPathChosen: true,
    careerTier: 3,
    ...overrides,
  };
}

function baseFinances(owner: Scout): FinancialRecord {
  return initializeFinances(owner, owner.careerPath, "normal");
}

function consulting(): ConsultingContract {
  return {
    id: "consult-pressure",
    clubId: "club-client",
    type: "youthAudit",
    fee: 7_500,
    deadline: 4,
    deadlineSeason: 1,
    status: "active",
    deliverables: [
      { type: "reports", description: "Reports", required: 2, delivered: 1 },
      { type: "analysis", description: "Analysis", required: 1, delivered: 0 },
      { type: "presentation", description: "Presentation", required: 1, delivered: 0 },
    ],
    offeredWeek: 1,
    offeredSeason: 1,
    deliveredReportIds: [],
  };
}

function staffProduct(): StaffScoutingWorkProduct {
  return {
    id: "staff-work-pressure",
    playerId: "player-pressure",
    employeeId: "employee-pressure",
    employeeName: "Taylor Analyst",
    clientClubId: "club-client",
    createdWeek: 2,
    createdSeason: 1,
    status: "awaitingReview",
    qualityScore: 60,
    signals: [],
    limitation: "Staff lead only.",
    suggestedConviction: "investigate",
  };
}

function retainer(id: string, clubId: string): RetainerContract {
  return {
    id,
    clubId,
    tier: 3,
    monthlyFee: 2_000,
    requiredReportsPerMonth: 12,
    reportsDeliveredThisMonth: 0,
    status: "active",
    deliveredReportIds: [],
  };
}

function employee(): AgencyEmployee {
  return {
    id: "employee-pressure",
    name: "Taylor Analyst",
    role: "analyst",
    quality: 70,
    salary: 900,
    paySatisfaction: 55,
    morale: 55,
    fatigue: 70,
    hiredWeek: 1,
    hiredSeason: 1,
    workProductsGenerated: [],
    experience: 100,
    weeklyLog: [],
    regionFocusWeeks: 0,
  };
}

describe("development pressure loop", () => {
  it("turns an idle employer-funded course into immediate progression pressure", () => {
    const owner = scout();
    const finances = {
      ...baseFinances(owner),
      activeEnrollment: {
        courseId: "fa_level_1",
        startWeek: 2,
        startSeason: 1,
        completionWeek: 5,
        completionSeason: 1,
        studyWeeksCompleted: 1,
        requiredStudyWeeks: 4,
      },
      transactions: [{
        week: 2,
        season: 1,
        amount: 0,
        description: "Enrolled in FA Level 1 Scouting Badge (employer funded £500)",
        referenceId: "course-enrollment:fa_level_1:s1w2",
        category: "operatingCost" as const,
      }],
    };

    const projection = projectDevelopmentPressure({
      scout: owner,
      finances,
      schedule: createWeekSchedule(4, 1),
      currentWeek: 4,
      currentSeason: 1,
      seasonLength: 38,
    });

    expect(projection.fronts[0]).toMatchObject({
      family: "courseStudy",
      severity: "high",
      action: "scheduleStudy",
    });
    expect(projection.fronts[0]?.title).toContain("club backing");
    expect(projection.fronts[0]?.consequence).toContain("career tier");
  });

  it("uses canonical review debt to show the quality lost by another deferral", () => {
    const owner = scout({ careerPath: "independent", independentTier: 3 });
    const finances = {
      ...baseFinances(owner),
      careerPath: "independent" as const,
      independentTier: 3 as const,
      consultingContracts: [consulting()],
      staffWorkProducts: [staffProduct()],
    };

    const projection = projectDevelopmentPressure({
      scout: owner,
      finances,
      schedule: createWeekSchedule(4, 1),
      currentWeek: 4,
      currentSeason: 1,
      seasonLength: 38,
    });
    const front = projection.fronts.find((candidate) => candidate.family === "staffReview");

    expect(front).toMatchObject({
      severity: "critical",
      action: "reviewStaffWork",
      dueWeek: 4,
      dueSeason: 1,
    });
    expect(front?.consequence).toContain("another 6 quality points");
  });

  it("connects fragile agency operations to senior progression", () => {
    const owner = scout({
      careerPath: "independent",
      independentTier: 3,
      reputation: 80,
      reportsSubmitted: 100,
    });
    const finances = {
      ...baseFinances(owner),
      balance: 1_000,
      careerPath: "independent" as const,
      independentTier: 3 as const,
      office: { tier: "small" as const, monthlyCost: 500, qualityBonus: 0.1, maxEmployees: 3 },
      employees: [employee()],
      retainerContracts: [
        retainer("retainer-a", "dominant-client"),
        retainer("retainer-b", "dominant-client"),
        retainer("retainer-c", "dominant-client"),
      ],
    };

    const projection = projectDevelopmentPressure({
      scout: owner,
      finances,
      schedule: createWeekSchedule(8, 1),
      currentWeek: 8,
      currentSeason: 1,
      seasonLength: 38,
    });
    const front = projection.fronts.find((candidate) => candidate.family === "agencyHealth");

    expect(front).toBeDefined();
    expect(front?.action).toBe("stabilizeAgency");
    expect(front?.consequence).toContain("progression remains blocked");
  });

  it("layers concurrent fires above the same dominant front without exceeding the bounded scale", () => {
    const owner = scout();
    const courseEnrollment = {
      courseId: "fa_level_1",
      startWeek: 2,
      startSeason: 1,
      completionWeek: 5,
      completionSeason: 1,
      studyWeeksCompleted: 1,
      requiredStudyWeeks: 4,
    };
    const fundedEnrollmentTransaction = {
      week: 2,
      season: 1,
      amount: 0,
      description: "Enrolled in FA Level 1 Scouting Badge (employer funded £500)",
      referenceId: "course-enrollment:fa_level_1:s1w2",
      category: "operatingCost" as const,
    };
    const dominantFireOnly = {
      ...baseFinances(owner),
      activeEnrollment: courseEnrollment,
      transactions: [fundedEnrollmentTransaction],
    };
    const concurrentFires = {
      ...dominantFireOnly,
      staffWorkProducts: [{
        ...staffProduct(),
        createdWeek: 1,
      }],
    };
    const input = {
      scout: owner,
      schedule: createWeekSchedule(4, 1),
      currentWeek: 4,
      currentSeason: 1,
      seasonLength: 38,
    };

    const single = projectDevelopmentPressure({
      ...input,
      finances: dominantFireOnly,
    });
    const layered = projectDevelopmentPressure({
      ...input,
      finances: concurrentFires,
    });

    expect(layered.fronts).toHaveLength(2);
    expect(layered.fronts[0]?.id).toBe(single.fronts[0]?.id);
    expect(layered.rawScore).toBeGreaterThan(single.rawScore);
    expect(layered.seasonReviewPenalty).toBeGreaterThan(single.seasonReviewPenalty);
    expect(layered.rawScore).toBeLessThanOrEqual(100);
  });

  it("lets youth outcomes offset pressure without erasing a critical front and stays deterministic", () => {
    const owner = scout({ careerPath: "independent", independentTier: 3 });
    const finances = {
      ...baseFinances(owner),
      careerPath: "independent" as const,
      independentTier: 3 as const,
      consultingContracts: [consulting()],
      staffWorkProducts: [staffProduct()],
    };
    const input = {
      scout: owner,
      finances,
      schedule: createWeekSchedule(4, 1),
      currentWeek: 4,
      currentSeason: 1,
      seasonLength: 38,
      seasonReviewMetrics: {
        countriesScoutedThisSeason: ["england"],
        regionsScoutedThisSeason: ["north-west"],
        homeCountry: "england",
        unsignedYouthDiscovered: 6,
        successfulPlacements: 2,
        alumniMilestonesThisSeason: 1,
      },
    };

    const first = projectDevelopmentPressure(input);
    const replay = projectDevelopmentPressure(input);

    expect(first).toEqual(replay);
    expect(first.youthPayoffOffset).toBeGreaterThan(0);
    expect(first.netScore).toBeLessThan(first.rawScore);
    expect(first.netScore).toBeGreaterThanOrEqual(75);
    expect(first.fronts.some((front) => front.severity === "critical")).toBe(true);
    expect(first.youthPayoffSummary).toContain("successful placements");
  });

  it("lets unresolved pressure change a threshold review and records why", () => {
    const owner = scout({ primarySpecialization: "youth", careerTier: 2 });
    const reports = Array.from({ length: 10 }, (_, index) => ({
      id: `review-report-${index}`,
      playerId: `review-player-${index}`,
      scoutId: owner.id,
      submittedWeek: index + 1,
      submittedSeason: 1,
      attributeAssessments: [],
      strengths: [],
      weaknesses: [],
      conviction: index === 0 ? "tablePound" : "recommend",
      summary: "A well-supported youth recommendation.",
      estimatedValue: 100_000,
      qualityScore: 100,
      clubResponse: "signed",
    })) as ScoutReport[];
    const normal = calculatePerformanceReview(owner, reports, 1, {
      unsignedYouthDiscovered: 10,
    });
    const pressured = calculatePerformanceReview(owner, reports, 1, {
      unsignedYouthDiscovered: 10,
      developmentPressurePenalty: 12,
      developmentPressureReasons: ["Funded qualification stalled without study time."],
      developmentPayoffOffset: 6,
    });

    expect(normal.outcome).toBe("promoted");
    expect(pressured.outcome).toBe("retained");
    expect(pressured.developmentSummary).toEqual({
      pressurePenalty: 12,
      youthPayoffOffset: 6,
      reasons: ["Funded qualification stalled without study time."],
    });
  });
});
