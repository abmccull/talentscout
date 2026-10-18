import { describe, expect, it } from "vitest";
import type { Club, GameState, Player } from "@/engine/core/types";
import {
  calculateContractRenewalChance,
  processContractExpiries,
} from "@/engine/freeAgents/expiry";

function club(playerIds: string[]): Club {
  return {
    id: "club",
    name: "Club",
    shortName: "CLU",
    leagueId: "league",
    reputation: 60,
    budget: 5_000_000,
    scoutingPhilosophy: "marketSmart",
    managerId: "manager",
    playerIds,
    youthAcademyRating: 10,
  };
}

function player(overrides: Partial<Player>): Player {
  return {
    id: "target",
    age: 26,
    position: "CM",
    secondaryPositions: [],
    currentAbility: 115,
    form: 1,
    morale: 7,
    ...overrides,
  } as Player;
}

describe("contract renewal decisions", () => {
  it("plans continuity from secured contracts instead of counting every expiring teammate as cover", () => {
    const players = Object.fromEntries(Array.from({ length: 18 }, (_, index) => {
      const id = `p-${String(index).padStart(2, "0")}`;
      return [id, player({ id, clubId: "club", contractClubId: "club", contractExpiry: 3,
        currentAbility: 100, potentialAbility: 120, form: 0, morale: 5, wage: 500 })];
    }));
    const targetClub = club(Object.keys(players));
    const state = { currentWeek: 38, currentSeason: 3, players, clubs: { club: targetClub },
      leagues: { league: { country: "England" } }, fixtures: {}, matchRatings: {}, managerProfiles: {},
    } as unknown as GameState;
    const probabilities: number[] = [];
    const declined = { chance: (probability: number) => { probabilities.push(probability); return false; },
      nextInt: (minimum: number) => minimum };
    const result = processContractExpiries(state, declined as never);
    expect(probabilities).toHaveLength(18);
    expect(probabilities[0]).toBeGreaterThan(calculateContractRenewalChance(players["p-00"], targetClub, state));
    // Every declined negotiation leaves the next player equally essential.
    expect(new Set(probabilities).size).toBe(1);
    expect(result.renewals).toHaveLength(0);
    expect(result.releasedPlayers).toHaveLength(18);
    expect(targetClub.playerIds).toHaveLength(18);
    const acceptedProbabilities: number[] = [];
    const acceptFirst = { chance: (probability: number) => {
      acceptedProbabilities.push(probability);
      return acceptedProbabilities.length <= 2;
    }, nextInt: (minimum: number) => minimum };
    const oneAgreement = processContractExpiries(state, acceptFirst as never);
    expect(oneAgreement.renewedPlayerIds).toEqual(["p-00"]);
    // First club offer, then player acceptance, then the next club offer.
    expect(acceptedProbabilities[2]).toBeLessThan(acceptedProbabilities[0]);
  });

  it("retains affordable goalkeeper continuity independent of player record order", () => {
    const outfield = player({ id: "outfield", currentAbility: 26, age: 20, wage: 500,
      clubId: "club", contractClubId: "club", contractExpiry: 3 });
    const keeper = player({ ...outfield, id: "keeper", position: "GK", currentAbility: 25 });
    const ongoing = player({ ...outfield, id: "ongoing", contractExpiry: 5 });
    const makeState = (reverse: boolean) => ({
      currentWeek: 38, currentSeason: 3,
      players: Object.fromEntries((reverse ? [keeper, ongoing, outfield] : [outfield, ongoing, keeper])
        .map((candidate) => [candidate.id, candidate])),
      clubs: { club: { ...club([outfield.id, keeper.id, ongoing.id]), reputation: 13, weeklyWageBudget: 1_100 } },
      leagues: { league: { id: "league", country: "England" } },
      fixtures: {}, matchRatings: {}, managerProfiles: {},
    } as unknown as GameState);
    const willing = { chance: () => true, nextInt: (min: number) => min };
    const result = processContractExpiries(makeState(false), willing as never);
    expect(result.renewals.map((renewal) => renewal.playerId)).toEqual(["keeper"]);
    expect(result.releasedPlayers.map((released) => released.playerId)).toEqual(["outfield"]);
    expect(result.renewals[0].wage + ongoing.wage).toBeLessThanOrEqual(1_100);
    expect(processContractExpiries(makeState(true), willing as never)).toEqual(result);
  });

  it("reserves pay rises and releases expired wages while processing the renewal batch", () => {
    const candidates = Object.fromEntries(["first", "second"].map((id) => [id, player({
      id, currentAbility: 26, age: 20, morale: 7, wage: 500,
      clubId: "club", contractClubId: "club", contractExpiry: 3,
    })]));
    const state = {
      currentWeek: 38, currentSeason: 3, players: candidates,
      clubs: { club: { ...club(Object.keys(candidates)), reputation: 13, weeklyWageBudget: 2_040 } },
      leagues: { league: { id: "league", country: "England" } },
      fixtures: {}, matchRatings: {}, managerProfiles: {},
    } as unknown as GameState;
    const before = JSON.stringify(state);
    const willing = { chance: () => true, nextInt: (min: number) => min };
    const result = processContractExpiries(state, willing as never);
    expect(result.renewals.map((renewal) => renewal.playerId)).toEqual(["first"]);
    expect(result.releasedPlayers.map((released) => released.playerId)).toEqual(["second"]);
    expect(JSON.stringify(state)).toBe(before);

    // Both old deals expire together; keep the first priority within the new budget.
    const reducedBudget = { ...state, clubs: { club: { ...state.clubs.club, weeklyWageBudget: 1_600 } } };
    const reduced = processContractExpiries(reducedBudget, willing as never);
    expect(reduced.renewals.map((renewal) => renewal.playerId)).toEqual(["first"]);
    expect(reduced.releasedPlayers.map((released) => released.playerId)).toEqual(["second"]);
  });

  it("keeps lower-level renewal and release demands on the club's existing wage scale", () => {
    const candidate = player({
      currentAbility: 26, age: 26, morale: 5, wage: 500,
      clubId: "club", contractClubId: "club", contractExpiry: 3,
    });
    const state = {
      currentWeek: 38, currentSeason: 3,
      players: { target: candidate },
      // Keep the wage-scale assertion below; the extra £1,000 is keeper reserve.
      clubs: { club: { ...club(["target"]), reputation: 13, weeklyWageBudget: 1_600 } },
      leagues: { league: { id: "league", country: "England" } },
      fixtures: {}, matchRatings: {}, managerProfiles: {},
    } as unknown as GameState;
    const willing = { chance: () => true, nextInt: (min: number) => min };
    const renewed = processContractExpiries(state, willing as never);
    expect(renewed.renewals).toHaveLength(1);
    expect(renewed.renewals[0].wage).toBeLessThanOrEqual(600);
    expect(renewed.releasedPlayers).toHaveLength(0);

    const released = processContractExpiries(state, { ...willing, chance: () => false } as never);
    expect(released.releasedPlayers[0].wageExpectation).toBe(500);
    expect(candidate.wage).toBe(500);
  });

  it("values a needed regular relative to his own level instead of discarding lower-league quality", () => {
    const evaluate = (ability: number, reputation: number) => {
      const target = player({ currentAbility: ability, morale: 5, form: 0 });
      const teammates = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [
        `mate-${i}`, player({ id: `mate-${i}`, position: "CB", currentAbility: ability - 5 }),
      ]));
      return calculateContractRenewalChance(target, {
        ...club([target.id, ...Object.keys(teammates)]), reputation,
      }, { players: { target, ...teammates }, fixtures: {}, matchRatings: {}, currentSeason: 3 } as unknown as GameState);
    };
    expect(evaluate(40, 20)).toBeGreaterThanOrEqual(0.7);
    expect(Math.abs(evaluate(40, 20) - evaluate(140, 70))).toBeLessThan(0.1);
  });

  it("values a happy, needed regular above an unhappy unused player in a crowded role", () => {
    const fixtures = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [
      `f${index}`,
      { id: `f${index}`, season: 3, week: index + 1, played: true, homeClubId: "club", awayClubId: "other" },
    ]));
    const matchRatings = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [
      `f${index}`,
      { target: { playerId: "target", rating: 6.9, started: true, minutesPlayed: 85 } },
    ]));
    const regular = player({});
    const state = {
      currentSeason: 3,
      fixtures,
      matchRatings,
      players: { target: regular },
    } as unknown as GameState;
    const regularChance = calculateContractRenewalChance(regular, club(["target"]), state);

    const crowdedPlayers = Object.fromEntries(Array.from({ length: 4 }, (_, index) => [
      `cm${index}`,
      { id: `cm${index}`, position: "CM" },
    ])) as GameState["players"];
    const unused = player({ morale: 2, form: -2, age: 32 });
    const unusedState = {
      currentSeason: 3,
      fixtures,
      matchRatings: {},
      players: { target: unused, ...crowdedPlayers },
    } as unknown as GameState;
    const unusedChance = calculateContractRenewalChance(
      unused,
      club(["target", ...Object.keys(crowdedPlayers)]),
      unusedState,
    );

    expect(regularChance).toBeGreaterThan(unusedChance + 0.35);
  });

  it("requires the player to accept a renewal, even when the club wants one", () => {
    const candidate = player({
      position: "CAM",
      currentAbility: 130,
      morale: 2,
      contractExpiry: 3,
      personalityProfile: {
        archetype: "mercenary",
        traits: [],
        transferWillingness: 0.9,
        dressingRoomImpact: -1,
        formVolatility: 0.5,
        bigMatchModifier: 0,
        hiddenUntilRevealed: true,
        revealedTraits: [],
      },
    });
    const expiringClub = {
      ...club(["target"]),
      reputation: 80,
    };
    const state = {
      currentWeek: 38,
      currentSeason: 3,
      players: { target: { ...candidate, clubId: "club", contractClubId: "club" } },
      clubs: { club: expiringClub },
      leagues: { league: { id: "league", country: "England" } },
      fixtures: {},
      matchRatings: {},
      managerProfiles: {
        club: { clubId: "club", preferredFormation: "4-4-2" },
      },
    } as unknown as GameState;
    const rng = {
      chance: (value: number) => value >= 0.55,
      nextInt: (min: number) => min,
    };

    const result = processContractExpiries(state, rng as never);

    expect(result.renewals).toEqual([]);
    expect(result.releasedPlayers.map((released) => released.playerId)).toEqual(["target"]);
  });

  it("produces age-appropriate renewal terms and wages when both sides agree", () => {
    const young = player({
      id: "young",
      age: 20,
      position: "ST",
      wage: 1_000,
      currentAbility: 110,
      contractExpiry: 3,
      clubId: "club",
      contractClubId: "club",
    });
    const veteran = player({
      id: "veteran",
      age: 34,
      position: "CB",
      wage: 2_200,
      currentAbility: 108,
      contractExpiry: 3,
      clubId: "club",
      contractClubId: "club",
      personalityProfile: {
        archetype: "professional",
        traits: [],
        transferWillingness: 0.3,
        dressingRoomImpact: 1,
        formVolatility: 0.2,
        bigMatchModifier: 0,
        hiddenUntilRevealed: true,
        revealedTraits: [],
      },
    });
    const fixtures = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [
      `f${index}`,
      { id: `f${index}`, season: 3, week: index + 1, played: true, homeClubId: "club", awayClubId: "other" },
    ]));
    const matchRatings = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [
      `f${index}`,
      {
        young: { playerId: "young", rating: 7.2, started: true, minutesPlayed: 90 },
        veteran: { playerId: "veteran", rating: 6.8, started: true, minutesPlayed: 90 },
      },
    ]));
    const state = {
      currentWeek: 38,
      currentSeason: 3,
      players: { young, veteran },
      clubs: {
        club: {
          ...club(["young", "veteran"]),
          reputation: 65,
          budget: 20_000_000,
        },
      },
      leagues: { league: { id: "league", country: "England" } },
      fixtures,
      matchRatings,
      managerProfiles: {
        club: { clubId: "club", preferredFormation: "4-4-2" },
      },
    } as unknown as GameState;
    const rng = {
      chance: () => true,
      nextInt: (min: number) => min,
    };

    const result = processContractExpiries(state, rng as never);
    const youngRenewal = result.renewals.find((renewal) => renewal.playerId === "young");
    const veteranRenewal = result.renewals.find((renewal) => renewal.playerId === "veteran");

    expect(youngRenewal).toMatchObject({ contractLength: 4 });
    expect(veteranRenewal).toMatchObject({ contractLength: 1 });
    expect((youngRenewal?.wage ?? 0)).toBeGreaterThan(young.wage);
    expect((veteranRenewal?.wage ?? 0)).toBeGreaterThanOrEqual(100);
  });
});

it("replans after the first keeper agrees so reserve keepers do not displace outfield renewals", () => {
  const candidates = Array.from({ length: 11 }, (_, i) => player({
    id: `expiring-${i}`, clubId: "club", contractClubId: "club", contractExpiry: 3,
    position: i < 2 ? "GK" : "CM", age: 26, currentAbility: i < 2 ? 27 - i : 25,
    potentialAbility: 40, morale: 5, form: 0, wage: 500,
  }));
  const ongoing = player({ ...candidates[2], id: "ongoing", contractExpiry: 5 });
  const players = Object.fromEntries([...candidates, ongoing].map(p => [p.id, p]));
  const state = { currentWeek: 38, currentSeason: 3, players,
    clubs: { club: { ...club(Object.keys(players)), reputation: 13, weeklyWageBudget: 5_500 } },
    leagues: { league: { country: "England" } }, fixtures: {}, matchRatings: {}, managerProfiles: {},
  } as unknown as GameState;
  const willing = { chance: () => true, nextInt: (minimum: number) => minimum };
  const result = processContractExpiries(state, willing as never);
  expect(result.renewals[0].playerId).toBe("expiring-0");
  expect(result.renewals.slice(1, 10).map(r => players[r.playerId].position)).toEqual(Array(9).fill("CM"));
  expect(result.renewals.reduce((sum, r) => sum + r.wage, ongoing.wage)).toBeLessThanOrEqual(5500);
  expect(result.releasedPlayers.map(p => p.playerId)).toContain("expiring-1");
  expect(state.clubs.club.playerIds).toHaveLength(12);
  const reversed = { ...state, players: Object.fromEntries(Object.entries(players).reverse()) };
  expect(processContractExpiries(reversed, willing as never)).toEqual(result);
});
