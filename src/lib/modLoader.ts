/**
 * Mod data loader — import/export/manage custom country data.
 *
 * Uses IndexedDB (via Dexie) to store modded country data blobs.
 * Falls back to built-in data when no mod is loaded.
 */

import { db, type ModRecord } from "@/lib/db";
import type { CountryData } from "@/data/types";

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
function validateCountryData(obj: unknown): obj is CountryData {
  if (typeof obj !== "object" || obj === null) return false;
  const d = obj as Record<string, unknown>;
  return (
    typeof d.key === "string" &&
    typeof d.name === "string" &&
    Array.isArray(d.leagues) &&
    typeof d.nativeNamePool === "object" &&
    d.nativeNamePool !== null
  );
}

/**
 * Import custom data from a JSON file. Returns the list of country keys
 * that were successfully imported.
 */
export async function importGameData(
  file: File,
): Promise<{ imported: string[]; errors: string[] }> {
  const text = await file.text();
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
  const imported: string[] = [];
  const errors: string[] = [];

  for (const [key, value] of Object.entries(dataMap)) {
    if (!validateCountryData(value)) {
      errors.push(`Invalid data for country "${key}"`);
      continue;
    }

    const record: ModRecord = {
      countryKey: key,
      data: value,
      importedAt: Date.now(),
    };

    await db.mods.put(record);
    modCache.set(key, value);
    imported.push(key);
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
