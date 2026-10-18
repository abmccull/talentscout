import { describe, expect, it } from "vitest";
import type { Club, Fixture, League, Player, PlayerMatchRating } from "@/engine/core/types";
import { archivePlayerSeasonRatings, expandSeasonRating } from "@/engine/players/seasonRatingArchive";
import { generateAlumniSeasonSummary } from "@/engine/youth/alumni";
import { recordCompletedSeasonWorldHistory } from "@/engine/world/worldHistory";
import type { AlumniRecord } from "@/engine/core/types";

const season = 3;
function fixture(id: string, week: number, overrides: Partial<Fixture> = {}): Fixture {
  return { id, season, week, played: true, leagueId: "league", homeClubId: "academy", awayClubId: "other", homeGoals: 2, awayGoals: 0, ...overrides };
}
function rating(fixtureId: string, playerId: string, overrides: Partial<PlayerMatchRating> = {}): PlayerMatchRating {
  return { fixtureId, playerId, started: true, minutesPlayed: 90, rating: 7, eventCount: 0, stats: {}, source: "simulated", ...overrides };
}
function player(id: string): Player {
  return { id, firstName: "Truth", lastName: id, clubId: "other", position: "ST", nationality: "English", age: 19, currentAbility: 90, potentialAbility: 120,
    seasonRatings: [[2, 6.75, 10, 2, 3, 0], { season, avgRating: 1, appearances: 99, goals: 99, assists: 0, cleanSheets: 0, provenanceNote: "preserve" }],
  } as unknown as Player;
}
function alumni(id: string): AlumniRecord {
  return { id: `alumni-${id}`, playerId: id, placedClubId: "academy", currentClubId: "other", placedSeason: season, placedWeek: 1,
    milestones: [], careerUpdates: [], careerSnapshots: [], seasonStats: [], becameContact: false, currentStatus: "academy" };
}
function ledger() {
  const fixtures = { first: fixture("first", 1), final: fixture("final", 46, { homeClubId: "other", awayClubId: "academy" }),
    prior: fixture("prior", 1, { season: 2 }), future: fixture("future", 47, { played: false }) };
  const matchRatings = {
    first: { active: rating("first", "active", { source: "attended", rating: 7.2, stats: { goals: 1 } }),
      retired: rating("first", "retired", { stats: { assists: 1 } }),
      bench: rating("first", "bench", { minutesPlayed: 0, stats: { goals: 99 } }),
      unsupported: rating("first", "unsupported", { started: undefined, minutesPlayed: undefined }) },
    final: { active: rating("final", "active", { started: false, minutesPlayed: 30, rating: 8.4, stats: { goals: 2, assists: 1 } }),
      retired: rating("final", "retired", { started: true, minutesPlayed: undefined, rating: 8, stats: { goals: 1 } }) },
    prior: { active: rating("prior", "active", { stats: { goals: 99 } }) },
    future: { active: rating("future", "active", { stats: { goals: 99 } }) },
    orphan: { active: rating("orphan", "active", { stats: { goals: 99 } }) },
  };
  return { fixtures, matchRatings };
}

describe("career season performance truth", () => {
  it("archives every played appearance across clubs before retention, including retired identities, without duplicate seasons or custom-field loss", () => {
    const { fixtures, matchRatings } = ledger();
    const active = { active: player("active"), bench: player("bench"), unsupported: player("unsupported") };
    const retired = { retired: { ...player("retired"), clubId: "" } };
    const original = JSON.stringify({ active, retired, fixtures, matchRatings });
    const archivedActive = archivePlayerSeasonRatings(active, fixtures, matchRatings, season);
    const archivedRetired = archivePlayerSeasonRatings(retired, fixtures, matchRatings, season);
    const current = archivedActive.active.seasonRatings.map(expandSeasonRating).filter(row => row.season === season);
    expect(current).toEqual([{ season, avgRating: 7.8, appearances: 2, goals: 3, assists: 1, cleanSheets: 0, provenanceNote: "preserve" }]);
    expect(archivedActive.active.seasonRatings[0]).toEqual(active.active.seasonRatings[0]);
    expect(archivedActive.bench).toBe(active.bench);
    expect(archivedActive.unsupported).toBe(active.unsupported);
    expect(archivedRetired.retired.seasonRatings.map(expandSeasonRating).find(row => row.season === season)).toMatchObject({ appearances: 2, goals: 1, assists: 1, avgRating: 7.5 });
    expect(archivePlayerSeasonRatings(archivedActive, fixtures, matchRatings, season).active.seasonRatings).toEqual(archivedActive.active.seasonRatings);
    expect(JSON.parse(JSON.stringify(archivedActive)).active.seasonRatings.map(expandSeasonRating)).toEqual(archivedActive.active.seasonRatings.map(expandSeasonRating));
    expect(JSON.stringify({ active, retired, fixtures, matchRatings })).toBe(original);
  });

  it("makes player archive, retained world history and alumni agree on goals, assists, appearances and rating after JSON save/load", () => {
    const { fixtures, matchRatings } = ledger();
    const players = archivePlayerSeasonRatings({ active: player("active") }, fixtures, matchRatings, season);
    const clubs = Object.fromEntries(["academy", "other"].map(id => [id, { id, name: id, shortName: id, leagueId: "league", reputation: 50, budget: 100_000,
      scoutingPhilosophy: "academyFirst", playerIds: id === "other" ? ["active"] : [], youthAcademyRating: 10 } as Club]));
    const leagues = { league: { id: "league", name: "League", shortName: "L", country: "england", tier: 1, clubIds: ["academy", "other"], season } as League };
    const world = recordCompletedSeasonWorldHistory(undefined, { players, fixtures, matchRatings, clubs, leagues, totalWeeksPlayed: 46,
      retiredPlayerIds: [], retiredPlayers: {}, playerMovementHistory: [], managerProfiles: {}, historicallyRelevantPlayerIds: ["active"] }, season);
    const saved = JSON.parse(JSON.stringify({ player: players.active, world, alumni: generateAlumniSeasonSummary(alumni("active"), players.active, season, fixtures, matchRatings) }));
    const row = saved.player.seasonRatings.map(expandSeasonRating).find((entry: { season: number }) => entry.season === season);
    const worldPerformance = saved.world.seasons[0].players.find((entry: { playerId: string }) => entry.playerId === "active").performance;
    const alumniStats = saved.alumni.seasonStats[0];
    expect(worldPerformance).toMatchObject({ appearances: 2, starts: 1, minutesPlayed: 120, goals: 3, assists: 1, averageRating: row.avgRating });
    expect(alumniStats).toMatchObject({ appearances: row.appearances, goals: row.goals, assists: row.assists, avgRating: row.avgRating, source: "canonicalCompetition" });
  });
});
