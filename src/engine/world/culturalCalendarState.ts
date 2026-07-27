import type { GameState } from "@/engine/core/types";
import { getSeasonLength } from "@/engine/core/gameDate";
import { normalizeCountryKey } from "@/lib/country";
import type { CountrySeasonCalendar } from "./footballCultureCalendar";
import { createCountrySeasonCalendar } from "./footballCultureCalendar";

export const CULTURAL_CALENDAR_STATE_VERSION = 1 as const;
export const CULTURAL_CALENDAR_RETAINED_SEASONS = 2 as const;

export interface CulturalCalendarState {
  version: typeof CULTURAL_CALENDAR_STATE_VERSION;
  calendars: Record<string, CountrySeasonCalendar>;
}

type CulturalCalendarStateInput = Pick<
  GameState,
  "countries" | "currentSeason" | "fixtures" | "runManifest" | "worldConditionState"
> & {
  culturalCalendarState?: CulturalCalendarState;
};

function canonicalCountry(countryId: string): string {
  return normalizeCountryKey(countryId)
    ?? countryId.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function uniqueSortedCountries(countries: readonly string[]): string[] {
  return [...new Set(
    countries
      .map((countryId) => canonicalCountry(countryId))
      .filter((countryId) => countryId.length > 0),
  )].sort((left, right) => left.localeCompare(right));
}

function retainedSeasons(currentSeason: number): number[] {
  return [currentSeason - 1, currentSeason]
    .filter((season) => season >= 1)
    .sort((left, right) => left - right);
}

export function buildCulturalCalendarKey(countryId: string, season: number): string {
  return `${canonicalCountry(countryId)}:s${Math.max(1, Math.floor(season))}`;
}

export function listCulturalCalendarConditionDefinitionIds(
  state: Pick<GameState, "currentSeason" | "worldConditionState">,
  season = state.currentSeason,
  countryId?: string,
): string[] {
  const historyRecord = state.worldConditionState?.history.find((entry) => entry.season === season);
  const activeConditions = state.worldConditionState?.activeSeason === season
    ? state.worldConditionState.active
    : historyRecord?.conditions ?? [];
  const country = countryId ? canonicalCountry(countryId) : undefined;
  return [...new Set(activeConditions
    .filter((condition) =>
      condition.scope === "global"
      || !country
      || canonicalCountry(condition.countryId ?? "") === country,
    )
    .map((condition) => condition.definitionId)
    .filter((definitionId): definitionId is string => typeof definitionId === "string" && definitionId.length > 0),
  )].sort((left, right) => left.localeCompare(right));
}

function createCalendarForSeason(
  state: CulturalCalendarStateInput,
  countryId: string,
  season: number,
): CountrySeasonCalendar {
  return createCountrySeasonCalendar(countryId, season, {
    weeksPerSeason: getSeasonLength(state.fixtures, season),
    rootSeed: state.runManifest.rootSeed,
    activeWorldConditionIds: listCulturalCalendarConditionDefinitionIds(
      state,
      season,
      countryId,
    ),
  });
}

export function refreshCulturalCalendarState(
  state: CulturalCalendarStateInput,
): CulturalCalendarState {
  const countries = uniqueSortedCountries(state.countries);
  const seasons = retainedSeasons(state.currentSeason);
  const existingCalendars = state.culturalCalendarState?.calendars ?? {};
  const calendars: Record<string, CountrySeasonCalendar> = {};

  for (const season of seasons) {
    for (const countryId of countries) {
      const key = buildCulturalCalendarKey(countryId, season);
      calendars[key] = existingCalendars[key] ?? createCalendarForSeason(state, countryId, season);
    }
  }

  return {
    version: CULTURAL_CALENDAR_STATE_VERSION,
    calendars,
  };
}

export function migrateCulturalCalendarState(
  state: CulturalCalendarStateInput,
): CulturalCalendarState {
  return refreshCulturalCalendarState(state);
}

export function resolveStateCountrySeasonCalendar(
  state: CulturalCalendarStateInput,
  countryId: string | undefined,
  season = state.currentSeason,
): CountrySeasonCalendar | undefined {
  if (!countryId) return undefined;
  const canonical = canonicalCountry(countryId);
  const key = buildCulturalCalendarKey(canonical, season);
  return state.culturalCalendarState?.calendars[key]
    ?? (state.countries.some((entry) => canonicalCountry(entry) === canonical)
      ? createCalendarForSeason(state, canonical, season)
      : undefined);
}
