import { describe, expect, test } from "vitest";

import { createConsequenceEngineState } from "@/engine/consequences";
import type {
  Activity,
  AgencyEmployee,
  ClientRelationship,
  GameState,
  Scout,
} from "@/engine/core/types";
import { processWeeklyRoleResponsibilities } from "@/engine/career/roleResponsibilities";

function scout(overrides: Partial<Scout> = {}): Scout {
  return {
    id: "scout-1",
    firstName: "Alex",
    lastName: "Turner",
    careerTier: 3,
    careerPath: "club",
    currentClubId: "club-1",
    reputation: 60,
    clubTrust: 50,
    specializationReputation: 40,
    primarySpecialization: "youth",
    salary: 0,
    fatigue: 20,
    ...overrides,
  } as Scout;
}

function activity(type: Activity["type"]): Activity {
  return {
    id: `activity-${type}`,
    type,
    description: type,
    slots: 1,
  } as unknown as Activity;
}

function baseState(input: {
  scout?: Partial<Scout>;
  activities?: Activity[];
  clients?: ClientRelationship[];
  employees?: AgencyEmployee[];
  leadershipResponsibilities?: Record<string, unknown>;
} = {}): GameState {
  const activities = input.activities ?? [];
  return {
    seed: "role-week-seed",
    currentWeek: 8,
    currentSeason: 2,
    scout: scout(input.scout),
    schedule: {
      week: 8,
      season: 2,
      activities: [
        ...activities,
        ...Array.from({ length: Math.max(0, 7 - activities.length) }, () => null),
      ],
      completed: false,
    },
    consequenceState: createConsequenceEngineState(),
    inbox: [],
    finances: {
      balance: 6_000,
      monthlyIncome: 0,
      expenses: {} as never,
      equipmentLevel: 1,
      transactions: [],
      careerPath: (input.scout?.careerPath ?? "club") as "club" | "independent",
      reportSalesRevenue: 0,
      placementFeeRevenue: 0,
      retainerRevenue: 0,
      consultingRevenue: 0,
      sellOnRevenue: 0,
      bonusRevenue: 0,
      retainerContracts: [],
      placementFeeRecords: [],
      reportListings: [],
      consultingContracts: [],
      office: { maxEmployees: 4 } as never,
      employees: input.employees ?? [],
      analystReviews: [],
      lifestyle: {} as never,
      completedCourses: [],
      pendingRetainerOffers: [],
      pendingConsultingOffers: [],
      marketTemperature: "warm" as never,
      activeEconomicEvents: [],
      clientRelationships: input.clients ?? [],
      pendingEmployeeEvents: [],
      satelliteOffices: [],
      awards: [],
      loans: [],
      starterBonus: {} as never,
    },
    leadershipPortfolio: input.leadershipResponsibilities
      ? {
          version: 1,
          attentionWeek: 8,
          attentionSeason: 2,
          attentionCapacity: 2,
          attentionUsed: 0,
          responsibilities: input.leadershipResponsibilities as never,
          trackRecord: {
            ownedSuccesses: 0,
            ownedFailures: 0,
            delegatedSuccesses: 0,
            delegatedFailures: 0,
            deferrals: 0,
            rejected: 0,
            expired: 0,
          },
        }
      : undefined,
    clubs: {
      "club-1": {
        id: "club-1",
        name: "Northbridge",
        scoutingPhilosophy: "academyFirst",
        reputation: 72,
      },
    } as never,
  } as unknown as GameState;
}

describe("weekly career role responsibilities", () => {
  test("rewards club territory owners for combining coverage and context and remains exact-once", () => {
    const beforeWeek = baseState({
      scout: { careerTier: 3, careerPath: "club", clubTrust: 50, specializationReputation: 40 },
      activities: [activity("schoolMatch"), activity("networkMeeting")],
    });

    const processed = processWeeklyRoleResponsibilities({
      beforeWeek,
      state: beforeWeek,
    });

    expect(processed.scout.clubTrust).toBe(51);
    expect(processed.scout.specializationReputation).toBe(41);
    expect(processed.inbox.at(-1)?.title).toBe("Territory ownership paid off");
    expect(processed.consequenceState.facts["fact:career-role:s2w8"]).toMatchObject({
      kind: "careerRoleWeek",
      value: expect.objectContaining({
        outcome: "success",
        stage: "territoryOwner",
      }),
    });

    const replayed = processWeeklyRoleResponsibilities({
      beforeWeek,
      state: processed,
    });

    expect(replayed.scout.clubTrust).toBe(processed.scout.clubTrust);
    expect(replayed.scout.specializationReputation).toBe(processed.scout.specializationReputation);
    expect(replayed.inbox).toEqual(processed.inbox);
  });

  test("penalizes club leaders who ignore open leadership load", () => {
    const beforeWeek = baseState({
      scout: { careerTier: 4, careerPath: "club", clubTrust: 52, reputation: 61 },
      activities: [activity("schoolMatch")],
      leadershipResponsibilities: {
        "resp-1": {
          id: "resp-1",
          status: "open",
        },
      },
    });

    const processed = processWeeklyRoleResponsibilities({
      beforeWeek,
      state: beforeWeek,
    });

    expect(processed.scout.clubTrust).toBe(51);
    expect(processed.scout.reputation).toBe(60);
    expect(processed.inbox.at(-1)?.title).toBe("Leadership remit ignored");
    expect(processed.consequenceState.facts["fact:career-role:s2w8"]?.value).toMatchObject({
      stage: "leader",
      outcome: "warning",
    });
  });

  test("turns short-runway independent weeks into client-facing consequences", () => {
    const beforeWeek = baseState({
      scout: {
        careerTier: 3,
        careerPath: "independent",
        currentClubId: undefined,
        reputation: 58,
        clubTrust: 0,
      },
      activities: [activity("schoolMatch")],
      clients: [
        {
          clubId: "client-1",
          satisfaction: 61,
          totalReportsDelivered: 4,
          totalRevenue: 12000,
          tenureWeeks: 14,
          preferences: ["youth"],
          status: "active",
          lastInteractionWeek: 7,
          lastInteractionSeason: 2,
        },
      ],
    });
    beforeWeek.finances!.balance = 2_500;
    beforeWeek.finances!.retainerContracts = [{ status: "active" } as never];

    const processed = processWeeklyRoleResponsibilities({
      beforeWeek,
      state: beforeWeek,
    });

    expect(processed.scout.reputation).toBe(57);
    expect(processed.finances?.clientRelationships[0]).toMatchObject({
      clubId: "client-1",
      satisfaction: 57,
      lastInteractionWeek: 8,
      lastInteractionSeason: 2,
    });
    expect(processed.inbox.at(-1)?.title).toBe("Runway pressure dictated the week");
  });

  test("forces agency leaders to address low-morale staff", () => {
    const beforeWeek = baseState({
      scout: {
        careerTier: 5,
        careerPath: "independent",
        currentClubId: undefined,
        reputation: 67,
        clubTrust: 0,
      },
      activities: [activity("writeReport")],
      employees: [
        {
          id: "employee-1",
          name: "Morgan Vale",
          role: "analyst",
          quality: 64,
          salary: 1800,
          morale: 40,
          fatigue: 20,
          hiredWeek: 1,
          hiredSeason: 2,
          reportsGenerated: [],
          experience: 4,
          weeklyLog: [],
          regionFocusWeeks: 0,
        },
      ],
    });

    const processed = processWeeklyRoleResponsibilities({
      beforeWeek,
      state: beforeWeek,
    });

    expect(processed.scout.reputation).toBe(66);
    expect(processed.finances?.employees[0]).toMatchObject({
      id: "employee-1",
      morale: 36,
    });
    expect(processed.inbox.at(-1)?.title).toBe("Staff quality debt is accumulating");
  });

  test("uses the effective independent tier for weekly role accountability", () => {
    const beforeWeek = baseState({
      scout: {
        careerTier: 2,
        independentTier: 2,
        careerPath: "independent",
        currentClubId: undefined,
        reputation: 58,
        clubTrust: 0,
      },
      activities: [activity("schoolMatch")],
      clients: [
        {
          clubId: "client-1",
          satisfaction: 61,
          totalReportsDelivered: 4,
          totalRevenue: 12000,
          tenureWeeks: 14,
          preferences: ["youth"],
          status: "active",
          lastInteractionWeek: 7,
          lastInteractionSeason: 2,
        },
      ],
    });
    beforeWeek.finances!.balance = 2_500;
    beforeWeek.finances!.independentTier = 3 as never;
    beforeWeek.finances!.retainerContracts = [{ status: "active" } as never];

    const processed = processWeeklyRoleResponsibilities({
      beforeWeek,
      state: beforeWeek,
    });

    expect(processed.scout.reputation).toBe(57);
    expect(processed.inbox.at(-1)?.title).toBe("Runway pressure dictated the week");
    expect(processed.consequenceState.facts["fact:career-role:s2w8"]?.value).toMatchObject({
      path: "independent",
      tier: 3,
      outcome: "warning",
    });
  });
});
