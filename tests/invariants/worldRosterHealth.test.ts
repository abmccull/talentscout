import { describe, expect, it } from "vitest";
import type { GameState } from "@/engine/core/types";
import { collectWorldRosterGaps, measureWorldRosterHealth } from "../release/worldRosterHealth";

describe("long-career roster health evidence", () => {
  it("does not count duplicated, missing or foreign players toward a playable team", () => {
    const players = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [String(i), {
      id: String(i), clubId: "healthy", position: i === 0 ? "GK" : "CM",
    }]));
    const state = {
      players: { ...players, free: { id: "free", clubId: "", position: "GK" } },
      clubs: {
        healthy: { id: "healthy", playerIds: Object.keys(players) },
        broken: { id: "broken", playerIds: ["missing", "0", "0", "free"] },
      },
      freeAgentPool: { agents: [{ playerId: "free", status: "available" }, { playerId: "old", status: "retired" }] },
    } as unknown as GameState;
    const before = JSON.stringify(state);
    expect(collectWorldRosterGaps(state)).toEqual([{
      club: state.clubs.broken, goalkeepers: 0, outfieldPlayers: 0, players: [],
    }]);
    expect(JSON.stringify(state)).toBe(before);
    expect(measureWorldRosterHealth(state)).toEqual({
      activePlayers: 12, freeAgents: 1, freeAgentRatio: 1 / 12,
      clubsBelowTenOutfieldPlayers: 1, clubsBelowElevenSeniors: 1, clubsWithoutSeniorGoalkeeper: 1,
    });
  });
});

it("reports an outfield shortage even with eleven players and four goalkeepers", () => {
  const players = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [String(i), {
    id: String(i), clubId: "club", position: i < 4 ? "GK" : "CM",
  }]));
  const state = { players, clubs: { club: { id: "club", playerIds: Object.keys(players) } } } as unknown as GameState;
  expect(measureWorldRosterHealth(state)).toMatchObject({
    clubsBelowElevenSeniors: 0, clubsWithoutSeniorGoalkeeper: 0, clubsBelowTenOutfieldPlayers: 1,
  });
  expect(collectWorldRosterGaps(state)).toMatchObject([{
    club: { id: "club" }, goalkeepers: 4, outfieldPlayers: 7,
  }]);
});
