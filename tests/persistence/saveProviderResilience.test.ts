import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Dexie from "dexie";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { GameState } from "@/engine/core/types";
import { deleteSave, migrateSaveRecord, migrateSaveState } from "@/lib/db";
import { createSaveEnvelope } from "@/lib/saveEnvelope";

const steamState = vi.hoisted(() => ({
  available: true,
  runtimeConfigured: true,
  failWrites: false,
  failDeletes: false,
  blobs: new Map<number, string>(),
}));

const steamMock = vi.hoisted(() => ({
  isAvailable: vi.fn(() => steamState.available),
  setCloudSave: vi.fn(async (slot: number, data: string) => {
    if (steamState.failWrites) throw new Error("steam offline");
    steamState.blobs.set(slot, data);
  }),
  getCloudSave: vi.fn(async (slot: number) => steamState.blobs.get(slot) ?? null),
  deleteCloudSave: vi.fn(async (slot: number) => {
    if (steamState.failDeletes) throw new Error("steam delete offline");
    steamState.blobs.delete(slot);
  }),
  unlockAchievement: vi.fn(),
  getPlayerName: vi.fn(() => null),
  setRichPresence: vi.fn(),
  resetAllAchievements: vi.fn(),
}));

vi.mock("@/lib/steam/steamInterface", () => ({
  getSteam: () => steamMock,
  isSteamRuntimeConfigured: () => steamState.runtimeConfigured,
}));

import { createSaveProvider } from "@/lib/saveProvider";

const goldenV0Path = fileURLToPath(
  new URL("../fixtures/saves/v0-save-record.json", import.meta.url),
);

function stateAt(week: number): GameState {
  const legacy = JSON.parse(readFileSync(goldenV0Path, "utf8")) as {
    state: Record<string, unknown>;
  };
  return migrateSaveState({ ...legacy.state, currentWeek: week });
}

function asRemoteRecord(
  slot: number,
  state: GameState,
  savedAt: number,
) {
  return migrateSaveRecord({
    ...createSaveEnvelope(state, savedAt),
    slot,
    name: "Remote branch",
    season: state.currentSeason,
    week: state.currentWeek,
    scoutName: `${state.scout.firstName} ${state.scout.lastName}`,
    specialization: state.scout.primarySpecialization,
    reputation: state.scout.reputation,
  });
}

async function overwriteHeadWithCorruptRecord(slot: number): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("TalentScoutDB");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("saves", "readwrite");
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
    transaction.objectStore("saves").put({
      slot,
      schemaVersion: 999,
      savedAt: Date.now(),
      state: null,
    });
  });
  database.close();
}

describe.sequential("save provider resilience", () => {
  beforeAll(async () => {
    await Dexie.delete("TalentScoutDB");
    steamState.available = true;
    steamState.runtimeConfigured = true;
    steamState.failWrites = false;
    steamState.failDeletes = false;
    steamState.blobs.clear();
  });

  afterAll(async () => {
    steamState.failWrites = false;
    steamState.failDeletes = false;
    await Promise.all([1, 2, 3].map((slot) => deleteSave(slot)));
  });

  it("rejects non-canonical slot names instead of overwriting slot 5", async () => {
    const provider = createSaveProvider({ includeSteam: false });
    await expect(provider.load("slot_6")).rejects.toThrow("Unknown save slot");
    await expect(provider.load("slot_0")).rejects.toThrow("Unknown save slot");
    await expect(provider.load("manual")).rejects.toThrow("Unknown save slot");
  });

  it("uses a structured state boundary and keeps legacy load JSON lazy", async () => {
    steamState.available = true;
    steamState.runtimeConfigured = true;
    steamMock.setCloudSave.mockClear();
    const provider = createSaveProvider({ includeSteam: true });
    await provider.delete("slot_3");

    const first = await provider.saveState(
      "slot_3",
      stateAt(17),
      "Structured local",
      { waitForCloud: true },
    );
    const duplicate = await provider.saveState(
      "slot_3",
      { ...stateAt(17), lastSaved: 123_456 },
      "Structured local",
      { waitForCloud: true },
    );
    const loaded = await provider.load("slot_3");

    expect(first.wrote).toBe(true);
    expect(duplicate.wrote).toBe(false);
    expect(steamMock.setCloudSave).toHaveBeenCalledTimes(1);
    expect(loaded?.state.currentWeek).toBe(17);
    expect(Object.getOwnPropertyDescriptor(loaded!, "data")?.get).toBeTypeOf(
      "function",
    );
    expect(JSON.parse(loaded!.data)).toMatchObject({ currentWeek: 17 });
  });

  it("commits locally before a failed cloud write and retries the persisted queue", async () => {
    const provider = createSaveProvider({ includeSteam: true });
    await provider.save(
      "slot_1",
      JSON.stringify(stateAt(7)),
      "Safe local",
      { waitForCloud: true },
    );
    expect((await provider.getSyncStatus()).pendingCount).toBe(0);

    steamState.failWrites = true;
    await expect(
      provider.save(
        "slot_1",
        JSON.stringify(stateAt(8)),
        "Offline local",
        { waitForCloud: true },
      ),
    ).rejects.toThrow("safe locally");
    await expect(provider.loadFromSource("slot_1", "local")).resolves.toMatchObject({
      name: "Offline local",
    });
    await expect(provider.getSyncStatus()).resolves.toMatchObject({
      pendingCount: 1,
      failedCount: 1,
      lastError: "steam offline",
    });

    steamState.failWrites = false;
    await expect(provider.retryPendingSync()).resolves.toMatchObject({
      pendingCount: 0,
      failedCount: 0,
    });
  });

  it("queues Steam writes while the packaged client is unavailable", async () => {
    const provider = createSaveProvider({ includeSteam: true });
    steamState.available = false;

    await expect(
      provider.save(
        "slot_1",
        JSON.stringify(stateAt(11)),
        "Steam client offline",
        { waitForCloud: true },
      ),
    ).rejects.toThrow("safe locally");
    await expect(provider.getSyncStatus()).resolves.toMatchObject({
      pendingCount: 1,
      failedCount: 1,
    });

    steamState.available = true;
    await expect(provider.retryPendingSync()).resolves.toMatchObject({
      pendingCount: 0,
      failedCount: 0,
    });
    expect(
      migrateSaveRecord(JSON.parse(steamState.blobs.get(1)!) as unknown)
        .state.currentWeek,
    ).toBe(11);
  });

  it("serializes same-slot mirrors so an older slow upload cannot win", async () => {
    const provider = createSaveProvider({ includeSteam: true });
    let releaseFirst: (() => void) | undefined;
    let writeCount = 0;
    steamMock.setCloudSave.mockImplementation(async (slot: number, data: string) => {
      writeCount += 1;
      if (writeCount === 1) {
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      }
      steamState.blobs.set(slot, data);
    });

    await provider.save("slot_1", JSON.stringify(stateAt(9)), "Slow old");
    await vi.waitFor(() => expect(releaseFirst).toBeTypeOf("function"));
    await provider.save("slot_1", JSON.stringify(stateAt(10)), "Newer queued");
    releaseFirst?.();

    await vi.waitFor(async () => {
      expect((await provider.getSyncStatus()).pendingCount).toBe(0);
    });
    const remote = migrateSaveRecord(JSON.parse(steamState.blobs.get(1)!) as unknown);
    expect(remote.state.currentWeek).toBe(10);

    steamMock.setCloudSave.mockImplementation(async (slot: number, data: string) => {
      if (steamState.failWrites) throw new Error("steam offline");
      steamState.blobs.set(slot, data);
    });
  });

  it("archives both possible conflict losers before overwriting Steam", async () => {
    const provider = createSaveProvider({ includeSteam: true });
    await provider.save(
      "slot_2",
      JSON.stringify(stateAt(7)),
      "Local branch",
      { waitForCloud: true },
    );
    const mirrored = migrateSaveRecord(JSON.parse(steamState.blobs.get(2)!) as unknown);
    const firstRemote = asRemoteRecord(2, stateAt(12), mirrored.savedAt + 120_000);
    steamState.blobs.set(2, JSON.stringify(firstRemote));

    const keptLocal = await provider.resolveConflict("slot_2", "local");
    expect(keptLocal.archived).toMatchObject({
      kind: "conflict-loser",
      source: "steam",
    });

    const nowLocal = migrateSaveRecord(JSON.parse(steamState.blobs.get(2)!) as unknown);
    const secondRemote = asRemoteRecord(2, stateAt(15), nowLocal.savedAt + 240_000);
    steamState.blobs.set(2, JSON.stringify(secondRemote));

    const keptCloud = await provider.resolveConflict("slot_2", "steam");
    expect(keptCloud.archived).toMatchObject({
      kind: "conflict-loser",
      source: "local",
    });
    expect(JSON.parse(keptCloud.data)).toMatchObject({ currentWeek: 15 });

    const conflictCopies = (await provider.listRecoveryCopies("slot_2")).filter(
      (copy) => copy.kind === "conflict-loser",
    );
    expect(conflictCopies.map((copy) => copy.source).sort()).toEqual([
      "local",
      "steam",
    ]);

    const restored = await provider.restoreRecoveryCopy(keptCloud.archived.id);
    expect(JSON.parse(restored.data)).toMatchObject({ currentWeek: 7 });
    await vi.waitFor(() => {
      const remote = migrateSaveRecord(
        JSON.parse(steamState.blobs.get(2)!) as unknown,
      );
      expect(remote.state.currentWeek).toBe(7);
    });
    await expect(provider.getSyncStatus()).resolves.toMatchObject({
      pendingCount: 0,
      failedCount: 0,
    });
  });

  it("keeps a failed remote deletion queued and suppresses stale cloud resurrection", async () => {
    const provider = createSaveProvider({ includeSteam: true });
    await provider.save(
      "slot_1",
      JSON.stringify(stateAt(16)),
      "Delete offline",
      { waitForCloud: true },
    );
    expect(steamState.blobs.has(1)).toBe(true);

    steamState.failDeletes = true;
    await expect(provider.delete("slot_1")).resolves.toBeUndefined();
    await expect(provider.loadFromSource("slot_1", "local")).resolves.toBeNull();
    await expect(provider.loadFromSource("slot_1", "steam")).resolves.toBeNull();
    expect((await provider.listSaves()).some((save) => save.slot === 1)).toBe(false);
    await expect(provider.getSyncStatus()).resolves.toMatchObject({
      pendingCount: 1,
      failedCount: 1,
      lastError: "steam delete offline",
    });
    expect(steamState.blobs.has(1)).toBe(true);

    steamState.failDeletes = false;
    await expect(provider.retryPendingSync()).resolves.toMatchObject({
      pendingCount: 0,
      failedCount: 0,
    });
    expect(steamState.blobs.has(1)).toBe(false);
  });

  it("lists every occupied Steam slot without exceeding transfer capacity", async () => {
    const provider = createSaveProvider({ includeSteam: true });
    steamState.blobs.clear();
    for (const slot of [0, 1, 2, 3]) {
      steamState.blobs.set(
        slot,
        JSON.stringify(asRemoteRecord(slot, stateAt(20 + slot), Date.now() + slot)),
      );
    }

    let activeReads = 0;
    let peakReads = 0;
    steamMock.getCloudSave.mockImplementation(async (slot: number) => {
      activeReads += 1;
      peakReads = Math.max(peakReads, activeReads);
      if (activeReads > 2) {
        activeReads -= 1;
        throw new Error("transfer capacity exceeded");
      }
      await new Promise((resolve) => setTimeout(resolve, 1));
      const payload = steamState.blobs.get(slot) ?? null;
      activeReads -= 1;
      return payload;
    });

    try {
      const steamEntries = (await provider.listSaves()).filter(
        (entry) => entry.source === "steam",
      );
      expect(steamEntries.map((entry) => entry.slot).sort()).toEqual([0, 1, 2, 3]);
      expect(peakReads).toBe(1);
    } finally {
      steamMock.getCloudSave.mockImplementation(
        async (slot: number) => steamState.blobs.get(slot) ?? null,
      );
    }
  });

  it("restores a verified local generation before resolving its divergent cloud branch", async () => {
    const provider = createSaveProvider({ includeSteam: true });
    await provider.save(
      "slot_3",
      JSON.stringify(stateAt(7)),
      "Verified local",
      { waitForCloud: true },
    );
    await provider.save(
      "slot_3",
      JSON.stringify(stateAt(8)),
      "Damaged head",
      { waitForCloud: true },
    );
    const mirrored = migrateSaveRecord(JSON.parse(steamState.blobs.get(3)!) as unknown);
    const remote = asRemoteRecord(3, stateAt(14), mirrored.savedAt + 120_000);
    steamState.blobs.set(3, JSON.stringify(remote));
    await overwriteHeadWithCorruptRecord(3);

    await expect(provider.checkConflict("slot_3")).resolves.toMatchObject({
      local: { preview: expect.stringContaining("Week 7") },
      cloud: { preview: expect.stringContaining("Week 14"), source: "steam" },
    });
    const resolved = await provider.resolveConflict("slot_3", "local");

    expect(JSON.parse(resolved.data)).toMatchObject({ currentWeek: 7 });
    expect(resolved.archived).toMatchObject({
      kind: "conflict-loser",
      source: "steam",
    });
    await expect(provider.loadFromSource("slot_3", "local")).resolves.toMatchObject({
      recovery: undefined,
    });
    const remoteAfter = migrateSaveRecord(
      JSON.parse(steamState.blobs.get(3)!) as unknown,
    );
    expect(remoteAfter.state.currentWeek).toBe(7);
  });
});
