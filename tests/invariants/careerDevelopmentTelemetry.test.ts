import { describe, expect, it } from "vitest";
import type { GameState, Player } from "@/engine/core/types";
import { captureCareerDevelopmentCohort } from "../support/careerDevelopmentTelemetry";

const player = (id: string, potentialAbility = 160) => ({
  id, age: 17, potentialAbility, currentAbility: 60, clubId: "academy",
  attributes: { passing: 10 },
} as unknown as Player);
const state = (players: Record<string, Player>, currentSeason = 1) => ({
  players, currentSeason, currentWeek: 1,
} as Pick<GameState, "players" | "currentSeason" | "currentWeek">);

describe("external career cohort observations", () => {
  it("keeps identity across growth, moves and lowered potential; records absence without inventing retirement", () => {
    const first = captureCareerDevelopmentCohort(state({ a: player("a"), b: player("b", 100) }), new Set());
    expect(first.snapshot.newlyTrackedIds).toEqual(["a"]);
    const next = captureCareerDevelopmentCohort(state({
      a: { ...player("a", 140), age: 18, currentAbility: 70, clubId: "senior" },
      c: player("c"),
    }, 2), first.tracked);
    expect(next.snapshot.rows.find(row => row.id === "a")).toMatchObject({ ability: 70, clubId: "senior", potential: 140 });
    expect(next.snapshot.newlyTrackedIds).toEqual(["c"]);
    const absent = captureCareerDevelopmentCohort(state({ c: player("c") }, 3), next.tracked);
    expect(absent.snapshot.absentIds).toEqual(["a"]);
    expect([...first.tracked]).toEqual(["a"]);
  });

  it("copies attribute values and produces stable ordering without modifying source state", () => {
    const source = state({ z: player("z"), a: player("a") });
    const before = JSON.stringify(source);
    const first = captureCareerDevelopmentCohort(source, new Set());
    expect(first.snapshot.rows.map(row => row.id)).toEqual(["a", "z"]);
    expect(JSON.stringify(source)).toBe(before);
    source.players.a.attributes.passing = 12;
    expect(first.snapshot.rows[0].attributes.passing).toBe(10);
  });
});
