import { describe, expect, it } from "vitest";
import type {
  Club,
  LoanDeal,
  ManagerProfile,
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
import { createLoanSelectionPriorityIndex } from "@/engine/world/loans";

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

  it("honors the manager formation instead of the old broad attacking bucket", () => {
    const makePlayer = (
      seed: string,
      position: Position,
      currentAbility: number,
    ): Player => ({
      ...(() => {
        const player = generatePlayer(new RNG(seed), {
          position,
          ageRange: [24, 24],
          abilityRange: [currentAbility, currentAbility],
          nationality: "English",
          clubId: "shape-club",
        });
        return {
          ...player,
          form: 0,
          attributes: {
            ...player.attributes,
            stamina: 12,
          },
        };
      })(),
      secondaryPositions: [],
    });
    const squad = [
      makePlayer("shape-gk", "GK", 100),
      makePlayer("shape-lb", "LB", 101),
      makePlayer("shape-cb-1", "CB", 103),
      makePlayer("shape-cb-2", "CB", 102),
      makePlayer("shape-rb", "RB", 101),
      makePlayer("shape-cdm-1", "CDM", 104),
      makePlayer("shape-cdm-2", "CDM", 103),
      makePlayer("shape-cam", "CAM", 105),
      makePlayer("shape-lw", "LW", 99),
      makePlayer("shape-rw", "RW", 98),
      makePlayer("shape-st", "ST", 106),
      makePlayer("shape-st-bench", "ST", 110),
    ];
    const players = Object.fromEntries(squad.map((player) => [player.id, player]));
    const club = {
      id: "shape-club",
      playerIds: squad.map((player) => player.id),
      scoutingPhilosophy: "marketSmart",
    } as Club;
    const manager = {
      clubId: club.id,
      managerId: "shape-manager",
      preferredFormation: "4-2-3-1",
      preference: "balanced",
    } as ManagerProfile;

    const starters = selectStartingXI(club, players, {}, undefined, manager);
    const positions = starters.map((player) => player.position);

    expect(starters).toHaveLength(11);
    expect(positions.filter((position) => position === "ST")).toHaveLength(1);
    expect(positions.filter((position) => position === "CDM")).toHaveLength(2);
    expect(positions).toContain("CAM");
    expect(positions).toContain("LW");
    expect(positions).toContain("RW");
    expect(positions.filter((position) => position === "CB")).toHaveLength(2);
    expect(positions.filter((position) => position === "LW" || position === "RW" || position === "CAM")).toHaveLength(3);
  });

  it("uses a promised loan role as a bounded preference inside canonical XI selection", () => {
    const makePlayer = (
      seed: string,
      position: Position,
      currentAbility: number,
    ): Player => ({
      ...(() => {
        const player = generatePlayer(new RNG(seed), {
          position,
          ageRange: [22, 22],
          abilityRange: [currentAbility, currentAbility],
          nationality: "English",
          clubId: "loan-club",
        });
        return {
          ...player,
          form: 0,
          attributes: {
            ...player.attributes,
            stamina: 12,
          },
        };
      })(),
      secondaryPositions: [],
    });
    const rolePlayers = [
      makePlayer("loan-lineup-gk", "GK", 100),
      ...Array.from({ length: 4 }, (_, index) =>
        makePlayer(`loan-lineup-defender-${index}`, "CB", 100 + index)),
      makePlayer("loan-lineup-cm-1", "CM", 101),
      makePlayer("loan-lineup-cdm", "CDM", 102),
      makePlayer("loan-lineup-cm-2", "CM", 103),
      makePlayer("loan-lineup-lw", "LW", 103),
      makePlayer("loan-lineup-rw", "RW", 102),
    ];
    const strongerForward = makePlayer("loan-lineup-forward-strong", "ST", 105);
    const secondForward = makePlayer("loan-lineup-forward-second", "ST", 104);
    const loanForward = {
      ...makePlayer("loan-lineup-forward-loan", "ST", 96),
      onLoan: true,
      loanParentClubId: "parent",
      contractClubId: "parent",
    };
    const squad = [
      ...rolePlayers,
      strongerForward,
      secondForward,
      loanForward,
    ];
    const players = Object.fromEntries(squad.map((player) => [player.id, player]));
    const club = {
      id: "loan-club",
      playerIds: squad.map((player) => player.id),
      scoutingPhilosophy: "marketSmart",
    } as Club;
    const manager = {
      clubId: club.id,
      managerId: "loan-manager",
      preferredFormation: "4-3-3",
      preference: "balanced",
    } as ManagerProfile;
    const deal = {
      id: "key-loan",
      playerId: loanForward.id,
      parentClubId: "parent",
      loanClubId: club.id,
      status: "active",
      agreedPlayingTime: "key",
    } as LoanDeal;

    const withoutPromise = selectStartingXI(club, players, {}, undefined, manager);
    const withPromise = selectStartingXI(
      club,
      players,
      {},
      createLoanSelectionPriorityIndex([deal]),
      manager,
    );

    expect(withoutPromise.map((player) => player.id)).not.toContain(loanForward.id);
    expect(withPromise.map((player) => player.id)).toContain(loanForward.id);
    expect(withPromise).toHaveLength(11);
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
    const legacyPlayer = { ...player } as Player;
    delete legacyPlayer.formMomentum;
    delete legacyPlayer.formTrend;
    delete legacyPlayer.formLockWeeks;
    const unchangedUpdate = {
      playerId: player.id,
      form: 0,
      formMomentum: 0,
      formTrend: "stable" as const,
      formLockWeeks: 0,
    };

    expect(isFormMomentumUpdateNoOp(normalizedPlayer, unchangedUpdate)).toBe(true);
    expect(isFormMomentumUpdateNoOp(player, unchangedUpdate)).toBe(true);
    expect(isFormMomentumUpdateNoOp(legacyPlayer, unchangedUpdate)).toBe(false);
    expect(isFormMomentumUpdateNoOp(
      { ...normalizedPlayer, form: 0.04 },
      { ...unchangedUpdate, form: 0.04 },
    )).toBe(false);
  });
});
