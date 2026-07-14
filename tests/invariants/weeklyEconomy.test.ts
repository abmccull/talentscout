import { describe, expect, it } from "vitest";
import type { GameState, NewGameConfig } from "@/engine/core/types";
import { initializeFinances } from "@/engine/finance";
import { createRunManifest } from "@/engine/run";
import { RNG } from "@/engine/rng";
import { createScout } from "@/engine/scout/creation";
import { processWeeklyEconomy } from "@/stores/actions/weeklyEconomy";

const CONFIG: NewGameConfig = {
  scoutFirstName: "Economy",
  scoutLastName: "Invariant",
  scoutAge: 31,
  specialization: "youth",
  difficulty: "normal",
  worldSeed: "weekly-economy-invariant",
  startingCountry: "england",
  selectedCountries: ["england"],
  skillAllocations: {
    technicalEye: 2,
    physicalAssessment: 1,
    psychologicalRead: 1,
    tacticalUnderstanding: 1,
    dataLiteracy: 1,
    playerJudgment: 1,
    potentialAssessment: 1,
  },
};

function economyState(): GameState {
  const scout = {
    ...createScout(CONFIG, new RNG("weekly-economy-scout")),
    careerPath: "independent" as const,
  };
  return {
    seed: CONFIG.worldSeed,
    runManifest: createRunManifest({
      rootSeed: CONFIG.worldSeed,
      specialization: CONFIG.specialization,
      difficulty: CONFIG.difficulty,
      selectedCountries: ["england"],
      startingCountry: CONFIG.startingCountry,
      worldTraitIds: ["golden-generation", "trusted-circuit", "cautious-market"],
    }),
    currentWeek: 3,
    currentSeason: 1,
    difficulty: CONFIG.difficulty,
    scout,
    finances: initializeFinances(scout, "independent", CONFIG.difficulty),
    fixtures: {},
    clubs: {},
    players: {},
    unsignedYouth: {},
    reports: {},
    inbox: [],
  } as unknown as GameState;
}

describe("weekly economy orchestration", () => {
  it("is deterministic and does not mutate its input state", () => {
    const state = economyState();
    const snapshot = structuredClone(state);
    const rngContext = {
      seed: state.seed,
      currentWeek: state.currentWeek,
      currentSeason: state.currentSeason,
    };

    const first = processWeeklyEconomy(state, rngContext);
    const replay = processWeeklyEconomy(structuredClone(state), rngContext);

    expect(state).toEqual(snapshot);
    expect(first).toEqual(replay);
    expect(first.finances?.transactions.reduce(
      (total, transaction) => total + transaction.amount,
      0,
    )).toBe(first.finances?.balance);
  });

  it("preserves state identity when finances are unavailable", () => {
    const state = { ...economyState(), finances: undefined };

    expect(processWeeklyEconomy(state, state)).toBe(state);
  });
});
