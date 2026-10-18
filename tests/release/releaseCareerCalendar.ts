import type { GameState, League } from "@/engine/core/types";
import type { CountryData } from "@/data/types";
import { ENGLAND_DATA } from "@/data/england";
import { USA_DATA } from "@/data/usa";
import { MEXICO_DATA } from "@/data/mexico";
import { CANADA_DATA } from "@/data/canada";
import { NIGERIA_DATA } from "@/data/nigeria";
import { GHANA_DATA } from "@/data/ghana";
import { IVORY_COAST_DATA } from "@/data/ivory-coast";
import { EGYPT_DATA } from "@/data/egypt";
import { SOUTH_AFRICA_DATA } from "@/data/south-africa";
import { SENEGAL_DATA } from "@/data/senegal";
import { CAMEROON_DATA } from "@/data/cameroon";
import { JAPAN_DATA } from "@/data/japan";
import { SOUTH_KOREA_DATA } from "@/data/south-korea";
import { SAUDI_ARABIA_DATA } from "@/data/saudi-arabia";
import { CHINA_DATA } from "@/data/china";
import { AUSTRALIA_DATA } from "@/data/australia";
import { NEW_ZEALAND_DATA } from "@/data/new-zealand";
import { createRNG } from "@/engine/rng";
import { generateSeasonFixtures } from "@/engine/world/fixtures";

/** Certification-only admission. Shipped gameplay retains its own calendar rules. */
export interface ReleaseCalendarAdmission {
  readonly kind: "fresh-builtin-england-v1";
  readonly leagueClubCounts: readonly number[];
  readonly weeksPerSeason: number;
  readonly maxCanonicalTicks: number;
}

const BUILTIN_COUNTRIES: CountryData[] = [
  ENGLAND_DATA, USA_DATA, MEXICO_DATA, CANADA_DATA, NIGERIA_DATA, GHANA_DATA,
  IVORY_COAST_DATA, EGYPT_DATA, SOUTH_AFRICA_DATA, SENEGAL_DATA, CAMEROON_DATA,
  JAPAN_DATA, SOUTH_KOREA_DATA, SAUDI_ARABIA_DATA, CHINA_DATA, AUSTRALIA_DATA,
  NEW_ZEALAND_DATA,
];

function requireCalendar(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error(`ERR_RELEASE_CALENDAR: ${reason}`);
}

function ordinaryRecord(value: unknown): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function roundCount(clubs: number): number {
  return clubs < 2 ? 0 : 2 * (clubs + clubs % 2 - 1);
}

interface LeagueAdmission {
  id: string;
  country: string;
  tier: number;
  clubIds: ReadonlySet<string>;
  coverage: "full" | "abstract";
}

interface FixtureProjection {
  leagueId: string;
  season: number;
  week: number;
  homeClubId: string;
  awayClubId: string;
}

export function admitReleaseCareerCalendar(initial: GameState, seasonCount: number) {
  requireCalendar(Number.isSafeInteger(seasonCount) && seasonCount > 0,
    "season count must be a positive safe integer");

  // Copy strings and memberships from canonical static data, never from later state.
  const leagues = new Map<string, LeagueAdmission>();
  const countries = new Map<string, Set<string>>();
  const allClubIds = new Set<string>();
  for (const country of BUILTIN_COUNTRIES) {
    const countryIds = new Set<string>();
    for (const league of country.leagues) {
      requireCalendar(!leagues.has(league.id), "duplicate built-in league");
      const ids = new Set(league.clubs.map((club) => club.id));
      requireCalendar(ids.size === league.clubs.length, "duplicate built-in club");
      for (const id of ids) {
        requireCalendar(!allClubIds.has(id), "duplicate built-in world membership");
        countryIds.add(id);
        allClubIds.add(id);
      }
      leagues.set(league.id, {
        id: league.id, country: country.name, tier: league.tier,
        clubIds: ids, coverage: country.secondary ? "abstract" : "full",
      });
    }
    countries.set(country.name, countryIds);
  }
  const englishLeagues = [...leagues.values()]
    .filter((league) => league.country === ENGLAND_DATA.name)
    .sort((left, right) => left.tier - right.tier);
  const leagueClubCounts = englishLeagues.map((league) => league.clubIds.size);
  requireCalendar(leagues.size === 20 && allClubIds.size === 282
    && leagueClubCounts.length === 4
    && leagueClubCounts.every((count, index) => count === [20, 24, 24, 24][index]),
  "built-in release topology differs");
  const weeksPerSeason = Math.max(38, ...englishLeagues.map((league) => roundCount(league.clubIds.size)));
  const maxCanonicalTicks = seasonCount * weeksPerSeason;
  requireCalendar(Number.isSafeInteger(maxCanonicalTicks)
    && Number.isSafeInteger(seasonCount + 1), "calendar ceiling exceeds safe integer range");
  const admission: ReleaseCalendarAdmission = Object.freeze({
    kind: "fresh-builtin-england-v1",
    leagueClubCounts: Object.freeze([...leagueClubCounts]),
    weeksPerSeason, maxCanonicalTicks,
  });

  // Only immutable structural projections are cached. Every live row is read each time.
  const schedules = new Map<number, Map<string, FixtureProjection>>();

  function assertState(state: GameState, ticks: number, fresh: boolean = false): void {
    requireCalendar(ordinaryRecord(state), "missing game state");
    requireCalendar(Number.isSafeInteger(state.currentSeason)
      && Number.isSafeInteger(state.currentWeek)
      && Number.isSafeInteger(state.totalWeeksPlayed), "date and counter must be safe integers");
    const season = Math.floor(ticks / weeksPerSeason) + 1;
    const week = ticks % weeksPerSeason + 1;
    requireCalendar(state.currentSeason === season && state.currentWeek === week
      && state.totalWeeksPlayed === ticks, "date or counter differs from completed canonical ticks");
    requireCalendar(ordinaryRecord(state.leagues) && ordinaryRecord(state.clubs)
      && ordinaryRecord(state.fixtures), "missing topology or fixture records");
    requireCalendar(Object.keys(state.leagues).length === leagues.size
      && Object.keys(state.clubs).length === allClubIds.size, "world topology cardinality changed");
    const membership = new Map<string, string>();
    const currentCountryIds = new Map<string, Set<string>>();
    for (const [id, expected] of leagues) {
      const league = state.leagues[id];
      requireCalendar(ordinaryRecord(league) && league.id === id
        && league.country === expected.country && league.tier === expected.tier
        && league.coverageTier === expected.coverage && league.season === season,
      `league identity or season changed: ${id}`);
      requireCalendar(Array.isArray(league.clubIds)
        && league.clubIds.length === expected.clubIds.size, `league cardinality changed: ${id}`);
      const countryIds = currentCountryIds.get(expected.country) ?? new Set<string>();
      currentCountryIds.set(expected.country, countryIds);
      for (const clubId of league.clubIds) {
        requireCalendar(typeof clubId === "string" && allClubIds.has(clubId)
          && !membership.has(clubId), "unknown or duplicate club membership");
        const club = state.clubs[clubId];
        requireCalendar(ordinaryRecord(club) && club.id === clubId && club.leagueId === id,
          "club record disagrees with league membership");
        if (fresh) requireCalendar(expected.clubIds.has(clubId), "fresh built-in membership changed");
        membership.set(clubId, id);
        countryIds.add(clubId);
      }
    }
    requireCalendar(membership.size === allClubIds.size, "unlisted club record");
    for (const [country, expected] of countries) {
      const actual = currentCountryIds.get(country);
      requireCalendar(actual?.size === expected.size
        && [...expected].every((id) => actual.has(id)), "country club identities changed");
    }
    for (const [id, club] of Object.entries(state.clubs)) {
      requireCalendar(allClubIds.has(id) && ordinaryRecord(club)
        && club.id === id && membership.get(id) === club.leagueId, "unknown or inconsistent club record");
    }

    let projected = schedules.get(season);
    if (!projected) {
      projected = new Map();
      const rng = createRNG(`release-calendar-structure-s${season}`);
      for (const admitted of englishLeagues) {
        const league: League = state.leagues[admitted.id];
        for (const fixture of generateSeasonFixtures(rng, league, season)) {
          projected.set(fixture.id, {
            leagueId: fixture.leagueId, season, week: fixture.week,
            homeClubId: fixture.homeClubId, awayClubId: fixture.awayClubId,
          });
        }
      }
      schedules.set(season, projected);
    }
    let currentFullRows = 0;
    for (const [id, fixture] of Object.entries(state.fixtures)) {
      requireCalendar(ordinaryRecord(fixture) && typeof fixture.id === "string"
        && fixture.id.length > 0 && fixture.id === id, "invalid fixture identity");
      requireCalendar(Number.isSafeInteger(fixture.season)
        && (fixture.season ?? 0) >= 1 && (fixture.season ?? 0) <= season
        && Number.isSafeInteger(fixture.week)
        && fixture.week >= 1 && fixture.week <= weeksPerSeason, "invalid explicit fixture date");
      const league = leagues.get(fixture.leagueId);
      requireCalendar(league, "unknown fixture league");
      requireCalendar(typeof fixture.homeClubId === "string"
        && typeof fixture.awayClubId === "string"
        && allClubIds.has(fixture.homeClubId) && allClubIds.has(fixture.awayClubId)
        && fixture.homeClubId !== fixture.awayClubId, "unknown or self-playing fixture participants");
      const countryIds = countries.get(league.country)!;
      requireCalendar(countryIds.has(fixture.homeClubId) && countryIds.has(fixture.awayClubId),
        "fixture participants cross country boundaries");
      if (league.coverage === "full") {
        requireCalendar(fixture.week <= roundCount(league.clubIds.size)
          && fixture.simulationDetail !== "abstract", "full-league fixture outside its rounds");
      } else {
        requireCalendar(fixture.simulationDetail === "abstract", "secondary fixture must be abstract");
      }
      // Promotion changes current Club.leagueId. Retained past rows keep past membership.
      if (fixture.season === season) {
        requireCalendar(membership.get(fixture.homeClubId) === fixture.leagueId
          && membership.get(fixture.awayClubId) === fixture.leagueId,
        "current fixture participants differ from league membership");
        if (league.coverage === "full") {
          const expected = projected.get(id);
          requireCalendar(expected && expected.leagueId === fixture.leagueId
            && expected.season === fixture.season && expected.week === fixture.week
            && expected.homeClubId === fixture.homeClubId && expected.awayClubId === fixture.awayClubId,
          "current fixture structure differs from canonical schedule");
          currentFullRows += 1;
        }
      }
    }
    requireCalendar(currentFullRows === projected.size, "current canonical schedule is incomplete");
  }

  function assertTicks(ticks: number, minimum: number, maximum: number): void {
    requireCalendar(Number.isSafeInteger(ticks) && ticks >= minimum && ticks <= maximum,
      "completed tick count outside method bounds");
  }

  assertState(initial, 0, true);
  return Object.freeze({
    admission,
    assertBeforeDrive(state: GameState, completedTicks: number): void {
      assertTicks(completedTicks, 0, maxCanonicalTicks - 1);
      assertState(state, completedTicks);
    },
    assertAfterDrive(state: GameState, completedTicks: number): void {
      assertTicks(completedTicks, 1, maxCanonicalTicks);
      assertState(state, completedTicks);
    },
    assertComplete(state: GameState, completedTicks: number): void {
      assertTicks(completedTicks, maxCanonicalTicks, maxCanonicalTicks);
      assertState(state, completedTicks);
    },
  });
}

