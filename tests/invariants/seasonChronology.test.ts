import { describe, expect, it, vi } from "vitest";
import type { GameState, League, Player, UnsignedYouth } from "@/engine/core/types";
import { getSeasonBirthYear, getSeasonStartYear, getSeasonWeekDate } from "@/engine/core/seasonDate";
import { generatePlayer } from "@/engine/players/generation";
import { generateSeasonFixtures } from "@/engine/world/fixtures";
import { migratePlayerChronology } from "@/lib/migrations/playerChronology";
import { RNG } from "@/engine/rng";

function player(season: number, id = "prospect"): Player {
  return {
    ...generatePlayer(new RNG(`chronology-${id}`), {
      position: "CM", ageRange: [16, 16], abilityRange: [40, 40],
      nationality: "English", clubId: "club", currentSeason: season,
    }),
    id,
  };
}

describe("season chronology", () => {
  it.each([1, 5, 10, 20, 30])("dates season %i entrants from their own cohort", (season) => {
    const generated = player(season);
    expect(generated.dateOfBirth.year + generated.age).toBe(2023 + season);
    expect(generated.contractExpiry).toBeGreaterThan(season);
    expect(getSeasonWeekDate(1, season)).toBe(`${2023 + season}-08-10`);
  });

  it("accepts legacy calendar years without adding a second ordinal offset", () => {
    expect(getSeasonStartYear(2026)).toBe(getSeasonStartYear(3));
    expect(player(2026).dateOfBirth).toEqual(player(3).dateOfBirth);
    expect(getSeasonWeekDate(27, 2026)).toBe(getSeasonWeekDate(27, 3));
    expect(getSeasonBirthYear(16, 2026)).toBe(2010);
  });

  it("keeps fixture weather in the actual game week even for a two-club league", () => {
    const rng = new RNG("short-calendar");
    const weatherDraws = vi.spyOn(rng, "pickWeighted");
    const fixtures = generateSeasonFixtures(rng, {
      id: "short", clubIds: ["a", "b"],
    } as League, 30);
    expect(fixtures).toHaveLength(2);
    expect(weatherDraws).toHaveBeenCalledTimes(2);
    expect(weatherDraws.mock.calls[0][0]).toEqual(weatherDraws.mock.calls[1][0]);
    expect(getSeasonWeekDate(2, 30)).toBe("2053-08-17");
  });

  it("uses a timezone-independent UTC calendar across the year boundary", () => {
    expect(getSeasonWeekDate(22, 1)).toBe("2025-01-04");
    expect(() => getSeasonStartYear(0)).toThrow(RangeError);
    expect(() => getSeasonBirthYear(-1, 1)).toThrow(RangeError);
    expect(() => getSeasonWeekDate(0, 1)).toThrow(RangeError);
  });

  it("repairs active birthdays idempotently without changing historical snapshots or ages", () => {
    const active = player(1, "active");
    const youth = player(1, "unsigned");
    const retired = player(1, "retired");
    const placed = player(1, "placed");
    const source = {
      currentSeason: 30,
      players: { active },
      retiredPlayers: { retired },
      unsignedYouth: {
        unsigned: { id: "unsigned", player: youth, placed: false, retired: false },
        placed: { id: "placed", player: placed, placed: true, retired: false },
      } as unknown as Record<string, UnsignedYouth>,
    } as unknown as GameState;
    const original = structuredClone(source);
    const migrated = migratePlayerChronology(source);
    expect(source).toEqual(original);
    expect(migrated.players.active.dateOfBirth).toEqual({ ...active.dateOfBirth, year: 2037 });
    expect(migrated.unsignedYouth.unsigned.player.dateOfBirth.year).toBe(2037);
    expect(migrated.players.active.age).toBe(16);
    expect(migrated.retiredPlayers).toBe(source.retiredPlayers);
    expect(migrated.unsignedYouth.placed).toBe(source.unsignedYouth.placed);
    expect(migratePlayerChronology(migrated)).toBe(migrated);
  });

  it("does not guess missing calendar or age information", () => {
    const unknownSeason = { currentSeason: Number.NaN } as GameState;
    expect(migratePlayerChronology(unknownSeason)).toBe(unknownSeason);
    const invalidAge = { ...player(1), age: Number.NaN };
    const state = { currentSeason: 10, players: { invalidAge }, unsignedYouth: {} } as unknown as GameState;
    expect(migratePlayerChronology(state)).toBe(state);
  });
});
