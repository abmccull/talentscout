/**
 * Synchronous country-data cache shared by world setup and persistence repair.
 *
 * This deliberately has no dependency on the top-level data barrel or mod
 * loader. Save migrations need to resolve country names when rebuilding legacy
 * regional data; importing the barrel there would create a persistence cycle
 * through the mod loader.
 */

import type { CountryData } from "@/data/types";
import { ENGLAND_DATA } from "@/data/england";

/** England is always bundled; other countries register when loaded. */
const syncRegistry: Record<string, CountryData> = {
  england: ENGLAND_DATA,
};

/** Return country data only when it has already been loaded into memory. */
export function getCountryDataSync(key: string): CountryData | undefined {
  return syncRegistry[key];
}

/** Register built-in or modded country data for later synchronous consumers. */
export function registerCountryData(key: string, country: CountryData): void {
  syncRegistry[key] = country;
}
