/**
 * Travel system — international scouting travel mechanics.
 *
 * Design notes:
 *  - Pure functional: no mutations, no side effects.
 *  - All functions take plain data in and return plain data out.
 *  - "Home country" is derived from the scout's countryReputations: whichever
 *    country has the highest familiarity is treated as home. At game start the
 *    starting country receives familiarity 50 and all others start at 0, so this
 *    is unambiguous from the beginning. If multiple countries share the max
 *    familiarity, the first one found in Object.entries iteration order is used
 *    (stable across V8 for string-keyed objects).
 */

import type { Scout, TravelBooking, CountryReputation, Fixture, Territory } from "@/engine/core/types";

// =============================================================================
// CONTINENT CLASSIFICATION
// =============================================================================

/** Countries classified as European for travel cost and slot purposes. */
const EUROPEAN_COUNTRIES = new Set([
  "england",
  "france",
  "germany",
  "spain",
  "italy",
  "portugal",
  "netherlands",
  "belgium",
  "scotland",
  "wales",
  "ireland",
  "sweden",
  "norway",
  "denmark",
  "switzerland",
  "austria",
  "poland",
  "turkey",
  "greece",
  "croatia",
  "serbia",
  "czech",
  "slovakia",
  "ukraine",
  "russia",
]);

/** Countries classified as South American for travel cost and slot purposes. */
const SOUTH_AMERICAN_COUNTRIES = new Set([
  "brazil",
  "argentina",
  "colombia",
  "chile",
  "uruguay",
  "peru",
  "ecuador",
  "paraguay",
  "bolivia",
  "venezuela",
]);

/** Countries classified as North American. */
const NORTH_AMERICAN_COUNTRIES = new Set([
  "usa",
  "mexico",
  "canada",
]);

/** Countries classified as African. */
const AFRICAN_COUNTRIES = new Set([
  "nigeria",
  "ghana",
  "ivorycoast",
  "egypt",
  "southafrica",
  "senegal",
  "cameroon",
]);

/** Countries classified as Asian. */
const ASIAN_COUNTRIES = new Set([
  "japan",
  "southkorea",
  "saudiarabia",
  "china",
]);

/** Countries classified as Oceanian. */
const OCEANIAN_COUNTRIES = new Set([
  "australia",
  "newzealand",
]);

type ContinentId = "europe" | "southamerica" | "northamerica" | "africa" | "asia" | "oceania" | "unknown";

/**
 * Return the continent ID for a given country key.
 */
export function getContinentId(country: string): ContinentId {
  const lower = country.toLowerCase();
  if (EUROPEAN_COUNTRIES.has(lower)) return "europe";
  if (SOUTH_AMERICAN_COUNTRIES.has(lower)) return "southamerica";
  if (NORTH_AMERICAN_COUNTRIES.has(lower)) return "northamerica";
  if (AFRICAN_COUNTRIES.has(lower)) return "africa";
  if (ASIAN_COUNTRIES.has(lower)) return "asia";
  if (OCEANIAN_COUNTRIES.has(lower)) return "oceania";
  return "unknown";
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

function normalise(country: string): string {
  return country.toLowerCase();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Derive the scout's home country from their country reputations.
 *
 * The starting country is initialised with familiarity 50 (all others begin at
 * 0), so the highest-familiarity entry reliably identifies home. If familiarity
 * is somehow equal across all entries the function falls back to the first key.
 */
export function getScoutHomeCountry(scout: Scout): string {
  const entries = Object.entries(scout.countryReputations);
  if (entries.length === 0) return "england"; // safe fallback

  let bestKey = entries[0][0];
  let bestFamiliarity = entries[0][1].familiarity;

  for (const [key, rep] of entries) {
    if (rep.familiarity > bestFamiliarity) {
      bestFamiliarity = rep.familiarity;
      bestKey = key;
    }
  }

  return bestKey;
}

// =============================================================================
// TRAVEL COST TABLE
// =============================================================================

/**
 * Adjacent continent pairs for reduced travel costs.
 */
const ADJACENT_CONTINENTS: ReadonlySet<string> = new Set([
  "europe|africa",
  "africa|europe",
  "southamerica|northamerica",
  "northamerica|southamerica",
  "asia|oceania",
  "oceania|asia",
  "europe|northamerica",
  "northamerica|europe",
]);

function areAdjacentContinents(a: ContinentId, b: ContinentId): boolean {
  return ADJACENT_CONTINENTS.has(`${a}|${b}`);
}

/**
 * Return the travel cost (in game currency) between two countries.
 *
 * Cost table (symmetric — order of from/to does not matter):
 *   Same country                  :     0
 *   Same continent intra-regional :   300–600
 *   England ↔ France/Germany/Spain:   500
 *   England ↔ Brazil/Argentina    :  2000
 *   France  ↔ Germany/Spain       :   400
 *   Brazil  ↔ Argentina           :   600
 *   Europe  ↔ Africa              :  1500
 *   Europe  ↔ North America       :  2000
 *   Europe  ↔ Asia                :  2500
 *   Europe  ↔ Oceania             :  3000
 *   South America ↔ North America :  1200
 *   South America ↔ Africa        :  2000
 *   Intercontinental default      :  2500
 *   Unknown pair                  :  1500
 */
export function getTravelCost(fromCountry: string, toCountry: string): number {
  const from = normalise(fromCountry);
  const to = normalise(toCountry);

  if (from === to) return 0;

  // Canonical pair matching — order-independent
  const pair = (a: string, b: string): boolean =>
    (from === a && to === b) || (from === b && to === a);

  const pairIn = (a: string, bSet: Set<string>): boolean =>
    (from === a && bSet.has(to)) || (to === a && bSet.has(from));

  const nearEurope = new Set(["france", "germany", "spain"]);
  const samBig = new Set(["brazil", "argentina"]);

  // England ↔ France/Germany/Spain
  if (pairIn("england", nearEurope)) return 500;

  // England ↔ Brazil/Argentina
  if (pairIn("england", samBig)) return 2000;

  // France ↔ Germany/Spain
  const frNearEurope = new Set(["germany", "spain"]);
  if (pairIn("france", frNearEurope)) return 400;

  // Brazil ↔ Argentina
  if (pair("brazil", "argentina")) return 600;

  // Continent-based costs
  const fromContinent = getContinentId(from);
  const toContinent = getContinentId(to);

  // Same continent
  if (fromContinent === toContinent && fromContinent !== "unknown") {
    switch (fromContinent) {
      case "europe": return 500;
      case "southamerica": return 600;
      case "northamerica": return 400;
      case "africa": return 500;
      case "asia": return 600;
      case "oceania": return 300;
    }
  }

  // Specific inter-continental routes
  const route = (a: ContinentId, b: ContinentId): boolean =>
    (fromContinent === a && toContinent === b) || (fromContinent === b && toContinent === a);

  if (route("europe", "africa")) return 1500;
  if (route("europe", "northamerica")) return 2000;
  if (route("europe", "asia")) return 2500;
  if (route("europe", "oceania")) return 3000;
  if (route("southamerica", "northamerica")) return 1200;
  if (route("southamerica", "africa")) return 2000;
  if (route("africa", "asia")) return 2000;
  if (route("asia", "oceania")) return 1500;
  if (route("northamerica", "asia")) return 2500;
  if (route("northamerica", "oceania")) return 3000;
  if (route("africa", "oceania")) return 3000;
  if (route("southamerica", "asia")) return 3000;
  if (route("southamerica", "oceania")) return 3000;
  if (route("africa", "northamerica")) return 2500;

  // General intercontinental
  if (fromContinent !== toContinent) return 2500;

  // Default unknown pair
  return 1500;
}

// =============================================================================
// TRAVEL DURATION
// =============================================================================

/**
 * Continent-distance matrix for travel duration (in weeks).
 *
 *   Same continent            : 1 week
 *   Adjacent continents       : 2 weeks
 *   Distant continents        : 3 weeks
 */
export function getTravelDuration(fromCountry: string, toCountry: string): number {
  const from = normalise(fromCountry);
  const to = normalise(toCountry);

  if (from === to) return 0;

  const fromContinent = getContinentId(from);
  const toContinent = getContinentId(to);

  // Same continent
  if (fromContinent === toContinent && fromContinent !== "unknown") return 1;

  // Adjacent continents
  if (areAdjacentContinents(fromContinent, toContinent)) return 2;

  // Distant continents
  return 3;
}

// =============================================================================
// TRAVEL SLOTS
// =============================================================================

/**
 * Return the number of weekly activity slots consumed by this journey.
 *
 *   Same country              : 0 slots (no travel required)
 *   Same continent            : 1 slot
 *   Adjacent continents       : 1 slot
 *   Distant continents        : 2 slots
 */
export function getTravelSlots(fromCountry: string, toCountry: string): number {
  const from = normalise(fromCountry);
  const to = normalise(toCountry);

  if (from === to) return 0;

  const fromContinent = getContinentId(from);
  const toContinent = getContinentId(to);

  // Same continent
  if (fromContinent === toContinent) return 1;

  // Adjacent continents
  if (areAdjacentContinents(fromContinent, toContinent)) return 1;

  // Distant continents
  return 2;
}

// =============================================================================
// BOOKING
// =============================================================================

/**
 * Create an international travel booking on the scout.
 *
 * The scout's home country is derived via getScoutHomeCountry(). The returned
 * scout copy has a travelBooking set with isAbroad = false (the scout departs
 * at the start of departureWeek, so they are not yet abroad at booking time).
 *
 * @param scout              - The scout making the booking (not mutated).
 * @param destinationCountry - The country being travelled to.
 * @param departureWeek      - The week travel begins.
 * @param duration           - How many weeks the scout will be away.
 * @returns A new Scout with travelBooking set.
 */
export function bookTravel(
  scout: Scout,
  destinationCountry: string,
  departureWeek: number,
  duration: number,
): Scout {
  const homeCountry = getScoutHomeCountry(scout);

  const booking: TravelBooking = {
    destinationCountry,
    departureWeek,
    returnWeek: departureWeek + duration,
    cost: getTravelCost(homeCountry, destinationCountry),
    isAbroad: false,
  };

  return { ...scout, travelBooking: booking };
}

// =============================================================================
// LOCATION QUERIES
// =============================================================================

/**
 * Return true if the scout is currently abroad during the given week.
 *
 * The scout is abroad when:
 *   - They have an active travel booking, AND
 *   - currentWeek >= departureWeek AND currentWeek < returnWeek
 *
 * At returnWeek the scout is back home, so that week is NOT counted as abroad.
 */
export function isScoutAbroad(scout: Scout, currentWeek: number): boolean {
  if (!scout.travelBooking) return false;
  const { departureWeek, returnWeek } = scout.travelBooking;
  return currentWeek >= departureWeek && currentWeek < returnWeek;
}

/**
 * Return fixture IDs that the scout can attend based on their current location.
 *
 * If abroad: only fixtures whose league belongs to the destination country.
 * If at home: only fixtures whose league belongs to the home country.
 *
 * Matching is case-insensitive on the Territory.country field vs the scout's
 * effective location country.
 *
 * @param scout       - The scout (not mutated).
 * @param currentWeek - The current game week.
 * @param fixtures    - All fixtures in the game world, keyed by fixture ID.
 * @param territories - All territories in the game world, keyed by territory ID.
 * @returns           - Array of fixture IDs the scout can attend this week.
 */
export function getAccessibleFixtures(
  scout: Scout,
  currentWeek: number,
  fixtures: Record<string, Fixture>,
  territories: Record<string, Territory>,
): string[] {
  // Determine the effective location country
  const abroad = isScoutAbroad(scout, currentWeek);
  const locationCountry = abroad
    ? normalise(scout.travelBooking!.destinationCountry)
    : normalise(getScoutHomeCountry(scout));

  // Collect all league IDs accessible from the current location
  const accessibleLeagueIds = new Set<string>();

  for (const territory of Object.values(territories)) {
    if (normalise(territory.country) === locationCountry) {
      for (const leagueId of territory.leagueIds) {
        accessibleLeagueIds.add(leagueId);
      }
    }
  }

  // Filter fixtures to current week, not yet played, and in an accessible league
  const result: string[] = [];

  for (const [id, fixture] of Object.entries(fixtures)) {
    if (fixture.week !== currentWeek) continue;
    if (fixture.played) continue;
    if (accessibleLeagueIds.has(fixture.leagueId)) {
      result.push(id);
    }
  }

  return result;
}

// =============================================================================
// FOREIGN SCOUTING PENALTY
// =============================================================================

/**
 * Compute the accuracy penalty factor for scouting in a foreign country.
 *
 * The penalty is a multiplier applied to reduce observation accuracy:
 *   Base penalty = 0.3 * (1 - familiarity / 100)
 *   Adaptability reduction = penalty * (1 - adaptability / 40)
 *   Final penalty = clamp(result, 0.0, 0.3)
 *
 * A scout with familiarity 100 always has penalty 0 (no penalty).
 * A scout with adaptability 20 reduces any base penalty by 50%.
 * Scouting in the home country (where familiarity is highest) typically
 * yields familiarity >= 50, resulting in a penalty of at most 0.15 before
 * adaptability reduction.
 *
 * @param scout   - The scout being evaluated.
 * @param country - The country being scouted in.
 * @returns       - Penalty factor in [0.0, 0.3]. Multiply against accuracy to reduce it.
 */
export function getForeignScoutingPenalty(scout: Scout, country: string): number {
  const rep: CountryReputation | undefined =
    scout.countryReputations[normalise(country)] ??
    scout.countryReputations[country];

  const familiarity = rep ? rep.familiarity : 0;
  const adaptability = scout.attributes.adaptability;

  // Base penalty from unfamiliarity
  const basePenalty = 0.3 * (1 - familiarity / 100);

  // Adaptability reduces the penalty (max adaptability of 20 → max 50% reduction)
  const reduced = basePenalty * (1 - adaptability / 40);

  return clamp(reduced, 0.0, 0.3);
}

// =============================================================================
// COUNTRY REPUTATION UPDATES
// =============================================================================

/**
 * Apply a reputation event to a CountryReputation, returning a new copy.
 *
 *   "report"  — familiarity +2, reportsSubmitted +1
 *   "success" — familiarity +5, successfulFinds +1
 *   "contact" — familiarity +3, contactCount +1
 *
 * Familiarity is clamped to [0, 100].
 *
 * @param rep   - Current reputation record (not mutated).
 * @param event - The event type that occurred.
 * @returns     - New CountryReputation with updated fields.
 */
export function updateCountryReputation(
  rep: CountryReputation,
  event: "report" | "success" | "contact",
  /** Flat bonus added to familiarity gain from equipment (e.g. 5 = +5 familiarity). */
  familiarityGainBonus?: number,
): CountryReputation {
  const bonus = familiarityGainBonus ?? 0;
  switch (event) {
    case "report":
      return {
        ...rep,
        familiarity: clamp(rep.familiarity + 2 + bonus, 0, 100),
        reportsSubmitted: rep.reportsSubmitted + 1,
      };

    case "success":
      return {
        ...rep,
        familiarity: clamp(rep.familiarity + 5 + bonus, 0, 100),
        successfulFinds: rep.successfulFinds + 1,
      };

    case "contact":
      return {
        ...rep,
        familiarity: clamp(rep.familiarity + 3 + bonus, 0, 100),
        contactCount: rep.contactCount + 1,
      };
  }
}
