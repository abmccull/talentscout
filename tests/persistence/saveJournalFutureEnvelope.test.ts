import "fake-indexeddb/auto";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import Dexie from "dexie";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import type { GameState } from "@/engine/core/types";
import {
  deleteSave,
  listSaveArchives,
  listSaves,
  loadGameWithRecovery,
  migrateSaveState,
  restoreSaveArchive,
  saveGame,
  saveGameWithResult,
  setArchiveLogicalByteBudgetForTests,
} from "@/lib/db";
import { CURRENT_SAVE_SCHEMA_VERSION, SaveMigrationError } from "@/lib/saveEnvelope";

// Uses in-memory fake IndexedDB; no real player database is involved.
const goldenPath = fileURLToPath(new URL("../fixtures/saves/v0-save-record.json", import.meta.url));

function stateAt(week: number): GameState {
  const raw = JSON.parse(readFileSync(goldenPath, "utf8")) as { state: Record<string, unknown> };
  return migrateSaveState({ ...raw.state, currentWeek: week });
}

async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("TalentScoutDB");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function readRaw(store: string, key: IDBValidKey): Promise<unknown> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(store, "readonly").objectStore(store).get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  } finally {
    database.close();
  }
}

async function putRaw(store: string, value: unknown): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(store, "readwrite");
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();
      transaction.objectStore(store).put(value);
    });
  } finally {
    database.close();
  }
}

async function seedFutureHead() {
  await saveGame(0, "Older recoverable generation", stateAt(7));
  const supportedHead = await saveGame(0, "Current supported generation", stateAt(8));
  const archives = await listSaveArchives(0);
  const archiveId = archives[0]!.id;
  const archiveBytes = JSON.stringify(await readRaw("saveArchives", archiveId));
  const futureHead = {
    ...supportedHead,
    schemaVersion: CURRENT_SAVE_SCHEMA_VERSION + 1,
    buildVersion: "newer-reader-required",
    state: {
      ...supportedHead.state,
      futureFormatPayload: { earnedHistoryIds: ["future-history-19"], preserveOpaqueBytes: true },
    },
  };
  await putRaw("saves", futureHead);
  return { futureBytes: JSON.stringify(futureHead), archiveId, archiveBytes };
}

async function seedFutureArchive() {
  await saveGame(0, "Older recoverable generation", stateAt(7));
  const supportedHead = await saveGame(0, "Supported head", stateAt(8));
  const futureArchive = {
    id: "future-unverified-previous-generation",
    slot: 0,
    kind: "previous-generation",
    source: "local",
    createdAt: supportedHead.savedAt + 1_000,
    reason: "Newer-format recovery generation",
    verified: false,
    record: {
      ...supportedHead,
      schemaVersion: CURRENT_SAVE_SCHEMA_VERSION + 1,
      savedAt: supportedHead.savedAt + 1_000,
      week: 12,
      state: { ...supportedHead.state, currentWeek: 12, futureFormatPayload: { preserveOpaqueBytes: true } },
    },
  };
  await putRaw("saveArchives", futureArchive);
  return { supportedHead, futureArchiveId: futureArchive.id, futureArchiveBytes: JSON.stringify(futureArchive) };
}

describe.sequential("future portable envelopes are preserved by the local journal", () => {
  beforeEach(async () => {
    await deleteSave(0);
  });

  afterAll(async () => {
    await deleteSave(0);
    // No real browser profile or user database is involved: fake-indexeddb owns this namespace.
    await Dexie.delete("TalentScoutDB");
  });

  it("rejects a future autosave head instead of loading a supported historical fallback", async () => {
    const { futureBytes, archiveId, archiveBytes } = await seedFutureHead();

    await expect(loadGameWithRecovery(0)).rejects.toThrowError(
      expect.objectContaining<Partial<SaveMigrationError>>({ code: "FUTURE_VERSION" }),
    );
    expect(JSON.stringify(await readRaw("saves", 0))).toBe(futureBytes);
    expect(JSON.stringify(await readRaw("saveArchives", archiveId))).toBe(archiveBytes);
  });

  it("keeps the future slot visible as unavailable with a newer-build notice, not a damaged recovery copy", async () => {
    const { futureBytes, archiveId, archiveBytes } = await seedFutureHead();
    const entry = (await listSaves()).find((save) => save.slot === 0);

    expect(entry).toBeDefined();
    expect(entry?.schemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION + 1);
    expect(entry?.name).toBe("Current supported generation");
    expect(entry?.week).toBe(8);
    expect(entry?.recovery).toBeUndefined();
    expect(entry?.unavailable?.message).toMatch(/newer|update|upgrade/i);
    expect(entry?.unavailable?.message).not.toMatch(/damaged|corrupt/i);
    expect(JSON.stringify(await readRaw("saves", 0))).toBe(futureBytes);
    expect(JSON.stringify(await readRaw("saveArchives", archiveId))).toBe(archiveBytes);
  });

  it("refuses an automatic supported-format save over a future head without modifying head or archive bytes", async () => {
    const { futureBytes, archiveId, archiveBytes } = await seedFutureHead();

    await expect(saveGameWithResult(0, "Automatic old-format checkpoint", stateAt(9))).rejects.toThrowError(
      expect.objectContaining<Partial<SaveMigrationError>>({ code: "FUTURE_VERSION" }),
    );
    expect(JSON.stringify(await readRaw("saves", 0))).toBe(futureBytes);
    expect(JSON.stringify(await readRaw("saveArchives", archiveId))).toBe(archiveBytes);
    expect((await listSaveArchives(0)).map((archive) => archive.id)).toEqual([archiveId]);
  });

  it("refuses recovery restore over a future head when no explicit destructive version override exists", async () => {
    const { futureBytes, archiveId, archiveBytes } = await seedFutureHead();

    await expect(restoreSaveArchive(archiveId)).rejects.toThrowError(
      expect.objectContaining<Partial<SaveMigrationError>>({ code: "FUTURE_VERSION" }),
    );
    expect(JSON.stringify(await readRaw("saves", 0))).toBe(futureBytes);
    expect(JSON.stringify(await readRaw("saveArchives", archiveId))).toBe(archiveBytes);
  });

  it("rolls back an ordinary save instead of deleting an unverified future archive during pruning", async () => {
    const { supportedHead, futureArchiveId, futureArchiveBytes } = await seedFutureArchive();
    const headBytes = JSON.stringify(supportedHead);

    await expect(saveGameWithResult(0, "Ordinary supported checkpoint", stateAt(9))).rejects.toThrowError(
      expect.objectContaining<Partial<SaveMigrationError>>({ code: "FUTURE_VERSION" }),
    );
    expect(JSON.stringify(await readRaw("saves", 0))).toBe(headBytes);
    expect(JSON.stringify(await readRaw("saveArchives", futureArchiveId))).toBe(futureArchiveBytes);
  });

  it("rejects a future recovery archive instead of skipping it to select an older supported generation", async () => {
    const { supportedHead, futureArchiveId, futureArchiveBytes } = await seedFutureArchive();
    const corruptSupportedHead = { ...supportedHead, state: null };
    await putRaw("saves", corruptSupportedHead);
    const headBytes = JSON.stringify(corruptSupportedHead);

    await expect(loadGameWithRecovery(0)).rejects.toThrowError(
      expect.objectContaining<Partial<SaveMigrationError>>({ code: "FUTURE_VERSION" }),
    );
    expect(JSON.stringify(await readRaw("saves", 0))).toBe(headBytes);
    expect(JSON.stringify(await readRaw("saveArchives", futureArchiveId))).toBe(futureArchiveBytes);
  });
  it("rolls back budget pruning instead of deleting a verified future archive", async () => {
    const { supportedHead, futureArchiveId, futureArchiveBytes } = await seedFutureArchive();
    const raw = JSON.parse(futureArchiveBytes) as { record: Record<string, unknown>; [key: string]: unknown };
    const futureRecord = { ...raw.record, savedAt: 1 };
    const verifiedFuture = {
      ...raw, verified: true, createdAt: 1, record: futureRecord,
      logicalBytes: Buffer.byteLength(JSON.stringify(futureRecord), "utf8"), recordRevision: 0,
    };
    await putRaw("saveArchives", verifiedFuture);
    const verifiedBytes = JSON.stringify(verifiedFuture);
    const headBytes = JSON.stringify(supportedHead);
    setArchiveLogicalByteBudgetForTests(1);
    try {
      await expect(saveGameWithResult(0, "Supported checkpoint", stateAt(9))).rejects.toThrowError(
        expect.objectContaining<Partial<SaveMigrationError>>({ code: "FUTURE_VERSION" }),
      );
      expect(JSON.stringify(await readRaw("saves", 0))).toBe(headBytes);
      expect(JSON.stringify(await readRaw("saveArchives", futureArchiveId))).toBe(verifiedBytes);
    } finally {
      setArchiveLogicalByteBudgetForTests(null);
    }
  });

});
