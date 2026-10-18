import type { PlayerDevelopmentHistoryEntry } from "./developmentHistoryTypes";

// Persisted ordinal tables: append new values; never reorder existing values.
const EVENTS = ["routine-growth", "breakthrough", "decline", "injury-setback"] as const;
const BANDS = ["excellent", "supportive", "mixed", "restricted", "adverse"] as const;
export type ArchivedDevelopmentHistoryEntry = PlayerDevelopmentHistoryEntry |
  [season: number, week: number, event: number, environment: number, clubId?: string];

export function expandDevelopmentHistoryEntry(stored: ArchivedDevelopmentHistoryEntry): PlayerDevelopmentHistoryEntry {
  if (!Array.isArray(stored)) return stored;
  return { season: stored[0], week: stored[1], event: EVENTS[stored[2]], environmentBand: BANDS[stored[3]],
    ...(stored[4] !== undefined ? { clubId: stored[4] } : {}) };
}

export function packDevelopmentHistoryEntry(entry: ArchivedDevelopmentHistoryEntry): ArchivedDevelopmentHistoryEntry {
  if (Array.isArray(entry)) return entry;
  if (Object.keys(entry).some(key => !["season", "week", "event", "environmentBand", "clubId"].includes(key))) return entry;
  const event = EVENTS.indexOf(entry.event), band = BANDS.indexOf(entry.environmentBand);
  if (event < 0 || band < 0) return entry;
  return entry.clubId !== undefined ? [entry.season, entry.week, event, band, entry.clubId]
    : [entry.season, entry.week, event, band];
}
