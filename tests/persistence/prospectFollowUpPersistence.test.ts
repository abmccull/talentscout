// Failure-first delivery persistence regressions; integrated before product changes.
// Root destination after review: tests/persistence/prospectFollowUpPersistence.test.ts.
// Relative golden-fixture URL is for that destination, not this proposal directory.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { GameState, ScoutingCase } from "@/engine/core/types";
import { initializeFinances } from "@/engine/finance";
import { compactLongCareerHistory } from "@/engine/world/saveRetention";
import { migrateSaveRecord, migrateSaveState } from "@/lib/db";
import {
  CURRENT_SAVE_SCHEMA_VERSION,
  SaveMigrationError,
  createSaveEnvelope,
  extractSaveStatePayload,
  migrateSaveEnvelope,
} from "@/lib/saveEnvelope";

type Delivery = {
  sourceId: string;
  stage: "early-check" | "decision-point" | "accountability";
  deliveredWeek: number;
  deliveredSeason: number;
};
// Local intersection lets failure-first tests compile before the product type exists.
type CaseWithDeliveries = ScoutingCase & { prospectFollowUpDeliveries?: Delivery[] };
const goldenPath = fileURLToPath(new URL("../fixtures/saves/v0-save-record.json", import.meta.url));
const caseId = "case:golden:1";
const sourceId = "decision:accepted:1";

function stateWithCase(): GameState {
  const legacy = JSON.parse(readFileSync(goldenPath, "utf8")) as { state: unknown };
  const state = migrateSaveState(legacy.state);
  state.currentSeason = 2;
  state.currentWeek = 12;
  state.scoutingCases = {
    [caseId]: {
      id: caseId, scoutId: "golden-scout", playerId: "golden-player",
      openedWeek: 1, openedSeason: 2, lastUpdatedWeek: 1, lastUpdatedSeason: 2,
      status: "placed", reportIds: [], listingIds: [], deliveryIds: [],
      decisionIds: [sourceId], placementReportIds: [],
    },
  };
  state.clubDecisions = {
    [sourceId]: {
      id: sourceId, caseId, deliveryId: "delivery-1", clubId: "club-1",
      outcome: "accepted", decidedWeek: 1, decidedSeason: 2,
    },
  };
  state.inbox = [];
  return state;
}

function receipts(state: GameState): Delivery[] {
  return (state.scoutingCases[caseId] as CaseWithDeliveries).prospectFollowUpDeliveries ?? [];
}

function addMessage(state: GameState, id: string, week = 3): void {
  state.inbox.push({
    id, week, season: 2, type: "feedback", title: "Retained authored communication",
    body: "Keep this authored body exactly; delivery is not a new football outcome.",
    read: true, actionRequired: false, relatedId: "golden-player", relatedEntityType: "player",
  });
}

function retainedReport(
  reportId: string,
): GameState["reports"][string] {
  return {
    id: reportId, caseId, scoutId: "golden-scout", playerId: "golden-player",
    submittedWeek: 1, submittedSeason: 2,
    attributeAssessments: [], strengths: [], weaknesses: [],
    conviction: "recommend", summary: "Keep the original report judgment.",
    estimatedValue: 100_000, qualityScore: 72, clubResponse: "shortlisted",
  };
}

function removableEmployeeReportState(authority: unknown): GameState {
  const source = stateWithCase();
  const reportId = "rpt_emp_delivery-proof";
  source.finances = initializeFinances(source.scout, "independent", "normal");
  source.reports = { [reportId]: retainedReport(reportId) };
  source.clubDecisions = {};
  source.reportDeliveries = {};
  source.placementReports = {};
  source.alumniRecords = [];
  source.scoutingCases[caseId] = {
    ...source.scoutingCases[caseId],
    status: "reported",
    reportIds: [reportId], activeReportId: reportId,
    decisionIds: [], deliveryIds: [], placementReportIds: [],
  };
  Object.assign(source.scoutingCases[caseId], { prospectFollowUpDeliveries: authority });
  return source;
}

describe("prospect follow-up persistent delivery compatibility", () => {
  it("writes schema 6 and upgrades schema 5 without changing simulation versions or source bytes", () => {
    const state = stateWithCase();
    const record = {
      ...createSaveEnvelope(state, 1_000), schemaVersion: 5,
      rulesVersion: "historical-rules", buildVersion: "historical-build",
      customEnvelopeMetadata: { preserve: "external-reference" },
    };
    const original = JSON.stringify(record);
    const upgraded = migrateSaveEnvelope(record);
    expect(CURRENT_SAVE_SCHEMA_VERSION).toBe(6);
    expect(upgraded.schemaVersion).toBe(6);
    expect(upgraded.rulesVersion).toBe("historical-rules");
    expect(upgraded.buildVersion).toBe("historical-build");
    expect(upgraded.savedAt).toBe(1_000);
    expect(upgraded.customEnvelopeMetadata).toEqual(record.customEnvelopeMetadata);
    expect(upgraded.state).toEqual(state);
    expect(JSON.stringify(record)).toBe(original);
    const serialized = JSON.parse(JSON.stringify(upgraded));
    expect(migrateSaveEnvelope(serialized)).toEqual(serialized);
  });

  it("backfills only a positively matched retained scheduled message with its actual date", () => {
    const source = stateWithCase();
    addMessage(source, `prospect-follow-up:${caseId}:${sourceId}:early-check`, 4);
    const before = JSON.stringify(source);
    const migrated = migrateSaveState(source);
    expect(receipts(migrated)).toEqual([
      { sourceId, stage: "early-check", deliveredWeek: 4, deliveredSeason: 2 },
    ]);
    expect(migrated.inbox).toEqual(source.inbox);
    expect(JSON.stringify(source)).toBe(before);
    expect(migrateSaveState(migrated)).toEqual(migrated);
  });

  it("reconciles retained delivery only after the common loader reconstructs a case from an existing report", () => {
    const source = stateWithCase();
    const reportId = "report:shortlisted:reconstructed:1";
    source.scoutingCases = {};
    source.clubDecisions = {};
    source.reportDeliveries = {};
    source.placementReports = {};
    source.alumniRecords = [];
    source.reports = { [reportId]: retainedReport(reportId) };
    addMessage(source, `prospect-follow-up:${caseId}:${reportId}:early-check`, 5);
    const originalState = JSON.stringify(source);
    const record = {
      ...createSaveEnvelope(source, 1_500), schemaVersion: 5,
      slot: 1, name: "Reconstructed report case",
      season: source.currentSeason, week: source.currentWeek,
      scoutName: "Alex Morgan", specialization: "youth", reputation: 18,
    };
    const originalRecord = JSON.stringify(record);
    const loaded = migrateSaveRecord(JSON.parse(originalRecord));
    expect(loaded.state.scoutingCases[caseId]).toMatchObject({
      id: caseId, playerId: "golden-player", scoutId: "golden-scout",
      reportIds: [reportId], activeReportId: reportId,
      prospectFollowUpDeliveries: [{
        sourceId: reportId, stage: "early-check", deliveredWeek: 5, deliveredSeason: 2,
      }],
    });
    expect(loaded.state.inbox).toEqual(source.inbox);
    expect(migrateSaveState(source)).toEqual(loaded.state);
    expect(migrateSaveState(loaded.state)).toEqual(loaded.state);
    expect(migrateSaveRecord(loaded)).toEqual(loaded);
    expect(JSON.stringify(source)).toBe(originalState);
    expect(JSON.stringify(record)).toBe(originalRecord);
  });

  it("keeps a ledger-only orphan case when its removable employee report is archived", () => {
    const row = {
      sourceId: "older-anchor:no-longer-present", stage: "early-check" as const,
      deliveredWeek: 8, deliveredSeason: 1,
      customDeliveryExtension: { originalReference: "keep-earned-proof" },
    };
    const source = removableEmployeeReportState([row]);
    const original = JSON.stringify(source);
    const migrated = migrateSaveState(source);
    expect(migrated.reports).not.toHaveProperty("rpt_emp_delivery-proof");
    expect(migrated.finances?.staffWorkProducts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "legacy-staff-work:rpt_emp_delivery-proof",
        status: "archived", playerId: "golden-player",
      }),
    ]));
    expect(migrated.scoutingCases).toHaveProperty(caseId);
    expect(receipts(migrated)).toEqual([row]);
    expect(migrated.scoutingCases[caseId].reportIds).toEqual([]);
    expect(migrateSaveState(migrated)).toEqual(migrated);
    expect(JSON.stringify(source)).toBe(original);
  });

  it.each([
    { label: "null", authority: null },
    { label: "non-array", authority: "not-an-array" },
    { label: "invalid-stage", authority: [{
      sourceId, stage: "unknown-stage", deliveredWeek: 3, deliveredSeason: 2,
    }] },
  ])("rejects $label present authority before employee cleanup can erase its case", ({ authority }) => {
    const source = removableEmployeeReportState(authority);
    const original = JSON.stringify(source);
    expect(() => migrateSaveState(source)).toThrowError(
      expect.objectContaining<Partial<SaveMigrationError>>({ code: "CORRUPT_SAVE" }),
    );
    expect(JSON.stringify(source)).toBe(original);
    expect(source.reports).toHaveProperty("rpt_emp_delivery-proof");
    expect(source.finances?.staffWorkProducts).toEqual([]);
  });

  it("retains ordinary employee cleanup for an empty unknown delivery ledger", () => {
    const source = removableEmployeeReportState([]);
    const original = JSON.stringify(source);
    const migrated = migrateSaveState(source);
    expect(migrated.reports).not.toHaveProperty("rpt_emp_delivery-proof");
    expect(migrated.scoutingCases).not.toHaveProperty(caseId);
    expect(migrated.finances?.staffWorkProducts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "legacy-staff-work:rpt_emp_delivery-proof" }),
    ]));
    expect(migrateSaveState(migrated)).toEqual(migrated);
    expect(JSON.stringify(source)).toBe(original);
  });

  it("does not infer absent past stages from elapsed weeks, placement or decision facts", () => {
    const source = stateWithCase();
    source.currentWeek = 22;
    const migrated = migrateSaveState(source);
    expect(receipts(migrated)).toEqual([]);
    expect(migrated.scoutingCases[caseId]).toHaveProperty("prospectFollowUpDeliveries", []);
    expect(migrated.clubDecisions).toEqual(source.clubDecisions);
    expect(migrated.scoutingCases[caseId].deliveryIds).toEqual([]);
  });

  it("does not classify professional opportunity IDs or an unlinked anchor as scheduled delivery", () => {
    const source = stateWithCase();
    addMessage(source, `prospect-follow-up:${caseId}:professional-lock-1`);
    addMessage(source, `prospect-follow-up:${caseId}:not-case-linked:early-check`);
    const migrated = migrateSaveState(source);
    expect(receipts(migrated)).toEqual([]);
    expect(migrated.scoutingCases[caseId]).toHaveProperty("prospectFollowUpDeliveries", []);
  });

  it("does not invent delivery when separator-containing IDs make an exact message ID ambiguous across cases", () => {
    const source = stateWithCase();
    const secondCaseId = "case:golden";
    const secondSourceId = "1:decision:accepted:1";
    source.scoutingCases[secondCaseId] = {
      ...source.scoutingCases[caseId], id: secondCaseId, decisionIds: [secondSourceId],
    };
    source.clubDecisions[secondSourceId] = {
      ...source.clubDecisions[sourceId], id: secondSourceId, caseId: secondCaseId,
    };
    const messageId = `prospect-follow-up:${caseId}:${sourceId}:early-check`;
    expect(messageId).toBe(`prospect-follow-up:${secondCaseId}:${secondSourceId}:early-check`);
    addMessage(source, messageId, 4);
    const original = JSON.stringify(source);
    const migrated = migrateSaveState(source);
    expect(receipts(migrated)).toEqual([]);
    expect((migrated.scoutingCases[secondCaseId] as CaseWithDeliveries).prospectFollowUpDeliveries ?? []).toEqual([]);
    expect(migrated.scoutingCases[caseId]).toHaveProperty("prospectFollowUpDeliveries", []);
    expect(migrated.scoutingCases[secondCaseId]).toHaveProperty("prospectFollowUpDeliveries", []);
    expect(JSON.stringify(source)).toBe(original);
  });

  it("preserves older/orphaned recorded proof, extension data and exact receipt dates through all canonical state paths", () => {
    const source = stateWithCase();
    const rows: Delivery[] = [
      { sourceId: "older-anchor:no-longer-present", stage: "early-check", deliveredWeek: 8, deliveredSeason: 1 },
      { sourceId, stage: "decision-point", deliveredWeek: 9, deliveredSeason: 2 },
    ];
    (source.scoutingCases[caseId] as CaseWithDeliveries).prospectFollowUpDeliveries = rows;
    Object.assign(source.scoutingCases[caseId], { customCaseExtension: { earnedReference: "keep" } });
    const original = JSON.stringify(source);
    const compacted = compactLongCareerHistory(source);
    const persisted = createSaveEnvelope(compacted, 2_000);
    const payload = extractSaveStatePayload(JSON.parse(JSON.stringify(persisted)));
    const migrated = migrateSaveState(payload);
    expect(receipts(migrated)).toEqual(rows);
    expect(migrated.scoutingCases[caseId]).toMatchObject({ customCaseExtension: { earnedReference: "keep" } });
    expect(migrateSaveState(migrated)).toEqual(migrated);
    expect(JSON.stringify(source)).toBe(original);
  });

  it("retains delivery authority through the complete saved-record load entrypoint after inbox removal", () => {
    const source = stateWithCase();
    const row: Delivery = { sourceId, stage: "early-check", deliveredWeek: 3, deliveredSeason: 2 };
    (source.scoutingCases[caseId] as CaseWithDeliveries).prospectFollowUpDeliveries = [row];
    const record = {
      ...createSaveEnvelope(source, 3_000), slot: 1, name: "Follow-up career",
      season: source.currentSeason, week: source.currentWeek,
      scoutName: "Alex Morgan", specialization: "youth", reputation: 18,
    };
    const original = JSON.stringify(record);
    const loaded = migrateSaveRecord(JSON.parse(original));
    expect(loaded.state.inbox).toEqual([]);
    expect(receipts(loaded.state)).toEqual([row]);
    expect(migrateSaveRecord(loaded)).toEqual(loaded);
    expect(JSON.stringify(record)).toBe(original);
  });

  it.each([
    "not-an-array",
    [{ sourceId, stage: "unknown-stage", deliveredWeek: 3, deliveredSeason: 2 }],
    [{ sourceId: "", stage: "early-check", deliveredWeek: 3, deliveredSeason: 2 }],
    [{ sourceId, stage: "early-check", deliveredWeek: 0, deliveredSeason: 2 }],
    [{ sourceId, stage: "early-check", deliveredWeek: 3.5, deliveredSeason: 2 }],
    [{ sourceId, stage: "early-check", deliveredWeek: 3, deliveredSeason: -1 }],
  ])("rejects malformed present authority without discarding or rewriting raw bytes: %j", (bad) => {
    const source = stateWithCase();
    Object.assign(source.scoutingCases[caseId], { prospectFollowUpDeliveries: bad });
    const original = JSON.stringify(source);
    expect(() => migrateSaveState(source)).toThrowError(
      expect.objectContaining<Partial<SaveMigrationError>>({ code: "CORRUPT_SAVE" }),
    );
    expect(JSON.stringify(source)).toBe(original);
  });

  it("rejects the next unsupported schema 7 while leaving opaque authority recoverable", () => {
    const source = {
      ...createSaveEnvelope(stateWithCase(), 4_000), schemaVersion: 7,
      state: { opaqueFutureDeliveryAuthority: { preserve: ["future-earned-proof"] } },
    };
    const original = JSON.stringify(source);
    expect(() => migrateSaveEnvelope(source)).toThrowError(
      expect.objectContaining<Partial<SaveMigrationError>>({ code: "FUTURE_VERSION" }),
    );
    expect(JSON.stringify(source)).toBe(original);
  });
});
