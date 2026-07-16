import { describe, expect, it } from "vitest";

import type { GameState, Player, ReportDelivery, Scout, ScoutReport } from "@/engine/core/types";
import { initializeFinances } from "@/engine/finance/expenses";
import { processWeeklyTransferAccountability } from "@/stores/actions/weeklyTransferAccountability";

const REPORT: ScoutReport = {
  id: "report-signed-later",
  caseId: "case-signed-later",
  playerId: "player-1",
  scoutId: "scout-1",
  submittedWeek: 3,
  submittedSeason: 1,
  attributeAssessments: [],
  strengths: ["Press resistance"],
  weaknesses: ["Aerial duels"],
  conviction: "strongRecommend",
  summary: "Ready for a front-foot possession side.",
  estimatedValue: 2_000_000,
  qualityScore: 82,
};

const DELIVERY: ReportDelivery = {
  id: "delivery-signed-later",
  caseId: "case-signed-later",
  reportId: REPORT.id,
  clubId: "club-target",
  channel: "marketplaceSale",
  status: "delivered",
  deliveredWeek: 4,
  deliveredSeason: 1,
  listingId: "listing-signed-later",
  bidId: "bid-signed-later",
  price: 1_000,
};

function createState(): GameState {
  const scout = {
    id: "scout-1",
    careerPath: "independent",
    careerTier: 2,
    reputation: 50,
    salary: 0,
  } as unknown as Scout;
  const player = {
    id: "player-1",
    firstName: "Nico",
    lastName: "Vale",
    age: 21,
    currentAbility: 116,
    contractClubId: "club-source",
    clubId: "club-source",
  } as Player;

  return {
    seed: "weekly-transfer-accountability-report-state",
    currentWeek: 7,
    currentSeason: 1,
    scout,
    reports: { [REPORT.id]: REPORT },
    reportDeliveries: { [DELIVERY.id]: DELIVERY },
    scoutingCases: {},
    clubDecisions: {},
    playerMovementHistory: [],
    players: { [player.id]: player },
    clubs: {
      "club-target": { name: "Target FC", shortName: "TFC" },
      "club-source": { name: "Source FC", shortName: "SFC" },
    },
    fixtures: {},
    transferRecords: [],
    finances: {
      ...initializeFinances(scout, "independent", "normal"),
      reportListings: [{
        id: "listing-signed-later",
        reportId: REPORT.id,
        caseId: REPORT.caseId!,
        price: 1_000,
        isExclusive: true,
        status: "sold",
        buyerClubId: "club-target",
        listedWeek: 3,
        listedSeason: 1,
        biddingEndsWeek: 5,
        biddingEndsSeason: 1,
        bids: [{
          id: "bid-signed-later",
          listingId: "listing-signed-later",
          clubId: "club-target",
          amount: 1_000,
          placedWeek: 4,
          placedSeason: 1,
          expiryWeek: 6,
          expirySeason: 1,
          status: "accepted",
          needMatchScore: 78,
        }],
      }],
    },
    inbox: [],
  } as unknown as GameState;
}

describe("weekly transfer accountability report state", () => {
  it("marks the originating report signed only after the authoritative transfer applies", () => {
    const beforeTick = createState();
    const afterTick = {
      ...beforeTick,
      playerMovementHistory: [{
        id: "movement-1",
        playerId: "player-1",
        type: "permanentTransfer" as const,
        fromClubId: "club-source",
        toClubId: "club-target",
        fee: 2_000_000,
        week: 6,
        season: 1,
      }],
    };

    const result = processWeeklyTransferAccountability({
      beforeTick,
      state: afterTick,
      transfers: [{
        playerId: "player-1",
        fromClubId: "club-source",
        toClubId: "club-target",
        fee: 2_000_000,
        week: 6,
        season: 1,
      }],
    });

    expect(beforeTick.reports[REPORT.id].clubResponse).toBeUndefined();
    expect(result.reports[REPORT.id].clubResponse).toBe("signed");
  });

  it("keeps an unrelated destination predictive instead of claiming causal signing credit", () => {
    const beforeTick = createState();
    const unrelatedDestination = "club-unrelated";
    const afterTick = {
      ...beforeTick,
      clubs: {
        ...beforeTick.clubs,
        [unrelatedDestination]: {
          ...beforeTick.clubs["club-target"],
          id: unrelatedDestination,
          name: "Unrelated FC",
          shortName: "UFC",
        },
      },
      playerMovementHistory: [{
        id: "movement-unrelated",
        playerId: "player-1",
        type: "permanentTransfer" as const,
        fromClubId: "club-source",
        toClubId: unrelatedDestination,
        fee: 2_000_000,
        week: 6,
        season: 1,
      }],
    };

    const result = processWeeklyTransferAccountability({
      beforeTick,
      state: afterTick,
      transfers: [{
        playerId: "player-1",
        fromClubId: "club-source",
        toClubId: unrelatedDestination,
        fee: 2_000_000,
        week: 6,
        season: 1,
      }],
    });

    expect(result.transferRecords).toHaveLength(1);
    expect(result.reports[REPORT.id].clubResponse).toBeUndefined();
    expect(result.finances?.transactions).toHaveLength(
      beforeTick.finances?.transactions.length ?? 0,
    );
  });
});
