import { test, expect, type GamePage } from "../fixtures";
import { expandClubFinancialObligation, expandLoanDeal } from "@/engine/finance/terminalRecordArchive";
import type { StoredClubFinancialObligation, StoredLoanDeal } from "@/engine/core/types";
import { expandPlayerMovementHistory, type StoredPlayerMovementHistory } from "@/engine/world/movementRowsArchive";

type FundingCase = "affordable" | "reserve-blocked" | "payroll-blocked" | "ordinary";
const LOAN_ID = "review-loan-outcome";
const PLAYER_ID = "review-loan-player";
const FEE = 20_000;
const FINAL_LOAN_WAGE = 3_000;

// Failure-first contract: seed a disposable local career checkpoint, then use
// the browser calendar's actual weekly worker and the public save/load boundary.
// The weekly engine is not substituted; production decoders inspect stored facts.
async function seedExpiringLoan(gamePage: GamePage, funding: FundingCase) {
  await gamePage.goto();
  await gamePage.injectState({ currentWeek: 12, currentSeason: 1,
    scout: { primarySpecialization: "youth", careerPath: "independent", fatigue: 10 } });
  return gamePage.page.evaluate(async ({ funding, loanId, playerId, fee, finalLoanWage }) => {
    const store = (window as any).__GAME_STORE__;
    const state = structuredClone(store.getState().gameState);
    const clubs = Object.values(state.clubs) as any[];
    const borrower = clubs.find((club) => club.playerIds.length >= 18);
    const parent = clubs.find((club) => club.id !== borrower?.id && club.playerIds.length >= 18);
    if (!borrower || !parent) throw new Error("Loan fixture needs two complete generated clubs");
    const template = Object.values(state.players).find((player: any) => player.position === "CM") as any;
    const keeperTemplate = Object.values(state.players).find((player: any) => player.position === "GK") as any;
    if (!template || !keeperTemplate) throw new Error("Loan fixture needs generated CM/GK templates");

    // Replace this disposable borrower's owned roster, including any owned
    // players absent from playerIds. Payroll calculations scan contract owners.
    for (const [id, player] of Object.entries(state.players) as [string, any][]) {
      if (player.clubId === borrower.id || (player.contractClubId ?? player.loanParentClubId ?? player.clubId) === borrower.id) {
        delete state.players[id];
      }
    }
    const incumbentCount = funding === "affordable" || funding === "ordinary" ? 17 : 11;
    const incumbentIds: string[] = [];
    for (let index = 0; index < incumbentCount; index++) {
      const id = `review-loan-incumbent-${index}`;
      incumbentIds.push(id);
      state.players[id] = { ...(index === 0 ? keeperTemplate : template), id, visualIdentity: undefined,
        firstName: "Loan", lastName: `Incumbent ${index}`, age: 24,
        clubId: borrower.id, contractClubId: borrower.id, contractExpiry: 10,
        onLoan: undefined, loanParentClubId: undefined, loanEndWeek: undefined,
        loanEndSeason: undefined, wage: 1_000, currentAbility: 80, potentialAbility: 90,
        injured: false, currentInjury: undefined, injuryWeeksRemaining: 0,
        suspension: undefined, disciplinaryRecord: undefined };
    }
    state.players[playerId] = { ...template, id: playerId, visualIdentity: undefined,
      firstName: "Loan", lastName: "Truth", age: 20,
      clubId: borrower.id, contractClubId: parent.id, contractExpiry: 10,
      onLoan: true, loanParentClubId: parent.id, loanEndWeek: 12, loanEndSeason: 1,
      wage: 6_000, currentAbility: 100, potentialAbility: 110,
      injured: false, currentInjury: undefined, injuryWeeksRemaining: 0,
      suspension: undefined, disciplinaryRecord: undefined, seasonRatings: [],
      developmentHistory: [] };

    // With 11 owned incumbents, the proposed purchase commits17k/wk.18k
    // leaves1k headroom, less than the untouched3k eighteen-place reserve.
    //16k cannot fund the proposed payroll despite ample cash for the fee.
    state.clubs[borrower.id] = { ...borrower, playerIds: [...incumbentIds, playerId],
      academyPlayerIds: [], loanedInPlayerIds: [playerId], loanedOutPlayerIds: [],
      budget: 5_000_000,
      weeklyWageBudget: funding === "payroll-blocked" ? 16_000 : funding === "reserve-blocked" ? 18_000 : 100_000,
      financialObligations: [{ id: "review-loan-wages", playerId, type: "loanWageContribution",
        creditorClubId: parent.id, weeklyAmount: finalLoanWage, amount: finalLoanWage,
        remainingWeeks: 1, createdWeek: 1, createdSeason: 1, status: "active" }] };
    state.clubs[parent.id] = { ...parent,
      playerIds: parent.playerIds.filter((id: string) => id !== playerId),
      loanedOutPlayerIds: [...(parent.loanedOutPlayerIds ?? []), playerId],
      budget: 5_000_000, weeklyWageBudget: 10_000_000, financialObligations: [] };

    const averageRating = funding === "ordinary" ? 7 : 8;
    state.activeLoans = [...(state.activeLoans ?? []).filter((deal: any) => deal.loanClubId !== borrower.id && deal.parentClubId !== borrower.id), {
      id: loanId, playerId, parentClubId: parent.id, loanClubId: borrower.id,
      startWeek: 1, startSeason: 1, endWeek: 12, endSeason: 1,
      loanFee: 0, wageContribution: 50, buyOptionFee: fee, recallClause: false,
      agreedPlayingTime: "regular", status: "active", scoutId: state.scout.id,
      startCurrentAbility: 98,
      performanceRecord: { appearances: 8, goals: 4, assists: 2, avgRating: averageRating,
        developmentDelta: 2, parentClubSatisfaction: 80, loanClubSatisfaction: 65 },
    }];
    state.loanHistory = (state.loanHistory ?? []).filter((deal: any) => deal.id !== loanId);
    state.loanRecommendations = [{ id: "review-loan-recommendation", playerId,
      scoutId: state.scout.id, targetClubId: borrower.id, week: 1, season: 1,
      rationale: "development", suggestedDuration: 12, suggestedWageContribution: 50,
      status: "accepted", loanDealId: loanId, reputationApplied: false }];
    state.inbox = state.inbox.filter((message: any) => message.relatedId !== playerId);
    state.playerMovementHistory = (state.playerMovementHistory ?? []).filter((movement: any) => movement.playerId !== playerId);

    // A real fixture-derived calendar, past canonical evidence, and an expiry
    // bye keep the8.0 record deterministic without forging a simulated result.
    for (const fixture of Object.values(state.fixtures) as any[]) {
      if (!fixture.played && fixture.week === 12 &&
          [fixture.homeClubId, fixture.awayClubId].some((id) => id === borrower.id || id === parent.id)) {
        fixture.week = 13;
      }
    }
    const fixtureTemplate = Object.values(state.fixtures)[0] as any;
    if (!fixtureTemplate) throw new Error("Loan checkpoint requires generated fixture calendar");
    state.matchRatings ??= {};
    for (let week = 1; week <= 8; week++) {
      const id = `review-loan-s1-week${week}`;
      state.fixtures[id] = { ...fixtureTemplate, id, season: 1, week,
        homeClubId: borrower.id, awayClubId: parent.id,
        played: true, homeGoals: week <= 4 ? 1 : 0, awayGoals: 0 };
      state.matchRatings[id] = { [playerId]: { playerId, fixtureId: id,
        started: true, minutesPlayed: 90, rating: averageRating, eventCount: 0,
        stats: { goals: week <= 4 ? 1 : 0, assists: week <= 2 ? 1 : 0 }, source: "simulated" } };
    }
    state.transferWindow = undefined;
    state.alumniRecords = state.alumniRecords.filter((record: any) => record.playerId !== playerId);
    store.getState().loadGame(state);
    // Persist before proceeding so reload exercises the actual provider rather
    // than an in-memory reference. Browser fixtures have an isolated local DB.
    await store.getState().saveToSlot(5, `Loan truth ${funding} checkpoint`);
    await store.getState().loadFromSlot(5);
    return { borrowerId: borrower.id, parentId: parent.id, funding,
      initialBuyerBudget: state.clubs[borrower.id].budget,
      initialSellerBudget: state.clubs[parent.id].budget,
      incumbentCount, buyerWageBudget: state.clubs[borrower.id].weeklyWageBudget,
      canonicalAppearances: 8, averageRating, buyOptionFee: fee, finalLoanWage };
  }, { funding, loanId: LOAN_ID, playerId: PLAYER_ID, fee: FEE, finalLoanWage: FINAL_LOAN_WAGE });
}

async function readLoanFacts(gamePage: GamePage, borrowerId: string, parentId: string) {
  const facts = await gamePage.page.evaluate(({ loanId, playerId, borrowerId, parentId }) => {
    const store = (window as any).__GAME_STORE__;
    const state = store.getState().gameState;
    const player = state.players[playerId];
    return { date: [state.currentSeason, state.currentWeek],
      route: store.getState().lastWeeklyWorkerTelemetry?.route,
      player: { clubId: player?.clubId, contractClubId: player?.contractClubId,
        onLoan: Boolean(player?.onLoan), wage: player?.wage },
      buyerBudget: state.clubs[borrowerId].budget, sellerBudget: state.clubs[parentId].budget,
      buyerRoster: state.clubs[borrowerId].playerIds.includes(playerId),
      sellerRoster: state.clubs[parentId].playerIds.includes(playerId),
      loanedIn: state.clubs[borrowerId].loanedInPlayerIds?.includes(playerId) ?? false,
      loanedOut: state.clubs[parentId].loanedOutPlayerIds?.includes(playerId) ?? false,
      obligations: state.clubs[borrowerId].financialObligations ?? [],
      active: state.activeLoans.filter((deal: any) => deal.id === loanId),
      history: state.loanHistory ?? [],
      movements: state.playerMovementHistory ?? [],
      recommendation: state.loanRecommendations.find((entry: any) => entry.loanDealId === loanId),
      messages: state.inbox.filter((message: any) => message.relatedId === playerId &&
        /Loan (Buy Option Exercised|Return|Recall|Outcome):/.test(message.title)),
    };
  }, { loanId: LOAN_ID, playerId: PLAYER_ID, borrowerId, parentId });
  return { ...facts,
    movements: expandPlayerMovementHistory(facts.movements as StoredPlayerMovementHistory)
      .filter((movement) => movement.loanDealId === LOAN_ID),
    obligations: (facts.obligations as StoredClubFinancialObligation[])
      .map(entry => expandClubFinancialObligation(entry)).filter(entry => entry.playerId === PLAYER_ID),
    history: (facts.history as StoredLoanDeal[])
      .map(deal => expandLoanDeal(deal)).filter(deal => deal.id === LOAN_ID),
  };
}

test.describe("Committed loan outcome truth", () => {
  for (const funding of ["affordable", "reserve-blocked", "payroll-blocked", "ordinary"] as const) {
    test(`${funding}: outcome, ownership, money and feedback agree through reload`, async ({ gamePage }, testInfo) => {
      test.setTimeout(180_000);
      const checkpoint = await seedExpiringLoan(gamePage, funding);
      const before = await readLoanFacts(gamePage, checkpoint.borrowerId, checkpoint.parentId);
      expect(before.active).toHaveLength(1);
      expect(before.player.onLoan).toBe(true);
      expect(before.history).toHaveLength(0);
      await gamePage.navigateTo("calendar");
      await gamePage.advanceCanonicalWeek();
      const after = await readLoanFacts(gamePage, checkpoint.borrowerId, checkpoint.parentId);
      // Attach before assertions, so a baseline failure leaves concrete facts.
      await testInfo.attach("loan-before-and-after.json", { contentType: "application/json",
        body: Buffer.from(JSON.stringify({ checkpoint, before, after }, null, 2)) });
      expect(after.route).toBe("worker");
      expect(after.active).toHaveLength(0);
      expect(after.history).toHaveLength(1);
      expect(after.movements).toHaveLength(1);
      expect(after.player.onLoan).toBe(false);
      expect(after.loanedIn).toBe(false);
      expect(after.loanedOut).toBe(false);
      expect(after.obligations.every((entry: any) => entry.status !== "active")).toBe(true);
      expect(after.recommendation).toMatchObject({ status: "completed", reputationApplied: true });
      const bought = funding === "affordable";
      expect(after.movements[0]).toMatchObject({ type: bought ? "loanBuyOption" : "loanReturn" });
      expect(after.player.contractClubId).toBe(bought ? checkpoint.borrowerId : checkpoint.parentId);
      expect(after.player.clubId).toBe(after.player.contractClubId);
      expect(after.buyerRoster).toBe(bought);
      expect(after.sellerRoster).toBe(!bought);
      if (bought) {
        expect(after.history[0].outcome).toBe("buy-option-exercised");
        expect(after.recommendation.outcome).toBe("buy-option-exercised");
        expect(after.movements[0].fee).toBe(FEE);
        expect(after.messages.filter((message: any) => message.title.startsWith("Loan Buy Option Exercised:"))).toHaveLength(1);
        expect(after.messages.find((message: any) => message.title.startsWith("Loan Outcome:"))?.body)
          .toContain("+8 reputation, +50 XP");
      } else {
        expect(after.history[0].outcome).not.toBe("buy-option-exercised");
        expect(after.recommendation.outcome).toBe(after.history[0].outcome);
        expect(after.movements[0].fee ?? 0).toBe(0);
        expect(after.messages.filter((message: any) => /Buy Option Exercised|exercised their option/i.test(`${message.title} ${message.body}`))).toHaveLength(0);
        expect(after.messages.filter((message: any) => message.title.startsWith("Loan Return:"))).toHaveLength(1);
      }
      expect(after.messages.filter((message: any) => message.title.startsWith("Loan Outcome:"))).toHaveLength(1);
      // Canonical settlement also pays the final existing loan contribution.
      expect(after.buyerBudget).toBe(checkpoint.initialBuyerBudget - FINAL_LOAN_WAGE - (bought ? FEE : 0));
      expect(after.sellerBudget).toBe(checkpoint.initialSellerBudget + FINAL_LOAN_WAGE + (bought ? FEE : 0));

      await gamePage.page.evaluate(async () => {
        await (window as any).__GAME_STORE__.getState().saveToSlot(5, "Settled loan outcome truth");
      });
      await gamePage.page.reload();
      await gamePage.page.waitForFunction(() => Boolean((window as any).__GAME_STORE__));
      await gamePage.page.evaluate(async () => {
        await (window as any).__GAME_STORE__.getState().loadFromSlot(5);
      });
      const reloaded = await readLoanFacts(gamePage, checkpoint.borrowerId, checkpoint.parentId);
      expect(reloaded.player).toEqual(after.player);
      expect(reloaded.buyerBudget).toBe(after.buyerBudget);
      expect(reloaded.sellerBudget).toBe(after.sellerBudget);
      expect(reloaded.history).toEqual(after.history);
      expect(reloaded.recommendation).toEqual(after.recommendation);
      expect(reloaded.messages).toEqual(after.messages);
      await gamePage.navigateTo("calendar");
      await gamePage.advanceCanonicalWeek();
      const next = await readLoanFacts(gamePage, checkpoint.borrowerId, checkpoint.parentId);
      expect(next.history).toEqual(after.history);
      expect(next.movements).toEqual(after.movements);
      expect(next.recommendation).toEqual(after.recommendation);
      expect(next.messages).toEqual(after.messages);
      await testInfo.attach("loan-save-reload-no-duplicate.json", { contentType: "application/json",
        body: Buffer.from(JSON.stringify({ checkpoint, after, reloaded, next }, null, 2)) });
      gamePage.expectNoConsoleErrors();
    });
  }
});
