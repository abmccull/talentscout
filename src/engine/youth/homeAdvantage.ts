/**
 * Home country advantage — passive youth events, local bonuses, and travel costs.
 *
 * Scouts have a natural advantage in their home country: they hear about
 * local youth events passively, build relationships faster with local contacts,
 * and travel costs are lower for domestic scouting trips.
 *
 * All functions are pure: no side effects, no mutation.
 */

import type { RNG } from "@/engine/rng";
import type {
  Scout,
  UnsignedYouth,
  InboxMessage,
  Contact,
} from "@/engine/core/types";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Neighboring country map — used to determine reduced travel costs for
 * adjacent countries. Relationships are bidirectional and symmetric.
 */
const NEIGHBOR_MAP: Record<string, string[]> = {
  // Core countries
  england: ["france", "germany", "spain"],
  france: ["england", "germany", "spain"],
  germany: ["france", "england", "spain"],
  spain: ["france", "england"],
  brazil: ["argentina"],
  argentina: ["brazil"],
  // North America
  usa: ["mexico", "canada"],
  mexico: ["usa", "canada"],
  canada: ["usa"],
  // West Africa
  nigeria: ["ghana", "cameroon"],
  ghana: ["ivorycoast", "nigeria"],
  ivorycoast: ["ghana", "senegal"],
  senegal: ["ivorycoast", "cameroon"],
  cameroon: ["nigeria", "senegal"],
  // North/Southern Africa
  egypt: ["saudiarabia"],
  southafrica: [],
  // East Asia
  japan: ["southkorea", "china"],
  southkorea: ["japan", "china"],
  china: ["japan", "southkorea"],
  // Middle East
  saudiarabia: ["egypt"],
  // Oceania
  australia: ["newzealand"],
  newzealand: ["australia"],
};

/**
 * Venue type labels used in passive youth event narratives.
 * Each entry corresponds to a plausible local scouting venue.
 */
const VENUE_TYPE_LABELS: readonly string[] = [
  "a local schools cup tie",
  "a Sunday league grassroots tournament",
  "a regional academy trial day",
  "a youth festival",
  "an under-16s street football showcase",
  "a neighbourhood training session",
  "a youth club fixture",
];

// =============================================================================
// UTILITY
// =============================================================================

/**
 * Normalize a country name for consistent map lookups.
 * Converts to lowercase and strips all whitespace so that multi-word names
 * like "United States" match NEIGHBOR_MAP slug keys like "unitedstates".
 */
function normalizeCountry(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "");
}

/**
 * Returns true if the scout considers the given country their home.
 *
 * A scout is considered home if:
 *  - Their nationality field exactly matches the country name (case-insensitive,
 *    whitespace-normalized), or
 *  - Their countryReputations entry for that country has familiarity > 70
 *    (adopted home through extensive time spent in that country).
 */
export function isHomeCountry(scout: Scout, country: string): boolean {
  const normalizedCountry = normalizeCountry(country);

  if (scout.nationality !== undefined) {
    if (normalizeCountry(scout.nationality) === normalizedCountry) {
      return true;
    }
  }

  const rep = scout.countryReputations[country];
  if (rep !== undefined && rep.familiarity > 70) {
    return true;
  }

  return false;
}

// =============================================================================
// PASSIVE YOUTH EVENTS
// =============================================================================

/**
 * Generates passive inbox alerts about unsigned youth spotted in the scout's
 * home country. These represent word-of-mouth intelligence that reaches the
 * scout without them having to actively seek it out.
 *
 * Fires only when:
 *  - The scout's nationality matches homeCountry, OR they have familiarity > 50
 *    in their countryReputations for that country.
 *  - A 20% weekly chance passes.
 *  - At least one unsigned youth in the home country has buzzLevel > 20.
 *
 * Returns 1–3 InboxMessage objects, or an empty array if the event does not
 * fire or no eligible youth exist.
 */
export function generatePassiveYouthEvents(
  rng: RNG,
  scout: Scout,
  homeCountry: string,
  unsignedYouth: Record<string, UnsignedYouth>,
  week: number,
  season: number,
): InboxMessage[] {
  // Check eligibility: scout must have a connection to the home country.
  const normalizedCountry = normalizeCountry(homeCountry);

  const hasNationalityMatch =
    scout.nationality !== undefined &&
    normalizeCountry(scout.nationality) === normalizedCountry;

  const rep = scout.countryReputations[homeCountry];
  const hasFamiliarityMatch = rep !== undefined && rep.familiarity > 50;

  if (!hasNationalityMatch && !hasFamiliarityMatch) {
    return [];
  }

  // 20% weekly chance of passive event firing.
  if (!rng.chance(0.2)) {
    return [];
  }

  // Gather eligible youth: in the home country, not yet placed, buzz > 20.
  const eligibleYouth = Object.values(unsignedYouth).filter(
    (youth) =>
      youth.country.toLowerCase() === normalizedCountry &&
      !youth.placed &&
      !youth.retired &&
      youth.buzzLevel > 20,
  );

  if (eligibleYouth.length === 0) {
    return [];
  }

  // Pick between 1 and 3 youth to feature (bounded by availability).
  const count = Math.min(rng.nextInt(1, 3), eligibleYouth.length);
  const messages: InboxMessage[] = [];

  // Shuffle and take the first `count` entries to avoid ordering bias.
  const shuffled = rng.shuffle(eligibleYouth);
  const selected = shuffled.slice(0, count);

  for (const youth of selected) {
    const { player, regionId } = youth;
    const fullName = `${player.firstName} ${player.lastName}`;
    const venueLabel = rng.pick(VENUE_TYPE_LABELS);
    const msgId = `msg_youth_event_${rng.nextInt(100000, 999999)}`;

    const message: InboxMessage = {
      id: msgId,
      week,
      season,
      type: "event",
      title: `Local Youth Sighting: ${regionId}`,
      body:
        `Word has reached you about a promising youngster in ${regionId}. ` +
        `${fullName}, age ${player.age}, has been catching eyes at ${venueLabel}. ` +
        `It might be worth scheduling a visit.`,
      read: false,
      actionRequired: false,
      relatedId: player.id,
      relatedEntityType: "player",
    };

    messages.push(message);
  }

  return messages;
}

// =============================================================================
// LOCAL CONTACT BONUS
// =============================================================================

/**
 * Returns the relationship bonus applied when the scout meets a contact whose
 * region matches the home country.
 *
 * Scouts build local relationships faster when operating on familiar ground.
 * This +5 bonus is added per meeting in the home country.
 *
 * @returns +5 if the contact's region matches homeCountry (case-insensitive),
 *          otherwise 0.
 */
export function getLocalContactBonus(
  scout: Scout,
  contact: Contact,
  homeCountry: string,
): number {
  if (contact.region === undefined) {
    return 0;
  }

  if (contact.region.toLowerCase() === homeCountry.toLowerCase()) {
    return 5;
  }

  return 0;
}

// =============================================================================
// TRAVEL COST OVERRIDE
// =============================================================================

/**
 * Returns the slot and fatigue cost for travelling to a destination country,
 * adjusted for the scout's home country advantage.
 *
 * Cost tiers:
 *  - Home country:     { slotCost: 0, fatigueCost: 0 }  — no travel overhead
 *  - Neighboring:      { slotCost: 1, fatigueCost: 4 }  — short hop
 *  - Distant country:  { slotCost: 2, fatigueCost: 8 }  — international travel
 *
 * Neighbors are defined in NEIGHBOR_MAP. Relationships are symmetric but the
 * map is defined explicitly for each country to keep lookups O(1).
 */
export function getTravelCostOverride(
  scout: Scout,
  destination: string,
  homeCountry: string,
): { slotCost: number; fatigueCost: number } {
  const normalizedDestination = normalizeCountry(destination);
  const normalizedHome = normalizeCountry(homeCountry);

  // Home country: no travel cost.
  if (normalizedDestination === normalizedHome) {
    return { slotCost: 0, fatigueCost: 0 };
  }

  // Neighboring country: reduced cost.
  const neighbors = NEIGHBOR_MAP[normalizedHome] ?? [];
  if (neighbors.includes(normalizedDestination)) {
    return { slotCost: 1, fatigueCost: 4 };
  }

  // Distant country: full international travel cost.
  return { slotCost: 2, fatigueCost: 8 };
}

// =============================================================================
// HOME COUNTRY YOUTH BONUS
// =============================================================================

/**
 * Returns visibility and buzz bonuses applied when a scout observes youth in
 * their home country. Local scouts have sharper eyes for domestic talent —
 * they spot players more easily and their presence amplifies buzz slightly.
 *
 * @returns { visibilityBonus: 5, buzzBonus: 2 } in the home country,
 *          { visibilityBonus: 0, buzzBonus: 0 } otherwise.
 */
export function getHomeCountryYouthBonus(
  scout: Scout,
  homeCountry: string,
): { visibilityBonus: number; buzzBonus: number } {
  if (isHomeCountry(scout, homeCountry)) {
    return { visibilityBonus: 5, buzzBonus: 2 };
  }

  return { visibilityBonus: 0, buzzBonus: 0 };
}
