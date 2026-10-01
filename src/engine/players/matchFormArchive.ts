import type { ExpandedMatchFormEntry, MatchFormEntry } from "../core/types/player";

export function expandMatchFormEntry(entry: MatchFormEntry): ExpandedMatchFormEntry {
  return Array.isArray(entry)
    ? { fixtureId: entry[0], week: entry[1], season: entry[2], rating: entry[3] } : entry;
}

export function matchFormRating(entry: MatchFormEntry): number {
  return Array.isArray(entry) ? entry[3] : entry.rating;
}

export function compactMatchFormEntry(entry: MatchFormEntry): MatchFormEntry {
  if (Array.isArray(entry)) return entry;
  // Preserve custom extension fields rather than silently losing mod data.
  if (Object.keys(entry).some(key => !["fixtureId", "week", "season", "rating"].includes(key))) return entry;
  return [entry.fixtureId, entry.week, entry.season, entry.rating];
}
