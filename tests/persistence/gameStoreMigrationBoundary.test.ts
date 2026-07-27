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

  it("normalizes malformed career-era state identically through direct and provider loads", () => {
    const legacyRecord = JSON.parse(readFileSync(goldenV0Path, "utf8")) as {
      state: Record<string, unknown>;
    } & Record<string, unknown>;
    const malformedState = structuredClone(legacyRecord.state);
    malformedState.careerEraDirectorState = {
      version: 999,
      current: {
        id: "legacy-era",
        theme: "agencyRunway",
        startedAt: { season: 2026, week: 2.9 },
        endsAt: { season: 2026, week: 8 },
        reinforcementCount: -4,
        deskPrompt: " ",
      },
      history: [
        {
          id: "legacy-history",
          theme: "proveJudgment",
          startedAt: { season: 2025, week: 30 },
          endedAt: { season: 2025, week: 38 },
          reinforcementCount: 3,
        },
        null,
        { bad: true },
      ],
      processedWeekKeys: ["2026:2", "2026:2", 4, "", "2026:5"],
    };
    const sourceSnapshot = structuredClone(malformedState);

    useGameStore.getState().loadGame(malformedState);
    const direct = structuredClone(useGameStore.getState().gameState);

    const providerState = migrateSaveRecord({
      ...legacyRecord,
      state: malformedState,
    }).state;
    useGameStore.getState().loadGame(providerState);
    const fromProvider = structuredClone(useGameStore.getState().gameState);

    expect(malformedState).toEqual(sourceSnapshot);
    expect(fromProvider?.careerEraDirectorState).toEqual(direct?.careerEraDirectorState);
    expect(direct?.careerEraDirectorState).toMatchObject({
      version: 1,
      current: {
        id: "legacy-era",
        theme: "agencyRunway",
        title: "Independence needs a business model",
        startedAt: { season: 2026, week: 2 },
        reinforcementCount: 0,
      },
      history: [{
        id: "legacy-history",
        theme: "proveJudgment",
        reinforcementCount: 3,
      }],
      processedWeekKeys: ["2026:2", "2026:5"],
    });
    expect(direct?.careerEraDirectorState?.current?.premise).toBeTruthy();
    expect(direct?.careerEraDirectorState?.current?.deskPrompt).toBeTruthy();
    expect(direct?.careerEraDirectorState?.current?.lastReinforcedAt).toBeUndefined();
  });

  it("surfaces a controlled validation error for a malformed direct load", () => {
    expect(() => useGameStore.getState().loadGame({
      currentSeason: 1,
      currentWeek: 1,
      scout: null,
    })).toThrow("Invalid save data: scout must be an object");
  });
});
