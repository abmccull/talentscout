import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { migrateSaveRecord } from "@/lib/db";
import { useGameStore } from "@/stores/gameStore";

const goldenV0Path = fileURLToPath(
  new URL("../fixtures/saves/v0-save-record.json", import.meta.url),
);

describe("game store migration boundary", () => {
  afterEach(() => {
    useGameStore.setState({
      gameState: null,
      isLoaded: false,
      activeSession: null,
      currentScreen: "mainMenu",
    });
  });

  it("produces the same runtime state for direct and provider-migrated legacy loads", () => {
    const legacyRecord = JSON.parse(readFileSync(goldenV0Path, "utf8")) as {
      state: Record<string, unknown>;
    } & Record<string, unknown>;
    const sourceSnapshot = structuredClone(legacyRecord.state);

    useGameStore.getState().loadGame(legacyRecord.state);
    const direct = structuredClone(useGameStore.getState().gameState);

    const providerState = migrateSaveRecord(legacyRecord).state;
    useGameStore.getState().loadGame(providerState);
    const fromProvider = structuredClone(useGameStore.getState().gameState);

    expect(legacyRecord.state).toEqual(sourceSnapshot);
    expect(fromProvider).toEqual(direct);
  });

  it("surfaces a controlled validation error for a malformed direct load", () => {
    expect(() => useGameStore.getState().loadGame({
      currentSeason: 1,
      currentWeek: 1,
      scout: null,
    })).toThrow("Invalid save data: scout must be an object");
  });
});
