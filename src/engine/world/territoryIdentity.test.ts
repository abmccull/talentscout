import { describe, expect, it } from "vitest";

import type { GameState } from "@/engine/core/types";
import { deriveTerritoryIdentity } from "./territoryIdentity";

function buildState(): GameState {
  return {
    seed: "territory-seed",
    currentSeason: 3,
    currentWeek: 9,
    countries: ["england", "spain", "italy"],
    scout: {
      id: "scout-1",
      homeCountry: "england",
      currentClubId: "club-england",
      currentReputation: 52,
      careerTier: 3,
      countryReputations: {
        england: { country: "england", familiarity: 65, reportsSubmitted: 4, successfulFinds: 2, contactCount: 3 },
        spain: { country: "spain", familiarity: 28, reportsSubmitted: 1, successfulFinds: 0, contactCount: 1 },
      },
    },
    contacts: {
      c1: {
        id: "c1",
        name: "Madrid Organizer",
        dormant: false,
        country: "spain",
        relationship: 72,
        trustLevel: 68,
      },
    },
    territories: {
      tEngland: { id: "tEngland", country: "england", countryKey: "england", leagueIds: ["prem"] },
      tSpain: { id: "tSpain", country: "spain", countryKey: "spain", leagueIds: ["laliga"] },
    },
    leagues: {
      prem: { id: "prem", name: "Premier League", shortName: "EPL", country: "england", tier: 1, clubIds: ["club-england"], season: 3 },
      laliga: { id: "laliga", name: "La Liga", shortName: "LAL", country: "spain", tier: 1, clubIds: ["club-spain-a", "club-spain-b"], season: 3 },
    },
    clubs: {
      "club-england": {
        id: "club-england",
        name: "Northcastle",
        shortName: "NCL",
        leagueId: "prem",
        reputation: 72,
        budget: 6000000,
        scoutingPhilosophy: "winNow",
        managerId: "m1",
        playerIds: ["p1", "p2"],
        youthAcademyRating: 12,
      },
      "club-spain-a": {
        id: "club-spain-a",
        name: "Cantera Azul",
        shortName: "CAZ",
        leagueId: "laliga",
        reputation: 66,
        budget: 3000000,
        scoutingPhilosophy: "academyFirst",
        managerId: "m2",
        playerIds: ["p3", "p4"],
        youthAcademyRating: 18,
      },
      "club-spain-b": {
        id: "club-spain-b",
        name: "Mercado CF",
        shortName: "MCF",
        leagueId: "laliga",
        reputation: 58,
        budget: 2200000,
        scoutingPhilosophy: "marketSmart",
        managerId: "m3",
        playerIds: ["p5"],
        youthAcademyRating: 11,
      },
    },
    players: {
      p1: { id: "p1", clubId: "club-england", contractClubId: "club-england", age: 28, position: "CM", currentAbility: 200, potentialAbility: 200 },
      p2: { id: "p2", clubId: "club-england", contractClubId: "club-england", age: 25, position: "CB", currentAbility: 180, potentialAbility: 180 },
      p3: { id: "p3", clubId: "club-spain-a", contractClubId: "club-spain-a", age: 18, position: "ST", currentAbility: 90, potentialAbility: 155 },
      p4: { id: "p4", clubId: "club-spain-a", contractClubId: "club-spain-a", age: 19, position: "LW", currentAbility: 88, potentialAbility: 150 },
      p5: { id: "p5", clubId: "club-spain-b", contractClubId: "club-spain-b", age: 24, position: "RB", currentAbility: 120, potentialAbility: 132 },
    },
    fixtures: {
      f1: { id: "f1", homeClubId: "club-england", awayClubId: "club-england", leagueId: "prem", season: 3, week: 4, played: true },
      f2: { id: "f2", homeClubId: "club-spain-a", awayClubId: "club-spain-b", leagueId: "laliga", season: 3, week: 4, played: true },
    },
    subRegions: {
      sr1: { id: "sr1", name: "Madrid", country: "spain", countryKey: "spain", familiarity: 20 },
      sr2: { id: "sr2", name: "North East", country: "england", countryKey: "england", familiarity: 35 },
    },
    unsignedYouth: {
      uy1: { id: "uy1", player: { id: "uy1-p", age: 16, position: "ST" }, country: "spain", countryKey: "spain", regionId: "sr1" },
    },
    youthTournaments: {
      yt1: { id: "yt1", name: "Madrid Futures", country: "spain", countryKey: "spain" },
    },
    regionalKnowledge: {
      england: {
        countryId: "england",
        knowledgeLevel: 52,
        discoveredLeagues: [],
        culturalInsights: [],
        localContacts: [],
        scoutingEfficiency: 1,
      },
      spain: {
        countryId: "spain",
        knowledgeLevel: 48,
        discoveredLeagues: [],
        culturalInsights: [{
          id: "culture:spain:playingStyle:v1",
          type: "playingStyle",
          description: "The local game rewards combination play and receiving under pressure.",
          gameplayEffect: "Better live reads on technical-tactical actions.",
        }],
        localContacts: ["contact-spain-1"],
        scoutingEfficiency: 1,
      },
    },
    worldConditionState: {
      version: 1,
      activeSeason: 3,
      active: [
        {
          id: "wc-showcase",
          definitionId: "showcase-circuit",
          scope: "regional",
          season: 3,
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
    managerProfiles: {
      "club-england": { clubId: "club-england", managerName: "Pragmatic Boss", preference: "eyeTest", reportInfluence: 0.7, preferredFormation: "4-3-3" },
      "club-spain-a": { clubId: "club-spain-a", managerName: "Academy Coach", preference: "balanced", reportInfluence: 0.6, preferredFormation: "4-3-3" },
      "club-spain-b": { clubId: "club-spain-b", managerName: "Trader Coach", preference: "dataDriven", reportInfluence: 0.55, preferredFormation: "4-2-3-1" },
    },
    finances: {
      satelliteOffices: [{
        id: "office-spain",
        region: "spain",
        employeeIds: [],
        monthlyCost: 1200,
        qualityBonus: 0.3,
      }],
      employees: [],
    },
    assistantScouts: [],
    npcScouts: {},
    playerMovementHistory: [],
  } as unknown as GameState;
}

describe("deriveTerritoryIdentity", () => {
  it("is deterministic and excludes ghost countries", () => {
    const state = buildState();
    const first = deriveTerritoryIdentity(state, "spain");
    const second = deriveTerritoryIdentity(state, "spain");
    expect(first).toEqual(second);
    expect(deriveTerritoryIdentity(state, "italy")).toBeNull();
  });

  it("does not change when hidden ability values change without visible world changes", () => {
    const state = buildState();
    const baseline = deriveTerritoryIdentity(state, "spain");
    const mutated = {
      ...state,
      players: {
        ...state.players,
        p3: {
          ...state.players.p3,
          currentAbility: 12,
          potentialAbility: 220,
        },
      },
    } as GameState;
    expect(deriveTerritoryIdentity(mutated, "spain")).toEqual(baseline);
  });

  it("produces materially different territory outputs from different world states", () => {
    const state = buildState();
    const england = deriveTerritoryIdentity(state, "england");
    const spain = deriveTerritoryIdentity(state, "spain");
    expect(england?.archetype).not.toBe(spain?.archetype);
    expect(spain?.opportunityWindow).toBe("urgent");
    expect(spain?.stakeholderClimate.rival.rivalHeat).toBeGreaterThan(
      england?.stakeholderClimate.rival.rivalHeat ?? 0,
    );
  });
});
