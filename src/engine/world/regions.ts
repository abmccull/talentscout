/**
 * Regional reputation system — pure functional module.
 *
 * Provides helpers for initialising and querying a scout's familiarity with
 * specific countries.  All functions are side-effect-free: they accept
 * immutable data and return new values without mutating inputs.
 *
 * Note on updateCountryReputation:
 *   Country reputation events are handled by updateCountryReputation in
 *   ./travel.ts, which is already exported from the world barrel (index.ts).
 *   This module does not re-implement that function; callers should import it
 *   from the world barrel directly.
 *
 * Note on home-country resolution:
 *   The canonical getScoutHomeCountry() lives in ./travel.ts.  This module
 *   imports it to avoid duplicating the same logic.
 *
 * Design notes:
 *  - Modifiers are intentionally kept on a narrow [0.5, 1.5] scale so that
 *    regional expertise never overwhelms the base scout-skill system.
 *  - "Home country" = whichever country has the highest familiarity in the
 *    scout's countryReputations map (seeded at 50 on game start, 0 for all
 *    others by initializeCountryReputations).
 */

import type { Scout, CountryReputation } from "@/engine/core/types";
import { getScoutHomeCountry } from "@/engine/world/travel";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a CountryReputation record for every country in the provided list.
 *
 * The starting country receives an initial familiarity of 50 (home advantage).
 * All other countries start at 0.  All counters begin at zero for every entry.
 *
 * @param countries       - Full list of countries active in the current game.
 * @param startingCountry - The country where the scout begins their career.
 * @returns               - A populated Record ready to assign to Scout.countryReputations.
 */
export function initializeCountryReputations(
  countries: string[],
  startingCountry: string,
): Record<string, CountryReputation> {
  const reputations: Record<string, CountryReputation> = {};

  for (const country of countries) {
    reputations[country] = {
      country,
      familiarity: country === startingCountry ? 50 : 0,
      reportsSubmitted: 0,
      successfulFinds: 0,
      contactCount: 0,
    };
  }

  return reputations;
}

/**
 * Return a regional expertise modifier based on how familiar the scout is
 * with a given country.
 *
 * Formula: 0.5 + (familiarity / 200)
 * Range:   [0.5, 1.0]
 *
 * A scout with no familiarity (0) returns the floor of 0.5, representing a
 * meaningful accuracy penalty when working in unknown territory.  Full
 * familiarity (100) returns 1.0 — no penalty at all.
 *
 * If the scout has no CountryReputation entry for the country, 0.5 is returned.
 *
 * @param scout   - The scout whose countryReputations are checked.
 * @param country - The country key being queried.
 * @returns       - A multiplier in [0.5, 1.0].
 */
export function getRegionalExpertiseModifier(
  scout: Scout,
  country: string,
): number {
  const rep = scout.countryReputations[country];
  if (rep === undefined) return 0.5;

  return 0.5 + rep.familiarity / 200;
}

/**
 * Return the bonus accuracy fraction granted by the regional specialist perk
 * when the scout is operating in their home country.
 *
 * Eligibility criteria:
 *  1. The scout's primary specialization must be "regional".
 *  2. The queried country must be the scout's home country (the country with
 *     the highest familiarity in countryReputations, as determined by
 *     getScoutHomeCountry from ./travel.ts).
 *
 * When both criteria are met the bonus scales with specializationLevel:
 *   bonus = 0.7 * (specializationLevel / 20)
 *
 * Range: [0.0, 0.7]
 *
 * @param scout   - The scout being evaluated.
 * @param country - The country the scout is currently operating in.
 * @returns       - A bonus fraction in [0.0, 0.7].
 */
export function getRegionalPerkBonus(scout: Scout, country: string): number {
  if (scout.primarySpecialization !== "regional") return 0.0;

  const homeCountry = getScoutHomeCountry(scout);
  if (homeCountry !== country) return 0.0;

  return 0.7 * (scout.specializationLevel / 20);
}

/**
 * Classify the scout's expertise level in a country based on familiarity.
 *
 *  novice:       familiarity  0–24
 *  intermediate: familiarity 25–49
 *  expert:       familiarity 50–79
 *  master:       familiarity 80–100
 *
 * @param rep - A CountryReputation record.
 * @returns   - A human-readable expertise tier.
 */
export function getCountryExpertiseLevel(
  rep: CountryReputation,
): "novice" | "intermediate" | "expert" | "master" {
  if (rep.familiarity >= 80) return "master";
  if (rep.familiarity >= 50) return "expert";
  if (rep.familiarity >= 25) return "intermediate";
  return "novice";
}

/**
 * Compute the combined regional accuracy bonus for a scout in a given country.
 *
 * Combines the base expertise modifier with the perk bonus via:
 *   total = getRegionalExpertiseModifier() * (1 + getRegionalPerkBonus())
 *
 * Result is clamped to [0.5, 1.5].
 *
 * Examples:
 *  - Unfamiliar country, no regional perk:       0.5 * (1 + 0.0) = 0.50
 *  - Full familiarity, no regional perk:         1.0 * (1 + 0.0) = 1.00
 *  - Full familiarity, max perk (level 20):      1.0 * (1 + 0.7) = 1.70 → clamped 1.50
 *  - Half familiarity, mid perk (level 10):      0.75 * (1 + 0.35) = 1.01
 *
 * @param scout   - The scout whose modifiers are computed.
 * @param country - The country the scout is operating in.
 * @returns       - A combined accuracy multiplier in [0.5, 1.5].
 */
export function calculateRegionalAccuracyBonus(
  scout: Scout,
  country: string,
): number {
  const expertiseModifier = getRegionalExpertiseModifier(scout, country);
  const perkBonus = getRegionalPerkBonus(scout, country);
  const total = expertiseModifier * (1 + perkBonus);
  return clamp(total, 0.5, 1.5);
}
