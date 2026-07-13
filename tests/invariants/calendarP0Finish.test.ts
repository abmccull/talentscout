import { describe, expect, it } from "vitest";
import type {
  AgencyEmployee,
  Club,
  EmployeeEvent,
  FinancialRecord,
  Fixture,
  GameState,
  Scout,
} from "@/engine/core/types";
import type { RNG } from "@/engine/rng";
import {
  gameWeeksBetween,
  getCareerElapsedWeeks,
} from "@/engine/core/gameDate";
import { getAchievementProgress } from "@/engine/core/achievementEngine";
import {
  checkEmployeeEvents,
  expireEmployeeEvents,
} from "@/engine/finance/employeeEvents";
import { processClientRelationshipWeek } from "@/engine/finance/clientRelationships";
import {
  generateConsultingOffers,
  processConsultingDeadline,
} from "@/engine/finance/consulting";
import { processAnnualAwards } from "@/engine/finance/awards";
import {
  enrollInCourse,
  processWeeklyCourseProgress,
} from "@/engine/career/courses";

const CALENDAR_LENGTHS = [38, 46, 50] as const;

function fixturesFor(seasonLength: number): Record<string, Fixture> {
  return Object.fromEntries([1, 2].map((season) => {
    const id = `fixture-s${season}-w${seasonLength}`;
    return [id, {
      id,
      homeClubId: "home",
      awayClubId: "away",
      leagueId: "league",
      season,
      week: seasonLength,
      played: false,
    } satisfies Fixture];
  }));
}

const alwaysRng = {
  chance: () => true,
  next: () => 0,
  nextFloat: (minimum: number) => minimum,
  nextInt: (minimum: number) => minimum,
  pick: <T>(items: readonly T[]) => items[0],
  pickWeighted: <T>(items: ReadonlyArray<{ item: T }>) => items[0].item,
  shuffle: <T>(items: readonly T[]) => [...items],
} as unknown as RNG;

function employee(): AgencyEmployee {
  return {
    id: "employee-calendar",
    name: "Casey Calendar",
    role: "scout",
    quality: 15,
    salary: 1_200,
    paySatisfaction: 60,
    morale: 70,
    fatigue: 0,
    hiredWeek: 1,
    hiredSeason: 1,
    reportsGenerated: [],
    currentAssignment: {
      type: "idle",
      assignedWeek: 1,
      assignedSeason: 1,
    },
    experience: 500,
    weeklyLog: [],
    regionFocusWeeks: 0,
  };
}

function scout(): Scout {
  return {
    id: "scout-calendar",
    reputation: 50,
    careerTier: 4,
    careerPath: "independent",
    independentTier: 4,
    primarySpecialization: "youth",
  } as unknown as Scout;
}

describe.each(CALENDAR_LENGTHS)("remaining calendar authority (%i-week season)", (seasonLength) => {
  const fixtures = fixturesFor(seasonLength);

  it("measures career, report, and tenure age across the real rollover", () => {
    expect(gameWeeksBetween(
      fixtures,
      { season: 1, week: seasonLength - 2 },
      { season: 2, week: 3 },
    )).toBe(5);
    expect(getCareerElapsedWeeks(
      fixtures,
      { season: 2, week: 12 },
    )).toBe(seasonLength + 12);

    const state = {
      fixtures,
      currentSeason: seasonLength === 50 ? 1 : 2,
      currentWeek: seasonLength === 50 ? 50 : 50 - seasonLength,
    } as unknown as GameState;
    expect(getAchievementProgress(state, "marathon")?.current).toBe(50);
    expect(getAchievementProgress(state, "marathon")?.percentage).toBe(100);
  });

  it("normalizes employee-event deadlines and expires them only after their due date", () => {
    const finances = {
      pendingEmployeeEvents: [],
    } as unknown as FinancialRecord;
    const generated = checkEmployeeEvents(
      alwaysRng,
      employee(),
      finances,
      scout(),
      seasonLength - 1,
      1,
      seasonLength,
    );
    expect(generated).toMatchObject({
      id: `evt_poach_employee-calendar_s1_w${seasonLength - 1}`,
      deadlineSeason: 2,
      deadline: 1,
    });

    const pending = {
      ...finances,
      pendingEmployeeEvents: [generated as EmployeeEvent],
    } as FinancialRecord;
    expect(expireEmployeeEvents(pending, 1, 2, seasonLength).pendingEmployeeEvents)
      .toHaveLength(1);
    expect(expireEmployeeEvents(pending, 2, 2, seasonLength).pendingEmployeeEvents)
      .toHaveLength(0);

    const legacyOverflow = {
      ...pending,
      pendingEmployeeEvents: [{
        ...(generated as EmployeeEvent),
        deadlineSeason: 1,
        deadline: seasonLength + 2,
      }],
    } as FinancialRecord;
    expect(expireEmployeeEvents(legacyOverflow, 2, 2, seasonLength).pendingEmployeeEvents)
      .toHaveLength(1);
    expect(expireEmployeeEvents(legacyOverflow, 3, 2, seasonLength).pendingEmployeeEvents)
      .toHaveLength(0);
  });

  it("decays dormant client trust using the competition calendar", () => {
    const finances = {
      clientRelationships: [{
        clubId: "club",
        satisfaction: 60,
        totalReportsDelivered: 0,
        totalRevenue: 0,
        tenureWeeks: 8,
        preferences: [],
        status: "active",
        lastInteractionWeek: seasonLength,
        lastInteractionSeason: 1,
      }],
    } as unknown as FinancialRecord;

    const updated = processClientRelationshipWeek(
      alwaysRng,
      finances,
      5,
      2,
      seasonLength,
    );
    expect(updated.clientRelationships[0]).toMatchObject({
      satisfaction: 59,
      tenureWeeks: 9,
    });
  });

  it("keeps consulting and course deadlines valid across season end", () => {
    const club = {
      id: "club",
      name: "Calendar FC",
      reputation: 50,
    } as unknown as Club;
    const finances = {
      consultingContracts: [],
      completedCourses: [],
      transactions: [],
      balance: 10_000,
    } as unknown as FinancialRecord;
    const offers = generateConsultingOffers(
      alwaysRng,
      scout(),
      finances,
      { club },
      seasonLength - 1,
      1,
      seasonLength,
    );
    expect(offers[0]).toMatchObject({ deadlineSeason: 2, deadline: 3 });
    const active = { ...finances, consultingContracts: offers };
    expect(processConsultingDeadline(active, 2, 2, seasonLength).consultingContracts[0].status)
      .toBe("active");
    expect(processConsultingDeadline(active, 3, 2, seasonLength).consultingContracts[0].status)
      .toBe("failed");

    const enrollment = enrollInCourse(
      finances,
      "business_fundamentals",
      seasonLength - 1,
      1,
      4,
      seasonLength,
    );
    expect(enrollment.success).toBe(true);
    if (!enrollment.success) return;
    expect(enrollment.finances.activeEnrollment).toMatchObject({
      completionSeason: 2,
      completionWeek: 3,
    });
    expect(processWeeklyCourseProgress(
      enrollment.finances,
      2,
      2,
      seasonLength,
    ).activeEnrollment).toBeDefined();
    expect(processWeeklyCourseProgress(
      enrollment.finances,
      3,
      2,
      seasonLength,
    ).completedCourses).toContain("business_fundamentals");

    const awardFinances = {
      ...finances,
      awards: [],
      bonusRevenue: 0,
      employees: [],
      clientRelationships: [],
    } as unknown as FinancialRecord;
    const awards = processAnnualAwards(
      alwaysRng,
      awardFinances,
      { ...scout(), reputation: 80, independentTier: 5 },
      1,
      seasonLength,
    );
    expect(awards.wonAwards.length).toBeGreaterThan(0);
    expect(awards.finances.transactions.at(-1)).toMatchObject({
      season: 1,
      week: seasonLength,
    });
  });
});

it("sums differing persisted season lengths instead of multiplying one boundary", () => {
  const fixtures = {
    ...fixturesFor(38),
    "fixture-s2-w46": {
      id: "fixture-s2-w46",
      homeClubId: "home",
      awayClubId: "away",
      leagueId: "league",
      season: 2,
      week: 46,
      played: false,
    },
    "fixture-s3-w50": {
      id: "fixture-s3-w50",
      homeClubId: "home",
      awayClubId: "away",
      leagueId: "league",
      season: 3,
      week: 50,
      played: false,
    },
  } satisfies Record<string, Fixture>;

  expect(gameWeeksBetween(
    fixtures,
    { season: 1, week: 38 },
    { season: 3, week: 1 },
  )).toBe(47);
});
