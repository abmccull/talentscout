import { describe, expect, it } from "vitest";
import type {
  Club,
  Fixture,
  GameState,
  LoanDeal,
  Player,
} from "@/engine/core/types";
import {
  gameWeeksBetweenWithSeasonLength,
  LEGACY_SEASON_LENGTH_WEEKS,
} from "@/engine/core/gameDate";
import { generatePlayer } from "@/engine/players/generation";
import { RNG } from "@/engine/rng";
import { isFixtureInSeason } from "@/engine/world/fixtures";
import { processLoanPerformance } from "@/engine/world/loans";

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

function makeDeal(playerId: string, loanClubId: string, status: LoanDeal["status"] = "active"): LoanDeal {
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
    agreedPlayingTime: playerId.endsWith("1") ? "key" : "rotation",
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

/** Previous implementation retained as a deterministic equivalence oracle. */
function processLoanPerformanceReference(
  state: GameState,
  week: number,
  season: number,
  rng: RNG,
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
): LoanDeal[] {
  const updatedLoans: LoanDeal[] = [];
  for (const deal of state.activeLoans ?? []) {
    if (deal.status !== "active") {
      updatedLoans.push(deal);
      continue;
    }
    const player = state.players[deal.playerId];
    if (!player) {
      updatedLoans.push(deal);
      continue;
    }
    const perf = deal.performanceRecord ?? {
      appearances: 0,
      goals: 0,
      assists: 0,
      avgRating: 6,
      developmentDelta: 0,
      parentClubSatisfaction: 50,
      loanClubSatisfaction: 50,
    };
    const loanClub = state.clubs[deal.loanClubId];
    const hasFixture = loanClub
      ? Object.values(state.fixtures).some(
          (fixture) =>
            isFixtureInSeason(fixture, season)
            && fixture.week === week
            && (fixture.homeClubId === loanClub.id || fixture.awayClubId === loanClub.id),
        )
      : false;
    const playingTimeChance = {
      key: 0.92,
      regular: 0.78,
      rotation: 0.55,
      prospect: 0.35,
    }[deal.agreedPlayingTime ?? "rotation"];
    const appeared = hasFixture && !player.injured && rng.chance(playingTimeChance);
    const newAppearances = perf.appearances + (appeared ? 1 : 0);
    const newGoals = perf.goals + (appeared && rng.chance(0.08) ? 1 : 0);
    const newAssists = perf.assists + (appeared && rng.chance(0.06) ? 1 : 0);
    let newAvgRating = perf.avgRating;
    if (appeared) {
      const matchRating = 5.5 + rng.nextFloat(0, 2.5) + player.form * 0.3;
      const clampedRating = Math.max(4, Math.min(9.5, matchRating));
      const totalRatingPoints = perf.avgRating * perf.appearances + clampedRating;
      newAvgRating = newAppearances > 0 ? totalRatingPoints / newAppearances : 6;
    }
    const startCurrentAbility = deal.startCurrentAbility
      ?? (player.currentAbility - perf.developmentDelta);
    const newDevDelta = player.currentAbility - startCurrentAbility;
    const elapsedWeeks = Math.max(
      1,
      gameWeeksBetweenWithSeasonLength(
        { week: deal.startWeek, season: deal.startSeason },
        { week, season },
        seasonLength,
      ) + 1,
    );
    const appearanceRate = newAppearances / elapsedWeeks;
    const parentSatisfaction = Math.min(
      100,
      Math.max(0, 50 + (appearanceRate > 0.5 ? 20 : -10) + newDevDelta * 5),
    );
    const loanSatisfaction = Math.min(
      100,
      Math.max(0, 50 + (newAvgRating > 6.5 ? 15 : -10) + (appeared ? 5 : -3)),
    );
    updatedLoans.push({
      ...deal,
      startCurrentAbility,
      performanceRecord: {
        appearances: newAppearances,
        goals: newGoals,
        assists: newAssists,
        avgRating: Math.round(newAvgRating * 10) / 10,
        developmentDelta: newDevDelta,
        parentClubSatisfaction: Math.round(parentSatisfaction),
        loanClubSatisfaction: Math.round(loanSatisfaction),
      },
    });
  }
  return updatedLoans;
}

describe("loan performance fixture index", () => {
  it("preserves outputs and RNG position while enumerating fixtures once", () => {
    const players = {
      player1: makePlayer("player1", "loan-a"),
      player2: makePlayer("player2", "loan-b"),
      player3: { ...makePlayer("player3", "loan-a"), injured: true },
    };
    const fixtures: Record<string, Fixture> = {
      current: {
        id: "current",
        homeClubId: "loan-a",
        awayClubId: "opponent",
        leagueId: "league",
        season: 2,
        week: 8,
        played: false,
      },
      otherWeek: {
        id: "other-week",
        homeClubId: "loan-b",
        awayClubId: "opponent",
        leagueId: "league",
        season: 2,
        week: 9,
        played: false,
      },
      priorSeason: {
        id: "prior-season",
        homeClubId: "loan-b",
        awayClubId: "opponent",
        leagueId: "league",
        season: 1,
        week: 8,
        played: true,
      },
    };
    let fixtureEnumerations = 0;
    const indexedFixtures = new Proxy(fixtures, {
      ownKeys(target) {
        fixtureEnumerations += 1;
        return Reflect.ownKeys(target);
      },
    });
    const state = {
      activeLoans: [
        makeDeal("player1", "loan-a"),
        makeDeal("player2", "loan-b"),
        makeDeal("player3", "loan-a"),
        makeDeal("missing", "loan-a"),
        makeDeal("player2", "loan-b", "completed"),
      ],
      players,
      clubs: {
        parent: makeClub("parent", []),
        "loan-a": makeClub("loan-a", ["player1", "player3"]),
        "loan-b": makeClub("loan-b", ["player2"]),
        opponent: makeClub("opponent", []),
      },
      fixtures: indexedFixtures,
    } as unknown as GameState;
    const referenceState = { ...state, fixtures };
    const optimizedRng = new RNG("loan-performance-equivalence");
    const referenceRng = new RNG("loan-performance-equivalence");

    expect(processLoanPerformance(state, 8, 2, optimizedRng, 38)).toEqual(
      processLoanPerformanceReference(referenceState, 8, 2, referenceRng, 38),
    );
    expect(optimizedRng.next()).toBe(referenceRng.next());
    expect(fixtureEnumerations).toBe(1);
  });
});
