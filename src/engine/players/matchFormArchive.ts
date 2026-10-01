import type { ExpandedMatchFormEntry, MatchFormEntry, MatchFormFixtureRef } from "../core/types/player";

function scheduledFixtureId(leagueId: string, ordinal: number, week: number, season: number): string {
  return `fixture-${leagueId}-s${season}-w${String(week).padStart(2, "0")}-${String(ordinal).padStart(4, "0")}`;
}

function compactFixtureRef(fixtureId: string, week: number, season: number): MatchFormFixtureRef {
  if (!Number.isSafeInteger(week) || !Number.isSafeInteger(season)) return fixtureId;
  // The league ID may itself contain hyphens or date-like fragments; match greedily.
  const match = /^fixture-(.+)-s(\d+)-w(\d+)-(\d+)$/.exec(fixtureId);
  if (!match || Number(match[2]) !== season || Number(match[3]) !== week) return fixtureId;
  const ordinal = Number(match[4]);
  if (!Number.isSafeInteger(ordinal)) return fixtureId;
  // Preserve custom padding, date mismatches and arbitrary IDs byte-for-byte.
  if (scheduledFixtureId(match[1], ordinal, week, season) !== fixtureId) return fixtureId;
  const compact: [leagueId: string, fixtureOrdinal: number] = [match[1], ordinal];
  return JSON.stringify(compact).length < JSON.stringify(fixtureId).length ? compact : fixtureId;
}

export function expandMatchFormEntry(entry: MatchFormEntry): ExpandedMatchFormEntry {
  if (!Array.isArray(entry)) return entry;
  const fixtureRef = entry[0];
  const fixtureId = typeof fixtureRef === "string" ? fixtureRef
    : scheduledFixtureId(fixtureRef[0], fixtureRef[1], entry[1], entry[2]);
  return { fixtureId, week: entry[1], season: entry[2], rating: entry[3] };
}

export function matchFormRating(entry: MatchFormEntry): number {
  return Array.isArray(entry) ? entry[3] : entry.rating;
}

export function compactMatchFormEntry(entry: MatchFormEntry): MatchFormEntry {
  if (Array.isArray(entry)) {
    // Upgrade old string tuples while retaining already-packed rows and extra columns.
    if (entry.length !== 4 || typeof entry[0] !== "string") return entry;
    const fixtureRef = compactFixtureRef(entry[0], entry[1], entry[2]);
    return fixtureRef === entry[0] ? entry : [fixtureRef, entry[1], entry[2], entry[3]];
  }
  // Only complete, valid known-field objects may become recognized tuples.
  // Preserve incomplete legacy rows, explicit nulls and custom fields as objects.
  const keys = ["fixtureId", "week", "season", "rating"] as const;
  if (Object.keys(entry).length !== keys.length
    || Object.keys(entry).some(key => !keys.includes(key as typeof keys[number]))
    || typeof entry.fixtureId !== "string"
    || ![entry.week, entry.season, entry.rating].every(value => typeof value === "number" && Number.isFinite(value))) return entry;
  return [compactFixtureRef(entry.fixtureId, entry.week, entry.season), entry.week, entry.season, entry.rating];
}
