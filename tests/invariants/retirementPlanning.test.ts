import { describe, expect, it } from "vitest";
import type { Club, GameState, League, Player } from "@/engine/core/types";
import { assessRetirementIntent } from "@/engine/transfers";

function club(playerIds: string[]): Club {
  return {
    id: "club",
    name: "Club",
    shortName: "CLU",
    leagueId: "league",
    reputation: 60,
    budget: 8_000_000,
    scoutingPhilosophy: "marketSmart",
    managerId: "manager",
    playerIds,
    academyPlayerIds: [],
    youthAcademyRating: 10,
  };
}

function league(): League {
  return {
    id: "league",
    name: "League",
    shortName: "LGE",
    country: "England",
    tier: 1,
    clubIds: ["club"],
    season: 5,
  };
}

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: "target",
    firstName: "Alex",
    lastName: "Veteran",
    age: 35,
    dateOfBirth: { day: 8, month: 6, year: 1991 },
    nationality: "England",
    position: "CM",
    secondaryPositions: [],
    preferredFoot: "right",
    clubId: "club",
    contractClubId: "club",
    contractExpiry: 5,
    wage: 22_000,
    marketValue: 950_000,
    attributes: {},
    currentAbility: 110,
    potentialAbility: 112,
    developmentProfile: "balanced",
    wonderkidTier: "none",
    form: -1,
    formTrend: "stable",
    morale: 5,
    injured: false,
    injuryWeeksRemaining: 0,
    personalityTraits: [],
    personalityRevealed: [],
    playerTraits: [],
    playerTraitsRevealed: [],
    recentMatchRatings: [],
    seasonRatings: [],
    ...overrides,
  } as unknown as Player;
}

function state(playerRecord: Player, fixtures: GameState["fixtures"], matchRatings: GameState["matchRatings"]): GameState {
  return {
    currentSeason: 5,
    currentWeek: 24,
    players: { [playerRecord.id]: playerRecord },
    clubs: { club: club([playerRecord.id]) },
    leagues: { league: league() },
    fixtures,
    matchRatings,
  } as unknown as GameState;
}

describe("retirement planning", () => {
  it("pushes an older, declining, injured, unused player toward retirement", () => {
    const veteran = player({
      age: 37,
      contractExpiry: 5,
      injured: true,
      injuryWeeksRemaining: 18,
      formTrend: "falling",
      recentMatchRatings: [
        { fixtureId: "f1", week: 10, season: 5, rating: 6.8 },
        { fixtureId: "f2", week: 11, season: 5, rating: 6.7 },
        { fixtureId: "f3", week: 12, season: 5, rating: 6.5 },
        { fixtureId: "f4", week: 13, season: 5, rating: 6.0 },
        { fixtureId: "f5", week: 14, season: 5, rating: 5.8 },
        { fixtureId: "f6", week: 15, season: 5, rating: 5.7 },
      ],
      seasonRatings: [
        { season: 3, avgRating: 7.0, appearances: 22, goals: 3, assists: 6, cleanSheets: 0 },
        { season: 4, avgRating: 6.4, appearances: 14, goals: 1, assists: 3, cleanSheets: 0 },
      ],
      injuryHistory: {
        playerId: "target",
        injuries: [
          { id: "i1", playerId: "target", type: "muscle", severity: "serious", recoveryWeeks: 10, weeksRemaining: 0, reinjuryRisk: 0.2, occurredWeek: 6, occurredSeason: 4 },
          { id: "i2", playerId: "target", type: "ligament", severity: "serious", recoveryWeeks: 14, weeksRemaining: 0, reinjuryRisk: 0.25, occurredWeek: 20, occurredSeason: 4 },
        ],
        totalWeeksMissed: 29,
        injuryProneness: 0.55,
        reinjuryWindowWeeksLeft: 5,
      },
    });
    const fixtures = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [
      `f${index}`,
      { id: `f${index}`, season: 5, week: index + 1, played: true, homeClubId: "club", awayClubId: "other" },
    ]));
    const assessment = assessRetirementIntent(veteran, state(veteran, fixtures as never, {} as never));

    expect(assessment.likelyToRetire).toBe(true);
    expect(assessment.status).toBe("ready");
    expect(assessment.components.agePressure).toBeGreaterThanOrEqual(80);
    expect(assessment.components.injuryPressure).toBeGreaterThanOrEqual(28);
    expect(assessment.reasons.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps a productive veteran on a short horizon from reading as retirement-ready", () => {
    const veteran = player({
      age: 34,
      contractExpiry: 6,
      formTrend: "rising",
      recentMatchRatings: [
        { fixtureId: "f1", week: 10, season: 5, rating: 6.7 },
        { fixtureId: "f2", week: 11, season: 5, rating: 6.9 },
        { fixtureId: "f3", week: 12, season: 5, rating: 7.0 },
        { fixtureId: "f4", week: 13, season: 5, rating: 7.1 },
        { fixtureId: "f5", week: 14, season: 5, rating: 7.2 },
        { fixtureId: "f6", week: 15, season: 5, rating: 7.3 },
      ],
      seasonRatings: [
        { season: 4, avgRating: 6.8, appearances: 28, goals: 2, assists: 8, cleanSheets: 0 },
      ],
    });
    const fixtures = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [
      `f${index}`,
      { id: `f${index}`, season: 5, week: index + 1, played: true, homeClubId: "club", awayClubId: "other" },
    ]));
    const matchRatings = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [
      `f${index}`,
      { target: { playerId: "target", rating: 7.0, started: true, minutesPlayed: 86 } },
    ]));
    const assessment = assessRetirementIntent(
      veteran,
      state(veteran, fixtures as never, matchRatings as never),
    );

    expect(assessment.likelyToRetire).toBe(false);
    expect(assessment.status).toBe("settled");
    expect(assessment.trend.direction).toBe("rising");
    expect(assessment.components.playingTimePressure).toBeLessThan(20);
  });

  it("recomputes late-career playing time when the season rolls over on the same ledger", () => {
    const veteran = player({
      age: 35,
      contractExpiry: 6,
      seasonRatings: [
        { season: 5, avgRating: 6.8, appearances: 22, goals: 1, assists: 4, cleanSheets: 0 },
      ],
    });
    const game = state(veteran, {
      s5a: { id: "s5a", season: 5, week: 1, played: true, homeClubId: "club", awayClubId: "other" },
      s5b: { id: "s5b", season: 5, week: 2, played: true, homeClubId: "club", awayClubId: "other" },
      s6a: { id: "s6a", season: 6, week: 1, played: true, homeClubId: "club", awayClubId: "other" },
    } as never, {
      s5a: { target: { playerId: "target", fixtureId: "s5a", rating: 6.8, eventCount: 1, stats: {}, minutesPlayed: 90, started: true, source: "simulated" } },
      s5b: { target: { playerId: "target", fixtureId: "s5b", rating: 6.9, eventCount: 1, stats: {}, minutesPlayed: 84, started: true, source: "simulated" } },
      s6a: {},
    } as never);
    game.currentWeek = 4;

    const seasonFive = assessRetirementIntent(veteran, game);
    game.currentSeason = 6;
    game.currentWeek = 2;
    const seasonSix = assessRetirementIntent(veteran, game);

    expect(seasonFive.components.playingTimePressure).toBeLessThan(25);
    expect(seasonSix.components.playingTimePressure).toBeGreaterThan(
      seasonFive.components.playingTimePressure + 20,
    );
  });
});
