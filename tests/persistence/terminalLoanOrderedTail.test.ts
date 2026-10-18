// Frozen before product changes: hand-authored wires, existing public save APIs.
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as archives from "@/engine/finance/terminalRecordArchive";
import type { GameState, StoredLoanDeal } from "@/engine/core/types";
import { deleteSave, loadGameWithRecovery, migrateSaveRecord, migrateSaveState, saveGameWithResult, type SaveRecord } from "@/lib/db";
import { CURRENT_SAVE_SCHEMA_VERSION, SaveMigrationError, createSaveEnvelope, migrateSaveEnvelope } from "@/lib/saveEnvelope";

const FIELDS = ["buyOptionFee", "outcome", "agreedPlayingTime", "startCurrentAbility", "monitoringWeeks", "scoutId", "performanceRecord"] as const;
const PLAYER = "player___constructor_雪_long_exact_identity";
const asLoan = (row: unknown) => row as StoredLoanDeal;
const portable = <T>(row: T): T => JSON.parse(JSON.stringify(row)) as T;
const bytes = (row: unknown) => new TextEncoder().encode(JSON.stringify(row)).byteLength;
function old(): unknown[] {
  return [42, ["opening-loan:25:1:club:", ""], PLAYER, "parent", "host", 0, 25, 12, 25, 0, -10, false, 0, 1,
    { agreedPlayingTime: 1, startCurrentAbility: 0, performanceRecord: [0, 1, 2, 3.125, -4, 5, 6],
      monitoringWeeks: ["25:1", "25:1", "25:2"], scoutId: "", outcome: 0 }];
}
function wire(): unknown[] {
  return [44, ["opening-loan:25:1:club:", ""], PLAYER, "parent", "host", 0, 25, 12, 25, 0, -10, false, 0, 1,
    "236451", 1, 0, [0, 1, 2, 3.125, -4, 5, 6], ["25:1", "25:1", "25:2"], "", 0];
}
function store(row: unknown): StoredLoanDeal {
  expect(archives).toHaveProperty("compactLoanDealForStorage");
  return (archives as unknown as { compactLoanDealForStorage(row: StoredLoanDeal): StoredLoanDeal }).compactLoanDealForStorage(asLoan(row));
}
function orderedFacts(row: unknown) {
  const full = archives.expandLoanDeal(asLoan(row));
  return { entries: Object.entries(full), descriptors: Object.getOwnPropertyDescriptors(full),
    performance: full.performanceRecord && Object.getOwnPropertyDescriptors(full.performanceRecord) };
}

describe("ordered terminal loan wire, before product implementation", () => {
  it("reads an independently authored wire with exact order, ownership, duplicates, IDs and values", () => {
    const input = wire(), before = structuredClone(input);
    expect(orderedFacts(portable(input))).toStrictEqual(orderedFacts(old()));
    expect(input).toStrictEqual(before);
    expect(archives.expandLoanDeal(asLoan(input)).id).toBe(`opening-loan:25:1:club:${PLAYER}`);
  });
  it("upgrades accumulated legacy rows only when smaller, without changing the public identity contract", () => {
    const input = old(), before = structuredClone(input), packed = store(input);
    expect(packed).toStrictEqual(wire()); expect(bytes(packed)).toBeLessThan(bytes(input));
    expect(orderedFacts(packed)).toStrictEqual(orderedFacts(input)); expect(input).toStrictEqual(before);
    expect(store(packed)).toBe(packed); expect(archives.compactLoanDeal(asLoan(input))).toBe(input);
    expect(archives.compactLoanDeal(packed)).toBe(packed);
    const ordinary = archives.expandLoanDeal(asLoan(input));
    expect(orderedFacts(store(ordinary))).toStrictEqual(orderedFacts(archives.compactLoanDeal(ordinary)));
  });
  it.each(FIELDS.map((field, index) => ({ field, bit: 2 ** index })))("preserves only owned undefined $field", ({ field, bit }) => {
    const row = wire().slice(0, 15); row[13] = bit; row[14] = "";
    const full = archives.expandLoanDeal(asLoan(portable(row)));
    expect(Object.getOwnPropertyDescriptor(full, field)).toStrictEqual({ value: undefined, writable: true, enumerable: true, configurable: true });
    for (const absent of FIELDS.filter(key => key !== field)) expect(Object.hasOwn(full, absent)).toBe(false);
  });
  it.each(["15", "51", "2361", "1632"])("retains defined-key order %s through JSON and storage", order => {
    const values: Record<string, unknown> = { "1": 0, "2": 1, "3": 0, "5": "", "6": [0, 1, 2, 3.125, -4, 5, 6] };
    const input = old(); input[13] = 0;
    input[14] = Object.fromEntries([...order].map(index => [FIELDS[Number(index)], values[index]]));
    expect(orderedFacts(portable(store(input)))).toStrictEqual(orderedFacts(input));
  });
  it("retains legacy null-prototype and signed-zero fallback by identity", () => {
    const legacy = [1, `opening-loan:25:1:club:${PLAYER}`, PLAYER, "parent", "host", 0, 25, 12, 25, 0, -10, false, "completed",
      Object.assign(Object.create(null), { outcome: "successful" })];
    expect(store(legacy)).toBe(legacy); expect(archives.compactLoanDeal(asLoan(legacy))).toBe(legacy);
    const negative = old(); negative[9] = -0; expect(store(negative)).toBe(negative);
    expect(Object.is(archives.expandLoanDeal(asLoan(negative)).loanFee, -0)).toBe(true);
    const tiny = [41, "", "", "", "", 0, 0, 0, 0, 0, 0, false, 0, {}]; expect(store(tiny)).toBe(tiny);
  });
  it("retains ordinary authored extensions, descriptors and nil identity", () => {
    const full = archives.expandLoanDeal(asLoan(old()));
    const custom = { ...full, externalAudit: { providerId: "keep" } }; expect(store(custom)).toBe(custom);
    const active = { ...full, status: "active" as const }; expect(store(active)).toBe(active);
    const locked = { ...full }; Object.freeze(locked); expect(store(locked)).toBe(locked);
    const nullProto = Object.assign(Object.create(null), full); expect(store(nullProto)).toBe(nullProto);
    expect(store(null)).toBeNull(); expect(store(undefined)).toBeUndefined();
  });
  it.each(["00", "7", "-1", "0.5", "2364510", "23645", 236451, null, undefined])("refuses invalid optional order %s", order => {
    const row = wire(); row[14] = order;
    expect(() => archives.expandLoanDeal(asLoan(row))).toThrow(archives.InvalidTerminalRecordArchiveError);
    expect(() => store(row)).toThrow(archives.InvalidTerminalRecordArchiveError);
  });
  it.each([-1, -0, 128, 0.5, "1", null, undefined, 3])("refuses invalid or conflicting undefined mask %s", mask => {
    const row = wire(); row[13] = mask;
    expect(() => archives.expandLoanDeal(asLoan(row))).toThrow(archives.InvalidTerminalRecordArchiveError);
  });
  it("refuses every malformed descriptor before evaluating getters and retains version43 refusal", () => {
    let calls = 0;
    for (const index of [0, 13, 14, 15]) {
      const row = wire(); Object.defineProperty(row, index, { get() { calls++; return 0; }, enumerable: true, configurable: true });
      expect(() => archives.expandLoanDeal(asLoan(row))).toThrow(archives.InvalidTerminalRecordArchiveError);
    }
    const sparse = wire(); delete sparse[17]; const extra = wire(); Object.assign(extra, { extra: "keep" });
    const frozen = wire(); Object.defineProperty(frozen, "length", { writable: false });
    const badPerformance = wire(); (badPerformance[17] as unknown[]).push(99);
    const future = wire(); future[0] = 43;
    const undefinedValue = wire(); undefinedValue[18] = undefined;
    for (const row of [sparse, extra, frozen, badPerformance, future, undefinedValue, [...wire(), 99]]) {
      expect(() => store(row)).toThrow(archives.InvalidTerminalRecordArchiveError);
    }
    expect(calls).toBe(0);
  });
});

function career(): GameState {
  const fixture = JSON.parse(readFileSync(new URL("../fixtures/saves/v0-save-record.json", import.meta.url), "utf8")) as { state: unknown };
  const state = migrateSaveState(fixture.state); state.loanHistory = [asLoan(old()), asLoan(old())]; return state;
}
async function readHead(): Promise<SaveRecord> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("TalentScoutDB"); request.onerror = () => reject(request.error); request.onsuccess = () => resolve(request.result);
  });
  try { return await new Promise<SaveRecord>((resolve, reject) => {
    const request = database.transaction("saves", "readonly").objectStore("saves").get(5);
    request.onerror = () => reject(request.error); request.onsuccess = () => resolve(request.result as SaveRecord);
  }); } finally { database.close(); }
}
beforeEach(async () => { await deleteSave(5); }); afterAll(async () => { await deleteSave(5); });
describe.sequential("ordered terminal loans through public persistence", () => {
  it("migrates schema9 metadata additively without changing any historical facts", () => {
    const source = { ...createSaveEnvelope(career(), 42000), schemaVersion: 9, rulesVersion: "pinned", buildVersion: "original", customAudit: "external" };
    const before = structuredClone(source), upgraded = migrateSaveEnvelope(source);
    expect(CURRENT_SAVE_SCHEMA_VERSION).toBe(10); expect(upgraded).toStrictEqual({ ...source, schemaVersion: 10 });
    expect(source).toStrictEqual(before); expect(migrateSaveEnvelope(upgraded)).toStrictEqual(upgraded);
    expect(() => migrateSaveEnvelope({ ...source, schemaVersion: 11 })).toThrowError(expect.objectContaining({ code: "FUTURE_VERSION" }));
  });
  it("saves, reads back, JSON-loads and recovers complete exact ordered facts and duplicate rows", async () => {
    const source = career(), before = structuredClone(source), expected = source.loanHistory!.map(orderedFacts);
    const commit = await saveGameWithResult(5, "Ordered optional tail", source); expect(commit.wrote).toBe(true);
    const head = await readHead(); expect(head.schemaVersion).toBe(10); expect(head.state.loanHistory).toStrictEqual([wire(), wire()]);
    expect(head.state.loanHistory!.map(orderedFacts)).toStrictEqual(expected);
    const loaded = migrateSaveRecord(portable(head)); expect(loaded.state.loanHistory!.map(orderedFacts)).toStrictEqual(expected);
    const recovered = await loadGameWithRecovery(5); expect(recovered!.state.loanHistory!.map(orderedFacts)).toStrictEqual(expected);
    expect(source).toStrictEqual(before); expect(commit.payloadBytes).toBe(bytes(head));
  });
  it("rejects new malformed archives before cloning without evaluating getters or replacing a good head", async () => {
    await saveGameWithResult(5, "Previous good head", career()); const before = structuredClone(await readHead());
    const source = career(), bad = wire(); let calls = 0;
    Object.defineProperty(bad, "14", { get() { calls++; return "236451"; }, enumerable: true, configurable: true }); source.loanHistory = [asLoan(bad)];
    expect(() => migrateSaveState(source)).toThrowError(expect.objectContaining<Partial<SaveMigrationError>>({ code: "CORRUPT_SAVE" }));
    await expect(saveGameWithResult(5, "Invalid archive", source)).rejects.toMatchObject({ code: "CORRUPT_SAVE" });
    expect(calls).toBe(0); expect(await readHead()).toStrictEqual(before);
  });
});
