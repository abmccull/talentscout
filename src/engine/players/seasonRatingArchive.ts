import type { SeasonRatingEntry, SeasonRatingRecord } from "../core/types/player";

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
