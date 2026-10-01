import { expect, it } from "vitest";
import type { Club, Player, Position } from "@/engine/core/types";
import { assignFormationPlayers, calculateLineupStrength } from "@/engine/firstTeam/lineupAssignment";
import { selectStartingXI } from "@/engine/core/gameLoop";

it("preserves a scarce specialist by assigning a versatile player to the other slot", () => {
  const versatile = { id: "versatile" } as Player, specialist = { id: "specialist" } as Player;
  const weights = { versatile: { LB: 100, CB: 90 }, specialist: { LB: 80, CB: -1000 } };
  const selected = assignFormationPlayers(["LB", "CB"], [versatile, specialist], (p, slot) => weights[p.id as keyof typeof weights][slot as "LB" | "CB"]);
  expect(selected.map(p => p.id)).toEqual(["specialist", "versatile"]);
});

it("leaves impossible slots empty and resolves equal choices deterministically", () => {
  const players = [{ id: "a" }, { id: "b" }] as Player[];
  const score = (_player: Player, position: Position) => position === "GK" ? -1000 : 100;
  expect(assignFormationPlayers(["GK", "CM", "CM"], players, score).map(p => p.id)).toEqual(["a", "b"]);
  expect(assignFormationPlayers(["GK"], [], score)).toEqual([]);
});

it("never selects duplicate or foreign players, or extra keepers as outfield cover", () => {
  const players: Record<string, Player> = Object.fromEntries(Array.from({ length: 12 }, (_, index) => {
    const id = `p-${index}`;
    return [id, { id, clubId: "club", position: index < 3 ? "GK" : "CM", currentAbility: 100, form: 0 }];
  })) as Record<string, Player>;
  players.foreign = { ...players['p-3'], id: "foreign", clubId: "other", currentAbility: 200 };
  const club = { id: "club", playerIds: [...Object.keys(players), "p-3"] } as Club;
  const selected = selectStartingXI(club, players);
  expect(selected).toHaveLength(10);
  expect(new Set(selected.map(p => p.id)).size).toBe(10);
  expect(selected.filter(p => p.position === "GK")).toHaveLength(1);
  expect(selected.every(p => p.clubId === "club")).toBe(true);
  const shortClub = { ...club, playerIds: ["p-0", "p-1", "p-3"] };
  expect(selectStartingXI(shortClub, players).map(p => p.id)).toEqual(["p-0", "p-3"]);
});

it("reduces team strength when unavailable players leave vacancies, even if the remaining players are stronger", () => {
  const full = [...Array.from({ length: 10 }, () => ({ currentAbility: 100 })), { currentAbility: 20 }];
  expect(calculateLineupStrength(full.slice(0, 10))).toBeLessThan(calculateLineupStrength(full));
  expect(calculateLineupStrength(Array.from({ length: 11 }, () => ({ currentAbility: 100 })))).toBe(100);
  expect(calculateLineupStrength([])).toBe(0);
});
