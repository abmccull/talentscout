import { describe, expect, it } from "vitest";

import type {
  ClubDecision,
  GameState,
  Player,
  ReportDelivery,
  ReportListing,
  ScoutReport,
} from "@/engine/core/types";
import { selectOpportunityDrivenTransfers } from "@/engine/core/gameLoop";
import { createRNG } from "@/engine/rng";

const REPORT: ScoutReport = {
  id: "report-pro-1",
  caseId: "case-pro-1",
  revision: 2,
  playerId: "player-1",
  scoutId: "scout-1",
  submittedWeek: 3,
  submittedSeason: 1,
  attributeAssessments: [],
  strengths: ["Progressive passing"],
  weaknesses: ["Needs a stronger frame"],
  conviction: "strongRecommend",
  summary: "Ready for a progressive possession side.",
  estimatedValue: 2_000_000,
  qualityScore: 84,
  decisionDeadlineWeek: 10,
  decisionDeadlineSeason: 1,
};

const LISTING: ReportListing = {
  id: "listing-pro-1",
  reportId: REPORT.id,
  caseId: REPORT.caseId!,
  price: 1_000,
  isExclusive: true,
  status: "sold",
  buyerClubId: "club-target",
  listedWeek: 3,
  listedSeason: 1,
  biddingEndsWeek: 4,
  biddingEndsSeason: 1,
  bids: [{
    id: "bid-pro-1",
    listingId: "listing-pro-1",
    clubId: "club-target",
    amount: 1_000,
    placedWeek: 4,
    placedSeason: 1,
    expiryWeek: 6,
    expirySeason: 1,
    status: "accepted",
    needMatchScore: 79,
  }],
};

const DELIVERY: ReportDelivery = {
  id: "delivery-pro-1",
  caseId: REPORT.caseId!,
  reportId: REPORT.id,
  clubId: "club-target",
  channel: "marketplaceSale",
  status: "delivered",
  deliveredWeek: 4,
  deliveredSeason: 1,
  listingId: LISTING.id,
  bidId: "bid-pro-1",
  price: 1_000,
};

function createState(overrides: {
  report?: ScoutReport;
  delivery?: ReportDelivery;
  decision?: ClubDecision;
} = {}): GameState {
  const report = overrides.report ?? REPORT;
  const delivery = overrides.delivery ?? DELIVERY;
  const player = {
    id: "player-1",
    firstName: "Alex",
    lastName: "Serrano",
    age: 22,
    position: "CM",
    clubId: "club-source",
    contractClubId: "club-source",
    contractExpiry: 3,
    currentAbility: 118,
    potentialAbility: 134,
    marketValue: 2_200_000,
    wage: 8_000,
    morale: 7,
    form: 6.8,
    attributes: {} as Player["attributes"],
    injuryHistory: { injuries: [], totalWeeksInjured: 0, recurringInjuries: [] },
  } as unknown as Player;

  return {
    seed: "opportunity-driven-transfer-test",
    currentWeek: 6,
    currentSeason: 1,
    scout: { id: "scout-1" },
    players: { [player.id]: player },
    clubs: {
      "club-source": {
        id: "club-source",
        name: "Source FC",
        shortName: "SFC",
        reputation: 58,
        scoutingPhilosophy: "marketSmart",
        youthAcademyRating: 52,
        budget: 8_000_000,
        leagueId: "league-source",
        managerId: "manager-source",
        playerIds: [player.id],
        academyPlayerIds: [],
      },
      "club-target": {
        id: "club-target",
        name: "Target FC",
        shortName: "TFC",
        reputation: 63,
        scoutingPhilosophy: "marketSmart",
        youthAcademyRating: 66,
        budget: 10_000_000,
        leagueId: "league-target",
        managerId: "manager-target",
        playerIds: [],
        academyPlayerIds: [],
      },
      "club-other": {
        id: "club-other",
        name: "Other FC",
        shortName: "OFC",
        reputation: 63,
        scoutingPhilosophy: "marketSmart",
        youthAcademyRating: 61,
        budget: 10_000_000,
        leagueId: "league-target",
        managerId: "manager-other",
        playerIds: [],
        academyPlayerIds: [],
      },
    },
    leagues: {
      "league-source": {
        id: "league-source",
        name: "League Source",
        country: "spain",
        level: 1,
        reputation: 60,
        clubIds: ["club-source"],
        fixtures: [],
        season: 1,
      },
      "league-target": {
        id: "league-target",
        name: "League Target",
        country: "england",
        level: 1,
        reputation: 68,
        clubIds: ["club-target", "club-other"],
        fixtures: [],
        season: 1,
      },
    },
    fixtures: {},
    managerProfiles: {
      "club-source": { reportInfluence: 0.55 },
      "club-target": { reportInfluence: 0.63 },
      "club-other": { reportInfluence: 0.52 },
    },
    reports: { [report.id]: report },
    scoutingCases: {
      [report.caseId!]: {
        id: report.caseId!,
        playerId: report.playerId,
        scoutId: report.scoutId,
        openedWeek: 2,
        openedSeason: 1,
        lastUpdatedWeek: 4,
        lastUpdatedSeason: 1,
        status: "delivered",
        reportIds: [report.id],
        listingIds: [LISTING.id],
        deliveryIds: [delivery.id],
        decisionIds: overrides.decision ? [overrides.decision.id] : [],
        placementReportIds: [],
      },
    },
    reportDeliveries: { [delivery.id]: delivery },
    clubDecisions: overrides.decision ? { [overrides.decision.id]: overrides.decision } : {},
    playerMovementHistory: [],
    freeAgentPool: {
      agents: [],
      totalReleasedThisSeason: 0,
      totalSignedThisSeason: 0,
      totalRetiredThisSeason: 0,
      lastRefreshSeason: 1,
    },
    activeLoans: [],
    loanHistory: [],
    retiredPlayers: {},
    retiredPlayerIds: [],
    finances: { reportListings: [LISTING] },
  } as unknown as GameState;
}

describe("opportunity-driven transfers", () => {
  it("prefers a valid delivered opportunity for the receiving club", () => {
    const actingSeed = Array.from({ length: 100 }, (_, index) => `opportunity-valid-${index}`)
      .find((seed) => selectOpportunityDrivenTransfers(
        createState(),
        createRNG(seed),
      ).length === 1);
    expect(actingSeed).toBeDefined();
    const transfers = selectOpportunityDrivenTransfers(
      createState(),
      createRNG(actingSeed!),
    );

    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toMatchObject({
      playerId: "player-1",
      fromClubId: "club-source",
      toClubId: "club-target",
      week: 6,
      season: 1,
    });
  });

  it("ignores expired opportunities after the deadline passes", () => {
    const transfers = selectOpportunityDrivenTransfers(
      createState({
        report: {
          ...REPORT,
          decisionDeadlineWeek: 5,
        },
      }),
      createRNG("opportunity-expired"),
    );

    expect(transfers).toEqual([]);
  });

  it("ignores rejected club decisions", () => {
    const decision: ClubDecision = {
      id: "decision-rejected",
      caseId: REPORT.caseId!,
      deliveryId: DELIVERY.id,
      reportId: REPORT.id,
      clubId: "club-target",
      outcome: "rejected",
      decidedWeek: 5,
      decidedSeason: 1,
      reasons: ["Budget redirected elsewhere."],
    };

    const transfers = selectOpportunityDrivenTransfers(
      createState({ decision }),
      createRNG("opportunity-rejected"),
    );

    expect(transfers).toEqual([]);
  });

  it("keeps an accepted club decision actionable until a real movement resolves it", () => {
    const decision: ClubDecision = {
      id: "decision-accepted",
      caseId: REPORT.caseId!,
      deliveryId: DELIVERY.id,
      reportId: REPORT.id,
      clubId: "club-target",
      outcome: "accepted",
      decidedWeek: 5,
      decidedSeason: 1,
      reasons: ["The recruitment group approved the target."],
    };
    const acted = Array.from({ length: 100 }, (_, index) =>
      selectOpportunityDrivenTransfers(
        createState({ decision }),
        createRNG(`opportunity-accepted-${index}`),
      )
    ).some((transfers) => transfers.length === 1);

    expect(acted).toBe(true);
  });

  it("never redirects the player to a club that did not receive the report", () => {
    const transfers = Array.from({ length: 100 }, (_, index) =>
      selectOpportunityDrivenTransfers(
        createState(),
        createRNG(`opportunity-wrong-club-${index}`),
      )
    ).flat();

    expect(transfers.length).toBeGreaterThan(0);
    expect(new Set(transfers.map((transfer) => transfer.toClubId))).toEqual(
      new Set(["club-target"]),
    );
    expect(transfers.some((transfer) => transfer.toClubId === "club-other")).toBe(false);
  });

  it("lets the same opportunity diverge across world seeds without rerolling a replay", () => {
    const results = Array.from({ length: 100 }, (_, index) => {
      const seed = `opportunity-variance-${index}`;
      return {
        seed,
        transfers: selectOpportunityDrivenTransfers(createState(), createRNG(seed)),
      };
    });
    expect(results.some((result) => result.transfers.length === 0)).toBe(true);
    expect(results.some((result) => result.transfers.length === 1)).toBe(true);

    const sample = results.find((result) => result.transfers.length === 1)!;
    expect(selectOpportunityDrivenTransfers(createState(), createRNG(sample.seed)))
      .toEqual(sample.transfers);
  });
});
