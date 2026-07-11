import { describe, expect, it } from "vitest";
import type { Club, GameState, Player } from "@/engine/core/types";
import type { RNG } from "@/engine/rng";
import { processAILoanDeals } from "@/engine/world/loans";
import {
  getLifecycleWorld,
  resolvePlayerMovements,
} from "@/engine/world/playerLifecycle";

function club(id: string, reputation: number, budget = 1_000_000): Club {
  return {
    id,
    name: `Club ${id.toUpperCase()}`,
    shortName: id.toUpperCase(),
    leagueId: `league-${id}`,
    reputation,
    budget,
    scoutingPhilosophy: "academyFirst",
    managerId: `manager-${id}`,
    playerIds: [],
    academyPlayerIds: [],
    youthAcademyRating: 14,
    loanedOutPlayerIds: [],
    loanedInPlayerIds: [],
  };
}

const acceptingRng = {
  chance: () => true,
  nextFloat: (minimum: number) => minimum,
  nextInt: (minimum: number) => minimum,
  pick: <T>(items: T[]) => items[0],
  pickWeighted: <T>(items: Array<{ item: T }>) => items[0].item,
  shuffle: <T>(items: T[]) => [...items],
} as unknown as RNG;

describe("scout-recommended loan flow", () => {
  it("turns an accepted recommendation into a real, funded lifecycle movement", () => {
    const prospect = {
      id: "p1",
      firstName: "Alex",
      lastName: "Prospect",
      age: 19,
      position: "CM",
      clubId: "parent",
      contractClubId: "parent",
      contractExpiry: 5,
      wage: 1_000,
      marketValue: 100_000,
      currentAbility: 90,
      potentialAbility: 150,
    } as Player;
    const parent = club("parent", 70);
    parent.playerIds = [prospect.id];
    const host = club("host", 50);

    const state = {
      players: { p1: prospect },
      clubs: { parent, host },
      activeLoans: [],
      loanHistory: [],
      retiredPlayers: {},
      retiredPlayerIds: [],
      playerMovementHistory: [],
      freeAgentPool: {
        agents: [],
        lastRefreshSeason: 1,
        totalReleasedThisSeason: 0,
        totalSignedThisSeason: 0,
        totalRetiredThisSeason: 0,
      },
      scout: {
        id: "scout",
        currentClubId: "parent",
        reputation: 80,
      },
      reports: {},
      loanRecommendations: [{
        id: "rec-1",
        playerId: "p1",
        targetClubId: "host",
        scoutId: "scout",
        week: 2,
        season: 1,
        rationale: "development",
        suggestedDuration: 12,
        suggestedWageContribution: 50,
        status: "pending",
        reputationApplied: false,
      }],
    } as unknown as GameState;

    const marketResult = processAILoanDeals(state, 3, 1, acceptingRng);
    expect(marketResult.deals).toHaveLength(1);
    expect(marketResult.updatedRecommendations[0]).toMatchObject({
      status: "accepted",
      loanDealId: marketResult.deals[0].id,
    });
    expect(marketResult.reputationDelta).toBe(3);
    expect(marketResult.xpAward).toBe(15);

    const moved = resolvePlayerMovements(
      getLifecycleWorld(state),
      [{
        type: "loanStart",
        playerId: "p1",
        deal: marketResult.deals[0],
        reason: "Accepted scout recommendation",
      }],
      3,
      1,
    );
    expect(moved.rejected).toEqual([]);
    expect(moved.state.players.p1).toMatchObject({
      clubId: "host",
      contractClubId: "parent",
      loanParentClubId: "parent",
      onLoan: true,
    });
    expect(moved.state.activeLoans).toHaveLength(1);
    expect(moved.state.clubs.parent.loanedOutPlayerIds).toContain("p1");
    expect(moved.state.clubs.host.loanedInPlayerIds).toContain("p1");
    expect(moved.state.clubs.parent.budget).toBeGreaterThan(1_000_000);
    expect(moved.state.clubs.host.budget).toBeLessThan(1_000_000);
  });
});
