import { describe, expect, it } from "vitest";
import type {
  Club,
  MatchPhase,
  Player,
  PlayerMatchRating,
  Position,
} from "@/engine/core/types";
import {
  createWeeklyPlayerRatingIndex,
  getSimulatedCardParticipants,
  isFormMomentumUpdateNoOp,
  selectStartingXI,
  type SimulatedFixture,
} from "@/engine/core/gameLoop";
import { calculateAttendedMatchRatings } from "@/engine/match/ratings";
import { generatePlayer } from "@/engine/players/generation";
import { RNG } from "@/engine/rng";

describe("match participation invariants", () => {
  it("selects at most eleven eligible starters and leaves squad players without appearances", () => {
    const positions: Position[] = [
      "GK", "GK", "CB", "CB", "LB", "RB", "CDM", "CM",
      "CM", "CAM", "LW", "RW", "ST", "ST", "CB",
    ];
    const players: Record<string, Player> = {};
    for (let index = 0; index < positions.length; index++) {
      const player = generatePlayer(new RNG(`lineup-player-${index}`), {
        position: positions[index],
        ageRange: [24, 24],
        abilityRange: [90 + index, 90 + index],
        nationality: "English",
        clubId: "lineup-club",
      });
      players[player.id] = index === positions.length - 1
        ? { ...player, injured: true, injuryWeeksRemaining: 2 }
        : player;
    }

    const club = {
      id: "lineup-club",
      playerIds: Object.keys(players),
    } as Club;
    const starters = selectStartingXI(club, players);

    expect(starters).toHaveLength(11);
    expect(new Set(starters.map((player) => player.id)).size).toBe(11);
    expect(starters.every((player) => !player.injured)).toBe(true);
    expect(starters.some((player) => player.position === "GK")).toBe(true);
    expect(Object.keys(players).filter((id) => !starters.some((player) => player.id === id))).toHaveLength(4);
  });

  it("persists attended starts and only claims minutes supported by match events", () => {
    const home = generatePlayer(new RNG("attended-home"), {
      position: "CM",
      ageRange: [24, 24],
      abilityRange: [110, 110],
      nationality: "English",
      clubId: "home",
    });
    const away = generatePlayer(new RNG("attended-away"), {
      position: "CB",
      ageRange: [25, 25],
      abilityRange: [108, 108],
      nationality: "English",
      clubId: "away",
    });
    const phases: MatchPhase[] = [{
      minute: 60,
      type: "possession",
      description: "A measured spell of possession.",
      involvedPlayerIds: [home.id, away.id],
      observableAttributes: [],
      events: [{
        minute: 63,
        description: "The midfielder leaves the pitch.",
        playerId: home.id,
        type: "substitution",
        quality: 5,
        attributesRevealed: [],
      }],
    }];

    const ratings = calculateAttendedMatchRatings(
      phases,
      [home],
      [away],
      1,
      0,
      "attended-fixture",
    );

    expect(ratings[home.id]).toMatchObject({ started: true, minutesPlayed: 63 });
    expect(ratings[away.id]).toMatchObject({ started: true, minutesPlayed: 90 });
  });

  it("limits simulated card eligibility to players with a recorded appearance", () => {
    const makePlayer = (seed: string, clubId: string): Player =>
      generatePlayer(new RNG(seed), {
        position: "CM",
        ageRange: [24, 24],
        abilityRange: [105, 105],
        nationality: "English",
        clubId,
      });
    const homePlayers = [
      makePlayer("card-home-starter", "home"),
      makePlayer("card-home-bench", "home"),
    ];
    const awayPlayers = [
      makePlayer("card-away-starter", "away"),
      makePlayer("card-away-bench", "away"),
    ];
    const players = Object.fromEntries(
      [...homePlayers, ...awayPlayers].map((player) => [player.id, player]),
    );
    const rating = (player: Player): PlayerMatchRating => ({
      playerId: player.id,
      fixtureId: "fixture",
      started: true,
      minutesPlayed: 90,
      rating: 6.5,
      eventCount: 0,
      stats: {},
      source: "simulated",
    });
    const fixture = {
      homeClubId: "home",
      awayClubId: "away",
      playerRatings: {
        [homePlayers[0].id]: rating(homePlayers[0]),
        [awayPlayers[0].id]: rating(awayPlayers[0]),
      },
    } as SimulatedFixture;
    const clubs = {
      home: { id: "home", playerIds: homePlayers.map((player) => player.id) } as Club,
      away: { id: "away", playerIds: awayPlayers.map((player) => player.id) } as Club,
    };

    const participants = getSimulatedCardParticipants(fixture, clubs, players);

    expect(participants.homePlayers.map((player) => player.id)).toEqual([
      homePlayers[0].id,
    ]);
    expect(participants.awayPlayers.map((player) => player.id)).toEqual([
      awayPlayers[0].id,
    ]);
  });

  it("indexes the first weekly rating without changing legacy find semantics", () => {
    const rating = (playerId: string, fixtureId: string, value: number): PlayerMatchRating => ({
      playerId,
      fixtureId,
      rating: value,
      eventCount: 0,
      stats: {},
      source: "simulated",
    });
    const fixtures = [
      {
        id: "first",
        playerRatings: {
          repeated: rating("repeated", "first", 7.2),
        },
      },
      {
        id: "second",
        playerRatings: {
          repeated: rating("repeated", "second", 4.8),
          unique: rating("unique", "second", 6.1),
        },
      },
    ] as unknown as SimulatedFixture[];

    const index = createWeeklyPlayerRatingIndex(fixtures);

    expect(index.get("repeated")).toBe(7.2);
    expect(index.get("unique")).toBe(6.1);
  });

  it("suppresses form updates only when values and persisted fields are unchanged", () => {
    const player = generatePlayer(new RNG("form-no-op"), {
      position: "CM",
      ageRange: [24, 24],
      abilityRange: [105, 105],
      nationality: "English",
      clubId: "club",
    });
    const normalizedPlayer: Player = {
      ...player,
      form: 0,
      formMomentum: 0,
      formTrend: "stable",
      formLockWeeks: 0,
    };
    const unchangedUpdate = {
      playerId: player.id,
      form: 0,
      formMomentum: 0,
      formTrend: "stable" as const,
      formLockWeeks: 0,
    };

    expect(isFormMomentumUpdateNoOp(normalizedPlayer, unchangedUpdate)).toBe(true);
    expect(isFormMomentumUpdateNoOp(player, unchangedUpdate)).toBe(false);
    expect(isFormMomentumUpdateNoOp(
      { ...normalizedPlayer, form: 0.04 },
      { ...unchangedUpdate, form: 0.04 },
    )).toBe(false);
  });
});
