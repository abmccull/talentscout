import { describe, expect, it } from "vitest";
import type { Club, ScoutReport } from "@/engine/core/types";
import { createScout } from "@/engine/scout/creation";
import { RNG } from "@/engine/rng";
import { initializeFinances } from "@/engine/finance/expenses";
import {
  acceptBid,
  calculateReportPrice,
  listReport,
  processMarketplaceBids,
  withdrawListing,
} from "@/engine/finance/reportMarketplace";
import type { NewGameConfig } from "@/engine/core/types";

/**
 * Adversarial probe for the claimed "relisting freshness" marketplace exploit.
 * Session notes alleged withdraw→relist could inflate bids via freshness.
 * Listing age only lowers early bid probability; amounts stay ask-capped
 * to assessed value. Prior buyers remain excluded across listings.
 */
const CONFIG: NewGameConfig = {
  scoutFirstName: "Fresh",
  scoutLastName: "Probe",
  scoutAge: 30,
  specialization: "youth",
  difficulty: "normal",
  worldSeed: "marketplace-relisting-freshness",
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

function clubs(ids: readonly string[]): Record<string, Club> {
  return Object.fromEntries(ids.map((id) => [id, {
    id,
    name: id,
    shortName: id,
    leagueId: "league-1",
    reputation: 60,
    budget: 1_000_000,
    scoutingBudget: 25_000,
    managerId: `${id}-manager`,
    youthAcademyRating: 60,
    playerIds: [],
    scoutingPhilosophy: "academyFirst",
  } satisfies Club]));
}

function report(): ScoutReport {
  return {
    id: "report-freshness",
    scoutId: "scout-1",
    playerId: "player-1",
    submittedWeek: 1,
    submittedSeason: 1,
    qualityScore: 88,
    conviction: "strongRecommend",
  } as ScoutReport;
}

describe("marketplace relisting freshness probe", () => {
  it("does not inflate bid amounts or re-pay prior buyers after withdraw and relist", () => {
    const scout = createScout(CONFIG, new RNG("freshness-scout"));
    const opened = initializeFinances(scout, "independent", "normal");
    const ask = 10_000;
    const first = listReport(opened, "report-freshness", ask, false, undefined, 1, 1);
    const firstId = first.reportListings[0].id;
    const marketClubs = clubs(["club-1", "club-2", "club-3"]);
    const reports = { "report-freshness": report() };
    const players = {};

    const matureRng = new RNG("mature-listing-bids");
    matureRng.chance = () => true;
    const mature = processMarketplaceBids(
      matureRng, first, marketClubs, reports, players, scout, 3, 1,
    );
    const matureListing = mature.finances.reportListings.find((listing) => listing.id === firstId)!;
    const matureAmounts = matureListing.bids
      .filter((bid) => !bid.isExclusiveUpgrade)
      .map((bid) => ({ clubId: bid.clubId, amount: bid.amount }));
    expect(matureAmounts.length).toBeGreaterThan(0);

    for (const bid of matureAmounts) {
      const assessed = calculateReportPrice(
        reports["report-freshness"], scout, marketClubs[bid.clubId], false, "normal",
      );
      expect(bid.amount).toBeLessThanOrEqual(Math.round(Math.min(ask, assessed) * 2.5));
      expect(bid.amount).toBeLessThanOrEqual(assessed * 2.5 + 1);
    }

    const firstSale = matureListing.bids.find((bid) => bid.clubId === "club-1" && !bid.isExclusiveUpgrade);
    expect(firstSale).toBeDefined();
    const sold = acceptBid(mature.finances, firstId, firstSale!.id, 3, 1);
    expect(sold.reportSalesRevenue).toBe(firstSale!.amount);
    const revenueAfterFirstSale = sold.reportSalesRevenue;

    const relisted = listReport(withdrawListing(sold, firstId), "report-freshness", ask, false, undefined, 4, 1);
    const newListing = relisted.reportListings.at(-1)!;
    expect(newListing.id).not.toBe(firstId);
    expect(newListing.listedWeek).toBe(4);
    expect(newListing.biddingEndsWeek).toBe(7);

    const freshRng = new RNG("fresh-relist-bids");
    freshRng.chance = () => true;
    const regenerated = processMarketplaceBids(
      freshRng, relisted, marketClubs, reports, players, scout, 5, 1,
    );
    const freshListing = regenerated.finances.reportListings.find((listing) => listing.id === newListing.id)!;
    const freshBids = freshListing.bids.filter((bid) => !bid.isExclusiveUpgrade);

    expect(freshBids.some((bid) => bid.clubId === "club-1")).toBe(false);
    expect(freshBids.length).toBeGreaterThan(0);

    const matureByClub = new Map(matureAmounts.map((entry) => [entry.clubId, entry.amount]));
    for (const bid of freshBids) {
      const assessed = calculateReportPrice(
        reports["report-freshness"], scout, marketClubs[bid.clubId], false, "normal",
      );
      const negotiationBase = Math.min(ask, assessed);
      expect(bid.amount).toBeLessThanOrEqual(Math.round(negotiationBase * 2.5));
      const prior = matureByClub.get(bid.clubId);
      if (prior !== undefined) {
        // Fresh listing age is a demand penalty, not a valuation premium.
        expect(bid.amount).toBeLessThanOrEqual(prior * 1.05 + 25);
      }
    }

    const staleRepeat = {
      id: "stale-repeat",
      listingId: newListing.id,
      clubId: "club-1",
      amount: 50_000,
      placedWeek: 5,
      placedSeason: 1,
      expiryWeek: 7,
      expirySeason: 1,
      status: "pending" as const,
      needMatchScore: 90,
    };
    const withStale = {
      ...regenerated.finances,
      reportListings: regenerated.finances.reportListings.map((listing) =>
        listing.id === newListing.id
          ? { ...listing, bids: [...listing.bids, staleRepeat] }
          : listing),
    };
    expect(acceptBid(withStale, newListing.id, staleRepeat.id, 5, 1)).toBe(withStale);
    expect(withStale.reportSalesRevenue).toBe(revenueAfterFirstSale);

    const newBuyer = freshBids.find((bid) => bid.clubId !== "club-1");
    expect(newBuyer).toBeDefined();
    const secondSale = acceptBid(withStale, newListing.id, newBuyer!.id, 5, 1);
    expect(secondSale.reportSalesRevenue).toBe(revenueAfterFirstSale + newBuyer!.amount);
  });

  it("resets the bidding window without creating a listing-age price premium", () => {
    const scout = createScout(CONFIG, new RNG("window-scout"));
    const opened = initializeFinances(scout, "independent", "normal");
    const listed = listReport(opened, "report-freshness", 500, false, undefined, 1, 1);
    const listing = listed.reportListings[0];
    expect(listing.biddingEndsWeek).toBe(4);

    const withdrawn = withdrawListing(listed, listing.id);
    const relisted = listReport(withdrawn, "report-freshness", 500, false, undefined, 5, 1);
    const next = relisted.reportListings.at(-1)!;
    expect(next.listedWeek).toBe(5);
    expect(next.biddingEndsWeek).toBe(8);
    expect(next.price).toBe(500);
  });
});
