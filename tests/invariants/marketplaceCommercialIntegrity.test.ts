import { describe, expect, it } from "vitest";
import type { Club, GameState, MarketplaceBid, NewGameConfig, ScoutReport } from "@/engine/core/types";
import { createScout } from "@/engine/scout/creation";
import { RNG } from "@/engine/rng";
import { initializeFinances } from "@/engine/finance/expenses";
import {
  acceptBid,
  acceptExclusiveUpgrade,
  getClubScoutingBudget,
  listReport,
  processMarketplaceBids,
  withdrawListing,
} from "@/engine/finance/reportMarketplace";
import { triggerPlacementFee } from "@/engine/finance/placementFees";
import { createFinanceActions } from "@/stores/actions/financeActions";
import type { GameStoreState, GetState, SetState } from "@/stores/actions/types";
import { normalizeClubEconomics } from "@/engine/finance/clubEconomics";

const CONFIG: NewGameConfig = {
  scoutFirstName: "Market",
  scoutLastName: "Ledger",
  scoutAge: 30,
  specialization: "youth",
  difficulty: "normal",
  worldSeed: "marketplace-commercial-integrity",
  startingCountry: "england",
  selectedCountries: ["england"],
  skillAllocations: {
    technicalEye: 2,
    physicalAssessment: 1,
    psychologicalRead: 1,
    tacticalUnderstanding: 1,
    dataLiteracy: 1,
    playerJudgment: 1,
    potentialAssessment: 1,
  },
};

function bid(
  listingId: string,
  id: string,
  clubId: string,
  amount: number,
): MarketplaceBid {
  return {
    id,
    listingId,
    clubId,
    amount,
    placedWeek: 2,
    placedSeason: 1,
    expiryWeek: 4,
    expirySeason: 1,
    status: "pending",
    needMatchScore: 75,
  };
}

describe("marketplace and placement commercial integrity", () => {
  it("rejects unsupported structured reports at the listing action after save restoration", () => {
    const scout = createScout(CONFIG, new RNG("unsupported-listing"));
    const finances = initializeFinances(scout, "independent", "normal");
    for (const claims of [[], [{ support: "withheld" }], [{ support: "stretch" }]]) {
      const state = JSON.parse(JSON.stringify({ scout, finances, currentWeek: 3, currentSeason: 1,
        reports: { report: { id: "report", scoutId: scout.id, playerId: "player",
          evidenceAssessment: { claims } } }, scoutingCases: {},
      }));
      let store = { gameState: state } as GameStoreState;
      const get: GetState = () => store;
      const set: SetState = (partial) => {
        store = { ...store, ...(typeof partial === "function" ? partial(store) : partial) };
      };
      createFinanceActions(get, set).listReportForSale("report", 500, false);
      expect(store.gameState).toBe(state);
      expect(store.gameState?.finances?.reportListings).toEqual([]);
      expect(store.gameState?.scoutingCases).toEqual({});
    }
  });

  it.each([0, 1, 125, 749])("uses the actual remaining procurement balance of %i", (budget) => {
    expect(getClubScoutingBudget({ budget: 1_000_000, scoutingBudget: budget } as Club)).toBe(budget);
  });

  it("blocks a second purchase after exhausting the club budget, including after normalization", () => {
    const scout = createScout(CONFIG, new RNG("budget-scout"));
    const opened = initializeFinances(scout, "independent", "normal");
    const first = listReport(opened, "report-1", 500, false, undefined, 1, 1);
    const both = listReport(first, "report-2", 500, false, undefined, 1, 1);
    const finances = {
      ...both,
      reportListings: both.reportListings.map((listing, index) => ({
        ...listing, bids: [bid(listing.id, `budget-bid-${index}`, "club-1", 500)],
      })),
    };
    const buyer = {
      id: "club-1", name: "Buyer", budget: 1_000_000, scoutingBudget: 500,
      reputation: 60, playerIds: [], academyPlayerIds: [], scoutingPhilosophy: "academyFirst",
    } as unknown as Club;
    const reports = Object.fromEntries(["report-1", "report-2"].map((id) => [id, {
      id, scoutId: scout.id, playerId: "player-1", submittedWeek: 1, submittedSeason: 1,
    } as ScoutReport]));
    let store = {
      gameState: { scout, finances, clubs: { "club-1": buyer }, reports, inbox: [], currentWeek: 2, currentSeason: 1 },
    } as unknown as GameStoreState;
    const get: GetState = () => store;
    const set: SetState = (partial) => {
      store = { ...store, ...(typeof partial === "function" ? partial(store) : partial) };
    };
    const actions = createFinanceActions(get, set);
    actions.acceptMarketplaceBid("budget-bid-0");
    expect(store.gameState?.clubs["club-1"].scoutingBudget).toBe(0);
    expect(store.gameState?.finances?.reportSalesRevenue).toBe(500);
    const loaded = JSON.parse(JSON.stringify(store.gameState)) as GameState;
    loaded.clubs["club-1"] = normalizeClubEconomics(loaded.clubs["club-1"], {});
    store = { ...store, gameState: loaded };
    actions.acceptMarketplaceBid("budget-bid-1");
    expect(store.gameState?.clubs["club-1"].scoutingBudget).toBe(0);
    expect(store.gameState?.finances?.reportSalesRevenue).toBe(500);
    expect(store.gameState?.finances?.reportListings[1].bids[0].status).toBe("pending");
  });

  it("keeps prior report buyers excluded across withdrawal and relisting, while allowing new buyers and versions", () => {
    const scout = createScout(CONFIG, new RNG("relisting-scout"));
    const opened = initializeFinances(scout, "independent", "normal");
    const first = listReport(opened, "report-1", 500, false, undefined, 1, 1);
    const firstId = first.reportListings[0].id;
    const sold = acceptBid({
      ...first, reportListings: [{ ...first.reportListings[0], bids: [bid(firstId, "first-sale", "club-1", 500)] }],
    }, firstId, "first-sale", 2, 1);
    const relisted = listReport(withdrawListing(sold, firstId), "report-1", 500, false, undefined, 2, 1);
    const newId = relisted.reportListings[1].id;
    expect(newId).not.toBe(firstId);
    const clubs = Object.fromEntries(["club-1", "club-2"].map((id) => [id, {
      id, name: id, budget: 1_000_000, scoutingBudget: 10_000, reputation: 60,
      shortName: id, leagueId: "league-1", managerId: `${id}-manager`, youthAcademyRating: 60,
      playerIds: [], scoutingPhilosophy: "academyFirst",
    } satisfies Club]));
    const report = { id: "report-1", playerId: "player-1", qualityScore: 100, conviction: "tablePound" } as ScoutReport;
    const eagerRng = new RNG("relisting-bids");
    eagerRng.chance = () => true;
    const generated = processMarketplaceBids(eagerRng, relisted, clubs, { "report-1": report }, {}, scout, 3, 1);
    const newBids = generated.finances.reportListings[1].bids;
    expect(newBids.some((candidate) => candidate.clubId === "club-1")).toBe(false);
    expect(newBids.some((candidate) => candidate.clubId === "club-2")).toBe(true);

    for (const support of ["withheld", "stretch"] as const) {
      const inconclusive = { ...report, evidenceAssessment: { claims: [{ support }] } } as ScoutReport;
      const noBids = processMarketplaceBids(eagerRng, JSON.parse(JSON.stringify(relisted)), clubs,
        { "report-1": inconclusive }, {}, scout, 3, 1);
      expect(noBids.finances.reportListings[1].bids).toHaveLength(0);
    }
    const evidenced = { ...report, evidenceAssessment: { claims: [{ support: "supported" }] } } as ScoutReport;
    const supportedBids = processMarketplaceBids(eagerRng, relisted, clubs,
      { "report-1": evidenced }, {}, scout, 3, 1);
    expect(supportedBids.finances.reportListings[1].bids.length).toBeGreaterThan(0);

    const staleBuyerBid = { ...bid(newId, "repeat-buyer", "club-1", 800), isExclusiveUpgrade: true };
    const withStaleBid = {
      ...generated.finances,
      reportListings: generated.finances.reportListings.map((listing) => listing.id === newId
        ? { ...listing, bids: [...listing.bids, staleBuyerBid] } : listing),
    };
    expect(acceptBid(withStaleBid, newId, staleBuyerBid.id, 3, 1)).toBe(withStaleBid);
    expect(acceptExclusiveUpgrade(withStaleBid, newId, staleBuyerBid.id, 3, 1)).toBe(withStaleBid);

    const newBuyerBid = newBids.find((candidate) => candidate.clubId === "club-2")!;
    const secondSale = acceptBid(withStaleBid, newId, newBuyerBid.id, 3, 1);
    expect(secondSale.reportSalesRevenue).toBe(500 + newBuyerBid.amount);
    const revised = listReport(secondSale, "report-1-revision-2", 500, false, undefined, 3, 1);
    const revisionListing = revised.reportListings.at(-1)!;
    const revisedBid = bid(revisionListing.id, "revision-buyer", "club-1", 600);
    const withRevisionBid = {
      ...revised,
      reportListings: revised.reportListings.map((listing) => listing.id === revisionListing.id
        ? { ...listing, bids: [revisedBid] } : listing),
    };
    expect(acceptBid(withRevisionBid, revisionListing.id, revisedBid.id, 3, 1).reportSalesRevenue)
      .toBe(secondSale.reportSalesRevenue + 600);
  });

  it("pays each buyer once and connects the first-report welcome bonus", () => {
    const scout = createScout(CONFIG, new RNG("marketplace-scout"));
    const opened = initializeFinances(scout, "independent", "normal");
    const listed = listReport(opened, "report-1", 500, false, undefined, 1, 1);
    const duplicate = listReport(listed, "report-1", 500, false, undefined, 1, 1);
    expect(duplicate).toBe(listed);

    const listingId = listed.reportListings[0].id;
    const firstBid = bid(listingId, "bid-1", "club-1", 500);
    const withBid = {
      ...listed,
      reportListings: [{ ...listed.reportListings[0], bids: [firstBid] }],
    };
    const sold = acceptBid(withBid, listingId, firstBid.id, 2, 1);

    expect(sold.balance - opened.balance).toBe(750);
    expect(sold.reportSalesRevenue).toBe(500);
    expect(sold.bonusRevenue).toBe(250);
    expect(sold.starterBonus.firstReportBonusUsed).toBe(true);
    expect(sold.transactions.filter((transaction) =>
      transaction.referenceId === `marketplace:${listingId}:buyer:club-1`
    )).toHaveLength(1);
    expect(sold.transactions.filter((transaction) =>
      transaction.referenceId?.startsWith("welcome:first-report:")
    )).toHaveLength(1);
    expect(acceptBid(sold, listingId, firstBid.id, 2, 1)).toBe(sold);

    const duplicateBuyerBid = bid(listingId, "bid-2", "club-1", 800);
    const withRepeatBuyer = {
      ...sold,
      reportListings: sold.reportListings.map((listing) =>
        listing.id === listingId
          ? { ...listing, bids: [...listing.bids, duplicateBuyerBid] }
          : listing
      ),
    };
    expect(acceptBid(withRepeatBuyer, listingId, duplicateBuyerBid.id, 3, 1))
      .toBe(withRepeatBuyer);
  });

  it("connects the first-placement welcome bonus without inflating placement revenue", () => {
    const scout = createScout(CONFIG, new RNG("placement-scout"));
    const opened = initializeFinances(scout, "independent", "normal");
    const paid = triggerPlacementFee(
      opened,
      1_000,
      "player-1",
      "club-1",
      50_000,
      0.02,
      5,
      1,
      "placement:player-1:club-1",
    );

    expect(paid.balance - opened.balance).toBe(1_250);
    expect(paid.placementFeeRevenue).toBe(1_000);
    expect(paid.bonusRevenue).toBe(250);
    expect(paid.starterBonus.firstPlacementBonusUsed).toBe(true);
    expect(triggerPlacementFee(
      paid,
      1_000,
      "player-1",
      "club-1",
      50_000,
      0.02,
      5,
      1,
      "placement:player-1:club-1",
    )).toBe(paid);
  });
});


it("keeps new marketplace identities short and unique after reload and counter recovery", () => {
  const scout = createScout(CONFIG, new RNG("compact-listing-identities"));
  const original = initializeFinances(scout, "independent", "normal");
  const longReportId = "report_" + "long-scout-and-player-identity_".repeat(20);
  const listed = listReport(original, longReportId, 500, false, undefined, 3, 2);
  expect(listed.reportListings[0].reportId).toBe(longReportId);
  expect(listed.reportListings[0].id.length).toBeLessThan(40);
  expect(original.reportListings).toHaveLength(0);
  const reloaded = JSON.parse(JSON.stringify(listed)); reloaded.actionSequence = 0;
  const second = listReport(reloaded, "different-report", 500, false, undefined, 3, 2);
  expect(new Set(second.reportListings.map(listing => listing.id)).size).toBe(2);
  expect(second.reportListings[0]).toEqual(listed.reportListings[0]);
  expect(second.actionSequence).toBeGreaterThan(listed.actionSequence!);
  expect(listReport(reloaded, "different-report", 500, false, undefined, 3, 2)).toEqual(second);
});

it("preserves existing long marketplace identities and rejects invalid counter states", () => {
  const scout = createScout(CONFIG, new RNG("legacy-listing-identities"));
  const original = initializeFinances(scout, "independent", "normal");
  const first = listReport(original, "legacy-report", 500, false, undefined, 3, 2);
  first.reportListings[0].id = "listing_legacy-report_s2w3_a1";
  const second = listReport(first, "new-report", 500, false, undefined, 3, 2);
  expect(second.reportListings[0]).toEqual(first.reportListings[0]);
  for (const actionSequence of [NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER]) {
    const invalid = { ...first, actionSequence };
    expect(listReport(invalid, "new-report", 500, false, undefined, 3, 2)).toBe(invalid);
  }
});
