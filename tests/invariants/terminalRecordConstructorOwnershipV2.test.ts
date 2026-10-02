// Preceding financial contracts: real constructors and public closure APIs only.
// Test-only option control consumes the same seeded draw on both paired paths.
import { describe, expect, it } from "vitest";
import type { Club, ClubFinancialObligation, GameState, LoanDeal, LoanRecommendation, Player, StoredLoanDeal, TransferAddOn } from "@/engine/core/types";
import { calculateLoanTerms } from "@/engine/world/loans";
import { resolvePlayerMovements, type LifecycleWorldState, type PlayerMovementIntent } from "@/engine/world/playerLifecycle";
import { buildLoanWageContributionObligation, buildTransferAddOnObligations, normalizeClubEconomicsMap,
  settleWeeklyClubObligations, settleTriggeredClubObligations, settleRelegationClubObligations } from "@/engine/finance/clubEconomics";
import { compactLoanDeal, expandLoanDeal, compactClubFinancialObligation, expandClubFinancialObligation } from "@/engine/finance/terminalRecordArchive";
import { projectAppliedLoanClosures } from "@/engine/core/weekly/loanClosureFeedback";
import { createRNG } from "@/engine/rng";

const json = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const bytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const scout = { id: "scout", primarySpecialization: "youth" } as GameState["scout"];
const performance = { appearances: 26, goals: 5, assists: 7, avgRating: 7.125, developmentDelta: 7.123456789,
  parentClubSatisfaction: 86.123456789, loanClubSatisfaction: 82 };
function player(): Player {
  return { id: "p1", firstName: "Ari", lastName: "Scout", age: 22, position: "CM", clubId: "parent",
    contractClubId: "parent", contractExpiry: 5, wage: 1_000, marketValue: 1_000,
    currentAbility: 72, potentialAbility: 84, morale: 5 } as Player;
}
function oldLoan(stored: boolean): StoredLoanDeal {
  const row: StoredLoanDeal = [1, "old:loan", "historical", "parent", "host", 1, 1, 12, 1, 500, 40, true,
    "completed", { outcome: "successful", monitoringWeeks: ["1:4", "1:4"], performanceRecord: [26, 5, 7, 7.125, 7.123456789, 86.123456789, 82] }];
  return stored ? row : expandLoanDeal(row);
}
function oldObligation(stored: boolean): NonNullable<Club["financialObligations"]>[number] {
  const row: NonNullable<Club["financialObligations"]>[number] = { id: "old:audit",
    obligationArchiveV1: [899, "appearanceBonus", "historical", 1, 1, "settled"] };
  return stored ? row : expandClubFinancialObligation(row);
}
function club(id: string, obligations: NonNullable<Club["financialObligations"]> = []): Club {
  return { id, name: id, shortName: id, leagueId: "league", reputation: 55, budget: 1_000_000,
    weeklyWageBudget: 50_000, scoutingBudget: 250_000, scoutingPhilosophy: "academyFirst", managerId: "manager",
    playerIds: id === "parent" ? ["p1"] : [], academyPlayerIds: [], youthAcademyRating: 12,
    loanedInPlayerIds: [], loanedOutPlayerIds: [], financialObligations: obligations };
}
function world(stored: boolean): LifecycleWorldState {
  const prior = oldLoan(stored), custom = { ...expandLoanDeal(oldLoan(false)), id: "custom:loan", authoredAudit: { externalId: "keep" } } as LoanDeal;
  const debt = oldObligation(stored);
  return { players: { p1: player() }, clubs: { parent: club("parent"), host: club("host", [debt, debt]) },
    activeLoans: [], loanHistory: [prior, custom, prior], retiredPlayers: {}, retiredPlayerIds: [], playerMovementHistory: [],
    freeAgentPool: { agents: [], lastRefreshSeason: 2, totalReleasedThisSeason: 0, totalSignedThisSeason: 0, totalRetiredThisSeason: 0 } };
}
function decodedClubs(clubs: Record<string, Club>): Record<string, Club> {
  return Object.fromEntries(Object.entries(clubs).map(([id, value]) => [id, {
    ...value, financialObligations: value.financialObligations?.map(row => expandClubFinancialObligation(row)),
  }]));
}
function decodedWorld(value: LifecycleWorldState): unknown {
  return { ...value, clubs: decodedClubs(value.clubs), loanHistory: value.loanHistory.map(row => expandLoanDeal(row)) };
}
function ownUndefined(value: object, key: string): void {
  expect(Object.getOwnPropertyDescriptor(value, key)).toEqual({ value: undefined, enumerable: true, writable: true, configurable: true });
}
function expectPriorRows(actual: LifecycleWorldState, input: LifecycleWorldState, includeObligations = true): void {
  for (let index = 0; index < 3; index++) expect(actual.loanHistory[index]).toBe(input.loanHistory[index]);
  expect(actual.loanHistory[0]).toBe(actual.loanHistory[2]);
  if (includeObligations) {
    expect(actual.clubs.host.financialObligations![0]).toBe(input.clubs.host.financialObligations![0]);
    expect(actual.clubs.host.financialObligations![1]).toBe(input.clubs.host.financialObligations![1]);
  }
}
function constructor(stored: boolean, withOption: boolean): { input: LifecycleWorldState; deal: LoanDeal; rng: ReturnType<typeof createRNG> } {
  const input = world(stored), rng = createRNG(`owned-constructor:${withOption}`);
  // Explicit test input; consume the real chance draw even when choosing the option branch.
  rng.chance = probability => { const draw = rng.next(); return probability === 0.2 ? withOption : draw < probability; };
  const terms = calculateLoanTerms(input.players.p1, input.clubs.parent, input.clubs.host, 1, 2, rng);
  expect(Object.hasOwn(terms, "buyOptionFee")).toBe(true);
  if (withOption) expect(terms.buyOptionFee).toBeGreaterThan(0); else ownUndefined(terms, "buyOptionFee");
  const deal: LoanDeal = { ...terms, id: "new:loan", status: "active", agreedPlayingTime: "regular", scoutId: "scout",
    startCurrentAbility: 72.123456789, monitoringWeeks: ["2:1", "2:1", "2:4"], performanceRecord: { ...performance } };
  expect(compactLoanDeal(deal)).toBe(deal);
  return { input, deal, rng };
}
const closureCases = ([false, true] as const).flatMap(withOption =>
  (["return", "recall", "retirement", "release", "footballExit", ...(withOption ? ["buyOption" as const] : [])] as const)
    .map(kind => ({ withOption, kind })));

describe("real financial constructors preserve terminal ownership through closure", () => {
  it.each(closureCases)("publishes actual constructor option=$withOption/$kind without changing cash, audits, ownership or RNG", ({ withOption, kind }) => {
    const actualSetup = constructor(true, withOption), controlSetup = constructor(false, withOption);
    expect(actualSetup.deal).toEqual(controlSetup.deal);
    const sourceBefore = Object.getOwnPropertyDescriptors(actualSetup.deal), inputBefore = JSON.stringify(actualSetup.input);
    const startIntent = (deal: LoanDeal): PlayerMovementIntent => ({ type: "loanStart", playerId: "p1", deal });
    const started = resolvePlayerMovements(actualSetup.input, [startIntent(actualSetup.deal)], 1, 2);
    const ordinaryStarted = resolvePlayerMovements(controlSetup.input, [startIntent(controlSetup.deal)], 1, 2);
    expect(started.rejected).toEqual([]); expect(started.applied).toHaveLength(1);
    expect(started.state.players.p1).toMatchObject({ clubId: "host", contractClubId: "parent", onLoan: true });
    expect(started.state.activeLoans).toHaveLength(1);
    expect(started.state.activeLoans[0].monitoringWeeks).toEqual(["2:1", "2:1", "2:4"]);
    expect(started.state.activeLoans[0].performanceRecord).toEqual(performance);
    expectPriorRows(started.state, actualSetup.input, false);
    const week = actualSetup.deal.endWeek, season = actualSetup.deal.endSeason;
    const intent: PlayerMovementIntent = kind === "return" || kind === "recall" || kind === "buyOption"
      ? { type: "loanEnd", playerId: "p1", dealId: actualSetup.deal.id, resolution: kind, outcome: "successful" }
      : kind === "release" ? { type: "release", playerId: "p1", fromClubId: "parent" }
      : { type: kind, playerId: "p1" };
    const actual = resolvePlayerMovements(started.state, [intent], week, season);
    const expected = resolvePlayerMovements(ordinaryStarted.state, [intent], week, season);
    expect(actual.rejected).toEqual([]); expect(actual.applied).toHaveLength(1);
    expect(actual.state.activeLoans).toEqual([]); expect(actual.state.loanHistory).toHaveLength(4);
    const stored = actual.state.loanHistory[3];
    expect(Array.isArray(stored)).toBe(true); expect((stored as unknown[])[0]).toBe(withOption ? 1 : 2);
    if (!withOption) expect((stored as unknown[])[13]).toBe(1);
    const decoded = expandLoanDeal(json(stored));
    expect(decoded.monitoringWeeks).toEqual(["2:1", "2:1", "2:4"]); expect(decoded.performanceRecord).toEqual(performance);
    if (!withOption) ownUndefined(decoded, "buyOptionFee"); else expect(decoded.buyOptionFee).toBe(actualSetup.deal.buyOptionFee);
    expect(decoded.status).toBe(kind === "recall" ? "recalled" : kind === "return" || kind === "buyOption" ? "completed" : "terminated");
    const wage = actual.state.clubs.host.financialObligations![2];
    expect(wage).toHaveProperty("obligationArchiveV2");
    const decodedWage = expandClubFinancialObligation(json(wage));
    expect(decodedWage).toMatchObject({ type: "loanWageContribution", playerId: "p1", amount: 0, remainingWeeks: 0, status: "expired", createdWeek: 1, createdSeason: 2 });
    ownUndefined(decodedWage, "percentage"); expect(bytes(wage)).toBeLessThan(bytes(decodedWage));
    expectPriorRows(started.state, actualSetup.input); expectPriorRows(actual.state, started.state);
    const optionPayment = kind === "buyOption" ? actualSetup.deal.buyOptionFee! : 0;
    expect(actual.state.clubs.parent.budget).toBe(1_000_000 + actualSetup.deal.loanFee + optionPayment);
    expect(actual.state.clubs.host.budget).toBe(1_000_000 - actualSetup.deal.loanFee - optionPayment);
    expect(actual.applied[0]).toMatchObject({ playerId: "p1", loanDealId: "new:loan", week, season });
    expect(actual.state.playerMovementHistory).toHaveLength(2);
    if (kind === "return" || kind === "recall" || kind === "buyOption") {
      const owner = kind === "buyOption" ? "host" : "parent", other = owner === "host" ? "parent" : "host";
      expect(actual.state.players.p1).toMatchObject({ clubId: owner, contractClubId: owner });
      expect(actual.state.players.p1.onLoan).toBeUndefined();
      expect(actual.state.clubs[owner].playerIds).toContain("p1"); expect(actual.state.clubs[other].playerIds).not.toContain("p1");
    } else if (kind === "release") {
      expect(actual.state.players.p1).toMatchObject({ clubId: "", contractExpiry: 0, wage: 0 });
      expect(actual.state.players.p1.onLoan).toBeUndefined();
      expect(actual.state.players.p1.contractClubId).toBeUndefined();
    } else {
      expect(actual.state.players.p1).toBeUndefined(); expect(actual.state.retiredPlayerIds).toContain("p1");
      expect(actual.state.retiredPlayers.p1).toBeDefined();
    }
    expect(decodedWorld(actual.state)).toEqual(decodedWorld(expected.state)); expect(actual.applied).toEqual(expected.applied);
    expect(Object.getOwnPropertyDescriptors(actualSetup.deal)).toEqual(sourceBefore);
    expect(JSON.stringify(actualSetup.input)).toBe(inputBefore);
    for (let draw = 0; draw < 16; draw++) expect(actualSetup.rng.next()).toBe(controlSetup.rng.next());

    const recommendation: LoanRecommendation = { id: "rec", playerId: "p1", targetClubId: "host", scoutId: "scout", week: 1, season: 2,
      rationale: "development", suggestedDuration: 12, suggestedWageContribution: 40, status: "accepted", reputationApplied: false, loanDealId: "new:loan" };
    const input = { scout, previousLoanHistory: started.state.loanHistory, loanHistory: actual.state.loanHistory,
      movements: [...actual.applied, ...actual.applied], recommendations: [recommendation], players: actual.state.players,
      clubs: actual.state.clubs, week, season };
    const ordinaryInput = { ...input, previousLoanHistory: started.state.loanHistory.map(row => expandLoanDeal(row)),
      loanHistory: actual.state.loanHistory.map(row => expandLoanDeal(row)) };
    const actualRng = createRNG("owned-feedback"), ordinaryRng = createRNG("owned-feedback");
    const feedback = projectAppliedLoanClosures(input, actualRng), ordinaryFeedback = projectAppliedLoanClosures(ordinaryInput, ordinaryRng);
    expect(feedback).toEqual(ordinaryFeedback);
    expect(feedback.messages).toHaveLength(kind === "return" || kind === "recall" || kind === "buyOption" ? 2 : 0);
    expect(feedback.reputationDelta).toBe(kind === "return" ? 7 : kind === "recall" ? 1 : kind === "buyOption" ? 10 : 0);
    expect(feedback.xpAward).toBe(kind === "return" ? 40 : kind === "recall" ? 15 : kind === "buyOption" ? 60 : 0);
    if (kind === "return" || kind === "recall" || kind === "buyOption") expect(feedback.updatedRecommendations[0]).toMatchObject({ status: "completed", reputationApplied: true });
    const repeat = projectAppliedLoanClosures({ ...input, previousLoanHistory: actual.state.loanHistory,
      recommendations: feedback.updatedRecommendations }, actualRng);
    expect(repeat.messages).toEqual([]); expect(repeat.reputationDelta).toBe(0); expect(repeat.xpAward).toBe(0);
    for (let draw = 0; draw < 16; draw++) expect(actualRng.next()).toBe(ordinaryRng.next());
    const attemptedAgain = resolvePlayerMovements(actual.state, [intent], week, season);
    if (intent.type === "loanEnd") {
      expect(attemptedAgain.applied).toEqual([]); expect(attemptedAgain.rejected).toHaveLength(1);
      expect(attemptedAgain.state.clubs.host.budget).toBe(actual.state.clubs.host.budget);
      expect(attemptedAgain.state.clubs.parent.budget).toBe(actual.state.clubs.parent.budget);
      expect(attemptedAgain.state.loanHistory).toHaveLength(4);
    }
  });

  it.each(["weekly", "appearanceBonus", "performanceBonus", "relegationClause"] as const)("settles real %s constructor after active normalization with one payment and exact original undefined ownership", kind => {
    const raw = kind === "weekly" ? buildLoanWageContributionObligation({ playerId: "p1", creditorClubId: "parent",
      weeklyAmount: 600, remainingWeeks: 1, currentWeek: 1, currentSeason: 2 })
      : buildTransferAddOnObligations({ playerId: "p1", creditorClubId: "parent", currentWeek: 1, currentSeason: 2,
        addOns: [{ type: kind, value: 600, trigger: kind === "appearanceBonus" ? "1 appearance" : kind === "performanceBonus" ? "1 goal or 1 assist" : "relegation" } as TransferAddOn] })[0];
    if (kind === "weekly") expect(Object.hasOwn(raw, "percentage")).toBe(false); else ownUndefined(raw, "percentage");
    const descriptors = Object.getOwnPropertyDescriptors(raw);
    const prior = oldObligation(true), clubs = { parent: club("parent"), host: club("host", [prior, raw, prior]) };
    const normalized = normalizeClubEconomicsMap(clubs, {}, { currentWeek: 2, currentSeason: 2 });
    const active = normalized.host.financialObligations![1] as ClubFinancialObligation;
    expect(active.status).toBe("active"); ownUndefined(active, "percentage");
    expect(compactClubFinancialObligation(active)).toBe(active);
    const fixtures = [{ homeClubId: "host", awayClubId: "parent", playerRatings: { p1: {
      playerId: "p1", fixtureId: "f1", rating: 7.125, eventCount: 2, stats: { goals: 1, assists: 1 }, source: "simulated" as const,
    } } }];
    const settle = (input: Record<string, Club>) => kind === "weekly" ? settleWeeklyClubObligations(input, 2, 2)
      : kind === "relegationClause" ? settleRelegationClubObligations(input, new Set(["host"]), 2, 2)
      : settleTriggeredClubObligations(input, fixtures, 2, 2);
    const actual = settle(normalized), control = settle(decodedClubs(normalized));
    expect(actual.processedObligationIds).toEqual([raw.id]); expect(actual.settledObligationIds).toEqual([raw.id]);
    const stored = actual.clubs.host.financialObligations![1]; expect(stored).toHaveProperty("obligationArchiveV2");
    const decoded = expandClubFinancialObligation(json(stored));
    expect(decoded).toEqual(expandClubFinancialObligation(control.clubs.host.financialObligations![1]));
    ownUndefined(decoded, "percentage"); expect(decoded).toMatchObject({ amount: 0, status: "settled", createdWeek: 1, createdSeason: 2 });
    if (kind === "weekly") expect(decoded).toMatchObject({ remainingWeeks: 0, lastProcessedWeek: 2, lastProcessedSeason: 2 });
    else expect(decoded).toMatchObject({ triggeredWeek: 2, triggeredSeason: 2 });
    if (kind === "appearanceBonus" || kind === "performanceBonus") expect(decoded).toMatchObject({ appearancesRecorded: 1,
      goalsRecorded: 1, assistsRecorded: 1, lastTriggerEvaluationWeek: 2, lastTriggerEvaluationSeason: 2 });
    expect(bytes(stored)).toBeLessThan(bytes(decoded));
    expect(actual.clubs.host.financialObligations![0]).toBe(prior); expect(actual.clubs.host.financialObligations![2]).toBe(prior);
    expect(actual.clubs.host.budget).toBe(999_400); expect(actual.clubs.parent.budget).toBe(1_000_600);
    expect(decodedClubs(actual.clubs)).toEqual(decodedClubs(control.clubs));
    const repeat = settle(actual.clubs); expect(repeat.clubs).toEqual(actual.clubs);
    expect(repeat.processedObligationIds).toEqual([]); expect(repeat.settledObligationIds).toEqual([]);
    expect(Object.getOwnPropertyDescriptors(raw)).toEqual(descriptors);
    const shortfall = settle({ ...normalized, host: { ...normalized.host, budget: 100 } });
    const unpaid = shortfall.clubs.host.financialObligations![1];
    expect(unpaid).not.toHaveProperty("obligationArchiveV1"); expect(unpaid).not.toHaveProperty("obligationArchiveV2");
    expect(unpaid).toMatchObject({ amount: 500, status: "active" }); ownUndefined(unpaid, "percentage");
    expect(shortfall.clubs.host.budget).toBe(0); expect(shortfall.clubs.parent.budget).toBe(1_000_100);
    expect(shortfall.settledObligationIds).toEqual([]); expect(compactClubFinancialObligation(unpaid)).toBe(unpaid);
    expect(settle(shortfall.clubs).clubs).toEqual(shortfall.clubs);
  });

  it("settles a real sell-on constructor with exact proceeds, prior duplicate order and no repeated charge", () => {
    const raw = buildTransferAddOnObligations({ playerId: "p1", creditorClubId: "third", currentWeek: 1, currentSeason: 2,
      addOns: [{ type: "sellOnClause", value: 12.5, trigger: "future sale" }] })[0];
    ownUndefined(raw, "amount"); ownUndefined(raw, "appearanceThreshold"); ownUndefined(raw, "goalsRecorded");
    const before = Object.getOwnPropertyDescriptors(raw), input = world(true), prior = oldObligation(true);
    input.clubs.parent.financialObligations = [prior, raw, prior]; input.clubs.third = club("third");
    const intent: PlayerMovementIntent = { type: "permanentTransfer", playerId: "p1", fromClubId: "parent", toClubId: "host", fee: 1_000, wage: 1_000 };
    const actual = resolvePlayerMovements(input, [intent], 2, 2);
    const control = resolvePlayerMovements({ ...input, clubs: decodedClubs(input.clubs),
      loanHistory: input.loanHistory.map(row => expandLoanDeal(row)) }, [intent], 2, 2);
    expect(actual.rejected).toEqual([]); expect(actual.applied).toHaveLength(1);
    expect(actual.applied[0].financialSettlements).toEqual([{ type: "sellOnClause", amount: 125, creditorClubId: "third", obligationId: raw.id }]);
    const rows = actual.state.clubs.parent.financialObligations!;
    expect(rows[1]).toHaveProperty("obligationArchiveV2"); expect(rows[0]).toBe(prior); expect(rows[2]).toBe(prior);
    const decoded = expandClubFinancialObligation(json(rows[1]));
    expect(decoded).toMatchObject({ amount: 0, remainingWeeks: 0, percentage: 12.5, status: "settled", createdWeek: 1, createdSeason: 2 });
    ownUndefined(decoded, "weeklyAmount"); ownUndefined(decoded, "appearanceThreshold"); ownUndefined(decoded, "goalsRecorded");
    expect(bytes(rows[1])).toBeLessThan(bytes(decoded));
    expect(actual.state.clubs.parent.budget).toBe(1_000_875); expect(actual.state.clubs.host.budget).toBe(999_000);
    expect(actual.state.clubs.third.budget).toBe(1_000_125);
    expect(actual.state.players.p1).toMatchObject({ clubId: "host", contractClubId: "host" });
    expect(decodedWorld(actual.state)).toEqual(decodedWorld(control.state)); expect(actual.applied).toEqual(control.applied);
    for (let index = 0; index < 3; index++) expect(actual.state.loanHistory[index]).toBe(input.loanHistory[index]);
    expect(Object.getOwnPropertyDescriptors(raw)).toEqual(before);
    const repeated = resolvePlayerMovements(actual.state, [intent], 2, 2);
    expect(repeated.applied).toEqual([]); expect(repeated.rejected).toHaveLength(1);
    expect(repeated.state.clubs.parent.budget).toBe(actual.state.clubs.parent.budget);
    expect(repeated.state.clubs.host.budget).toBe(actual.state.clubs.host.budget);
    expect(repeated.state.clubs.third.budget).toBe(actual.state.clubs.third.budget);
  });
});
