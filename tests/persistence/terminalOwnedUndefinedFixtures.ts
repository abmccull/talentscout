// Draft destination: tests/persistence/terminalOwnedUndefinedFixtures.ts.
// Hand-authored wire fixtures are independent of the production compactors.
import { readFileSync } from "node:fs";
import { expect } from "vitest";
import type { Club, ClubFinancialObligation, GameState, LoanDeal } from "@/engine/core/types";
import { expandClubFinancialObligation, expandLoanDeal } from "@/engine/finance/terminalRecordArchive";
import { migrateSaveState, type SaveRecord } from "@/lib/db";
import { createSaveEnvelope } from "@/lib/saveEnvelope";

export const SLOT = 5;
export const SLOT_NAME = "slot_5";
export const NAME = "Owned optional terminal facts";
export const OBLIGATION_PRESENCE = 8_388_607;
export const OBLIGATION_UNDEFINED = 197_744;

export function v1Loan(): LoanDeal {
  return { id: "v1-loan", playerId: "history-player", parentClubId: "parent", loanClubId: "host",
    startWeek: 1, startSeason: 1, endWeek: 12, endSeason: 1, loanFee: 500,
    wageContribution: 40, recallClause: false, status: "completed", outcome: "neutral", scoutId: "" };
}
export function v1LoanWire(): unknown[] {
  return [1, "v1-loan", "history-player", "parent", "host", 1, 1, 12, 1, 500, 40, false,
    "completed", { outcome: "neutral", scoutId: "" }];
}
export function ownedLoan(): LoanDeal {
  return { id: "v2-loan", playerId: "history-player", parentClubId: "parent", loanClubId: "host",
    startWeek: 1, startSeason: 1, endWeek: 12, endSeason: 1, loanFee: 500,
    wageContribution: 40, recallClause: false, status: "completed",
    buyOptionFee: undefined, outcome: "neutral", startCurrentAbility: 0,
    monitoringWeeks: ["1:4", "1:4", "1:5"], scoutId: undefined,
    performanceRecord: { appearances: 0, goals: 0, assists: 0, avgRating: 0,
      developmentDelta: 0, parentClubSatisfaction: 50, loanClubSatisfaction: 60 } };
}
export function v2LoanWire(): unknown[] {
  // Undefined bits 0 (buyOptionFee) and 5 (scoutId); agreedPlayingTime is absent.
  return [2, "v2-loan", "history-player", "parent", "host", 1, 1, 12, 1, 500, 40, false,
    "completed", 33, { outcome: "neutral", startCurrentAbility: 0,
      monitoringWeeks: ["1:4", "1:4", "1:5"], performanceRecord: [0, 0, 0, 0, 0, 50, 60] }];
}
export function customLoan() {
  return { ...v1Loan(), id: "custom-loan", outcome: null,
    customSource: { externalId: "authored-loan-audit" } };
}
export function v1Obligation(): ClubFinancialObligation {
  return { id: "v1-obligation", type: "loanWageContribution", playerId: "history-player",
    creditorClubId: "parent", amount: 0, percentage: 12.5, weeklyAmount: 0, remainingWeeks: 0,
    createdWeek: 1, createdSeason: 1, status: "expired", lastProcessedWeek: 12, lastProcessedSeason: 1 };
}
export function v1ObligationWire(): Record<string, unknown> {
  return { id: "v1-obligation", obligationArchiveV1: [25_599,
    "loanWageContribution", "history-player", "parent", 0, 12.5, 0, 0, 1, 1, "expired", 12, 1] };
}
export function ownedObligation(): ClubFinancialObligation {
  return { id: "v2-obligation", type: "appearanceBonus", playerId: "history-player",
    creditorClubId: null, amount: 0, percentage: undefined, weeklyAmount: undefined,
    remainingWeeks: undefined, createdWeek: 1, createdSeason: 1, status: "settled",
    trigger: undefined, triggeredWeek: 12, triggeredSeason: 1,
    lastProcessedWeek: 0, lastProcessedSeason: 0, appearanceThreshold: 0,
    goalThreshold: undefined, assistThreshold: undefined,
    appearancesRecorded: 0, goalsRecorded: 0, assistsRecorded: 0,
    lastTriggerEvaluationWeek: 12, lastTriggerEvaluationSeason: 1 } as unknown as ClubFinancialObligation;
}
export function v2ObligationWire(): Record<string, unknown> {
  // All 23 fields present; undefined indices 4,5,6,10,16,17 consume no payload.
  return { id: "v2-obligation", obligationArchiveV2: [OBLIGATION_PRESENCE, OBLIGATION_UNDEFINED,
    "appearanceBonus", "history-player", null, 0, 1, 1, "settled", 12, 1, 0, 0, 0, 0, 0, 0, 12, 1] };
}
export function customObligation() {
  return { ...v1Obligation(), id: "custom-obligation", obligationArchiveV1: ["authored-extension"],
    customAudit: { externalId: "authored-obligation-audit" } };
}
// Independent current emission fixtures; no test-side encoder or altered legacy load data.
export function v41LoanWire(): unknown[] {
  return [41, "v1-loan", "history-player", "parent", "host", 1, 1, 12, 1, 500, 40, false,
    0, { outcome: 1, scoutId: "" }];
}
export function v42LoanWire(): unknown[] {
  return [42, "v2-loan", "history-player", "parent", "host", 1, 1, 12, 1, 500, 40, false,
    0, 33, { outcome: 1, startCurrentAbility: 0,
      monitoringWeeks: ["1:4", "1:4", "1:5"], performanceRecord: [0, 0, 0, 0, 0, 50, 60] }];
}
export function v31ObligationWire(): Record<string, unknown> {
  return { id: "v1-obligation", obligationArchiveV31: [25_599,
    0, "history-player", "parent", 0, 12.5, 0, 0, 1, 1, 1, 12, 1] };
}
export function v32ObligationWire(): Record<string, unknown> {
  return { id: "v2-obligation", obligationArchiveV32: [OBLIGATION_PRESENCE, OBLIGATION_UNDEFINED,
    1, "history-player", null, 0, 1, 1, 0, 12, 1, 0, 0, 0, 0, 0, 0, 12, 1] };
}
function club(id: string): Club {
  return { id, name: id, shortName: id, leagueId: "saved-league", reputation: 55,
    budget: 50_000, scoutingPhilosophy: "academyFirst", managerId: "saved-manager",
    playerIds: [], academyPlayerIds: [], youthAcademyRating: 13,
    loanedInPlayerIds: [], loanedOutPlayerIds: [], financialObligations: [] };
}
export function stateWithRows(kind: "ordinary" | "mixed" | "v1" = "mixed", week = 14): GameState {
  const fixture = JSON.parse(readFileSync(new URL("../fixtures/saves/v0-save-record.json", import.meta.url), "utf8")) as { state: unknown };
  const state = migrateSaveState(fixture.state);
  state.currentWeek = week;
  state.scout.id = "saved-scout";
  state.clubs = { parent: club("parent"), host: club("host") };
  if (kind === "v1") {
    state.loanHistory = [v1LoanWire(), v1LoanWire()] as unknown as GameState["loanHistory"];
    state.clubs.host.financialObligations = [v1ObligationWire(), v1ObligationWire()] as unknown as Club["financialObligations"];
  } else {
    state.loanHistory = [v1LoanWire(), kind === "ordinary" ? ownedLoan() : v2LoanWire(),
      customLoan(), kind === "ordinary" ? ownedLoan() : v2LoanWire(), v1LoanWire()] as unknown as GameState["loanHistory"];
    state.clubs.host.financialObligations = [v1ObligationWire(), kind === "ordinary" ? ownedObligation() : v2ObligationWire(),
      customObligation(), kind === "ordinary" ? ownedObligation() : v2ObligationWire(), v1ObligationWire()] as unknown as Club["financialObligations"];
  }
  return state;
}
export function recordFor(state: GameState, schemaVersion = 8) {
  return { ...createSaveEnvelope(state, 42_000), schemaVersion,
    rulesVersion: "pinned-existing-rules", buildVersion: "pinned-existing-build",
    slot: SLOT, name: NAME, season: state.currentSeason, week: state.currentWeek,
    scoutName: `${state.scout.firstName} ${state.scout.lastName}`,
    specialization: state.scout.primarySpecialization, reputation: state.scout.reputation,
    storageRevision: 12, customEnvelopeMetadata: { providerReference: "original-external-save-id" } };
}
export function ownUndefined(row: object, key: string) {
  expect(Object.getOwnPropertyDescriptor(row, key)).toStrictEqual({
    value: undefined, enumerable: true, writable: true, configurable: true,
  });
}
export function assertFacts(state: GameState) {
  const loans = state.loanHistory!.map(row => expandLoanDeal(row));
  const obligations = state.clubs.host.financialObligations!.map(row => expandClubFinancialObligation(row));
  expect(loans).toStrictEqual([v1Loan(), ownedLoan(), customLoan(), ownedLoan(), v1Loan()]);
  expect(obligations).toStrictEqual([v1Obligation(), ownedObligation(), customObligation(), ownedObligation(), v1Obligation()]);
  for (const index of [1, 3]) {
    ownUndefined(loans[index], "buyOptionFee");
    ownUndefined(loans[index], "scoutId");
    expect(Object.hasOwn(loans[index], "agreedPlayingTime")).toBe(false);
    for (const key of ["percentage", "weeklyAmount", "remainingWeeks", "trigger", "goalThreshold", "assistThreshold"]) {
      ownUndefined(obligations[index], key);
    }
    expect(Object.hasOwn(obligations[index], "creditorClubId")).toBe(true);
    expect(obligations[index].creditorClubId).toBeNull();
    expect(obligations[index].amount).toBe(0);
  }
  expect(Object.hasOwn(loans[0], "buyOptionFee")).toBe(false);
  expect(loans[0].scoutId).toBe("");
  expect(loans[0].recallClause).toBe(false);
  expect(Object.hasOwn(obligations[0], "trigger")).toBe(false);
}
export function assertCanonical(state: GameState) {
  expect(state.loanHistory).toStrictEqual([v41LoanWire(), v42LoanWire(), customLoan(), v42LoanWire(), v41LoanWire()]);
  expect(state.clubs.host.financialObligations).toStrictEqual([v31ObligationWire(), v32ObligationWire(),
    customObligation(), v32ObligationWire(), v31ObligationWire()]);
  assertFacts(state);
}
export async function database(): Promise<IDBDatabase> {
  const value = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("TalentScoutDB");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  expect(value.version).toBe(50); // Existing Dexie logical schema remains 5.
  return value;
}
export async function readHead(): Promise<SaveRecord> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("saves", "readonly").objectStore("saves").get(SLOT);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as SaveRecord);
    });
  } finally { db.close(); }
}
export async function putHead(value: unknown): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("saves", "readwrite");
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();
      transaction.objectStore("saves").put(value);
    });
  } finally { db.close(); }
}
export async function journalSnapshot(): Promise<Record<string, unknown[]>> {
  const db = await database();
  try {
    const entries = await Promise.all(["saves", "saveArchives", "saveSyncQueue"].map(async name => {
      const rows = await new Promise<unknown[]>((resolve, reject) => {
        const request = db.transaction(name, "readonly").objectStore(name).getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result as unknown[]);
      });
      return [name, rows] as const;
    }));
    return Object.fromEntries(entries);
  } finally { db.close(); }
}
export const malformedRows: { label: string; location: "loan" | "obligation"; row: unknown }[] = [
  { label: "loan-mask-negative", location: "loan", row: [...v2LoanWire().slice(0, 13), -1, {}] },
  { label: "loan-mask-high", location: "loan", row: [...v2LoanWire().slice(0, 13), 128, {}] },
  { label: "loan-mask-fractional", location: "loan", row: [...v2LoanWire().slice(0, 13), 0.5, {}] },
  { label: "loan-mask-overlap", location: "loan", row: [...v2LoanWire().slice(0, 14), { buyOptionFee: 0 }] },
  { label: "loan-required-undefined", location: "loan", row: [...v2LoanWire().slice(0, 9), undefined, ...v2LoanWire().slice(10)] },
  { label: "loan-unknown-optional", location: "loan", row: [...v2LoanWire().slice(0, 14), { customPackedFact: "refuse" }] },
  { label: "loan-missing-column", location: "loan", row: v2LoanWire().slice(0, 14) },
  { label: "loan-trailing-column", location: "loan", row: [...v2LoanWire(), "extra"] },
  { label: "loan-future-tag-3", location: "loan", row: [3, ...v2LoanWire().slice(1)] },
  { label: "loan-v1-owned-undefined", location: "loan", row: [...v1LoanWire().slice(0, 13), { scoutId: undefined }] },
  { label: "loan-performance-malformed", location: "loan", row: [...v2LoanWire().slice(0, 14), { performanceRecord: [0] }] },
  { label: "loan-monitoring-malformed", location: "loan", row: [...v2LoanWire().slice(0, 14), { monitoringWeeks: ["1:4", 5] }] },
  { label: "obligation-undefined-not-present", location: "obligation", row: { id: "bad", obligationArchiveV2: [899, 4, "appearanceBonus", "p", 1, 1, "settled"] } },
  { label: "obligation-required-undefined", location: "obligation", row: { id: "bad", obligationArchiveV2: [899, 1, "p", 1, 1, "settled"] } },
  { label: "obligation-missing-required", location: "obligation", row: { id: "bad", obligationArchiveV2: [0, 0] } },
  { label: "obligation-high-undefined", location: "obligation", row: { id: "bad", obligationArchiveV2: [OBLIGATION_PRESENCE, 8_388_608] } },
  { label: "obligation-negative-presence", location: "obligation", row: { id: "bad", obligationArchiveV2: [-1, 0] } },
  { label: "obligation-negative-undefined", location: "obligation", row: { id: "bad", obligationArchiveV2: [899, -1] } },
  { label: "obligation-fractional-undefined", location: "obligation", row: { id: "bad", obligationArchiveV2: [899, 0.5] } },
  { label: "obligation-missing-payload", location: "obligation", row: { ...v2ObligationWire(), obligationArchiveV2: [899, 0, "appearanceBonus"] } },
  { label: "obligation-trailing-payload", location: "obligation", row: { ...v2ObligationWire(), obligationArchiveV2: [...v2ObligationWire().obligationArchiveV2 as unknown[], "extra"] } },
  { label: "obligation-unknown-envelope-field", location: "obligation", row: { ...v2ObligationWire(), extension: "refuse-envelope" } },
  { label: "obligation-dual-version-envelope", location: "obligation", row: { ...v2ObligationWire(), obligationArchiveV1: [899, "appearanceBonus", "p", 1, 1, "settled"] } },
  { label: "obligation-v1-owned-undefined", location: "obligation", row: { id: "bad", obligationArchiveV1: [25_599,
    "loanWageContribution", "history-player", "parent", undefined, 12.5, 0, 0, 1, 1, "expired", 12, 1] } },
  { label: "obligation-future-version-3", location: "obligation", row: { id: "bad", obligationArchiveV3: [899, 0] } },
];
export function malformedState(item: typeof malformedRows[number]): GameState {
  const value = stateWithRows("v1");
  if (item.location === "loan") value.loanHistory = [item.row] as unknown as GameState["loanHistory"];
  else value.clubs.host.financialObligations = [item.row] as unknown as Club["financialObligations"];
  return value;
}
