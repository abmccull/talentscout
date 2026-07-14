/**
 * Mod data loader — import/export/manage custom country data.
 *
 * Uses IndexedDB (via Dexie) to store modded country data blobs.
 * Falls back to built-in data when no mod is loaded.
 */

import { db, type ModRecord } from "@/lib/db";
import type { CountryData } from "@/data/types";

const MAX_MOD_FILE_BYTES = 10 * 1024 * 1024;
const MAX_COUNTRIES_PER_IMPORT = 64;
const MAX_LEAGUES_PER_COUNTRY = 24;
const MAX_CLUBS_PER_LEAGUE = 64;
const MAX_NAMES_PER_POOL = 10_000;
const SAFE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const SCOUTING_PHILOSOPHIES = new Set([
  "academyFirst",
  "winNow",
  "marketSmart",
  "globalRecruiter",
]);

// ---------------------------------------------------------------------------
// In-memory cache (populated from IndexedDB on first access)
// ---------------------------------------------------------------------------

let cacheLoaded = false;
const modCache: Map<string, CountryData> = new Map();

async function ensureCache(): Promise<void> {
  if (cacheLoaded) return;
  const records = await db.mods.toArray();
  for (const record of records) {
    modCache.set(record.countryKey, record.data);
  }
  cacheLoaded = true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns the modded country data for the given key, or undefined if no mod
 * is loaded for that country.
 */
export async function getModdedCountryData(
  key: string,
): Promise<CountryData | undefined> {
  await ensureCache();
  return modCache.get(key);
}

/**
 * Export all built-in country data as a single downloadable JSON blob.
 */
export async function exportGameData(
  getCountryData: (key: string) => Promise<CountryData>,
  availableKeys: string[],
): Promise<void> {
  const allData: Record<string, CountryData> = {};
  for (const key of availableKeys) {
    allData[key] = await getCountryData(key);
  }

  const blob = new Blob([JSON.stringify(allData, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "talentscout-data.json";
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Validate that a parsed object looks like a valid country data entry.
 */
function isBoundedString(value: unknown, maxLength = 120): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isFiniteNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function validateNamePool(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const pool = value as Record<string, unknown>;
  return [pool.firstNames, pool.lastNames].every((names) =>
    Array.isArray(names)
    && names.length > 0
    && names.length <= MAX_NAMES_PER_POOL
    && names.every((name) => isBoundedString(name, 80)),
  );
}

function validateClub(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const club = value as Record<string, unknown>;
  return (
    isBoundedString(club.id, 64)
    && SAFE_ID_PATTERN.test(club.id)
    && isBoundedString(club.name)
    && isBoundedString(club.shortName, 12)
    && isFiniteNumberInRange(club.reputation, 1, 100)
    && SCOUTING_PHILOSOPHIES.has(String(club.scoutingPhilosophy))
    && isFiniteNumberInRange(club.youthAcademyRating, 1, 20)
    && isFiniteNumberInRange(club.budget, 0, 10_000_000_000)
  );
}

function validateLeague(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const league = value as Record<string, unknown>;
  if (
    !isBoundedString(league.id, 64)
    || !SAFE_ID_PATTERN.test(league.id)
    || !isBoundedString(league.name)
    || !isBoundedString(league.shortName, 20)
    || typeof league.tier !== "number"
    || !Number.isInteger(league.tier)
    || !isFiniteNumberInRange(league.tier, 1, 20)
    || !Array.isArray(league.clubs)
    || league.clubs.length === 0
    || league.clubs.length > MAX_CLUBS_PER_LEAGUE
  ) {
    return false;
  }
  const clubIds = new Set<string>();
  return league.clubs.every((club) => {
    if (!validateClub(club)) return false;
    const clubId = (club as { id: string }).id;
    if (clubIds.has(clubId)) return false;
    clubIds.add(clubId);
    return true;
  });
}

function validateNationalityTiers(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const tiers = Object.entries(value as Record<string, unknown>);
  return tiers.length > 0 && tiers.every(([tier, weights]) => {
    const tierNumber = Number(tier);
    return Number.isInteger(tierNumber)
      && tierNumber >= 1
      && tierNumber <= 20
      && Array.isArray(weights)
      && weights.length > 0
      && weights.length <= 128
      && weights.every((entry) => {
        if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return false;
        const weight = entry as Record<string, unknown>;
        return isBoundedString(weight.nationality, 80)
          && isFiniteNumberInRange(weight.weight, 0.000_001, 1_000_000);
      });
  });
}

export function validateCountryData(
  obj: unknown,
  expectedKey?: string,
): obj is CountryData {
  if (typeof obj !== "object" || obj === null) return false;
  const d = obj as Record<string, unknown>;
  if (
    !isBoundedString(d.key, 64)
    || !SAFE_ID_PATTERN.test(d.key)
    || (expectedKey !== undefined && d.key !== expectedKey)
    || !isBoundedString(d.name)
    || !Array.isArray(d.leagues)
    || d.leagues.length === 0
    || d.leagues.length > MAX_LEAGUES_PER_COUNTRY
    || !validateNamePool(d.nativeNamePool)
    || typeof d.foreignNamePools !== "object"
    || d.foreignNamePools === null
    || Array.isArray(d.foreignNamePools)
    || !validateNationalityTiers(d.nationalitiesByTier)
    || (d.secondary !== undefined && typeof d.secondary !== "boolean")
  ) {
    return false;
  }

  const leagueIds = new Set<string>();
  const clubIds = new Set<string>();
  for (const league of d.leagues) {
    if (!validateLeague(league)) return false;
    const typedLeague = league as { id: string; clubs: Array<{ id: string }> };
    if (leagueIds.has(typedLeague.id)) return false;
    leagueIds.add(typedLeague.id);
    for (const club of typedLeague.clubs) {
      if (clubIds.has(club.id)) return false;
      clubIds.add(club.id);
    }
  }

  const foreignPools = Object.entries(d.foreignNamePools as Record<string, unknown>);
  return foreignPools.length <= 128 && foreignPools.every(([key, pool]) =>
    isBoundedString(key, 80) && validateNamePool(pool),
  );
}

/**
 * Import custom data from a JSON file. Returns the list of country keys
 * that were successfully imported.
 */
export async function importGameData(
  file: File,
): Promise<{ imported: string[]; errors: string[] }> {
  if (file.size > MAX_MOD_FILE_BYTES) {
    return {
      imported: [],
      errors: [`File is larger than the ${MAX_MOD_FILE_BYTES / (1024 * 1024)} MB import limit`],
    };
  }
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { imported: [], errors: ["Unable to read the selected file"] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { imported: [], errors: ["Invalid JSON file"] };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      imported: [],
      errors: ["Expected a JSON object with country keys"],
    };
  }

  const dataMap = parsed as Record<string, unknown>;
  const entries = Object.entries(dataMap);
  if (entries.length === 0 || entries.length > MAX_COUNTRIES_PER_IMPORT) {
    return {
      imported: [],
      errors: [`Import must contain between 1 and ${MAX_COUNTRIES_PER_IMPORT} countries`],
    };
  }
  const imported: string[] = [];
  const errors: string[] = [];

  for (const [key, value] of entries) {
    if (!SAFE_ID_PATTERN.test(key) || !validateCountryData(value, key)) {
      errors.push(`Invalid data for country "${key}"`);
      continue;
    }

    const record: ModRecord = {
      countryKey: key,
      data: value,
      importedAt: Date.now(),
    };

    try {
      await db.mods.put(record);
      modCache.set(key, value);
      imported.push(key);
    } catch {
      errors.push(`Could not store country "${key}"`);
    }
  }

  return { imported, errors };
}

/**
 * Reset all modded data — clears IndexedDB and in-memory cache.
 */
export async function resetModData(): Promise<void> {
  await db.mods.clear();
  modCache.clear();
}

/**
 * Get the list of currently modded country keys.
 */
export async function getModdedKeys(): Promise<string[]> {
  await ensureCache();
  return Array.from(modCache.keys());
}
