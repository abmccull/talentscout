import type { Fixture, PlayerMatchRating } from "@/engine/core/types";
import { isFixtureInSeason } from "@/engine/world/fixtures";

export interface CanonicalAppearance {
  fixture: Fixture;
  rating: PlayerMatchRating;
}

export interface CanonicalPlayerPerformance {
  appearances: number;
  starts: number;
  minutesPlayed?: number;
  appearancesWithoutMinutes: number;
  averageRating: number;
  goals: number;
  assists: number;
  cleanSheets: number;
}

type Fixtures = Record<string, Fixture>;
type Ratings = Record<string, Record<string, PlayerMatchRating>>;
const CACHE = new WeakMap<Ratings, WeakMap<Fixtures, Map<number, ReadonlyMap<string, readonly CanonicalAppearance[]>>>>();

/** Explicit minutes own participation; legacy explicit starts remain evidence. */
export function hasCanonicalParticipation(rating: PlayerMatchRating): boolean {
  return rating.minutesPlayed !== undefined
    ? Number.isFinite(rating.minutesPlayed) && rating.minutesPlayed > 0
    : rating.started === true;
}

/** One immutable fixture/player fact per appearance, independent of final roster. */
export function collectCanonicalAppearances(
  fixtures: Fixtures,
  matchRatings: Ratings,
  season: number,
): ReadonlyMap<string, readonly CanonicalAppearance[]> {
  let byFixtures = CACHE.get(matchRatings);
  if (!byFixtures) { byFixtures = new WeakMap(); CACHE.set(matchRatings, byFixtures); }
  let bySeason = byFixtures.get(fixtures);
  if (!bySeason) { bySeason = new Map(); byFixtures.set(fixtures, bySeason); }
  const cached = bySeason.get(season);
  if (cached) return cached;
  const appearances = new Map<string, CanonicalAppearance[]>();
  for (const fixtureId of Object.keys(matchRatings).sort()) {
    const fixture = fixtures[fixtureId];
    if (!fixture?.played || !isFixtureInSeason(fixture, season)) continue;
    for (const [playerId, rating] of Object.entries(matchRatings[fixtureId] ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
      if (rating.playerId !== playerId || rating.fixtureId !== fixtureId
        || !Number.isFinite(rating.rating) || !hasCanonicalParticipation(rating)) continue;
      const rows = appearances.get(playerId) ?? [];
      rows.push({ fixture, rating });
      appearances.set(playerId, rows);
    }
  }
  bySeason.set(season, appearances);
  return appearances;
}

function count(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value ?? 0)) : 0;
}

export function summarizeCanonicalAppearances(
  appearances: readonly CanonicalAppearance[] | undefined,
): CanonicalPlayerPerformance | undefined {
  if (!appearances?.length) return undefined;
  let starts = 0, minutesPlayed = 0, appearancesWithoutMinutes = 0;
  let ratingTotal = 0, goals = 0, assists = 0, cleanSheets = 0;
  for (const { rating } of appearances) {
    if (rating.started === true) starts += 1;
    if (rating.minutesPlayed !== undefined) minutesPlayed += rating.minutesPlayed;
    else appearancesWithoutMinutes += 1;
    ratingTotal += rating.rating;
    goals += count(rating.stats.goals);
    assists += count(rating.stats.assists);
    if (rating.stats.cleanSheet === true) cleanSheets += 1;
  }
  return { appearances: appearances.length, starts,
    ...(appearancesWithoutMinutes === 0 ? { minutesPlayed } : {}),
    appearancesWithoutMinutes, averageRating: Math.round(ratingTotal / appearances.length * 10) / 10,
    goals, assists, cleanSheets };
}
