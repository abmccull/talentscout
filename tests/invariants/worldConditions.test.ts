import { describe, expect, it } from "vitest";
import type {
  FinancialRecord,
  GameState,
  RunManifest,
  Scout,
} from "@/engine/core/types";
import { createRunManifest } from "@/engine/run";
import { initializeFinances } from "@/engine/finance/expenses";
import {
  WORLD_CONDITION_DECK,
  WORLD_CONDITION_HISTORY_LIMIT,
  advanceWorldConditionSeason,
  applyWorldConditionSeasonStart,
  createWorldConditionState,
  generateWorldConditionSeason,
  getWorldConditionModifiers,
  migrateWorldConditionState,
  type WorldConditionState,
} from "@/engine/world/worldConditions";

const COUNTRIES = ["england", "brazil", "japan", "nigeria"];

function manifest(seed: string): RunManifest {
  return createRunManifest({
    rootSeed: seed,
    specialization: "youth",
    difficulty: "normal",
    selectedCountries: COUNTRIES,
    startingCountry: "england",
    worldTraitIds: ["golden-generation", "scout-wars", "boom-bust-market"],
  });
}

function scout(): Scout {
  return {
    id: "world-scout",
    firstName: "Rae",
    lastName: "Mora",
    age: 36,
    nationality: "English",
    homeCountry: "england",
    skills: {} as Scout["skills"],
    attributes: {} as Scout["attributes"],
    primarySpecialization: "youth",
    specializationLevel: 8,
    specializationXp: 0,
    unlockedPerks: [],
    careerTier: 2,
    careerPath: "independent",
    reputation: 42,
    clubTrust: 0,
    specializationReputation: 35,
    salary: 0,
    savings: 0,
    reportsSubmitted: 0,
    successfulFinds: 0,
    discoveryCredits: [],
    fatigue: 0,
    skillXp: {},
    attributeXp: {},
    npcScoutIds: [],
    countryReputations: {
      england: {
        country: "england",
        familiarity: 50,
        reportsSubmitted: 0,
        successfulFinds: 0,
        contactCount: 0,
      },
    },
    boardDirectives: [],
  } as Scout;
}

function gameState(
  seed: string,
  season: number,
  conditionState?: WorldConditionState,
): GameState {
  const runManifest = manifest(seed);
  return {
    seed,
    runManifest,
    currentWeek: 1,
    currentSeason: season,
    countries: COUNTRIES,
    scout: scout(),
    inbox: [],
    finances: initializeFinances(scout(), "independent", "normal"),
    worldConditionState: conditionState,
  } as unknown as GameState;
}

function findStateWith(
  predicate: (state: WorldConditionState) => boolean,
): { runManifest: RunManifest; state: WorldConditionState } {
  for (let index = 0; index < 500; index += 1) {
    const runManifest = manifest(`world-condition-${index}`);
    const state = createWorldConditionState(runManifest, COUNTRIES, 1);
    if (predicate(state)) return { runManifest, state };
  }
  throw new Error("No deterministic world-condition fixture matched");
}

describe("dynamic world-condition deck", () => {
  it("generates the same persisted season from seed and season and diverges across runs", () => {
    const first = generateWorldConditionSeason(manifest("alpha"), 4, COUNTRIES);
    const replay = generateWorldConditionSeason(manifest("alpha"), 4, [...COUNTRIES].reverse());
    const other = generateWorldConditionSeason(manifest("beta"), 4, COUNTRIES);

    expect(replay).toEqual(first);
    expect(other.conditions.map((condition) => condition.definitionId))
      .not.toEqual(first.conditions.map((condition) => condition.definitionId));
    expect(first.conditions.filter((condition) => condition.scope === "global"))
      .toHaveLength(1);
    expect(first.conditions.some((condition) => condition.scope === "regional"))
      .toBe(true);
  });

  it("applies regional conditions only to their country while global conditions remain universal", () => {
    const { state } = findStateWith((candidate) =>
      candidate.active.some((condition) => condition.scope === "regional")
    );
    const regional = state.active.find((condition) => condition.scope === "regional")!;
    const regionalModifiers = getWorldConditionModifiers(
      { worldConditionState: state },
      regional.countryId,
    );
    const globalOnly = getWorldConditionModifiers(
      { worldConditionState: state },
      "unaffected-country",
    );

    expect(regionalModifiers).not.toEqual(globalOnly);
    expect(getWorldConditionModifiers({ worldConditionState: state }))
      .toEqual(globalOnly);
  });

  it("migrates missing and malformed data deterministically and remains idempotent", () => {
    const runManifest = manifest("legacy-world");
    const migrated = migrateWorldConditionState(
      { version: 99, history: [{ season: 0, conditions: "bad" }] },
      runManifest,
      COUNTRIES,
      7,
    );
    const replay = migrateWorldConditionState(
      structuredClone(migrated),
      runManifest,
      COUNTRIES,
      7,
    );

    expect(migrated.activeSeason).toBe(7);
    expect(migrated.active.length).toBeGreaterThanOrEqual(2);
    expect(replay).toEqual(migrated);
  });

  it("rejects non-numeric and non-finite persisted modifiers", () => {
    const runManifest = manifest("hostile-world-save");
    const original = createWorldConditionState(runManifest, COUNTRIES, 1);
    const corrupted = structuredClone(original) as unknown as {
      history: Array<{
        conditions: Array<{ modifiers: Record<string, unknown> }>;
      }>;
    };
    const modifiers = corrupted.history[0].conditions[0].modifiers;
    modifiers.discoveryMultiplier = "1000";
    modifiers.opportunityMultiplier = Number.POSITIVE_INFINITY;
    modifiers.recruitmentScoreAdjustment = Number.NaN;
    modifiers.travelCostMultiplier = 1.25;

    const migrated = migrateWorldConditionState(
      corrupted,
      runManifest,
      COUNTRIES,
      1,
    );
    const restored = migrated.active[0].modifiers;

    expect(restored.discoveryMultiplier).toBe(1);
    expect(restored.opportunityMultiplier).toBe(1);
    expect(restored.recruitmentScoreAdjustment).toBe(0);
    expect(restored.travelCostMultiplier).toBe(1.25);
  });

  it("removes active regional conditions for countries outside the generated world", () => {
    const runManifest = manifest("ghost-condition-country");
    const original = createWorldConditionState(runManifest, COUNTRIES, 1);
    const corrupted = structuredClone(original);
    const regional = corrupted.history[0].conditions.find(
      (condition) => condition.scope === "regional",
    );
    const global = corrupted.history[0].conditions.find(
      (condition) => condition.scope === "global",
    );
    expect(regional).toBeDefined();
    expect(global).toBeDefined();
    regional!.countryId = "ghost-country";
    corrupted.history[0].conditions.push({
      ...structuredClone(global!),
      id: `${global!.id}:duplicate`,
      season: 99,
    });
    corrupted.active = corrupted.history[0].conditions;

    const migrated = migrateWorldConditionState(
      corrupted,
      runManifest,
      ["england"],
      1,
    );

    expect(migrated.active.some(
      (condition) =>
        condition.scope === "regional" && condition.countryId === "ghostcountry",
    )).toBe(false);
    expect(migrated.active.filter((condition) => condition.scope === "global"))
      .toHaveLength(1);
    expect(migrated.active.every((condition) => condition.season === 1)).toBe(true);
    expect(migrateWorldConditionState(migrated, runManifest, ["england"], 1))
      .toEqual(migrated);
  });

  it("keeps sequential and save-reloaded season advancement equivalent and bounded", () => {
    const runManifest = manifest("manual-batch-equivalence");
    let uninterrupted = createWorldConditionState(runManifest, COUNTRIES, 1);
    let saveReloaded = structuredClone(uninterrupted);

    for (let season = 2; season <= WORLD_CONDITION_HISTORY_LIMIT + 8; season += 1) {
      uninterrupted = advanceWorldConditionSeason(
        uninterrupted,
        runManifest,
        COUNTRIES,
        season,
      );
      saveReloaded = advanceWorldConditionSeason(
        JSON.parse(JSON.stringify(saveReloaded)) as WorldConditionState,
        runManifest,
        [...COUNTRIES].reverse(),
        season,
      );
    }

    expect(saveReloaded).toEqual(uninterrupted);
    expect(uninterrupted.history).toHaveLength(WORLD_CONDITION_HISTORY_LIMIT);
    expect(uninterrupted.history.at(-1)?.season)
      .toBe(WORLD_CONDITION_HISTORY_LIMIT + 8);
  });

  it("announces and records a financial season effect exactly once", () => {
    const fixture = findStateWith((candidate) =>
      getWorldConditionModifiers({ worldConditionState: candidate }, "england")
        .seasonalFinanceAdjustment !== 0
    );
    const initial = gameState(fixture.runManifest.rootSeed, 1, fixture.state);
    const beforeBalance = initial.finances!.balance;
    const once = applyWorldConditionSeasonStart(initial);
    const twice = applyWorldConditionSeasonStart(structuredClone(once));
    const adjustment = getWorldConditionModifiers(once, "england")
      .seasonalFinanceAdjustment;
    const reference = "world-condition-finance:s1";

    expect(once.finances!.balance).toBe(beforeBalance + adjustment);
    expect(once.finances!.transactions.filter((entry) => entry.referenceId === reference))
      .toHaveLength(1);
    expect(once.inbox.filter((message) => message.id === "world-conditions-s1"))
      .toHaveLength(1);
    expect(twice).toEqual(once);
    expect((twice.finances as FinancialRecord).transactions.reduce(
      (sum, transaction) => sum + transaction.amount,
      0,
    )).toBe(twice.finances!.balance);
  });

  it("ships every condition with visible effects and non-neutral mechanics", () => {
    for (const definition of WORLD_CONDITION_DECK) {
      expect(definition.playerFacingEffects.length).toBeGreaterThanOrEqual(2);
      expect(Object.values(definition.modifiers).some((value) =>
        typeof value === "number" && value !== 0 && value !== 1
      )).toBe(true);
    }
  });
});
