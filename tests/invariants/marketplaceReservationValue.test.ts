import { describe, expect, it } from "vitest";
import type { Club, FinancialRecord, NewGameConfig, Player, ScoutReport } from "@/engine/core/types";
import { RNG } from "@/engine/rng";
import { createScout } from "@/engine/scout/creation";
import { initializeFinances } from "@/engine/finance/expenses";
import { calculateReportPrice, listReport, processMarketplaceBids } from "@/engine/finance/reportMarketplace";
import { createFinanceActions } from "@/stores/actions/financeActions";
import type { GameStoreState, GetState, SetState } from "@/stores/actions/types";

const config: NewGameConfig = {
  scoutFirstName: "Reservation", scoutLastName: "Scout", scoutAge: 30, specialization: "youth",
  difficulty: "normal", worldSeed: "report-reservation", startingCountry: "england", selectedCountries: ["england"],
  skillAllocations: { technicalEye: 2, physicalAssessment: 1, psychologicalRead: 1,
    tacticalUnderstanding: 1, dataLiteracy: 1, playerJudgment: 1, potentialAssessment: 1 },
};

function market() {
  const scout = { ...createScout(config, new RNG("reservation-scout")), reputation: 30 };
  const club: Club = { id: "buyer", name: "Buyer", shortName: "BUY", budget: 10_000_000, scoutingBudget: 100_000,
    reputation: 50, leagueId: "league", managerId: "manager", youthAcademyRating: 60,
    scoutingPhilosophy: "academyFirst", playerIds: [] };
  const player = { id: "prospect", age: 16, position: "CM" } as Player;
  const report = { id: "report", scoutId: scout.id, playerId: player.id, qualityScore: 60,
    conviction: "note", perceivedCAStars: 3, submittedWeek: 1, submittedSeason: 1 } as ScoutReport;
  const finances = initializeFinances(scout, "independent", "normal");
  const suggested = calculateReportPrice(report, scout, club, false, finances.marketTemperature);
  return { scout, club, player, report, finances, suggested };
}

function offered(ask: number, options: { exclusive?: boolean; ordinary?: boolean; upgrade?: boolean; budget?: number } = {}) {
  const data = market();
  if (options.budget !== undefined) data.club.scoutingBudget = options.budget;
  let listed = listReport(data.finances, data.report.id, ask, options.exclusive ?? false, undefined, 1, 1);
  if (options.ordinary || options.upgrade) listed = { ...listed, reportSalesRevenue: 50 };
  if (options.upgrade) {
    const listing = listed.reportListings[0];
    listed = { ...listed, reportListings: [{ ...listing, bids: [{
      id: "earlier-buyer", listingId: listing.id, clubId: "earlier-club", amount: 100,
      placedWeek: 1, placedSeason: 1, expiryWeek: 3, expirySeason: 1, status: "accepted", needMatchScore: 80,
    }] }] };
  }
  const rng = new RNG("same-report-buyer-week");
  if (options.ordinary) rng.chance = () => true;
  if (options.upgrade) {
    let chanceCalls = 0;
    rng.chance = () => ++chanceCalls > 1;
  }
  const result = processMarketplaceBids(rng, listed, { buyer: data.club }, { report: data.report },
    { prospect: data.player }, data.scout, 2, 1);
  const bid = result.finances.reportListings[0].bids.find((candidate) => candidate.clubId === "buyer");
  return { ...data, result, bid };
}

describe("club report reservation values", () => {
  it("guarantees a sensible counteroffer even when the ask exceeds every club budget", () => {
    const normal = offered(market().suggested);
    const excessive = offered(10_000);
    const impossible = offered(10_000_000);
    expect(normal.bid).toBeDefined();
    expect(excessive.bid?.amount).toBe(normal.bid!.amount);
    expect(impossible.bid?.amount).toBe(normal.bid!.amount);
    expect(excessive.bid!.amount).toBeLessThan(10_000);
    expect(impossible.result.inboxMessages[0].body).toContain("counteroffer");
  });

  it("keeps ordinary bids independent of inflated asks while preserving lower-price negotiation", () => {
    const normal = offered(market().suggested, { ordinary: true });
    expect(offered(10_000, { ordinary: true }).bid?.amount).toBe(normal.bid!.amount);
    expect(offered(10_000_000, { ordinary: true }).bid?.amount).toBe(normal.bid!.amount);
    expect(offered(50, { ordinary: true }).bid!.amount).toBeLessThan(normal.bid!.amount);
  });

  it("preserves exclusivity premiums and independently bounds exclusive upgrade offers", () => {
    const nonExclusive = offered(10_000);
    const exclusive = offered(10_000, { exclusive: true });
    expect(exclusive.bid!.amount).toBeGreaterThan(nonExclusive.bid!.amount);
    expect(offered(10_000_000, { exclusive: true }).bid?.amount).toBe(exclusive.bid!.amount);
    const upgrade = offered(market().suggested, { upgrade: true });
    expect(upgrade.bid?.isExclusiveUpgrade).toBe(true);
    expect(upgrade.bid!.amount).toBeGreaterThan(nonExclusive.bid!.amount);
    expect(offered(10_000, { upgrade: true }).bid?.amount).toBe(upgrade.bid!.amount);
    expect(offered(10_000_000, { upgrade: true }).bid?.amount).toBe(upgrade.bid!.amount);
  });

  it("respects the remaining procurement budget when making a first counteroffer", () => {
    const bounded = offered(10_000_000, { budget: 100 });
    expect(bounded.bid?.amount).toBe(100);
  });

  it("pays the bounded generated bid and welcome bonus once through real store actions", () => {
    function sell(ask: number) {
      const data = offered(ask);
      expect(data.bid).toBeDefined();
      let store = { gameState: { scout: data.scout, finances: data.result.finances,
        clubs: { buyer: data.club }, reports: { report: data.report }, inbox: data.result.inboxMessages,
        currentWeek: 2, currentSeason: 1 } } as unknown as GameStoreState;
      const get: GetState = () => store;
      const set: SetState = (partial) => { store = { ...store, ...(typeof partial === "function" ? partial(store) : partial) }; };
      const actions = createFinanceActions(get, set);
      actions.acceptMarketplaceBid(data.bid!.id);
      const paid = structuredClone(store.gameState!);
      actions.acceptMarketplaceBid(data.bid!.id);
      expect(store.gameState).toEqual(paid);
      const finances = paid.finances as FinancialRecord;
      expect(finances.reportSalesRevenue).toBe(data.bid!.amount);
      expect(finances.bonusRevenue).toBe(Math.round(data.bid!.amount * 0.5));
      expect(paid.clubs.buyer.scoutingBudget).toBe(100_000 - data.bid!.amount);
      expect(finances.transactions.filter((entry) => entry.referenceId?.startsWith("marketplace:"))).toHaveLength(1);
      return finances.balance;
    }
    expect(sell(10_000)).toBe(sell(market().suggested));
    expect(sell(10_000_000)).toBe(sell(market().suggested));
  });
});
