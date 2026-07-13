import { describe, expect, it } from "vitest";
import type {
  GameState,
  PlacementReport,
  ScoutReport,
} from "@/engine/core/types";
import {
  ensureScoutingCaseForReport,
  isGameDateDue,
  migrateScoutingCases,
  recordDirectPlacementDelivery,
  resolveClubDecision,
} from "@/engine/reports/scoutingCases";

function report(overrides: Partial<ScoutReport> = {}): ScoutReport {
  return {
    id: "report-player-1-s1w38",
    playerId: "player-1",
    scoutId: "scout-1",
    submittedWeek: 38,
    submittedSeason: 1,
    attributeAssessments: [],
    strengths: ["Composure"],
    weaknesses: ["Strength"],
    conviction: "recommend",
    summary: "A preserved opinion.",
    estimatedValue: 100_000,
    qualityScore: 72,
    ...overrides,
  };
}

function placement(overrides: Partial<PlacementReport> = {}): PlacementReport {
  return {
    id: "placement-1",
    unsignedYouthId: "youth-1",
    targetClubId: "club-1",
    scoutId: "scout-1",
    conviction: "recommend",
    clubResponse: "pending",
    qualityScore: 72,
    week: 38,
    season: 1,
    ...overrides,
  };
}

describe("scouting case causality", () => {
  it("persists a direct pitch and prevents a same-tick club decision", () => {
    const authored = report();
    const linked = ensureScoutingCaseForReport({}, authored);
    const delivered = recordDirectPlacementDelivery({
      scoutingCases: linked.scoutingCases,
      reportDeliveries: {},
      report: linked.report,
      placementReport: placement(),
    });

    expect(delivered.placementReport).toMatchObject({
      caseId: linked.scoutingCase.id,
      reportId: authored.id,
      deliveryId: delivered.delivery.id,
      responseDueWeek: 1,
      responseDueSeason: 2,
    });
    expect(isGameDateDue(38, 1, 1, 2)).toBe(false);
    expect(isGameDateDue(1, 2, 1, 2)).toBe(true);

    const resolved = resolveClubDecision({
      scoutingCases: delivered.scoutingCases,
      reportDeliveries: delivered.reportDeliveries,
      clubDecisions: {},
      deliveryId: delivered.delivery.id,
      outcome: "accepted",
      week: 1,
      season: 2,
    });
    const replayed = resolveClubDecision({
      scoutingCases: resolved.scoutingCases,
      reportDeliveries: resolved.reportDeliveries,
      clubDecisions: resolved.clubDecisions,
      deliveryId: delivered.delivery.id,
      outcome: "rejected",
      week: 2,
      season: 2,
    });

    expect(Object.values(replayed.clubDecisions)).toHaveLength(1);
    expect(replayed.decision?.outcome).toBe("accepted");
    expect(replayed.reportDeliveries[delivered.delivery.id].status).toBe("resolved");
    expect(replayed.scoutingCases[linked.scoutingCase.id].status).toBe("placed");
  });

  it("migrates reports, sales, legacy placement, and alumni into one case", () => {
    const authored = report({ submittedWeek: 10 });
    const state = {
      reports: { [authored.id]: authored },
      scoutingCases: {},
      reportDeliveries: {},
      clubDecisions: {},
      finances: {
        reportListings: [{
          id: "listing-1",
          reportId: authored.id,
          price: 500,
          isExclusive: false,
          status: "active",
          listedWeek: 11,
          listedSeason: 1,
          bids: [{
            id: "bid-1",
            listingId: "listing-1",
            clubId: "club-market",
            amount: 600,
            placedWeek: 12,
            placedSeason: 1,
            expiryWeek: 14,
            expirySeason: 1,
            status: "accepted",
            needMatchScore: 80,
          }],
          biddingEndsWeek: 13,
          biddingEndsSeason: 1,
        }],
      },
      unsignedYouth: {
        "youth-1": { id: "youth-1", player: { id: "player-1" } },
      },
      placementReports: {
        "placement-1": placement({
          reportId: authored.id,
          clubResponse: "accepted",
          week: 15,
        }),
      },
      alumniRecords: [{
        id: "alumni-1",
        playerId: "player-1",
        placedClubId: "club-1",
        currentClubId: "club-1",
        milestones: [],
        careerSnapshots: [],
        placedWeek: 16,
        placedSeason: 1,
        careerUpdates: [],
        currentStatus: "academy",
        seasonStats: [],
        becameContact: false,
      }],
    } as unknown as GameState;

    migrateScoutingCases(state);

    const migratedReport = state.reports[authored.id];
    const migratedPlacement = state.placementReports["placement-1"];
    const migratedAlumni = state.alumniRecords[0];
    const caseRecord = state.scoutingCases[migratedReport.caseId!];

    expect(migratedReport.caseId).toBeDefined();
    expect(state.finances!.reportListings[0].caseId).toBe(migratedReport.caseId);
    expect(state.finances!.reportListings[0].deliveryIds).toHaveLength(1);
    expect(migratedPlacement.caseId).toBe(migratedReport.caseId);
    expect(migratedPlacement.reportId).toBe(authored.id);
    expect(migratedPlacement.decisionId).toBeDefined();
    expect(migratedAlumni).toMatchObject({
      caseId: migratedReport.caseId,
      placementReportId: migratedPlacement.id,
      originatingReportId: authored.id,
    });
    expect(caseRecord).toMatchObject({
      status: "placed",
      alumniRecordId: migratedAlumni.id,
    });
    expect(Object.values(state.reportDeliveries)).toHaveLength(2);
    expect(Object.values(state.clubDecisions)).toHaveLength(1);

    const migratedSnapshot = JSON.stringify({
      reports: state.reports,
      listings: state.finances!.reportListings,
      placements: state.placementReports,
      alumni: state.alumniRecords,
      cases: state.scoutingCases,
      deliveries: state.reportDeliveries,
      decisions: state.clubDecisions,
    });
    migrateScoutingCases(state);
    expect(JSON.stringify({
      reports: state.reports,
      listings: state.finances!.reportListings,
      placements: state.placementReports,
      alumni: state.alumniRecords,
      cases: state.scoutingCases,
      deliveries: state.reportDeliveries,
      decisions: state.clubDecisions,
    })).toBe(migratedSnapshot);
  });
});
