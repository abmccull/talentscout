import { describe, expect, it, vi } from "vitest";
import type { Club, FreeAgent, GameState, Player } from "@/engine/core/types";
import {
  scoreFreeAgentClubInterest,
  tickFreeAgentPool,
} from "@/engine/freeAgents/pool";
import { processContractExpiries } from "@/engine/freeAgents/expiry";
import {
  createTransferDestinationIndex,
  selectViableAITransferDestination,
} from "@/engine/core/gameLoop";
import { proposeTransferAgreement } from "@/engine/transfers/transferAgreement";
import { RNG } from "@/engine/rng";
import {
  COMPETITIVE_REGISTERED_FLOOR,
  COMPETITIVE_ROSTER_OUTFLOW_FLOOR,
  wouldBreachCompetitiveOutflowGuard,
  wouldBreachCompetitiveRosterFloor,
} from "@/engine/match/eligibleRoster";

function club(id: string, playerIds: string[], extras: Partial<Club> = {}): Club {
  return {
    id,
    name: id,
    shortName: id,
    leagueId: "league",
    reputation: 55,
    budget: 10_000_000,
    weeklyWageBudget: 500_000,
    scoutingPhilosophy: "marketSmart",
    managerId: `${id}-manager`,
    playerIds,
    academyPlayerIds: [],
    youthAcademyRating: 12,
    ...extras,
  };
}

function player(id: string, position: Player["position"], clubId: string, ability = 110): Player {
  return {
    id,
    firstName: id,
    lastName: "Test",
    age: 24,
    nationality: "English",
    position,
    secondaryPositions: [],
    clubId,
    contractClubId: clubId,
    contractExpiry: 2,
    currentAbility: ability,
    potentialAbility: ability + 10,
    marketValue: 40_000,
    wage: 800,
    form: 0,
    morale: 5,
    injured: false,
    attributes: {},
    personalityProfile: { transferWillingness: 0.95 },
    seasonRatings: [],
    recentMatchRatings: [],
  } as unknown as Player;
}

describe("competitive roster floor attrition guards", () => {
  it("boosts free-agent interest for thin squads and missing keepers", () => {
    const striker = { age: 25, position: "ST", currentAbility: 110 } as Player;
    const keeper = { age: 27, position: "GK", currentAbility: 100 } as Player;
    const thinIds = Array.from({ length: 5 }, (_, index) => `thin-${index}`);
    const healthyIds = Array.from({ length: 18 }, (_, index) => `healthy-${index}`);
    const players = Object.fromEntries([
      ...thinIds.map((id) => [id, { id, position: "CM", clubId: "thin" }]),
      ...healthyIds.map((id) => [id, { id, position: "CM", clubId: "healthy" }]),
    ]) as GameState["players"];
    const state = {
      players,
      managerProfiles: {},
      leagues: {},
      seed: "thin-squad-urgency",
      currentSeason: 3,
    };

    const thin = scoreFreeAgentClubInterest(striker, club("thin", thinIds), state);
    const healthy = scoreFreeAgentClubInterest(striker, club("healthy", healthyIds), state);
    expect(thin).toBeGreaterThan(healthy * 3);

    const withoutKeeper = scoreFreeAgentClubInterest(
      keeper,
      club("thin", thinIds),
      state,
    );
    const withKeeperPlayers = {
      ...players,
      "thin-gk": { id: "thin-gk", position: "GK", clubId: "thin" },
    } as unknown as GameState["players"];
    const withKeeper = scoreFreeAgentClubInterest(
      keeper,
      club("thin", [...thinIds, "thin-gk"]),
      { ...state, players: withKeeperPlayers },
    );
    expect(withoutKeeper).toBeGreaterThan(withKeeper * 2);
  });

  it("blocks mid-season releases inside the outflow buffer above the XI floor", () => {
    const ids = Array.from({ length: COMPETITIVE_ROSTER_OUTFLOW_FLOOR }, (_, index) => `p${index}`);
    const players = Object.fromEntries(ids.map((id, index) => [
      id,
      player(id, index === 0 ? "GK" : "CM", "club", 50),
    ])) as Record<string, Player>;
    for (const entry of Object.values(players)) {
      entry.age = 28;
      entry.contractExpiry = 4;
    }
    const state = {
      currentWeek: 20,
      currentSeason: 2,
      players,
      clubs: { club: club("club", ids) },
      leagues: { league: { id: "league", country: "England" } },
      freeAgentPool: {
        agents: [],
        lastRefreshSeason: 2,
        totalReleasedThisSeason: 0,
        totalSignedThisSeason: 0,
        totalRetiredThisSeason: 0,
      },
      managerProfiles: {},
      seed: "mid-season-floor",
    } as unknown as GameState;
    const rng = {
      chance: () => true,
      nextInt: (min: number) => min,
      pickWeighted: <T,>(items: Array<{ item: T }>) => items[0]?.item,
      gaussian: () => 0,
    };

    const result = tickFreeAgentPool(state, rng as never);
    expect(result.midSeasonReleases).toEqual([]);
  });

  it("keeps AI sellers from falling through the outflow buffer", () => {
    const sellerIds = Array.from(
      { length: COMPETITIVE_ROSTER_OUTFLOW_FLOOR },
      (_, index) => `s${index}`,
    );
    const moving = player("s0", "CM", "seller", 70);
    moving.personalityProfile = { transferWillingness: 1 } as Player["personalityProfile"];
    const players = Object.fromEntries([
      ...sellerIds.map((id) => [id, id === "s0" ? moving : player(id, id === "s1" ? "GK" : "CM", "seller")]),
      ["buyer-1", player("buyer-1", "ST", "buyer")],
    ]) as Record<string, Player>;
    const seller = club("seller", sellerIds, { reputation: 30, budget: 50_000 });
    const buyer = club("buyer", ["buyer-1"], {
      reputation: 40,
      budget: 500_000,
      weeklyWageBudget: 100_000,
      scoutingPhilosophy: "winNow",
    });
    const state = {
      seed: "seller-floor",
      currentWeek: 10,
      currentSeason: 1,
      players,
      clubs: { seller, buyer },
      leagues: {
        league: { id: "league", country: "England", tier: 4, clubIds: ["seller", "buyer"] },
      },
      managerProfiles: {},
      fixtures: {},
      matchRatings: {},
      reports: {},
      playerMovementHistory: [],
    } as unknown as GameState;

    expect(wouldBreachCompetitiveOutflowGuard(seller, players, moving.id)).toBe(true);
    expect(wouldBreachCompetitiveRosterFloor(seller, players, moving.id)).toBe(false);
    expect(proposeTransferAgreement({
      player: moving, sellingClub: seller, buyingClub: buyer, state,
    }).viable).toBe(true);
    const rng = new RNG("seller-floor-draw");
    const draw = vi.spyOn(rng, "pickWeighted");
    // Destination selection still works; processAITransfers applies the seller floor.
    expect(selectViableAITransferDestination(moving, seller, state, rng, {
      index: createTransferDestinationIndex(state),
    })?.destination.id).toBe("buyer");
    expect(draw).toHaveBeenCalled();
  });

  it("emergency-restocks a funded thin club and missing keeper from the free-agent pool", () => {
    const thinIds = Array.from({ length: 4 }, (_, index) => `thin-${index}`);
    const players = Object.fromEntries([
      ...thinIds.map((id) => [id, player(id, "CM", "thin", 40)]),
      ["fa-gk", player("fa-gk", "GK", "", 35)],
      ["fa-cm", player("fa-cm", "CM", "", 38)],
      ["fa-st", player("fa-st", "ST", "", 36)],
    ]) as Record<string, Player>;
    for (const id of ["fa-gk", "fa-cm", "fa-st"]) {
      players[id].clubId = undefined as unknown as string;
      players[id].contractClubId = undefined;
    }
    const agent = (playerId: string): FreeAgent => ({
      playerId,
      country: "england",
      nationality: "English",
      releasedFrom: "other",
      releasedSeason: 1,
      weeksInPool: 2,
      maxWeeksInPool: 20,
      wageExpectation: 400,
      signingBonusExpectation: 800,
      discoverySource: null,
      discoveredByScout: false,
      npcInterest: [],
      status: "available",
    });
    const state = {
      currentWeek: 12,
      currentSeason: 2,
      players,
      clubs: {
        thin: club("thin", thinIds, {
          reputation: 18,
          budget: 250_000,
          weeklyWageBudget: 40_000,
        }),
      },
      leagues: { league: { id: "league", country: "England" } },
      freeAgentPool: {
        agents: [agent("fa-gk"), agent("fa-cm"), agent("fa-st")],
        lastRefreshSeason: 2,
        totalReleasedThisSeason: 0,
        totalSignedThisSeason: 0,
        totalRetiredThisSeason: 0,
      },
      managerProfiles: {},
      seed: "emergency-restock",
    } as unknown as GameState;
    const rng = {
      chance: () => false,
      nextInt: (min: number) => min,
      pickWeighted: <T,>(items: Array<{ item: T }>) => items[0]?.item,
      gaussian: () => 0,
    };

    const result = tickFreeAgentPool(state, rng as never, { allowMidSeasonReleases: false });
    const signedClubs = result.npcSignedPlayerIds.map((entry) => entry.clubId);
    expect(signedClubs.every((id) => id === "thin")).toBe(true);
    expect(result.npcSignedPlayerIds.some((entry) => entry.playerId === "fa-gk")).toBe(true);
    expect(result.npcSignedPlayerIds.map((entry) => entry.playerId).sort()).toEqual([
      "fa-cm", "fa-gk", "fa-st",
    ]);
  });

  it("emergency keeper restock ignores reputation banding when a club has no GK", () => {
    const squadIds = Array.from({ length: 16 }, (_, index) => `full-${index}`);
    const players = Object.fromEntries([
      ...squadIds.map((id) => [id, player(id, "CM", "big", 140)]),
      ["fa-gk-low", player("fa-gk-low", "GK", "", 40)],
    ]) as Record<string, Player>;
    players["fa-gk-low"].clubId = undefined as unknown as string;
    players["fa-gk-low"].contractClubId = undefined;
    const state = {
      currentWeek: 8,
      currentSeason: 3,
      players,
      clubs: {
        big: club("big", squadIds, {
          reputation: 90,
          budget: 50_000_000,
          weeklyWageBudget: 1_000_000,
        }),
      },
      leagues: { league: { id: "league", country: "England" } },
      freeAgentPool: {
        agents: [{
          playerId: "fa-gk-low",
          country: "england",
          nationality: "English",
          releasedFrom: "other",
          releasedSeason: 2,
          weeksInPool: 1,
          maxWeeksInPool: 20,
          wageExpectation: 500,
          signingBonusExpectation: 1_000,
          discoverySource: null,
          discoveredByScout: false,
          npcInterest: [],
          status: "available",
        }],
        lastRefreshSeason: 3,
        totalReleasedThisSeason: 0,
        totalSignedThisSeason: 0,
        totalRetiredThisSeason: 0,
      },
      managerProfiles: {},
      seed: "emergency-keeper-rep",
    } as unknown as GameState;
    const rng = {
      chance: () => false,
      nextInt: (min: number) => min,
      pickWeighted: <T,>(items: Array<{ item: T }>) => items[0]?.item,
      gaussian: () => 0,
    };
    const result = tickFreeAgentPool(state, rng as never, { allowMidSeasonReleases: false });
    expect(result.npcSignedPlayerIds).toEqual([
      expect.objectContaining({ playerId: "fa-gk-low", clubId: "big" }),
    ]);
  });

  it("force-offers renewals that would otherwise leave a club below the registered floor", () => {
    const ids = Array.from({ length: COMPETITIVE_REGISTERED_FLOOR }, (_, index) => `r${index}`);
    const players = Object.fromEntries(ids.map((id, index) => {
      const entry = player(id, index === 0 ? "GK" : "CM", "club", 55);
      entry.contractExpiry = 1;
      entry.wage = 500;
      return [id, entry];
    })) as Record<string, Player>;
    const state = {
      currentWeek: 46,
      currentSeason: 1,
      players,
      clubs: {
        club: club("club", ids, {
          reputation: 20,
          budget: 500_000,
          weeklyWageBudget: 200_000,
        }),
      },
      leagues: {
        league: {
          id: "league", name: "League", shortName: "LGE", country: "England",
          tier: 4, clubIds: ["club"], season: 1,
        },
      },
      fixtures: {},
      matchRatings: {},
      managerProfiles: {},
    } as unknown as GameState;

    class FloorGuardRNG extends RNG {
      private step = 0;
      override chance(_probability: number): boolean {
        this.step += 1;
        // Odd steps are club offer rolls (fail); even steps are player acceptance (pass).
        return this.step % 2 === 0;
      }
    }

    const result = processContractExpiries(state, new FloorGuardRNG("floor-renew"));
    expect(result.renewedPlayerIds.sort()).toEqual(ids.sort());
    expect(result.releasedPlayers).toEqual([]);
  });

  it("emergency restock can fill a thin club that is already over its wage budget", () => {
    const thinIds = Array.from({ length: 10 }, (_, index) => `over-${index}`);
    const players = Object.fromEntries([
      ...thinIds.map((id, index) => [id, player(id, index === 0 ? "GK" : "CM", "over", 40)]),
      ["fa-cheap", player("fa-cheap", "CM", "", 30)],
    ]) as Record<string, Player>;
    for (const id of thinIds) players[id].wage = 2_000;
    players["fa-cheap"].clubId = undefined as unknown as string;
    players["fa-cheap"].contractClubId = undefined;
    const state = {
      currentWeek: 15,
      currentSeason: 2,
      players,
      clubs: {
        over: club("over", thinIds, {
          reputation: 15,
          budget: 200_000,
          weeklyWageBudget: 10_000,
        }),
      },
      leagues: { league: { id: "league", country: "England" } },
      freeAgentPool: {
        agents: [{
          playerId: "fa-cheap",
          country: "england",
          nationality: "English",
          releasedFrom: "other",
          releasedSeason: 1,
          weeksInPool: 2,
          maxWeeksInPool: 20,
          wageExpectation: 1_500,
          signingBonusExpectation: 500,
          discoverySource: null,
          discoveredByScout: false,
          npcInterest: [],
          status: "available",
        }],
        lastRefreshSeason: 2,
        totalReleasedThisSeason: 0,
        totalSignedThisSeason: 0,
        totalRetiredThisSeason: 0,
      },
      managerProfiles: {},
      seed: "emergency-over-wage",
    } as unknown as GameState;
    const rng = {
      chance: () => false,
      nextInt: (min: number) => min,
      pickWeighted: <T,>(items: Array<{ item: T }>) => items[0]?.item,
      gaussian: () => 0,
    };
    const result = tickFreeAgentPool(state, rng as never, { allowMidSeasonReleases: false });
    expect(result.npcSignedPlayerIds).toEqual([
      expect.objectContaining({ playerId: "fa-cheap", clubId: "over" }),
    ]);
  });

  it("still releases when a floor-preserving renewal is unaffordable", () => {
    const ids = Array.from({ length: 5 }, (_, index) => `u${index}`);
    const players = Object.fromEntries(ids.map((id, index) => {
      const entry = player(id, index === 0 ? "GK" : "CM", "club", 55);
      entry.contractExpiry = 1;
      entry.wage = 5_000;
      return [id, entry];
    })) as Record<string, Player>;
    const state = {
      currentWeek: 46,
      currentSeason: 1,
      players,
      clubs: {
        club: club("club", ids, {
          reputation: 20,
          budget: 0,
          weeklyWageBudget: 100,
        }),
      },
      leagues: {
        league: {
          id: "league", name: "League", shortName: "LGE", country: "England",
          tier: 4, clubIds: ["club"], season: 1,
        },
      },
      fixtures: {},
      matchRatings: {},
      managerProfiles: {},
    } as unknown as GameState;
    const rng = new RNG("unaffordable-floor");
    rng.chance = () => true;
    const result = processContractExpiries(state, rng);
    expect(result.renewedPlayerIds).toEqual([]);
    expect(result.releasedPlayers.map((agent: FreeAgent) => agent.playerId).sort())
      .toEqual(ids.sort());
  });
});
