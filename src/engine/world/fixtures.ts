/**
 * Fixture generation for a full league season.
 *
 * Uses a circle/round-robin algorithm to schedule home and away fixtures
 * such that:
 *   - Every team plays every other team once at home and once away.
 *   - No team plays twice in the same week.
 *   - Fixtures are spread evenly across the season's match weeks.
 *   - Weather is assigned realistically based on the week of the season.
 */

import type { RNG } from '@/engine/rng';
import type { League, Fixture, Weather } from '@/engine/core/types';
import { getSeasonWeekDate } from '@/engine/core/seasonDate';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UnscheduledFixture {
  homeId: string;
  awayId: string;
}

/** Season marker embedded in fixture IDs generated before Fixture.season existed. */
const LEGACY_FIXTURE_SEASON_PATTERN = /(?:^|-)s(\d+)(?:-|$)/i;

/**
 * Resolve a fixture's persisted season, falling back to the season embedded
 * in legacy generated IDs. Truly unscoped fixtures return undefined.
 */
export function getFixtureSeason(fixture: Fixture): number | undefined {
  if (Number.isInteger(fixture.season) && (fixture.season ?? 0) > 0) {
    return fixture.season;
  }

  const match = fixture.id.match(LEGACY_FIXTURE_SEASON_PATTERN);
  if (!match) return undefined;

  const parsed = Number.parseInt(match[1], 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * Legacy fixtures with no season marker are treated as belonging to the
 * caller's active season until they can be normalized and persisted.
 */
export function isFixtureInSeason(fixture: Fixture, season: number): boolean {
  const fixtureSeason = getFixtureSeason(fixture);
  return fixtureSeason === undefined || fixtureSeason === season;
}

/**
 * Pin legacy fixture records to a concrete season. This is deliberately
 * idempotent and never rewrites a valid explicit/ID-derived season.
 */
export function normalizeFixtureSeasons(
  fixtures: Record<string, Fixture>,
  legacyFallbackSeason: number,
): Record<string, Fixture> {
  let changed = false;
  const normalized: Record<string, Fixture> = {};

  for (const [id, fixture] of Object.entries(fixtures)) {
    const season = getFixtureSeason(fixture) ?? legacyFallbackSeason;
    if (fixture.season === season) {
      normalized[id] = fixture;
      continue;
    }
    changed = true;
    normalized[id] = { ...fixture, season };
  }

  return changed ? normalized : fixtures;
}

// ---------------------------------------------------------------------------
// Round-robin algorithm (circle method)
// ---------------------------------------------------------------------------

/**
 * Generate all (homeId, awayId) pairs for a single round-robin where every
 * team plays every other team exactly once.
 *
 * Uses Berger tables / the standard circle method:
 *   - Fix team[0] in position 0.
 *   - Rotate the remaining n-1 teams around to produce n-1 rounds.
 *   - In each round, pair teams opposite each other.
 *   - Alternate home/away based on round parity.
 *
 * If the number of clubs is odd, insert a "bye" dummy and drop fixtures
 * involving it.
 */
function buildSingleRoundRobin(clubIds: string[]): UnscheduledFixture[][] {
  const ids = clubIds.slice();
  const hasBye = ids.length % 2 !== 0;
  if (hasBye) {
    ids.push('__bye__');
  }

  const n = ids.length;
  const numRounds = n - 1;
  const matchesPerRound = n / 2;

  // Build rotation array: fixed[0] stays; rest rotate
  const fixed = ids[0];
  const rotating = ids.slice(1);

  const rounds: UnscheduledFixture[][] = [];

  for (let round = 0; round < numRounds; round++) {
    const roundFixtures: UnscheduledFixture[] = [];

    // Build the pairing for this round
    const circle: string[] = [fixed, ...rotating];

    for (let i = 0; i < matchesPerRound; i++) {
      const home = circle[i];
      const away = circle[n - 1 - i];

      // Skip byes
      if (home === '__bye__' || away === '__bye__') continue;

      // Alternate home/away direction each round to ensure balanced home games
      if (round % 2 === 0) {
        roundFixtures.push({ homeId: home, awayId: away });
      } else {
        roundFixtures.push({ homeId: away, awayId: home });
      }
    }

    rounds.push(roundFixtures);

    // Rotate: move last element of rotating to front
    const last = rotating.pop()!;
    rotating.unshift(last);
  }

  return rounds;
}

/**
 * Build both legs of a full double round-robin.
 * The second leg reverses home/away from the first.
 */
function buildDoubleRoundRobin(clubIds: string[]): UnscheduledFixture[][] {
  const firstLeg = buildSingleRoundRobin(clubIds);

  const secondLeg = firstLeg.map((round) =>
    round.map((f) => ({ homeId: f.awayId, awayId: f.homeId })),
  );

  return [...firstLeg, ...secondLeg];
}

// ---------------------------------------------------------------------------
// Weather assignment
// ---------------------------------------------------------------------------

const SUMMER_WEATHER: { item: Weather; weight: number }[] = [
  { item: 'clear', weight: 40 },
  { item: 'cloudy', weight: 30 },
  { item: 'rain', weight: 10 },
  { item: 'windy', weight: 5 },
];

const AUTUMN_WEATHER: { item: Weather; weight: number }[] = [
  { item: 'cloudy', weight: 30 },
  { item: 'rain', weight: 25 },
  { item: 'heavyRain', weight: 10 },
  { item: 'windy', weight: 10 },
  { item: 'clear', weight: 10 },
];

const WINTER_WEATHER: { item: Weather; weight: number }[] = [
  { item: 'cloudy', weight: 25 },
  { item: 'heavyRain', weight: 20 },
  { item: 'rain', weight: 20 },
  { item: 'windy', weight: 15 },
  { item: 'snow', weight: 10 },
  { item: 'clear', weight: 5 },
];

const SPRING_WEATHER: { item: Weather; weight: number }[] = [
  { item: 'cloudy', weight: 30 },
  { item: 'rain', weight: 20 },
  { item: 'clear', weight: 20 },
  { item: 'windy', weight: 10 },
];

function weatherForMonth(rng: RNG, month: number): Weather {
  // Summer: Jul-Aug (7,8), Spring: Mar-May (3,4,5), Autumn: Sep-Oct (9,10), Winter: Nov-Feb (11,12,1,2)
  if (month === 7 || month === 8) return rng.pickWeighted(SUMMER_WEATHER);
  if (month >= 3 && month <= 5) return rng.pickWeighted(SPRING_WEATHER);
  if (month === 9 || month === 10) return rng.pickWeighted(AUTUMN_WEATHER);
  return rng.pickWeighted(WINTER_WEATHER);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateSeasonFixtures(
  rng: RNG,
  league: League,
  season: number,
): Fixture[] {
  // Local counter — pure, no module-level state.
  let fixtureCounter = 0;
  const nextFixtureId = (leagueId: string, s: number, week: number): string => {
    fixtureCounter += 1;
    return `fixture-${leagueId}-s${s}-w${String(week).padStart(2, '0')}-${String(fixtureCounter).padStart(4, '0')}`;
  };

  const clubIds = league.clubIds;
  if (clubIds.length < 2) return [];

  // Number of match weeks depends on league size
  // PL: 20 clubs → 38 rounds; Championship/L1/L2: 24 clubs → 46 rounds
  const rounds = buildDoubleRoundRobin(clubIds);
  const fixtures: Fixture[] = [];

  rounds.forEach((roundFixtures, roundIndex) => {
    const week = roundIndex + 1;
    const month = Number(getSeasonWeekDate(week, season).slice(5, 7));

    roundFixtures.forEach((f) => {
      const weather = weatherForMonth(rng, month);
      const fixtureId = nextFixtureId(league.id, season, week);

      fixtures.push({
        id: fixtureId,
        leagueId: league.id,
        season,
        week,
        homeClubId: f.homeId,
        awayClubId: f.awayId,
        played: false,
        weather,
      });
    });
  });

  return fixtures;
}

/**
 * Ensure exactly one deterministic fixture schedule exists for every
 * requested league in a season.
 *
 * Existing records win, so replaying a rollover cannot erase results or
 * generate duplicates. Missing records from a partially written save are
 * restored from the deterministic schedule. Callers should pass only leagues
 * that simulate fixtures (secondary talent-pool leagues intentionally do not).
 */
export function ensureSeasonFixtures(
  rng: RNG,
  leagues: Record<string, League>,
  fixtures: Record<string, Fixture>,
  season: number,
  scheduledLeagueIds: Iterable<string> = Object.keys(leagues),
  legacyFallbackSeason: number = Math.max(1, season - 1),
): Record<string, Fixture> {
  const result = { ...normalizeFixtureSeasons(fixtures, legacyFallbackSeason) };
  const leagueIds = [...new Set(scheduledLeagueIds)]
    .filter((leagueId) => leagues[leagueId] !== undefined)
    .sort((a, b) => a.localeCompare(b));

  for (const leagueId of leagueIds) {
    const generated = generateSeasonFixtures(rng, leagues[leagueId], season);
    for (const fixture of generated) {
      if (!result[fixture.id]) {
        result[fixture.id] = fixture;
      }
    }
  }

  return result;
}
