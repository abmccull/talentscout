/**
 * International scouting assignments.
 *
 * Design notes:
 *  - Pure functional: no mutations, no side effects, no I/O.
 *  - All randomness flows through the RNG instance passed in.
 *  - Tier 3+ scouts only qualify for international assignments.
 *  - Assignments refresh every ~4 weeks and expire if not taken.
 */

import type { RNG } from "@/engine/rng";
import type {
  Scout,
  GameState,
  InternationalAssignment,
} from "@/engine/core/types";
import { getScoutHomeCountry } from "@/engine/world/travel";
import { migrateInternationalAssignment } from "@/engine/world/internationalDeliverables";
import { getAvailableCountries } from "@/data/index";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Career tier required to qualify for international assignments. */
const MIN_TIER_FOR_INTERNATIONAL = 3;

/**
 * Country-reputation familiarity threshold above which a country is
 * considered "maxed" and no longer generates assignments.
 */
const MAX_FAMILIARITY_THRESHOLD = 90;

/** How often (in weeks) new assignments are generated. */
const ASSIGNMENT_REFRESH_INTERVAL = 4;

/** Maximum number of active assignments at any one time. */
const MAX_ACTIVE_ASSIGNMENTS = 3;

/** Duration of a youth tournament in weeks. */
const TOURNAMENT_DURATION_WEEKS = 2;

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Map a country name to a broad geographic region label.
 * Used to enrich assignment metadata.
 */
function getRegionForCountry(country: string): string {
  const lower = country.toLowerCase();

  const westernEurope = new Set([
    "england", "france", "germany", "spain", "italy", "portugal",
    "netherlands", "belgium", "scotland", "wales", "ireland",
    "switzerland", "austria",
  ]);
  const northernEurope = new Set([
    "sweden", "norway", "denmark",
  ]);
  const easternEurope = new Set([
    "poland", "turkey", "greece", "croatia", "serbia", "czech",
    "slovakia", "ukraine", "russia",
  ]);
  const southAmerica = new Set([
    "brazil", "argentina", "colombia", "chile", "uruguay",
    "peru", "ecuador", "paraguay", "bolivia", "venezuela",
  ]);
  const northAmerica = new Set([
    "usa", "mexico", "canada",
  ]);
  const westAfrica = new Set([
    "nigeria", "ghana", "ivorycoast", "senegal", "cameroon",
  ]);
  const northAfrica = new Set([
    "egypt",
  ]);
  const southernAfrica = new Set([
    "southafrica",
  ]);
  const eastAsia = new Set([
    "japan", "southkorea", "china",
  ]);
  const middleEast = new Set([
    "saudiarabia",
  ]);
  const oceania = new Set([
    "australia", "newzealand",
  ]);

  if (westernEurope.has(lower)) return "Western Europe";
  if (northernEurope.has(lower)) return "Northern Europe";
  if (easternEurope.has(lower)) return "Eastern Europe";
  if (southAmerica.has(lower)) return "South America";
  if (northAmerica.has(lower)) return "North America";
  if (westAfrica.has(lower)) return "West Africa";
  if (northAfrica.has(lower)) return "North Africa";
  if (southernAfrica.has(lower)) return "Southern Africa";
  if (eastAsia.has(lower)) return "East Asia";
  if (middleEast.has(lower)) return "Middle East";
  if (oceania.has(lower)) return "Oceania";
  return "International";
}

/**
 * Generate a human-readable description for an international assignment.
 */
function buildAssignmentDescription(
  country: string,
  type: InternationalAssignment["type"],
): string {
  const capitalised = country.charAt(0).toUpperCase() + country.slice(1);

  switch (type) {
    case "youthTournament":
      return `Attend a youth tournament in ${capitalised} to scout emerging talent from the region.`;
    case "seniorFriendly":
      return `Observe senior international friendlies in ${capitalised} and file reports on standout performers.`;
    case "scoutingMission":
      return `Conduct a dedicated scouting mission in ${capitalised}, visiting clubs and training facilities.`;
  }
}

/**
 * Generate a simple deterministic-enough assignment ID.
 * Uses the RNG so IDs are reproducible given the same seed.
 */
function generateAssignmentId(rng: RNG): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "assign_";
  for (let i = 0; i < 10; i++) {
    id += chars[rng.nextInt(0, chars.length - 1)];
  }
  return id;
}

/**
 * Return countries the scout has NOT yet maxed out reputation in, excluding
 * the scout's home country (home country has separate mechanics).
 */
function getCandidateCountries(scout: Scout, allCountries: string[]): string[] {
  const homeCountry = getScoutHomeCountry(scout);

  return allCountries.filter((country) => {
    if (country === homeCountry) return false;

    const rep = scout.countryReputations[country];
    if (!rep) return true; // Unknown country = unfamiliar = candidate

    return rep.familiarity < MAX_FAMILIARITY_THRESHOLD;
  });
}

/**
 * Determine assignment duration based on type and whether the destination
 * is intercontinental from the scout's home country.
 *
 * - scoutingMission:   2–4 weeks
 * - youthTournament:   2 weeks (fixed tournament window)
 * - seniorFriendly:    1–2 weeks
 */
function assignmentDuration(
  rng: RNG,
  type: InternationalAssignment["type"],
): number {
  switch (type) {
    case "youthTournament":
      return TOURNAMENT_DURATION_WEEKS;
    case "seniorFriendly":
      return rng.nextInt(1, 2);
    case "scoutingMission":
      return rng.nextInt(2, 4);
  }
}

/**
 * Determine reputation reward based on assignment type.
 */
function assignmentReputationReward(
  type: InternationalAssignment["type"],
): number {
  switch (type) {
    case "youthTournament":
      return 3;
    case "seniorFriendly":
      return 2;
    case "scoutingMission":
      return 4;
  }
}

// =============================================================================
// 1. generateInternationalAssignment
// =============================================================================

/**
 * Generate a single random international assignment for the scout.
 *
 * Requirements:
 *  - Scout must be career tier 3 or above.
 *  - The assignment targets a country the scout has NOT maxed reputation in.
 *  - The scout's home country is excluded (domestic assignments handled elsewhere).
 *
 * Returns null when:
 *  - Scout is below tier 3.
 *  - No suitable candidate countries exist (all maxed or only home country active).
 *
 * @param rng         - Seeded RNG instance (mutated in place).
 * @param scout       - The player's scout.
 * @param countries   - All countries active in the current game world.
 * @param currentWeek - The current game week (sets weekAvailable).
 * @returns           - A new InternationalAssignment, or null if ineligible.
 */
export function generateInternationalAssignment(
  rng: RNG,
  scout: Scout,
  countries: string[],
  currentWeek: number,
): InternationalAssignment | null {
  // Tier gate
  if (scout.careerTier < MIN_TIER_FOR_INTERNATIONAL) {
    return null;
  }

  // Find countries the scout can still grow reputation in
  const candidates = getCandidateCountries(scout, countries);
  if (candidates.length === 0) {
    return null;
  }

  // Pick a destination country
  const country = rng.pick(candidates);

  // Pick assignment type
  const type = rng.pick<InternationalAssignment["type"]>([
    "youthTournament",
    "seniorFriendly",
    "scoutingMission",
  ]);

  const duration = assignmentDuration(rng, type);

  return migrateInternationalAssignment({
    id: generateAssignmentId(rng),
    country,
    region: getRegionForCountry(country),
    description: buildAssignmentDescription(country, type),
    weekAvailable: currentWeek,
    duration,
    reputationReward: assignmentReputationReward(type),
    type,
  });
}

// =============================================================================
// 2. getAvailableAssignments
// =============================================================================

/**
 * Filter the full assignments list to those the scout currently qualifies for.
 *
 * Qualification criteria:
 *  1. Scout career tier >= 3.
 *  2. Scout is NOT currently traveling abroad (travelBooking.isAbroad = true
 *     OR currentWeek is within an active booking window).
 *  3. The assignment's weekAvailable matches the currentWeek (exact match —
 *     assignments expire after their availability week).
 *
 * @param scout       - The player's scout.
 * @param assignments - Full list of generated assignments.
 * @param currentWeek - The current game week.
 * @returns           - Subset of assignments the scout may accept.
 */
export function getAvailableAssignments(
  scout: Scout,
  assignments: InternationalAssignment[],
  currentWeek: number,
): InternationalAssignment[] {
  // Tier gate
  if (scout.careerTier < MIN_TIER_FOR_INTERNATIONAL) {
    return [];
  }

  // Booking gate: scout cannot accept new assignments while a trip is booked.
  if (scout.travelBooking) {
    return [];
  }

  // Filter to assignments available this week or carried over from last week.
  return assignments.filter(
    (a) => a.weekAvailable >= currentWeek - 1 && a.weekAvailable <= currentWeek,
  );
}

// =============================================================================
// 3. processInternationalWeek
// =============================================================================

/**
 * Result of processing the international system for one weekly tick.
 */
export interface InternationalWeekResult {
  /** Newly generated assignments (if this is a refresh week). */
  newAssignments: InternationalAssignment[];
  /** Assignments that have expired (weekAvailable < currentWeek - 1). */
  expiredAssignmentIds: string[];
}

/**
 * Process the international assignment system for one weekly tick.
 *
 * Runs two operations:
 *  1. Every ASSIGNMENT_REFRESH_INTERVAL weeks, generate up to
 *     MAX_ACTIVE_ASSIGNMENTS new assignments for the scout.
 *  2. Expire assignments whose weekAvailable < currentWeek - 1 (the scout had
 *     one week to accept them). The IDs of expired assignments are returned so
 *     the caller can remove them from game state.
 *
 * Returns a result object describing what changed. Callers are responsible
 * for applying these changes to the game state.
 *
 * @param rng                - Seeded RNG instance (mutated in place).
 * @param scout              - The player's scout.
 * @param gameState          - Current game state (provides countries and existing data).
 * @param existingAssignments - The scout's current active assignment list.
 * @returns                  - InternationalWeekResult describing new and expired assignments.
 */
export function processInternationalWeek(
  rng: RNG,
  scout: Scout,
  gameState: GameState,
  existingAssignments: InternationalAssignment[] = [],
): InternationalWeekResult {
  const currentWeek = gameState.currentWeek;
  const countries: string[] = gameState.countries.length > 0
    ? gameState.countries
    : getAvailableCountries();

  // Only tier 3+ scouts participate in the international system
  if (scout.careerTier < MIN_TIER_FOR_INTERNATIONAL) {
    return { newAssignments: [], expiredAssignmentIds: [] };
  }

  // --- Generate new assignments on refresh weeks ---
  const newAssignments: InternationalAssignment[] = [];
  const isRefreshWeek = currentWeek % ASSIGNMENT_REFRESH_INTERVAL === 1;

  if (isRefreshWeek) {
    // Generate up to MAX_ACTIVE_ASSIGNMENTS new assignments
    const toGenerate = rng.nextInt(1, MAX_ACTIVE_ASSIGNMENTS);

    for (let i = 0; i < toGenerate; i++) {
      const assignment = generateInternationalAssignment(
        rng,
        scout,
        countries,
        currentWeek,
      );
      if (assignment) {
        newAssignments.push(assignment);
      }
    }
  }

  // --- Expire stale assignments ---
  // An assignment is expired when its weekAvailable is more than one week old:
  // weekAvailable < currentWeek - 1 (the scout had exactly one week to accept).
  const expiredAssignmentIds = existingAssignments
    .filter((a) => a.weekAvailable < currentWeek - 1)
    .map((a) => a.id);

  return {
    newAssignments,
    expiredAssignmentIds,
  };
}

// =============================================================================
// RE-EXPORT: stale threshold helper
// =============================================================================

/**
 * Return the week threshold below which assignments are considered expired.
 * Assignments with weekAvailable <= this value should be removed.
 *
 * @param currentWeek - The current game week.
 * @returns           - The expiry threshold week.
 */
export function getAssignmentExpiryThreshold(currentWeek: number): number {
  // Assignments are valid for one week after they become available.
  // weekAvailable === currentWeek - 1 is the last "still valid" week.
  // Anything with weekAvailable < currentWeek - 1 is expired.
  return currentWeek - 2;
}
