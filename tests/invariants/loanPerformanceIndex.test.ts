import { describe, expect, it } from "vitest";
import type {
  Club,
  GameState,
  LoanDeal,
  MatchPlayerStats,
  Player,
  PlayerMatchRating,
} from "@/engine/core/types";
import { generatePlayer } from "@/engine/players/generation";
import { RNG } from "@/engine/rng";
import {
  processLoanPerformance,
  type AuthoritativeLoanFixture,
} from "@/engine/world/loans";

function makePlayer(id: string, clubId: string): Player {
  return {
    ...generatePlayer(new RNG(`loan-performance-${id}`), {
      position: "CM",
      ageRange: [20, 20],
      abilityRange: [90, 90],
      nationality: "English",
      clubId,
      firstName: "Loan",
      lastName: id,
    }),
    id,
    clubId,
    contractClubId: "parent",
    loanParentClubId: "parent",
    onLoan: true,
  };
}

function makeClub(id: string, playerIds: string[]): Club {
  return {
    id,
    name: id,
    shortName: id,
    leagueId: "league",
    reputation: 50,
    budget: 1_000_000,
    scoutingPhilosophy: "marketSmart",
    managerId: `manager-${id}`,
    playerIds,
    academyPlayerIds: [],
    youthAcademyRating: 10,
  };
}

function makeDeal(
  playerId: string,
  loanClubId: string,
  status: LoanDeal["status"] = "active",
): LoanDeal {
  return {
    id: `deal-${playerId}`,
    playerId,
    parentClubId: "parent",
    loanClubId,
    startWeek: 2,
    startSeason: 2,
    endWeek: 30,
    endSeason: 2,
    loanFee: 0,
    wageContribution: 50,
    recallClause: true,
    status,
    agreedPlayingTime: "key",
    startCurrentAbility: 88,
    performanceRecord: {
      appearances: 2,
      goals: 0,
      assists: 1,
      avgRating: 6.5,
      developmentDelta: 1,
      parentClubSatisfaction: 55,
      loanClubSatisfaction: 50,
    },
  };
}

function makeRating(
  playerId: string,
  fixtureId: string,
  value: number,
  stats: MatchPlayerStats = {},
): PlayerMatchRating {
  return {
    playerId,
    fixtureId,
    started: true,
    minutesPlayed: 90,
    rating: value,
    eventCount: 0,
    stats,
    source: "simulated",
  };
}

function makeState(): GameState {
  const players = {
    player1: makePlayer("player1", "loan-a"),
    player2: makePlayer("player2", "loan-a"),
  };
  return {
    activeLoans: [
      makeDeal("player1", "loan-a"),
      makeDeal("player2", "loan-a"),
      makeDeal("missing", "loan-a"),
      makeDeal("player2", "loan-a", "completed"),
    ],
    players,
    clubs: {
      parent: makeClub("parent", []),
      "loan-a": makeClub("loan-a", ["player1", "player2"]),
      opponent: makeClub("opponent", []),
    },
    fixtures: {},
  } as unknown as GameState;
}

describe("canonical loan performance", () => {
  it("records appearances, ratings, goals, and assists only from fixture participation", () => {
    const state = makeState();
    const fixtures: AuthoritativeLoanFixture[] = [{
      homeClubId: "loan-a",
      awayClubId: "opponent",
      playerRatings: {
        player1: makeRating("player1", "current", 7.4, { goals: 1, assists: 1 }),
      },
    }];

    const updated = processLoanPerformance(state, 8, 2, fixtures, 38);
    const playerOne = updated[0].performanceRecord!;
    const playerTwo = updated[1].performanceRecord!;

    expect(playerOne).toMatchObject({
      appearances: 3,
      goals: 1,
      assists: 2,
      avgRating: 6.8,
    });
    expect(playerTwo).toMatchObject({
      appearances: 2,
      goals: 0,
      assists: 1,
      avgRating: 6.5,
    });
    expect(updated[2]).toBe(state.activeLoans![2]);
    expect(updated[3]).toBe(state.activeLoans![3]);
  });

  it("counts every authoritative appearance when a club plays twice in one week", () => {
    const state = makeState();
    const fixtures: AuthoritativeLoanFixture[] = [
      {
        homeClubId: "loan-a",
        awayClubId: "opponent",
        playerRatings: {
          player1: makeRating("player1", "league", 7, { goals: 1 }),
        },
      },
      {
        homeClubId: "opponent",
        awayClubId: "loan-a",
        playerRatings: {
          player1: makeRating("player1", "cup", 8, { assists: 1 }),
        },
      },
    ];

    const performance = processLoanPerformance(state, 8, 2, fixtures, 38)[0]
      .performanceRecord!;

    expect(performance).toMatchObject({
      appearances: 4,
      goals: 1,
      assists: 2,
      avgRating: 7,
    });
  });
});
