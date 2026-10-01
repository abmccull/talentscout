import { describe, expect, it } from "vitest";
import type { Player } from "@/engine/core/types";
import { getEmergencySquadVacancies, canFundSquadCompletion } from "@/engine/freeAgents/squadPlanning";

describe("playable squad recruitment priority", () => {
  it("keeps cheap academy deals from spending the senior squad reserve", () => {
    // The same affordable £500 deal is useful senior depth but cannot fill a
    // first-team vacancy when its recipient is still academy-only.
    expect(canFundSquadCompletion(389, 10, 500, undefined, undefined, 14)).toBe(false);
    expect(canFundSquadCompletion(389, 10, 500, undefined, undefined, 17)).toBe(false);
    expect(canFundSquadCompletion(389, 10, 500, undefined, undefined, 18)).toBe(true);
    expect(canFundSquadCompletion(4_000, 10, 500, undefined, undefined, 14)).toBe(true);
    expect(canFundSquadCompletion(389, 10, 500)).toBe(false);
  });
  it("allows a depleted club to fund eleven before reserving a full bench", () => {
    expect(canFundSquadCompletion(1_500, 10, 1_200, undefined, 1)).toBe(true);
    expect(canFundSquadCompletion(0, 11, 1_200, undefined, 0)).toBe(true);
    expect(canFundSquadCompletion(499, 10, 1_200, undefined, 1)).toBe(false);
    expect(canFundSquadCompletion(-1, 11, 600)).toBe(false);
    expect(canFundSquadCompletion(1_500, 12, 1_200)).toBe(false);
  });
  it("still protects the goalkeeper allocation during emergency outfield recruitment", () => {
    expect(canFundSquadCompletion(999, 10, 1_200, "reserve", 1)).toBe(false);
    expect(canFundSquadCompletion(1_000, 10, 1_200, "reserve", 1)).toBe(true);
  });
});

it("counts extra goalkeepers as bench players and restricts emergency funds to usable arrivals", () => {
  const players = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [String(i), {
    id: String(i), position: i < 4 ? "GK" : "CM", age: 22,
  } as Player]));
  const club = { playerIds: Object.keys(players) };
  const outfield = { id: "new", position: "CB", age: 22 } as Player;
  expect(getEmergencySquadVacancies(outfield, club, players)).toBe(2);
  expect(getEmergencySquadVacancies({ ...outfield, position: "GK" }, club, players)).toBeUndefined();
  expect(getEmergencySquadVacancies({ ...outfield, age: 17 }, club, players)).toBeUndefined();
  expect(canFundSquadCompletion(1000, 12, 1200, undefined,
    getEmergencySquadVacancies(outfield, club, players))).toBe(true);
  expect(canFundSquadCompletion(999, 12, 1200, undefined,
    getEmergencySquadVacancies(outfield, club, players))).toBe(false);
});
