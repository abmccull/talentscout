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
