import { describe, expect, it } from "vitest";
import type {
  ClubDecision,
  GameState,
  ReportDelivery,
  ReportListing,
  ScoutReport,
  ScoutingCase,
} from "@/engine/core/types";
import { buildReportWorkspaceViewModel } from "@/components/game/reports/reportWorkspaceModel";

function report(id: string, playerId: string, overrides: Partial<ScoutReport> = {}): ScoutReport {
  return {
    id,
    playerId,
    scoutId: "scout-1",
    submittedWeek: 4,
    submittedSeason: 1,
    attributeAssessments: [],
    strengths: ["Sees the picture early."],
    weaknesses: ["Still untested away from home."],
    conviction: "recommend",
    summary: "A professional scouting case with a clear audience.",
    estimatedValue: 500_000,
    qualityScore: 78,
    ...overrides,
  } as ScoutReport;
}

describe("report workspace model", () => {
  it("prioritizes the pending listing artifact and keeps accountability lanes visible", () => {
    const pendingReport = report("report-pending", "player-1", {
      intendedClubId: "club-1",
      recruitmentNeed: "Press-resistant academy midfielder",
      recommendedAction: "inviteForTrial",
      evidenceAssessment: { evidenceIds: ["e-1", "e-2"], confidence: "high" } as never,
      categoryVerdicts: {
        roleFit: {
          verdict: "Fits the club's recruitment need.",
          confidence: "high",
          status: "assessed",
          evidenceIds: ["e-1"],
          acknowledgedUncertainty: "Top-end athletic ceiling still needs another look.",
          hypothesisIds: [],
        },
      },
      riskAssessments: [{
        id: "adaptationMobility",
        label: "Athletic ceiling",
        status: "untested",
        evidenceIds: ["e-2"],
      }],
    });
    const awaitingReport = report("report-awaiting", "player-2", {
      intendedClubId: "club-2",
      decisionDeadlineSeason: 1,
      decisionDeadlineWeek: 7,
    });
    const listings: ReportListing[] = [{
      id: "listing-1",
      reportId: pendingReport.id,
      caseId: "case-1",
      price: 1400,
      isExclusive: true,
      status: "active",
      listedWeek: 4,
      listedSeason: 1,
      biddingEndsWeek: 5,
      biddingEndsSeason: 1,
      bids: [],
    }];
    const deliveries: Record<string, ReportDelivery> = {
      "delivery-1": {
        id: "delivery-1",
        caseId: "case-2",
        reportId: awaitingReport.id,
        clubId: "club-2",
        channel: "directPlacement",
        status: "awaitingDecision",
        deliveredWeek: 4,
        deliveredSeason: 1,
        decisionId: "decision-1",
      },
    };
    const decisions: Record<string, ClubDecision> = {
      "decision-1": {
        id: "decision-1",
        caseId: "case-2",
        deliveryId: "delivery-1",
        reportId: awaitingReport.id,
        clubId: "club-2",
        outcome: "followUpRequested",
        decidedWeek: 4,
        decidedSeason: 1,
        followUpDueWeek: 7,
        followUpDueSeason: 1,
      },
    };
    const cases: Record<string, ScoutingCase> = {
      "case-1": {
        id: "case-1",
        playerId: "player-1",
        scoutId: "scout-1",
        openedWeek: 4,
        openedSeason: 1,
        lastUpdatedWeek: 4,
        lastUpdatedSeason: 1,
        status: "reported",
        activeReportId: pendingReport.id,
        reportIds: [pendingReport.id],
        listingIds: ["listing-1"],
        deliveryIds: [],
        decisionIds: [],
        placementReportIds: [],
      },
      "case-2": {
        id: "case-2",
        playerId: "player-2",
        scoutId: "scout-1",
        openedWeek: 3,
        openedSeason: 1,
        lastUpdatedWeek: 4,
        lastUpdatedSeason: 1,
        status: "delivered",
        activeReportId: awaitingReport.id,
        reportIds: [awaitingReport.id],
        listingIds: [],
        deliveryIds: ["delivery-1"],
        decisionIds: ["decision-1"],
        placementReportIds: [],
      },
    };
    const gameState = {
      scout: { id: "scout-1", careerPath: "independent" },
      reports: {
        [pendingReport.id]: pendingReport,
        [awaitingReport.id]: awaitingReport,
      },
      scoutingCases: cases,
      reportDeliveries: deliveries,
      clubDecisions: decisions,
      youthRecruitmentBriefs: {},
      clubs: {
        "club-1": { id: "club-1", name: "Northbridge Academy" },
        "club-2": { id: "club-2", name: "River City FC" },
      },
      players: {
        "player-1": { id: "player-1", firstName: "Milo", lastName: "Hart" },
        "player-2": { id: "player-2", firstName: "Ari", lastName: "Cole" },
      },
      retiredPlayers: {},
      unsignedYouth: {},
      transferRecords: [],
    } as unknown as GameState;

    const viewModel = buildReportWorkspaceViewModel({
      gameState,
      reports: [pendingReport, awaitingReport],
      casesNeedingDelivery: [cases["case-1"]],
      awaitingDecisionDeliveries: [deliveries["delivery-1"]],
      placedCases: [],
      listingByReportId: { [pendingReport.id]: listings[0] },
      comparisonReportIds: [pendingReport.id],
      pendingListingReportId: pendingReport.id,
      staffWorkQueueCount: 2,
      journalEntryCount: 3,
      activeListingsCount: 1,
      pendingBidsCount: 0,
    });

    expect(viewModel.featuredArtifact?.reportId).toBe(pendingReport.id);
    expect(viewModel.featuredArtifact?.followUp).toMatch(/price/i);
    expect(viewModel.comparisonReady).toBe(false);
    expect(viewModel.archiveSummary).toContain("3 reflection entries");
    expect(viewModel.lanes[0].title).toBe("Action required");
    expect(viewModel.lanes[0].items.some((item) => item.action?.kind === "openStaffQueue")).toBe(true);
    expect(viewModel.lanes[1].items[0]?.meta).toContain("S1 W7");
  });
});
