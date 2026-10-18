import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NewGameConfig } from "@/engine/core/types";

const world = vi.hoisted(() => ({ initializeWorld: vi.fn() }));
vi.mock("@/engine/world", async (original) => ({
  ...await original<typeof import("@/engine/world")>(), initializeWorld: world.initializeWorld,
}));
vi.mock("@/lib/weeklySimulationWorkerClient", () => ({
  terminateWeeklySimulationWorker: vi.fn(), warmWeeklySimulationWorker: vi.fn(), getWeeklySimulationGeneration: () => 0,
}));
vi.mock("@/stores/actions/persistGameplayAutosave", () => ({
  resetGameplayAutosaveWatermark: () => false, queueGameplayAutosave: vi.fn(), queueWeeklyAutosave: vi.fn(),
  flushGameplayAutosave: vi.fn(), snapshotPersistedGameState: (state: unknown) => state,
}));
import { useGameStore } from "@/stores/gameStore";

const raw = JSON.parse(readFileSync(new URL("../fixtures/saves/v0-save-record.json", import.meta.url), "utf8")).state;
const config: NewGameConfig = {
  scoutFirstName: "New", scoutLastName: "Career", scoutAge: 24, specialization: "youth",
  difficulty: "normal", worldSeed: "autosave-feedback-reset", selectedCountries: ["england"],
  startingCountry: "england", skillAllocations: {},
};
beforeEach(() => { useGameStore.getState().loadGame(raw); });
afterEach(() => { useGameStore.getState().dismissSaveConflict(); });

describe("autosave feedback career ownership", () => {
  it.each(["pending", "saved", "error"] as const)("resets %s feedback when a valid career loads", (status) => {
    useGameStore.setState({ autosaveStatus: status, autosaveError: "Another career error" });
    useGameStore.getState().loadGame(raw);
    expect(useGameStore.getState()).toMatchObject({ autosaveStatus: "idle", autosaveError: null });
  });

  it("resets feedback as new-career initialization starts", async () => {
    let finish!: (world: object) => void;
    world.initializeWorld.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    useGameStore.setState({ autosaveStatus: "error", autosaveError: "Previous career error" });
    const starting = useGameStore.getState().startNewGame(config);
    const feedback = { status: useGameStore.getState().autosaveStatus, error: useGameStore.getState().autosaveError };
    useGameStore.getState().dismissSaveConflict();
    finish({});
    await starting;
    expect(feedback).toEqual({ status: "idle", error: null });
  });

  it("preserves current feedback when a terminal imported career is rejected", () => {
    useGameStore.setState({ autosaveStatus: "pending", autosaveError: null });
    expect(() => useGameStore.getState().loadGame({ ...raw,
      careerEnd: { reason: "ironman-fired", week: 1, season: 1 },
    })).toThrow();
    expect(useGameStore.getState()).toMatchObject({ autosaveStatus: "pending", autosaveError: null });
  });
});
