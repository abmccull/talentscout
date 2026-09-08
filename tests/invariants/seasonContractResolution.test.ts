import { describe, expect, it } from "vitest";
import type { Club, GameState, LoanDeal, Player } from "@/engine/core/types";
import { settleSeasonContracts } from "@/engine/freeAgents/contractSettlement";
import { createFreeAgentFromPlayer } from "@/engine/freeAgents/expiry";
import { resolvePlayerMovements, type LifecycleWorldState } from "@/engine/world/playerLifecycle";

function world(): LifecycleWorldState {
  const player = { id: "p", firstName: "Maxwel", lastName: "Diatta", age: 21,
    nationality: "Ivorian", position: "ST", clubId: "a", contractClubId: "a",
    contractExpiry: 2, wage: 1_000, currentAbility: 75, potentialAbility: 85,
    morale: 6 } as Player;
  const club = (id: string, playerIds: string[]): Club => ({ id, name: id,
    shortName: id, leagueId: "league", reputation: 50, budget: 500_000,
    weeklyWageBudget: 2_000, playerIds, academyPlayerIds: [], loanedOutPlayerIds: [],
    loanedInPlayerIds: [], financialObligations: [], scoutingPhilosophy: "academyFirst",
    managerId: "manager", youthAcademyRating: 10 });
  return { players: { p: player }, clubs: { a: club("a", ["p"]), b: club("b", []) },
    activeLoans: [], loanHistory: [], retiredPlayers: {}, retiredPlayerIds: [],
    playerMovementHistory: [], freeAgentPool: { agents: [], lastRefreshSeason: 2,
      totalReleasedThisSeason: 0, totalSignedThisSeason: 0, totalRetiredThisSeason: 0 } };
}
const context: Pick<GameState, "currentWeek" | "currentSeason" | "leagues"> = {
  currentWeek: 46, currentSeason: 2, leagues: { league: {
    id: "league", name: "League", shortName: "LG", country: "Ivory Coast",
    tier: 1, clubIds: ["a", "b"], season: 2,
  } },
};
const renewal = { playerId: "p", clubId: "a", contractLength: 4, wage: 3_397 };

describe("season-end contract settlement", () => {
  it("releases an unaffordable renewal once instead of carrying expired ownership into a new season", () => {
    const input = world();
    const proposed = resolvePlayerMovements(input, [{ ...renewal, type: "contractRenewal" }], 46, 2, 46);
    expect(proposed.rejected).toContainEqual(expect.objectContaining({ reason: "club cannot absorb the renewed weekly wage" }));
    const settled = settleSeasonContracts(proposed, { renewals: [renewal], releasedPlayers: [] }, context, 46);
    expect(settled.state.players.p).toMatchObject({ clubId: "", contractExpiry: 0, wage: 0 });
    expect(settled.state.players.p.contractClubId).toBeUndefined();
    expect(settled.state.clubs.a.playerIds).not.toContain("p");
    expect(settled.state.freeAgentPool.agents).toEqual([expect.objectContaining({ playerId: "p", releasedFrom: "a", releasedSeason: 2, status: "available" })]);
    expect(settled.state.freeAgentPool.totalReleasedThisSeason).toBe(1);
    expect(settled.messages).toEqual([expect.objectContaining({ relatedId: "p", relatedEntityType: "player" })]);
    const repeated = settleSeasonContracts(settled, { renewals: [renewal], releasedPlayers: [] }, context, 46);
    expect(repeated.state).toEqual(settled.state);
    expect(repeated.messages).toEqual([]);
    expect(input.players.p.contractExpiry).toBe(2);
  });

  it("lets a returning loanee complete the agreed affordable renewal after the return", () => {
    const input = world();
    input.clubs.a.weeklyWageBudget = 20_000;
    input.clubs.a.playerIds = [];
    input.clubs.a.loanedOutPlayerIds = ["p"];
    input.clubs.b.playerIds = ["p"];
    input.clubs.b.loanedInPlayerIds = ["p"];
    input.players.p = { ...input.players.p, clubId: "b", onLoan: true, loanParentClubId: "a" };
    const loan = { id: "loan", playerId: "p", parentClubId: "a", loanClubId: "b",
      startWeek: 1, startSeason: 2, endWeek: 46, endSeason: 2, loanFee: 0,
      wageContribution: 50, recallClause: true, status: "active" } as LoanDeal;
    input.activeLoans = [loan];
    const proposed = resolvePlayerMovements(input, [
      { type: "loanEnd", playerId: "p", dealId: "loan", resolution: "return" },
      { ...renewal, type: "contractRenewal" },
    ], 46, 2, 46);
    expect(proposed.state.players.p.contractExpiry).toBe(2);
    const settled = settleSeasonContracts(proposed, { renewals: [renewal], releasedPlayers: [] }, context, 46);
    expect(settled.state.players.p).toMatchObject({ clubId: "a", contractClubId: "a", contractExpiry: 6, wage: 3_397 });
    expect(settled.state.activeLoans).toEqual([]);
    expect(settled.state.playerMovementHistory.map((event) => event.type)).toEqual(["loanReturn", "contractRenewal"]);
    expect(settled.state.freeAgentPool.agents).toEqual([]);
    expect(settled.messages).toEqual([]);
  });

  it.each(["retirement", "permanentTransfer"] as const)("does not announce or index a release superseded by %s", (type) => {
    const input = world();
    input.clubs.b.weeklyWageBudget = 20_000;
    const released = createFreeAgentFromPlayer(input.players.p, input.clubs.a, 2, "ivorycoast");
    const proposed = resolvePlayerMovements(input, [
      type === "retirement" ? { type, playerId: "p" }
        : { type, playerId: "p", fromClubId: "a", toClubId: "b", fee: 1_000, wage: 1_000, contractLength: 3 },
      { type: "release", playerId: "p", fromClubId: "a" },
    ], 46, 2, 46);
    const settled = settleSeasonContracts(proposed, { renewals: [], releasedPlayers: [released] }, context, 46);
    expect(settled.state.freeAgentPool.agents).toEqual([]);
    expect(settled.state.freeAgentPool.totalReleasedThisSeason).toBe(0);
    expect(settled.messages).toEqual([]);
    expect(settled.state.players.p?.contractExpiry ?? 5).toBeGreaterThan(2);
  });

  it("indexes an applied expiry release without double-counting an existing midseason release", () => {
    const input = world();
    const released = createFreeAgentFromPlayer(input.players.p, input.clubs.a, 2, "ivorycoast");
    const proposed = resolvePlayerMovements(input, [{ type: "release", playerId: "p", fromClubId: "a" }], 46, 2, 46);
    const settled = settleSeasonContracts(proposed, { renewals: [], releasedPlayers: [released] }, context, 46);
    expect(settled.state.freeAgentPool.totalReleasedThisSeason).toBe(1);
    const prior = { ...proposed, state: { ...proposed.state, freeAgentPool: {
      ...proposed.state.freeAgentPool, agents: [released], totalReleasedThisSeason: 1,
    } } };
    const repeated = settleSeasonContracts(prior, { renewals: [], releasedPlayers: [released] }, context, 46);
    expect(repeated.state.freeAgentPool.totalReleasedThisSeason).toBe(1);
    expect(repeated.messages).toEqual([]);
  });
});
