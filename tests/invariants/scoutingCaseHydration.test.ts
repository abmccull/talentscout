import { describe, expect, it } from "vitest";
import type { GameState, PlacementReport, ScoutReport } from "@/engine/core/types";
import {
  ensureScoutingCaseForReport,
  migrateScoutingCases,
  recordDirectPlacementDelivery,
  recordMarketplaceDelivery,
  resolveClubDecision,
} from "@/engine/reports/scoutingCases";

function report(overrides: Partial<ScoutReport> = {}): ScoutReport {
  return {
    id: "report-s1w11-r2", caseId: "case-1", playerId: "player-1", scoutId: "scout-1",
    submittedWeek: 11, submittedSeason: 1, revision: 2,
    attributeAssessments: [], strengths: [], weaknesses: [], conviction: "recommend",
    summary: "Authored judgment", estimatedValue: 1_000, qualityScore: 70,
    ...overrides,
  };
}

function oldPlacement(): PlacementReport {
  return {
    id: "placement-old", unsignedYouthId: "youth-1", targetClubId: "club-1", scoutId: "scout-1",
    conviction: "recommend", clubResponse: "pending", qualityScore: 70, week: 11, season: 1,
  };
}

function stateWithOlderDeliveredReport(newestAction?: ScoutReport["recommendedAction"]): GameState {
  const old = report();
  const submitted = ensureScoutingCaseForReport({}, old);
  const delivered = recordDirectPlacementDelivery({
    scoutingCases: submitted.scoutingCases, reportDeliveries: {}, report: old, placementReport: oldPlacement(),
  });
  const resolved = resolveClubDecision({
    ...delivered, clubDecisions: {}, deliveryId: delivered.delivery.id,
    outcome: "rejected", week: 12, season: 1,
  });
  const latest = report({
    id: "report-s1w16-r3", submittedWeek: 16, revision: 3,
    supersedesReportId: old.id, recommendedAction: newestAction,
  });
  const revised = ensureScoutingCaseForReport(resolved.scoutingCases, latest);
  return {
    // Reverse map insertion order deliberately: authored date/revision is authoritative.
    reports: { [latest.id]: latest, [old.id]: old },
    scoutingCases: revised.scoutingCases, reportDeliveries: resolved.reportDeliveries,
    clubDecisions: resolved.clubDecisions,
    placementReports: { "placement-old": {
      ...delivered.placementReport, clubResponse: "rejected", decisionId: resolved.decision!.id,
    } },
    unsignedYouth: { "youth-1": { id: "youth-1", player: { id: "player-1" } } },
    alumniRecords: [],
  } as unknown as GameState;
}

function stateWithResolvedLatestDelivery(outcome: "rejected" | "trial" | "accepted", marketplace = false): GameState {
  const authored = report();
  const linked = ensureScoutingCaseForReport({}, authored);
  const bid = { id: "bid-1", clubId: "club-1", amount: 100, placedWeek: 11, placedSeason: 1, status: "accepted" } as Parameters<typeof recordMarketplaceDelivery>[0]["bid"];
  const listing = { id: "listing-1", caseId: "case-1", reportId: authored.id, listedWeek: 11, listedSeason: 1, bids: [bid] } as Parameters<typeof recordMarketplaceDelivery>[0]["listing"];
  const delivered = marketplace
    ? recordMarketplaceDelivery({
        scoutingCases: linked.scoutingCases, reportDeliveries: {}, report: authored,
        listing, bid, week: 11, season: 1,
      })
    : recordDirectPlacementDelivery({
        scoutingCases: linked.scoutingCases, reportDeliveries: {}, report: authored, placementReport: oldPlacement(),
      });
  const resolved = resolveClubDecision({
    ...delivered, clubDecisions: {}, deliveryId: delivered.delivery.id,
    outcome, week: 12, season: 1,
  });
  return {
    reports: { [authored.id]: authored }, scoutingCases: resolved.scoutingCases,
    reportDeliveries: resolved.reportDeliveries, clubDecisions: resolved.clubDecisions,
    placementReports: marketplace ? {} : { "placement-old": {
      ...oldPlacement(), caseId: "case-1", reportId: authored.id,
      deliveryId: delivered.delivery.id, decisionId: resolved.decision!.id, clubResponse: outcome,
      responseDueWeek: 12, responseDueSeason: 1,
    } },
    finances: marketplace ? { reportListings: [{ ...listing, deliveryIds: [delivered.delivery.id] }] } : undefined,
    unsignedYouth: { "youth-1": { id: "youth-1", player: { id: "player-1" } } }, alumniRecords: [],
  } as unknown as GameState;
}

describe("scouting case save hydration", () => {
  it.each([false, true])("restores a missing delivery decision pointer without inventing another decision (marketplace=%s)", (marketplace) => {
    const state = stateWithResolvedLatestDelivery("rejected", marketplace);
    const delivery = Object.values(state.reportDeliveries)[0];
    const originalDecision = Object.values(state.clubDecisions)[0];
    const decision = { ...originalDecision, id: "legacy-dated-decision" };
    state.clubDecisions = { [decision.id]: decision };
    state.scoutingCases["case-1"].decisionIds = [decision.id];
    delete delivery.decisionId;
    if (!marketplace) state.placementReports["placement-old"].decisionId = decision.id;
    const decisionBytes = JSON.stringify(state.clubDecisions);
    const authoredBytes = JSON.stringify(state.reports);
    const replay = resolveClubDecision({ ...state, deliveryId: delivery.id, outcome: "accepted", week: 2, season: 1 });
    expect(replay.decision).toBe(decision);
    expect(replay.reportDeliveries[delivery.id]).toMatchObject({
      decisionId: decision.id, status: "resolved", resolvedWeek: 12, resolvedSeason: 1,
    });
    expect(JSON.stringify(replay.clubDecisions)).toBe(decisionBytes);
    migrateScoutingCases(state);
    expect(state.reportDeliveries[delivery.id]).toMatchObject({
      decisionId: decision.id, status: "resolved", resolvedWeek: 12, resolvedSeason: 1,
    });
    expect(state.scoutingCases["case-1"]).toMatchObject({ status: "closed", decisionIds: [decision.id], lastUpdatedWeek: 12 });
    expect(JSON.stringify(state.clubDecisions)).toBe(decisionBytes);
    expect(JSON.stringify(state.reports)).toBe(authoredBytes);
    const firstHydration = JSON.stringify(state);
    migrateScoutingCases(state);
    expect(JSON.stringify(state)).toBe(firstHydration);
  });

  it("does not overwrite a contradictory decision link while resolving a delivery", () => {
    const state = stateWithResolvedLatestDelivery("rejected");
    const delivery = Object.values(state.reportDeliveries)[0];
    const decision = Object.values(state.clubDecisions)[0];
    state.clubDecisions[decision.id] = { ...decision, deliveryId: "unrelated-delivery" };
    const originalBytes = JSON.stringify(state);
    const replay = resolveClubDecision({ ...state, deliveryId: delivery.id, outcome: "accepted", week: 13, season: 1 });
    expect(replay.decision).toBeUndefined();
    expect(replay.clubDecisions).toBe(state.clubDecisions);
    expect(replay.reportDeliveries).toBe(state.reportDeliveries);
    expect(JSON.stringify(state)).toBe(originalBytes);
  });

  it.each([
    { marketplace: false, outcome: "rejected" as const, status: "closed" },
    { marketplace: false, outcome: "trial" as const, status: "reported" },
    { marketplace: true, outcome: "rejected" as const, status: "closed" },
    { marketplace: true, outcome: "trial" as const, status: "reported" },
  ])("preserves resolved $outcome state and original dates on replay (marketplace=$marketplace)", ({ marketplace, outcome, status }) => {
    const state = stateWithResolvedLatestDelivery(outcome, marketplace);
    const authoredBytes = JSON.stringify(state.reports);
    const decisionBytes = JSON.stringify(state.clubDecisions);
    const deliveryBytes = JSON.stringify(state.reportDeliveries);
    const delivery = Object.values(state.reportDeliveries)[0];
    const existingDecision = Object.values(state.clubDecisions)[0];
    const replayed = resolveClubDecision({
      ...state, deliveryId: delivery.id,
      outcome: "accepted", week: 2, season: 1,
    });
    expect(replayed.decision).toBe(existingDecision);
    expect(replayed.scoutingCases["case-1"]).toMatchObject({ status, lastUpdatedWeek: 12 });
    expect(JSON.stringify(replayed.clubDecisions)).toBe(decisionBytes);
    expect(JSON.stringify(replayed.reportDeliveries)).toBe(deliveryBytes);

    if (marketplace) {
      const listing = state.finances!.reportListings[0];
      const linkedAgain = recordMarketplaceDelivery({
        scoutingCases: state.scoutingCases, reportDeliveries: state.reportDeliveries,
        report: state.reports[delivery.reportId!], listing, bid: listing.bids[0], week: 11, season: 1,
      });
      expect(linkedAgain.scoutingCases["case-1"]).toEqual(state.scoutingCases["case-1"]);
      expect(JSON.stringify(linkedAgain.reportDeliveries)).toBe(deliveryBytes);
    }

    migrateScoutingCases(state);
    expect(state.scoutingCases["case-1"]).toMatchObject({
      activeReportId: "report-s1w11-r2", status, lastUpdatedWeek: 12, lastUpdatedSeason: 1,
    });
    expect(JSON.stringify(state.reports)).toBe(authoredBytes);
    expect(JSON.stringify(state.clubDecisions)).toBe(decisionBytes);
    expect(JSON.stringify(state.reportDeliveries)).toBe(deliveryBytes);
    const firstHydration = JSON.stringify(state);
    migrateScoutingCases(state);
    expect(JSON.stringify(state)).toBe(firstHydration);
  });

  it("reconstructs a marketplace-only case from the existing dated decision", () => {
    const state = stateWithResolvedLatestDelivery("rejected", true);
    state.scoutingCases = {};
    const decisionBytes = JSON.stringify(state.clubDecisions);
    const deliveryBytes = JSON.stringify(state.reportDeliveries);
    migrateScoutingCases(state);
    expect(state.scoutingCases["case-1"]).toMatchObject({
      activeReportId: "report-s1w11-r2", status: "closed", lastUpdatedWeek: 12, lastUpdatedSeason: 1,
    });
    expect(JSON.stringify(state.clubDecisions)).toBe(decisionBytes);
    expect(JSON.stringify(state.reportDeliveries)).toBe(deliveryBytes);
    const firstHydration = JSON.stringify(state);
    migrateScoutingCases(state);
    expect(JSON.stringify(state)).toBe(firstHydration);
  });

  it("keeps factual accepted placement when a later private pass becomes the authored judgment", () => {
    const state = stateWithResolvedLatestDelivery("accepted");
    const latest = report({ id: "later-pass", submittedWeek: 16, revision: 3, recommendedAction: "pass" });
    const linked = ensureScoutingCaseForReport(state.scoutingCases, latest);
    state.scoutingCases = linked.scoutingCases;
    state.reports[latest.id] = linked.report;
    const authoredBytes = JSON.stringify(state.reports);
    const decisionBytes = JSON.stringify(state.clubDecisions);
    migrateScoutingCases(state);
    expect(state.scoutingCases["case-1"]).toMatchObject({
      activeReportId: latest.id, status: "placed", lastUpdatedWeek: 16,
    });
    expect(JSON.stringify(state.reports)).toBe(authoredBytes);
    expect(JSON.stringify(state.clubDecisions)).toBe(decisionBytes);
  });

  it("keeps the S1W16 revision active when loading an S1W11 historical placement", () => {
    const state = stateWithOlderDeliveredReport();
    const originalReports = structuredClone(state.reports);
    const originalDeliveries = structuredClone(state.reportDeliveries);
    const originalDecisions = structuredClone(state.clubDecisions);

    migrateScoutingCases(state);

    expect(state.scoutingCases["case-1"]).toMatchObject({
      activeReportId: "report-s1w16-r3", status: "reported", lastUpdatedWeek: 16, lastUpdatedSeason: 1,
      reportIds: ["report-s1w11-r2", "report-s1w16-r3"],
      placementReportIds: ["placement-old"], deliveryIds: ["delivery_placement_placement-old"],
    });
    expect(state.reports).toEqual(originalReports);
    expect(state.reportDeliveries).toEqual(originalDeliveries);
    expect(state.clubDecisions).toEqual(originalDecisions);
    expect(state.placementReports["placement-old"].reportId).toBe("report-s1w11-r2");
    const firstHydration = JSON.stringify(state);
    migrateScoutingCases(state);
    expect(JSON.stringify(state)).toBe(firstHydration);
  });

  it("preserves a later private pass when an older delivery is linked again", () => {
    const state = stateWithOlderDeliveredReport("pass");
    migrateScoutingCases(state);
    expect(state.scoutingCases["case-1"]).toMatchObject({ activeReportId: "report-s1w16-r3", status: "closed" });
    const replayed = recordDirectPlacementDelivery({
      scoutingCases: state.scoutingCases, reportDeliveries: state.reportDeliveries,
      report: state.reports["report-s1w11-r2"], placementReport: state.placementReports["placement-old"],
    });
    expect(replayed.scoutingCases["case-1"]).toEqual(state.scoutingCases["case-1"]);
    expect(replayed.reportDeliveries).toEqual(state.reportDeliveries);
  });

  it("reconstructs a legacy case from authored chronology and numeric same-week revisions", () => {
    const latest = report({ id: "a-r10", revision: 10, submittedSeason: 2, submittedWeek: 1 });
    const earlierRevision = report({ id: "z-r2", revision: 2, submittedSeason: 2, submittedWeek: 1 });
    const previousSeason = report({ id: "previous-season", revision: 20, submittedSeason: 1, submittedWeek: 46 });
    const state = {
      reports: { [latest.id]: latest, [earlierRevision.id]: earlierRevision, [previousSeason.id]: previousSeason },
      scoutingCases: {}, reportDeliveries: {}, clubDecisions: {}, placementReports: {}, alumniRecords: [],
    } as unknown as GameState;
    migrateScoutingCases(state);
    expect(state.scoutingCases["case-1"]).toMatchObject({ activeReportId: latest.id, lastUpdatedWeek: 1, lastUpdatedSeason: 2 });
  });

  it("links an older report sale without replacing the current authored judgment", () => {
    const state = stateWithOlderDeliveredReport("pass");
    const sold = recordMarketplaceDelivery({
      scoutingCases: state.scoutingCases, reportDeliveries: state.reportDeliveries,
      report: state.reports["report-s1w11-r2"],
      listing: { id: "listing-old" } as Parameters<typeof recordMarketplaceDelivery>[0]["listing"],
      bid: { id: "bid-old", clubId: "buyer-1", amount: 100 } as Parameters<typeof recordMarketplaceDelivery>[0]["bid"],
      week: 12, season: 1,
    });
    expect(sold.scoutingCases["case-1"]).toMatchObject({ activeReportId: "report-s1w16-r3", status: "closed", lastUpdatedWeek: 16 });
    expect(sold.delivery).toMatchObject({ reportId: "report-s1w11-r2", price: 100 });
    expect(sold.scoutingCases["case-1"].deliveryIds).toContain(sold.delivery.id);
  });

  it("records a missing historical trial decision without reopening or backdating a later pass", () => {
    const state = stateWithOlderDeliveredReport("pass");
    state.clubDecisions = {};
    state.placementReports["placement-old"] = {
      ...state.placementReports["placement-old"], clubResponse: "trial", decisionId: undefined,
    };
    state.reportDeliveries["delivery_placement_placement-old"] = {
      ...state.reportDeliveries["delivery_placement_placement-old"], status: "awaitingDecision", decisionId: undefined,
    };
    migrateScoutingCases(state);
    expect(state.scoutingCases["case-1"]).toMatchObject({
      activeReportId: "report-s1w16-r3", status: "closed", lastUpdatedWeek: 16, lastUpdatedSeason: 1,
    });
    expect(Object.values(state.clubDecisions)).toMatchObject([{ reportId: "report-s1w11-r2", outcome: "trial" }]);
    const firstHydration = JSON.stringify(state);
    migrateScoutingCases(state);
    expect(JSON.stringify(state)).toBe(firstHydration);
  });

  it("backfills a legacy placement only from eligible authored history at its date", () => {
    const state = stateWithOlderDeliveredReport("pass");
    const older = state.reports["report-s1w11-r2"];
    const higherRevision = { ...older, id: "a-r10", revision: 10 };
    state.reports[higherRevision.id] = higherRevision;
    state.placementReports["placement-old"] = { ...oldPlacement(), reportId: undefined };
    state.reportDeliveries = {};
    state.clubDecisions = {};
    migrateScoutingCases(state);
    expect(state.placementReports["placement-old"].reportId).toBe(higherRevision.id);
    expect(state.scoutingCases["case-1"]).toMatchObject({ activeReportId: "report-s1w16-r3", status: "closed" });
  });

  it("keeps legacy provenance explicitly unlinked when only a future private pass exists", () => {
    const state = stateWithOlderDeliveredReport("pass");
    delete state.reports["report-s1w11-r2"];
    state.placementReports["placement-old"] = { ...oldPlacement(), reportId: undefined };
    state.reportDeliveries = {};
    state.clubDecisions = {};
    migrateScoutingCases(state);
    expect(state.placementReports["placement-old"].reportId).toBeUndefined();
    const delivery = state.reportDeliveries[state.placementReports["placement-old"].deliveryId!];
    expect(delivery.reportId).toBeUndefined();
    expect(state.scoutingCases["case-1"]).toMatchObject({ activeReportId: "report-s1w16-r3", status: "closed" });
  });

  it.each(["pending", "trial"] as const)("links an unlinked %s placement to the same case without reopening a future pass", (clubResponse) => {
    const state = stateWithOlderDeliveredReport("pass");
    delete state.reports["report-s1w11-r2"];
    state.placementReports["placement-old"] = { ...oldPlacement(), caseId: "case-1", clubResponse };
    state.reportDeliveries = {};
    state.clubDecisions = {};
    const authoredBytes = JSON.stringify(state.reports);
    migrateScoutingCases(state);
    const placement = state.placementReports["placement-old"];
    expect(placement.caseId).toBe("case-1");
    expect(placement.reportId).toBeUndefined();
    expect(state.reportDeliveries[placement.deliveryId!].reportId).toBeUndefined();
    expect(state.scoutingCases["case-1"]).toMatchObject({
      activeReportId: "report-s1w16-r3", status: "closed", lastUpdatedWeek: 16,
      placementReportIds: ["placement-old"], deliveryIds: [placement.deliveryId],
    });
    expect(JSON.stringify(state.reports)).toBe(authoredBytes);
    const firstHydration = JSON.stringify(state);
    migrateScoutingCases(state);
    expect(JSON.stringify(state)).toBe(firstHydration);
  });
});
