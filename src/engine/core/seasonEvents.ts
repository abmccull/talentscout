/**
 * Season calendar events module.
 *
 * Provides pre-defined seasonal events that repeat each season (transfer
 * windows, international breaks, tournaments) and utility functions for
 * querying the event calendar. All functions are pure and deterministic —
 * no RNG is required because every event is fixed to known week ranges.
 */

import type { SeasonEvent, SeasonEventType } from "./types";

// =============================================================================
// INTERNAL EVENT DEFINITIONS
// =============================================================================

/**
 * Raw descriptor used to build SeasonEvent objects without the ID, which is
 * computed from season + type + startWeek at generation time.
 */
interface EventDefinition {
  type: SeasonEventType;
  name: string;
  startWeek: number;
  endWeek: number;
  description: string;
}

/**
 * The canonical set of season events in week order.
 * Every entry maps to exactly one SeasonEvent per season.
 */
const EVENT_DEFINITIONS: readonly EventDefinition[] = [
  {
    type: "preSeasonTournament",
    name: "Pre-season Tournament",
    startWeek: 1,
    endWeek: 2,
    description: "Pre-season preparations and friendly tournaments",
  },
  {
    type: "summerTransferWindow",
    name: "Summer Transfer Window",
    startWeek: 1,
    endWeek: 8,
    description: "Summer transfer window is open",
  },
  {
    type: "internationalBreak",
    name: "International Break 1",
    startWeek: 10,
    endWeek: 10,
    description: "First international break of the season",
  },
  {
    type: "internationalBreak",
    name: "International Break 2",
    startWeek: 18,
    endWeek: 18,
    description: "Second international break",
  },
  {
    type: "winterTransferWindow",
    name: "Winter Transfer Window",
    startWeek: 20,
    endWeek: 23,
    description: "January transfer window is open",
  },
  {
    type: "internationalBreak",
    name: "International Break 3",
    startWeek: 28,
    endWeek: 28,
    description: "Third international break",
  },
  {
    type: "youthCup",
    name: "Youth Cup",
    startWeek: 30,
    endWeek: 33,
    description: "Youth cup tournament in progress",
  },
  {
    type: "endOfSeasonReview",
    name: "End-of-Season Review",
    startWeek: 38,
    endWeek: 38,
    description: "Season review and contract renewals",
  },
] as const;

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Generate the full list of pre-defined season events for a given season year.
 *
 * Each event receives a deterministic unique ID in the form
 * `se_<season>_<type>_<startWeek>`. Because multiple international breaks
 * share the same `type` value, the `startWeek` ensures uniqueness within a
 * season.
 *
 * @param season - The season year, e.g. 2024.
 * @returns An ordered array of SeasonEvent objects, sorted by startWeek.
 */
export function generateSeasonEvents(season: number): SeasonEvent[] {
  return EVENT_DEFINITIONS.map((def): SeasonEvent => ({
    id: `se_${season}_${def.type}_${def.startWeek}`,
    type: def.type,
    name: def.name,
    startWeek: def.startWeek,
    endWeek: def.endWeek,
    description: def.description,
  }));
}

/**
 * Return every event from `events` that is currently active, i.e. where
 * `startWeek <= currentWeek <= endWeek`.
 *
 * @param events     - The full season event list (from generateSeasonEvents).
 * @param currentWeek - The week to test against.
 * @returns A (possibly empty) array of active SeasonEvent objects.
 */
export function getActiveSeasonEvents(
  events: SeasonEvent[],
  currentWeek: number,
): SeasonEvent[] {
  return events.filter(
    (event) => event.startWeek <= currentWeek && currentWeek <= event.endWeek,
  );
}

/**
 * Return every event that starts within the next `lookahead` weeks (exclusive
 * of the current week itself, i.e. `currentWeek < startWeek <= currentWeek + lookahead`).
 *
 * @param events      - The full season event list.
 * @param currentWeek - The reference week.
 * @param lookahead   - Number of weeks to look ahead.
 * @returns Events ordered by startWeek ascending.
 */
export function getUpcomingSeasonEvents(
  events: SeasonEvent[],
  currentWeek: number,
  lookahead: number,
): SeasonEvent[] {
  return events.filter(
    (event) =>
      event.startWeek > currentWeek &&
      event.startWeek <= currentWeek + lookahead,
  );
}

/**
 * Return true if any event with type `"internationalBreak"` is active during
 * `currentWeek`.
 *
 * @param events      - The full season event list.
 * @param currentWeek - The week to test.
 */
export function isInternationalBreak(
  events: SeasonEvent[],
  currentWeek: number,
): boolean {
  return events.some(
    (event) =>
      event.type === "internationalBreak" &&
      event.startWeek <= currentWeek &&
      currentWeek <= event.endWeek,
  );
}

/**
 * Determine the broad phase of the season based on the current week.
 *
 * Phase boundaries:
 *  - Weeks  1– 4 → "preseason"
 *  - Weeks  5–15 → "earlyseason"
 *  - Weeks 16–28 → "midseason"
 *  - Weeks 29–36 → "lateseason"
 *  - Weeks 37–38 → "endseason"
 *
 * @param currentWeek - The week number, expected in [1, 38].
 */
export function getSeasonPhase(
  currentWeek: number,
): "preseason" | "earlyseason" | "midseason" | "lateseason" | "endseason" {
  if (currentWeek <= 4) {
    return "preseason";
  }
  if (currentWeek <= 15) {
    return "earlyseason";
  }
  if (currentWeek <= 28) {
    return "midseason";
  }
  if (currentWeek <= 36) {
    return "lateseason";
  }
  return "endseason";
}
