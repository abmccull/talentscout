import { describe, expect, it } from "vitest";

import type { GameState } from "@/engine/core/types";
import {
  deriveWorldConditionStakeholderClimate,
  deriveWorldConditionStakeholderMatrix,
} from "./worldConditionStakeholders";

function buildState(): GameState {
  return {
    seed: "stakeholder-seed",
    currentSeason: 5,
    currentWeek: 12,
    countries: ["england", "spain"],
    scout: {
      id: "scout-1",
      homeCountry: "england",
      currentClubId: "club-a",
      countryReputations: {},
    },
    clubs: {
      "club-a": {
        id: "club-a",
        name: "Northcastle",
        shortName: "NCL",
        leagueId: "prem",
        reputation: 75,
        budget: 5000000,
        scoutingPhilosophy: "winNow",
        managerId: "m1",
        playerIds: [],
        youthAcademyRating: 10,
      },
      "club-b": {
        id: "club-b",
        name: "Cantera Azul",
        shortName: "CAZ",
        leagueId: "laliga",
        reputation: 62,
        budget: 2800000,
        scoutingPhilosophy: "academyFirst",
        managerId: "m2",
        playerIds: [],
        youthAcademyRating: 18,
      },
    },
    leagues: {
      prem: { id: "prem", name: "Premier League", shortName: "EPL", country: "england", tier: 1, clubIds: ["club-a"], season: 5 },
      laliga: { id: "laliga", name: "La Liga", shortName: "LAL", country: "spain", tier: 1, clubIds: ["club-b"], season: 5 },
    },
    managerProfiles: {
      "club-a": { clubId: "club-a", managerName: "Urgent Boss", preference: "eyeTest", reportInfluence: 0.8, preferredFormation: "4-2-3-1" },
      "club-b": { clubId: "club-b", managerName: "Patient Coach", preference: "balanced", reportInfluence: 0.5, preferredFormation: "4-3-3" },
    },
    worldConditionState: {
      version: 1,
      activeSeason: 5,
      active: [
        {
          id: "wc-global",
          definitionId: "credit-squeeze",
          scope: "global",
          season: 5,
          modifiers: {
            discoveryMultiplier: 1,
            observationConfidenceMultiplier: 1,
            opportunityMultiplier: 0.94,
            developmentMultiplier: 1,
            breakthroughMultiplier: 1,
            recruitmentScoreAdjustment: -5,
            travelCostMultiplier: 1.08,
            travelDurationDelta: 0,
            travelFatigueMultiplier: 1,
            marketplaceValueMultiplier: 0.88,
            rivalPressureMultiplier: 1,
            seasonalFinanceAdjustment: -900,
          },
        },
        {
          id: "wc-spain",
          definitionId: "showcase-circuit",
          scope: "regional",
          season: 5,
          countryId: "spain",
          modifiers: {
            discoveryMultiplier: 1.35,
            observationConfidenceMultiplier: 1.08,
            opportunityMultiplier: 1.35,
            developmentMultiplier: 1,
            breakthroughMultiplier: 1,
            recruitmentScoreAdjustment: 0,
            travelCostMultiplier: 1,
            travelDurationDelta: 0,
            travelFatigueMultiplier: 1,
            marketplaceValueMultiplier: 1,
            rivalPressureMultiplier: 1.15,
            seasonalFinanceAdjustment: 0,
          },
        },
      ],
      history: [],
    },
    worldConditionArcState: { version: 1, active: {}, completed: [] },
  } as unknown as GameState;
}

describe("world condition stakeholder climate", () => {
  it("is deterministic and role-specific", () => {
    const state = buildState();
    const first = deriveWorldConditionStakeholderClimate(state, {
      role: "organizer",
      countryId: "spain",
    });
    const second = deriveWorldConditionStakeholderClimate(state, {
      role: "organizer",
      countryId: "spain",
    });
    expect(first).toEqual(second);
    expect(first.accessFriction).not.toBe(
      deriveWorldConditionStakeholderClimate(state, { role: "agent", countryId: "spain" }).accessFriction,
    );
  });

  it("differentiates countries and club politics", () => {
    const state = buildState();
    const spain = deriveWorldConditionStakeholderMatrix(state, { countryId: "spain", clubId: "club-b" });
    const england = deriveWorldConditionStakeholderMatrix(state, { countryId: "england", clubId: "club-a" });
    expect(spain.climates.rival.rivalHeat).toBeGreaterThan(england.climates.rival.rivalHeat);
    expect(spain.climates.manager.patience).toBeGreaterThan(england.climates.manager.patience);
    expect(england.climates.clubDirector.evidenceScrutiny).toBeGreaterThan(0);
  });
});
