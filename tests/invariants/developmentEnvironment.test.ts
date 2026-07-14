import { describe, expect, it } from "vitest";
import type {
  Club,
  Fixture,
  League,
  LoanDeal,
  ManagerProfile,
  Player,
  PlayerMatchRating,
} from "@/engine/core/types";
import { generatePlayer } from "@/engine/players/generation";
import { RNG } from "@/engine/rng";
import {
  PLAYER_DEVELOPMENT_HISTORY_LIMIT,
  appendPlayerDevelopmentHistory,
  compactPlayerDevelopmentHistory,
  createDevelopmentEnvironmentIndex,
  createPlayerDevelopmentHistoryEntry,
  evaluatePlayerDevelopmentEnvironment,
  type PlayerDevelopmentHistoryEntry,
} from "@/engine/world/developmentEnvironment";
import { createRunManifest } from "@/engine/run";
import {
  createWorldConditionState,
  getWorldConditionModifiers,
  type WorldConditionState,
} from "@/engine/world/worldConditions";

function makePlayer(id: string, clubId = ""): Player {
  return {
    ...generatePlayer(new RNG(`development-${id}`), {
      position: "CM",
      ageRange: [19, 19],
      abilityRange: [82, 82],
      nationality: "English",
      clubId,
      firstName: "Pathway",
      lastName: id,
    }),
    id,
    clubId,
  };
}

function makeClub(
  id: string,
  leagueId: string,
  philosophy: Club["scoutingPhilosophy"],
  academy: number,
  playerIds: string[],
): Club {
  return {
    id,
    name: id === "patient" ? "Patient Athletic" : "Pressure United",
    shortName: id.toUpperCase().slice(0, 4),
    leagueId,
    reputation: id === "patient" ? 58 : 86,
    budget: 2_000_000,
    scoutingPhilosophy: philosophy,
    managerId: `manager-${id}`,
    playerIds,
    academyPlayerIds: [],
    youthAcademyRating: academy,
  };
}

function makeLeague(id: string, tier: number, clubId: string): League {
  return {
    id,
    name: id,
    shortName: id.toUpperCase(),
    country: "england",
    tier,
    clubIds: [clubId],
    season: 1,
  };
}

function makeManager(clubId: string): ManagerProfile {
  return {
    clubId,
    managerName: `${clubId} manager`,
    preference: "balanced",
    reportInfluence: 0.5,
    preferredFormation: "4-3-3",
  };
}

describe("player development environment", () => {
  it("reuses one weekly lookup index without changing projections or rescanning fixtures", () => {
    const player = makePlayer("indexed", "patient");
    const loanPlayer = {
      ...makePlayer("indexed-loan", "patient"),
      contractClubId: "pressure",
      loanParentClubId: "pressure",
      onLoan: true,
    };
    const patient = makeClub(
      "patient",
      "league-two",
      "academyFirst",
      16,
      [player.id, loanPlayer.id],
    );
    const pressure = makeClub("pressure", "league-two", "winNow", 8, []);
    const fixtures = Object.fromEntries(
      Array.from({ length: 6 }, (_, index) => {
        const fixture: Fixture = {
          id: `indexed-fixture-${index + 1}`,
          homeClubId: index % 2 === 0 ? patient.id : pressure.id,
          awayClubId: index % 2 === 0 ? pressure.id : patient.id,
          leagueId: "league-two",
          season: 3,
          week: index + 1,
          played: index < 4,
        };
        return [fixture.id, fixture];
      }),
    );
    const matchRatings = Object.fromEntries(
      Object.values(fixtures).slice(0, 3).map((fixture) => {
        const rating: PlayerMatchRating = {
          playerId: player.id,
          fixtureId: fixture.id,
          started: true,
          minutesPlayed: 90,
          rating: 7.1,
          eventCount: 0,
          stats: {},
          source: "simulated",
        };
        return [fixture.id, { [player.id]: rating }];
      }),
    );
    const activeLoan: LoanDeal = {
      id: "indexed-loan",
      playerId: loanPlayer.id,
      parentClubId: pressure.id,
      loanClubId: patient.id,
      startWeek: 1,
      startSeason: 3,
      endWeek: 20,
      endSeason: 3,
      loanFee: 0,
      wageContribution: 50,
      recallClause: true,
      status: "active",
      agreedPlayingTime: "regular",
      performanceRecord: {
        appearances: 5,
        goals: 1,
        assists: 2,
        avgRating: 7,
        developmentDelta: 2,
        parentClubSatisfaction: 70,
        loanClubSatisfaction: 75,
      },
    };
    const state = {
      currentSeason: 3,
      currentWeek: 8,
      clubs: { patient, pressure },
      leagues: { "league-two": makeLeague("league-two", 2, patient.id) },
      players: { [player.id]: player, [loanPlayer.id]: loanPlayer },
      fixtures,
      managerProfiles: {
        patient: makeManager("patient"),
        pressure: makeManager("pressure"),
      },
      matchRatings,
      activeLoans: [activeLoan],
    };
    const index = createDevelopmentEnvironmentIndex(state);

    expect(evaluatePlayerDevelopmentEnvironment(state, player, { index })).toEqual(
      evaluatePlayerDevelopmentEnvironment(state, player),
    );
    expect(evaluatePlayerDevelopmentEnvironment(state, loanPlayer, { index })).toEqual(
      evaluatePlayerDevelopmentEnvironment(state, loanPlayer),
    );

    let fixtureEnumerations = 0;
    const guardedFixtures = new Proxy(fixtures, {
      ownKeys(target) {
        fixtureEnumerations += 1;
        return Reflect.ownKeys(target);
      },
    });
    const guardedState = { ...state, fixtures: guardedFixtures };
    const guardedIndex = createDevelopmentEnvironmentIndex(guardedState);
    expect(fixtureEnumerations).toBe(1);

    evaluatePlayerDevelopmentEnvironment(guardedState, player, { index: guardedIndex });
    evaluatePlayerDevelopmentEnvironment(guardedState, loanPlayer, { index: guardedIndex });

    expect(fixtureEnumerations).toBe(1);
  });

  it("turns visible club and pathway facts into distinct mechanics and explanations", () => {
    const prospect = makePlayer("prospect");
    const competitors = Array.from({ length: 5 }, (_, index) => makePlayer(`competition-${index}`, "pressure"));
    const patient = makeClub("patient", "league-two", "academyFirst", 18, [prospect.id]);
    const pressure = makeClub(
      "pressure",
      "league-one",
      "winNow",
      4,
      [prospect.id, ...competitors.map((player) => player.id)],
    );
    const players = Object.fromEntries([prospect, ...competitors].map((player) => [player.id, player]));
    const state = {
      currentSeason: 1,
      currentWeek: 8,
      clubs: { patient, pressure },
      leagues: {
        "league-two": makeLeague("league-two", 2, patient.id),
        "league-one": makeLeague("league-one", 1, pressure.id),
      },
      players,
      fixtures: {},
      managerProfiles: {
        patient: makeManager("patient"),
        pressure: makeManager("pressure"),
      },
      matchRatings: {},
      activeLoans: [],
    };

    const supportive = evaluatePlayerDevelopmentEnvironment(state, prospect, {
      prospectiveClubId: patient.id,
    });
    const restricted = evaluatePlayerDevelopmentEnvironment(state, prospect, {
      prospectiveClubId: pressure.id,
    });

    expect(supportive.projection.score).toBeGreaterThan(restricted.projection.score);
    expect(supportive.mechanics.growthChanceMultiplier).toBeGreaterThan(
      restricted.mechanics.growthChanceMultiplier,
    );
    expect(supportive.projection.factors.some((factor) => factor.id === "playing-pathway")).toBe(true);
    expect(JSON.stringify(supportive.projection)).not.toMatch(/currentAbility|potentialAbility|random|roll/i);
  });

  it("keeps a bounded, idempotent public history of development turns", () => {
    const player = makePlayer("history", "patient");
    const club = makeClub("patient", "league-two", "academyFirst", 18, [player.id]);
    const state = {
      currentSeason: 1,
      currentWeek: 1,
      clubs: { patient: club },
      leagues: { "league-two": makeLeague("league-two", 2, club.id) },
      players: { [player.id]: player },
      fixtures: {},
      managerProfiles: { patient: makeManager("patient") },
      matchRatings: {},
      activeLoans: [],
    };
    const projection = evaluatePlayerDevelopmentEnvironment(state, player).projection;
    let history: PlayerDevelopmentHistoryEntry[] = [];

    for (let week = 1; week <= PLAYER_DEVELOPMENT_HISTORY_LIMIT + 3; week += 1) {
      history = appendPlayerDevelopmentHistory(
        history,
        createPlayerDevelopmentHistoryEntry(player.id, 1, week, "routine-growth", projection),
      );
    }

    expect(history).toHaveLength(PLAYER_DEVELOPMENT_HISTORY_LIMIT);
    expect(history[0].week).toBe(4);

    const latest = history.at(-1)!;
    expect(appendPlayerDevelopmentHistory(history, latest)).toEqual(history);
    expect(JSON.stringify(history)).not.toMatch(/currentAbility|potentialAbility|probability|random|roll/i);
  });

  it("canonicalizes legacy verbose turns without changing the player-facing timeline", () => {
    const player = makePlayer("legacy-history", "patient");
    const club = makeClub("patient", "league-two", "academyFirst", 18, [player.id]);
    const state = {
      currentSeason: 4,
      currentWeek: 12,
      clubs: { patient: club },
      leagues: { "league-two": makeLeague("league-two", 2, club.id) },
      players: { [player.id]: player },
      fixtures: {},
      managerProfiles: { patient: makeManager("patient") },
      matchRatings: {},
      activeLoans: [],
    };
    const projection = evaluatePlayerDevelopmentEnvironment(state, player).projection;
    const visibleTurn = createPlayerDevelopmentHistoryEntry(
      player.id,
      4,
      12,
      "routine-growth",
      projection,
    );
    const legacyVerboseTurn = {
      ...visibleTurn,
      factors: projection.factors
        .filter((factor) => factor.impact !== "neutral")
        .slice(0, 3)
        .map(({ label, impact, summary }) => ({ label, impact, summary })),
    };

    const compacted = compactPlayerDevelopmentHistory([legacyVerboseTurn]);

    expect(compacted).toEqual([visibleTurn]);
    expect(compactPlayerDevelopmentHistory(compacted)).toEqual(compacted);
    expect(JSON.stringify(compacted).length).toBeLessThan(JSON.stringify(legacyVerboseTurn).length);
  });

  it("makes a seeded seasonal development wave visible and mechanical", () => {
    const player = makePlayer("seasonal", "patient");
    const club = makeClub("patient", "league-two", "academyFirst", 14, [player.id]);
    const baseState = {
      currentSeason: 1,
      currentWeek: 8,
      clubs: { patient: club },
      leagues: { "league-two": makeLeague("league-two", 2, club.id) },
      players: { [player.id]: player },
      fixtures: {},
      managerProfiles: { patient: makeManager("patient") },
      matchRatings: {},
      activeLoans: [],
    };
    let worldConditionState: WorldConditionState | undefined;
    for (let index = 0; index < 500 && !worldConditionState; index += 1) {
      const runManifest = createRunManifest({
        rootSeed: `development-condition-${index}`,
        specialization: "youth",
        difficulty: "normal",
        selectedCountries: ["england"],
        worldTraitIds: [],
      });
      const candidate = createWorldConditionState(runManifest, ["england"], 1);
      if (getWorldConditionModifiers({ worldConditionState: candidate }, "england")
        .developmentMultiplier > 1) {
        worldConditionState = candidate;
      }
    }
    expect(worldConditionState).toBeDefined();

    const baseline = evaluatePlayerDevelopmentEnvironment(baseState, player);
    const seasonal = evaluatePlayerDevelopmentEnvironment(
      { ...baseState, worldConditionState },
      player,
    );

    expect(seasonal.mechanics.growthChanceMultiplier)
      .toBeGreaterThan(baseline.mechanics.growthChanceMultiplier);
    expect(seasonal.projection.factors.some((factor) =>
      factor.id === "world-context" && factor.impact.includes("positive")
    )).toBe(true);
    expect(seasonal.projection.summary).toContain("this season");
  });
});
