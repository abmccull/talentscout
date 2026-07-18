import { describe, expect, it } from "vitest";
import type { AlumniRecord, LoanDeal, Player, PlayerMatchRating } from "@/engine/core/types";
import { buildStandingsByLeague } from "@/engine/core/standings";
import { generateAlumniSeasonSummary } from "@/engine/youth/alumni";
import { simulateAbstractCompetitionWeek } from "@/engine/world/abstractCompetition";
import { processLoanPerformance } from "@/engine/world/loans";
import { calculateTransferMotivation } from "@/engine/world/transferMotivation";
import {
  buildAbstractCompetitionHarness,
  mergeAbstractFixtures,
  mergeAbstractMatchRatings,
  minimalGameState,
} from "./abstractCompetitionHarness";

function appearancesForPlayer(
  ratingsByFixture: Record<string, Record<string, PlayerMatchRating>>,
  playerId: string,
): number {
  return Object.values(ratingsByFixture).reduce((count, fixtureRatings) => {
    const rating = fixtureRatings[playerId];
    if (!rating) return count;
    return count + ((rating.minutesPlayed ?? 0) > 0 ? 1 : 0);
  }, 0);
}

describe("abstract competition cross-consumer authority", () => {
  it("feeds league standings from canonical abstract fixture facts", () => {
    const harness = buildAbstractCompetitionHarness();
    const week = simulateAbstractCompetitionWeek({
      worldSeed: "abstract-consumers-standings",
      season: 3,
      week: 1,
      ...harness,
    });
    const fixtures = mergeAbstractFixtures(week.fixturesPlayed);

    const standings = buildStandingsByLeague(fixtures, harness.clubs, 3)["league-abstract"];
    const [fixtureA, fixtureB] = week.fixturesPlayed;

    expect(Object.values(standings).every((entry) => entry.played === 1)).toBe(true);
    expect(standings[fixtureA.homeClubId].goalsFor).toBe(fixtureA.homeGoals);
    expect(standings[fixtureA.awayClubId].goalsAgainst).toBe(fixtureA.homeGoals);
    expect(standings[fixtureB.homeClubId].goalsFor).toBe(fixtureB.homeGoals);
    expect(standings[fixtureB.awayClubId].goalsAgainst).toBe(fixtureB.homeGoals);
    expect(
      Object.values(standings).reduce((sum, entry) => sum + entry.points, 0),
    ).toBeGreaterThanOrEqual(4);
  });

  it("feeds loan participation, transfer motivation, and alumni from canonical abstract match ratings", () => {
    const harness = buildAbstractCompetitionHarness();
    const week = simulateAbstractCompetitionWeek({
      worldSeed: "abstract-consumers-ratings",
      season: 3,
      week: 1,
      ...harness,
    });
    const fixtures = mergeAbstractFixtures(week.fixturesPlayed);
    const matchRatings = mergeAbstractMatchRatings(week.matchRatingsByFixture);
    const playerId = "abstract-a-7";
    const basePlayer = harness.players[playerId];
    const player: Player = {
      ...basePlayer,
      age: 19,
      morale: 4,
      contractExpiry: 4,
      seasonRatings: [{
        season: 3,
        avgRating: 9.9,
        appearances: 44,
        goals: 30,
        assists: 25,
        cleanSheets: 0,
      }],
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
    };
    const players = {
      ...harness.players,
      [playerId]: player,
    };

    const appearances = appearancesForPlayer(matchRatings, playerId);
    expect(appearances).toBe(1);

    const loanDeal: LoanDeal = {
      id: "loan-1",
      playerId,
      parentClubId: "abstract-b",
      loanClubId: player.clubId,
      startWeek: 1,
      startSeason: 3,
      endWeek: 20,
      endSeason: 3,
      loanFee: 0,
      wageContribution: 50,
      recallClause: true,
      status: "active",
      startCurrentAbility: player.currentAbility,
      performanceRecord: {
        appearances: 0,
        goals: 0,
        assists: 0,
        avgRating: 6,
        developmentDelta: 0,
        parentClubSatisfaction: 50,
        loanClubSatisfaction: 50,
      },
    };
    const loanState = minimalGameState({
      currentWeek: 1,
      currentSeason: 3,
      players,
      clubs: harness.clubs,
      activeLoans: [loanDeal],
    });
    const [updatedLoan] = processLoanPerformance(
      loanState,
      1,
      3,
      week.fixturesPlayed,
    );
    expect(updatedLoan.performanceRecord?.appearances).toBe(appearances);
    expect(updatedLoan.performanceRecord?.avgRating).toBe(
      matchRatings[Object.keys(matchRatings)[0]][playerId]?.rating
      ?? matchRatings[Object.keys(matchRatings)[1]][playerId]?.rating,
    );

    const crowdedClub = {
      ...harness.clubs[player.clubId],
      playerIds: [
        player.id,
        ...harness.clubs[player.clubId].playerIds.filter((id) => id !== player.id),
      ],
    };
    const noUsageState = minimalGameState({
      currentSeason: 3,
      currentWeek: 2,
      players,
      clubs: {
        ...harness.clubs,
        [crowdedClub.id]: crowdedClub,
      },
      managerProfiles: {
        ...harness.managerProfiles,
        [crowdedClub.id]: {
          ...harness.managerProfiles[crowdedClub.id],
          preferredFormation: "4-4-2",
        },
      },
      fixtures,
      matchRatings: {},
    });
    const usageState = {
      ...noUsageState,
      matchRatings,
    };
    const withoutUsage = calculateTransferMotivation(player, noUsageState);
    const withUsage = calculateTransferMotivation(player, usageState);
    expect(withUsage.components.playingTimePressure).toBeLessThan(
      withoutUsage.components.playingTimePressure,
    );
    expect(withUsage.score).toBeLessThan(withoutUsage.score - 6);

    const alumniRecord: AlumniRecord = {
      id: "alumni-1",
      playerId,
      placedClubId: player.clubId,
      currentClubId: player.clubId,
      milestones: [],
      careerSnapshots: [],
      placedWeek: 1,
      placedSeason: 3,
      careerUpdates: [],
      currentStatus: "firstTeam",
      seasonStats: [],
      becameContact: false,
    };
    const alumniSummary = generateAlumniSeasonSummary(
      alumniRecord,
      player,
      3,
      fixtures,
      matchRatings,
    );
    expect(alumniSummary.seasonStats).toHaveLength(1);
    expect(alumniSummary.seasonStats[0]).toMatchObject({
      season: 3,
      appearances,
      source: "canonicalCompetition",
      clubId: player.clubId,
    });
    expect(alumniSummary.seasonStats[0].appearances).not.toBe(
      player.seasonRatings[0].appearances,
    );
  });
});
