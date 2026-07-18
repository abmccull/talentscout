import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  findUnpartitionedGameStateKeys,
  gameStateFieldSelector,
  getActiveGameMode,
  getActiveGameModeId,
  getActiveRunKind,
  partitionGameState,
} from "@/engine/core/gameStatePartitions";
import { migrateSaveState } from "@/lib/db";

const goldenV0Path = fileURLToPath(
  new URL("../fixtures/saves/v0-save-record.json", import.meta.url),
);

function migratedState() {
  const record = JSON.parse(readFileSync(goldenV0Path, "utf8")) as {
    state: Record<string, unknown>;
  };
  return migrateSaveState(record.state);
}

describe("GameState ownership partitions", () => {
  it("classifies every persisted field in the canonical legacy migration", () => {
    const state = migratedState();
    expect(findUnpartitionedGameStateKeys(state)).toEqual([]);
  });

  it("exposes read-only ownership facades without cloning or hiding shared truth", () => {
    const state = migratedState();
    const partitions = partitionGameState(state, "youth");
    expect(partitions.sharedWorld).not.toBe(state);
    expect(partitions.sharedCareer).not.toBe(state);
    expect(partitions.mode).not.toBe(state);

    expect(getActiveGameMode(state)).toBe(state.runManifest.specialization);
    expect(getActiveGameModeId(state)).toBe("youth-scout");
    expect(getActiveRunKind(state)).toBe("career");
    expect(partitions.sharedWorld.players).toBe(state.players);
    expect(partitions.sharedCareer.reports).toBe(state.reports);
    expect(partitions.mode.unsignedYouth).toBe(state.unsignedYouth);
    expect(partitions.sharedCareer.systemFitCache).toBe(state.systemFitCache);
  });

  it("does not let mutable scout specialization replace immutable run identity", () => {
    const state = migratedState();
    const inconsistent = {
      ...state,
      scout: { ...state.scout, primarySpecialization: "data" as const },
    };

    expect(getActiveGameMode(inconsistent)).toBe(state.runManifest.specialization);
    expect(getActiveGameModeId(inconsistent)).toBe("youth-scout");
  });

  it("builds narrow selectors that tolerate the loading state", () => {
    const state = migratedState();
    const selectReports = gameStateFieldSelector("reports");

    expect(selectReports({ gameState: state })).toBe(state.reports);
    expect(selectReports({ gameState: null })).toBeNull();
  });
});
