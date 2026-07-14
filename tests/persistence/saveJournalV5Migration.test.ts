import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Dexie from "dexie";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { CURRENT_SAVE_SCHEMA_VERSION } from "@/lib/saveEnvelope";

const goldenV0Path = fileURLToPath(
  new URL("../fixtures/saves/v0-save-record.json", import.meta.url),
);

function legacyRecord(week: number, savedAt: number): Record<string, unknown> {
  const record = JSON.parse(readFileSync(goldenV0Path, "utf8")) as {
    state: Record<string, unknown>;
    [key: string]: unknown;
  };
  return {
    ...record,
    savedAt,
    week,
    state: { ...record.state, currentWeek: week },
  };
}

async function seedVersion4Database(): Promise<void> {
  await Dexie.delete("TalentScoutDB");
  const legacy = new Dexie("TalentScoutDB");
  legacy.version(4).stores({
    saves: "slot",
    saveArchives: "id, slot, kind, [slot+kind], createdAt, conflictId",
    saveSyncQueue: "id, slot, target, status, [target+slot], updatedAt",
    leaderboard: "++id, score, season, scoutName, submittedAt",
    mods: "countryKey",
  });

  const head = legacyRecord(9, 9_000);
  const discriminatorless = legacyRecord(7, 7_000);
  const tagged = legacyRecord(8, 8_000);
  await legacy.transaction(
    "rw",
    legacy.table("saves"),
    legacy.table("saveSyncQueue"),
    async () => {
      await legacy.table("saves").put(head);
      await legacy.table("saveSyncQueue").bulkPut([
        {
          id: "sync:steam:1",
          slot: 1,
          target: "steam",
          status: "pending",
          attempts: 0,
          createdAt: 7_000,
          updatedAt: 7_000,
          record: discriminatorless,
        },
        {
          id: "sync:supabase:1",
          slot: 1,
          target: "supabase",
          operation: "upload",
          mutationId: "tagged-version-4-upload",
          status: "failed",
          attempts: 2,
          createdAt: 8_000,
          updatedAt: 8_000,
          lastError: "offline",
          record: tagged,
        },
      ]);
    },
  );
  legacy.close();
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
      const transaction = database.transaction(storeName, "readonly");
      const request = transaction.objectStore(storeName).get(key);
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

describe.sequential("IndexedDB save journal version 5 migration", () => {
  beforeAll(async () => {
    await seedVersion4Database();
  });

  afterAll(async () => {
    const { deleteSave } = await import("@/lib/db");
    await Promise.all([1, 2].map((slot) => deleteSave(slot)));
  });

  it("lazily replaces both version-4 upload shapes with head revision pointers", async () => {
    const {
      getSaveSyncTask,
      listSaveSyncQueue,
      processSaveSyncTask,
    } = await import("@/lib/db");

    expect(CURRENT_SAVE_SCHEMA_VERSION).toBe(4);
    const steam = await getSaveSyncTask("steam", 1);
    expect(steam).toMatchObject({
      operation: "upload",
      sourceStorageRevision: 1,
      sourceSavedAt: 9_000,
    });

    const rawSteam = await readRawStoreValue("saveSyncQueue", "sync:steam:1");
    expect(rawSteam).not.toHaveProperty("record");
    const untouchedSupabase = await readRawStoreValue(
      "saveSyncQueue",
      "sync:supabase:1",
    );
    expect(untouchedSupabase).toHaveProperty("record");

    const queue = await listSaveSyncQueue();
    expect(queue).toHaveLength(2);
    expect(queue).toEqual(expect.arrayContaining([
      expect.objectContaining({
        target: "steam",
        sourceStorageRevision: 1,
        sourceSavedAt: 9_000,
      }),
      expect.objectContaining({
        target: "supabase",
        mutationId: "tagged-version-4-upload",
        sourceStorageRevision: 1,
        sourceSavedAt: 9_000,
      }),
    ]));
    const rawSupabase = await readRawStoreValue(
      "saveSyncQueue",
      "sync:supabase:1",
    );
    expect(rawSupabase).not.toHaveProperty("record");

    const uploadedWeeks: number[] = [];
    await expect(processSaveSyncTask("sync:steam:1", async (task) => {
      if (task.operation !== "upload") throw new Error("Expected upload");
      uploadedWeeks.push(task.record.state.currentWeek);
    })).resolves.toBe("synced");
    await expect(processSaveSyncTask("sync:supabase:1", async (task) => {
      if (task.operation !== "upload") throw new Error("Expected upload");
      expect(task.record.state.currentWeek).toBe(9);
      throw new Error("still offline");
    })).resolves.toBe("failed");
    const failedSupabase = await readRawStoreValue(
      "saveSyncQueue",
      "sync:supabase:1",
    );
    expect(failedSupabase).not.toHaveProperty("record");
    expect(failedSupabase).toMatchObject({
      mutationId: "tagged-version-4-upload",
      status: "failed",
      attempts: 3,
      lastError: "still offline",
    });
    await expect(processSaveSyncTask("sync:supabase:1", async (task) => {
      if (task.operation !== "upload") throw new Error("Expected upload");
      uploadedWeeks.push(task.record.state.currentWeek);
    })).resolves.toBe("synced");
    expect(uploadedWeeks).toEqual([9, 9]);

    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("TalentScoutDB");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    // Dexie maps its decimal schema versions onto integer IndexedDB versions.
    expect(database.version).toBe(50);
    database.close();
  });

  it("fails closed when an embedded legacy upload has no authoritative head", async () => {
    const { listSaveSyncQueue, processSaveSyncTask } = await import("@/lib/db");
    await putRawStoreValue("saveSyncQueue", {
      id: "sync:steam:2",
      slot: 2,
      target: "steam",
      status: "pending",
      attempts: 0,
      createdAt: 10_000,
      updatedAt: 10_000,
      record: { ...legacyRecord(10, 10_000), slot: 2 },
    });
    const uploader = vi.fn(async () => undefined);

    await expect(
      processSaveSyncTask("sync:steam:2", uploader),
    ).resolves.toBe("failed");
    expect(uploader).not.toHaveBeenCalled();
    expect(await listSaveSyncQueue()).toContainEqual(expect.objectContaining({
      id: "sync:steam:2",
      operation: "upload",
      status: "failed",
      attempts: 1,
      lastError: expect.stringContaining("no authoritative local save"),
    }));
  });

  it("rejects a queue pointer that claims a revision newer than its head", async () => {
    const { processSaveSyncTask } = await import("@/lib/db");
    await putRawStoreValue("saveSyncQueue", {
      id: "sync:steam:1",
      slot: 1,
      target: "steam",
      operation: "upload",
      mutationId: "impossible-future-revision",
      sourceStorageRevision: 999,
      sourceSavedAt: 999_000,
      status: "pending",
      attempts: 0,
      createdAt: 999_000,
      updatedAt: 999_000,
    });
    const uploader = vi.fn(async () => undefined);

    await expect(
      processSaveSyncTask("sync:steam:1", uploader),
    ).resolves.toBe("failed");
    expect(uploader).not.toHaveBeenCalled();
  });
});
