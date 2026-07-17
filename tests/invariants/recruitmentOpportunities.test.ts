import { describe, expect, it } from "vitest";

import type {
  GameState,
  Player,
  PlayerMovementEvent,
  ReportDelivery,
  ReportListing,
  Scout,
  ScoutReport,
} from "@/engine/core/types";
import { initializeFinances } from "@/engine/finance/expenses";
import {
  calculatePlacementFee,
  checkPlacementFeeEligibility,
  processSellOnClauses,
} from "@/engine/finance/placementFees";
import {
  deriveRecruitmentOpportunities,
  type RecruitmentOpportunityState,
} from "@/engine/recruitment";
import { processWeeklyTransferAccountability } from "@/stores/actions/weeklyTransferAccountability";

const REPORT: ScoutReport = {
  id: "report-r2",
  caseId: "case-player",
  briefId: "brief-left-back",
  revision: 2,
  playerId: "player-1",
  scoutId: "scout-1",
  submittedWeek: 3,
  submittedSeason: 1,
  attributeAssessments: [],
  strengths: ["Recovery pace"],
  weaknesses: ["Limited senior evidence"],
  conviction: "strongRecommend",
  summary: "A high-upside full-back for this pathway.",
  estimatedValue: 500_000,
  qualityScore: 82,
  decisionDeadlineWeek: 8,
  decisionDeadlineSeason: 1,
};

const LISTING: ReportListing = {
  id: "listing-report-r2",
  reportId: REPORT.id,
  caseId: REPORT.caseId,
  price: 1_200,
  isExclusive: true,
  status: "sold",
  buyerClubId: "club-destination",
  listedWeek: 3,
  listedSeason: 1,
  biddingEndsWeek: 5,
  biddingEndsSeason: 1,
  bids: [{
    id: "bid-destination",
    listingId: "listing-report-r2",
    clubId: "club-destination",
    amount: 1_200,
    placedWeek: 4,
    placedSeason: 1,
    expiryWeek: 6,
    expirySeason: 1,
    status: "accepted",
    needMatchScore: 78,
  }],
};

const DELIVERY: ReportDelivery = {
  id: "delivery-destination",
  caseId: "case-player",
  reportId: REPORT.id,
  clubId: "club-destination",
  channel: "marketplaceSale",
  status: "delivered",
  deliveredWeek: 4,
  deliveredSeason: 1,
  listingId: LISTING.id,
  bidId: "bid-destination",
  price: 1_200,
};

const MOVEMENT: PlayerMovementEvent = {
  id: "movement-player-to-destination",
  playerId: REPORT.playerId,
  type: "permanentTransfer",
  fromClubId: "club-source",
  toClubId: "club-destination",
  fee: 2_000_000,
  week: 6,
  season: 1,
};

function opportunityState(input: {
  delivery?: ReportDelivery;
  movement?: PlayerMovementEvent | null;
  report?: ScoutReport;
  listing?: ReportListing;
  currentWeek?: number;
} = {}): RecruitmentOpportunityState {
  const report = input.report ?? REPORT;
  return {
    currentWeek: input.currentWeek ?? 6,
    currentSeason: 1,
    reports: { [report.id]: report },
    scoutingCases: {
      "case-player": {
        id: "case-player",
        playerId: report.playerId,
        scoutId: report.scoutId,
        openedWeek: 2,
        openedSeason: 1,
        lastUpdatedWeek: 4,
        lastUpdatedSeason: 1,
        status: "delivered",
        briefId: "brief-left-back",
        activeReportId: report.id,
        reportIds: [report.id],
        listingIds: [LISTING.id],
        deliveryIds: [DELIVERY.id],
        decisionIds: [],
        placementReportIds: [],
      },
    },
    reportDeliveries: {
      [(input.delivery ?? DELIVERY).id]: input.delivery ?? DELIVERY,
    },
    clubDecisions: {},
    playerMovementHistory: input.movement === null
      ? []
      : [input.movement ?? MOVEMENT],
    finances: { reportListings: [input.listing ?? LISTING] },
  };
}

describe("recruitment opportunity causality", () => {
  it("joins a delivered report revision to its buyer, brief, deadline, and real destination", () => {
    const state = opportunityState();
    const opportunities = deriveRecruitmentOpportunities(state);

    expect(opportunities).toEqual([expect.objectContaining({
      id: `recruitment-opportunity:${DELIVERY.id}`,
      deliveryId: DELIVERY.id,
      reportId: REPORT.id,
      reportRevision: 2,
      playerId: REPORT.playerId,
      briefId: "brief-left-back",
      targetClubId: "club-destination",
      buyerClubId: "club-destination",
      destinationClubId: "club-destination",
      exclusivity: "exclusive",
      deadlineWeek: 8,
      deadlineSeason: 1,
      outcome: "signed",
      transferMovementId: MOVEMENT.id,
      outcomeWeek: 6,
      outcomeSeason: 1,
    })]);
    expect(deriveRecruitmentOpportunities(
      JSON.parse(JSON.stringify(state)) as RecruitmentOpportunityState,
    )).toEqual(opportunities);
  });

  it("does not award causal credit when the report buyer was not the destination", () => {
    const otherDestination = {
      ...MOVEMENT,
      id: "movement-player-to-other",
      toClubId: "club-other",
    };
    const state = opportunityState({ movement: otherDestination });
    const transfer = {
      playerId: REPORT.playerId,
      fromClubId: "club-source",
      toClubId: "club-other",
      fee: 2_000_000,
      week: 6,
      season: 1,
    };

    const opportunity = deriveRecruitmentOpportunities(state)[0];
    expect(opportunity).toMatchObject({
      targetClubId: "club-destination",
      outcome: "delivered",
    });
    expect(opportunity.destinationClubId).toBeUndefined();
    expect(checkPlacementFeeEligibility(state, transfer, "scout-1")).toBeUndefined();
  });

  it("does not turn a post-deadline transfer into causal placement credit", () => {
    const expiredReport = {
      ...REPORT,
      decisionDeadlineWeek: 5,
    };
    const state = opportunityState({ report: expiredReport, currentWeek: 6 });
    const transfer = {
      playerId: REPORT.playerId,
      fromClubId: "club-source",
      toClubId: "club-destination",
      fee: 2_000_000,
      week: 6,
      season: 1,
    };

    const opportunity = deriveRecruitmentOpportunities(state)[0];
    expect(opportunity).toMatchObject({
      outcome: "expired",
    });
    expect(opportunity.destinationClubId).toBeUndefined();
    expect(checkPlacementFeeEligibility(state, transfer, "scout-1")).toBeUndefined();
  });

  it("expires legacy reports without an authored deadline instead of granting immortal causality", () => {
    const legacyReport = {
      ...REPORT,
      decisionDeadlineWeek: undefined,
      decisionDeadlineSeason: undefined,
    };
    const state = opportunityState({
      report: legacyReport,
      movement: null,
      currentWeek: 21,
    });

    expect(deriveRecruitmentOpportunities(state)[0]).toMatchObject({
      outcome: "expired",
      outcomeWeek: 20,
      outcomeSeason: 1,
      deadlineWeek: 20,
      deadlineSeason: 1,
    });
  });

  it("does not match a legacy report to a movement beyond its default action window", () => {
    const legacyReport = {
      ...REPORT,
      decisionDeadlineWeek: undefined,
      decisionDeadlineSeason: undefined,
    };
    const lateMovement = {
      ...MOVEMENT,
      id: "movement-too-late-for-legacy-report",
      week: 25,
    };
    const state = opportunityState({
      report: legacyReport,
      movement: lateMovement,
      currentWeek: 25,
    });

    const opportunity = deriveRecruitmentOpportunities(state)[0];
    expect(opportunity.outcome).toBe("expired");
    expect(opportunity.transferMovementId).toBeUndefined();
  });

  it("projects a direct youth recommendation into a real academy signing", () => {
    const directDelivery: ReportDelivery = {
      ...DELIVERY,
      id: "delivery-direct-academy",
      channel: "directPlacement",
      clubId: "academy-club",
      listingId: undefined,
      bidId: undefined,
      price: undefined,
    };
    const youthSigning: PlayerMovementEvent = {
      ...MOVEMENT,
      id: "movement-youth-signing",
      type: "youthSigning",
      toClubId: "academy-club",
      fee: undefined,
    };
    const state = opportunityState({
      delivery: directDelivery,
      movement: youthSigning,
    });

    const opportunity = deriveRecruitmentOpportunities(state)[0];
    expect(opportunity).toMatchObject({
      deliveryId: directDelivery.id,
      targetClubId: "academy-club",
      destinationClubId: "academy-club",
      exclusivity: "direct",
      outcome: "signed",
      transferMovementId: youthSigning.id,
    });
    expect(opportunity.buyerClubId).toBeUndefined();
  });

  it("keeps predictive tracking while withholding money for an unrelated transfer", () => {
    const state = weeklyState({ includeDestinationDelivery: false });
    const beforeTick = {
      ...state,
      currentWeek: 6,
      playerMovementHistory: [],
    };
    const result = processWeeklyTransferAccountability({
      beforeTick,
      state,
      transfers: [{
        playerId: REPORT.playerId,
        fromClubId: "club-source",
        toClubId: "club-destination",
        fee: 2_000_000,
        week: 6,
        season: 1,
      }],
    });

    expect(result.transferRecords).toHaveLength(1);
    expect(result.transferRecords[0].reportId).toBe(REPORT.id);
    expect(result.finances?.placementFeeRecords).toEqual([]);
    expect(result.finances?.placementFeeRevenue).toBe(0);
  });

  it("pays one auditable fee for a destination-matching delivery and no immediate sell-on", () => {
    const state = weeklyState({ includeDestinationDelivery: true });
    const beforeTick = {
      ...state,
      currentWeek: 6,
      playerMovementHistory: [],
    };
    const transfers = [{
      playerId: REPORT.playerId,
      fromClubId: "club-source",
      toClubId: "club-destination",
      fee: 2_000_000,
      week: 6,
      season: 1,
    }];
    const first = processWeeklyTransferAccountability({ beforeTick, state, transfers });
    const replayed = processWeeklyTransferAccountability({
      beforeTick,
      state: first,
      transfers,
    });

    expect(first.finances?.placementFeeRecords).toHaveLength(1);
    expect(first.finances?.placementFeeRevenue).toBe(calculatePlacementFee(
      2_000_000,
      REPORT,
      state.scout,
      4,
      true,
    ));
    expect(first.finances?.placementFeeRevenue).toBe(3_000);
    expect(first.finances?.sellOnRevenue).toBe(0);
    expect(first.finances?.transactions.filter(
      (transaction) => transaction.referenceId?.endsWith(":placementFee"),
    )).toHaveLength(1);
    expect(first.inbox.filter((message) => message.title === "Placement Fee Earned"))
      .toHaveLength(1);
    expect(replayed.finances).toEqual(first.finances);
    expect(replayed.inbox).toEqual(first.inbox);

    const laterSellOn = processSellOnClauses(first.finances!, [{
      playerId: REPORT.playerId,
      fee: 3_000_000,
      fromClubId: "club-destination",
      toClubId: "club-next",
    }], 12, 1);
    const replayedSellOn = processSellOnClauses(laterSellOn, [{
      playerId: REPORT.playerId,
      fee: 3_000_000,
      fromClubId: "club-destination",
      toClubId: "club-next",
    }], 12, 1);

    expect(laterSellOn.sellOnRevenue).toBeGreaterThan(0);
    expect(laterSellOn.sellOnRevenue).toBeLessThanOrEqual(
      (first.finances?.placementFeeRevenue ?? 0) * 2,
    );
    expect(replayedSellOn).toBe(laterSellOn);
  });

  it("caps elite-transfer success fees at the scout's agency tier", () => {
    const state = weeklyState({ includeDestinationDelivery: true });

    expect(calculatePlacementFee(
      100_000_000,
      REPORT,
      state.scout,
      1,
      true,
    )).toBe(3_000);
  });
});

function weeklyState(input: { includeDestinationDelivery: boolean }): GameState {
  const scout = {
    id: "scout-1",
    careerPath: "independent",
    careerTier: 2,
    reputation: 50,
    salary: 0,
  } as unknown as Scout;
  const player = {
    id: REPORT.playerId,
    firstName: "Alex",
    lastName: "Prospect",
    age: 19,
    currentAbility: 105,
  } as Player;
  const unrelatedDelivery = {
    ...DELIVERY,
    id: "delivery-other-buyer",
    clubId: "club-other",
  };
  const finances = {
    ...initializeFinances(scout, "independent", "normal"),
    reportListings: [
      input.includeDestinationDelivery
        ? LISTING
        : { ...LISTING, buyerClubId: "club-other" },
    ],
  };

  return {
    seed: "causal-recruitment-test",
    currentWeek: 7,
    currentSeason: 1,
    scout,
    reports: { [REPORT.id]: REPORT },
    reportDeliveries: {
      [input.includeDestinationDelivery ? DELIVERY.id : unrelatedDelivery.id]:
        input.includeDestinationDelivery ? DELIVERY : unrelatedDelivery,
    },
    scoutingCases: {},
    clubDecisions: {},
    playerMovementHistory: [MOVEMENT],
    players: { [player.id]: player },
    clubs: {
      "club-destination": { name: "Destination FC", shortName: "DFC" },
    },
    fixtures: {},
    transferRecords: [],
    finances,
    inbox: [],
  } as unknown as GameState;
}
