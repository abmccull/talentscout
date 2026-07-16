import { describe, expect, it } from "vitest";
import type { MarketplaceBid, NewGameConfig } from "@/engine/core/types";
import { createScout } from "@/engine/scout/creation";
import { RNG } from "@/engine/rng";
import { initializeFinances } from "@/engine/finance/expenses";
import {
  acceptBid,
  listReport,
} from "@/engine/finance/reportMarketplace";
import { triggerPlacementFee } from "@/engine/finance/placementFees";

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
