import { describe, expect, it } from "vitest";
import type { Player } from "@/engine/core/types";
import { generatePlayer } from "@/engine/players/generation";
import { computeSemanticPlayerDevelopment } from "@/engine/players/development";
import { RNG } from "@/engine/rng";

const prospect: Player = {
  ...generatePlayer(new RNG("career-timing-prospect"), {
    position: "CM", ageRange: [18, 18], abilityRange: [100, 100],
    nationality: "English", clubId: "development-test",
  }),
  potentialAbility: 180,
  developmentProfile: "steadyGrower",
  form: 3,
  formMomentum: 0,
  formTrend: "stable",
};

// Compare identical players and weekly seeds; isolate age/environment rather
// than requiring one lucky player to improve on a particular tick.
function opportunities(overrides: Partial<Player>, support = 1) {
  const player = { ...prospect, ...overrides };
  let growth = 0;
  let decline = 0;
  for (let index = 0; index < 1000; index++) {
    const result = computeSemanticPlayerDevelopment(
      player, new RNG(`career-timing-week-${index}`), 1,
      { growthChanceMultiplier: support, growthQualityMultiplier: support },
    );
    growth += Math.max(0, result.abilityChange);
    decline += Math.max(0, -result.abilityChange);
  }
  return { growth, decline };
}

describe("development career timing", () => {
  it("lets early bloomers consolidate in their twenties without premature decline", () => {
    const teenager = opportunities({ age: 19, developmentProfile: "earlyBloomer" });
    const adult = opportunities({ age: 24, developmentProfile: "earlyBloomer" });
    expect(adult.growth).toBeGreaterThan(0);
    expect(adult.growth).toBeLessThan(teenager.growth);
    expect(adult.decline).toBe(0);
  });

  it("gives late bloomers a later period of faster development", () => {
    const teenager = opportunities({ age: 18, developmentProfile: "lateBloomer" });
    const adult = opportunities({ age: 25, developmentProfile: "lateBloomer" });
    expect(adult.growth).toBeGreaterThan(teenager.growth * 1.4);
    expect(adult.decline).toBe(0);
  });

  it("retains aging decline after the steady development window", () => {
    const veteran = opportunities({ age: 34 });
    expect(veteran.growth).toBe(0);
    expect(veteran.decline).toBeGreaterThan(0);
  });

  it("makes useful development environments matter", () => {
    expect(opportunities({ age: 22 }, 1.25).growth)
      .toBeGreaterThan(opportunities({ age: 22 }, 0.6).growth * 1.5);
  });

  it("slows final refinements without stopping growth short of the ceiling", () => {
    const nearPotential = opportunities({ currentAbility: 175 });
    expect(nearPotential.growth).toBeGreaterThan(0);
    expect(nearPotential.growth).toBeLessThan(opportunities({}).growth);
    expect(opportunities({ currentAbility: 180 }).growth).toBe(0);
  });
});
