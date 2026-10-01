import { describe, expect, it } from "vitest";
import { compactClubSeasonHistory, expandClubSeasonHistory } from "@/engine/world/clubSeasonArchive";
import { buildWorldArchiveComparisonCatalog } from "@/engine/world/historyComparison";
import type { ClubSeasonHistory, WorldHistoryState } from "@/engine/world/worldHistory";

const club: ClubSeasonHistory = {
  clubId: "historic-club", leagueId: "league", nextLeagueId: "upper-league",
  leagueMovement: "promoted", reputation: 52.175, budget: 123456.789,
  scoutingPhilosophy: "marketSmart",
  manager: { managerId: "historical-manager", managerName: "Morgan Price",
    scoutingPreference: "balanced", reportInfluence: 0, preferredFormation: "4-3-3" },
  standing: { position: 1, tableSize: 20, played: 38, won: 24, drawn: 9, lost: 5,
    goalsFor: 68, goalsAgainst: 29, goalDifference: 39, points: 81 },
  tacticalStyle: { defensiveLine: 0.375, pressingIntensity: 0.9, tempo: 0.6,
    width: 0.5, directness: 0.4, tacticalIdentity: "balanced",
    eventDistribution: { shot: 0.23175 }, strengthAgainst: [], weakAgainst: ["balanced"] },
};

describe("club-season archive", () => {
  it("preserves exact historical facts and optional field presence through serialized reload", () => {
    for (const original of [club, { ...club, standing: undefined, tacticalStyle: undefined }]) {
      const before = JSON.stringify(original);
      const packed = compactClubSeasonHistory(original);
      expect("archiveV1" in packed).toBe(true);
      const reloaded = JSON.parse(JSON.stringify(packed));
      expect(expandClubSeasonHistory(reloaded)).toStrictEqual(JSON.parse(before));
      expect(JSON.stringify(original)).toBe(before);
      expect(compactClubSeasonHistory(packed)).toBe(packed);
      expect(JSON.stringify(packed).length).toBeLessThan(before.length);
    }
  });

  it("preserves unknown top-level and nested extension records instead of discarding them", () => {
    const extension = { ...club, modHistory: { source: "custom" } };
    const nested = { ...club, tacticalStyle: { ...club.tacticalStyle!, modTempo: 7 } };
    expect(compactClubSeasonHistory(extension)).toBe(extension);
    expect(compactClubSeasonHistory(nested)).toBe(nested);
    expect(expandClubSeasonHistory(club)).toBe(club);
  });

  it("keeps club and manager comparison projections identical across mixed legacy and packed seasons", () => {
    const original: WorldHistoryState = { version: 1, latestRecordedSeason: 2,
      seasons: [1, 2].map(season => ({ season, recordedAfterTotalWeeks: season * 46,
        leagues: [], players: [], clubs: [{ ...club, budget: club.budget + season }] })) };
    const mixed = { ...original, seasons: original.seasons.map((season, index) => index === 0
      ? { ...season, clubs: season.clubs.map(compactClubSeasonHistory) } : season) };
    expect(buildWorldArchiveComparisonCatalog(JSON.parse(JSON.stringify(mixed))))
      .toStrictEqual(buildWorldArchiveComparisonCatalog(original));
  });
});
