// Direct early-refusal baseline works without importing the new codec module.
import { afterEach, describe, expect, it, vi } from "vitest";
import { migrateSaveRecord, migrateSaveState } from "@/lib/db";
import { CURRENT_SAVE_SCHEMA_VERSION, SaveMigrationError } from "@/lib/saveEnvelope";

afterEach(() => { vi.restoreAllMocks(); });
const validRaw = () => ({ movementRowsV1: [0, [], [[1, 0, 0, "move:P:one", "P", 1, 4, 2]]] });
function state(target: "raw" | "summary", stored: unknown): Record<string, unknown> {
  return { currentSeason: 2, currentWeek: 4, scout: {},
    ...(target === "raw" ? { playerMovementHistory: stored } : {
      worldHistory: { version: 1, latestRecordedSeason: 1,
        seasons: [{ season: 1, recordedAtWeek: 40, playerMovementSummaries: stored }] },
    }),
  };
}
function record(payload: unknown): Record<string, unknown> {
  return { schemaVersion: CURRENT_SAVE_SCHEMA_VERSION, rulesVersion: "saved-rules-pinned.3",
    buildVersion: "preceding-regression", savedAt: 1_720_656_000_000, slot: 1, name: "Archive",
    season: 2, week: 4, scoutName: "Legacy Scout", specialization: "youth", reputation: 5, state: payload };
}

describe("recognized movement storage validates before clone and repair", () => {
  it.each(["raw", "summary"] as const)("refuses corrupt %s scope before structuredClone", target => {
    const stored = target === "raw" ? validRaw() : { movementRowsV1: [1, [], []] };
    const payload = stored.movementRowsV1 as unknown[];
    payload[1] = ["duplicate", "duplicate"];
    const input = state(target, stored); const snapshot = structuredClone(input);
    const clone = vi.spyOn(globalThis, "structuredClone");
    let caught: unknown;
    try { migrateSaveState(input); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(SaveMigrationError);
    expect((caught as SaveMigrationError).code).toBe("CORRUPT_SAVE");
    expect(clone).not.toHaveBeenCalled();
    expect(input).toStrictEqual(snapshot);
  });

  it.each(["raw", "summary"] as const)("preserves unsupported future %s archives before clone", target => {
    const input = state(target, { movementRowsV2: [target === "raw" ? 0 : 1, [], []] });
    const snapshot = structuredClone(input); const clone = vi.spyOn(globalThis, "structuredClone");
    let caught: unknown;
    try { migrateSaveState(input); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(SaveMigrationError);
    expect((caught as SaveMigrationError).code).toBe("FUTURE_VERSION");
    expect(clone).not.toHaveBeenCalled();
    expect(input).toStrictEqual(snapshot);
  });

  it("rejects a recognized archive accessor without clone invoking its getter", () => {
    let getterCalls = 0;
    const stored = {};
    Object.defineProperty(stored, "movementRowsV1", { enumerable: true,
      get() { getterCalls++; return validRaw().movementRowsV1; } });
    const input = state("raw", stored); const clone = vi.spyOn(globalThis, "structuredClone");
    expect(() => migrateSaveState(input)).toThrow(SaveMigrationError);
    expect(clone).not.toHaveBeenCalled();
    expect(getterCalls).toBe(0);
    expect(Object.getOwnPropertyDescriptor(stored, "movementRowsV1")?.get).toBeDefined();
  });

  it("routes corrupt provider records through the same early raw-state refusal", () => {
    const input = record(state("raw", { movementRowsV1: [0, [], [[1, 128, 0, "id", "P", 1, 4, 2]]] }));
    const snapshot = structuredClone(input); const clone = vi.spyOn(globalThis, "structuredClone");
    let caught: unknown;
    try { migrateSaveRecord(input); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(SaveMigrationError);
    expect((caught as SaveMigrationError).code).toBe("CORRUPT_SAVE");
    expect(clone).not.toHaveBeenCalled();
    expect(input).toStrictEqual(snapshot);
  });
});
