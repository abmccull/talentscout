import { expect, it } from "vitest";
import type { GameState, Player } from "@/engine/core/types";
import { RNG } from "@/engine/rng";
import { recruitForSeasonOpening } from "@/engine/freeAgents/seasonOpening";
import { expandClubFinancialObligation } from "@/engine/finance/terminalRecordArchive";

// Controlled opening-market integration cases. The retained release-soak-02
// evidence has this same nine-outfield shape; these donors are explicit test
// data, not reconstructed pre-opening players from the failed career.
function world(outfieldCount = 9, vacancies = 1): GameState {
  const players: Record<string, Player> = {};
  for (const [clubId, count] of [["parent", 18], ["host", outfieldCount]] as const) {
    for (let i = 0; i < count; i++) {
      const id = `${clubId}-${i}`;
      players[id] = { id, clubId, contractClubId: clubId, age: 25, position: "CM",
        currentAbility: 100, potentialAbility: 100, contractExpiry: 5, wage: 500, morale: 5 } as Player;
    }
  }
  for (const id of ["host-keeper", "parent-keeper"]) {
    const clubId = id.startsWith("host") ? "host" : "parent";
    players[id] = { ...players[`${clubId}-0`], id, position: "GK", currentAbility: 150 };
  }
  for (let i = 0; i < vacancies; i++) {
    const id = `reserve-${i}`;
    players[id] = { ...players["parent-0"], id, position: "CB", currentAbility: 50,
      firstName: "Alex", lastName: String(i), marketValue: 10_000 };
  }
  return { seed: "opening-outfield", currentWeek: 1, currentSeason: 3, fixtures: {}, players, managerProfiles: {},
    clubs: Object.fromEntries(["parent", "host"].map(id => [id, {
      id, name: id, shortName: id, leagueId: "league", reputation: id === "parent" ? 50 : 30,
      scoutingPhilosophy: "marketSmart", youthAcademyRating: 10, managerId: `manager-${id}`,
      budget: 100_000, weeklyWageBudget: 100_000, academyPlayerIds: [],
      playerIds: Object.values(players).filter(p => p.clubId === id).map(p => p.id),
    }])), leagues: { league: { country: "England" } },
    freeAgentPool: { agents: [], totalSignedThisSeason: 0, totalReleasedThisSeason: 0, totalRetiredThisSeason: 0 },
    observations: {}, inbox: [],
  } as unknown as GameState;
}

function accepting(seed = "outfield-loans") {
  const rng = new RNG(seed);
  rng.chance = () => true;
  return rng;
}

function outfield(state: GameState, clubId: string) {
  return state.clubs[clubId].playerIds.filter(id => state.players[id].clubId === clubId
    && state.players[id].position !== "GK");
}

it("fills an opening outfield vacancy through a real loan agreement when no free agents exist", () => {
  const state = world();
  state.observations.known = { playerId: "reserve-0" } as never;
  const original = JSON.stringify(state);
  const result = recruitForSeasonOpening(state, accepting());
  expect(result.activeLoans).toHaveLength(1);
  const deal = result.activeLoans![0];
  expect(deal).toMatchObject({ playerId: "reserve-0", parentClubId: "parent", loanClubId: "host", status: "active" });
  expect(outfield(result, "host")).toHaveLength(10);
  expect(result.players["reserve-0"]).toMatchObject({ clubId: "host", contractClubId: "parent", onLoan: true,
    wage: 500, contractExpiry: 5 });
  expect(result.clubs.host.budget).toBe(state.clubs.host.budget - deal.loanFee);
  expect(result.clubs.parent.budget).toBe(state.clubs.parent.budget + deal.loanFee);
  expect(result.clubs.host.financialObligations?.some(stored => {
    const obligation = expandClubFinancialObligation(stored);
    return obligation.playerId === "reserve-0" && obligation.weeklyAmount === Math.round(500 * deal.wageContribution / 100);
  })).toBe(true);
  expect(result.inbox).toHaveLength(1);
  expect(result.freeAgentPool).toEqual(state.freeAgentPool);
  expect(Object.keys(result.players)).toEqual(Object.keys(state.players));
  expect(JSON.stringify(state)).toBe(original);
  expect(recruitForSeasonOpening(result, accepting("covered"))).toBe(result);
});

it("fills two outfield vacancies while retaining the donor's first-team minimum", () => {
  const state = world(8, 2);
  const result = recruitForSeasonOpening(state, accepting());
  expect(result.activeLoans).toHaveLength(2);
  expect(outfield(result, "host")).toHaveLength(10);
  expect(outfield(result, "parent")).toHaveLength(18);
  expect(result.clubs.parent.playerIds).toContain("parent-keeper");
});

it("can pursue both the missing goalkeeper and outfield place in the same opening", () => {
  const state = world();
  state.clubs.host.playerIds = state.clubs.host.playerIds.filter(id => id !== "host-keeper");
  delete state.players["host-keeper"];
  for (const [id, ability] of [["keeper-cover", 150], ["keeper-reserve", 40]] as const) {
    state.players[id] = { ...state.players["parent-keeper"], id, age: 30, currentAbility: ability,
      firstName: "Loan", lastName: "Keeper", marketValue: 10_000 };
    state.clubs.parent.playerIds.push(id);
  }
  const result = recruitForSeasonOpening(state, accepting("both-vacancies"));
  expect(result.activeLoans).toHaveLength(2);
  expect(outfield(result, "host")).toHaveLength(10);
  expect(result.clubs.host.playerIds.filter(id => result.players[id].position === "GK")).toHaveLength(1);
  expect(result.clubs.parent.playerIds.filter(id => result.players[id].position === "GK")).toHaveLength(2);
});

it.each(["declined", "cash", "wages", "parent-cover", "injured", "contract", "route"])(
  "does not repair an outfield gap by bypassing %s constraints", reason => {
    const state = world();
    if (reason === "cash") state.clubs.host.budget = 0;
    if (reason === "wages") state.clubs.host.weeklyWageBudget = 5_000;
    if (reason === "parent-cover") {
      for (const id of ["parent-0", "parent-1"]) {
        state.clubs.parent.playerIds = state.clubs.parent.playerIds.filter(p => p !== id);
        delete state.players[id];
      }
    }
    if (reason === "injured") state.players["reserve-0"].injured = true;
    if (reason === "contract") state.players["reserve-0"].contractExpiry = 2;
    if (reason === "route") state.clubs.host.reputation = 99;
    const rng = accepting(reason);
    rng.chance = () => reason !== "declined";
    const before = JSON.stringify(state);
    expect(recruitForSeasonOpening(state, rng)).toBe(state);
    expect(JSON.stringify(state)).toBe(before);
  },
);

it("settles a reserve only once when two depleted clubs compete", () => {
  const state = world();
  const ids = Array.from({ length: 9 }, (_, i) => `other-${i}`);
  state.clubs.other = { ...state.clubs.host, id: "other", playerIds: [...ids, "other-keeper"] };
  for (const id of [...ids, "other-keeper"]) state.players[id] = { ...state.players["host-0"], id,
    clubId: "other", contractClubId: "other", position: id === "other-keeper" ? "GK" : "CM" };
  const result = recruitForSeasonOpening(state, accepting());
  expect(result.activeLoans).toHaveLength(1);
  expect(["host", "other"].filter(id => outfield(result, id).length === 10)).toHaveLength(1);
  expect(Object.values(result.clubs).filter(club => club.playerIds.includes("reserve-0"))).toHaveLength(1);
  expect(result.inbox).toHaveLength(0);
});

it("keeps optional goalkeeper cover from spending the last funds while outfield vacancies remain", () => {
  const state = world(9, 0);
  state.clubs.parent.budget = 0;
  state.clubs.host.weeklyWageBudget = 6_000;
  state.players.backup = { ...state.players["host-keeper"], id: "backup", clubId: "", contractClubId: "",
    currentAbility: 60, firstName: "Reserve", lastName: "Keeper" };
  state.freeAgentPool.agents = [{ playerId: "backup", status: "available", weeksInPool: 2,
    country: "england", releasedFrom: "former-club", releasedSeason: 2,
    discoverySource: null, discoveredByScout: false,
    maxWeeksInPool: 100, wageExpectation: 500, signingBonusExpectation: 100, npcInterest: [] }];
  const before = JSON.stringify(state);
  expect(recruitForSeasonOpening(state, accepting())).toBe(state);
  expect(JSON.stringify(state)).toBe(before);
});

it("does not arrange an optional outfield loan for an already playable club", () => {
  const state = world(10, 1);
  expect(recruitForSeasonOpening(state, accepting())).toBe(state);
});
