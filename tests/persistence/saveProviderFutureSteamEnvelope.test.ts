import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { GameState } from "@/engine/core/types";
import { deleteSave, migrateSaveRecord, migrateSaveState, saveGame } from "@/lib/db";
import { CURRENT_SAVE_SCHEMA_VERSION, SaveMigrationError, createSaveEnvelope } from "@/lib/saveEnvelope";

// Steam and Supabase are fully mocked; no provider or player profile is used.
const steamState = vi.hoisted(() => ({
  available: true,
  blobs: new Map<number, string>(),
}));
const steamMock = vi.hoisted(() => ({
  isAvailable: vi.fn(() => steamState.available),
  getCloudSave: vi.fn(async (slot: number) => steamState.blobs.get(slot) ?? null),
  setCloudSave: vi.fn(async (slot: number, data: string) => { steamState.blobs.set(slot, data); }),
  deleteCloudSave: vi.fn(async (slot: number) => { steamState.blobs.delete(slot); }),
  unlockAchievement: vi.fn(),
  getPlayerName: vi.fn(() => null),
  setRichPresence: vi.fn(),
  resetAllAchievements: vi.fn(),
}));

vi.mock("@/lib/steam/steamInterface", () => ({
  getSteam: () => steamMock,
  isSteamRuntimeConfigured: () => true,
}));
vi.mock("@/lib/supabase", () => ({ supabase: null }));

import { createSaveProvider } from "@/lib/saveProvider";

const goldenPath = fileURLToPath(new URL("../fixtures/saves/v0-save-record.json", import.meta.url));

function stateAt(week: number): GameState {
  const raw = JSON.parse(readFileSync(goldenPath, "utf8")) as { state: Record<string, unknown> };
  return migrateSaveState({ ...raw.state, currentWeek: week });
}

function futureRemoteBytes(): string {
  const state = stateAt(12);
  const supported = migrateSaveRecord({
    ...createSaveEnvelope(state, 9_000_000),
    slot: 0,
    name: "Future cloud career",
    season: state.currentSeason,
    week: state.currentWeek,
    scoutName: `${state.scout.firstName} ${state.scout.lastName}`,
    specialization: state.scout.primarySpecialization,
    reputation: state.scout.reputation,
  });
  return JSON.stringify({
    ...supported,
    schemaVersion: CURRENT_SAVE_SCHEMA_VERSION + 1,
    buildVersion: "newer-reader-required",
    futureMetadata: { earnedHistoryIds: ["future-history-19"], preserveOpaqueBytes: true },
  });
}

describe.sequential("future Steam envelopes are not absence or overwrite targets", () => {
  beforeEach(async () => {
    await deleteSave(0);
    steamState.available = true;
    steamState.blobs.clear();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await deleteSave(0);
    steamState.blobs.clear();
  });

  it("rejects load rather than silently selecting a supported local branch when Steam has a future envelope", async () => {
    await saveGame(0, "Supported local branch", stateAt(7));
    const originalRemote = futureRemoteBytes();
    steamState.blobs.set(0, originalRemote);
    const provider = createSaveProvider({ includeSteam: true });

    await expect(provider.load("autosave")).rejects.toThrowError(
      expect.objectContaining<Partial<SaveMigrationError>>({ code: "FUTURE_VERSION" }),
    );
    expect(steamState.blobs.get(0)).toBe(originalRemote);
    expect(steamMock.setCloudSave).not.toHaveBeenCalled();
  });

  it("keeps future Steam metadata visible and unavailable with a newer-build notice", async () => {
    const originalRemote = futureRemoteBytes();
    steamState.blobs.set(0, originalRemote);
    const provider = createSaveProvider({ includeSteam: true });
    const entry = (await provider.listSaves()).find((save) => save.source === "steam" && save.slot === 0);

    expect(entry).toBeDefined();
    expect(entry?.name).toBe("Future cloud career");
    expect(entry?.savedAt).toBe(9_000_000);
    expect(entry?.recovery).toBeUndefined();
    expect(entry?.unavailable?.message).toMatch(/newer|update|upgrade/i);
    expect(entry?.unavailable?.message).not.toMatch(/damaged|corrupt/i);
    expect(steamState.blobs.get(0)).toBe(originalRemote);
    expect(steamMock.setCloudSave).not.toHaveBeenCalled();
  });

  it("keeps the supported local write but refuses to overwrite future cloud bytes and retains the failed intent", async () => {
    const originalRemote = futureRemoteBytes();
    steamState.blobs.set(0, originalRemote);
    const provider = createSaveProvider({ includeSteam: true });

    await expect(provider.saveState(
      "autosave", stateAt(8), "Automatic local checkpoint", { waitForCloud: true },
    )).rejects.toThrow();
    expect(steamState.blobs.get(0)).toBe(originalRemote);
    expect(steamMock.setCloudSave).not.toHaveBeenCalled();
    await expect(provider.loadFromSource("autosave", "local")).resolves.toMatchObject({
      state: { currentWeek: 8 },
    });
    await expect(provider.getSyncStatus()).resolves.toMatchObject({
      pendingCount: 1,
      failedCount: 1,
      lastError: expect.stringMatching(/future|newer|schema/i),
    });
  });

  it("blocks an older queued upload retry when a future remote envelope appears before reconnect", async () => {
    steamState.available = false;
    const provider = createSaveProvider({ includeSteam: true });
    await expect(provider.saveState(
      "autosave", stateAt(9), "Offline supported checkpoint", { waitForCloud: true },
    )).rejects.toThrow();
    const originalRemote = futureRemoteBytes();
    steamState.blobs.set(0, originalRemote);
    steamState.available = true;
    steamMock.setCloudSave.mockClear();

    await expect(provider.retryPendingSync()).resolves.toMatchObject({
      pendingCount: 1,
      failedCount: 1,
      lastError: expect.stringMatching(/future|newer|schema/i),
    });
    expect(steamState.blobs.get(0)).toBe(originalRemote);
    expect(steamMock.setCloudSave).not.toHaveBeenCalled();
  });
  it("binds an unavailable future Steam warning to the enumerated cloud slot rather than stale payload metadata", async () => {
    const stale = JSON.parse(futureRemoteBytes()) as Record<string, unknown>;
    stale.slot = 5;
    const originalRemote = JSON.stringify(stale);
    steamState.blobs.set(0, originalRemote);
    const provider = createSaveProvider({ includeSteam: true });

    const entries = await provider.listSaves();

    expect(entries.find((save) => save.source === "steam" && save.slotName === "autosave")).toMatchObject({
      slotName: "autosave", slot: 0, source: "steam", name: "Future cloud career",
      unavailable: { message: expect.stringMatching(/newer|update|upgrade/i) },
    });
    expect(entries.some((save) => save.source === "steam" && save.slot === 5)).toBe(false);
    expect(steamState.blobs.get(0)).toBe(originalRemote);
    expect(steamMock.setCloudSave).not.toHaveBeenCalled();
  });

});
