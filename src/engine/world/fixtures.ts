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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UnscheduledFixture {
  homeId: string;
  awayId: string;
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

/**
 * English football season runs August → May.
 * Week 1 = late July/August; Week 38 = May.
 * Map week → rough calendar month, then pick weather accordingly.
 */
function seasonWeekToMonth(week: number, totalWeeks: number): number {
  // Week 1 → month 8 (August), Week totalWeeks → month 5 (May)
  // Map [1, totalWeeks] → [8, 17] (17 = May next year), then mod 12
  if (totalWeeks <= 1) return 8; // single-week season defaults to August
  const month = Math.round(8 + ((week - 1) / (totalWeeks - 1)) * 9);
  // Normalise to 1-12
  return ((month - 1) % 12) + 1;
}

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
// Date generation
// ---------------------------------------------------------------------------

/** Season 1 kicks off on 2024-08-10 (a Saturday). */
const SEASON_KICKOFF_YEAR = 2024;
const SEASON_KICKOFF_MONTH = 8;
const SEASON_KICKOFF_DAY = 10;

function weekToDate(week: number, season: number): string {
  // Each week is 7 days apart. Season 1 starts at kickoff, season 2 a year later, etc.
  const yearOffset = season - 1;
  const kickoff = new Date(
    SEASON_KICKOFF_YEAR + yearOffset,
    SEASON_KICKOFF_MONTH - 1, // JS months are 0-indexed
    SEASON_KICKOFF_DAY,
  );
  const matchDate = new Date(kickoff);
  matchDate.setDate(kickoff.getDate() + (week - 1) * 7);
  return matchDate.toISOString().slice(0, 10);
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
  const totalWeeks = rounds.length; // will be (n-1)*2

  const fixtures: Fixture[] = [];

  rounds.forEach((roundFixtures, roundIndex) => {
    const week = roundIndex + 1;
    const month = seasonWeekToMonth(week, totalWeeks);

    roundFixtures.forEach((f) => {
      const weather = weatherForMonth(rng, month);
      const fixtureId = nextFixtureId(league.id, season, week);

      fixtures.push({
        id: fixtureId,
        leagueId: league.id,
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
