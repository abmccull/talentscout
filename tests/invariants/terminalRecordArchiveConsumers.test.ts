// Unexecuted failure-first draft for immutable ef5920c; existing APIs only.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Club, ClubFinancialObligation, GameState, LoanDeal, LoanRecommendation, Player, PlayerMovementEvent } from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import { projectAppliedLoanClosures } from "@/engine/core/weekly/loanClosureFeedback";
import { getClubWeeklyObligationCommitment, normalizeClubEconomics, settleWeeklyClubObligations, settleTriggeredClubObligations, settleRelegationClubObligations } from "@/engine/finance/clubEconomics";
import { collectCausallyReferencedPlayerIds } from "@/engine/world/saveRetention";
import { buildPlayerMovementPresentation } from "@/engine/transfers/presentation";
import { migrateSaveState } from "@/lib/db";
import { expandClubFinancialObligation } from "@/engine/finance/terminalRecordArchive";

function terminalLoan(): LoanDeal {
  return {
    id: "loan:p1", playerId: "p1", parentClubId: "parent", loanClubId: "host",
    startWeek: 1, startSeason: 2, endWeek: 12, endSeason: 2,
    loanFee: 50_000, wageContribution: 40, recallClause: true, status: "completed",
    buyOptionFee: 100_000, outcome: "successful", agreedPlayingTime: "regular",
    startCurrentAbility: 80, monitoringWeeks: ["2:4", "2:4"], scoutId: "scout",
    performanceRecord: { appearances: 26, goals: 5, assists: 7, avgRating: 7.125,
      developmentDelta: 7, parentClubSatisfaction: 86, loanClubSatisfaction: 82 },
  };
}
// Hand-authored persisted-format fixture, not a test implementation of the encoder.
function storedLoan(): LoanDeal {
  return [1, "loan:p1", "p1", "parent", "host", 1, 2, 12, 2, 50_000, 40, true, "completed",
    { buyOptionFee: 100_000, outcome: "successful", agreedPlayingTime: "regular",
      startCurrentAbility: 80, monitoringWeeks: ["2:4", "2:4"], scoutId: "scout",
      performanceRecord: [26, 5, 7, 7.125, 7, 86, 82] }] as unknown as LoanDeal;
}
function terminalObligation(): ClubFinancialObligation {
  return { id: "terminal-audit", type: "appearanceBonus", playerId: "p1",
    creditorClubId: "parent", amount: 0, percentage: 12.5, weeklyAmount: 0, remainingWeeks: 0,
    createdWeek: 1, createdSeason: 2, status: "settled", trigger: "25 appearances",
    triggeredWeek: 3, triggeredSeason: 2, lastProcessedWeek: 4, lastProcessedSeason: 2,
    appearanceThreshold: 25, goalThreshold: 0, assistThreshold: 0,
    appearancesRecorded: 25, goalsRecorded: 7, assistsRecorded: 9,
    lastTriggerEvaluationWeek: 4, lastTriggerEvaluationSeason: 2 };
}
function storedObligation(): ClubFinancialObligation {
  return { id: "terminal-audit", obligationArchiveV1: [8_388_607,
    "appearanceBonus", "p1", "parent", 0, 12.5, 0, 0, 1, 2, "settled", "25 appearances",
    3, 2, 4, 2, 25, 0, 0, 25, 7, 9, 4, 2] } as unknown as ClubFinancialObligation;
}
function club(id: string, obligations: ClubFinancialObligation[] = []): Club {
  return { id, name: id, shortName: id, leagueId: "league", reputation: 55,
    budget: 5_000, scoutingPhilosophy: "academyFirst", managerId: "manager",
    playerIds: [], academyPlayerIds: [], youthAcademyRating: 13,
    loanedInPlayerIds: [], loanedOutPlayerIds: [], financialObligations: obligations };
}
function closureInput(deal: LoanDeal, previous: LoanDeal[] = [], reputationApplied = false) {
  const movement = { id: "returned-p1", type: "loanReturn", playerId: "p1",
    loanDealId: "loan:p1", week: 12, season: 2, fromClubId: "host", toClubId: "parent" } as PlayerMovementEvent;
  return {
    scout: { id: "scout", primarySpecialization: "youth" } as GameState["scout"],
    previousLoanHistory: previous, loanHistory: [deal, deal], movements: [movement, movement],
    recommendations: [{ id: "rec1", playerId: "p1", targetClubId: "host", scoutId: "scout",
      week: 1, season: 2, rationale: "development", suggestedDuration: 12,
      suggestedWageContribution: 40, status: "accepted", reputationApplied,
      loanDealId: "loan:p1" }] as LoanRecommendation[],
    players: { p1: { id: "p1", firstName: "Ari", lastName: "Scout", currentAbility: 87 } as Player },
    clubs: { parent: club("parent"), host: club("host") }, week: 12, season: 2,
  };
}
function payable(): ClubFinancialObligation {
  return { id: "active-debt", type: "loanWageContribution", playerId: "p2",
    creditorClubId: "parent", amount: 600, weeklyAmount: 200, remainingWeeks: 3,
    createdWeek: 1, createdSeason: 2, status: "active" };
}
function mixedClubs(terminal: ClubFinancialObligation, active = payable()) {
  return { parent: club("parent"), host: club("host", [terminal, active, terminal]) };
}
function decodedSettlement(result: ReturnType<typeof settleWeeklyClubObligations>) {
  return { ...result, clubs: Object.fromEntries(Object.entries(result.clubs).map(([id, value]) => [id, {
    ...value, financialObligations: value.financialObligations?.map(row => expandClubFinancialObligation(row)),
  }])) };
}

describe("terminal archives through existing consumers", () => {
  it("preserves closure messages/rewards, duplicate suppression and next RNG", () => {
    const expandedRng = createRNG("terminal-closures"), storedRng = createRNG("terminal-closures");
    const expected = projectAppliedLoanClosures(closureInput(terminalLoan()), expandedRng);
    const input = closureInput(storedLoan()), before = JSON.stringify(input);
    const actual = projectAppliedLoanClosures(input, storedRng);
    expect(expected.messages).toHaveLength(2);
    expect(expected.reputationDelta).toBeGreaterThan(0);
    expect(expected.xpAward).toBeGreaterThan(0);
    expect(actual).toEqual(expected);
    expect(storedRng.next()).toBe(expandedRng.next());
    expect(JSON.stringify(input)).toBe(before);
  });

  it("uses archived previous IDs and already-applied recommendations without repeating rewards or RNG", () => {
    for (const alreadyRewarded of [false, true]) {
      const expandedRng = createRNG("terminal-repeat"), storedRng = createRNG("terminal-repeat");
      const previousExpanded = alreadyRewarded ? [] : [terminalLoan()];
      const previousStored = alreadyRewarded ? [] : [storedLoan()];
      const expected = projectAppliedLoanClosures(closureInput(terminalLoan(), previousExpanded, alreadyRewarded), expandedRng);
      const actual = projectAppliedLoanClosures(closureInput(storedLoan(), previousStored, alreadyRewarded), storedRng);
      expect(expected.reputationDelta).toBe(0);
      expect(expected.xpAward).toBe(0);
      expect(expected.messages).toHaveLength(alreadyRewarded ? 1 : 0);
      expect(actual).toEqual(expected);
      expect(storedRng.next()).toBe(expandedRng.next());
    }
  });

  it("preserves causal player protection and authored movement terms from stored loan facts", () => {
    const legacy = JSON.parse(readFileSync(new URL("../fixtures/saves/v0-save-record.json", import.meta.url), "utf8")) as { state: unknown };
    const state = migrateSaveState(legacy.state);
    state.loanHistory = [storedLoan()];
    expect(collectCausallyReferencedPlayerIds(state).has("p1")).toBe(true);
    const movement = { id: "buy-p1", type: "loanBuyOption", playerId: "p1", week: 12,
      season: 2, fromClubId: "parent", toClubId: "host", loanDealId: "loan:p1" } as PlayerMovementEvent;
    const expected = buildPlayerMovementPresentation({ movement, loanDeal: terminalLoan() });
    expect(expected.details).toHaveLength(1);
    expect(buildPlayerMovementPresentation({ movement, loanDeal: storedLoan() })).toEqual(expected);
  });

  it("decodes before economics normalization, then publishes the same canonical facts", () => {
    const original = club("host", [storedObligation(), payable(), storedObligation()]);
    const before = JSON.stringify(original);
    const expected = normalizeClubEconomics(club("host", [terminalObligation(), payable(), terminalObligation()]), {});
    const actual = normalizeClubEconomics(original, {});
    expect({ ...actual, financialObligations: actual.financialObligations?.map(row => expandClubFinancialObligation(row)) })
      .toEqual({ ...expected, financialObligations: expected.financialObligations?.map(row => expandClubFinancialObligation(row)) });
    expect(actual.financialObligations).toHaveLength(3);
    expect(getClubWeeklyObligationCommitment(actual)).toBe(200);
    expect(normalizeClubEconomics(actual, {})).toEqual(actual);
    expect(JSON.stringify(original)).toBe(before);
  });

  it("pays only active debt once while retaining terminal duplicates and audit facts", () => {
    const original = mixedClubs(storedObligation()), before = JSON.stringify(original);
    const expected = settleWeeklyClubObligations(mixedClubs(terminalObligation()), 4, 2);
    const actual = settleWeeklyClubObligations(original, 4, 2);
    expect(decodedSettlement(actual)).toEqual(decodedSettlement(expected));
    expect(actual.processedObligationIds).toEqual(["active-debt"]);
    expect(actual.clubs.parent.budget).toBe(5_200);
    expect(actual.clubs.host.budget).toBe(4_800);
    expect(actual.clubs.host.financialObligations).toHaveLength(3);
    const replay = settleWeeklyClubObligations(actual.clubs, 4, 2);
    expect(replay.clubs).toEqual(actual.clubs);
    expect(replay.processedObligationIds).toEqual([]);
    expect(JSON.stringify(original)).toBe(before);
  });

  it("preserves fixture-trigger counters and payment idempotency with terminal archives", () => {
    const active = { id: "appearance", type: "appearanceBonus", playerId: "p2",
      creditorClubId: "parent", amount: 600, appearanceThreshold: 25, appearancesRecorded: 24,
      createdWeek: 1, createdSeason: 1, status: "active" } as ClubFinancialObligation;
    const fixtures = [{ homeClubId: "host", awayClubId: "parent", playerRatings: {
      p2: { playerId: "p2", fixtureId: "fixture-1", rating: 7.1, eventCount: 2,
        stats: {}, source: "simulated" as const },
    } }];
    const expected = settleTriggeredClubObligations(mixedClubs(terminalObligation(), active), fixtures, 4, 2);
    const actual = settleTriggeredClubObligations(mixedClubs(storedObligation(), active), fixtures, 4, 2);
    expect(decodedSettlement(actual)).toEqual(decodedSettlement(expected));
    expect(actual.processedObligationIds).toEqual(["appearance"]);
    expect(actual.clubs.parent.budget).toBe(5_600);
    expect(actual.clubs.host.budget).toBe(4_400);
    expect(settleTriggeredClubObligations(actual.clubs, fixtures, 4, 2).clubs).toEqual(actual.clubs);
  });

  it("preserves relegation settlement and the repeat guard with mixed stored terminal rows", () => {
    const active = { id: "relegation", type: "relegationClause", playerId: "p2",
      creditorClubId: "parent", amount: 600, createdWeek: 1, createdSeason: 1,
      status: "active" } as ClubFinancialObligation;
    const expected = settleRelegationClubObligations(mixedClubs(terminalObligation(), active), new Set(["host"]), 38, 2);
    const actual = settleRelegationClubObligations(mixedClubs(storedObligation(), active), new Set(["host"]), 38, 2);
    expect(decodedSettlement(actual)).toEqual(decodedSettlement(expected));
    expect(actual.processedObligationIds).toEqual(["relegation"]);
    expect(actual.clubs.parent.budget).toBe(5_600);
    expect(actual.clubs.host.budget).toBe(4_400);
    expect(settleRelegationClubObligations(actual.clubs, new Set(["host"]), 38, 2).clubs).toEqual(actual.clubs);
  });
});
