import { describe, expect, it } from "vitest";

import { createConsequenceEngineState } from "@/engine/consequences";
import type { Activity, GameState, Scout } from "@/engine/core/types";
import { processWeeklyPostTickSystems } from "@/stores/actions/weeklyPostTickSystems";

function activity(type: Activity["type"]): Activity {
  return {
    id: `activity-${type}`,
    type,
    description: type,
    slots: 1,
  } as unknown as Activity;
}

function scout(overrides: Partial<Scout> = {}): Scout {
  return {
    id: "scout-1",
    firstName: "Ari",
    lastName: "Cole",
    careerTier: 3,
    careerPath: "club",
    currentClubId: "club-1",
    primarySpecialization: "youth",
    reputation: 60,
    clubTrust: 50,
    specializationReputation: 40,
    fatigue: 18,
    ...overrides,
  } as Scout;
}

function state(): GameState {
  return {
    seed: "role-phase-seed",
    currentWeek: 8,
    currentSeason: 2,
    scout: scout(),
    schedule: {
      week: 8,
      season: 2,
      activities: [
        activity("schoolMatch"),
        activity("networkMeeting"),
        null,
        null,
        null,
        null,
        null,
      ],
      completed: false,
    },
    consequenceState: createConsequenceEngineState(),
    inbox: [],
    contacts: {},
    finances: {
      balance: 6_000,
      monthlyIncome: 0,
      expenses: {} as never,
      equipmentLevel: 1,
      transactions: [],
      careerPath: "club",
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
      employees: [],
      analystReviews: [],
      lifestyle: {} as never,
      completedCourses: [],
      pendingRetainerOffers: [],
      pendingConsultingOffers: [],
      marketTemperature: "warm" as never,
      activeEconomicEvents: [],
      clientRelationships: [],
      pendingEmployeeEvents: [],
      satelliteOffices: [],
      awards: [],
      loans: [],
      starterBonus: {} as never,
    },
    fixtures: {},
    reports: {},
    observations: {},
    clubs: {
      "club-1": {
        id: "club-1",
        name: "Northbridge",
        scoutingPhilosophy: "academyFirst",
        reputation: 72,
      },
    } as never,
    performanceHistory: [],
  } as unknown as GameState;
}

describe("weekly post-tick role accountability", () => {
  it("runs through the post-tick phase and records the completed-week role fact once", () => {
    const beforeWeek = state();
    const afterTick = {
      ...beforeWeek,
      currentWeek: 9,
      scout: {
        ...beforeWeek.scout,
        fatigue: 22,
      },
    };

    const processed = processWeeklyPostTickSystems({
      beforeWeek,
      state: afterTick,
      alumniMilestones: [],
    });

    expect(processed.scout.clubTrust).toBe(51);
    expect(processed.scout.specializationReputation).toBe(41);
    expect(processed.consequenceState.facts["fact:career-role:s2w8"]).toBeTruthy();
    expect(processed.inbox.some((message) => message.title === "Territory ownership paid off")).toBe(true);
  });
});
