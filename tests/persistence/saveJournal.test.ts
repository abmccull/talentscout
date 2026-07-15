import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Dexie from "dexie";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { GameState } from "@/engine/core/types";
import {
  commitConflictResolution,
  deleteSave,
  deleteSaveAndEnqueueRemoteDeletes,
  enqueueSaveSync,
  listSaveArchives,
  listSaves,
  listSaveSyncQueue,
  loadGameWithRecovery,
  migrateSaveRecord,
  migrateSaveState,
  processSaveSyncTask,
  restoreSaveArchive,
  saveGame,
  saveGameWithResult,
  setArchiveLogicalByteBudgetForTests,
  setPersistenceFaultInjectorForTests,
  type SaveRecord,
} from "@/lib/db";
import { createSaveEnvelope } from "@/lib/saveEnvelope";
import {
  clearSavePersistenceTelemetryForTests,
  getRecentSavePersistenceTelemetry,
} from "@/lib/saveTelemetry";

const goldenV0Path = fileURLToPath(
  new URL("../fixtures/saves/v0-save-record.json", import.meta.url),
);

function stateAt(week: number): GameState {
  const legacy = JSON.parse(readFileSync(goldenV0Path, "utf8")) as {
    state: Record<string, unknown>;
  };
  return migrateSaveState({ ...legacy.state, currentWeek: week });
}

function remoteRecord(
  slot: number,
  state: GameState,
  savedAt: number,
  sourceName: string,
): SaveRecord {
  return migrateSaveRecord({
    ...createSaveEnvelope(state, savedAt),
    slot,
    name: sourceName,
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

async function readRawStoreValue(
  storeName: string,
  key: IDBValidKey,
): Promise<unknown> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("TalentScoutDB");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const request = database
        .transaction(storeName, "readonly")
        .objectStore(storeName)
        .get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as unknown);
    });
  } finally {
    database.close();
  }
}

async function putRawStoreValue(
  storeName: string,
  value: unknown,
): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("TalentScoutDB");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();
      transaction.objectStore(storeName).put(value);
    });
  } finally {
    database.close();
  }
}

describe.sequential("transactional save journal", () => {
  beforeAll(async () => {
    await Dexie.delete("TalentScoutDB");
  });

  afterAll(async () => {
    setPersistenceFaultInjectorForTests(null);
    setArchiveLogicalByteBudgetForTests(null);
    await Promise.all([0, 1, 2, 3, 4, 5].map((slot) => deleteSave(slot)));
  });

  it("rolls back both archive and head when a write is interrupted", async () => {
    const original = await saveGame(1, "Original", stateAt(7));
    setPersistenceFaultInjectorForTests((stage) => {
      if (stage === "after-archive-before-head") {
        throw new Error("simulated power loss");
      }
    });

    await expect(saveGame(1, "Interrupted", stateAt(8))).rejects.toThrow(
      "simulated power loss",
    );
    setPersistenceFaultInjectorForTests(null);

    const loaded = await loadGameWithRecovery(1);
    expect(loaded?.record.savedAt).toBe(original.savedAt);
    expect(loaded?.state.currentWeek).toBe(7);
    expect(await listSaveArchives(1)).toHaveLength(0);
  });

  it("deduplicates timestamp-only autosaves without advancing the journal", async () => {
    await deleteSave(1);
    clearSavePersistenceTelemetryForTests();
    const initialState = stateAt(7);

    const first = await saveGameWithResult(1, "Autosave", initialState);
    const duplicate = await saveGameWithResult(1, "Autosave", {
      ...initialState,
      lastSaved: initialState.lastSaved + 60_000,
    });

    expect(first.wrote).toBe(true);
    expect(first.payloadBytes).toBeGreaterThan(0);
    expect(first.record.state.lastSaved).toBe(first.record.savedAt);
    expect(duplicate.wrote).toBe(false);
    expect(duplicate.payloadBytes).toBeNull();
    expect(duplicate.record.storageRevision).toBe(first.record.storageRevision);
    expect(await listSaveArchives(1)).toHaveLength(0);

    const advanced = await saveGameWithResult(1, "Autosave", stateAt(8));
    expect(advanced.wrote).toBe(true);
    expect(advanced.record.storageRevision).toBe(
      (first.record.storageRevision ?? 0) + 1,
    );
    expect(await listSaveArchives(1)).toHaveLength(1);

    expect(getRecentSavePersistenceTelemetry().slice(-3)).toMatchObject([
      { disposition: "written", payloadBytes: expect.any(Number) },
      { disposition: "deduplicated", payloadBytes: null, archivedBytes: 0 },
      { disposition: "written", archivedBytes: expect.any(Number) },
    ]);
  });

  it("falls back to the newest valid generation and reports the corruption", async () => {
    await saveGame(2, "First", stateAt(7));
    const verified = await saveGame(2, "Verified", stateAt(8));
    await overwriteHeadWithCorruptRecord(2);

    const loaded = await loadGameWithRecovery(2);
    expect(loaded?.record.savedAt).not.toBe(verified.savedAt);
    expect(loaded?.state.currentWeek).toBe(7);
    expect(loaded?.recovery).toMatchObject({
      slot: 2,
      reason: "newest-corrupt",
    });
    expect(loaded?.recovery?.message).toContain("damaged");
  });

  it("rolls back lazy head revision assignment when queue insertion is interrupted", async () => {
    await deleteSave(1);
    const legacy = remoteRecord(1, stateAt(6), 6_000, "Legacy head");
    const { storageRevision: _storageRevision, ...withoutRevision } = legacy;
    await putRawStoreValue("saves", withoutRevision);
    setPersistenceFaultInjectorForTests((stage) => {
      if (stage === "after-sync-head-normalization-before-intent") {
        throw new Error("simulated queue interruption");
      }
    });

    try {
      await expect(enqueueSaveSync(legacy, "steam")).rejects.toThrow(
        "simulated queue interruption",
      );
    } finally {
      setPersistenceFaultInjectorForTests(null);
    }

    expect(await readRawStoreValue("saves", 1)).not.toHaveProperty(
      "storageRevision",
    );
    expect(
      await readRawStoreValue("saveSyncQueue", "sync:steam:1"),
    ).toBeUndefined();
  });

  it("keeps an unrecoverable corrupt slot visible for an explicit delete or overwrite", async () => {
    await saveGame(0, "Only generation", stateAt(7));
    await overwriteHeadWithCorruptRecord(0);

    const entry = (await listSaves()).find((save) => save.slot === 0);
    expect(entry?.unavailable).toMatchObject({
      reason: "unrecoverable-corruption",
    });
    expect(entry?.unavailable?.message).toContain("no verified recovery");
  });

  it("bounds earlier generations to three copies per slot", async () => {
    for (let week = 7; week <= 12; week += 1) {
      await saveGame(3, `Week ${week}`, stateAt(week));
    }

    const previous = (await listSaveArchives(3)).filter(
      (copy) => copy.kind === "previous-generation",
    );
    expect(previous).toHaveLength(3);
  });

  it("preserves whichever conflict branch loses and allows explicit restore", async () => {
    const local = await saveGame(4, "Local", stateAt(7));
    const remote = remoteRecord(4, stateAt(12), local.savedAt + 120_000, "Steam");

    const cloudWins = await commitConflictResolution({
      conflictId: "cloud-wins",
      slot: 4,
      expectedLocalTimestamp: local.savedAt,
      selectedSource: "steam",
      losingSource: "local",
      selected: remote,
      losing: local,
    });
    expect(cloudWins.archive.source).toBe("local");
    expect((await loadGameWithRecovery(4))?.state.currentWeek).toBe(12);

    await restoreSaveArchive(cloudWins.archive.id);
    expect((await loadGameWithRecovery(4))?.state.currentWeek).toBe(7);

    const restoredLocal = (await loadGameWithRecovery(4))!.record;
    const newerRemote = remoteRecord(
      4,
      stateAt(15),
      restoredLocal.savedAt + 120_000,
      "Steam newer",
    );
    const localWins = await commitConflictResolution({
      conflictId: "local-wins",
      slot: 4,
      expectedLocalTimestamp: restoredLocal.savedAt,
      selectedSource: "local",
      losingSource: "steam",
      selected: restoredLocal,
      losing: newerRemote,
    });
    expect(localWins.archive.source).toBe("steam");

    await restoreSaveArchive(localWins.archive.id);
    expect((await loadGameWithRecovery(4))?.state.currentWeek).toBe(15);
  });

  it("keeps failed uploads queued and cannot clear a superseding generation", async () => {
    const first = await saveGame(5, "Queued", stateAt(7));
    const firstTask = await enqueueSaveSync(first, "steam");
    await expect(
      processSaveSyncTask(firstTask.id, async () => {
        throw new Error("offline");
      }),
    ).resolves.toBe("failed");

    let releaseUpload: (() => void) | undefined;
    const inFlight = processSaveSyncTask(
      firstTask.id,
      () => new Promise<void>((resolve) => {
        releaseUpload = resolve;
      }),
    );
    await vi.waitFor(() => expect(releaseUpload).toBeTypeOf("function"));

    const newer = await saveGame(5, "Newer queued", stateAt(8));
    await enqueueSaveSync(newer, "steam");
    releaseUpload?.();

    await expect(inFlight).resolves.toBe("superseded");
    const queue = await listSaveSyncQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      id: firstTask.id,
      status: "pending",
      attempts: 0,
      operation: "upload",
    });
    if (queue[0]?.operation !== "upload") {
      throw new Error("Expected the newer upload to remain queued");
    }
    expect(queue[0].sourceStorageRevision).toBe(newer.storageRevision);
    const rawQueueRow = await readRawStoreValue(
      "saveSyncQueue",
      firstTask.id,
    );
    expect(rawQueueRow).not.toHaveProperty("record");
    expect(rawQueueRow).not.toHaveProperty("state");
  });

  it("rebases an in-flight upload when the head advances before enqueue", async () => {
    await deleteSave(5);
    const first = await saveGame(5, "First head", stateAt(7));
    const task = await enqueueSaveSync(first, "steam");
    let releaseUpload: (() => void) | undefined;
    const inFlight = processSaveSyncTask(
      task.id,
      (current) => new Promise<void>((resolve) => {
        if (current.operation !== "upload") {
          throw new Error("Expected upload task");
        }
        expect(current.record.state.currentWeek).toBe(7);
        releaseUpload = resolve;
      }),
    );
    await vi.waitFor(() => expect(releaseUpload).toBeTypeOf("function"));

    const newer = await saveGame(5, "Advanced head", stateAt(8));
    releaseUpload?.();
    await expect(inFlight).resolves.toBe("superseded");
    expect(await listSaveSyncQueue()).toContainEqual(expect.objectContaining({
      id: task.id,
      operation: "upload",
      sourceStorageRevision: newer.storageRevision,
      sourceSavedAt: newer.savedAt,
    }));

    let replayedWeek = 0;
    await expect(processSaveSyncTask(task.id, async (current) => {
      if (current.operation !== "upload") throw new Error("Expected upload");
      replayedWeek = current.record.state.currentWeek;
    })).resolves.toBe("synced");
    expect(replayedWeek).toBe(8);
  });

  it("commits deletion with durable idempotent tombstones for every known backend", async () => {
    const record = await saveGame(5, "Delete me", stateAt(9));
    await enqueueSaveSync(record, "steam");
    await enqueueSaveSync(record, "supabase");

    const first = await deleteSaveAndEnqueueRemoteDeletes(5, ["steam"]);
    expect(await loadGameWithRecovery(5)).toBeNull();
    expect(await listSaveArchives(5)).toEqual([]);
    expect(first).toHaveLength(2);
    expect(first.every((task) => task.operation === "delete")).toBe(true);

    const mutationIds = new Map(
      first.map((task) => [task.target, task.mutationId]),
    );
    const repeated = await deleteSaveAndEnqueueRemoteDeletes(5, ["steam"]);
    expect(repeated.map((task) => [task.target, task.mutationId]).sort()).toEqual(
      [...mutationIds].sort(),
    );

    const steamDelete = repeated.find((task) => task.target === "steam")!;
    await expect(
      processSaveSyncTask(steamDelete.id, async (task) => {
        expect(task.operation).toBe("delete");
        throw new Error("offline");
      }),
    ).resolves.toBe("failed");
    expect((await listSaveSyncQueue()).find((task) => task.id === steamDelete.id))
      .toMatchObject({ operation: "delete", status: "failed", attempts: 1 });

    let deleteCalls = 0;
    await expect(
      processSaveSyncTask(steamDelete.id, async (task) => {
        expect(task.operation).toBe("delete");
        deleteCalls += 1;
      }),
    ).resolves.toBe("synced");
    await expect(
      processSaveSyncTask(steamDelete.id, async () => {
        deleteCalls += 1;
      }),
    ).resolves.toBe("missing");
    expect(deleteCalls).toBe(1);
  });

  it("does not let an in-flight upload clear a superseding delete intent", async () => {
    const record = await saveGame(5, "Delete during upload", stateAt(10));
    const upload = await enqueueSaveSync(record, "steam");
    let releaseUpload: (() => void) | undefined;
    const inFlight = processSaveSyncTask(
      upload.id,
      (task) => new Promise<void>((resolve) => {
        expect(task.operation).toBe("upload");
        releaseUpload = resolve;
      }),
    );
    await vi.waitFor(() => expect(releaseUpload).toBeTypeOf("function"));

    const [tombstone] = await deleteSaveAndEnqueueRemoteDeletes(5, ["steam"]);
    releaseUpload?.();

    await expect(inFlight).resolves.toBe("superseded");
    expect(await listSaveSyncQueue()).toContainEqual(
      expect.objectContaining({
        id: tombstone.id,
        operation: "delete",
        mutationId: tombstone.mutationId,
      }),
    );
  });

  it("applies the byte budget deterministically when timestamps tie", async () => {
    await deleteSave(2);
    setArchiveLogicalByteBudgetForTests(1);
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(50_000);
    try {
      await saveGame(2, "Week 7", stateAt(7));
      await saveGame(2, "Week 8", stateAt(8));
      await saveGame(2, "Week 9", stateAt(9));
    } finally {
      dateNow.mockRestore();
      setArchiveLogicalByteBudgetForTests(null);
    }

    const previous = (await listSaveArchives(2)).filter(
      (copy) => copy.kind === "previous-generation",
    );
    expect(previous).toHaveLength(1);
    expect(previous[0]).toMatchObject({ week: 8, logicalBytes: expect.any(Number) });
  });

  it("does not let a newer corrupt archive displace the newest verified copy", async () => {
    await deleteSave(4);
    setArchiveLogicalByteBudgetForTests(1);
    try {
      await saveGame(4, "Week 7", stateAt(7));
      await saveGame(4, "Week 8", stateAt(8));
      await putRawStoreValue("saveArchives", {
        id: "corrupt-newest-previous",
        slot: 4,
        kind: "previous-generation",
        source: "local",
        createdAt: Number.MAX_SAFE_INTEGER,
        reason: "corrupt fixture",
        record: {
          slot: 4,
          savedAt: Number.MAX_SAFE_INTEGER,
          schemaVersion: 999,
          state: null,
        },
      });
      await saveGame(4, "Week 9", stateAt(9));
    } finally {
      setArchiveLogicalByteBudgetForTests(null);
    }

    const previous = (await listSaveArchives(4)).filter(
      (copy) => copy.kind === "previous-generation",
    );
    expect(previous).toHaveLength(1);
    expect(previous[0].week).toBe(8);
    expect(previous.some((copy) => copy.id === "corrupt-newest-previous"))
      .toBe(false);
  });

  it("preserves both newest recovery kinds when protected copies exceed the budget", async () => {
    await deleteSave(3);
    setArchiveLogicalByteBudgetForTests(1);
    try {
      await saveGame(3, "Week 7", stateAt(7));
      await saveGame(3, "Week 8", stateAt(8));
      const local = await saveGame(3, "Week 9", stateAt(9));

      const firstRemote = remoteRecord(
        3,
        stateAt(12),
        local.savedAt + 120_000,
        "First remote",
      );
      await commitConflictResolution({
        conflictId: "budget-conflict-one",
        slot: 3,
        expectedLocalTimestamp: local.savedAt,
        selectedSource: "steam",
        losingSource: "local",
        selected: firstRemote,
        losing: local,
      });

      const current = (await loadGameWithRecovery(3))!.record;
      const secondRemote = remoteRecord(
        3,
        stateAt(15),
        current.savedAt + 120_000,
        "Second remote",
      );
      await commitConflictResolution({
        conflictId: "budget-conflict-two",
        slot: 3,
        expectedLocalTimestamp: current.savedAt,
        selectedSource: "local",
        losingSource: "steam",
        selected: current,
        losing: secondRemote,
      });

      const archives = await listSaveArchives(3);
      const previous = archives.filter(
        (copy) => copy.kind === "previous-generation",
      );
      const conflicts = archives.filter((copy) => copy.kind === "conflict-loser");
      expect(previous).toHaveLength(1);
      expect(previous[0].week).toBe(8);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].id).toBe("conflict:budget-conflict-two");
      expect(
        [...previous, ...conflicts].reduce(
          (total, archive) => total + (archive.logicalBytes ?? 0),
          0,
        ),
      ).toBeGreaterThan(1);

      await overwriteHeadWithCorruptRecord(3);
      const recovered = await loadGameWithRecovery(3);
      expect(recovered?.state.currentWeek).toBe(8);
      expect(recovered?.recovery?.reason).toBe("newest-corrupt");
    } finally {
      setArchiveLogicalByteBudgetForTests(null);
    }
  });
});
