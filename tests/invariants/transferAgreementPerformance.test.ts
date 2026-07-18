import { describe, expect, it, vi } from "vitest";
import type { Club, GameState, League, Player, Position } from "@/engine/core/types";

const { calculateTransferMotivationMock } = vi.hoisted(() => ({
  calculateTransferMotivationMock: vi.fn(() => ({
    score: 58,
    willingToMove: true,
    weeklyMoveProbability: 0.06,
    components: {
      contractPressure: 50,
      moralePressure: 20,
      playingTimePressure: 36,
      squadSurplusPressure: 18,
      ambitionPressure: 30,
      tacticalPressure: 12,
      personalityPressure: 44,
      agePressure: 16,
    },
    reasons: ["The contract is close to expiry."],
  })),
}));

vi.mock("@/engine/world/transferMotivation", async () => {
  const actual = await vi.importActual<typeof import("@/engine/world/transferMotivation")>(
    "@/engine/world/transferMotivation",
  );
  return {
    ...actual,
    calculateTransferMotivation: calculateTransferMotivationMock,
  };
});

import { proposeTransferAgreement } from "@/engine/transfers";

function league(id: string, country: string, clubIds: string[]): League {
  return {
    id,
    name: id,
    shortName: id,
    country,
    tier: 1,
    clubIds,
    season: 4,
  };
}

function club(
  id: string,
  leagueId: string,
  reputation: number,
  playerIds: string[],
  overrides: Partial<Club> = {},
): Club {
  return {
    id,
    name: `Club ${id}`,
    shortName: id.toUpperCase(),
    leagueId,
    reputation,
    budget: 18_000_000,
    weeklyWageBudget: 250_000,
    scoutingPhilosophy: "marketSmart",
    managerId: `manager-${id}`,
    playerIds,
    academyPlayerIds: [],
    youthAcademyRating: 12,
    loanedOutPlayerIds: [],
    loanedInPlayerIds: [],
    ...overrides,
  };
}

function player(
  id: string,
  clubId: string,
  position: Position,
  overrides: Partial<Player> = {},
): Player {
  return {
    id,
    firstName: id,
    lastName: "Target",
    age: 23,
    dateOfBirth: { day: 4, month: 3, year: 2003 },
    nationality: "England",
    position,
    secondaryPositions: [],
    preferredFoot: "right",
    clubId,
    contractClubId: clubId,
    contractExpiry: 6,
    wage: 18_000,
    marketValue: 4_500_000,
    attributes: {},
    currentAbility: 132,
    potentialAbility: 150,
    developmentProfile: "balanced",
    wonderkidTier: "none",
    form: 1,
    morale: 6,
    injured: false,
    injuryWeeksRemaining: 0,
    personalityTraits: [],
    personalityRevealed: [],
    playerTraits: [],
    playerTraitsRevealed: [],
    recentMatchRatings: [],
    seasonRatings: [],
    ...overrides,
  } as unknown as Player;
}

function stateFor(playerRecord: Player, clubs: Record<string, Club>, leagues: Record<string, League>): GameState {
  return {
    currentSeason: 4,
    currentWeek: 18,
    players: {
      [playerRecord.id]: playerRecord,
      benchA: player("benchA", "buyer", "ST", { currentAbility: 110, marketValue: 2_000_000 }),
      benchB: player("benchB", "buyer", "CB", { currentAbility: 102, marketValue: 1_000_000 }),
    },
    clubs,
    leagues,
    managerProfiles: {
      buyer: { clubId: "buyer", preferredFormation: "4-3-3" },
      seller: { clubId: "seller", preferredFormation: "4-2-3-1" },
    },
    fixtures: {},
    matchRatings: {},
  } as unknown as GameState;
}

describe("transfer agreement evaluation reuse", () => {
  it("evaluates transfer motivation once per proposal", () => {
    calculateTransferMotivationMock.mockClear();

    const target = player("target", "seller", "CM");
    const leagues = {
      england: league("england", "England", ["seller"]),
      spain: league("spain", "Spain", ["buyer"]),
    };
    const clubs = {
      seller: club("seller", "england", 58, ["target"]),
      buyer: club("buyer", "spain", 66, ["benchA", "benchB"]),
    };

    proposeTransferAgreement({
      player: target,
      sellingClub: clubs.seller,
      buyingClub: clubs.buyer,
      state: stateFor(target, clubs, leagues),
    });

    expect(calculateTransferMotivationMock).toHaveBeenCalledTimes(1);
  });
});
