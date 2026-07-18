import { describe, expect, it } from "vitest";

import type {
  Club,
  GameState,
  ManagerProfile,
} from "@/engine/core/types";
import type {
  WorldHistoryState,
  WorldSeasonHistory,
} from "@/engine/world/worldHistory";
import type { WorldConditionModifiers } from "@/engine/world/worldConditions";
import {
  applyClubPhilosophySeasonStart,
  migrateClubPhilosophyTransitionState,
  type ClubPhilosophyTransitionRecord,
} from "@/engine/world/clubPhilosophyTransitions";

function buildWorldHistory(club: Club, manager: ManagerProfile): WorldHistoryState {
  const season: WorldSeasonHistory = {
    season: 5,
    recordedAfterTotalWeeks: 190,
    leagues: [
      {
        leagueId: "prem",
        country: "england",
        tier: 1,
        clubCount: 20,
        playedFixtures: 380,
      },
    ],
    clubs: [
      {
        clubId: club.id,
        leagueId: club.leagueId,
        standing: {
          position: 17,
          tableSize: 20,
          played: 38,
          won: 9,
          drawn: 10,
          lost: 19,
          goalsFor: 39,
          goalsAgainst: 58,
          goalDifference: -19,
          points: 37,
        },
        leagueMovement: "stayed",
        nextLeagueId: club.leagueId,
        reputation: 66,
        budget: 2_900_000,
        scoutingPhilosophy: club.scoutingPhilosophy,
        manager: {
          managerId: manager.managerId ?? club.managerId,
          managerName: manager.managerName,
          scoutingPreference: manager.preference,
          reportInfluence: manager.reportInfluence,
          preferredFormation: manager.preferredFormation,
        },
      },
    ],
    players: [],
    playerMovementSummaries: [],
  };
  return {
    version: 1,
    latestRecordedSeason: 5,
    seasons: [season],
  };
}

function modifier(partial: Partial<WorldConditionModifiers> = {}): WorldConditionModifiers {
  return {
    discoveryMultiplier: 1,
    observationConfidenceMultiplier: 1,
    opportunityMultiplier: 1,
    developmentMultiplier: 1,
    breakthroughMultiplier: 1,
    recruitmentScoreAdjustment: 0,
    travelCostMultiplier: 1,
    travelDurationDelta: 0,
    travelFatigueMultiplier: 1,
    marketplaceValueMultiplier: 1,
    rivalPressureMultiplier: 1,
    seasonalFinanceAdjustment: 0,
    ...partial,
  };
}

function buildState(): GameState {
  const club: Club = {
    id: "club-a",
    name: "Northcastle",
    shortName: "NCL",
    leagueId: "prem",
    reputation: 66,
    budget: 2_900_000,
    scoutingPhilosophy: "winNow",
    managerId: "manager-a",
    playerIds: [],
    youthAcademyRating: 14,
  };
  const manager: ManagerProfile = {
    clubId: club.id,
    managerId: club.managerId,
    managerName: "Elliot Marsh",
    preference: "dataFirst",
    reportInfluence: 0.82,
    preferredFormation: "4-3-3",
  };
  return {
    seed: "club-philosophy-seed",
    currentSeason: 6,
    currentWeek: 1,
    countries: ["england"],
    scout: {
      id: "scout-1",
      homeCountry: "england",
      countryReputations: {},
    },
    leagues: {
      prem: {
        id: "prem",
        name: "Premier League",
        shortName: "EPL",
        country: "england",
        tier: 1,
        clubIds: [club.id],
        season: 6,
      },
    },
    clubs: {
      [club.id]: club,
    },
    managerProfiles: {
      [club.id]: manager,
    },
    worldHistory: buildWorldHistory(club, manager),
    worldConditionState: {
      version: 1,
      activeSeason: 6,
      active: [
        {
          id: "wc-global-credit",
          definitionId: "credit-squeeze",
          scope: "global",
          season: 6,
          modifiers: modifier({
            opportunityMultiplier: 0.94,
            recruitmentScoreAdjustment: -5,
            travelCostMultiplier: 1.08,
            marketplaceValueMultiplier: 0.88,
            seasonalFinanceAdjustment: -900,
          }),
        },
        {
          id: "wc-england-media",
          definitionId: "local-media-scrutiny",
          scope: "regional",
          season: 6,
          countryId: "england",
          modifiers: modifier({
            observationConfidenceMultiplier: 0.95,
            opportunityMultiplier: 1.08,
            recruitmentScoreAdjustment: -2,
            marketplaceValueMultiplier: 1.08,
            rivalPressureMultiplier: 1.18,
          }),
        },
      ],
      history: [],
    },
  } as unknown as GameState;
}

describe("club philosophy transitions", () => {
  it("deterministically applies at most one transition per club per season", () => {
    const state = buildState();
    const first = applyClubPhilosophySeasonStart(state);
    const second = applyClubPhilosophySeasonStart(first);

    expect(first.clubs["club-a"].scoutingPhilosophy).toBe("marketSmart");
    expect(first.clubPhilosophyTransitionState?.activeSeason).toBe(6);
    expect(first.clubPhilosophyTransitionState?.history).toHaveLength(1);
    expect(first.clubPhilosophyTransitionState?.history[0]).toMatchObject({
      clubId: "club-a",
      season: 6,
      fromPhilosophy: "winNow",
      toPhilosophy: "marketSmart",
    });
    expect(first.clubPhilosophyTransitionState?.history[0].reasonCodes).toEqual(
      expect.arrayContaining([
        "leadershipDataTurn",
        "budgetPressure",
        "resultsPressure",
        "worldContraction",
      ]),
    );
    expect(first.clubPhilosophyTransitionState?.history[0].worldConditionNames).toContain(
      "Credit Squeeze",
    );
    expect(second).toEqual(first);
  });

  it("respects existing same-season records when reloaded during a processed season", () => {
    const state = buildState();
    const existing: ClubPhilosophyTransitionRecord = {
      id: "club-philosophy:s6:club-a",
      clubId: "club-a",
      season: 6,
      leagueId: "prem",
      countryId: "england",
      fromPhilosophy: "winNow",
      toPhilosophy: "marketSmart",
      managerId: "manager-a",
      managerPreference: "dataFirst",
      reportInfluence: 0.82,
      standingSummary: "17/20",
      leagueMovement: "stayed",
      worldConditionNames: ["Credit Squeeze"],
      reasonCodes: ["leadershipDataTurn", "worldContraction"],
      reasons: [
        "The manager pushes for cleaner pricing, stronger proof, and more data-led decisions.",
      ],
    };
    const reloaded = applyClubPhilosophySeasonStart({
      ...state,
      clubs: {
        ...state.clubs,
        "club-a": {
          ...state.clubs["club-a"],
          scoutingPhilosophy: "marketSmart",
        },
      },
      clubPhilosophyTransitionState: {
        version: 1,
        activeSeason: 5,
        history: [existing],
      },
    } as GameState);

    expect(reloaded.clubPhilosophyTransitionState?.activeSeason).toBe(6);
    expect(reloaded.clubPhilosophyTransitionState?.history).toHaveLength(1);
    expect(reloaded.clubPhilosophyTransitionState?.history[0]).toEqual(existing);
    expect(reloaded.clubs["club-a"].scoutingPhilosophy).toBe("marketSmart");
  });

  it("migrates missing or malformed legacy state into a safe deterministic baseline", () => {
    expect(migrateClubPhilosophyTransitionState(undefined, 6)).toEqual({
      version: 1,
      activeSeason: 5,
      history: [],
    });

    const migrated = migrateClubPhilosophyTransitionState(
      {
        activeSeason: "bad",
        history: [
          {
            id: "club-philosophy:s6:club-a",
            clubId: "club-a",
            season: 6,
            leagueId: "prem",
            fromPhilosophy: "winNow",
            toPhilosophy: "marketSmart",
            worldConditionNames: ["Credit Squeeze", "Credit Squeeze"],
            reasonCodes: ["worldContraction", "worldContraction"],
            reasons: ["Reason A", "Reason A"],
          },
          {
            id: "club-philosophy:s6:club-a:duplicate",
            clubId: "club-a",
            season: 6,
            leagueId: "prem",
            fromPhilosophy: "winNow",
            toPhilosophy: "marketSmart",
            worldConditionNames: ["Credit Squeeze"],
            reasonCodes: ["worldContraction"],
            reasons: ["Reason B"],
          },
          {
            id: "broken",
            clubId: 42,
          },
        ],
      },
      6,
    );

    expect(migrated.activeSeason).toBe(5);
    expect(migrated.history).toHaveLength(1);
    expect(migrated.history[0]).toMatchObject({
      clubId: "club-a",
      season: 6,
      fromPhilosophy: "winNow",
      toPhilosophy: "marketSmart",
      reasonCodes: ["worldContraction"],
      reasons: ["Reason B"],
      worldConditionNames: ["Credit Squeeze"],
    });
  });
});
