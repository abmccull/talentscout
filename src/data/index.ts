/**
 * Country data barrel export and resolver.
 *
 * All country data modules are registered here. The world initializer
 * calls getCountryData() to resolve data by country key.
 */

import type { CountryData } from "@/data/types";
import { ENGLAND_DATA } from "@/data/england";

export type { ClubData, LeagueData, CountryData, NamePool, NationalityWeight } from "@/data/types";

// ---------------------------------------------------------------------------
// Country registry
// ---------------------------------------------------------------------------

/** Lazy import wrappers — country data files are large, so we load on demand. */
const COUNTRY_LOADERS: Record<string, () => Promise<CountryData>> = {
  // Core countries (full fixture simulation + career destinations)
  england: async () => ENGLAND_DATA,
  spain: async () => (await import("@/data/spain")).SPAIN_DATA,
  germany: async () => (await import("@/data/germany")).GERMANY_DATA,
  france: async () => (await import("@/data/france")).FRANCE_DATA,
  brazil: async () => (await import("@/data/brazil")).BRAZIL_DATA,
  argentina: async () => (await import("@/data/argentina")).ARGENTINA_DATA,
  // Secondary countries (talent pools — no fixtures, no career positions)
  usa: async () => (await import("@/data/usa")).USA_DATA,
  mexico: async () => (await import("@/data/mexico")).MEXICO_DATA,
  canada: async () => (await import("@/data/canada")).CANADA_DATA,
  nigeria: async () => (await import("@/data/nigeria")).NIGERIA_DATA,
  ghana: async () => (await import("@/data/ghana")).GHANA_DATA,
  ivorycoast: async () => (await import("@/data/ivory-coast")).IVORY_COAST_DATA,
  egypt: async () => (await import("@/data/egypt")).EGYPT_DATA,
  southafrica: async () => (await import("@/data/south-africa")).SOUTH_AFRICA_DATA,
  senegal: async () => (await import("@/data/senegal")).SENEGAL_DATA,
  cameroon: async () => (await import("@/data/cameroon")).CAMEROON_DATA,
  japan: async () => (await import("@/data/japan")).JAPAN_DATA,
  southkorea: async () => (await import("@/data/south-korea")).SOUTH_KOREA_DATA,
  saudiarabia: async () => (await import("@/data/saudi-arabia")).SAUDI_ARABIA_DATA,
  china: async () => (await import("@/data/china")).CHINA_DATA,
  australia: async () => (await import("@/data/australia")).AUSTRALIA_DATA,
  newzealand: async () => (await import("@/data/new-zealand")).NEW_ZEALAND_DATA,
};

/** Synchronous registry for countries that are always available. */
const SYNC_REGISTRY: Record<string, CountryData> = {
  england: ENGLAND_DATA,
};

// ---------------------------------------------------------------------------
// Secondary country metadata
// ---------------------------------------------------------------------------

/** All 16 secondary country keys. */
const SECONDARY_COUNTRY_KEYS: string[] = [
  "usa", "mexico", "canada",
  "nigeria", "ghana", "ivorycoast", "egypt", "southafrica", "senegal", "cameroon",
  "japan", "southkorea", "saudiarabia", "china",
  "australia", "newzealand",
];

/** Static metadata for secondary countries (avoids loading data just for UI). */
const SECONDARY_METADATA: Record<string, { name: string; region: string; clubCount: number }> = {
  usa:         { name: "USA",          region: "North America", clubCount: 16 },
  mexico:      { name: "Mexico",       region: "North America", clubCount: 18 },
  canada:      { name: "Canada",       region: "North America", clubCount: 8 },
  nigeria:     { name: "Nigeria",      region: "Africa",        clubCount: 12 },
  ghana:       { name: "Ghana",        region: "Africa",        clubCount: 10 },
  ivorycoast:  { name: "Ivory Coast",  region: "Africa",        clubCount: 10 },
  egypt:       { name: "Egypt",        region: "Africa",        clubCount: 12 },
  southafrica: { name: "South Africa", region: "Africa",        clubCount: 12 },
  senegal:     { name: "Senegal",      region: "Africa",        clubCount: 10 },
  cameroon:    { name: "Cameroon",     region: "Africa",        clubCount: 10 },
  japan:       { name: "Japan",        region: "Asia",          clubCount: 14 },
  southkorea:  { name: "South Korea",  region: "Asia",          clubCount: 12 },
  saudiarabia: { name: "Saudi Arabia", region: "Asia",          clubCount: 14 },
  china:       { name: "China",        region: "Asia",          clubCount: 12 },
  australia:   { name: "Australia",    region: "Oceania",       clubCount: 12 },
  newzealand:  { name: "New Zealand",  region: "Oceania",       clubCount: 8 },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get country data synchronously. Returns undefined if the country
 * hasn't been synchronously loaded yet. England is always available.
 */
export function getCountryDataSync(key: string): CountryData | undefined {
  return SYNC_REGISTRY[key];
}

/**
 * Load and cache country data. Returns the CountryData for the given key.
 * Throws if the country key is not registered.
 */
export async function getCountryData(key: string): Promise<CountryData> {
  if (SYNC_REGISTRY[key]) return SYNC_REGISTRY[key];

  const loader = COUNTRY_LOADERS[key];
  if (!loader) {
    throw new Error(`Unknown country key: "${key}". Available: ${Object.keys(COUNTRY_LOADERS).join(", ")}`);
  }

  const data = await loader();
  SYNC_REGISTRY[key] = data; // Cache for future sync access
  return data;
}

/**
 * Load multiple countries in parallel. Returns them in the same order
 * as the input keys array.
 */
export async function loadCountries(keys: string[]): Promise<CountryData[]> {
  return Promise.all(keys.map(getCountryData));
}

/**
 * Get all available country keys (core + secondary).
 */
export function getAvailableCountries(): string[] {
  return Object.keys(COUNTRY_LOADERS);
}

/**
 * Get the 16 secondary country keys (talent pools without fixtures).
 */
export function getSecondaryCountries(): string[] {
  return [...SECONDARY_COUNTRY_KEYS];
}

/**
 * Get display info for secondary countries, grouped by region.
 */
export function getSecondaryCountryOptions(): { key: string; name: string; region: string; clubCount: number }[] {
  return SECONDARY_COUNTRY_KEYS.map((key) => ({
    key,
    ...SECONDARY_METADATA[key],
  }));
}

/**
 * Get display info for core countries (for the new game UI country selection).
 */
export function getCountryOptions(): { key: string; name: string; leagueCount: number; clubCount: number }[] {
  const metadata: Record<string, { name: string; leagueCount: number; clubCount: number }> = {
    england:   { name: "England",   leagueCount: 4, clubCount: 92 },
    spain:     { name: "Spain",     leagueCount: 2, clubCount: 42 },
    germany:   { name: "Germany",   leagueCount: 2, clubCount: 36 },
    france:    { name: "France",    leagueCount: 2, clubCount: 40 },
    brazil:    { name: "Brazil",    leagueCount: 2, clubCount: 40 },
    argentina: { name: "Argentina", leagueCount: 2, clubCount: 44 },
  };

  // Only return core countries (not secondary)
  const coreKeys = ["england", "spain", "germany", "france", "brazil", "argentina"];
  return coreKeys.map((key) => ({
    key,
    ...metadata[key] ?? { name: key, leagueCount: 0, clubCount: 0 },
  }));
}
