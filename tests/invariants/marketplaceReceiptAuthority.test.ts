import { describe, expect, it } from "vitest";
import type { Club, NewGameConfig, ScoutReport } from "@/engine/core/types";
import { RNG } from "@/engine/rng";
import { createScout } from "@/engine/scout/creation";
import { initializeFinances } from "@/engine/finance/expenses";
import { listReport } from "@/engine/finance/reportMarketplace";
import { createFinanceActions } from "@/stores/actions/financeActions";
import type { GameStoreState, GetState, SetState } from "@/stores/actions/types";

const config: NewGameConfig = {
  scoutFirstName: "Receipt", scoutLastName: "Authority", scoutAge: 30, specialization: "youth",
  difficulty: "normal", worldSeed: "receipt-authority", startingCountry: "england", selectedCountries: ["england"],
  skillAllocations: { technicalEye: 2, physicalAssessment: 1, psychologicalRead: 1,
    tacticalUnderstanding: 1, dataLiteracy: 1, playerJudgment: 1, potentialAssessment: 1 },
};

function harness(upgrade: boolean, reportPatch: Partial<ScoutReport> | null) {
  const scout = createScout(config, new RNG("receipt-scout"));
  const listed = listReport(initializeFinances(scout, "independent", "normal"), "report", 500, false, "buyer", 1, 1);
  const listing = listed.reportListings[0];
  listing.bids.push({ id: "bid", listingId: listing.id, clubId: "buyer", amount: 500,
    placedWeek: 1, placedSeason: 1, expiryWeek: 3, expirySeason: 1, status: "pending",
    needMatchScore: 90, isExclusiveUpgrade: upgrade });
  const report = { id: "report", playerId: "player", scoutId: scout.id, qualityScore: 80,
    conviction: "recommend", submittedWeek: 1, submittedSeason: 1, ...reportPatch } as ScoutReport;
  let state = { gameState: { scout, finances: listed, reports: reportPatch === null ? {} : { report },
    clubs: { buyer: { id: "buyer", name: "Buyer", budget: 1_000_000, scoutingBudget: 1000 } as Club },
    inbox: [], currentWeek: 2, currentSeason: 1 } } as unknown as GameStoreState;
  const get: GetState = () => state;
  const set: SetState = partial => { state = { ...state, ...(typeof partial === "function" ? partial(state) : partial) }; };
  const actions = createFinanceActions(get, set);
  return { get, accept: () => upgrade ? actions.acceptExclusiveUpgradeBid("bid") : actions.acceptMarketplaceBid("bid"),
    prepareListing: () => { state = { ...state, gameState: { ...state.gameState!, finances: { ...state.gameState!.finances!, reportListings: [] } } }; },
    list: () => actions.listReportForSale("report", 500, false, "buyer"),
  };
}

describe("marketplace receipt authority after restoration or report removal", () => {
  it.each([false, true])("blocks explicit private receipts even with supported claims and a changed action (upgrade=%s)", upgrade => {
    const reportPatch = { recommendedAction: "monitor", decisionReceipt: { id: "private-receipt", action: "pass" },
      evidenceAssessment: { claims: [{ support: "supported" }] } } as unknown as Partial<ScoutReport>;
    const run = harness(upgrade, reportPatch);
    const before = run.get().gameState;
    run.accept();
    expect(run.get().gameState).toBe(before);
    run.prepareListing();
    const unlisted = run.get().gameState;
    run.list();
    expect(run.get().gameState).toBe(unlisted);
  });

  it.each([false, true])("does not pay a bid whose report no longer exists (upgrade=%s)", upgrade => {
    const run = harness(upgrade, null);
    const before = run.get().gameState;
    run.accept();
    expect(run.get().gameState).toBe(before);
  });

  it.each([false, true])("does not pay a stale bid for unsupported structured evidence (upgrade=%s)", upgrade => {
    const evidenceAssessment = { claims: [{ support: "withheld" }] } as unknown as ScoutReport["evidenceAssessment"];
    const run = harness(upgrade, { evidenceAssessment });
    const before = run.get().gameState;
    run.accept();
    expect(run.get().gameState).toBe(before);
  });

  it.each(["pass", "monitor"] as const)("pays supported explicitly listed %s evidence once", recommendedAction => {
    const evidenceAssessment = { claims: [{ support: "supported" }] } as unknown as ScoutReport["evidenceAssessment"];
    for (const upgrade of [false, true]) {
      const run = harness(upgrade, { recommendedAction, evidenceAssessment });
      run.accept();
      const paid = run.get().gameState!;
      expect(paid.finances?.reportSalesRevenue).toBe(500);
      expect(paid.clubs.buyer.scoutingBudget).toBe(500);
      run.accept();
      expect(run.get().gameState).toBe(paid);
    }
  });
});
