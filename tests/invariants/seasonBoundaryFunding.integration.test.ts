import { beforeAll, describe, expect, it, vi } from "vitest";
import type { GameState, Player } from "@/engine/core/types";
import { getSeasonLength } from "@/engine/core/gameDate";
import { processWeeklyTick } from "@/engine/core/gameLoop";
import { reapproveAnnualClubEconomics } from "@/engine/finance/clubEconomics";
import { projectSeasonEndRecruitmentState } from "@/engine/freeAgents/seasonEndPlanning";
import { createRNG } from "@/engine/rng";
import { processWeeklySeasonRollover } from "@/stores/actions/weeklySeasonRollover";

vi.mock("@/lib/activeSaveProvider", () => ({
  getActiveSaveProvider: async () => ({ save: async () => undefined }),
  isSupabaseCloudSaveActive: async () => false,
}));
vi.mock("@/lib/db", () => ({
  AUTOSAVE_SLOT: 0, migrateSaveState: (state: unknown) => state,
  migrateFreeAgentGeography: () => undefined,
  db: { mods: { toArray: async () => [] }, leaderboard: { put: async () => undefined, clear: async () => undefined } },
}));

let generated: GameState;
let targetId: string;
beforeAll(async () => {
  const { useGameStore } = await import("@/stores/gameStore");
  await useGameStore.getState().startNewGame({
    scoutFirstName: "Boundary", scoutLastName: "Funding", scoutAge: 28,
    specialization: "youth", difficulty: "normal", worldSeed: "boundary-funding-regression",
    selectedCountries: ["england"], startingCountry: "england", nationality: "English",
    skillAllocations: { technicalEye: 2, psychologicalRead: 2, playerJudgment: 2, potentialAssessment: 2 },
    originId: "academy-apprentice", flawId: "fragile-network", doctrineIds: ["evidence-first"],
  });
  generated = useGameStore.getState().gameState!;
  targetId = Object.values(generated.clubs).find(club => generated.leagues[club.leagueId]?.country === "England")!.id;
}, 60_000);

function stateWithRoster(positions: Array<Player["position"]>, headroom: number): GameState {
  const state = structuredClone(generated);
  const target = state.clubs[targetId];
  for (const [id, player] of Object.entries(state.players)) {
    if ((player.contractClubId ?? player.loanParentClubId ?? player.clubId) === targetId) delete state.players[id];
  }
  target.playerIds = positions.map((position, index) => {
    const id = `boundary-member-${index}`;
    const template = Object.values(state.players)[0];
    state.players[id] = { ...template, id, clubId: targetId, contractClubId: targetId,
      contractExpiry: 5, position, age: 24, wage: 0, onLoan: undefined, loanParentClubId: undefined };
    return id;
  });
  target.academyPlayerIds = []; target.loanedOutPlayerIds = []; target.loanedInPlayerIds = [];
  target.financialObligations = []; target.reputation = 13; target.youthAcademyRating = 1;
  target.weeklyWageBudget = headroom; target.budget = 100_000;
  // A saved, already approved annual allocation exercises the idempotent path.
  target.recruitmentAllocation = { season: 2, amount: 66_000, budgetBefore: 34_000, budgetAfter: 100_000 };
  state.currentSeason = 2; state.currentWeek = 1;
  state.activeLoans = state.activeLoans!.filter(deal => deal.parentClubId !== targetId && deal.loanClubId !== targetId);
  return state;
}

function roll(state: GameState) {
  const before = JSON.stringify(state);
  const beforeTick = { ...state, currentSeason: 1, currentWeek: getSeasonLength(generated.fixtures, 1) };
  const output = processWeeklySeasonRollover({ state, beforeTick, sourceState: beforeTick,
    endOfSeasonTriggered: true, predictionAccuracyBonus: 0 }).state;
  const admitted = Object.values(output.players).filter(player => !state.players[player.id]
    && (player.contractClubId ?? player.clubId) === targetId);
  expect(JSON.stringify(state)).toBe(before);
  expect(reapproveAnnualClubEconomics(output.clubs, output.players, 2)).toEqual(output.clubs);
  return { output, admitted, wages: admitted.reduce((total, player) => total + player.wage, 0) };
}

describe("annual academy funding through the production rollover", () => {
  it.each([
    ["missing goalkeeper", Array(10).fill("CM"), 1_000],
    ["one outfield vacancy", ["GK", ...Array(9).fill("CM")], 500],
    ["two outfield vacancies", ["GK", ...Array(8).fill("CM")], 1_000],
    ["both role vacancies", Array(9).fill("CM"), 1_500],
    ["spare keeper is not outfield cover", ["GK", "GK", ...Array(9).fill("CM")], 500],
  ])("leaves playing-role funds intact for %s", (_name, positions, headroom) => {
    const result = roll(stateWithRoster(positions as Player["position"][], headroom as number));
    expect(result.admitted).toEqual([]);
  });

  it("admits only discretionary wages above the specialist reserve", () => {
    const result = roll(stateWithRoster(Array(10).fill("CM"), 1_100));
    expect(result.wages).toBeLessThanOrEqual(100);
  });

  it.each([10, 16, 24])("keeps a playable squad's academy cohort with %s outfield members", count => {
    const result = roll(stateWithRoster(["GK", ...Array(count).fill("CM")], 1_000));
    expect(result.admitted.length).toBeGreaterThanOrEqual(2);
    expect(result.wages).toBeLessThanOrEqual(1_000);
  });

  it("does not count stale, duplicate, underage or loaned-out registrations as cover", () => {
    const state = stateWithRoster(["GK", ...Array(9).fill("CM")], 700);
    const target = state.clubs[targetId];
    const template = state.players[target.playerIds[1]];
    const otherId = Object.keys(state.clubs).find(id => id !== targetId)!;
    state.players.child = { ...template, id: "child", age: 14 };
    state.players.away = { ...template, id: "away", clubId: otherId, onLoan: true, loanParentClubId: targetId, wage: 200 };
    target.playerIds.push("child", "away", "missing", target.playerIds[1]);
    target.loanedOutPlayerIds = ["away"];
    const result = roll(state);
    expect(result.admitted).toEqual([]); // 700 - owned away wage200 - one playing slot500.
  });

  it("subtracts loan contribution obligations before protecting the playing reserve", () => {
    const state = stateWithRoster(["GK", ...Array(9).fill("CM")], 800);
    state.clubs[targetId].financialObligations = [{ id: "borrow-cost", type: "loanWageContribution",
      playerId: "borrowed", creditorClubId: "other", amount: 300, weeklyAmount: 300,
      remainingWeeks: 1, createdWeek: 1, createdSeason: 2, status: "active" }];
    expect(roll(state).admitted).toEqual([]);
  });
});

describe("known retirement funding through the production core tick", () => {
  it.each([false, true])("does not fund a known retiring specialist before a viable renewal (expiring=%s)", expiring => {
    const state = stateWithRoster(["GK", "GK"], 700);
    state.currentSeason = 1; state.currentWeek = getSeasonLength(state.fixtures, 1);
    for (const fixture of Object.values(state.fixtures)) fixture.played = true;
    const [retiringId, continuingId] = state.clubs[targetId].playerIds;
    state.players[retiringId] = { ...state.players[retiringId], age: 40, contractExpiry: expiring ? 1 : 5,
      currentAbility: 30, potentialAbility: 30, wage: expiring ? 500 : 5_000 };
    state.players[continuingId] = { ...state.players[continuingId], age: 24, contractExpiry: 1,
      currentAbility: 26, potentialAbility: 40, wage: 500, morale: 7 };
    const rng = createRNG(`known-retirement-${expiring}`);
    rng.chance = () => true;
    const before = JSON.stringify(state);
    const tick = processWeeklyTick(state, rng);
    expect(tick.endOfSeasonTriggered).toBe(true);
    expect(tick.playerRetirements?.retiredPlayerIds).toContain(retiringId);
    expect(tick.contractExpiryResult?.renewals.map(renewal => renewal.playerId)).toContain(continuingId);
    expect(tick.contractExpiryResult?.renewals.map(renewal => renewal.playerId)).not.toContain(retiringId);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("does not charge a known retiring borrowed player's contribution against another keeper renewal", () => {
    const state = stateWithRoster(["GK", "GK"], 700);
    state.currentSeason = 1; state.currentWeek = getSeasonLength(state.fixtures, 1);
    for (const fixture of Object.values(state.fixtures)) fixture.played = true;
    const [retiringId, continuingId] = state.clubs[targetId].playerIds;
    const parentId = Object.keys(state.clubs).find(id => id !== targetId)!;
    state.players[retiringId] = { ...state.players[retiringId], age: 40, contractClubId: parentId,
      loanParentClubId: parentId, onLoan: true, contractExpiry: 5, currentAbility: 30, potentialAbility: 30, wage: 5_000 };
    state.players[continuingId] = { ...state.players[continuingId], age: 24, contractExpiry: 1,
      currentAbility: 26, potentialAbility: 40, wage: 500, morale: 7 };
    state.clubs[targetId].financialObligations = [{ id: "retiring-contribution", type: "loanWageContribution",
      playerId: retiringId, creditorClubId: parentId, amount: 2_500, weeklyAmount: 2_500,
      remainingWeeks: 1, createdWeek: 1, createdSeason: 1, status: "active" }];
    state.clubs[targetId].loanedInPlayerIds = [retiringId];
    state.clubs[parentId].loanedOutPlayerIds = [...(state.clubs[parentId].loanedOutPlayerIds ?? []), retiringId];
    state.activeLoans!.push({ id: "retiring-loan", playerId: retiringId, parentClubId: parentId,
      loanClubId: targetId, startWeek: 1, startSeason: 1, endWeek: state.currentWeek, endSeason: 1,
      loanFee: 0, wageContribution: 50, recallClause: false, status: "active" });
    const rng = createRNG("known-retiring-loanee"); rng.chance = () => true;
    const tick = processWeeklyTick(state, rng);
    expect(tick.playerRetirements?.retiredPlayerIds).toContain(retiringId);
    expect(tick.contractExpiryResult?.renewals.map(renewal => renewal.playerId)).toContain(continuingId);
  });

  it("projects only explicit terminal loan contributions and preserves other obligations and source facts", () => {
    const state = stateWithRoster(["GK"], 700);
    const id = state.clubs[targetId].playerIds[0];
    const loan = { id: "known-loan", playerId: id, parentClubId: "other", loanClubId: targetId,
      startWeek: 1, startSeason: 1, endWeek: 46, endSeason: 2, loanFee: 0, wageContribution: 50,
      recallClause: false, status: "active" as const };
    state.activeLoans!.push(loan);
    const contribution = { id: "known-contribution", type: "loanWageContribution" as const,
      playerId: id, creditorClubId: "other", amount: 100, weeklyAmount: 100, remainingWeeks: 1,
      createdWeek: 1, createdSeason: 2, status: "active" as const };
    const other = { ...contribution, id: "other-contribution", playerId: "other-player" };
    const addOn = { ...contribution, id: "retained-add-on", type: "appearanceBonus" as const };
    state.clubs[targetId].financialObligations = [contribution, other, addOn];
    const before = JSON.stringify(state);
    // Cast preserves an executable failure-first baseline while the old API has three arguments.
    const project = projectSeasonEndRecruitmentState as (...args: unknown[]) => GameState;
    const projected = project(state, new Set([id]), [], new Set([id]));
    expect(projected.clubs[targetId].financialObligations).toEqual([other, addOn]);
    expect(project(state, new Set([id]), []).clubs[targetId].financialObligations).toEqual([contribution, other, addOn]);
    expect(JSON.stringify(state)).toBe(before);
  });
});
