/**
 * Shared data interfaces for country/league/club static data.
 *
 * All country data files (england.ts, spain.ts, etc.) export data conforming
 * to these interfaces. The world initializer uses getCountryData() to resolve
 * country data by key.
 */

import type { ScoutingPhilosophy } from "@/engine/core/types";

// ---------------------------------------------------------------------------
// Static data interfaces
// ---------------------------------------------------------------------------

export interface ClubData {
  id: string;
  name: string;
  shortName: string;
  reputation: number;
  scoutingPhilosophy: ScoutingPhilosophy;
  youthAcademyRating: number; // 1–20
  budget: number;             // Transfer budget £
}

export interface LeagueData {
  id: string;
  name: string;
  shortName: string;
  tier: number;
  clubs: ClubData[];
}

export interface NamePool {
  firstNames: string[];
  lastNames: string[];
}

/**
 * Nationality weight entry for player generation.
 * Controls the distribution of player nationalities per league tier.
 */
export interface NationalityWeight {
  nationality: string;
  weight: number;
}

/**
 * Complete data package for a country's football system.
 * Each country data file (england.ts, spain.ts, etc.) exports one of these.
 */
export interface CountryData {
  /** Lowercase key used in selectedCountries, e.g. "england", "spain". */
  key: string;
  /** Display name, e.g. "England", "Spain". */
  name: string;
  /** All leagues in this country's pyramid. */
  leagues: LeagueData[];
  /** Native name pool for player generation. */
  nativeNamePool: NamePool;
  /** Foreign name pools available in this country's leagues. */
  foreignNamePools: Record<string, NamePool>;
  /** Nationality distribution per league tier. */
  nationalitiesByTier: Record<number, NationalityWeight[]>;
  /**
   * Secondary countries generate clubs and players but do NOT simulate
   * fixtures or offer career positions. Undefined/false = core country.
   */
  secondary?: boolean;
}
