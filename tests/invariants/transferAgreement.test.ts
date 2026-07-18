import { describe, expect, it } from "vitest";
import type { Club, GameState, League, Player, Position } from "@/engine/core/types";
import {
  assessTransferPlayerWillingness,
  assessTransferRegistrationFit,
  proposeTransferAgreement,
} from "@/engine/transfers";

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

describe("transfer agreement engine", () => {
  it("proposes viable senior terms when the club, route, and player all align", () => {
    const target = player("target", "seller", "CM");
    const leagues = {
      england: league("england", "England", ["seller"]),
      spain: league("spain", "Spain", ["buyer"]),
    };
    const clubs = {
      seller: club("seller", "england", 58, ["target"]),
      buyer: club("buyer", "spain", 66, ["benchA", "benchB"]),
    };
    const state = stateFor(target, clubs, leagues);
    const proposal = proposeTransferAgreement({
      player: target,
      sellingClub: clubs.seller,
      buyingClub: clubs.buyer,
      state,
    });

    expect(proposal.viable).toBe(true);
    expect(["key", "regular"]).toContain(proposal.role);
    expect(proposal.fee).toBeGreaterThan(2_000_000);
    expect(proposal.wage).toBeGreaterThan(target.wage);
    expect(proposal.contractLength).toBeGreaterThanOrEqual(3);
    expect(proposal.registration.status).toBe("clear");
    expect(proposal.affordability.result.affordable).toBe(true);
    expect(proposal.willingness.willingToJoin).toBe(true);
  });

  it("blocks under-16 cross-border moves in the registration fit stage", () => {
    const target = player("kid", "seller", "LW", {
      age: 15,
      dateOfBirth: { day: 4, month: 3, year: 2011 },
      nationality: "Brazil",
    });
    const leagues = {
      brazil: league("brazil", "Brazil", ["seller"]),
      germany: league("germany", "Germany", ["buyer"]),
    };
    const clubs = {
      seller: club("seller", "brazil", 52, ["kid"]),
      buyer: club("buyer", "germany", 70, [], { scoutingPhilosophy: "globalRecruiter" }),
    };

    const fit = assessTransferRegistrationFit({
      player: target,
      sellingClub: clubs.seller,
      buyingClub: clubs.buyer,
      leagues,
    });

    expect(fit.status).toBe("blocked");
    expect(fit.eligible).toBe(false);
    expect(fit.requiresClearance).toBe(true);
  });

  it("treats cautious role and difficult route terms as a willingness drag", () => {
    const target = player("veteran", "seller", "CB", {
      age: 34,
      wage: 28_000,
      currentAbility: 118,
      marketValue: 1_500_000,
      nationality: "England",
      form: -1,
      morale: 4,
      personalityProfile: {
        archetype: "loyal",
        traits: [],
        transferWillingness: 0.15,
        dressingRoomImpact: 2,
        formVolatility: 0.2,
        bigMatchModifier: 0,
        hiddenUntilRevealed: true,
        revealedTraits: [],
      },
    });
    const leagues = {
      england: league("england", "England", ["seller"]),
      japan: league("japan", "Japan", ["buyer"]),
    };
    const clubs = {
      seller: club("seller", "england", 60, ["veteran"]),
      buyer: club("buyer", "japan", 50, [], { budget: 8_000_000, weeklyWageBudget: 120_000 }),
    };
    const state = stateFor(target, clubs, leagues);
    const registration = assessTransferRegistrationFit({
      player: target,
      sellingClub: clubs.seller,
      buyingClub: clubs.buyer,
      leagues,
    });
    const willingness = assessTransferPlayerWillingness({
      player: target,
      sellingClub: clubs.seller,
      buyingClub: clubs.buyer,
      state,
      registration,
      terms: {
        role: "rotation",
        wage: 24_000,
        contractLength: 3,
      },
    });

    expect(registration.status).toBe("conditional");
    expect(willingness.willingToJoin).toBe(false);
    expect(willingness.probability).toBeLessThan(0.52);
  });
});
