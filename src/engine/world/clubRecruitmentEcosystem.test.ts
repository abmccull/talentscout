import { describe, expect, it } from "vitest";

import type { GameState } from "@/engine/core/types";
import { deriveClubRecruitmentEcosystem } from "./clubRecruitmentEcosystem";

function buildState(): GameState {
  return {
    seed: "ecosystem-seed",
    currentSeason: 6,
    currentWeek: 20,
    countries: ["england", "spain"],
    scout: {
      id: "scout-1",
      homeCountry: "england",
      countryReputations: {},
    },
    territories: {
      te: { id: "te", country: "england", countryKey: "england", leagueIds: ["prem"] },
      ts: { id: "ts", country: "spain", countryKey: "spain", leagueIds: ["laliga"] },
    },
    leagues: {
      prem: { id: "prem", name: "Premier League", shortName: "EPL", country: "england", tier: 1, clubIds: ["club-england"], season: 6 },
      laliga: { id: "laliga", name: "La Liga", shortName: "LAL", country: "spain", tier: 1, clubIds: ["club-spain"], season: 6 },
    },
    clubs: {
      "club-england": {
        id: "club-england",
        name: "Northcastle",
        shortName: "NCL",
        leagueId: "prem",
        reputation: 80,
        budget: 6500000,
        scoutingPhilosophy: "winNow",
        managerId: "m1",
        playerIds: ["pe1", "pe2"],
        youthAcademyRating: 9,
      },
      "club-spain": {
        id: "club-spain",
        name: "Cantera Azul",
        shortName: "CAZ",
        leagueId: "laliga",
        reputation: 64,
        budget: 2800000,
        scoutingPhilosophy: "academyFirst",
        managerId: "m2",
        playerIds: ["ps1", "ps2", "ps3"],
        youthAcademyRating: 18,
      },
    },
    players: {
      pe1: { id: "pe1", clubId: "club-england", contractClubId: "club-england", age: 29, position: "ST", currentAbility: 178, potentialAbility: 178 },
      pe2: { id: "pe2", clubId: "club-england", contractClubId: "club-england", age: 27, position: "CB", currentAbility: 170, potentialAbility: 170 },
      ps1: { id: "ps1", clubId: "club-spain", contractClubId: "club-spain", age: 18, position: "LW", currentAbility: 88, potentialAbility: 158 },
      ps2: { id: "ps2", clubId: "club-spain", contractClubId: "club-spain", age: 19, position: "CM", currentAbility: 91, potentialAbility: 152 },
      ps3: { id: "ps3", clubId: "club-spain", contractClubId: "club-spain", age: 23, position: "ST", currentAbility: 112, potentialAbility: 134 },
      sourceA: { id: "sourceA", clubId: "club-source-a", contractClubId: "club-source-a", age: 18, position: "LW", currentAbility: 86, potentialAbility: 150 },
      sourceB: { id: "sourceB", clubId: "club-source-b", contractClubId: "club-source-b", age: 22, position: "CM", currentAbility: 104, potentialAbility: 120 },
    },
    fixtures: {
      fx1: { id: "fx1", homeClubId: "club-spain", awayClubId: "club-spain", leagueId: "laliga", season: 4, week: 5, played: true },
      fx2: { id: "fx2", homeClubId: "club-spain", awayClubId: "club-spain", leagueId: "laliga", season: 5, week: 7, played: true },
    },
    matchRatings: {
      fx1: {
        sourceA: { rating: 7.2, started: true, minutesPlayed: 90, stats: {} },
      },
      fx2: {
        sourceB: { rating: 6.9, started: true, minutesPlayed: 90, stats: {} },
      },
    },
    playerMovementHistory: [
      { id: "mv1", playerId: "sourceA", type: "permanentTransfer", season: 4, week: 1, fromClubId: "club-source-a", toClubId: "club-spain" },
      { id: "mv2", playerId: "sourceB", type: "permanentTransfer", season: 5, week: 1, fromClubId: "club-source-b", toClubId: "club-spain" },
    ],
    managerProfiles: {
      "club-england": { clubId: "club-england", managerName: "Urgent Boss", preference: "eyeTest", reportInfluence: 0.8, preferredFormation: "4-2-3-1" },
      "club-spain": { clubId: "club-spain", managerName: "Patient Coach", preference: "balanced", reportInfluence: 0.5, preferredFormation: "4-3-3" },
    },
    regionalKnowledge: {
      spain: {
        countryId: "spain",
        knowledgeLevel: 40,
        discoveredLeagues: [],
        culturalInsights: [],
        localContacts: [],
        scoutingEfficiency: 1,
      },
      england: {
        countryId: "england",
        knowledgeLevel: 55,
        discoveredLeagues: [],
        culturalInsights: [],
        localContacts: [],
        scoutingEfficiency: 1,
      },
    },
    worldConditionState: {
      version: 1,
      activeSeason: 6,
      active: [],
      history: [],
    },
    worldConditionArcState: { version: 1, active: {}, completed: [] },
    contacts: {},
    unsignedYouth: {},
    youthTournaments: {},
    subRegions: {},
    finances: { satelliteOffices: [], employees: [] },
    assistantScouts: [],
    npcScouts: {},
    retiredPlayers: {},
  } as unknown as GameState;
}

describe("deriveClubRecruitmentEcosystem", () => {
  it("is deterministic and ignores hidden ability changes", () => {
    const state = buildState();
    const first = deriveClubRecruitmentEcosystem(state, "club-spain");
    const second = deriveClubRecruitmentEcosystem(state, "club-spain");
    expect(first).toEqual(second);

    const mutated = {
      ...state,
      players: {
        ...state.players,
        sourceA: {
          ...state.players.sourceA,
          currentAbility: 4,
          potentialAbility: 200,
        },
      },
    } as GameState;
    expect(deriveClubRecruitmentEcosystem(mutated, "club-spain")).toEqual(first);
  });

  it("produces different ecosystems for different club doctrines and histories", () => {
    const state = buildState();
    const youth = deriveClubRecruitmentEcosystem(state, "club-spain");
    const winNow = deriveClubRecruitmentEcosystem(state, "club-england");
    expect(youth?.leadershipCenter).not.toBeUndefined();
    expect(youth?.pathwayTolerance).toBeGreaterThan(winNow?.pathwayTolerance ?? 0);
    expect(youth?.trustedLanes).not.toEqual(winNow?.trustedLanes ?? []);
    expect(youth?.favoredTerritories.length).toBeGreaterThan(0);
  });
});
