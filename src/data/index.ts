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
  england: async () => ENGLAND_DATA,
  spain: async () => (await import("@/data/spain")).SPAIN_DATA,
  germany: async () => (await import("@/data/germany")).GERMANY_DATA,
  france: async () => (await import("@/data/france")).FRANCE_DATA,
  brazil: async () => (await import("@/data/brazil")).BRAZIL_DATA,
  argentina: async () => (await import("@/data/argentina")).ARGENTINA_DATA,
};

/** Synchronous registry for countries that are always available. */
const SYNC_REGISTRY: Record<string, CountryData> = {
  england: ENGLAND_DATA,
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
 * Get all available country keys.
 */
export function getAvailableCountries(): string[] {
  return Object.keys(COUNTRY_LOADERS);
}

/**
 * Get display info for all available countries (for the new game UI).
 */
export function getCountryOptions(): { key: string; name: string; leagueCount: number; clubCount: number }[] {
  // For countries not yet loaded, provide static metadata
  const metadata: Record<string, { name: string; leagueCount: number; clubCount: number }> = {
    england:   { name: "England",   leagueCount: 4, clubCount: 92 },
    spain:     { name: "Spain",     leagueCount: 2, clubCount: 42 },
    germany:   { name: "Germany",   leagueCount: 2, clubCount: 36 },
    france:    { name: "France",    leagueCount: 2, clubCount: 40 },
    brazil:    { name: "Brazil",    leagueCount: 2, clubCount: 40 },
    argentina: { name: "Argentina", leagueCount: 2, clubCount: 44 },
  };

  return Object.keys(COUNTRY_LOADERS).map((key) => ({
    key,
    ...metadata[key] ?? { name: key, leagueCount: 0, clubCount: 0 },
  }));
}
