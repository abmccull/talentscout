import { describe, expect, it } from "vitest";

import type {
  ClubDecision,
  PlayerMovementEvent,
  ReportDelivery,
  ReportListing,
  ScoutReport,
  ScoutingCase,
  TransferRecord,
} from "@/engine/core/types";
import { buildReportOpportunityHistory } from "@/components/game/reportHistoryOpportunityModel";

const REPORT_V1: ScoutReport = {
  id: "report-v1",
  caseId: "case-1",
  briefId: "brief-1",
  revision: 1,
  playerId: "player-1",
  scoutId: "scout-1",
  submittedWeek: 2,
  submittedSeason: 1,
  attributeAssessments: [],
  strengths: ["Timing"],
  weaknesses: ["Frame"],
  conviction: "recommend",
  summary: "Initial note.",
  estimatedValue: 350_000,
  qualityScore: 68,
  decisionDeadlineWeek: 5,
  decisionDeadlineSeason: 1,
};

const REPORT_V2: ScoutReport = {
  ...REPORT_V1,
  id: "report-v2",
  revision: 2,
  submittedWeek: 3,
  summary: "Refined after a second live look.",
  conviction: "strongRecommend",
  qualityScore: 81,
  decisionDeadlineWeek: 8,
};

const CASE: ScoutingCase = {
  id: "case-1",
  playerId: "player-1",
  scoutId: "scout-1",
  openedWeek: 2,
  openedSeason: 1,
  lastUpdatedWeek: 4,
  lastUpdatedSeason: 1,
  status: "delivered",
  briefId: "brief-1",
  activeReportId: REPORT_V2.id,
  reportIds: [REPORT_V1.id, REPORT_V2.id],
  listingIds: ["listing-v2"],
  deliveryIds: ["delivery-v1", "delivery-v2"],
  decisionIds: ["decision-v1"],
  placementReportIds: [],
};

const DELIVERY_V1: ReportDelivery = {
  id: "delivery-v1",
  caseId: CASE.id,
  reportId: REPORT_V1.id,
  clubId: "club-alpha",
  channel: "directPlacement",
  status: "resolved",
  deliveredWeek: 2,
  deliveredSeason: 1,
  decisionId: "decision-v1",
  resolvedWeek: 3,
  resolvedSeason: 1,
};

const DELIVERY_V2: ReportDelivery = {
  id: "delivery-v2",
  caseId: CASE.id,
  reportId: REPORT_V2.id,
  clubId: "club-beta",
  channel: "marketplaceSale",
  status: "delivered",
  deliveredWeek: 4,
  deliveredSeason: 1,
  listingId: "listing-v2",
  bidId: "bid-v2",
  price: 1_100,
};

const DECISION_V1: ClubDecision = {
  id: "decision-v1",
  caseId: CASE.id,
  deliveryId: DELIVERY_V1.id,
  reportId: REPORT_V1.id,
  clubId: "club-alpha",
  outcome: "rejected",
  decidedWeek: 3,
  decidedSeason: 1,
  reasons: ["Board prioritized another position."],
};

const LISTING_V2: ReportListing = {
  id: "listing-v2",
  reportId: REPORT_V2.id,
  caseId: CASE.id,
  price: 1_100,
  isExclusive: true,
  status: "sold",
  buyerClubId: "club-beta",
  listedWeek: 3,
  listedSeason: 1,
  biddingEndsWeek: 4,
  biddingEndsSeason: 1,
  bids: [{
    id: "bid-v2",
    listingId: "listing-v2",
    clubId: "club-beta",
    amount: 1_100,
    placedWeek: 4,
    placedSeason: 1,
    expiryWeek: 5,
    expirySeason: 1,
    status: "accepted",
    needMatchScore: 77,
  }],
};

const CAUSAL_MOVEMENT: PlayerMovementEvent = {
  id: "movement-beta",
  playerId: "player-1",
  type: "permanentTransfer",
  fromClubId: "club-source",
  toClubId: "club-beta",
  fee: 2_500_000,
  week: 6,
  season: 1,
};

function createTransferRecord(input: Partial<TransferRecord> = {}): TransferRecord {
  return {
    id: "transfer-record-1",
    playerId: "player-1",
    scoutId: "scout-1",
    fromClubId: "club-source",
    toClubId: "club-beta",
    fee: 2_500_000,
    transferWeek: 6,
    transferSeason: 1,
    scoutConviction: "strongRecommend",
    reportId: REPORT_V2.id,
    caAtTransfer: 104,
    seasonsSinceTransfer: 0,
    accountabilityApplied: false,
    ...input,
  };
}

function createState(input: {
  currentWeek?: number;
  currentSeason?: number;
  movementHistory?: PlayerMovementEvent[];
  transferRecords?: TransferRecord[];
  clubDecisions?: Record<string, ClubDecision>;
  reports?: Record<string, ScoutReport>;
  reportDeliveries?: Record<string, ReportDelivery>;
} = {}) {
  return {
    currentWeek: input.currentWeek ?? 6,
    currentSeason: input.currentSeason ?? 1,
    reports: input.reports ?? {
      [REPORT_V1.id]: REPORT_V1,
      [REPORT_V2.id]: REPORT_V2,
    },
    scoutingCases: { [CASE.id]: CASE },
    reportDeliveries: input.reportDeliveries ?? {
      [DELIVERY_V1.id]: DELIVERY_V1,
      [DELIVERY_V2.id]: DELIVERY_V2,
    },
    clubDecisions: input.clubDecisions ?? { [DECISION_V1.id]: DECISION_V1 },
    playerMovementHistory: input.movementHistory ?? [CAUSAL_MOVEMENT],
    finances: { reportListings: [LISTING_V2] },
    transferRecords: input.transferRecords ?? [],
    clubs: {
      "club-alpha": { name: "Alpha FC" },
      "club-beta": { name: "Beta United" },
      "club-gamma": { name: "Gamma Town" },
    },
  };
}

describe("reportHistoryOpportunityModel", () => {
  it("shows case-level history across revisions and marks a destination-matching signing as causal", () => {
    const summary = buildReportOpportunityHistory(createState(), REPORT_V2);

    expect(summary.convertedCount).toBe(1);
    expect(summary.missedCount).toBe(1);
    expect(summary.items).toHaveLength(2);
    expect(summary.items[0]).toMatchObject({
      targetClubName: "Beta United",
      reportRevision: 2,
      isSelectedRevision: true,
      status: "causalSigning",
      statusLabel: "Causal signing",
      buyerClubName: "Beta United",
      exclusivityLabel: "Exclusive",
    });
    expect(summary.items[1]).toMatchObject({
      targetClubName: "Alpha FC",
      reportRevision: 1,
      status: "rejected",
      statusLabel: "Rejected",
      isSelectedRevision: false,
    });
  });

  it("shows predictive-only movement when the player moved but not through the delivered destination", () => {
    const unrelatedRecord = createTransferRecord({
      id: "transfer-record-other",
      toClubId: "club-gamma",
      outcomeReason: "movedOn",
    });
    const summary = buildReportOpportunityHistory(createState({
      movementHistory: [],
      transferRecords: [unrelatedRecord],
    }), REPORT_V2);

    expect(summary.convertedCount).toBe(0);
    expect(summary.missedCount).toBe(2);
    expect(summary.items[0]).toMatchObject({
      status: "predictiveOnlyMovement",
      statusLabel: "Predictive only",
      transferDetail: "Moved to Gamma Town on S1 W6 without matching the delivered destination.",
    });
  });

  it("distinguishes an accepted decision from a completed signing", () => {
    const acceptedDecision: ClubDecision = {
      id: "decision-v2",
      caseId: CASE.id,
      deliveryId: DELIVERY_V2.id,
      reportId: REPORT_V2.id,
      clubId: "club-beta",
      outcome: "accepted",
      decidedWeek: 5,
      decidedSeason: 1,
      reasons: ["Profile matched the pathway and price band."],
    };
    const acceptedDelivery: ReportDelivery = {
      ...DELIVERY_V2,
      decisionId: acceptedDecision.id,
      status: "resolved",
      resolvedWeek: 5,
      resolvedSeason: 1,
    };
    const summary = buildReportOpportunityHistory(createState({
      currentWeek: 5,
      movementHistory: [],
      clubDecisions: {
        [DECISION_V1.id]: DECISION_V1,
        [acceptedDecision.id]: acceptedDecision,
      },
      reportDeliveries: {
        [DELIVERY_V1.id]: DELIVERY_V1,
        [acceptedDelivery.id]: acceptedDelivery,
      },
    }), REPORT_V2);

    expect(summary.liveCount).toBe(1);
    expect(summary.items[0]).toMatchObject({
      status: "decisionAccepted",
      statusLabel: "Accepted",
      reportOutcomeLabel: "Accepted",
    });
  });
});
