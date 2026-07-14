import { describe, expect, it } from "vitest";
import type { WorldHistoryState } from "@/engine/world/worldHistory";
import { buildWorldArchiveComparisonCatalog } from "@/engine/world/historyComparison";

function history(): WorldHistoryState {
  return {
    version: 1,
    latestRecordedSeason: 3,
    seasons: [1, 2, 3].map((season) => ({
      season,
      recordedAfterTotalWeeks: season * 38,
      leagues: [{
        leagueId: "premier",
        country: "england",
        tier: 1,
        clubCount: 2,
        playedFixtures: 38,
      }],
      clubs: [
        {
          clubId: "alpha",
          leagueId: "premier",
          standing: {
            position: 4 - season,
            tableSize: 20,
            played: 38,
            won: 20 + season,
            drawn: 8,
            lost: 10 - season,
            goalsFor: 60 + season,
            goalsAgainst: 40,
            goalDifference: 20 + season,
            points: 68 + season,
          },
          leagueMovement: "stayed",
          nextLeagueId: "premier",
          reputation: 80 + season,
          budget: 10_000_000 + season,
          scoutingPhilosophy: "academyFirst",
          manager: {
            managerId: season < 3 ? "manager-a" : "manager-b",
            managerName: season < 3 ? "Avery Morgan" : "Blair Chen",
            scoutingPreference: "balanced",
            reportInfluence: 0.99,
            preferredFormation: season < 3 ? "4-3-3" : "3-4-2-1",
          },
        },
        {
          clubId: "beta",
          leagueId: "premier",
          standing: {
            position: 10 + season,
            tableSize: 20,
            played: 38,
            won: 10,
            drawn: 10,
            lost: 18,
            goalsFor: 40,
            goalsAgainst: 55,
            goalDifference: -15,
            points: 40,
          },
          leagueMovement: season === 3 ? "relegated" : "stayed",
          nextLeagueId: season === 3 ? "championship" : "premier",
          reputation: 50,
          budget: 2_000_000,
          scoutingPhilosophy: "marketSmart",
          manager: {
            managerId: "manager-c",
            managerName: "Casey Singh",
            scoutingPreference: "dataFirst",
            reportInfluence: 0.75,
            preferredFormation: "4-2-3-1",
          },
        },
      ],
      players: [
        {
          playerId: "player-a",
          firstName: "Alex",
          lastName: "Prospect",
          nationality: "English",
          age: 18 + season,
          position: "CM",
          currentAbility: 100 + season * 10,
          marketValue: 1_000_000 * season,
          registeredClubId: "alpha",
          contractClubId: "alpha",
          status: "contracted",
          movementEventIds: season === 1 ? ["move-a"] : [],
          performance: {
            appearances: 10 * season,
            starts: 8 * season,
            minutesPlayed: 700 * season,
            appearancesWithoutMinutes: 0,
            averageRating: 6.5 + season * 0.3,
            goals: season,
            assists: season * 2,
            cleanSheets: 0,
          },
        },
        {
          playerId: "player-b",
          firstName: "Bailey",
          lastName: "Target",
          age: 21 + season,
          position: "ST",
          currentAbility: 120,
          marketValue: 2_000_000,
          registeredClubId: "beta",
          contractClubId: "beta",
          status: "contracted",
          movementEventIds: [],
        },
      ],
    })),
  };
}

describe("player-safe world archive comparisons", () => {
  it("builds useful multi-season player, club, and manager trajectories", () => {
    const catalog = buildWorldArchiveComparisonCatalog(history());
    const player = catalog.players.find((entry) => entry.id === "player-a")!;
    const club = catalog.clubs.find((entry) => entry.id === "alpha")!;
    const manager = catalog.managers.find((entry) => entry.id === "manager-a")!;

    expect(player.summary).toMatchObject({
      seasonsRecorded: 3,
      totalAppearances: 60,
      totalGoals: 6,
      totalAssists: 12,
      weightedAverageRating: 7.2,
      movementCount: 1,
    });
    expect(club.summary).toMatchObject({
      seasonsRecorded: 3,
      titles: 1,
      bestFinish: 1,
      totalPoints: 210,
      managerCount: 2,
    });
    expect(manager.summary).toMatchObject({
      seasonsRecorded: 2,
      clubsManaged: 1,
      titles: 0,
      bestFinish: 2,
      totalPoints: 139,
      formations: ["4-3-3"],
    });
  });

  it("never projects hidden engine truth into player-facing comparison data", () => {
    const serialized = JSON.stringify(buildWorldArchiveComparisonCatalog(history()));

    expect(serialized).not.toContain("currentAbility");
    expect(serialized).not.toContain("potentialAbility");
    expect(serialized).not.toContain("reportInfluence");
    expect(serialized).not.toContain("scoutingPreference");
    expect(serialized).not.toContain("budget");
    expect(serialized).not.toContain("reputation");
    expect(serialized).toContain("totalAppearances");
    expect(serialized).toContain("preferredFormation");
  });

  it("is deterministic and never mutates the authoritative archive", () => {
    const input = history();
    const before = structuredClone(input);
    const first = buildWorldArchiveComparisonCatalog(input);

    expect(input).toEqual(before);
    expect(buildWorldArchiveComparisonCatalog(structuredClone(input))).toEqual(first);
  });

  it("returns a stable empty catalog before the first archived season", () => {
    expect(buildWorldArchiveComparisonCatalog(undefined)).toEqual({
      players: [],
      clubs: [],
      managers: [],
    });
  });
});
