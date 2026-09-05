import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { collectGameSystemsHealth, summarizeNumbers } from "./gameSystemsHealth";
import type { GameState, Player } from "@/engine/core/types";
import { generatePlayer } from "@/engine/players/generation";
import { RNG } from "@/engine/rng";

function player(id: string, age: number, clubId = "club"): Player {
  return { ...generatePlayer(new RNG(`health-${id}`), {
    position: "CM", ageRange: [age, age], abilityRange: [80, 80],
    nationality: "English", clubId, currentSeason: 6,
  }), id };
}

function state(): GameState {
  const senior = player("senior", 22);
  const youth = player("youth", 16, "");
  const retired = { ...player("retired", 38, ""), dateOfBirth: { year: 1980, month: 1, day: 1 } };
  return {
    currentSeason: 6, currentWeek: 1,
    players: { senior },
    unsignedYouth: { youth: { id: "youth", player: youth, placed: false, retired: false } },
    retiredPlayers: { retired }, retiredPlayerIds: ["retired"],
    clubs: { club: { id: "club", leagueId: "league", playerIds: ["senior"], academyPlayerIds: [], budget: 100_000 } },
    leagues: { league: { id: "league" } }, fixtures: {}, matchRatings: {},
    playerMovementHistory: [
      { id: "transfer", playerId: "senior", type: "permanentTransfer", season: 5, week: 10, fee: 2000 },
      { id: "retirement", playerId: "retired", type: "retirement", season: 4, week: 38 },
    ],
    finances: { balance: -50, transactions: [
      { season: 5, week: 1, amount: 1000, kind: "openingBalance" },
      { season: 5, week: 2, amount: 200, category: "salary" },
      { season: 5, week: 2, amount: -40, category: "operatingCost" },
    ] },
    scout: { careerTier: 2, reputation: 30 },
    transferRecords: [], activeLoans: [],
  } as unknown as GameState;
}

describe("football health snapshots", () => {
  it("reports population shape separately from retained archives and authoritative movement flows", () => {
    const source = state();
    const before = structuredClone(source);
    const health = collectGameSystemsHealth(source, 5);
    expect(health.invariants.violationCount).toBe(0);
    expect(health.populations.activeWorld.byAge).toEqual({ 22: 1 });
    expect(health.populations.availableUnsignedYouth.byAge).toEqual({ 16: 1 });
    expect(health.populations.retainedRetiredArchive.count).toBe(1);
    expect(health.movements.completedSeasonByType).toEqual({ permanentTransfer: 1 });
    expect(health.movements.retainedByType.retirement).toBe(1);
    expect(health.populations.activeWorld.byLeague).toEqual({ league: 1 });
    expect(health.rosters.clubsWithFewerThanElevenSeniors).toBe(1);
    expect(health.finance.completedSeasonIncome).toBe(200);
    expect(health.finance.completedSeasonExpenses).toBe(40);
    expect(health.finance.careerBalance).toBe(-50);
    expect(source).toEqual(before);
  });

  it("retains invalid measurements explicitly and flags real state defects", () => {
    const source = state();
    source.players.senior.currentAbility = Infinity;
    source.players.senior.dateOfBirth.year = 1900;
    source.players.senior.contractExpiry = 2;
    source.clubs.club.academyPlayerIds = ["senior"];
    const health = collectGameSystemsHealth(source, 5);
    expect(health.invariants.violationsByCode).toMatchObject({
      ability: 1, "birthday-year": 1, "expired-owned-contract": 1, "duplicate-roster": 1,
    });
    expect(health.populations.activeWorld.currentAbility.invalidCount).toBe(1);
    expect(health.populations.activeWorld.currentAbility.mean).toBeNull();
  });

  it("does not attribute world signings to the scout or confuse accepted youth pitches with placed alumni", () => {
    const source = state();
    source.scout.id = "scout";
    source.playerMovementHistory!.push({ id: "ai-youth", playerId: "youth", type: "youthSigning", season: 5, week: 20 });
    const worldOnly = collectGameSystemsHealth(source, 5);
    expect(worldOnly.movements.completedSeasonByType.youthSigning).toBe(1);
    expect(worldOnly.scoutingCareer.transferAccountabilityRecords).toBe(0);
    expect(worldOnly.scoutingCareer.youthPlacements).toMatchObject({
      retainedOwnPlacementReports: 0, acceptedOwnYouthCount: 0, retainedAlumni: 0,
    });

    const pitch = {
      id: "pitch", unsignedYouthId: "youth", targetClubId: "club", scoutId: "scout",
      conviction: "recommend" as const, qualityScore: 70, season: 5, week: 10,
      clubResponse: "accepted" as const, placementType: "academyIntake" as const,
    };
    source.placementReports = {
      pitch, rival: { ...pitch, id: "rival", scoutId: "rival" },
      repeat: { ...pitch, id: "repeat", season: 4 },
    };
    expect(collectGameSystemsHealth(source, 5).scoutingCareer.youthPlacements).toMatchObject({
      retainedOwnPlacementReports: 2, ownReportsSubmittedCompletedSeason: 1,
      acceptedOwnYouthCount: 1, retainedAlumni: 0,
    });
    const alumnus = {
      id: "alumnus", playerId: "youth", placedClubId: "club", currentClubId: "club",
      placedWeek: 11, placedSeason: 5, placementReportId: "pitch",
      currentStatus: "academy" as const, milestones: [], careerSnapshots: [], careerUpdates: [],
      seasonStats: [], becameContact: false,
    };
    source.alumniRecords = [alumnus, { ...alumnus, id: "legacy", playerId: "legacy", placementReportId: undefined, placedSeason: 4 }];
    expect(collectGameSystemsHealth(source, 5).scoutingCareer.youthPlacements).toMatchObject({
      retainedAlumni: 2, alumniPlacedCompletedSeason: 1,
      alumniWithOwnAuthoredReportLink: 1, alumniWithoutOwnAuthoredReportLink: 1,
    });
  });

  it("reconciles boundary cash with current-season movements while keeping opening principal out of cash income", () => {
    const source = state();
    source.finances!.transactions.push(
      { season: 6, week: 1, amount: 50, category: "clientRevenue", description: "Boundary report" },
      { season: 6, week: 1, amount: -10, category: "operatingCost", description: "Boundary cost" },
      { season: 6, week: 2, amount: 100, category: "clientRevenue", description: "Future-dated entry" },
    );
    source.finances!.balance = 1200;
    const finance = collectGameSystemsHealth(source, 5).finance;
    expect(finance.completedSeasonIncome).toBe(200);
    expect(finance.completedSeasonExpenses).toBe(40);
    expect(finance.currentSeasonThroughSnapshotCashFlow).toMatchObject({ count: 2, inflows: 50, outflows: 10, net: 40 });
    expect(finance.cashReconciliation).toMatchObject({
      openingPrincipal: 1000, priorSeasonsNetCash: 160, currentSeasonNetCash: 40,
      ledgerBalanceThroughSnapshot: 1200, balanceDifference: 0, transactionsOutsideSnapshotDate: 1,
    });
    source.finances!.balance += 7;
    expect(collectGameSystemsHealth(source, 5).finance.cashReconciliation.balanceDifference).toBe(7);
    source.finances = undefined;
    expect(collectGameSystemsHealth(source, 5).finance.cashReconciliation.ledgerBalanceThroughSnapshot).toBeNull();
  });

  it("counts sale receipts, linked versions and buyers separately from accepted bids, other revenue and placement fees", () => {
    const source = state();
    source.finances!.reportListings = [{
      id: "listing", reportId: "version-1", price: 100, isExclusive: false, status: "active",
      listedWeek: 1, listedSeason: 5, biddingEndsWeek: 4, biddingEndsSeason: 5,
      bids: [
        { id: "accepted", listingId: "listing", clubId: "a", amount: 100, status: "accepted", placedWeek: 1, placedSeason: 5, expiryWeek: 4, expirySeason: 5, needMatchScore: 80 },
        { id: "pending", listingId: "listing", clubId: "pending", amount: 999, status: "pending", placedWeek: 1, placedSeason: 5, expiryWeek: 4, expirySeason: 5, needMatchScore: 80 },
      ],
    }];
    source.finances!.transactions = [
      { season: 5, week: 2, amount: 100, description: "Sold", referenceId: "marketplace:listing:buyer:a", counterpartyId: "a", category: "clientRevenue" },
      { season: 5, week: 2, amount: 150, description: "Sold", referenceId: "marketplace:listing:buyer:b", counterpartyId: "b", category: "clientRevenue" },
      { season: 6, week: 1, amount: 200, description: "Sold", referenceId: "marketplace:archived:buyer:c", counterpartyId: "c", category: "clientRevenue" },
      { season: 5, week: 2, amount: 80, description: "Retainer", referenceId: "retainer:1", category: "clientRevenue" },
      { season: 5, week: 2, amount: 1000, description: "Borrowed", category: "debt" },
      { season: 5, week: 3, amount: -100, description: "Repaid", category: "debt" },
      { season: 5, week: 3, amount: 50, description: "Placement fee", category: "placement" },
    ];
    source.finances!.placementFeeRecords = [{
      id: "fee", playerId: "youth", clubId: "club", transferFee: 5000, earnedFee: 50,
      hasSellOnClause: false, sellOnPercentage: 0, week: 3, season: 5,
    }];
    const finance = collectGameSystemsHealth(source, 5).finance;
    expect(finance.marketplaceSales.retained).toMatchObject({
      receiptCount: 3, uniqueReceipts: 3, cashReceived: 450, uniqueLinkedReportVersions: 1,
      uniqueBuyerClubs: 3, uniqueLinkedReportBuyerPairs: 2, unlinkedListingReceipts: 1,
    });
    expect(finance.marketplaceSales.completedSeason).toMatchObject({ receiptCount: 2, cashReceived: 250 });
    expect(finance.marketplaceSales.retainedAcceptedBidRecords).toBe(1);
    expect(finance.completedSeasonCashFlowByCategory.debt).toMatchObject({ count: 2, inflows: 1000, outflows: 100, net: 900 });
    expect(finance.completedSeasonCashFlowByCategory.clientRevenue.inflows).toBe(330);
    expect(finance.placementFees).toMatchObject({ retainedRecords: 1, retainedEarnedFeeTotal: 50, completedSeasonEarnedFeeTotal: 50 });
    source.finances!.transactions.push({ ...source.finances!.transactions[0] });
    expect(collectGameSystemsHealth(source, 5).finance.marketplaceSales.retained.duplicateReceiptCount).toBe(1);
  });

  it("does not treat historical snapshots or legacy over-potential players as duplicate living identities", () => {
    const source = state();
    source.players.senior.currentAbility = 150;
    source.players.senior.potentialAbility = 140;
    source.unsignedYouth.youth.placed = true;
    source.unsignedYouth.youth.player = source.players.senior;
    const health = collectGameSystemsHealth(source, 5);
    expect(health.invariants.violationCount).toBe(0);
    expect(health.populations.activeWorld.abovePotentialCount).toBe(1);
    expect(health.populations.availableUnsignedYouth.count).toBe(0);
  });

  it("counts all failures while bounding diagnostic examples", () => {
    const source = state();
    for (let index = 0; index < 150; index += 1) {
      const generated = { ...player(`invalid-${index}`, 18, ""), age: -1 };
      source.players[generated.id] = generated;
    }
    const health = collectGameSystemsHealth(source, 5);
    expect(health.invariants.violationCount).toBeGreaterThanOrEqual(150);
    expect(health.invariants.samples).toHaveLength(100);
    expect(health.invariants.samplesTruncated).toBe(true);
  });

  it("uses null for unavailable numeric distributions, never fake zero means", () => {
    expect(summarizeNumbers([])).toMatchObject({ count: 0, mean: null, median: null });
    expect(summarizeNumbers([1, 2, 3, Number.NaN])).toMatchObject({ count: 4, invalidCount: 1, mean: 2, median: 2 });
  });

  it("allows prior and same-week appearances but rejects play after a dated midseason retirement", () => {
    const source = state();
    source.currentWeek = 12;
    source.playerMovementHistory = [{
      id: "dated-retirement", playerId: "retired", type: "retirement", season: 6, week: 8,
    }];
    for (const [id, week] of [["before", 3], ["same-week", 8], ["after", 9]] as const) {
      source.fixtures[id] = {
        id, season: 6, week, played: true, homeClubId: "club", awayClubId: "opponent", leagueId: "league",
      };
      source.matchRatings[id] = {
        retired: { playerId: "retired", fixtureId: id, minutesPlayed: 90, rating: 6, eventCount: 1, stats: {}, source: "simulated" },
      };
    }
    const health = collectGameSystemsHealth(source, 5);
    expect(health.invariants.violationsByCode["retired-participation"]).toBe(1);
    expect(health.invariants.samples.filter((sample) => sample.code === "retired-participation"))
      .toEqual([{ code: "retired-participation", entityId: "retired", detail: "after" }]);
  });

  it("does not infer a retirement date from archive membership when dated evidence is missing", () => {
    const source = state();
    source.currentWeek = 12;
    source.playerMovementHistory = [];
    source.fixtures.unknown = {
      id: "unknown", season: 6, week: 9, played: true, homeClubId: "club", awayClubId: "opponent", leagueId: "league",
    };
    source.matchRatings.unknown = {
      retired: { playerId: "retired", fixtureId: "unknown", minutesPlayed: 90, rating: 6, eventCount: 1, stats: {}, source: "simulated" },
    };
    expect(collectGameSystemsHealth(source, 5).invariants.violationsByCode["retired-participation"])
      .toBeUndefined();
  });
});

describe("game-systems diagnostics runner", () => {
  it("plans smoke and long runs without launching simulations or writing outputs", () => {
    const plan = JSON.parse(execFileSync(process.execPath, [
      "scripts/run-game-systems-diagnostics.mjs", "--profile=long", "--seasons=30", "--seeds=2",
      "--include-chooser-matrix", "--plan-only",
    ], { encoding: "utf8" }));
    expect(plan.simulationsExecuted).toBe(false);
    expect(plan.effectiveCheckpoints).toEqual([0, 1, 5, 10, 20, 30]);
    expect(plan.chooserProfiles).toEqual(["commercial", "cautious", "aggressive"]);
    expect(plan.persistence).toContain("mocked");
    expect(plan.source.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    const smoke = JSON.parse(execFileSync(process.execPath, [
      "scripts/run-game-systems-diagnostics.mjs", "--plan-only",
    ], { encoding: "utf8" }));
    expect(smoke.seasonCount).toBe(1);
    expect(smoke.seedCount).toBe(1);
    expect(smoke.effectiveCheckpoints).toEqual([0, 1]);
  });

  it("rejects malformed counts before invoking the canonical soak", () => {
    expect(() => execFileSync(process.execPath, [
      "scripts/run-game-systems-diagnostics.mjs", "--seasons=twenty", "--plan-only",
    ], { encoding: "utf8", stdio: "pipe" })).toThrow();
  });
});
