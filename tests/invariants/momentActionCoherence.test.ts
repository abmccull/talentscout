import { describe, expect, it } from "vitest";
import { ALL_ATTRIBUTES, type Player } from "@/engine/core/types";
import { generatePlayer } from "@/engine/players/generation";
import { createRNG } from "@/engine/rng";
import { generateMoments, selectMomentAction } from "@/engine/observation/moments";
import { MOMENT_ACTIONS } from "@/engine/observation/momentActions";
import type { SessionPlayer } from "@/engine/observation/types";

function subject(position: "ST" | "GK" = "ST"): Player {
  const generated = generatePlayer(createRNG("action-player"), {
    position, ageRange: [17, 17], abilityRange: [90, 90], nationality: "English", clubId: "",
  });
  return { ...generated, id: "action-player", form: 0, morale: 5.5,
    attributes: Object.fromEntries(ALL_ATTRIBUTES.map((attribute) => [attribute, 10])) as Player["attributes"] };
}

function visible(player: Player, focused = false): SessionPlayer {
  return { playerId: player.id, name: "Reece Beckham", position: player.position, naturalRole: player.naturalRole,
    isFocused: focused, focusedPhases: focused ? [0] : [], focusHistory: [], currentLens: focused ? "technical" : undefined };
}

function events(seed: string, player = subject(), quality?: number, focused = false) {
  const rng = createRNG(seed);
  // Fix execution quality only. Action selection still follows the real seeded generator.
  if (quality !== undefined) rng.gaussian = () => quality;
  return generateMoments(rng, [visible(player, focused)], "schoolMatch", 0, 5, undefined, { [player.id]: player });
}

describe("football action evidence coherence", () => {
  it("a striker's misplaced short pass assesses passing under minimal pressure", () => {
    const passingErrors = Array.from({ length: 120 }, (_, index) => events(`short-pass-${index}`, subject(), 3))
      .flat().filter((moment) => moment.description.includes("misplaced a short pass"));
    expect(passingErrors.length).toBeGreaterThan(5);
    for (const moment of passingErrors) {
      expect(moment.attributesHinted).toEqual(["passing"]);
      expect(moment.pressureContext).toBe(false);
      expect(moment.vagueDescription).not.toMatch(/precise|impressive|tidy|brilliance|good|won/i);
    }
  });

  it("passing ability changes short-pass execution, while finishing and heading cannot", () => {
    const base = subject();
    const passer = { ...base, attributes: { ...base.attributes, passing: 20 } };
    const scorer = { ...base, attributes: { ...base.attributes, finishing: 20, heading: 20 } };
    let cases = 0;
    let improvement = 0;
    for (let index = 0; index < 140; index += 1) {
      const seed = `pass-contributors-${index}`;
      const baseline = events(seed, base);
      const passing = events(seed, passer);
      const finishing = events(seed, scorer);
      for (const moment of baseline.filter((entry) => entry.attributesHinted.length === 1 && entry.attributesHinted[0] === "passing")) {
        cases += 1;
        improvement += passing.find((entry) => entry.id === moment.id)!.quality - moment.quality;
        expect(finishing.find((entry) => entry.id === moment.id)).toEqual(moment);
      }
    }
    expect(cases).toBeGreaterThan(5);
    expect(improvement / cases).toBeGreaterThan(3);
  });

  it("every generated passage keeps its action's contributors, pressure and quality-band wording together", () => {
    const seen = new Set<string>();
    for (const quality of [2, 4, 5, 6, 7, 9]) {
      for (let index = 0; index < 120; index += 1) {
        for (const moment of events(`action-catalog-${index}`, subject(), quality)) {
          const band = quality >= 7 ? "high" : quality >= 5 ? "medium" : "low";
          const action = MOMENT_ACTIONS.find((candidate) =>
            candidate.descriptions[band].replace("{playerName}", "Reece Beckham") === moment.description);
          expect(action, moment.description).toBeDefined();
          expect(moment.attributesHinted).toEqual(action!.attributes);
          expect(moment.pressureContext).toBe(action!.pressure);
          expect(moment.momentType).toBe(action!.momentType);
          seen.add(action!.id);
        }
      }
    }
    expect(seen.size).toBe(MOMENT_ACTIONS.length);
  });

  it("goalkeepers are not assigned shooting, wing-crossing, or pressing-forward actions", () => {
    const keeper = subject("GK");
    for (let index = 0; index < 100; index += 1) {
      for (const moment of events(`keeper-actions-${index}`, keeper, 7)) {
        const action = MOMENT_ACTIONS.find((candidate) => candidate.descriptions.high.replace("{playerName}", "Reece Beckham") === moment.description)!;
        expect(action.outfieldOnly).not.toBe(true);
      }
    }
  });

  it("pressure-weighted action selection responds to match context", () => {
    const player = visible(subject());
    const pressured = (probability: number) => Array.from({ length: 400 }, (_, index) =>
      selectMomentAction(createRNG(`pressure-action-${index}`), "technicalAction", player, probability))
      .filter((action) => action.pressure).length;
    expect(pressured(0.65) - pressured(0.2)).toBeGreaterThan(100);
  });

  it("replays the same seed and cannot change football outcomes by applying a lens", () => {
    for (let index = 0; index < 25; index += 1) {
      const seed = `action-replay-${index}`;
      expect(events(seed)).toEqual(events(seed));
      expect(events(seed, subject(), undefined, true)).toEqual(events(seed));
    }
  });
});
