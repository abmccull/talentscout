import { afterEach, describe, expect, it, vi } from "vitest";
import type { Club, GameState, LoanDeal, LoanRecommendation, NewGameConfig, Player } from "@/engine/core/types";
import { RNG } from "@/engine/rng";
import { generatePlayer } from "@/engine/players/generation";
import { createScout } from "@/engine/scout/creation";
import { applyScoutSkillXp } from "@/engine/scout/progression";
import { processLoanOutcomeReputation } from "@/engine/firstTeam/loanIntegration";
import * as loans from "@/engine/world/loans";
import { resolvePlayerMovements, type LifecycleWorldState } from "@/engine/world/playerLifecycle";
import { settleLoanClosures, type DeferredLoanClosure } from "@/engine/world/loanClosureSettlement";
import { runWeeklyLoanPhase } from "@/engine/core/weekly/tickPhases";
import { advanceWeek, type TickResult } from "@/engine/core/gameLoop";

vi.mock("@/lib/activeSaveProvider", () => ({
  getActiveSaveProvider: async () => ({ save: async () => undefined, saveState: async () => undefined }),
  isSupabaseCloudSaveActive: async () => false,
}));
vi.mock("@/lib/db", () => ({ AUTOSAVE_SLOT: 0, migrateSaveState: (state: unknown) => state,
  migrateFreeAgentGeography: () => undefined,
  db: { mods: { toArray: async () => [] }, leaderboard: { put: async () => undefined, clear: async () => undefined } },
}));

const config: NewGameConfig = { scoutFirstName: "Loan", scoutLastName: "Ledger", scoutAge: 30,
  specialization: "youth", difficulty: "normal", worldSeed: "loan-closure-ledger",
  startingCountry: "england", selectedCountries: ["england"],
  skillAllocations: { technicalEye: 2, physicalAssessment: 1, psychologicalRead: 1,
    tacticalUnderstanding: 1, dataLiteracy: 1, playerJudgment: 1, potentialAssessment: 1 } };

function fixture() {
  const scout = { ...createScout(config, new RNG("closure-scout")), reputation: 30 };
  const club = (id: string, reputation: number): Club => ({ id, name: id, shortName: id,
    leagueId: "league", managerId: "manager", reputation, budget: 100_000, weeklyWageBudget: 8_000,
    youthAcademyRating: 10, scoutingPhilosophy: "academyFirst", playerIds: [], academyPlayerIds: [],
    loanedInPlayerIds: [], loanedOutPlayerIds: [], financialObligations: [] });
  const clubs = { parent: club("parent", 13), buyer: club("buyer", 80) };
  const players: Record<string, Player> = {};
  const activeLoans: LoanDeal[] = [];
  const recommendations: LoanRecommendation[] = [];
  const prepared: DeferredLoanClosure[] = [];
  for (const index of [1, 2]) {
    const player = { ...generatePlayer(new RNG(`closure-player-${index}`), {
      position: "CM", ageRange: [24, 24], abilityRange: [40, 40], nationality: "English",
      clubId: "parent", clubReputation: 13, currentSeason: 2,
    }), clubId: "buyer", contractClubId: "parent", loanParentClubId: "parent", onLoan: true, wage: 1_000 };
    players[player.id] = player;
    clubs.parent.loanedOutPlayerIds!.push(player.id);
    clubs.buyer.playerIds.push(player.id);
    clubs.buyer.loanedInPlayerIds!.push(player.id);
    clubs.buyer.financialObligations!.push({ id: `obligation-${index}`, type: "loanWageContribution",
      playerId: player.id, creditorClubId: "parent", amount: 400, weeklyAmount: 400, remainingWeeks: 1,
      createdWeek: 1, createdSeason: 2, status: "active" });
    const deal: LoanDeal = { id: `loan-${index}`, playerId: player.id, parentClubId: "parent", loanClubId: "buyer",
      startWeek: 1, startSeason: 2, endWeek: 6, endSeason: 2, loanFee: 0, wageContribution: 40,
      buyOptionFee: 1_000, recallClause: true, status: "active", performanceRecord: {
        appearances: 5, goals: 1, assists: 0, avgRating: 7, developmentDelta: 2,
        parentClubSatisfaction: 80, loanClubSatisfaction: 80,
      } };
    activeLoans.push(deal);
    recommendations.push({ id: `recommendation-${index}`, loanDealId: deal.id, playerId: player.id,
      targetClubId: "buyer", scoutId: scout.id, week: 1, season: 2, rationale: "development",
      suggestedDuration: 5, suggestedWageContribution: 40, status: "accepted", reputationApplied: false });
    prepared.push({ loanDealId: deal.id, recommendationId: `recommendation-${index}`,
      feedbackMessageId: `feedback-${index}`, movementMessage: { id: `movement-${index}`,
        week: 6, season: 2, type: "transferUpdate", title: "Proposed buy", body: "Uncommitted buy",
        read: false, actionRequired: false, relatedId: player.id, relatedEntityType: "player" } });
  }
  const world: LifecycleWorldState = { players, clubs, activeLoans, loanHistory: [], retiredPlayers: {},
    retiredPlayerIds: [], playerMovementHistory: [], freeAgentPool: { agents: [], lastRefreshSeason: 1,
      totalReleasedThisSeason: 0, totalSignedThisSeason: 0, totalRetiredThisSeason: 0 } };
  const input = { scout, recommendations, prepared, players, clubs, inbox: [], week: 6, season: 2 };
  return { world, input };
}

afterEach(() => vi.restoreAllMocks());

describe("applied loan closure accountability", () => {
  it("settles the actual purchase and competing-cost return, preserving messages and rewards exactly once", () => {
    const { world, input } = fixture();
    const resolution = resolvePlayerMovements(world, world.activeLoans.map((deal) => ({
      type: "loanEnd", playerId: deal.playerId, dealId: deal.id, resolution: "buyOption",
      outcome: "buy-option-exercised",
    })), 6, 2);
    expect(resolution.applied.map((movement) => movement.type)).toEqual(["loanBuyOption", "loanReturn"]);
    const settled = settleLoanClosures({ ...input, players: resolution.state.players,
      applied: resolution.applied, loanHistory: resolution.state.loanHistory });
    expect(settled.reputationDelta).toBe(13);
    expect(settled.xpAward).toBe(80);
    expect(settled.recommendations.map((item) => item.outcome)).toEqual(["buy-option-exercised", "successful"]);
    expect(settled.recommendations.every((item) => item.status === "completed" && item.reputationApplied)).toBe(true);
    expect(settled.messages.map((message) => message.id)).toEqual(["movement-1", "feedback-1", "movement-2", "feedback-2"]);
    expect(settled.messages[2].title).toMatch(/^Loan Return:/);
    expect(settled.messages[3].body).not.toContain("option to buy");
    expect(settled.messages[3].body).toContain("(+5 reputation, +30 XP)");
    const replay = settleLoanClosures({ ...input, players: resolution.state.players,
      recommendations: settled.recommendations, inbox: settled.messages,
      applied: resolution.applied, loanHistory: resolution.state.loanHistory });
    expect(replay).toMatchObject({ reputationDelta: 0, xpAward: 0, messages: [] });
  });

  it("requires applied movement and matching closed history, and never pays a purchase superseded by retirement", () => {
    const { world, input } = fixture();
    const deal = world.activeLoans[0];
    const retired = resolvePlayerMovements(world, [
      { type: "loanEnd", playerId: deal.playerId, dealId: deal.id, resolution: "buyOption" },
      { type: "retirement", playerId: deal.playerId },
    ], 6, 2);
    expect(retired.applied.map((event) => event.type)).toEqual(["retirement"]);
    const termination = settleLoanClosures({ ...input, applied: retired.applied, loanHistory: retired.state.loanHistory });
    expect(termination).toMatchObject({ reputationDelta: 0, xpAward: 0, messages: [] });
    expect(termination.recommendations[0]).toMatchObject({ status: "completed", outcome: "terminated", reputationApplied: true });
    expect(termination.recommendations[1]).toEqual(input.recommendations[1]);
    const returned = resolvePlayerMovements(world, [{ type: "loanEnd", playerId: deal.playerId,
      dealId: deal.id, resolution: "return", outcome: "successful" }], 6, 2);
    expect(settleLoanClosures({ ...input, applied: returned.applied, loanHistory: [] }).messages).toEqual([]);
    expect(settleLoanClosures({ ...input, applied: [], loanHistory: returned.state.loanHistory }).messages).toEqual([]);
  });

  it("settles a real recall, while another scout receives no accountability reward", () => {
    const { world, input } = fixture();
    const deal = world.activeLoans[0];
    const recalled = resolvePlayerMovements(world, [{ type: "loanEnd", playerId: deal.playerId,
      dealId: deal.id, resolution: "recall" }], 5, 2);
    const own = settleLoanClosures({ ...input, applied: recalled.applied, loanHistory: recalled.state.loanHistory });
    expect(own).toMatchObject({ reputationDelta: -1, xpAward: 5 });
    expect(own.recommendations[0].outcome).toBe("recalled-early");
    const other = settleLoanClosures({ ...input,
      recommendations: input.recommendations.map((item) => ({ ...item, scoutId: "someone-else" })),
      applied: recalled.applied, loanHistory: recalled.state.loanHistory });
    expect(other).toMatchObject({ reputationDelta: 0, xpAward: 0 });
    expect(other.messages).toHaveLength(1);
  });

  it("reserves the legacy message IDs and RNG continuation without prepaying closure rewards", () => {
    const { world, input } = fixture();
    const state = { ...world, scout: input.scout, loanRecommendations: input.recommendations,
      currentWeek: 6, currentSeason: 2, fixtures: {} } as GameState;
    const actualRng = new RNG("closure-rng-parity");
    const phase = runWeeklyLoanPhase(state, actualRng, [], false);
    const referenceRng = new RNG("closure-rng-parity");
    const updated = loans.processLoanPerformance(state, 6, 2, [], 46);
    const returns = loans.processLoanReturns({ ...state, activeLoans: updated }, 6, 2, referenceRng, 46);
    const feedback = returns.deals.map((deal) => processLoanOutcomeReputation(input.scout,
      input.recommendations.find((item) => item.loanDealId === deal.id), deal.outcome!, deal,
      state.players[deal.playerId], 6, 2, referenceRng));
    expect(actualRng.next()).toBe(referenceRng.next());
    expect(phase.deferredLoanClosures.map((closure) => closure.movementMessage?.id)).toEqual(returns.messages.map((message) => message.id));
    expect(phase.deferredLoanClosures.map((closure) => closure.feedbackMessageId)).toEqual(feedback.map((reward) => reward.message.id));
    expect(phase).toMatchObject({ loanOutcomeReputation: 0, loanOutcomeXp: 0, loanMessages: [],
      updatedLoanRecommendations: input.recommendations });
  });

  it("keeps newly accepted AI-loan XP separate from deferred closure rewards", () => {
    const { world, input } = fixture();
    vi.spyOn(loans, "processAILoanDeals").mockReturnValue({ deals: [], messages: [],
      updatedRecommendations: input.recommendations, reputationDelta: 3, xpAward: 15 });
    const state = { ...world, scout: input.scout, loanRecommendations: input.recommendations,
      currentWeek: 6, currentSeason: 2, fixtures: {} } as GameState;
    const phase = runWeeklyLoanPhase(state, new RNG("ai-start-separation"), [], true);
    expect(phase.loanOutcomeXp).toBe(15);
    expect(phase.loanDealResult.reputationDelta).toBe(3);
    expect(phase.updatedLoanRecommendations.every((item) => !item.reputationApplied)).toBe(true);
  });

  it("applies closure totals and completed recommendations through advanceWeek without losing accepted-start XP", async () => {
    const { useGameStore } = await import("@/stores/gameStore");
    await useGameStore.getState().startNewGame(config);
    const generated = useGameStore.getState().gameState!;
    const { world, input } = fixture();
    const state: GameState = { ...generated, ...world, currentWeek: 6, currentSeason: 2,
      scout: input.scout, loanRecommendations: input.recommendations, inbox: [] };
    const tick: TickResult = { fixturesPlayed: [], standingsUpdated: false, playerDevelopment: [],
      unsignedYouthDevelopment: [], breakthroughs: [], transfers: [], injuries: [], newMessages: [],
      reputationChange: 0, injurySetbacks: [], endOfSeasonTriggered: false, npcScoutResults: [],
      formMomentumUpdates: [], satisfactionDeltas: [], loanReturns: world.activeLoans.map((deal) =>
        ({ ...deal, status: "completed", outcome: "buy-option-exercised" })),
      updatedActiveLoans: world.activeLoans, updatedLoanRecommendations: input.recommendations,
      deferredLoanClosures: input.prepared, loanOutcomeXp: 15 };
    const advanced = advanceWeek(state, tick);
    expect(advanced.activeLoans).toEqual([]);
    expect(advanced.loanRecommendations?.map((item) => item.status)).toEqual(["completed", "completed"]);
    expect(advanced.scout.reputation).toBe(input.scout.reputation + 13);
    const expectedScout = applyScoutSkillXp(input.scout, { potentialAssessment: 95 });
    expect(advanced.scout.skillXp).toEqual(expectedScout.skillXp);
    expect(advanced.scout.skills).toEqual(expectedScout.skills);
    expect(advanced.inbox.find((message) => message.id === "movement-2")?.title).toMatch(/^Loan Return:/);
    expect(advanced.inbox.find((message) => message.id === "feedback-2")?.body).toContain("(+5 reputation, +30 XP)");
    const retired = advanceWeek(state, { ...tick,
      playerRetirements: { retiredPlayerIds: [world.activeLoans[0].playerId], outlooks: {} } });
    expect(retired.loanRecommendations?.[0]).toMatchObject({ status: "completed", outcome: "terminated", reputationApplied: true });
    expect(retired.inbox.some((message) => message.id === "feedback-1" || message.id === "movement-1")).toBe(false);
    expect(retired.scout.reputation).toBe(input.scout.reputation + 8);
  }, 60_000);
});
