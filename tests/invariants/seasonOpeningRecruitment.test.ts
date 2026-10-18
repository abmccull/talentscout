import { expandPlayerMovementHistory } from "@/engine/world/movementRowsArchive";
import { expect, it } from "vitest";
import type { GameState } from "@/engine/core/types";
import { RNG } from "@/engine/rng";
import { recruitForSeasonOpening } from "@/engine/freeAgents/seasonOpening";

function world(): GameState {
  const players = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`p-${index}`, {
    id: `p-${index}`, clubId: "club", contractClubId: "club", position: "CM", age: 24,
    contractExpiry: 5, wage: 500, currentAbility: 100,
  }]));
  return {
    seed: "opening-market", currentSeason: 3, currentWeek: 1, managerProfiles: {}, leagues: {},
    players: { ...players, keeper: { id: "keeper", firstName: "Alex", lastName: "Keeper", clubId: "", position: "GK", age: 25, currentAbility: 100 } },
    clubs: { club: { id: "club", name: "Club", shortName: "CLU", leagueId: "league", reputation: 55,
      budget: 10_000, weeklyWageBudget: 10_000, scoutingPhilosophy: "marketSmart", youthAcademyRating: 10,
      managerId: "manager", playerIds: Object.keys(players) } },
    freeAgentPool: { agents: [{ playerId: "keeper", status: "available", weeksInPool: 2, maxWeeksInPool: 100,
      wageExpectation: 500, signingBonusExpectation: 1_000, npcInterest: [] }],
      totalSignedThisSeason: 0, totalRetiredThisSeason: 0, totalReleasedThisSeason: 0 },
  } as unknown as GameState;
}

it("fills a funded vacancy through the lifecycle without advancing the market clock or changing existing contracts", () => {
  const state = world(), original = JSON.stringify(state);
  const rng = new RNG("opening-contract"); rng.chance = () => true;
  const result = recruitForSeasonOpening(state, rng);
  expect(result.clubs.club.playerIds).toHaveLength(11);
  expect(result.players.keeper).toMatchObject({ clubId: "club", contractClubId: "club", wage: 500, contractExpiry: 6 });
  expect(result.clubs.club.budget).toBe(9_000);
  expect(result.freeAgentPool.agents).toEqual([]);
  expect(result.freeAgentPool.totalSignedThisSeason).toBe(1);
  expect(state.freeAgentPool.agents[0]).toMatchObject({ weeksInPool: 2, wageExpectation: 500 });
  expect(expandPlayerMovementHistory(result.playerMovementHistory)).toHaveLength(1);
  expect(result.players['p-0']).toEqual(state.players['p-0']);
  expect(JSON.stringify(state)).toBe(original);
  expect(recruitForSeasonOpening(result, new RNG("repeat"))).toBe(result);
});

it("does not force an agreement, invent cover, or spend beyond cash or wages", () => {
  for (const reason of ["declines", "no-cash", "no-wages", "negotiating"] as const) {
    const state = world();
    if (reason === "no-cash") state.clubs.club.budget = 0;
    if (reason === "no-wages") state.clubs.club.weeklyWageBudget = 5_000;
    if (reason === "negotiating") state.freeAgentPool.agents[0].status = "inNegotiation";
    const rng = new RNG(reason); rng.chance = () => reason !== "declines";
    expect(recruitForSeasonOpening(state, rng)).toBe(state);
  }
});

it("cannot allocate the same free agent to competing clubs", () => {
  const state = world();
  const otherIds = Array.from({ length: 10 }, (_, index) => `other-${index}`);
  state.clubs.other = { ...state.clubs.club, id: "other", playerIds: otherIds };
  for (const id of otherIds) state.players[id] = { ...state.players['p-0'], id, clubId: "other", contractClubId: "other" };
  const rng = new RNG("competing-clubs"); rng.chance = () => true;
  const result = recruitForSeasonOpening(state, rng);
  expect(Object.values(result.clubs).filter(club => club.playerIds.includes("keeper"))).toHaveLength(1);
  expect(expandPlayerMovementHistory(result.playerMovementHistory)).toHaveLength(1);
  expect(result.freeAgentPool.totalSignedThisSeason).toBe(1);
  expect(Object.keys(result.players)).toHaveLength(Object.keys(state.players).length);
});

it("notifies the scout about a discovered free agent without exposing unknown market activity", () => {
  for (const discoveredByScout of [true, false]) {
    const state = world(); state.freeAgentPool.agents[0].discoveredByScout = discoveredByScout;
    const rng = new RNG("known-signing"); rng.chance = () => true;
    const result = recruitForSeasonOpening(state, rng);
    expect(result.inbox ?? []).toHaveLength(discoveredByScout ? 1 : 0);
    if (discoveredByScout) {
      expect(result.inbox[0]).toMatchObject({ relatedId: "keeper", relatedEntityType: "player", title: "Alex Keeper Signs with Club",
        season: 3, week: 1, read: false, actionRequired: false });
      expect(recruitForSeasonOpening(result, new RNG("repeat-notice")).inbox).toEqual(result.inbox);
    }
  }
});


it("recruits affordable bench depth to eighteen without stockpiling keepers", () => {
  const state = world();
  state.clubs.club.weeklyWageBudget = 20_000;
  state.clubs.club.budget = 50_000;
  for (let i = 0; i < 15; i++) {
    const id = `depth-${i}`;
    state.players[id] = { ...state.players.keeper, id, position: i < 4 ? "GK" : "CM" };
    state.freeAgentPool.agents.push({ ...state.freeAgentPool.agents[0], playerId: id });
  }
  const original = JSON.stringify(state);
  const rng = new RNG("opening-depth"); rng.chance = () => true;
  const result = recruitForSeasonOpening(state, rng);
  expect(result.clubs.club.playerIds).toHaveLength(18);
  expect(result.clubs.club.playerIds.filter(id => result.players[id].position === "GK").length).toBeLessThanOrEqual(2);
  expect(result.freeAgentPool.totalSignedThisSeason).toBe(8);
  expect(result.clubs.club.budget).toBe(42_000);
  expect(JSON.stringify(state)).toBe(original);
  expect(recruitForSeasonOpening(result, new RNG("full-depth"))).toBe(result);
});

it("does not approach a player again for depth after an opening-eleven rejection", () => {
  const state = world(); let approaches = 0;
  const rng = new RNG("one-approach"); rng.chance = () => { approaches++; return false; };
  expect(recruitForSeasonOpening(state, rng)).toBe(state);
  expect(approaches).toBe(1);
});

it("rechecks depleted cash after signings while allowing further approaches after a decline", () => {
  const state = world();
  state.clubs.club.budget = 3_500;
  state.clubs.club.weeklyWageBudget = 20_000;
  for (let index = 0; index < 12; index++) {
    const id = `reserve-${index}`;
    state.players[id] = { ...state.players.keeper, id, position: index < 3 ? "GK" : "CM" };
    state.freeAgentPool.agents.push({ ...state.freeAgentPool.agents[0], playerId: id });
  }
  let approaches = 0;
  const rng = new RNG("decline-then-cash-limit");
  rng.chance = () => ++approaches > 1;
  const result = recruitForSeasonOpening(state, rng);
  expect(result.freeAgentPool.totalSignedThisSeason).toBe(3);
  expect(result.clubs.club.budget).toBe(500);
  // A fourth affordable-looking offer must not reach willingness checks
  // using the pre-signing budget. The first approach was declined.
  expect(approaches).toBe(4);
  expect(state.clubs.club.budget).toBe(3_500);
});

it("seeks a second goalkeeper even when eighteen places are already filled", () => {
  const state = world();
  for (let index = 10; index < 18; index++) {
    const id = `p-${index}`;
    state.players[id] = { ...state.players['p-0'], id, position: index === 10 ? "GK" : "CM" };
    state.clubs.club.playerIds.push(id);
  }
  state.clubs.club.weeklyWageBudget = 20_000;
  const rng = new RNG("backup-before-season"); rng.chance = () => true;
  const result = recruitForSeasonOpening(state, rng);
  expect(result.clubs.club.playerIds).toHaveLength(19);
  expect(result.clubs.club.playerIds.filter(id => result.players[id].position === "GK")).toHaveLength(2);
  expect(expandPlayerMovementHistory(result.playerMovementHistory)).toHaveLength(1);
  expect(result.clubs.club.budget).toBe(9_000);
  expect(recruitForSeasonOpening(result, new RNG("already-covered"))).toBe(result);
});

it.each(["decline", "wage-limit", "full-roster"])("does not force keeper cover past %s", reason => {
  const state = world();
  const size = reason === "full-roster" ? 30 : 18;
  for (let index = 10; index < size; index++) {
    const id = `p-${index}`;
    state.players[id] = { ...state.players['p-0'], id, position: index === 10 ? "GK" : "CM" };
    state.clubs.club.playerIds.push(id);
  }
  state.clubs.club.weeklyWageBudget = reason === "wage-limit" ? 9_000 : 30_000;
  const rng = new RNG(reason); rng.chance = () => reason !== "decline";
  expect(recruitForSeasonOpening(state, rng)).toBe(state);
});
