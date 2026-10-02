// Unexecuted ef5920c baseline: existing persistence APIs, isolated fake IndexedDB.
import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Club, ClubFinancialObligation, GameState, LoanDeal } from "@/engine/core/types";
import { deleteSave, loadGameWithRecovery, migrateSaveRecord, migrateSaveState, saveGameWithResult, type SaveRecord } from "@/lib/db";
import { CURRENT_SAVE_SCHEMA_VERSION, SaveMigrationError, createSaveEnvelope, migrateSaveEnvelope } from "@/lib/saveEnvelope";

const SLOT = 5;
function loan(): LoanDeal {
  return { id: "saved-loan", playerId: "history-player", parentClubId: "parent", loanClubId: "host",
    startWeek: 1, startSeason: 1, endWeek: 12, endSeason: 1, loanFee: 500,
    wageContribution: 40, recallClause: false, status: "completed", outcome: "neutral",
    monitoringWeeks: ["1:4", "1:4"], scoutId: "saved-scout" };
}
function storedLoan(): unknown[] {
  return [1, "saved-loan", "history-player", "parent", "host", 1, 1, 12, 1, 500, 40, false,
    "completed", { outcome: "neutral", monitoringWeeks: ["1:4", "1:4"], scoutId: "saved-scout" }];
}
function obligation(): ClubFinancialObligation {
  return { id: "saved-obligation", type: "loanWageContribution", playerId: "history-player",
    creditorClubId: "parent", amount: 0, percentage: 12.5, weeklyAmount: 0, remainingWeeks: 0,
    createdWeek: 1, createdSeason: 1, status: "expired", lastProcessedWeek: 12, lastProcessedSeason: 1 };
}
function storedObligation(): Record<string, unknown> {
  // Present indices 0,1,2,3,4,5,6,7,8,9,13,14; zero values are actual facts.
  return { id: "saved-obligation", obligationArchiveV1: [25_599,
    "loanWageContribution", "history-player", "parent", 0, 12.5, 0, 0, 1, 1, "expired", 12, 1] };
}
function club(id: string): Club {
  return { id, name: id, shortName: id, leagueId: "saved-league", reputation: 55,
    budget: 50_000, scoutingPhilosophy: "academyFirst", managerId: "saved-manager",
    playerIds: [], academyPlayerIds: [], youthAcademyRating: 13,
    loanedInPlayerIds: [], loanedOutPlayerIds: [], financialObligations: [] };
}
function career(): GameState {
  const fixture = JSON.parse(readFileSync(new URL("../fixtures/saves/v0-save-record.json", import.meta.url), "utf8")) as { state: unknown };
  const state = migrateSaveState(fixture.state);
  state.scout.id = "saved-scout";
  state.clubs = { parent: club("parent"), host: club("host") };
  state.loanHistory = [loan(), loan()];
  state.clubs.host.financialObligations = [obligation(), obligation()];
  return state;
}
async function readHead(): Promise<SaveRecord> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("TalentScoutDB");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  try {
    // Dexie's logical schema 5 is represented as native IndexedDB version 50.
    expect(database.version).toBe(50);
    return await new Promise<SaveRecord>((resolve, reject) => {
      const request = database.transaction("saves", "readonly").objectStore("saves").get(SLOT);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as SaveRecord);
    });
  } finally { database.close(); }
}
beforeEach(async () => { await deleteSave(SLOT); });
afterAll(async () => { await deleteSave(SLOT); });

describe.sequential("terminal archives through actual persistence", () => {
  it("adds portable 6→7 without changing existing rules, metadata, source or IndexedDB version", () => {
    const state = career();
    const legacy = { ...createSaveEnvelope(state, 1_000), schemaVersion: 6,
      rulesVersion: "saved-rules", buildVersion: "saved-build",
      customEnvelopeMetadata: { originalExternalId: "remote-save-7" } };
    const before = JSON.stringify(legacy);
    const upgraded = migrateSaveEnvelope(legacy);
    expect(CURRENT_SAVE_SCHEMA_VERSION).toBe(7);
    expect(upgraded.schemaVersion).toBe(7);
    expect(upgraded.state).toEqual(state);
    expect(upgraded.rulesVersion).toBe("saved-rules");
    expect(upgraded.buildVersion).toBe("saved-build");
    expect(upgraded.savedAt).toBe(1_000);
    expect(upgraded.customEnvelopeMetadata).toEqual(legacy.customEnvelopeMetadata);
    const portable = JSON.parse(JSON.stringify(upgraded));
    expect(migrateSaveEnvelope(portable)).toEqual(portable);
    expect(JSON.stringify(legacy)).toBe(before);
  });

  it("stores real canonical tuples/masks and duplicate row order in the actual head, JSON load and recovery load", async () => {
    const source = career(), before = JSON.stringify(source);
    const canonical = migrateSaveState(source);
    expect(canonical.loanHistory).toEqual([storedLoan(), storedLoan()]);
    expect(canonical.clubs.host.financialObligations).toEqual([storedObligation(), storedObligation()]);
    const commit = await saveGameWithResult(SLOT, "Terminal history", source);
    expect(commit.wrote).toBe(true);
    const head = await readHead();
    expect(head.schemaVersion).toBe(7);
    expect(head.state.loanHistory).toEqual(canonical.loanHistory);
    expect(head.state.clubs.host.financialObligations).toEqual(canonical.clubs.host.financialObligations);
    expect(commit.payloadBytes).toBe(new TextEncoder().encode(JSON.stringify(head)).byteLength);
    const jsonLoaded = migrateSaveRecord(JSON.parse(JSON.stringify(head)));
    expect(jsonLoaded.state.loanHistory).toEqual(head.state.loanHistory);
    expect(jsonLoaded.state.clubs.host.financialObligations).toEqual(head.state.clubs.host.financialObligations);
    const recovered = await loadGameWithRecovery(SLOT);
    expect(recovered?.state.loanHistory).toEqual(head.state.loanHistory);
    expect(recovered?.state.clubs.host.financialObligations).toEqual(head.state.clubs.host.financialObligations);
    expect(migrateSaveState(canonical)).toEqual(canonical);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("loads mixed stored/ordinary custom histories before economics normalization and preserves full saved metadata", () => {
    const source = career();
    const customLoan = { ...loan(), id: "custom-loan", outcome: null,
      performanceRecord: { appearances: 3, authoredAudit: "keep-custom-performance" },
      customSource: { externalId: "audit-1" } };
    source.loanHistory = [storedLoan(), customLoan, storedLoan()] as unknown as LoanDeal[];
    source.clubs.host.financialObligations = [storedObligation(),
      { ...obligation(), id: "custom-obligation", customAudit: { externalId: "audit-2" } },
      storedObligation()] as unknown as ClubFinancialObligation[];
    const record = { ...createSaveEnvelope(source, 2_000), slot: SLOT, name: "Mixed terminal records",
      season: source.currentSeason, week: source.currentWeek, scoutName: "Alex Morgan",
      specialization: "youth", reputation: 18, storageRevision: 12,
      customEnvelopeMetadata: { providerReference: "persist-original" } };
    const before = JSON.stringify(record);
    const loaded = migrateSaveRecord(JSON.parse(before));
    expect(loaded.state.loanHistory).toEqual([storedLoan(), customLoan, storedLoan()]);
    expect(loaded.state.clubs.host.financialObligations?.[0]).toEqual(storedObligation());
    expect(loaded.state.clubs.host.financialObligations?.[1]).toMatchObject({
      id: "custom-obligation", status: "expired", customAudit: { externalId: "audit-2" },
    });
    expect(loaded.state.clubs.host.financialObligations?.[2]).toEqual(storedObligation());
    expect(loaded.storageRevision).toBe(12);
    expect(loaded.savedAt).toBe(2_000);
    expect(loaded).toHaveProperty("customEnvelopeMetadata", record.customEnvelopeMetadata);
    expect(migrateSaveRecord(loaded)).toEqual(loaded);
    expect(JSON.stringify(record)).toBe(before);
  });

  it.each([
    { label: "loan-short", loan: [1], obligation: undefined },
    { label: "loan-future", loan: [2, ...storedLoan().slice(1)], obligation: undefined },
    { label: "loan-unknown-optional", loan: [...storedLoan().slice(0, 13), { unexpected: "keep-or-refuse" }], obligation: undefined },
    { label: "obligation-negative-mask", loan: undefined, obligation: { id: "bad", obligationArchiveV1: [-1] } },
    { label: "obligation-missing-required", loan: undefined, obligation: { id: "bad", obligationArchiveV1: [0] } },
    { label: "obligation-trailing-column", loan: undefined, obligation: { ...storedObligation(), obligationArchiveV1: [...storedObligation().obligationArchiveV1 as unknown[], "unclaimed"] } },
    { label: "obligation-future", loan: undefined, obligation: { id: "bad", obligationArchiveV2: [0] } },
  ])("refuses $label before write, preserving source and an existing valid head", async ({ loan: badLoan, obligation: badObligation }) => {
    await saveGameWithResult(SLOT, "Previous valid terminal career", career());
    const previous = JSON.stringify(await readHead());
    const source = career();
    if (badLoan !== undefined) source.loanHistory = [badLoan] as unknown as LoanDeal[];
    if (badObligation !== undefined) source.clubs.host.financialObligations = [badObligation] as unknown as ClubFinancialObligation[];
    const before = JSON.stringify(source);
    expect(() => migrateSaveState(source)).toThrowError(expect.objectContaining<Partial<SaveMigrationError>>({ code: "CORRUPT_SAVE" }));
    await expect(saveGameWithResult(SLOT, "Rejected terminal archive", source)).rejects.toMatchObject({ code: "CORRUPT_SAVE" });
    expect(JSON.stringify(await readHead())).toBe(previous);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("refuses future portable 8 without decoding or rewriting opaque future facts", () => {
    const future = { ...createSaveEnvelope(career(), 3_000), schemaVersion: 8,
      state: { opaqueFutureTerminalFacts: { original: ["payment-audit"] } } };
    const before = JSON.stringify(future);
    expect(() => migrateSaveEnvelope(future)).toThrowError(expect.objectContaining<Partial<SaveMigrationError>>({ code: "FUTURE_VERSION" }));
    expect(JSON.stringify(future)).toBe(before);
  });
});
