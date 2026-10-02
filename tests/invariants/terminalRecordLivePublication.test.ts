// Failure-first live publication draft; see the preceding 01 failure contract.
import { describe, expect, it } from "vitest";
import type { Club, ClubFinancialObligation, GameState, LoanDeal, Player, StoredLoanDeal } from "@/engine/core/types";
import { getLifecycleWorld, resolvePlayerMovements, withLifecycleWorld, type LifecycleWorldState } from "@/engine/world/playerLifecycle";
import { settleWeeklyClubObligations, settleTriggeredClubObligations, settleRelegationClubObligations } from "@/engine/finance/clubEconomics";
import { expandLoanDeal, expandClubFinancialObligation } from "@/engine/finance/terminalRecordArchive";
import { projectAppliedLoanClosures } from "@/engine/core/weekly/loanClosureFeedback";
import { createRNG } from "@/engine/rng";

function oldLoan(): LoanDeal {
  return { id: "old:loan", playerId: "history-player", parentClubId: "parent", loanClubId: "host",
    startWeek: 1, startSeason: 2, endWeek: 12, endSeason: 2, loanFee: 500,
    wageContribution: 40, recallClause: true, status: "completed", buyOptionFee: 1_000,
    outcome: "successful", agreedPlayingTime: "regular", startCurrentAbility: 72.123456789,
    monitoringWeeks: ["2:4", "2:4"], scoutId: "scout",
    performanceRecord: { appearances: 26, goals: 5, assists: 7, avgRating: 7.125,
      developmentDelta: 7.123456789, parentClubSatisfaction: 86, loanClubSatisfaction: 82 } };
}
// Complete hand-authored wire facts; no test encoder or alternative codec.
function storedOldLoan(): StoredLoanDeal {
  return [1, "old:loan", "history-player", "parent", "host", 1, 2, 12, 2, 500, 40, true,
    "completed", { buyOptionFee: 1_000, outcome: "successful", agreedPlayingTime: "regular",
      startCurrentAbility: 72.123456789, monitoringWeeks: ["2:4", "2:4"], scoutId: "scout",
      performanceRecord: [26, 5, 7, 7.125, 7.123456789, 86, 82] }];
}
function history(stored: boolean): StoredLoanDeal[] {
  const prior = stored ? storedOldLoan() : oldLoan();
  const custom = { ...oldLoan(), id: "custom:loan", authoredAudit: { externalId: "keep-audit" } } as LoanDeal;
  return [prior, custom, prior];
}
function oldObligation(): ClubFinancialObligation {
  return { id: "terminal-audit", type: "appearanceBonus", playerId: "history-player",
    creditorClubId: "parent", amount: 0, percentage: 12.5, weeklyAmount: 0, remainingWeeks: 0,
    createdWeek: 1, createdSeason: 2, status: "settled", trigger: "25 appearances",
    triggeredWeek: 3, triggeredSeason: 2, lastProcessedWeek: 4, lastProcessedSeason: 2,
    appearanceThreshold: 25, goalThreshold: 0, assistThreshold: 0,
    appearancesRecorded: 25, goalsRecorded: 7, assistsRecorded: 9,
    lastTriggerEvaluationWeek: 4, lastTriggerEvaluationSeason: 2 };
}
function storedOldObligation(): NonNullable<Club["financialObligations"]>[number] {
  return { id: "terminal-audit", obligationArchiveV1: [8_388_607,
    "appearanceBonus", "history-player", "parent", 0, 12.5, 0, 0, 1, 2, "settled", "25 appearances",
    3, 2, 4, 2, 25, 0, 0, 25, 7, 9, 4, 2] };
}
function club(id: string, obligations: NonNullable<Club["financialObligations"]> = []): Club {
  return { id, name: id, shortName: id, leagueId: "league", reputation: 55,
    budget: 5_000, weeklyWageBudget: 50_000, scoutingBudget: 250_000,
    scoutingPhilosophy: "academyFirst", managerId: "manager", playerIds: [], academyPlayerIds: [],
    youthAcademyRating: 12, loanedInPlayerIds: [], loanedOutPlayerIds: [], financialObligations: obligations };
}
function activeLoan(): LoanDeal {
  return { ...oldLoan(), id: "new:loan", playerId: "p1", status: "active" };
}
function activeObligation(overrides: Partial<ClubFinancialObligation> = {}): ClubFinancialObligation {
  return { id: "active-debt", type: "loanWageContribution", playerId: "p1", creditorClubId: "parent",
    amount: 200, percentage: 0, weeklyAmount: 200, remainingWeeks: 1,
    createdWeek: 1, createdSeason: 2, status: "active", ...overrides };
}
function mixedClubs(stored: boolean, active = activeObligation()): Record<string, Club> {
  const prior = stored ? storedOldObligation() : oldObligation();
  return { parent: club("parent"), host: club("host", [prior, active, prior]) };
}
// Supported ordinary lifecycle fixture shape, matching existing financial-settlement tests.
function career(stored: boolean): GameState {
  const clubs = mixedClubs(stored, activeObligation({ amount: 600, remainingWeeks: 3 }));
  clubs.parent.loanedOutPlayerIds = ["p1"];
  clubs.host.playerIds = ["p1"];
  clubs.host.loanedInPlayerIds = ["p1"];
  return { currentWeek: 12, currentSeason: 2, scout: { id: "scout", primarySpecialization: "youth" },
    players: { p1: { id: "p1", firstName: "Ari", lastName: "Scout", age: 22, position: "CM",
      clubId: "host", contractClubId: "parent", loanParentClubId: "parent", onLoan: true,
      loanEndWeek: 12, loanEndSeason: 2, contractExpiry: 5, wage: 1_000,
      currentAbility: 72, potentialAbility: 84, morale: 5 } as Player },
    clubs, activeLoans: [activeLoan()], loanHistory: history(stored), retiredPlayers: {},
    retiredPlayerIds: [], playerMovementHistory: [],
    freeAgentPool: { agents: [], lastRefreshSeason: 2, totalReleasedThisSeason: 0,
      totalSignedThisSeason: 0, totalRetiredThisSeason: 0 } } as unknown as GameState;
}
function decodedClubs(clubs: Record<string, Club>): Record<string, Club> {
  return Object.fromEntries(Object.entries(clubs).map(([id, value]) => [id, {
    ...value, financialObligations: value.financialObligations?.map(row => expandClubFinancialObligation(row)),
  }]));
}
function decodedWorld(world: LifecycleWorldState): unknown {
  return { ...world, loanHistory: world.loanHistory.map(row => expandLoanDeal(row)), clubs: decodedClubs(world.clubs) };
}
function expectPriorObligationsStored(clubs: Record<string, Club>, original: Record<string, Club>): void {
  const rows = clubs.host.financialObligations!;
  expect(rows[0]).toBe(original.host.financialObligations![0]);
  expect(rows[2]).toBe(original.host.financialObligations![2]);
  expect(rows[0]).toHaveProperty("obligationArchiveV1");
  expect(rows[2]).toHaveProperty("obligationArchiveV1");
}

describe("terminal archives remain compact through live authoritative publication", () => {
  it("extracts and merges stored prior loans without decoding or copying every row", () => {
    const source = career(true), before = JSON.stringify(source);
    const lifecycle = getLifecycleWorld(source);
    expect(lifecycle.loanHistory).toBe(source.loanHistory);
    for (let index = 0; index < source.loanHistory!.length; index++) {
      expect(lifecycle.loanHistory[index]).toBe(source.loanHistory![index]);
    }
    const merged = withLifecycleWorld(source, lifecycle);
    expect(merged.loanHistory).toBe(lifecycle.loanHistory);
    expect(merged.loanHistory!.map(row => expandLoanDeal(row))).toEqual(history(false));
    expect(JSON.stringify(source)).toBe(before);
  });

  it("retains encoded row identity, duplicates and custom fallback through an empty lifecycle transaction", () => {
    const source = career(true), before = JSON.stringify(source);
    const actual = resolvePlayerMovements(getLifecycleWorld(source), [], 12, 2);
    const expected = resolvePlayerMovements(getLifecycleWorld(career(false)), [], 12, 2);
    expect(actual.applied).toEqual([]);
    expect(actual.rejected).toEqual([]);
    for (let index = 0; index < source.loanHistory!.length; index++) {
      expect(actual.state.loanHistory[index]).toBe(source.loanHistory![index]);
    }
    expect(decodedWorld(actual.state)).toEqual(decodedWorld(expected.state));
    expect(withLifecycleWorld(source, actual.state).loanHistory).toBe(actual.state.loanHistory);
    expect(JSON.stringify(source)).toBe(before);
  });

  it.each(["return", "recall", "buyOption"] as const)("publishes new eligible %s closure and expired wages while retaining prior stored history", (resolution) => {
    const source = career(true), before = JSON.stringify(source);
    const intent = { type: "loanEnd" as const, playerId: "p1", dealId: "new:loan", resolution, outcome: "successful" as const };
    const actual = resolvePlayerMovements(getLifecycleWorld(source), [intent], 12, 2);
    const expected = resolvePlayerMovements(getLifecycleWorld(career(false)), [intent], 12, 2);
    expect(actual.applied).toHaveLength(1);
    expect(actual.rejected).toEqual([]);
    expect(actual.state.activeLoans).toEqual([]);
    expect(actual.state.loanHistory).toHaveLength(4);
    for (let index = 0; index < source.loanHistory!.length; index++) {
      expect(actual.state.loanHistory[index]).toBe(source.loanHistory![index]);
    }
    expect(Array.isArray(actual.state.loanHistory[3])).toBe(true);
    expect(actual.state.clubs.host.financialObligations![1]).toHaveProperty("obligationArchiveV31");
    expect(expandClubFinancialObligation(actual.state.clubs.host.financialObligations![1])).toMatchObject({
      id: "active-debt", amount: 0, remainingWeeks: 0, status: "expired",
    });
    expect(decodedWorld(actual.state)).toEqual(decodedWorld(expected.state));
    expect(actual.applied).toEqual(expected.applied);
    expect(withLifecycleWorld(source, actual.state).loanHistory).toBe(actual.state.loanHistory);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("keeps closed duplicate archives and packs newly settled weekly debt without another payment", () => {
    const source = mixedClubs(true), before = JSON.stringify(source);
    const actual = settleWeeklyClubObligations(source, 12, 2);
    const expected = settleWeeklyClubObligations(mixedClubs(false), 12, 2);
    expectPriorObligationsStored(actual.clubs, source);
    expect(actual.clubs.host.financialObligations![1]).toHaveProperty("obligationArchiveV31");
    expect(actual.processedObligationIds).toEqual(["active-debt"]);
    expect(actual.settledObligationIds).toEqual(["active-debt"]);
    expect(actual.clubs.parent.budget).toBe(5_200);
    expect(actual.clubs.host.budget).toBe(4_800);
    expect(decodedClubs(actual.clubs)).toEqual(decodedClubs(expected.clubs));
    const replay = settleWeeklyClubObligations(actual.clubs, 12, 2);
    expect(replay.clubs).toEqual(actual.clubs);
    expect(replay.processedObligationIds).toEqual([]);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("keeps fixture-triggered terminal storage and exact counters through repeat evaluation", () => {
    const active = activeObligation({ id: "appearance", type: "appearanceBonus", amount: 600,
      appearanceThreshold: 25, appearancesRecorded: 24, goalsRecorded: 0, assistsRecorded: 0 });
    const fixtures = [{ homeClubId: "host", awayClubId: "parent", playerRatings: {
      p1: { playerId: "p1", fixtureId: "fixture-1", rating: 7.1, eventCount: 2,
        stats: {}, source: "simulated" as const },
    } }];
    const source = mixedClubs(true, active), before = JSON.stringify(source);
    const actual = settleTriggeredClubObligations(source, fixtures, 12, 2);
    const expected = settleTriggeredClubObligations(mixedClubs(false, active), fixtures, 12, 2);
    expectPriorObligationsStored(actual.clubs, source);
    expect(actual.clubs.host.financialObligations![1]).toHaveProperty("obligationArchiveV31");
    expect(expandClubFinancialObligation(actual.clubs.host.financialObligations![1])).toMatchObject({
      appearancesRecorded: 25, goalsRecorded: 0, assistsRecorded: 0, amount: 0, status: "settled",
      triggeredWeek: 12, triggeredSeason: 2, lastTriggerEvaluationWeek: 12, lastTriggerEvaluationSeason: 2,
    });
    expect(actual.processedObligationIds).toEqual(["appearance"]);
    expect(actual.clubs.parent.budget).toBe(5_600);
    expect(actual.clubs.host.budget).toBe(4_400);
    expect(decodedClubs(actual.clubs)).toEqual(decodedClubs(expected.clubs));
    expect(settleTriggeredClubObligations(actual.clubs, fixtures, 12, 2).clubs).toEqual(actual.clubs);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("keeps relegation settlement archives with unchanged audit and repeat guards", () => {
    const active = activeObligation({ id: "relegation", type: "relegationClause", amount: 600 });
    const source = mixedClubs(true, active), before = JSON.stringify(source);
    const actual = settleRelegationClubObligations(source, new Set(["host"]), 12, 2);
    const expected = settleRelegationClubObligations(mixedClubs(false, active), new Set(["host"]), 12, 2);
    expectPriorObligationsStored(actual.clubs, source);
    expect(actual.clubs.host.financialObligations![1]).toHaveProperty("obligationArchiveV31");
    expect(expandClubFinancialObligation(actual.clubs.host.financialObligations![1])).toMatchObject({
      amount: 0, status: "settled", triggeredWeek: 12, triggeredSeason: 2,
    });
    expect(actual.processedObligationIds).toEqual(["relegation"]);
    expect(actual.clubs.parent.budget).toBe(5_600);
    expect(actual.clubs.host.budget).toBe(4_400);
    expect(decodedClubs(actual.clubs)).toEqual(decodedClubs(expected.clubs));
    expect(settleRelegationClubObligations(actual.clubs, new Set(["host"]), 12, 2).clubs).toEqual(actual.clubs);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("publishes new sell-on settlement while preserving cash, movement audit and prior stored loans", () => {
    const setup = (stored: boolean) => {
      const source = career(stored);
      source.players.p1 = { ...source.players.p1, clubId: "parent", onLoan: false, loanParentClubId: undefined };
      source.activeLoans = [];
      source.clubs.parent.playerIds = ["p1"];
      source.clubs.host.playerIds = [];
      source.clubs.third = club("third");
      source.clubs.parent.financialObligations = [activeObligation({ id: "sell-on", type: "sellOnClause",
        creditorClubId: "third", amount: 0, percentage: 12.5, weeklyAmount: 0, remainingWeeks: 0 })];
      return source;
    };
    const source = setup(true), before = JSON.stringify(source);
    const intent = { type: "permanentTransfer" as const, playerId: "p1", fromClubId: "parent",
      toClubId: "host", fee: 1_000, wage: 1_000 };
    const actual = resolvePlayerMovements(getLifecycleWorld(source), [intent], 12, 2);
    const expected = resolvePlayerMovements(getLifecycleWorld(setup(false)), [intent], 12, 2);
    expect(actual.applied).toHaveLength(1);
    expect(actual.rejected).toEqual([]);
    expect(actual.state.clubs.parent.financialObligations![0]).toHaveProperty("obligationArchiveV31");
    expect(actual.applied[0].financialSettlements).toEqual([{ type: "sellOnClause", amount: 125,
      creditorClubId: "third", obligationId: "sell-on" }]);
    expect(actual.state.clubs.parent.budget).toBe(5_875);
    expect(actual.state.clubs.host.budget).toBe(4_000);
    expect(actual.state.clubs.third.budget).toBe(5_125);
    expect(decodedWorld(actual.state)).toEqual(decodedWorld(expected.state));
    expect(actual.applied).toEqual(expected.applied);
    for (let index = 0; index < source.loanHistory!.length; index++) {
      expect(actual.state.loanHistory[index]).toBe(source.loanHistory![index]);
    }
    expect(JSON.stringify(source)).toBe(before);
  });


  it.each(["retirement", "release"] as const)("publishes a terminated loan on %s without expanding old histories", (type) => {
    const source = career(true), before = JSON.stringify(source);
    const intent = type === "release"
      ? { type, playerId: "p1", fromClubId: "parent" }
      : { type, playerId: "p1" };
    const actual = resolvePlayerMovements(getLifecycleWorld(source), [intent], 12, 2);
    const expected = resolvePlayerMovements(getLifecycleWorld(career(false)), [intent], 12, 2);
    expect(actual.applied).toHaveLength(1);
    expect(actual.rejected).toEqual([]);
    expect(actual.state.activeLoans).toEqual([]);
    expect(Array.isArray(actual.state.loanHistory[3])).toBe(true);
    expect(expandLoanDeal(actual.state.loanHistory[3])).toMatchObject({
      id: "new:loan", playerId: "p1", status: "terminated", outcome: "terminated",
    });
    expect(actual.state.clubs.host.financialObligations![1]).toHaveProperty("obligationArchiveV31");
    expect(decodedWorld(actual.state)).toEqual(decodedWorld(expected.state));
    expect(actual.applied).toEqual(expected.applied);
    for (let index = 0; index < source.loanHistory!.length; index++) {
      expect(actual.state.loanHistory[index]).toBe(source.loanHistory![index]);
    }
    expect(JSON.stringify(source)).toBe(before);
  });

  it.each(["weekly", "trigger", "relegation"] as const)("retains active ordinary %s shortfall and stored closed rows with exact cash/audit facts", (kind) => {
    const active = activeObligation({ amount: 600, type: kind === "trigger" ? "appearanceBonus"
      : kind === "relegation" ? "relegationClause" : "loanWageContribution",
      appearanceThreshold: 25, appearancesRecorded: 24 });
    const setup = (stored: boolean) => {
      const source = mixedClubs(stored, active);
      source.host.budget = 100;
      return source;
    };
    const fixtures = [{ homeClubId: "host", awayClubId: "parent", playerRatings: {
      p1: { playerId: "p1", fixtureId: "fixture-1", rating: 7.1, eventCount: 2,
        stats: {}, source: "simulated" as const },
    } }];
    const settle = (clubs: Record<string, Club>) => kind === "weekly"
      ? settleWeeklyClubObligations(clubs, 12, 2)
      : kind === "trigger" ? settleTriggeredClubObligations(clubs, fixtures, 12, 2)
      : settleRelegationClubObligations(clubs, new Set(["host"]), 12, 2);
    const source = setup(true), before = JSON.stringify(source);
    const actual = settle(source), expected = settle(setup(false));
    expectPriorObligationsStored(actual.clubs, source);
    expect(actual.clubs.host.financialObligations![1]).not.toHaveProperty("obligationArchiveV1");
    expect(actual.clubs.host.financialObligations![1]).toMatchObject({ amount: 500, status: "active" });
    expect(actual.clubs.parent.budget).toBe(5_100);
    expect(actual.clubs.host.budget).toBe(0);
    expect(actual.processedObligationIds).toEqual(["active-debt"]);
    expect(actual.settledObligationIds).toEqual([]);
    expect(decodedClubs(actual.clubs)).toEqual(decodedClubs(expected.clubs));
    expect(JSON.stringify(source)).toBe(before);
  });

  it("preserves closure reward/message facts and subsequent RNG after stored lifecycle publication", () => {
    const resolve = (stored: boolean) => resolvePlayerMovements(getLifecycleWorld(career(stored)), [{
      type: "loanEnd", playerId: "p1", dealId: "new:loan", resolution: "return", outcome: "successful",
    }], 12, 2);
    const actualResolution = resolve(true), ordinaryResolution = resolve(false);
    const projectInput = (resolved: ReturnType<typeof resolve>, stored: boolean) => ({
      scout: career(stored).scout, previousLoanHistory: history(stored), loanHistory: resolved.state.loanHistory,
      movements: resolved.applied, recommendations: [{ id: "rec-new", playerId: "p1", targetClubId: "host",
        scoutId: "scout", week: 1, season: 2, rationale: "development" as const, suggestedDuration: 12,
        suggestedWageContribution: 40, status: "accepted" as const, reputationApplied: false, loanDealId: "new:loan" }],
      players: resolved.state.players, clubs: resolved.state.clubs, week: 12, season: 2,
    });
    expect(actualResolution.applied).toHaveLength(1);
    expect(Array.isArray(actualResolution.state.loanHistory[3])).toBe(true);
    const actualRng = createRNG("live-terminal-closures"), ordinaryRng = createRNG("live-terminal-closures");
    const actual = projectAppliedLoanClosures(projectInput(actualResolution, true), actualRng);
    const expected = projectAppliedLoanClosures(projectInput(ordinaryResolution, false), ordinaryRng);
    expect(expected.messages).toHaveLength(2);
    expect(expected.reputationDelta).toBeGreaterThan(0);
    expect(expected.xpAward).toBeGreaterThan(0);
    expect(actual).toEqual(expected);
    for (let draw = 0; draw < 16; draw++) expect(actualRng.next()).toBe(ordinaryRng.next());
  });
});
