import { describe, expect, it, vi } from "vitest";
import type { GameState, Injury, InjuryHistory, NewGameConfig, PersonalityProfile, Player } from "@/engine/core/types";
import { RNG } from "@/engine/rng";
import { generatePlayer } from "@/engine/players/generation";
import { processInjuries, addToInjuryHistory } from "@/engine/core/weekly/playerSimulation";
import { applyWeeklyFormAndAvailability } from "@/engine/core/weekly/stateApplication";
import { simulateHistoricalWorldMatchWeeks } from "@/engine/core/gameLoop";
import { calculatePlayerMatchRating, computeFormFromRatings } from "@/engine/match/ratings";
import { calculateTransferMotivation } from "@/engine/world/transferMotivation";
import { assessRetirementIntent } from "@/engine/transfers/retirementPlanning";
import { createScout } from "@/engine/scout/creation";
import { observePlayer, observePlayerLight } from "@/engine/scout/perception";

// Hand-authored wire facts deliberately exercise existing public consumers before
// the new leaf module exists. These helpers are an independent test oracle.
function history(id: string): InjuryHistory {
  return {
    playerId: id,
    injuries: [["old-a", "muscle", "minor", 3, 2, 1], ["old-b", "ligament", "moderate", 7, 4, 2]],
    totalWeeksMissed: 90,
    injuryProneness: 0.4,
    reinjuryWindowWeeksLeft: 4,
  };
}
function profile(): PersonalityProfile {
  return {
    archetype: "ambitious", traits: ["ambitious", "leader"],
    transferWillingness: 0.876543210987654,
    dressingRoomImpact: 0.234567890123456,
    formVolatility: 1.7, bigMatchModifier: 0.8,
    hiddenUntilRevealed: false, revealedTraits: ["ambitious", "leader"],
  };
}
function player(age = 25): Player {
  const value = generatePlayer(new RNG("player-archive-consumer"), {
    position: "CM", ageRange: [age, age], abilityRange: [104, 104],
    nationality: "English", clubId: "club",
  });
  return { ...value, injured: false, injuryWeeksRemaining: 0, currentInjury: undefined,
    injuryHistory: history(value.id), personalityProfile: profile() };
}
function packed(value: Player): Player {
  const h = value.injuryHistory as InjuryHistory;
  const p = value.personalityProfile as PersonalityProfile;
  return { ...value,
    injuryHistory: ["ih-own", 1, h.injuries, h.totalWeeksMissed, h.injuryProneness, h.reinjuryWindowWeeksLeft],
    personalityProfile: ["pp", 1, p.archetype, p.traits, p.transferWillingness,
      p.dressingRoomImpact, p.formVolatility, p.bigMatchModifier, p.hiddenUntilRevealed, p.revealedTraits],
  } as unknown as Player;
}
function semantic(value: Player): Player {
  const h = value.injuryHistory as unknown;
  const p = value.personalityProfile as unknown;
  let injuryHistory = h;
  if (Array.isArray(h) && h[0] === "ih-own") {
    injuryHistory = { playerId: value.id, injuries: h[2], totalWeeksMissed: h[3],
      injuryProneness: h[4], reinjuryWindowWeeksLeft: h[5] };
  } else if (Array.isArray(h) && h[0] === "ih") {
    injuryHistory = { playerId: h[2], injuries: h[3], totalWeeksMissed: h[4],
      injuryProneness: h[5], reinjuryWindowWeeksLeft: h[6] };
  }
  const personalityProfile = Array.isArray(p) && p[0] === "pp"
    ? { archetype: p[2], traits: p[3], transferWillingness: p[4], dressingRoomImpact: p[5],
      formVolatility: p[6], bigMatchModifier: p[7], hiddenUntilRevealed: p[8], revealedTraits: p[9] }
    : p;
  return { ...value, injuryHistory, personalityProfile } as Player;
}
function state(value: Player): GameState {
  return {
    seed: "player-archive-consumer", runManifest: { rootSeed: "player-archive-consumer" },
    currentSeason: 3, currentWeek: 11, players: { [value.id]: value },
    fixtures: {}, leagues: {}, clubs: {}, matchRatings: {}, disciplinaryRecords: {},
  } as unknown as GameState;
}
function marketState(value: Player): GameState {
  return { ...state(value), clubs: {
    club: { id: "club", reputation: 55, playerIds: [value.id] },
  } } as unknown as GameState;
}
function injury(value: Player): Injury {
  return { id: "new-injury", playerId: value.id, type: "muscle", severity: "minor",
    recoveryWeeks: 3, weeksRemaining: 3, reinjuryRisk: 0.12, occurredWeek: 11, occurredSeason: 3 };
}
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const config: NewGameConfig = {
  scoutFirstName: "Archive", scoutLastName: "Tester", scoutAge: 32,
  specialization: "youth", difficulty: "normal", worldSeed: "player-archive-scout",
  startingCountry: "england", selectedCountries: ["england"],
  skillAllocations: { technicalEye: 2, physicalAssessment: 1, psychologicalRead: 1,
    tacticalUnderstanding: 1, dataLiteracy: 1, playerJudgment: 1, potentialAssessment: 1 },
};

describe("player archive facts through existing gameplay consumers", () => {
  it("preserves actual injury probability, generated incidents and next RNG state", () => {
    const ordinary = player();
    const archived = packed(ordinary);
    const ordinaryRng = new RNG("injury-parity");
    const packedRng = new RNG("injury-parity");
    const ordinaryChance = vi.spyOn(ordinaryRng, "chance");
    const packedChance = vi.spyOn(packedRng, "chance");
    const before = JSON.stringify(archived);
    const expected = processInjuries(state(ordinary), ordinaryRng);
    const actual = processInjuries(state(archived), packedRng);
    expect(ordinaryChance).toHaveBeenCalled();
    expect(packedChance.mock.calls).toEqual(ordinaryChance.mock.calls);
    expect(actual).toEqual(expected);
    expect(packedRng.next()).toBe(ordinaryRng.next());
    expect(JSON.stringify(archived)).toBe(before);
  });

  it("appends a new incident without losing owner, lifetime total or history risk", () => {
    const ordinary = player();
    const archived = packed(ordinary);
    const incident = injury(ordinary);
    const expected = addToInjuryHistory(ordinary, incident);
    const actual = addToInjuryHistory(archived, incident);
    expect(actual).toEqual(expected);
    expect(actual.totalWeeksMissed).toBe(93);
    expect(actual.playerId).toBe(ordinary.id);
    expect(actual.injuries.at(-1)).toEqual(incident);
    expect(actual.injuryProneness).toBe(0.43000000000000005);
    expect(actual.reinjuryWindowWeeksLeft).toBe(0);
  });

  it.each(["recovery", "window", "new-injury"] as const)(
    "preserves canonical weekly %s availability behavior and source facts",
    (scenario) => {
      let ordinary = player();
      if (scenario === "recovery") ordinary = { ...ordinary, injured: true,
        injuryWeeksRemaining: 1, currentInjury: { ...injury(ordinary), weeksRemaining: 1 } };
      const archived = packed(ordinary);
      const before = JSON.stringify(archived);
      const injuries = scenario === "new-injury"
        ? [{ playerId: ordinary.id, weeksOut: 3, injury: injury(ordinary) }] : [];
      const tick = { formMomentumUpdates: [], injuries };
      const expected = applyWeeklyFormAndAvailability({ [ordinary.id]: ordinary }, tick, clamp, addToInjuryHistory);
      const actual = applyWeeklyFormAndAvailability({ [archived.id]: archived }, tick, clamp, addToInjuryHistory);
      expect(semantic(actual.updatedPlayers[ordinary.id])).toEqual(semantic(expected.updatedPlayers[ordinary.id]));
      expect(actual.newlyInjuredPlayerIds).toEqual(expected.newlyInjuredPlayerIds);
      const h = semantic(actual.updatedPlayers[ordinary.id]).injuryHistory as InjuryHistory;
      expect(h.reinjuryWindowWeeksLeft).toBe(scenario === "recovery" ? 4 : scenario === "window" ? 3 : 0);
      expect(h.totalWeeksMissed).toBe(scenario === "new-injury" ? 93 : 90);
      expect(JSON.stringify(archived)).toBe(before);
    },
  );

  it("preserves recovery through the real public historical match-week entry point", () => {
    const ordinary = { ...player(), injured: true, injuryWeeksRemaining: 1 };
    const archived = packed(ordinary);
    const before = JSON.stringify(archived);
    const expected = simulateHistoricalWorldMatchWeeks(state(ordinary), 2);
    const actual = simulateHistoricalWorldMatchWeeks(state(archived), 2);
    expect(semantic(actual.players[ordinary.id])).toEqual(semantic(expected.players[ordinary.id]));
    expect(actual.fixtures).toEqual(expected.fixtures);
    expect(actual.matchRatings).toEqual(expected.matchRatings);
    expect(actual.disciplinaryRecords).toEqual(expected.disciplinaryRecords);
    const h = semantic(actual.players[ordinary.id]).injuryHistory as InjuryHistory;
    expect(h.reinjuryWindowWeeksLeft).toBe(4);
    expect(JSON.stringify(archived)).toBe(before);
  });

  it("retains exact personality effects on important-match ratings and persisted form", () => {
    const ordinary = player();
    const archived = packed(ordinary);
    const events = [{ type: "goal" as const, playerId: ordinary.id, quality: 4.2 }];
    const expected = calculatePlayerMatchRating(ordinary, events, 1, 1, 1, "fixture", true);
    expect(calculatePlayerMatchRating(archived, events, 1, 1, 1, "fixture", true)).toEqual(expected);
    const recent = [{ fixtureId: "fixture", week: 10, season: 3, rating: 7.1 }];
    expect(computeFormFromRatings(recent, archived)).toBe(computeFormFromRatings(recent, ordinary));
    expect(computeFormFromRatings(recent, ordinary)).not.toBe(computeFormFromRatings(recent));
  });

  it("retains transfer motivation and retirement injury pressure", () => {
    const ordinary = player(35);
    const archived = packed(ordinary);
    const expectedTransfer = calculateTransferMotivation(ordinary, marketState(ordinary));
    expect(expectedTransfer.components.personalityPressure).toBeGreaterThan(0);
    expect(calculateTransferMotivation(archived, marketState(archived))).toEqual(expectedTransfer);
    const expectedRetirement = assessRetirementIntent(ordinary, marketState(ordinary));
    expect(expectedRetirement.components.injuryPressure).toBeGreaterThan(0);
    expect(assessRetirementIntent(archived, marketState(archived))).toEqual(expectedRetirement);
  });

  it.each(["light", "full"] as const)(
    "preserves %s observation no-op reveal identity, notes and next RNG state",
    (mode) => {
      const ordinary = player();
      const archived = packed(ordinary);
      const scout = createScout(config, new RNG("player-archive-scout"));
      const ordinaryRng = new RNG("observe-parity");
      const packedRng = new RNG("observe-parity");
      const before = JSON.stringify(archived);
      const observe = (value: Player, rng: RNG) => mode === "light"
        ? observePlayerLight(rng, value, scout, "streetFootball", [])
        : observePlayer(rng, value, scout, [], [], "streetFootball", []);
      const expected = observe(ordinary, ordinaryRng);
      const actual = observe(archived, packedRng);
      expect(expected.updatedPersonalityProfile).toBeUndefined();
      expect(actual).toEqual(expected);
      expect(actual.updatedPersonalityProfile).toBeUndefined();
      expect(packedRng.next()).toBe(ordinaryRng.next());
      expect(JSON.stringify(archived)).toBe(before);
    },
  );
});
