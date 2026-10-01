import { expect, it } from "vitest";
import type { GameState, Player } from "@/engine/core/types";
import { projectSeasonEndRecruitmentState } from "@/engine/freeAgents/seasonEndPlanning";
import { tickFreeAgentPool } from "@/engine/freeAgents/pool";
import { RNG } from "@/engine/rng";

function world(): GameState {
  const candidate = { id: "candidate", clubId: "", position: "GK", age: 24, currentAbility: 100, wage: 500 } as Player;
  const club = (id: string, playerIds: string[]) => ({ id, name: id, shortName: id, leagueId: "league",
    reputation: 55, budget: 10_000_000, weeklyWageBudget: 10_000, scoutingPhilosophy: "marketSmart",
    managerId: `${id}-manager`, youthAcademyRating: 12, playerIds });
  return {
    seed: "season-market", currentWeek: 46, currentSeason: 2, managerProfiles: {}, leagues: {},
    players: { candidate,
      outgoing: { ...candidate, id: "outgoing", clubId: "vacancy", contractClubId: "vacancy", contractExpiry: 2 },
      stable: { ...candidate, id: "stable", clubId: "stable", contractClubId: "stable", contractExpiry: 5 },
    },
    clubs: { stable: club("stable", ["stable"]), vacancy: club("vacancy", ["outgoing"]) },
    freeAgentPool: { agents: [{ playerId: "candidate", status: "available", weeksInPool: 0,
      maxWeeksInPool: 104, wageExpectation: 500, signingBonusExpectation: 0, npcInterest: [] }],
      totalSignedThisSeason: 0, totalRetiredThisSeason: 0 },
  } as unknown as GameState;
}

it("recruits against a confirmed vacancy without putting today's released player into the pool", () => {
  const state = world(), before = JSON.stringify(state);
  const projected = projectSeasonEndRecruitmentState(state, new Set(["outgoing"]), []);
  expect(projected.players.outgoing).toBeUndefined();
  expect(projected.clubs.vacancy.playerIds).toEqual([]);
  expect(projected.freeAgentPool.agents.map(agent => agent.playerId)).toEqual(["candidate"]);
  for (let seed = 0; seed < 8; seed++) {
    const rng = new RNG(`season-vacancy-${seed}`);
    rng.chance = () => true;
    expect(tickFreeAgentPool(projected, rng, { allowMidSeasonReleases: false })
      .npcSignedPlayerIds[0]?.clubId).toBe("vacancy");
  }
  expect(JSON.stringify(state)).toBe(before);
});

it("reserves agreed renewal wages before assessing another free-agent offer", () => {
  const state = world();
  state.clubs = { stable: state.clubs.stable };
  const projected = projectSeasonEndRecruitmentState(state, new Set(), [
    { playerId: "stable", clubId: "stable", contractLength: 3, wage: 10_000 },
  ]);
  const rng = new RNG("renewal-payroll");
  rng.chance = () => true;
  expect(tickFreeAgentPool(projected, rng, { allowMidSeasonReleases: false }).npcSignedPlayerIds).toEqual([]);
  expect(projected.players.stable.contractExpiry).toBe(5);
  expect(state.players.stable.wage).toBe(500);
});
