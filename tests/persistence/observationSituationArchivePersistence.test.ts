// Destination: tests/persistence/observationSituationArchivePersistence.test.ts.
// Actual common APIs with fake IndexedDB only; no Steam/Supabase/provider/profile operations.
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GameState, Observation } from "@/engine/core/types";
import { deleteSave, enqueueSaveSync, loadGameWithRecovery, migrateSaveRecord,
  migrateSaveState, saveGameWithResult, type SaveRecord } from "@/lib/db";
import { CURRENT_SAVE_SCHEMA_VERSION, SaveMigrationError, createSaveEnvelope } from "@/lib/saveEnvelope";
import { expandObservationSituationSnapshot as expand } from "@/engine/observation/situationArchive";
import { OPTIONAL_CASES, TAG, jsonBound, observation, optionalWire, snapshot, wire }
  from "../engine/observation/observationSituationArchiveFixtures";
const SLOT = 4, NAME = "Observation archive contracts";
function career(situation: unknown = snapshot(), week = 1): GameState {
  const fixture = JSON.parse(readFileSync(new URL("../fixtures/saves/v0-save-record.json", import.meta.url), "utf8")) as { state: unknown };
  const state = migrateSaveState(fixture.state); state.currentWeek = week;
  state.observations = { archived: observation("archived", "session-a", situation),
    duplicate: observation("duplicate", "session-a", situation),
    independent: observation("independent", "session-b", situation) };
  return state;
}
function recordFor(state: GameState, schemaVersion = 9) {
  return { ...createSaveEnvelope(state, 42_000), schemaVersion, slot: SLOT, name: NAME,
    season: state.currentSeason, week: state.currentWeek, scoutName: "Archived Scout",
    specialization: state.scout.primarySpecialization, reputation: state.scout.reputation,
    rulesVersion: "pinned-existing-rules", buildVersion: "pinned-existing-build", storageRevision: 12,
    customEnvelopeMetadata: { externalId: "preserve-source-record" } };
}
async function journal(): Promise<Record<string, unknown[]>> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("TalentScoutDB"); request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  try {
    const entries = await Promise.all(["saves", "saveArchives", "saveSyncQueue"].map(async name => {
      const rows = await new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction(name, "readonly").objectStore(name).getAll();
        request.onerror = () => reject(request.error); request.onsuccess = () => resolve(request.result);
      }); return [name, rows] as const;
    })); return Object.fromEntries(entries);
  } finally { db.close(); }
}
function assertFacts(state: GameState, expected: unknown) {
  expect(Object.keys(state.observations)).toStrictEqual(["archived", "duplicate", "independent"]);
  for (const row of Object.values(state.observations)) expect(expand(row.situation)).toStrictEqual(expected);
}
beforeEach(async () => { await deleteSave(SLOT); });
afterEach(() => { vi.restoreAllMocks(); });
afterAll(async () => { await deleteSave(SLOT); });

describe.sequential("observation archive common persistence contracts", () => {
  it.each([8, 9])("loads schema%s complete hand-wire facts with additive9 and unchanged rules/metadata", schema => {
    const raw = recordFor(career(jsonBound(wire())), schema); const before = structuredClone(raw);
    const loaded = migrateSaveRecord(raw);
    expect(CURRENT_SAVE_SCHEMA_VERSION).toBe(10); expect(loaded.schemaVersion).toBe(10);
    assertFacts(loaded.state, snapshot());
    expect(loaded.rulesVersion).toBe(raw.rulesVersion); expect(loaded.buildVersion).toBe(raw.buildVersion);
    expect(loaded.savedAt).toBe(42_000); expect(loaded.storageRevision).toBe(12);
    expect((loaded as SaveRecord & Pick<typeof raw, "customEnvelopeMetadata">).customEnvelopeMetadata).toStrictEqual(raw.customEnvelopeMetadata);
    expect(raw).toStrictEqual(before);
    const second = migrateSaveRecord(jsonBound(loaded));
    expect(jsonBound(second)).toStrictEqual(jsonBound(loaded));
    assertFacts(second.state, snapshot());
  });

  it("packs ordinary owned undefined before JSON then restores ownership through raw and record loads", () => {
    const weather = OPTIONAL_CASES.find(item => item.field === "weather")!;
    const authored = { ...snapshot(), weather: undefined };
    const source = career(authored); const before = structuredClone(source);
    const canonical = migrateSaveState(source);
    expect(canonical.observations.archived.situation).toStrictEqual(optionalWire(weather, undefined));
    const rawLoaded = migrateSaveState(jsonBound(canonical)); assertFacts(rawLoaded, authored);
    const loaded = migrateSaveRecord(jsonBound(recordFor(canonical))); assertFacts(loaded.state, authored);
    for (const state of [canonical, rawLoaded, loaded.state]) for (const row of Object.values(state.observations)) {
      expect(Object.getOwnPropertyDescriptor(expand(row.situation), "weather")).toStrictEqual({
        value: undefined, enumerable: true, writable: true, configurable: true,
      });
    }
    expect(source).toStrictEqual(before);
  });

  it("writes actual local head/generation, reloads full facts and deduplicates without touching caller state", async () => {
    const weather = OPTIONAL_CASES.find(item => item.field === "weather")!;
    const source = career({ ...snapshot(), weather: undefined }); const before = structuredClone(source);
    const commit = await saveGameWithResult(SLOT, NAME, source); expect(commit.wrote).toBe(true);
    const head = (await journal()).saves.find(value => (value as SaveRecord).slot === SLOT) as SaveRecord;
    expect(head.schemaVersion).toBe(10);
    expect(head.state.observations.archived.situation).toStrictEqual(optionalWire(weather, undefined));
    const restored = await loadGameWithRecovery(SLOT); expect(restored).not.toBeNull();
    assertFacts(restored!.state, { ...snapshot(), weather: undefined });
    const beforeDedup = await journal();
    const dedup = await saveGameWithResult(SLOT, NAME, restored!.state);
    expect(dedup.wrote).toBe(false); expect(await journal()).toStrictEqual(beforeDedup);
    expect(source).toStrictEqual(before);
  });

  it.each(["tag-getter", "mask-getter", "payload-getter", "locked-length", "nested-getter", "hidden-extra", "future-tag"] as const)(
    "rejects original recognized %s before structuredClone and leaves descriptors unchanged", location => {
      const source = career(); const archive = wire(); let reads = 0;
      let target: object = archive; let key: PropertyKey = TAG;
      if (location === "tag-getter") {
        const value = archive.observationSituationV1;
        Object.defineProperty(archive, TAG, { enumerable: true, configurable: true, get() { reads++; return value; } });
      } else if (location === "mask-getter" || location === "payload-getter") {
        target = archive.observationSituationV1; key = location === "mask-getter" ? "1" : "4";
        const value = (target as unknown as unknown[])[Number(key)];
        Object.defineProperty(target, key, { enumerable: true, configurable: true, get() { reads++; return value; } });
      } else if (location === "locked-length") {
        target = archive.observationSituationV1; key = "length"; Object.defineProperty(target, key, { writable: false });
      } else if (location === "nested-getter") {
        target = archive.observationSituationV1[13] as object; key = "technical";
        Object.defineProperty(target, key, { enumerable: true, configurable: true, get() { reads++; return 1.2; } });
      } else if (location === "hidden-extra") { key = "hiddenFact"; Object.defineProperty(archive, key, { value: "retain" }); }
      else { archive.observationSituationV1[0] = 2; target = archive.observationSituationV1; key = "0"; }
      source.observations.archived.situation = archive as unknown as Observation["situation"];
      const original = Object.getOwnPropertyDescriptor(target, key);
      const clone = vi.spyOn(globalThis, "structuredClone");
      expect(() => migrateSaveState(source)).toThrow(/invalid save data|observation situation|archive/i);
      expect(clone).not.toHaveBeenCalled(); expect(reads).toBe(0);
      expect(Object.getOwnPropertyDescriptor(target, key)).toStrictEqual(original);
    },
  );

  it("gives future portable schema10 precedence over a recognized hostile tag without cloning", () => {
    const raw = recordFor(career(), 11); let reads = 0; const archive = wire();
    Object.defineProperty(archive, TAG, { enumerable: true, configurable: true, get() { reads++; throw Error("tag read"); } });
    raw.state.observations.archived.situation = archive as unknown as Observation["situation"];
    const clone = vi.spyOn(globalThis, "structuredClone");
    let caught: unknown; try { migrateSaveRecord(raw); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(SaveMigrationError); expect(caught).toHaveProperty("code", "FUTURE_VERSION");
    expect(reads).toBe(0); expect(clone).not.toHaveBeenCalled();
  });

  it.each(["future", "mask", "undefined-mask"] as const)(
    "refuses incoming %s before changing the valid head, archive or sync queue", async fault => {
      await saveGameWithResult(SLOT, "Previous", career(snapshot(), 1));
      const latest = await saveGameWithResult(SLOT, NAME, career(snapshot(), 2));
      await enqueueSaveSync(latest.record, "steam"); // Local durable queue only; never process/upload.
      const before = await journal();
      expect(before.saveArchives).toHaveLength(1); expect(before.saveSyncQueue).toHaveLength(1);
      const archive = wire(); archive.observationSituationV1[fault === "future" ? 0 : fault === "mask" ? 1 : 2]
        = fault === "future" ? 2 : fault === "mask" ? 16_777_216 : 8;
      const source = career(archive, 3); const original = structuredClone(source);
      await expect(saveGameWithResult(SLOT, "Rejected", source)).rejects.toThrow(/invalid save data|observation situation|archive/i);
      expect(await journal()).toStrictEqual(before); expect(source).toStrictEqual(original);
    },
  );
});
