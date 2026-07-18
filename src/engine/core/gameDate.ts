import type { Fixture, GameDate } from "./types";
import { getFixtureSeason, isFixtureInSeason } from "../world/fixtures";

export type { GameDate } from "./types";
export type SeasonWeek = GameDate;

/**
 * Backward-compatible fallback for pure helpers that pre-date fixture-derived
 * calendars. Live game paths should pass a season length or fixture map.
 */
export const LEGACY_SEASON_LENGTH_WEEKS = 38;

/**
 * Precomputed fixture calendar for consumers that compare many dates against
 * the same immutable game-state fixture map.
 */
export interface GameCalendarIndex {
  readonly seasonLengths: ReadonlyMap<number, number>;
  readonly unscopedSeasonLength: number;
  readonly maxSeasonLength: number;
}

export function createGameCalendarIndex(
  fixtures: Record<string, Fixture>,
): GameCalendarIndex {
  const seasonLengths = new Map<number, number>();
  let unscopedSeasonLength = LEGACY_SEASON_LENGTH_WEEKS;
  let maxSeasonLength = LEGACY_SEASON_LENGTH_WEEKS;

  for (const fixture of Object.values(fixtures)) {
    const fixtureWeek = Math.max(LEGACY_SEASON_LENGTH_WEEKS, fixture.week);
    const fixtureSeason = getFixtureSeason(fixture);
    if (fixtureSeason === undefined) {
      unscopedSeasonLength = Math.max(unscopedSeasonLength, fixtureWeek);
    } else {
      seasonLengths.set(
        fixtureSeason,
        Math.max(seasonLengths.get(fixtureSeason) ?? LEGACY_SEASON_LENGTH_WEEKS, fixtureWeek),
      );
    }
    maxSeasonLength = Math.max(maxSeasonLength, fixtureWeek);
  }

  return { seasonLengths, unscopedSeasonLength, maxSeasonLength };
}

export function getSeasonLengthFromCalendar(
  calendar: GameCalendarIndex,
  season?: number,
): number {
  if (season === undefined) return calendar.maxSeasonLength;
  return Math.max(
    calendar.unscopedSeasonLength,
    calendar.seasonLengths.get(season) ?? LEGACY_SEASON_LENGTH_WEEKS,
  );
}

/** Return the authoritative fixture-derived length for a season. */
export function getSeasonLength(
  fixtures: Record<string, Fixture>,
  season?: number,
): number {
  let maxWeek = LEGACY_SEASON_LENGTH_WEEKS;
  for (const fixture of Object.values(fixtures)) {
    if (season !== undefined && !isFixtureInSeason(fixture, season)) continue;
    if (fixture.week > maxWeek) maxWeek = fixture.week;
  }
  return maxWeek;
}

/** True once the active fixture-derived final week has been reached. */
export function isGameSeasonComplete(
  fixtures: Record<string, Fixture>,
  current: SeasonWeek,
): boolean {
  return current.week >= getSeasonLength(fixtures, current.season);
}

function assertSeasonLength(seasonLength: number): void {
  if (!Number.isInteger(seasonLength) || seasonLength < 1) {
    throw new RangeError("seasonLength must be a positive integer");
  }
}

/** Normalize any integer week into the inclusive 1..seasonLength range. */
export function normalizeGameWeek(
  week: number,
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
): number {
  assertSeasonLength(seasonLength);
  if (!Number.isInteger(week)) {
    throw new RangeError("week must be an integer");
  }
  return ((week - 1) % seasonLength + seasonLength) % seasonLength + 1;
}

/** Add weeks using an explicit, stable season length. */
export function addGameWeeksWithSeasonLength(
  start: SeasonWeek,
  weeks: number,
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
): SeasonWeek {
  if (!Number.isInteger(weeks) || weeks < 0) {
    throw new RangeError("weeks must be a non-negative integer");
  }
  assertSeasonLength(seasonLength);
  const absoluteWeek = start.week - 1 + weeks;
  return {
    season: start.season + Math.floor(absoluteWeek / seasonLength),
    week: (absoluteWeek % seasonLength) + 1,
  };
}

/** Elapsed weeks between two dates on an explicit-length calendar. */
export function gameWeeksBetweenWithSeasonLength(
  start: SeasonWeek,
  end: SeasonWeek,
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
): number {
  assertSeasonLength(seasonLength);
  return (end.season - start.season) * seasonLength + (end.week - start.week);
}

/**
 * Elapsed game weeks across fixture-derived season boundaries.
 *
 * Unlike `gameWeeksBetweenWithSeasonLength`, this helper remains correct when
 * persisted seasons have different competition lengths. Live game-state paths
 * should prefer this overload and reserve the fixed-length helper for legacy
 * records that do not carry fixture context.
 */
export function gameWeeksBetween(
  fixtures: Record<string, Fixture>,
  start: SeasonWeek,
  end: SeasonWeek,
): number {
  if (start.season === end.season) return end.week - start.week;
  if (
    end.season < start.season
    || (end.season === start.season && end.week < start.week)
  ) {
    return -gameWeeksBetween(fixtures, end, start);
  }

  let elapsed = getSeasonLength(fixtures, start.season) - start.week;
  for (let season = start.season + 1; season < end.season; season++) {
    elapsed += getSeasonLength(fixtures, season);
  }
  return elapsed + end.week;
}

/**
 * Indexed form of gameWeeksBetween for batch projections. It preserves the
 * fixture-derived variable-season calendar without rescanning every fixture
 * once per report, case, contact, or decision.
 */
export function gameWeeksBetweenWithCalendar(
  calendar: GameCalendarIndex,
  start: SeasonWeek,
  end: SeasonWeek,
): number {
  if (start.season === end.season) return end.week - start.week;
  if (
    end.season < start.season
    || (end.season === start.season && end.week < start.week)
  ) {
    return -gameWeeksBetweenWithCalendar(calendar, end, start);
  }

  let elapsed = getSeasonLengthFromCalendar(calendar, start.season) - start.week;
  for (let season = start.season + 1; season < end.season; season++) {
    elapsed += getSeasonLengthFromCalendar(calendar, season);
  }
  return elapsed + end.week;
}

/** Add weeks without rescanning the fixture map for every crossed week. */
export function addGameWeeksWithCalendar(
  calendar: GameCalendarIndex,
  start: SeasonWeek,
  weeks: number,
): SeasonWeek {
  if (!Number.isInteger(weeks) || weeks < 0) {
    throw new RangeError("weeks must be a non-negative integer");
  }
  let season = start.season;
  let week = start.week;
  for (let elapsed = 0; elapsed < weeks; elapsed++) {
    week += 1;
    if (week > getSeasonLengthFromCalendar(calendar, season)) {
      season += 1;
      week = 1;
    }
  }
  return { season, week };
}

/** One-based number of career weeks played, beginning at season 1, week 1. */
export function getCareerElapsedWeeks(
  fixtures: Record<string, Fixture>,
  current: SeasonWeek,
): number {
  return Math.max(
    1,
    gameWeeksBetween(fixtures, { season: 1, week: 1 }, current) + 1,
  );
}

/** Compact player-facing age label for a persisted game date. */
export function formatRelativeGameDate(
  past: SeasonWeek,
  current: SeasonWeek,
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
): string {
  const weeksAgo = Math.max(
    0,
    gameWeeksBetweenWithSeasonLength(past, current, seasonLength),
  );
  if (weeksAgo === 0) return "This week";
  if (weeksAgo === 1) return "1 week ago";
  if (weeksAgo < 4) return `${weeksAgo} weeks ago`;
  return `Season ${past.season}, Week ${past.week}`;
}

/** True when current is the same game date as due or occurs later. */
export function isGameDateAtOrAfter(current: SeasonWeek, due: SeasonWeek): boolean {
  return current.season > due.season
    || (current.season === due.season && current.week >= due.week);
}

/** Inclusive final-week window for season-end offers and deadlines. */
export function getSeasonEndWindow(
  seasonLength: number,
  windowWeeks: number,
): { startWeek: number; endWeek: number } {
  assertSeasonLength(seasonLength);
  if (!Number.isInteger(windowWeeks) || windowWeeks < 1) {
    throw new RangeError("windowWeeks must be a positive integer");
  }
  return {
    startWeek: Math.max(1, seasonLength - windowWeeks + 1),
    endWeek: seasonLength,
  };
}

/** Add normalized calendar weeks across fixture-derived season boundaries. */
export function addGameWeeks(
  fixtures: Record<string, Fixture>,
  start: SeasonWeek,
  weeks: number,
): SeasonWeek {
  if (!Number.isInteger(weeks) || weeks < 0) {
    throw new RangeError("weeks must be a non-negative integer");
  }
  let season = start.season;
  let week = start.week;
  for (let elapsed = 0; elapsed < weeks; elapsed++) {
    week += 1;
    if (week > getSeasonLength(fixtures, season)) {
      season += 1;
      week = 1;
    }
  }
  return { season, week };
}
