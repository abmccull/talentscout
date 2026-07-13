import { describe, expect, it } from "vitest";
import type { Club, MatchPhase, Player, Position } from "@/engine/core/types";
import { selectStartingXI } from "@/engine/core/gameLoop";
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
});
