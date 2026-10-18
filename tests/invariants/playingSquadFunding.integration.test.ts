import "fake-indexeddb/auto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Club, FreeAgent, GameState, Player } from "@/engine/core/types";
import { getSeasonLength } from "@/engine/core/gameDate";
import { advanceWeek, processWeeklyTick } from "@/engine/core/gameLoop";
import { deriveClubWeeklyWageBudget, getClubWeeklyCommitmentTotal, reapproveAnnualClubEconomics } from "@/engine/finance/clubEconomics";
import { compactClubFinancialObligation } from "@/engine/finance/terminalRecordArchive";
import { recruitForSeasonOpening } from "@/engine/freeAgents/seasonOpening";
import { recruitOpeningSquadLoans } from "@/engine/freeAgents/openingLoans";
import { scoreFreeAgentClubInterest } from "@/engine/freeAgents/pool";
import { createRNG } from "@/engine/rng";
import { createVisualIdentity } from "@/engine/players/portraits/identity";
import { getLifecycleWorld, resolvePlayerMovements } from "@/engine/world/playerLifecycle";
import { expandPlayerMovementHistory } from "@/engine/world/movementRowsArchive";
import { deleteSave, loadGame, saveGameWithResult } from "@/lib/db";
import { CURRENT_SAVE_SCHEMA_VERSION } from "@/lib/saveEnvelope";
import { processWeeklySeasonRollover } from "@/stores/actions/weeklySeasonRollover";

// Native IndexedDB below is disposable and in-process. No provider is contacted.
vi.mock("@/lib/activeSaveProvider", () => ({
  getActiveSaveProvider: async () => ({ save: async () => undefined }),
  isSupabaseCloudSaveActive: async () => false,
}));

// These optional quote inputs are part of the before-code contract. Casts allow
// an executable old-API baseline, rather than a missing-export/type-only failure.
const approve = reapproveAnnualClubEconomics as (
  clubs: Record<string, Club>, players: Record<string, Player>, season?: number,
  agents?: readonly FreeAgent[],
) => Record<string, Club>;
const derive = deriveClubWeeklyWageBudget as (
  club: Club, players: Record<string, Player>, agents?: readonly FreeAgent[],
) => number;

let generated: GameState;
let targetId: string;
const SLOT = 4;
beforeAll(async () => {
  const { useGameStore } = await import("@/stores/gameStore");
  await useGameStore.getState().startNewGame({
    scoutFirstName: "Playing", scoutLastName: "Capacity", scoutAge: 28,
    specialization: "youth", difficulty: "normal", worldSeed: "playing-capacity-before-code",
    selectedCountries: ["england"], startingCountry: "england", nationality: "English",
    skillAllocations: { technicalEye: 2, psychologicalRead: 2, playerJudgment: 2, potentialAssessment: 2 },
    originId: "academy-apprentice", flawId: "fragile-network", doctrineIds: ["evidence-first"],
  });
  generated = useGameStore.getState().gameState!;
  targetId = Object.values(generated.clubs).find(club => generated.leagues[club.leagueId]?.country === "England")!.id;
  await deleteSave(SLOT);
}, 60_000);
afterAll(async () => { await deleteSave(SLOT); });

/** A valid single-club opening system drawn from the public new-game world.
 * Expensive retained contracts match the observed funding shape. Country data,
 * season calendar, scout, youth generation and persistence use production code.
 * Other clubs are omitted to keep competing signings/loans out of this case.
 */
function opening(quotes: number[] = [1_000, 1_000]): GameState {
  const state = structuredClone(generated);
  const template = Object.values(state.players).find(player => player.age >= 18)!;
  const target = { ...state.clubs[targetId], reputation: 1, youthAcademyRating: 1,
    budget: 721_028, weeklyWageBudget: 13_250, recruitmentAllocation: undefined,
    playerIds: [] as string[], academyPlayerIds: ["retained-academy"],
    loanedInPlayerIds: [], loanedOutPlayerIds: [], financialObligations: [] };
  state.clubs = { [targetId]: target };
  state.players = {};
  const wages = [3_763, 5_706, 500, 500, 500, 500, 500, 500, 397];
  for (const [index, wage] of wages.entries()) {
    const id = `retained-${index}`;
    state.players[id] = { ...template, id, visualIdentity: createVisualIdentity(id), clubId: targetId, contractClubId: targetId,
      loanParentClubId: undefined, onLoan: undefined, position: index === 0 ? "GK" : "CM",
      age: 24, wage, contractExpiry: 10, injured: false, injuryWeeksRemaining: 0, currentAbility: 2, potentialAbility: 20 };
    target.playerIds.push(id);
  }
  state.players["retained-academy"] = { ...state.players["retained-1"], id: "retained-academy",
    visualIdentity: createVisualIdentity("retained-academy"), age: 16, wage: 100, injured: true, injuryWeeksRemaining: 4 };
  state.freeAgentPool = { ...state.freeAgentPool, agents: quotes.map((wage, index) => {
    const id = `quoted-${index}`;
    state.players[id] = { ...state.players["retained-1"], id, visualIdentity: createVisualIdentity(id), clubId: "", contractClubId: undefined,
      position: index % 2 === 0 ? "LB" : "RB", age: 24, wage: 0 };
    return { playerId: id, country: "england", releasedFrom: "departed-other-club", releasedSeason: 1,
      weeksInPool: 2, maxWeeksInPool: 100, wageExpectation: wage, signingBonusExpectation: 500,
      discoverySource: null, discoveredByScout: false, npcInterest: [], status: "available" };
  }), totalSignedThisSeason: 0, totalReleasedThisSeason: 0, totalRetiredThisSeason: 0 };
  state.activeLoans = []; state.loanHistory = []; state.playerMovementHistory = [];
  state.currentSeason = 2; state.currentWeek = 1;
  return state;
}

function cover(state: GameState) {
  const club = state.clubs[targetId];
  const squad = [...new Set(club.playerIds)].map(id => state.players[id])
    .filter(player => player?.clubId === targetId && player.age >= 16 && player.position);
  return { keeper: squad.filter(player => player.position === "GK").length,
    outfield: squad.filter(player => player.position !== "GK").length };
}

function funded(state: GameState): GameState {
  return { ...state, clubs: approve(state.clubs, state.players, 2, state.freeAgentPool.agents) };
}

function withDonor(state: GameState, wage: number) {
  const parentId = "playing-funding-parent";
  state.clubs[parentId] = { ...state.clubs[targetId], id: parentId, reputation: 30,
    playerIds: [], academyPlayerIds: [], weeklyWageBudget: 100_000 };
  for (let index = 0; index < 19; index++) {
    const id = `donor-${index}`;
    state.players[id] = { ...state.players["retained-1"], id, clubId: parentId, contractClubId: parentId,
      wage: 500, currentAbility: 60, position: index === 0 ? "GK" : "CM" };
    state.clubs[parentId].playerIds.push(id);
  }
  state.players["loan-candidate"] = { ...state.players["quoted-0"], id: "loan-candidate",
    clubId: parentId, contractClubId: parentId, position: "CB", wage, marketValue: 10_000 };
  state.clubs[parentId].playerIds.push("loan-candidate");
  return state;
}

describe("playing-squad funding through annual approval, academy, market and persistence", () => {
  it("derives capacity from real final-week retirement settlement and surviving role quotes", () => {
    const state = opening(Array(8).fill(1_000));
    state.currentSeason = 1; state.currentWeek = getSeasonLength(state.fixtures, 1);
    for (const fixture of Object.values(state.fixtures)) fixture.played = true;
    state.players["actual-retirement"] = { ...state.players["retained-1"], id: "actual-retirement",
      visualIdentity: createVisualIdentity("actual-retirement"), age: 40, wage: 3_000,
      contractExpiry: 1, currentAbility: 30, potentialAbility: 30 };
    state.clubs[targetId].playerIds.push("actual-retirement");
    const before = JSON.stringify(state);
    const rng = createRNG("actual-final-week-capacity"); rng.chance = () => true;
    const tick = processWeeklyTick(state, rng);
    expect(tick.endOfSeasonTriggered).toBe(true);
    expect(tick.playerRetirements?.retiredPlayerIds).toContain("actual-retirement");
    const settled = advanceWeek(state, tick);
    expect(settled.currentSeason).toBe(2);
    expect(settled.currentWeek).toBe(1);
    expect(settled.players["actual-retirement"]).toBeUndefined();
    expect(cover(settled)).toEqual({ keeper: 1, outfield: 8 });
    const commitment = getClubWeeklyCommitmentTotal(settled.clubs[targetId], settled.players);
    expect(commitment).toBe(12_966);
    const quoteCost = settled.freeAgentPool.agents.filter(agent => agent.status === "available"
      && settled.players[agent.playerId]?.position !== "GK")
      .map(agent => Math.max(500, agent.wageExpectation)).sort((a, b) => a - b).slice(0, 2)
      .reduce((sum, wage) => sum + wage, 0);
    expect(quoteCost).toBeGreaterThan(1_000);
    const output = processWeeklySeasonRollover({ state: settled, beforeTick: state, sourceState: state,
      endOfSeasonTriggered: tick.endOfSeasonTriggered, predictionAccuracyBonus: 0 }).state;
    expect(output.clubs[targetId].weeklyWageBudget).toBeGreaterThanOrEqual(commitment + quoteCost);
    expect(cover(output).outfield).toBeGreaterThanOrEqual(10);
    expect(output.clubs[targetId].recruitmentAllocation?.season).toBe(2);
    expect(output.retiredPlayerIds).toContain("actual-retirement");
    expect(JSON.stringify(state)).toBe(before);
  }, 60_000);

  it("funds actual two-role quotes above retained payroll through the genuine rollover and save readback", async () => {
    const state = opening(Array(8).fill(1_000));
    expect(cover(state)).toEqual({ keeper: 1, outfield: 8 });
    expect(getClubWeeklyCommitmentTotal(state.clubs[targetId], state.players)).toBe(12_966);
    for (const agent of state.freeAgentPool.agents) {
      expect(scoreFreeAgentClubInterest(state.players[agent.playerId], state.clubs[targetId], state, agent)).toBeGreaterThanOrEqual(0.25);
    }
    const before = JSON.stringify(state);
    const beforeTick = { ...state, currentSeason: 1, currentWeek: getSeasonLength(state.fixtures, 1) };
    const output = processWeeklySeasonRollover({ state, beforeTick, sourceState: beforeTick,
      endOfSeasonTriggered: true, predictionAccuracyBonus: 0 }).state;
    expect(JSON.stringify(state)).toBe(before);
    expect(output.clubs[targetId].weeklyWageBudget).toBeGreaterThanOrEqual(14_966);
    expect(cover(output).keeper).toBeGreaterThanOrEqual(1);
    expect(cover(output).outfield).toBeGreaterThanOrEqual(10);
    expect(getClubWeeklyCommitmentTotal(output.clubs[targetId], output.players)).toBeLessThanOrEqual(output.clubs[targetId].weeklyWageBudget!);
    for (const id of state.clubs[targetId].playerIds) expect(output.players[id]).toEqual(state.players[id]);
    const movements = expandPlayerMovementHistory(output.playerMovementHistory);
    expect(movements.filter(event => event.type === "freeAgentSigning" && event.toClubId === targetId)).toHaveLength(2);
    expect(approve(output.clubs, output.players, 2, output.freeAgentPool.agents)).toEqual(output.clubs);
    const saved = await saveGameWithResult(SLOT, "Playing capacity regression", output);
    const loaded = (await loadGame(SLOT))!;
    expect(saved.record.schemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    expect(cover(loaded)).toEqual(cover(output));
    expect(loaded.clubs[targetId].weeklyWageBudget).toBe(output.clubs[targetId].weeklyWageBudget);
    expect(loaded.clubs[targetId].budget).toBe(output.clubs[targetId].budget);
    expect(loaded.clubs[targetId].recruitmentAllocation).toEqual(output.clubs[targetId].recruitmentAllocation);
    expect(getClubWeeklyCommitmentTotal(loaded.clubs[targetId], loaded.players)).toBe(getClubWeeklyCommitmentTotal(output.clubs[targetId], output.players));
    expect(expandPlayerMovementHistory(loaded.playerMovementHistory)).toEqual(movements);
    expect(approve(loaded.clubs, loaded.players, 2, loaded.freeAgentPool.agents)).toEqual(loaded.clubs);
  }, 60_000);

  it("does not let a dear first offer strand the remaining ordinary role quote", () => {
    const state = opening([1_500, 1_000, 1_000]);
    state.clubs[targetId].weeklyWageBudget = 14_966;
    const before = JSON.stringify(state);
    const rng = createRNG("dear-first-before-code");
    rng.chance = () => true;
    rng.pickWeighted = options => options[0].item;
    const result = recruitForSeasonOpening(state, rng);
    expect(result.players["quoted-0"].clubId).toBe("");
    expect(cover(result)).toEqual({ keeper: 1, outfield: 10 });
    expect(result.players["quoted-1"].wage).toBe(1_000);
    expect(result.players["quoted-2"].wage).toBe(1_000);
    expect(JSON.stringify(state)).toBe(before);
  });

  it.each([600, 1_500])("enforces remaining real quote capacity at authoritative settlement (offer %i)", wage => {
    const state = opening([wage, 1_000]);
    state.clubs[targetId].weeklyWageBudget = 12_966 + wage + 999;
    const result = resolvePlayerMovements(getLifecycleWorld(state), [{ type: "freeAgentSigning",
      playerId: "quoted-0", toClubId: targetId, wage, signingBonus: 500, contractLength: 3,
      preserveSquadWageReserve: true }], 1, 2);
    expect(result.applied).toEqual([]);
    expect(result.rejected).toHaveLength(1);
    expect(result.state.players["quoted-0"].clubId).toBe("");
    expect(result.state.clubs[targetId].budget).toBe(state.clubs[targetId].budget);
  });

  it.each(["empty", "declining"])("retains ordinary unavailable-market outcomes: %s", mode => {
    const state = funded(opening(mode === "empty" ? [] : [1_000, 1_000]));
    const rng = createRNG(mode); rng.chance = () => false;
    const result = recruitForSeasonOpening(state, rng);
    expect(result).toBe(state);
    expect(cover(result)).toEqual({ keeper: 1, outfield: 8 });
    expect(expandPlayerMovementHistory(result.playerMovementHistory)).toEqual([]);
  });

  it.each([500, 5_000])("prices ordinary opening loans by contribution and protects the remaining quote (parent wage %i)", wage => {
    const state = withDonor(opening(), wage);
    state.clubs[targetId].weeklyWageBudget = 12_966 + 2_499;
    const rng = createRNG("ordinary-loan-contribution"); rng.chance = () => true;
    const result = recruitOpeningSquadLoans(state, rng);
    const loans = result.activeLoans!.filter(deal => deal.loanClubId === targetId);
    expect(loans).toHaveLength(wage === 500 ? 1 : 0);
    expect(result.clubs["playing-funding-parent"].playerIds).toHaveLength(wage === 500 ? 19 : 20);
    if (wage === 500) {
      expect(result.players["loan-candidate"].wage).toBe(500);
      expect(getClubWeeklyCommitmentTotal(result.clubs[targetId], result.players)).toBeLessThanOrEqual(13_166);
    }
  });

  it("reads back a funded real rollover through the production save journal", async () => {
    const state = opening();
    state.clubs[targetId].weeklyWageBudget = 20_000;
    state.clubs[targetId].recruitmentAllocation = { season: 2, amount: 66_000,
      budgetBefore: state.clubs[targetId].budget - 66_000, budgetAfter: state.clubs[targetId].budget };
    const beforeTick = { ...state, currentSeason: 1, currentWeek: getSeasonLength(state.fixtures, 1) };
    const output = processWeeklySeasonRollover({ state, beforeTick, sourceState: beforeTick,
      endOfSeasonTriggered: true, predictionAccuracyBonus: 0 }).state;
    expect(cover(output).outfield).toBeGreaterThanOrEqual(10);
    const saved = await saveGameWithResult(SLOT, "Funded control before repair", output);
    const loaded = (await loadGame(SLOT))!;
    expect(saved.record.schemaVersion).toBe(10);
    expect(cover(loaded)).toEqual(cover(output));
    expect(loaded.clubs[targetId].weeklyWageBudget).toBe(output.clubs[targetId].weeklyWageBudget);
    expect(loaded.clubs[targetId].budget).toBe(output.clubs[targetId].budget);
    expect(approve(loaded.clubs, loaded.players, 2, loaded.freeAgentPool.agents)).toEqual(loaded.clubs);
    expect(getClubWeeklyCommitmentTotal(loaded.clubs[targetId], loaded.players)).toBe(getClubWeeklyCommitmentTotal(output.clubs[targetId], output.players));
    expect(expandPlayerMovementHistory(loaded.playerMovementHistory)).toEqual(expandPlayerMovementHistory(output.playerMovementHistory));
  }, 60_000);
});

describe("real role capacity before annual formula changes", () => {
  it("preserves a playable squad's existing envelope and ordinary discretionary intake", () => {
    const state = opening([90_000, 90_000]);
    for (const id of ["healthy-0", "healthy-1"]) {
      state.players[id] = { ...state.players["retained-1"], id, wage: 500, visualIdentity: createVisualIdentity(id) };
      state.clubs[targetId].playerIds.push(id);
    }
    expect(cover(state)).toEqual({ keeper: 1, outfield: 10 });
    expect(derive(state.clubs[targetId], state.players, state.freeAgentPool.agents)).toBe(15_350);
    const beforeTick = { ...state, currentSeason: 1, currentWeek: getSeasonLength(state.fixtures, 1) };
    const output = processWeeklySeasonRollover({ state, beforeTick, sourceState: beforeTick,
      endOfSeasonTriggered: true, predictionAccuracyBonus: 0 }).state;
    expect(output.clubs[targetId].weeklyWageBudget).toBe(15_350);
    const intake = Object.values(output.players).filter(player => !state.players[player.id]
      && player.contractClubId === targetId);
    expect(intake.length).toBeGreaterThanOrEqual(2);
    expect(getClubWeeklyCommitmentTotal(output.clubs[targetId], output.players)).toBeLessThanOrEqual(15_350);
  });

  it("uses the first stored quote for a conflicting duplicate ID in both funding and opening", () => {
    const state = opening([2_000, 2_000]);
    state.freeAgentPool.agents.push({ ...state.freeAgentPool.agents[0], wageExpectation: 100 });
    expect(derive(state.clubs[targetId], state.players, state.freeAgentPool.agents)).toBe(17_000);
    const approved = funded(state);
    const rng = createRNG("duplicate-quote-authority"); rng.chance = () => true;
    rng.pickWeighted = options => options.reduce((cheapest, entry) =>
      (entry.item as FreeAgent).wageExpectation < (cheapest.item as FreeAgent).wageExpectation ? entry : cheapest).item;
    const output = recruitForSeasonOpening(approved, rng);
    expect(output.players["quoted-0"].wage).toBe(2_000);
    expect(output.players["quoted-1"].wage).toBe(2_000);
    expect(cover(output)).toEqual({ keeper: 1, outfield: 10 });
  });

  it("rounds upward enough for ongoing commitments plus distinct actual quotes", () => {
    const state = opening();
    const derived = derive(state.clubs[targetId], state.players, state.freeAgentPool.agents);
    expect(derived).toBeGreaterThanOrEqual(14_966);
    expect(derived).toBeLessThan(15_016);
    expect(derived % 50).toBe(0);
    expect(funded(state).clubs[targetId].weeklyWageBudget).toBe(derived);
  });

  it("keeps owned academy and away payroll, charges active compact obligations, and excludes settled debt", () => {
    const state = opening([2_000, 2_000]);
    state.players.away = { ...state.players["retained-1"], id: "away", clubId: "other", onLoan: true,
      loanParentClubId: targetId, wage: 700 };
    state.clubs[targetId].loanedOutPlayerIds = ["away"];
    const debt = { id: "loan-debt", playerId: "borrowed", type: "loanWageContribution" as const,
      creditorClubId: "other", weeklyAmount: 300, amount: 12_000, remainingWeeks: 40,
      createdWeek: 1, createdSeason: 2, status: "active" as const };
    state.clubs[targetId].financialObligations = [compactClubFinancialObligation(debt),
      compactClubFinancialObligation({ ...debt, id: "settled-debt", weeklyAmount: 90_000, status: "settled" }),
      compactClubFinancialObligation({ ...debt, id: "expired-debt", weeklyAmount: 90_000, status: "expired" })];
    expect(getClubWeeklyCommitmentTotal(state.clubs[targetId], state.players)).toBe(13_966);
    const value = derive(state.clubs[targetId], state.players, state.freeAgentPool.agents);
    expect(value).toBeGreaterThanOrEqual(17_966);
    expect(value).toBeLessThan(18_016);
  });

  it("counts a registered loanee as cover without charging its parent's whole wage", () => {
    const state = opening([2_000, 2_000]);
    state.players.borrowed = { ...state.players["retained-1"], id: "borrowed", clubId: targetId,
      contractClubId: "parent", loanParentClubId: "parent", onLoan: true, wage: 90_000 };
    state.clubs[targetId].playerIds.push("borrowed");
    state.clubs[targetId].financialObligations = [{ id: "borrowed-cost", playerId: "borrowed", type: "loanWageContribution",
      weeklyAmount: 300, amount: 12_000, remainingWeeks: 40, createdWeek: 1, createdSeason: 2, status: "active" }];
    expect(getClubWeeklyCommitmentTotal(state.clubs[targetId], state.players)).toBe(13_266);
    const value = derive(state.clubs[targetId], state.players, state.freeAgentPool.agents);
    expect(value).toBeGreaterThanOrEqual(15_266);
    expect(value).toBeLessThan(15_316);
  });

  it("does not erase vacancies with stale, duplicate, other-club, underage or unregistered cover", () => {
    const state = opening([2_000, 2_000]);
    state.players.child = { ...state.players["retained-1"], id: "child", age: 15, wage: 0 };
    state.players.away = { ...state.players["retained-1"], id: "away", clubId: "other", onLoan: true, wage: 0 };
    state.players.positionless = { ...state.players["retained-1"], id: "positionless", position: undefined as unknown as Player["position"], wage: 0 };
    state.clubs[targetId].playerIds.push("child", "away", "positionless", "missing", "retained-1");
    const value = derive(state.clubs[targetId], state.players, state.freeAgentPool.agents);
    expect(value).toBeGreaterThanOrEqual(16_966);
    expect(value).toBeLessThan(17_016);
  });

  it.each([16, 17])("preserves existing registered senior cover at age %i", age => {
    const state = opening([2_000, 2_000]);
    state.players.registered = { ...state.players["retained-1"], id: "registered", age, wage: 0 };
    state.clubs[targetId].playerIds.push("registered");
    const value = derive(state.clubs[targetId], state.players, state.freeAgentPool.agents);
    expect(value).toBeGreaterThanOrEqual(14_966);
    expect(value).toBeLessThan(15_016);
  });

  it("uses one eligible quote per real player and rejects malformed or ineligible supply", () => {
    const state = opening([1_000, 2_000]);
    const [first] = state.freeAgentPool.agents;
    state.freeAgentPool.agents.push(...Array(10).fill({ ...first }));
    for (const [index, reason] of ["age", "owner", "loan", "former", "reputation", "status", "wage", "bonus"].entries()) {
      const id = `invalid-${index}`;
      state.players[id] = { ...state.players["quoted-0"], id };
      const agent = { ...first, playerId: id, wageExpectation: 100 };
      if (reason === "age") state.players[id].age = 17;
      if (reason === "owner") state.players[id].contractClubId = targetId;
      if (reason === "loan") state.players[id].onLoan = true;
      if (reason === "former") agent.releasedFrom = targetId;
      if (reason === "reputation") state.players[id].currentAbility = 100;
      if (reason === "status") agent.status = "retired";
      if (reason === "wage") agent.wageExpectation = Number.NaN;
      if (reason === "bonus") agent.signingBonusExpectation = -1;
      state.freeAgentPool.agents.push(agent);
    }
    const value = derive(state.clubs[targetId], state.players, state.freeAgentPool.agents);
    expect(value).toBeGreaterThanOrEqual(15_966);
    expect(value).toBeLessThan(16_016);
  });

  it("retains specialist quote capacity when extra keepers cannot fill outfield gaps", () => {
    const state = opening([2_000, 2_000]);
    state.players.secondKeeper = { ...state.players["retained-0"], id: "secondKeeper", wage: 0 };
    state.clubs[targetId].playerIds.push("secondKeeper");
    expect(derive(state.clubs[targetId], state.players, state.freeAgentPool.agents)).toBeGreaterThanOrEqual(16_966);
    const withoutKeeper = opening([1_800]);
    withoutKeeper.players["retained-0"].position = "CM";
    withoutKeeper.players["quoted-0"].position = "GK";
    // Nine outfields plus a keeper quote: reserve the keeper and one ordinary fallback.
    expect(derive(withoutKeeper.clubs[targetId], withoutKeeper.players, withoutKeeper.freeAgentPool.agents)).toBeGreaterThanOrEqual(15_266);
  });

  it("keeps hard financial caps and saved current/future annual allocations", () => {
    const state = opening([2_000, 2_000]);
    state.players["retained-0"].wage = 10_001_000;
    const approved = funded(state);
    expect(approved.clubs[targetId].weeklyWageBudget).toBe(10_000_000);
    const rng = createRNG("capped"); rng.chance = () => true;
    expect(recruitForSeasonOpening(approved, rng)).toBe(approved);
    const current = funded(opening());
    const saved = JSON.parse(JSON.stringify(current)) as GameState;
    saved.clubs[targetId].budget -= 2_000;
    expect(approve(saved.clubs, saved.players, 2, saved.freeAgentPool.agents)).toEqual(saved.clubs);
    expect(approve(saved.clubs, saved.players, 1, saved.freeAgentPool.agents)).toEqual(saved.clubs);
  });

  it("uses one world ownership scan for batch approval and agrees with direct derivation", () => {
    const state = opening();
    let scans = 0;
    const players = new Proxy(state.players, { ownKeys: target => { scans++; return Reflect.ownKeys(target); } });
    const clubs = { ...state.clubs };
    for (let index = 0; index < 20; index++) {
      const id = `empty-${index}`;
      clubs[id] = { ...state.clubs[targetId], id, playerIds: [], academyPlayerIds: [] };
    }
    const before = JSON.stringify({ clubs, players: state.players });
    const approved = approve(clubs, players, 2, state.freeAgentPool.agents);
    expect(scans).toBe(1);
    for (const [id, club] of Object.entries(clubs)) expect(approved[id].weeklyWageBudget).toBe(derive(club, state.players, state.freeAgentPool.agents));
    expect(JSON.stringify({ clubs, players: state.players })).toBe(before);
  });
});
