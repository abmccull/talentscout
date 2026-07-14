import { describe, expect, it } from "vitest";
import type { CountryReputation, GameState } from "@/engine/core/types";
import {
  countDistinctReportCases,
  countCountriesScouted,
  countReportedPositions,
  countWonderkidDiscoveries,
  getAchievementProgress,
} from "@/engine/core/achievementEngine";
import { ACHIEVEMENTS } from "@/lib/achievements";

function country(
  id: string,
  overrides: Partial<CountryReputation> = {},
): CountryReputation {
  return {
    country: id,
    familiarity: 0,
    reportsSubmitted: 0,
    successfulFinds: 0,
    contactCount: 0,
    ...overrides,
  };
}

function stateWithCountries(
  countryReputations: Record<string, CountryReputation>,
): GameState {
  return { scout: { countryReputations } } as unknown as GameState;
}

describe("achievement integrity", () => {
  it("does not award global progress for dormant world records", () => {
    const reputations = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => {
        const id = `country-${index}`;
        return [id, country(id, index === 0 ? { familiarity: 50 } : {})];
      }),
    );
    const state = stateWithCountries(reputations);
    const frequentFlyer = ACHIEVEMENTS.find(
      (achievement) => achievement.id === "countries-3",
    );

    expect(countCountriesScouted(state)).toBe(0);
    expect(frequentFlyer?.check(state)).toBe(false);
    expect(getAchievementProgress(state, "countries-3")).toMatchObject({
      current: 0,
      target: 3,
      percentage: 0,
    });
  });

  it("counts countries only after meaningful scouting activity", () => {
    const state = stateWithCountries({
      england: country("england", { familiarity: 51 }),
      france: country("france", { reportsSubmitted: 1 }),
      brazil: country("brazil", { contactCount: 1 }),
      germany: country("germany"),
    });
    const frequentFlyer = ACHIEVEMENTS.find(
      (achievement) => achievement.id === "countries-3",
    );

    expect(countCountriesScouted(state)).toBe(3);
    expect(frequentFlyer?.check(state)).toBe(true);
    expect(getAchievementProgress(state, "countries-3")?.current).toBe(3);
  });

  it("counts only genuine wonderkid discoveries in unlocks and progress", () => {
    const state = {
      discoveryRecords: [
        { playerId: "ordinary-1", wasWonderkid: false },
        { playerId: "ordinary-2", wasWonderkid: false },
        { playerId: "wonderkid-1", wasWonderkid: true },
      ],
    } as unknown as GameState;
    const firstWonderkid = ACHIEVEMENTS.find(
      (achievement) => achievement.id === "wonderkid-found",
    );
    const fiveWonderkids = ACHIEVEMENTS.find(
      (achievement) => achievement.id === "discoveries-5",
    );

    expect(countWonderkidDiscoveries(state)).toBe(1);
    expect(firstWonderkid?.check(state)).toBe(true);
    expect(fiveWonderkids?.check(state)).toBe(false);
    expect(getAchievementProgress(state, "discoveries-5")).toMatchObject({
      current: 1,
      target: 5,
      percentage: 20,
    });
  });

  it("counts report cases rather than revisions", () => {
    const reports = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [
        `report-${index + 1}`,
        {
          id: `report-${index + 1}`,
          caseId: "one-case",
          scoutId: "scout-1",
          playerId: "player-1",
          submittedSeason: 1,
          submittedWeek: index + 1,
          revision: index + 1,
        },
      ]),
    );
    const state = { reports } as unknown as GameState;
    const prolific = ACHIEVEMENTS.find(
      (achievement) => achievement.id === "reports-10",
    );

    expect(countDistinctReportCases(state)).toBe(1);
    expect(prolific?.check(state)).toBe(false);
    expect(getAchievementProgress(state, "reports-10")).toMatchObject({
      current: 1,
      target: 10,
      percentage: 10,
    });
  });

  it("resolves unsigned youth for generational and position achievements", () => {
    const positions = ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST"];
    const unsignedYouth = Object.fromEntries(
      positions.map((position, index) => [
        `youth-${index}`,
        {
          id: `youth-${index}`,
          player: {
            id: `player-${index}`,
            position,
            wonderkidTier: index === 0 ? "generational" : undefined,
          },
        },
      ]),
    );
    const reports = Object.fromEntries(
      positions.map((_, index) => [
        `report-${index}`,
        {
          id: `report-${index}`,
          scoutId: "scout-1",
          playerId: `player-${index}`,
          submittedSeason: 1,
          submittedWeek: index + 1,
        },
      ]),
    );
    const state = {
      players: {},
      retiredPlayers: {},
      unsignedYouth,
      reports,
      discoveryRecords: [{ playerId: "player-0", wasWonderkid: true }],
    } as unknown as GameState;
    const generational = ACHIEVEMENTS.find(
      (achievement) => achievement.id === "generational-talent",
    );
    const fullHouse = ACHIEVEMENTS.find(
      (achievement) => achievement.id === "full-house",
    );

    expect(generational?.check(state)).toBe(true);
    expect(countReportedPositions(state)).toBe(10);
    expect(fullHouse?.check(state)).toBe(true);
    expect(getAchievementProgress(state, "full-house")?.current).toBe(10);
  });

  it("requires reports from all six football continents", () => {
    const nationalities = [
      "English",
      "Brazilian",
      "American",
      "Nigerian",
      "Japanese",
      "Australian",
    ];
    const players = Object.fromEntries(
      nationalities.slice(0, 5).map((nationality, index) => [
        `player-${index}`,
        { id: `player-${index}`, nationality },
      ]),
    );
    const unsignedYouth = {
      "youth-5": {
        id: "youth-5",
        player: { id: "player-5", nationality: nationalities[5] },
      },
    };
    const reports = Object.fromEntries(
      nationalities.map((_, index) => [
        `report-${index}`,
        { id: `report-${index}`, playerId: `player-${index}` },
      ]),
    );
    const achievement = ACHIEVEMENTS.find(
      (candidate) => candidate.id === "all-continents",
    );
    const fiveContinents = {
      players,
      unsignedYouth,
      retiredPlayers: {},
      reports: Object.fromEntries(Object.entries(reports).slice(0, 5)),
    } as unknown as GameState;
    const sixContinents = {
      players,
      unsignedYouth,
      retiredPlayers: {},
      reports,
    } as unknown as GameState;

    expect(achievement?.check(fiveContinents)).toBe(false);
    expect(achievement?.check(sixContinents)).toBe(true);
  });
});
