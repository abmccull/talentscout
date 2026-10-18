import { describe, expect, it, vi } from "vitest";
import type { GameState, Player } from "@/engine/core/types";
import { ALL_ATTRIBUTES, ATTRIBUTE_DOMAINS } from "@/engine/core/types";
import {
  applySemanticPlayerDevelopment,
  computeSemanticPlayerDevelopment,
  getAgeDevelopmentMultiplier,
  realizePlayerDevelopment,
} from "@/engine/players/development";
import { generatePlayer } from "@/engine/players/generation";
import { processPlayerDevelopment } from "@/engine/core/weekly/playerSimulation";
import { applyWeeklyPlayerProgression } from "@/engine/core/weekly/stateApplication";
import { createDevelopmentEnvironmentIndex } from "@/engine/world/developmentEnvironment";
import { RNG } from "@/engine/rng";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function player(overrides: Partial<Player> = {}): Player {
  const generated = generatePlayer(new RNG("development-coherence"), {
    position: "CM", ageRange: [18, 18], abilityRange: [90, 90],
    nationality: "English", clubId: "",
  });
  return {
    ...generated, currentAbility: 90, potentialAbility: 160,
    developmentProfile: "steadyGrower", form: 2, ...overrides,
    attributes: { ...generated.attributes, ...overrides.attributes },
  };
}

function state(subject: Player): GameState {
  return {
    seed: "development-coherence", currentSeason: 3, currentWeek: 12, difficulty: "normal",
    players: { [subject.id]: subject }, unsignedYouth: {}, clubs: {}, leagues: {},
    managerProfiles: {}, matchRatings: {}, fixtures: {}, activeLoans: [],
  } as unknown as GameState;
}

describe("realized player development", () => {
  it("scales a breakthrough to its remaining ability headroom without free attribute gains", () => {
    const subject = player({ currentAbility: 159 });
    const result = realizePlayerDevelopment(subject, { passing: 3, vision: 3 }, 4);
    expect(result.abilityChange).toBe(1);
    expect(Object.values(result.changes).reduce((sum, delta) => sum + Math.abs(delta ?? 0), 0)).toBe(1);
    const developed = applySemanticPlayerDevelopment(subject, result).player;
    expect(developed.currentAbility).toBe(160);
    const blocked = realizePlayerDevelopment(developed, { firstTouch: 3 }, 3);
    expect(blocked.changes).toEqual({});
    expect(blocked.abilityChange).toBe(0);
  });

  it("cannot gain ability from already-maxed attributes or lose it from attributes already at their floor", () => {
    const subject = player({ attributes: { passing: 20, stamina: 1 } as Player["attributes"] });
    expect(realizePlayerDevelopment(subject, { passing: 3 }, 4).abilityChange).toBe(0);
    expect(realizePlayerDevelopment(subject, { stamina: -1 }, -1).abilityChange).toBe(0);
    expect(realizePlayerDevelopment(subject, { passing: 3, vision: 3 }, 4).abilityChange).toBe(2);
  });

  it("allows hidden mentality improvements at the ceiling without inventing on-pitch ability", () => {
    const subject = player({ currentAbility: 160 });
    const result = realizePlayerDevelopment(subject, { professionalism: 1, passing: 1 }, 1);
    expect(result.abilityChange).toBe(0);
    expect(result.changes).toEqual({ professionalism: 1 });
  });

  it("applies routine growth, a constrained breakthrough, and lasting injury deterioration sequentially", () => {
    const subject = player({ currentAbility: 159 });
    const source = state(subject);
    const developed = applyWeeklyPlayerProgression(source, {
      playerDevelopment: [{ playerId: subject.id, changes: { passing: 1 }, abilityChange: 1 }],
      breakthroughs: [{ playerId: subject.id, changes: { vision: 3 }, abilityChange: 4, improvedAttributes: ["vision"] }],
      injurySetbacks: [{ playerId: subject.id, changes: { stamina: -1 } }],
    }, clamp)[subject.id];
    expect(developed.currentAbility).toBe(159);
    expect(developed.attributes.passing).toBe(subject.attributes.passing + 1);
    expect(developed.attributes.vision).toBe(subject.attributes.vision);
    expect(developed.attributes.stamina).toBe(subject.attributes.stamina - 1);
    expect(source.players[subject.id]).toBe(subject);
    expect(subject.currentAbility).toBe(159);
  });

  it("does not generate a breakthrough after routine growth has already used the final capacity", () => {
    const subject = player({ currentAbility: 159 });
    const rng = new RNG("forced-development");
    vi.spyOn(rng, "chance").mockReturnValue(true);
    const source = state(subject);
    const tick = processPlayerDevelopment(source, rng, createDevelopmentEnvironmentIndex(source));
    expect(tick.development[0].abilityChange).toBe(1);
    expect(tick.breakthroughs).toEqual([]);
    expect(tick.breakthroughMessages).toEqual([]);
  });

  it("continues declining active players after 35 through the actual weekly phase", () => {
    const subject = player({ age: 38, developmentProfile: "earlyBloomer", form: 0 });
    const rng = new RNG("veteran-decline");
    vi.spyOn(rng, "chance").mockReturnValue(true);
    const source = state(subject);
    const tick = processPlayerDevelopment(source, rng, createDevelopmentEnvironmentIndex(source));
    expect(tick.development).toHaveLength(1);
    expect(tick.development[0].abilityChange).toBe(-1);
    expect(tick.breakthroughs).toEqual([]);
  });

  it("gives late bloomers their strongest growth after adolescence and keepers a later decline", () => {
    expect(getAgeDevelopmentMultiplier(23, "lateBloomer", "CM"))
      .toBeGreaterThan(getAgeDevelopmentMultiplier(16, "lateBloomer", "CM"));
    expect(getAgeDevelopmentMultiplier(16, "earlyBloomer", "CM"))
      .toBeGreaterThan(getAgeDevelopmentMultiplier(23, "earlyBloomer", "CM"));
    expect(getAgeDevelopmentMultiplier(32, "steadyGrower", "GK"))
      .toBeGreaterThan(getAgeDevelopmentMultiplier(32, "steadyGrower", "CM"));
    expect(getAgeDevelopmentMultiplier(38, "steadyGrower", "GK")).toBeLessThan(0);
  });

  it("produces different plausible growth histories under repeated seeded simulation", () => {
    const run = (seed: string, profile: Player["developmentProfile"]) => {
      let subject = player({ age: 15, developmentProfile: profile, form: 0 });
      const rng = new RNG(seed);
      let adolescentGain = 0;
      let matureGain = 0;
      for (let age = 15; age <= 27; age += 1) {
        const start = subject.currentAbility;
        subject = { ...subject, age };
        for (let week = 0; week < 46; week += 1) {
          subject = applySemanticPlayerDevelopment(subject, computeSemanticPlayerDevelopment(subject, rng)).player;
        }
        if (age <= 18) adolescentGain += subject.currentAbility - start;
        if (age >= 21 && age <= 24) matureGain += subject.currentAbility - start;
        expect(subject.currentAbility).toBeGreaterThanOrEqual(1);
        expect(subject.currentAbility).toBeLessThanOrEqual(subject.potentialAbility);
        for (const attribute of ALL_ATTRIBUTES) {
          expect(subject.attributes[attribute]).toBeGreaterThanOrEqual(1);
          expect(subject.attributes[attribute]).toBeLessThanOrEqual(20);
          if (ATTRIBUTE_DOMAINS[attribute] !== "hidden") expect(Number.isInteger(subject.attributes[attribute])).toBe(true);
        }
      }
      return { ability: subject.currentAbility, adolescentGain, matureGain };
    };
    const seeds = Array.from({ length: 16 }, (_, index) => `growth-cohort-${index}`);
    const late = seeds.map((seed) => run(seed, "lateBloomer"));
    const early = seeds.map((seed) => run(seed, "earlyBloomer"));
    expect(late.reduce((sum, career) => sum + career.matureGain, 0))
      .toBeGreaterThan(late.reduce((sum, career) => sum + career.adolescentGain, 0));
    expect(early.reduce((sum, career) => sum + career.adolescentGain, 0))
      .toBeGreaterThan(early.reduce((sum, career) => sum + career.matureGain, 0));
    expect(new Set(late.map((career) => career.ability)).size).toBeGreaterThan(1);
    expect(run(seeds[0], "lateBloomer")).toEqual(late[0]);
  });
});
