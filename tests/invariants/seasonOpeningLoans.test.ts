import { expect, it } from "vitest";
import type { GameState, Player } from "@/engine/core/types";
import { RNG } from "@/engine/rng";
import { recruitForSeasonOpening } from "@/engine/freeAgents/seasonOpening";
import { expandClubFinancialObligation } from "@/engine/finance/terminalRecordArchive";

function world(): GameState {
  const players: Record<string, Player> = {};
  for (const [clubId, count] of [["parent", 18], ["host", 10]] as const) {
    for (let i = 0; i < count; i++) {
      const id = `${clubId}-${i}`;
      players[id] = { id, clubId, contractClubId: clubId, age: 25, position: "CM",
        currentAbility: 100, potentialAbility: 100, contractExpiry: 5, wage: 500, morale: 5 } as Player;
    }
  }
  for (const id of ["keeper", "cover1", "cover2"]) players[id] = {
    ...players["parent-0"], id, age: 30, position: "GK", firstName: "Alex", lastName: "Keeper",
    currentAbility: id === "keeper" ? 50 : 150, marketValue: 10_000,
  };
  return { currentWeek: 1, currentSeason: 3, fixtures: {}, players,
    clubs: Object.fromEntries(["parent", "host"].map(id => [id, {
      id, name: id, shortName: id, leagueId: "league", reputation: id === "parent" ? 50 : 30,
      budget: 100_000, weeklyWageBudget: 100_000,
      playerIds: Object.values(players).filter(p => p.clubId === id).map(p => p.id),
    }])), leagues: { league: { country: "England" } },
    freeAgentPool: { agents: [], totalSignedThisSeason: 0, totalReleasedThisSeason: 0, totalRetiredThisSeason: 0 },
    observations: {},
  } as unknown as GameState;
}

it("arranges an opening loan with no free agents, preserving ownership and settling fee and wages", () => {
  const state = world();
  state.observations.known = { playerId: "keeper" } as never;
  const knownOriginal = JSON.stringify(state);
  const rng = new RNG("opening-loan"); rng.chance = () => true;
  const result = recruitForSeasonOpening(state, rng);
  expect(result.activeLoans).toHaveLength(1);
  const deal = result.activeLoans![0];
  expect(deal).toMatchObject({ playerId: "keeper", loanClubId: "host", parentClubId: "parent", agreedPlayingTime: "regular" });
  expect(result.players.keeper).toMatchObject({ clubId: "host", contractClubId: "parent", onLoan: true, wage: 500, contractExpiry: 5 });
  expect(result.clubs.host.playerIds).toHaveLength(11);
  expect(result.clubs.parent.playerIds.filter(id => result.players[id].position === "GK")).toHaveLength(2);
  expect(result.clubs.host.budget).toBe(state.clubs.host.budget - deal.loanFee);
  expect(result.clubs.parent.budget).toBe(state.clubs.parent.budget + deal.loanFee);
  expect(result.clubs.host.financialObligations?.some(stored => {
    const obligation = expandClubFinancialObligation(stored);
    return obligation.playerId === "keeper" && obligation.weeklyAmount === Math.round(500 * deal.wageContribution / 100);
  })).toBe(true);
  expect(result.inbox).toHaveLength(1);
  expect(result.freeAgentPool).toEqual(state.freeAgentPool);
  expect(JSON.stringify(state)).toBe(knownOriginal);
  expect(recruitForSeasonOpening(result, new RNG("repeat"))).toBe(result);
});

it.each(["declined", "cash", "wages", "parent-cover", "injured", "contract", "route"])("respects %s constraints without inventing cover", reason => {
  const state = world();
  if (reason === "cash") state.clubs.host.budget = 0;
  if (reason === "wages") state.clubs.host.weeklyWageBudget = 5_000;
  if (reason === "parent-cover") state.players.cover1.injured = true;
  if (reason === "injured") state.players.keeper.injured = true;
  if (reason === "contract") state.players.keeper.contractExpiry = 2;
  if (reason === "route") state.clubs.host.reputation = 99;
  const rng = new RNG(reason); rng.chance = () => reason !== "declined";
  expect(recruitForSeasonOpening(state, rng)).toBe(state);
});

it("cannot lend one reserve to competing clubs or expose an unknown player's move", () => {
  const state = world();
  const ids = Array.from({ length: 10 }, (_, i) => `other-${i}`);
  state.clubs.other = { ...state.clubs.host, id: "other", playerIds: ids };
  for (const id of ids) state.players[id] = { ...state.players["host-0"], id, clubId: "other", contractClubId: "other" };
  const rng = new RNG("competing-loans"); rng.chance = () => true;
  const result = recruitForSeasonOpening(state, rng);
  expect(result.activeLoans).toHaveLength(1);
  expect(Object.values(result.clubs).filter(c => c.playerIds.includes("keeper"))).toHaveLength(1);
  expect(result.inbox ?? []).toHaveLength(0);
  expect(Object.keys(result.players)).toHaveLength(Object.keys(state.players).length);
});
