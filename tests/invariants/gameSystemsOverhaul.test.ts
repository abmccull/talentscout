import { describe, expect, it } from "vitest";
import { createRNG } from "@/engine/rng";
import { ALL_ATTRIBUTES, type Player, type Scout, type UnsignedYouth } from "@/engine/core/types";
import { generatePlayer } from "@/engine/players/generation";
import { calculateMomentQuality, generateMoments, sampleSessionPerformance } from "@/engine/observation/moments";
import { createOpeningCase } from "@/engine/youth/openingCase";
import type { ObservationOpponentContext, SessionPlayer } from "@/engine/observation/types";

function subject(): Player {
  const player = generatePlayer(createRNG("context-player"), { position: "CM", ageRange: [17, 17], abilityRange: [90, 90], nationality: "English", clubId: "" });
  return { ...player, form: 0, morale: 5.5, attributes: Object.fromEntries(ALL_ATTRIBUTES.map((key) => [key, 12])) as Player["attributes"] };
}
const visible = (player: Player): SessionPlayer => ({ playerId: player.id, name: player.firstName, position: player.position, naturalRole: player.naturalRole, isFocused: false } as SessionPlayer);
const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

describe("football evidence context", () => {
  it("focus choices cannot change the football events or their quality", () => {
    const player = subject();
    const pool = [visible(player)];
    const events = generateMoments(createRNG("match"), pool, "schoolMatch", 2, 5, undefined, { [player.id]: player });
    const focused = generateMoments(createRNG("match"), [{ ...pool[0], isFocused: true, currentLens: "technical" }], "schoolMatch", 2, 5, undefined, { [player.id]: player });
    expect(focused).toEqual(events);
  });

  it("opposition and late-match fatigue change execution across the same seeds", () => {
    const player = subject();
    const average = (relativeStrength: "stronger" | "weaker", phaseProgress: number, stamina: number) => mean(Array.from({ length: 200 }, (_, index) => calculateMomentQuality(createRNG("execution-" + index), { ...player, attributes: { ...player.attributes, stamina } }, ["passing"], false, { phaseProgress, opponent: { relativeStrength } as ObservationOpponentContext })));
    expect(average("weaker", 0, 12) - average("stronger", 0, 12)).toBeGreaterThan(0.8);
    expect(average("stronger", 0, 1) - average("stronger", 1, 1)).toBeGreaterThan(0.8);
    expect(average("stronger", 1, 20) - average("stronger", 1, 1)).toBeGreaterThan(0.8);
  });

  it("inconsistent players have more performance variance between sessions", () => {
    const player = subject();
    const variance = (consistency: number) => {
      const offsets = Array.from({ length: 300 }, (_, index) => sampleSessionPerformance(createRNG("session-" + index), [visible(player)], { [player.id]: { ...player, attributes: { ...player.attributes, consistency } } })[player.id]);
      return mean(offsets.map((value) => (value - mean(offsets)) ** 2));
    };
    expect(variance(1)).toBeGreaterThan(variance(20) * 8);
  });

  it("opening tip selection cannot read hidden ability or potential", () => {
    const player = subject();
    const youth = Object.fromEntries(Array.from({ length: 8 }, (_, index) => ["youth-" + index, { id: "youth-" + index, player: { ...player, id: "player-" + index }, country: "england", placed: false, retired: false, visibility: 0, buzzLevel: index * 3 }])) as Record<string, UnsignedYouth>;
    const pick = (pool: Record<string, UnsignedYouth>) => createOpeningCase({ seed: "opening-tip", scout: { id: "scout", primarySpecialization: "youth" } as Scout, unsignedYouth: pool, contacts: {}, youthRecruitmentBriefs: {}, week: 1, season: 1 });
    const changed = Object.fromEntries(Object.entries(youth).map(([id, entry], index) => [id, { ...entry, player: { ...entry.player, currentAbility: 200 - index, potentialAbility: 200 - index } }]));
    expect(pick(changed)).toEqual(pick(youth));
  });
});
