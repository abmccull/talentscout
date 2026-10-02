// Unapplied schema-8/v2 failure contracts; fake IndexedDB only, no player profile.
import "fake-indexeddb/auto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { GameState } from "@/engine/core/types";
import {
  deleteSave, enqueueSaveSync, listSaveArchives, loadGameWithRecovery, migrateSaveRecord,
  migrateSaveState, restoreSaveArchive, saveGameWithResult,
} from "@/lib/db";
import {
  CURRENT_BUILD_VERSION, CURRENT_RULES_VERSION, CURRENT_SAVE_SCHEMA_VERSION,
  SaveMigrationError, createSaveEnvelope, migrateSaveEnvelope,
} from "@/lib/saveEnvelope";
import {
  NAME, SLOT, assertCanonical, journalSnapshot, malformedRows,
  malformedState, ownUndefined, putHead, readHead, recordFor, stateWithRows,
  v1LoanWire, v1ObligationWire, v2LoanWire, v2ObligationWire, v41LoanWire, v31ObligationWire,
} from "./terminalOwnedUndefinedFixtures";

beforeEach(async () => { await deleteSave(SLOT); });
afterAll(async () => { await deleteSave(SLOT); });

describe.sequential("owned optional terminal facts at the common persistence boundary", () => {
  it("declares only additive portable 7→8 and preserves metadata and original state identity", () => {
    const state = stateWithRows("mixed");
    const legacy = recordFor(state, 7);
    const before = structuredClone(legacy);
    const upgraded = migrateSaveEnvelope(legacy);
    expect(CURRENT_SAVE_SCHEMA_VERSION).toBe(9);
    expect(upgraded).toStrictEqual({ ...legacy, schemaVersion: 9 });
    expect(upgraded.state).toBe(state);
    expect(upgraded.rulesVersion).toBe("pinned-existing-rules");
    expect(upgraded.buildVersion).toBe("pinned-existing-build");
    expect(upgraded.savedAt).toBe(42_000);
    expect(upgraded.customEnvelopeMetadata).toStrictEqual(legacy.customEnvelopeMetadata);
    expect(upgraded.playerExperience).toStrictEqual(legacy.playerExperience);
    expect(legacy).toStrictEqual(before);
    const current = createSaveEnvelope(state, 43_000, legacy.playerExperience);
    expect(current.schemaVersion).toBe(9);
    expect(current.rulesVersion).toBe(CURRENT_RULES_VERSION);
    expect(current.buildVersion).toBe(CURRENT_BUILD_VERSION);
    expect(current.state).toBe(state);
  });

  it("packs actual raw owned-undefined rows before JSON, then preserves full decoded ownership through raw and record loads", () => {
    const source = stateWithRows("ordinary");
    const before = structuredClone(source);
    ownUndefined(source.loanHistory![1] as object, "buyOptionFee");
    ownUndefined(source.clubs.host.financialObligations![1] as object, "weeklyAmount");
    const canonical = migrateSaveState(source);
    assertCanonical(canonical);
    const portable = JSON.parse(JSON.stringify(canonical)) as GameState;
    const rawLoaded = migrateSaveState(portable);
    assertCanonical(rawLoaded);
    const loaded = migrateSaveRecord(JSON.parse(JSON.stringify(recordFor(portable))));
    expect(loaded.schemaVersion).toBe(9);
    assertCanonical(loaded.state);
    expect(loaded).toHaveProperty("customEnvelopeMetadata", { providerReference: "original-external-save-id" });
    expect(loaded.rulesVersion).toBe("pinned-existing-rules");
    expect(loaded.buildVersion).toBe("pinned-existing-build");
    expect(loaded.savedAt).toBe(42_000);
    expect(loaded.storageRevision).toBe(12);
    expect(source).toStrictEqual(before);
    ownUndefined(source.loanHistory![1] as object, "buyOptionFee");
    ownUndefined(source.clubs.host.financialObligations![1] as object, "weeklyAmount");
  });

  it.each([6, 7, 8])("accepts mixed v1/v2/custom rows from schema %s without changing row order or canonical JSON", schema => {
    const raw = JSON.parse(JSON.stringify(recordFor(stateWithRows("mixed"), schema)));
    const before = JSON.stringify(raw);
    const first = migrateSaveRecord(raw);
    const second = migrateSaveRecord(JSON.parse(JSON.stringify(first)));
    expect(first.schemaVersion).toBe(9);
    assertCanonical(first.state);
    assertCanonical(second.state);
    expect(second).toStrictEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(JSON.stringify(raw)).toBe(before);
  });

  it("loads valid historical v1 facts and upgrades canonical emitted leaves without losing order", () => {
    const source = stateWithRows("v1");
    const expectedLoans = [v41LoanWire(), v41LoanWire()];
    const expectedObligations = [v31ObligationWire(), v31ObligationWire()];
    const loaded = migrateSaveRecord(JSON.parse(JSON.stringify(recordFor(source, 7))));
    expect(loaded.schemaVersion).toBe(9);
    expect(loaded.state.loanHistory).toStrictEqual(expectedLoans);
    expect(loaded.state.clubs.host.financialObligations).toStrictEqual(expectedObligations);
    expect(migrateSaveState(loaded.state)).toStrictEqual(loaded.state);
  });

  it("writes exact JSON-bound v2 to the real fake IndexedDB head and generation, then deduplicates load/save", async () => {
    const source = stateWithRows("ordinary", 14);
    const before = structuredClone(source);
    const first = await saveGameWithResult(SLOT, NAME, source);
    expect(first.wrote).toBe(true);
    const head = await readHead();
    expect(head.schemaVersion).toBe(9);
    assertCanonical(head.state);
    expect(first.payloadBytes).toBe(new TextEncoder().encode(JSON.stringify(head)).byteLength);
    assertCanonical(migrateSaveRecord(JSON.parse(JSON.stringify(head))).state);
    const next = await saveGameWithResult(SLOT, NAME, stateWithRows("mixed", 15));
    expect(next.wrote).toBe(true);
    const journal = await journalSnapshot();
    expect(journal.saveArchives).toHaveLength(1);
    const archive = journal.saveArchives[0] as { record: typeof head; verified: boolean; logicalBytes: number };
    expect(archive.verified).toBe(true);
    assertCanonical(archive.record.state);
    expect(archive.logicalBytes).toBe(new TextEncoder().encode(JSON.stringify(archive.record)).byteLength);
    expect(archive.record.storageRevision).toBe(head.storageRevision);
    const loaded = await loadGameWithRecovery(SLOT);
    expect(loaded?.recovery).toBeUndefined();
    assertCanonical(loaded!.state);
    const snapshot = await journalSnapshot();
    const duplicate = await saveGameWithResult(SLOT, NAME, JSON.parse(JSON.stringify(loaded!.state)));
    expect(duplicate.wrote).toBe(false);
    expect(duplicate.record.storageRevision).toBe(next.record.storageRevision);
    expect(await journalSnapshot()).toStrictEqual(snapshot);
    expect(source).toStrictEqual(before);
  });

  it.each(malformedRows)("refuses $label at raw/record/save boundaries before changing any valid journal row", async item => {
    await saveGameWithResult(SLOT, "Previous generation", stateWithRows("v1", 14));
    await saveGameWithResult(SLOT, "Current valid head", stateWithRows("v1", 15));
    await enqueueSaveSync(await readHead(), "steam");
    const previous = await journalSnapshot();
    expect(previous.saveArchives).toHaveLength(1);
    expect(previous.saveSyncQueue).toHaveLength(1);
    const source = malformedState(item);
    const before = structuredClone(source);
    expect(() => migrateSaveState(source)).toThrowError(expect.objectContaining<Partial<SaveMigrationError>>({ code: "CORRUPT_SAVE" }));
    expect(() => migrateSaveRecord(recordFor(source))).toThrowError(expect.objectContaining<Partial<SaveMigrationError>>({ code: "CORRUPT_SAVE" }));
    await expect(saveGameWithResult(SLOT, "Rejected archive", source)).rejects.toMatchObject({ code: "CORRUPT_SAVE" });
    expect(await journalSnapshot()).toStrictEqual(previous);
    expect(source).toStrictEqual(before);
  });

  it.each([
    "loan-optional-getter", "loan-v2-optional-getter", "loan-v2-mask-getter",
    "obligation-archive-getter", "obligation-v2-archive-getter", "obligation-v2-mask-getter",
    "loan-hidden-extra", "loan-symbol-extra", "obligation-symbol-extra",
  ] as const)(
    "refuses recognized %s before clone can invoke or strip descriptors and before journal writes", async location => {
      await saveGameWithResult(SLOT, "Previous valid generation", stateWithRows("v1", 14));
      await saveGameWithResult(SLOT, "Current valid head", stateWithRows("v1", 15));
      await enqueueSaveSync(await readHead(), "steam");
      const previous = await journalSnapshot();
      expect(previous.saveArchives).toHaveLength(1);
      expect(previous.saveSyncQueue).toHaveLength(1);
      const source = stateWithRows("v1");
      let reads = 0;
      let target: object;
      let key: string | symbol;
      if (location === "loan-optional-getter" || location === "loan-v2-optional-getter" || location === "loan-v2-mask-getter") {
        const row = location === "loan-optional-getter" ? v1LoanWire() : v2LoanWire();
        key = location === "loan-optional-getter" || location === "loan-v2-mask-getter" ? "13" : "14";
        const originalPayload = row[Number(key)];
        Object.defineProperty(row, key, { enumerable: true, configurable: true,
          get() { reads += 1; return originalPayload; } });
        source.loanHistory = [row] as unknown as GameState["loanHistory"];
        target = row;
      } else if (location === "obligation-archive-getter" || location === "obligation-v2-archive-getter") {
        const row = location === "obligation-archive-getter" ? v1ObligationWire() : v2ObligationWire();
        key = location === "obligation-archive-getter" ? "obligationArchiveV1" : "obligationArchiveV2";
        const originalPayload = row[key];
        Object.defineProperty(row, key, { enumerable: true, configurable: true,
          get() { reads += 1; return originalPayload; } });
        source.clubs.host.financialObligations = [row] as unknown as GameState["clubs"][string]["financialObligations"];
        target = row;
      } else if (location === "obligation-v2-mask-getter") {
        const row = v2ObligationWire();
        const tuple = row.obligationArchiveV2 as unknown[];
        const originalMask = tuple[1];
        Object.defineProperty(tuple, "1", { enumerable: true, configurable: true,
          get() { reads += 1; return originalMask; } });
        source.clubs.host.financialObligations = [row] as unknown as GameState["clubs"][string]["financialObligations"];
        target = tuple; key = "1";
      } else if (location === "loan-symbol-extra" || location === "obligation-symbol-extra") {
        key = Symbol("do-not-drop-financial-fact");
        const row = location === "loan-symbol-extra" ? v1LoanWire() : v2ObligationWire();
        Object.defineProperty(row, key, { value: "do-not-drop", enumerable: true, configurable: true });
        if (location === "loan-symbol-extra") source.loanHistory = [row] as unknown as GameState["loanHistory"];
        else source.clubs.host.financialObligations = [row] as unknown as GameState["clubs"][string]["financialObligations"];
        target = row;
      } else {
        const row = v1LoanWire();
        Object.defineProperty(row, "hiddenAuthoredValue", { value: "do-not-drop", enumerable: false, configurable: true });
        source.loanHistory = [row] as unknown as GameState["loanHistory"];
        target = row; key = "hiddenAuthoredValue";
      }
      const original = Object.getOwnPropertyDescriptor(target, key);
      expect(() => migrateSaveState(source)).toThrowError(expect.objectContaining<Partial<SaveMigrationError>>({ code: "CORRUPT_SAVE" }));
      await expect(saveGameWithResult(SLOT, "Rejected hostile archive", source)).rejects.toMatchObject({ code: "CORRUPT_SAVE" });
      expect(reads).toBe(0);
      expect(Object.getOwnPropertyDescriptor(target, key)).toStrictEqual(original);
      expect(await journalSnapshot()).toStrictEqual(previous);
    },
  );

  it("recovers a v2 previous generation from a malformed newest archive without rewriting the failed head", async () => {
    await saveGameWithResult(SLOT, NAME, stateWithRows("mixed", 14));
    await saveGameWithResult(SLOT, "Newest head", stateWithRows("v1", 15));
    await enqueueSaveSync(await readHead(), "steam");
    const previous = (await listSaveArchives(SLOT))[0];
    expect(previous).toBeDefined();
    const invalid = malformedState(malformedRows.find(row => row.label === "loan-trailing-column")!);
    await putHead({ ...await readHead(), state: invalid });
    const before = await journalSnapshot();
    const recovered = await loadGameWithRecovery(SLOT);
    expect(recovered?.recovery?.archiveId).toBe(previous.id);
    expect(recovered?.recovery?.reason).toBe("newest-corrupt");
    expect(recovered?.state.currentWeek).toBe(14);
    assertCanonical(recovered!.state);
    expect(await journalSnapshot()).toStrictEqual(before);
    const restored = await restoreSaveArchive(previous.id);
    expect(restored.schemaVersion).toBe(9);
    assertCanonical(restored.state);
    assertCanonical((await readHead()).state);
    // The invalid head is not copied into the verified recovery archive.
    expect((await journalSnapshot()).saveArchives).toStrictEqual(before.saveArchives);
    expect((await journalSnapshot()).saveSyncQueue).toStrictEqual(before.saveSyncQueue);
  });

  it("refuses portable schema 10 before touching opaque state and preserves a future head during load/save/restore", async () => {
    let opaqueReads = 0;
    const future = { ...recordFor(stateWithRows("v1")), schemaVersion: 10 };
    Object.defineProperty(future, "state", { enumerable: true, configurable: true,
      get() { opaqueReads += 1; throw new Error("opaque future state must not be inspected"); } });
    expect(() => migrateSaveEnvelope(future)).toThrowError(expect.objectContaining<Partial<SaveMigrationError>>({ code: "FUTURE_VERSION" }));
    expect(() => migrateSaveRecord(future)).toThrowError(expect.objectContaining<Partial<SaveMigrationError>>({ code: "FUTURE_VERSION" }));
    expect(opaqueReads).toBe(0);
    await saveGameWithResult(SLOT, "Previous supported generation", stateWithRows("mixed", 14));
    await saveGameWithResult(SLOT, "Supported head", stateWithRows("v1", 15));
    await enqueueSaveSync(await readHead(), "steam");
    const archive = (await listSaveArchives(SLOT))[0];
    await putHead({ ...await readHead(), schemaVersion: 10,
      state: { opaqueFutureFacts: [null, { preserveExternalId: "future-earned-proof" }] } });
    const before = await journalSnapshot();
    await expect(loadGameWithRecovery(SLOT)).rejects.toMatchObject({ code: "FUTURE_VERSION" });
    await expect(saveGameWithResult(SLOT, NAME, stateWithRows("v1", 16))).rejects.toMatchObject({ code: "FUTURE_VERSION" });
    await expect(restoreSaveArchive(archive.id)).rejects.toMatchObject({ code: "FUTURE_VERSION" });
    expect(await journalSnapshot()).toStrictEqual(before);
  });
});
