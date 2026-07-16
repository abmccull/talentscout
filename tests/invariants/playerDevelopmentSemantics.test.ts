import { describe, expect, it } from "vitest";
import type { Player, PlayerAttribute } from "@/engine/core/types";
import {
  applyDevelopmentAbilityChange,
  computeSemanticBreakthrough,
  computeSemanticPlayerDevelopment,
  getDevelopmentAttributeWeights,
  getDevelopmentMindsetMultiplier,
  getSemanticDevelopmentDelta,
  isAttributeChangeImprovement,
} from "@/engine/players/development";
import { generatePlayer } from "@/engine/players/generation";
import { RNG } from "@/engine/rng";

function makePlayer(overrides: Partial<Player> = {}): Player {
  const generated = generatePlayer(new RNG("semantic-development-player"), {
    position: "ST",
    ageRange: [18, 18],
    abilityRange: [100, 100],
    nationality: "English",
    clubId: "club",
  });
  return {
    ...generated,
    naturalRole: "poacher",
    currentAbility: 100,
    potentialAbility: 140,
    developmentProfile: "steadyGrower",
    form: 3,
    formMomentum: 5,
    formTrend: "rising",
    ...overrides,
    attributes: {
      ...generated.attributes,
      ...overrides.attributes,
    },
  };
}

describe("semantic player development", () => {
  it("treats injury proneness as inverse-valued in both directions", () => {
    expect(getSemanticDevelopmentDelta("injuryProneness", "growth")).toBe(-1);
    expect(getSemanticDevelopmentDelta("injuryProneness", "decline")).toBe(1);
    expect(isAttributeChangeImprovement("injuryProneness", -1)).toBe(true);
    expect(isAttributeChangeImprovement("injuryProneness", 1)).toBe(false);

    expect(getSemanticDevelopmentDelta("finishing", "growth")).toBe(1);
    expect(getSemanticDevelopmentDelta("finishing", "decline")).toBe(-1);
    expect(isAttributeChangeImprovement("finishing", 1)).toBe(true);
    expect(isAttributeChangeImprovement("finishing", -1)).toBe(false);
  });

  it("weights development toward the player's position and natural role", () => {
    const strikerWeights = new Map(
      getDevelopmentAttributeWeights(makePlayer(), "growth")
        .map(({ item, weight }) => [item, weight]),
    );
    const defenderWeights = new Map(
      getDevelopmentAttributeWeights(makePlayer({
        position: "CB",
        naturalRole: "noNonsenseCB",
      }), "growth").map(({ item, weight }) => [item, weight]),
    );

    expect(strikerWeights.get("finishing")!).toBeGreaterThan(
      strikerWeights.get("tackling")!,
    );
    expect(strikerWeights.get("offTheBall")!).toBeGreaterThan(
      strikerWeights.get("marking")!,
    );
    expect(defenderWeights.get("tackling")!).toBeGreaterThan(
      defenderWeights.get("finishing")!,
    );
    expect(defenderWeights.get("marking")!).toBeGreaterThan(
      defenderWeights.get("shooting")!,
    );
  });

  it("lets professionalism and personality affect development within bounds", () => {
    const highProfessional = makePlayer({
      personalityTraits: ["modelCitizen", "professional", "determined"],
      attributes: { professionalism: 20 } as Player["attributes"],
    });
    const lowProfessional = makePlayer({
      personalityTraits: ["inconsistent", "temperamental", "controversialCharacter"],
      attributes: { professionalism: 2 } as Player["attributes"],
    });

    const highMultiplier = getDevelopmentMindsetMultiplier(highProfessional);
    const lowMultiplier = getDevelopmentMindsetMultiplier(lowProfessional);

    expect(highMultiplier).toBeGreaterThan(1);
    expect(lowMultiplier).toBeLessThan(1);
    expect(highMultiplier).toBeGreaterThan(lowMultiplier);
    expect(highMultiplier).toBeLessThanOrEqual(1.3);
    expect(lowMultiplier).toBeGreaterThanOrEqual(0.75);
  });

  it("never lets CA growth exceed PA or snap legacy over-PA players downward", () => {
    expect(applyDevelopmentAbilityChange(138, 140, 5)).toBe(140);
    expect(applyDevelopmentAbilityChange(140, 140, 1)).toBe(140);
    expect(applyDevelopmentAbilityChange(142, 140, 1)).toBe(142);
    expect(applyDevelopmentAbilityChange(142, 140, -1)).toBe(141);
    expect(applyDevelopmentAbilityChange(1, 140, -5)).toBe(1);
  });

  it("keeps routine growth and decline semantically aligned across seeded outcomes", () => {
    const growthPlayer = makePlayer();
    const declinePlayer = makePlayer({
      age: 34,
      developmentProfile: "earlyBloomer",
      currentAbility: 140,
      potentialAbility: 140,
      form: 0,
      formMomentum: 0,
      formTrend: "stable",
    });
    let growthChanges = 0;
    let declineChanges = 0;

    for (let index = 0; index < 500; index += 1) {
      const growth = computeSemanticPlayerDevelopment(
        growthPlayer,
        new RNG(`semantic-growth-${index}`),
        2,
        { growthQualityMultiplier: 2, growthChanceMultiplier: 2 },
      );
      for (const [attribute, delta] of Object.entries(growth.changes) as Array<
        [PlayerAttribute, number | undefined]
      >) {
        if (delta === undefined) continue;
        growthChanges += 1;
        expect(isAttributeChangeImprovement(attribute, delta)).toBe(true);
      }
      expect(growthPlayer.currentAbility + growth.abilityChange)
        .toBeLessThanOrEqual(growthPlayer.potentialAbility);

      const decline = computeSemanticPlayerDevelopment(
        declinePlayer,
        new RNG(`semantic-decline-${index}`),
        1,
        { declineRiskMultiplier: 2 },
      );
      for (const [attribute, delta] of Object.entries(decline.changes) as Array<
        [PlayerAttribute, number | undefined]
      >) {
        if (delta === undefined) continue;
        declineChanges += 1;
        expect(isAttributeChangeImprovement(attribute, delta)).toBe(false);
      }
      expect(decline.abilityChange).toBeLessThanOrEqual(0);
    }

    expect(growthChanges).toBeGreaterThan(0);
    expect(declineChanges).toBeGreaterThan(0);
  });

  it("bounds breakthroughs by PA and improves only on-pitch attributes", () => {
    const player = makePlayer({ currentAbility: 100, potentialAbility: 102 });
    const atCeiling = makePlayer({ currentAbility: 102, potentialAbility: 102 });
    let breakthrough: ReturnType<typeof computeSemanticBreakthrough> = null;

    for (let index = 0; index < 1_000 && !breakthrough; index += 1) {
      breakthrough = computeSemanticBreakthrough(
        player,
        new RNG(`semantic-breakthrough-${index}`),
        3,
      );
    }

    expect(breakthrough).not.toBeNull();
    expect(player.currentAbility + breakthrough!.abilityChange)
      .toBeLessThanOrEqual(player.potentialAbility);
    expect(breakthrough!.abilityChange).toBeGreaterThan(0);
    expect(breakthrough!.improvedAttributes).not.toContain("injuryProneness");
    expect(breakthrough!.improvedAttributes).not.toContain("professionalism");
    expect(computeSemanticBreakthrough(atCeiling, new RNG("at-pa"), 3)).toBeNull();
  });
});
