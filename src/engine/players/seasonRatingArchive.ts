import type { SeasonRatingEntry, SeasonRatingRecord } from "../core/types/player";
import type { Fixture, Player, PlayerMatchRating } from "../core/types";
import { collectCanonicalAppearances, summarizeCanonicalAppearances } from "../match/canonicalPerformance";

const KEYS = ["season", "avgRating", "appearances", "goals", "assists", "cleanSheets"] as const;

export function expandSeasonRating(entry: SeasonRatingEntry): SeasonRatingRecord {
  return Array.isArray(entry)
    ? { season: entry[0], avgRating: entry[1], appearances: entry[2], goals: entry[3], assists: entry[4], cleanSheets: entry[5] }
    : entry;
}

export function compactSeasonRating(entry: SeasonRatingEntry): SeasonRatingEntry {
  if (Array.isArray(entry)) return entry;
  // Preserve mod fields and incomplete legacy records exactly as supplied.
  if (Object.keys(entry).length !== KEYS.length
    || !KEYS.every(key => typeof entry[key] === "number" && Number.isFinite(entry[key]))) return entry;
  return [entry.season, entry.avgRating, entry.appearances, entry.goals, entry.assists, entry.cleanSheets];
}

/** Project complete season facts before any fixture retention or retirement. */
export function archivePlayerSeasonRatings(
  players: Record<string, Player>,
  fixtures: Record<string, Fixture>,
  matchRatings: Record<string, Record<string, PlayerMatchRating>>,
  season: number,
): Record<string, Player> {
  let archived = players;
  for (const [playerId, appearances] of collectCanonicalAppearances(fixtures, matchRatings, season)) {
    const player = players[playerId];
    if (!player) continue;
    const totals = summarizeCanonicalAppearances(appearances);
    if (!totals) continue;
    const prior = (player.seasonRatings ?? []).find((entry) => expandSeasonRating(entry).season === season);
    const record = {
      ...(prior ? expandSeasonRating(prior) : {}),
      season, avgRating: totals.averageRating, appearances: totals.appearances,
      goals: totals.goals, assists: totals.assists, cleanSheets: totals.cleanSheets,
    };
    const withoutSeason = (player.seasonRatings ?? []).filter((entry) => expandSeasonRating(entry).season !== season);
    if (archived === players) archived = { ...players };
    archived[playerId] = { ...player,
      seasonRatings: [...withoutSeason, compactSeasonRating(record)].sort((a, b) => expandSeasonRating(a).season - expandSeasonRating(b).season) };
  }
  return archived;
}
