/**
 * Travel system — international scouting travel mechanics.
 *
 * Design notes:
 *  - Pure functional: no mutations, no side effects.
 *  - All functions take plain data in and return plain data out.
 *  - New saves pin a permanent home base on the scout. Legacy saves fall back
 *    to the highest country familiarity until migration pins that result, so
 *    learning a foreign market can never silently relocate the scout.
 */

import type {
  Scout,
  TravelBooking,
  TravelPosture,
  CountryReputation,
  Fixture,
  Territory,
  ObservationContext,
} from "@/engine/core/types";
import { normalizeCountryKey } from "@/lib/country";
import {
  LEGACY_SEASON_LENGTH_WEEKS,
  normalizeGameWeek,
} from "@/engine/core/gameDate";

// =============================================================================
// TRIP POSTURE
// =============================================================================

export interface TravelPostureEffects {
  observationSignalMultiplier: number;
  observationUncertaintyMultiplier: number;
  regionalKnowledgeMultiplier: number;
  contactQualityMultiplier: number;
  discoveryMultiplier: number;
  opportunityMultiplier: number;
  costMultiplier: number;
  fatigueMultiplier: number;
  observationContextSignalBias: Partial<Record<ObservationContext, number>>;
  observationContextUncertaintyBias: Partial<Record<ObservationContext, number>>;
}

export interface TravelPostureDefinition {
  id: TravelPosture;
  label: string;
  summary: string;
  upside: string;
  tradeoff: string;
  effects: TravelPostureEffects;
}

const NEUTRAL_TRAVEL_POSTURE_EFFECTS: TravelPostureEffects = {
  observationSignalMultiplier: 1,
  observationUncertaintyMultiplier: 1,
  regionalKnowledgeMultiplier: 1,
  contactQualityMultiplier: 1,
  discoveryMultiplier: 1,
  opportunityMultiplier: 1,
  costMultiplier: 1,
  fatigueMultiplier: 1,
  observationContextSignalBias: {},
  observationContextUncertaintyBias: {},
};

export const TRAVEL_POSTURE_DEFINITIONS: Record<TravelPosture, TravelPostureDefinition> = {
  deepDive: {
    id: "deepDive",
    label: "Deep dive",
    summary: "Stay narrow, revisit evidence, and build an informed regional model.",
    upside: "Clearer observation evidence and substantially more regional knowledge.",
    tradeoff: "Higher cost and fatigue, fewer speculative leads, and weaker networking.",
    effects: {
      observationSignalMultiplier: 1.1,
      observationUncertaintyMultiplier: 0.9,
      regionalKnowledgeMultiplier: 1.35,
      contactQualityMultiplier: 0.8,
      discoveryMultiplier: 0.82,
      opportunityMultiplier: 0.8,
      costMultiplier: 1.12,
      fatigueMultiplier: 1.12,
      observationContextSignalBias: {
        academyVisit: 1.04,
        trainingGround: 1.05,
        followUpSession: 1.05,
      },
      observationContextUncertaintyBias: {
        academyVisit: 0.94,
        trainingGround: 0.93,
        followUpSession: 0.92,
      },
    },
  },
  networkBuild: {
    id: "networkBuild",
    label: "Build the network",
    summary: "Prioritize introductions, trust, and future access over this week's sample depth.",
    upside: "Stronger local contacts and more relationship-led opportunities.",
    tradeoff: "Slightly noisier observation evidence and a more expensive itinerary.",
    effects: {
      observationSignalMultiplier: 0.94,
      observationUncertaintyMultiplier: 1.06,
      regionalKnowledgeMultiplier: 1.08,
      contactQualityMultiplier: 1.55,
      discoveryMultiplier: 0.92,
      opportunityMultiplier: 1.18,
      costMultiplier: 1.08,
      fatigueMultiplier: 0.96,
      observationContextSignalBias: {
        parentCoachMeeting: 1.08,
        agentShowcase: 0.96,
      },
      observationContextUncertaintyBias: {
        parentCoachMeeting: 0.95,
        academyVisit: 1.04,
      },
    },
  },
  opportunityBlitz: {
    id: "opportunityBlitz",
    label: "Opportunity blitz",
    summary: "Cover as many venues and live leads as possible before the market moves.",
    upside: "Many more speculative discoveries and time-sensitive opportunities.",
    tradeoff: "Shallower evidence, weaker relationships, higher cost, and much more fatigue.",
    effects: {
      observationSignalMultiplier: 0.88,
      observationUncertaintyMultiplier: 1.16,
      regionalKnowledgeMultiplier: 0.75,
      contactQualityMultiplier: 0.7,
      discoveryMultiplier: 1.45,
      opportunityMultiplier: 1.35,
      costMultiplier: 1.18,
      fatigueMultiplier: 1.25,
      observationContextSignalBias: {
        liveMatch: 0.95,
        youthTournament: 0.95,
        youthFestival: 0.96,
      },
      observationContextUncertaintyBias: {
        liveMatch: 1.05,
        youthTournament: 1.04,
        youthFestival: 1.06,
      },
    },
  },
  assignmentFirst: {
    id: "assignmentFirst",
    label: "Assignment first",
    summary: "Protect the commissioned brief and avoid work that does not advance it.",
    upside: "A controlled, lower-fatigue trip with dependable evidence for the assigned brief.",
    tradeoff: "Far fewer speculative discoveries and relationship detours.",
    effects: {
      observationSignalMultiplier: 1,
      observationUncertaintyMultiplier: 1,
      regionalKnowledgeMultiplier: 1,
      contactQualityMultiplier: 1,
      discoveryMultiplier: 0.82,
      opportunityMultiplier: 0.82,
      costMultiplier: 1,
      fatigueMultiplier: 0.9,
      observationContextSignalBias: {
        liveMatch: 1.02,
        followUpSession: 1.03,
      },
      observationContextUncertaintyBias: {
        liveMatch: 0.98,
        followUpSession: 0.97,
      },
    },
  },
  academyEmbed: {
    id: "academyEmbed",
    label: "Academy embed",
    summary: "Work inside coached academy environments to deepen pathway knowledge and role interpretation.",
    upside: "Stronger academy evidence, dependable local trust, and faster knowledge growth in structured settings.",
    tradeoff: "Narrower discovery breadth and fewer speculative marketplace leads.",
    effects: {
      observationSignalMultiplier: 1.05,
      observationUncertaintyMultiplier: 0.94,
      regionalKnowledgeMultiplier: 1.32,
      contactQualityMultiplier: 1.18,
      discoveryMultiplier: 0.86,
      opportunityMultiplier: 0.92,
      costMultiplier: 1.06,
      fatigueMultiplier: 1.04,
      observationContextSignalBias: {
        academyVisit: 1.14,
        academyTrialDay: 1.13,
        youthTournament: 1.08,
        youthFestival: 1.06,
        trainingGround: 1.09,
      },
      observationContextUncertaintyBias: {
        academyVisit: 0.88,
        academyTrialDay: 0.89,
        youthTournament: 0.93,
        trainingGround: 0.9,
      },
    },
  },
  communityCircuit: {
    id: "communityCircuit",
    label: "Community circuit",
    summary: "Build coverage through school, grassroots, and informal local football networks.",
    upside: "Better early discovery, stronger local relationships, and broader grassroots context.",
    tradeoff: "Noisier evidence and weaker access to tightly controlled academy samples.",
    effects: {
      observationSignalMultiplier: 0.98,
      observationUncertaintyMultiplier: 1.03,
      regionalKnowledgeMultiplier: 1.18,
      contactQualityMultiplier: 1.28,
      discoveryMultiplier: 1.18,
      opportunityMultiplier: 1.08,
      costMultiplier: 1.04,
      fatigueMultiplier: 1,
      observationContextSignalBias: {
        schoolMatch: 1.1,
        grassrootsTournament: 1.12,
        streetFootball: 1.08,
        parentCoachMeeting: 1.12,
      },
      observationContextUncertaintyBias: {
        schoolMatch: 0.95,
        grassrootsTournament: 0.94,
        streetFootball: 0.97,
        academyVisit: 1.07,
        academyTrialDay: 1.08,
      },
    },
  },
  agentTour: {
    id: "agentTour",
    label: "Agent tour",
    summary: "Prioritize represented talent, intermediaries, and negotiated access windows.",
    upside: "Better relationship yield and more time-sensitive commercial leads.",
    tradeoff: "Evidence is more curated and academy or community knowledge deepens slowly.",
    effects: {
      observationSignalMultiplier: 0.96,
      observationUncertaintyMultiplier: 1.08,
      regionalKnowledgeMultiplier: 0.92,
      contactQualityMultiplier: 1.52,
      discoveryMultiplier: 1.02,
      opportunityMultiplier: 1.26,
      costMultiplier: 1.12,
      fatigueMultiplier: 0.98,
      observationContextSignalBias: {
        agentShowcase: 1.12,
        trialMatch: 1.06,
        parentCoachMeeting: 1.05,
      },
      observationContextUncertaintyBias: {
        agentShowcase: 0.95,
        trialMatch: 0.97,
        academyVisit: 1.08,
        schoolMatch: 1.05,
      },
    },
  },
  showcaseSweep: {
    id: "showcaseSweep",
    label: "Showcase sweep",
    summary: "Bounce between concentrated talent events to maximize short-window opportunity coverage.",
    upside: "Much stronger showcase discovery and a larger pool of urgent follow-up leads.",
    tradeoff: "Shallower relationship depth, weaker retained knowledge, and higher fatigue.",
    effects: {
      observationSignalMultiplier: 0.92,
      observationUncertaintyMultiplier: 1.12,
      regionalKnowledgeMultiplier: 0.82,
      contactQualityMultiplier: 0.88,
      discoveryMultiplier: 1.32,
      opportunityMultiplier: 1.3,
      costMultiplier: 1.15,
      fatigueMultiplier: 1.18,
      observationContextSignalBias: {
        youthFestival: 1.11,
        youthTournament: 1.1,
        liveMatch: 1.03,
        agentShowcase: 1.07,
      },
      observationContextUncertaintyBias: {
        youthFestival: 0.96,
        youthTournament: 0.97,
        liveMatch: 1.02,
        followUpSession: 1.08,
      },
    },
  },
};

/**
 * Legacy bookings have no posture and remain exactly neutral. All newly booked
 * trips persist an explicit posture, so loading an old save cannot silently
 * rebalance a trip already in progress.
 */
export function getTravelPostureEffects(
  posture: TravelPosture | undefined,
): TravelPostureEffects {
  const definition = posture ? TRAVEL_POSTURE_DEFINITIONS[posture] : undefined;
  return definition?.effects ?? NEUTRAL_TRAVEL_POSTURE_EFFECTS;
}

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
  const normalized = normalise(country);
  if (EUROPEAN_COUNTRIES.has(normalized)) return "europe";
  if (SOUTH_AMERICAN_COUNTRIES.has(normalized)) return "southamerica";
  if (NORTH_AMERICAN_COUNTRIES.has(normalized)) return "northamerica";
  if (AFRICAN_COUNTRIES.has(normalized)) return "africa";
  if (ASIAN_COUNTRIES.has(normalized)) return "asia";
  if (OCEANIAN_COUNTRIES.has(normalized)) return "oceania";
  return "unknown";
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

function normalise(country: string): string {
  return normalizeCountryKey(country) ?? country.trim().toLowerCase();
}

function getCountryReputationByIdentity(
  reputations: Record<string, CountryReputation>,
  country: string,
): CountryReputation | undefined {
  const normalizedCountry = normalise(country);
  return Object.entries(reputations).find(
    ([key]) => normalise(key) === normalizedCountry,
  )?.[1];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Resolve the scout's permanent home country.
 *
 * Current saves persist this value directly. The familiarity fallback only
 * exists for pre-migration data and is immediately pinned when a save loads.
 */
export function getScoutHomeCountry(scout: Scout): string {
  const pinnedHomeCountry = scout.homeCountry ? normalise(scout.homeCountry) : undefined;
  if (pinnedHomeCountry) return pinnedHomeCountry;

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

  return normalise(bestKey);
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
 * The scout's home country is resolved via getScoutHomeCountry(). The returned
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
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
  quotedCost?: number,
  posture: TravelPosture = "assignmentFirst",
): Scout {
  const homeCountry = getScoutHomeCountry(scout);
  const normalisedDepartureWeek = normalizeGameWeek(departureWeek, seasonLength);
  const normalisedReturnWeek = normalizeGameWeek(
    departureWeek + duration,
    seasonLength,
  );

  const postureEffects = getTravelPostureEffects(posture);
  const booking: TravelBooking = {
    destinationCountry,
    departureWeek: normalisedDepartureWeek,
    returnWeek: normalisedReturnWeek,
    cost: quotedCost === undefined
      ? Math.round(getTravelCost(homeCountry, destinationCountry) * postureEffects.costMultiplier)
      : Math.max(0, Math.round(quotedCost)),
    isAbroad: false,
    posture,
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
  if (departureWeek === returnWeek) return false;
  if (departureWeek < returnWeek) {
    return currentWeek >= departureWeek && currentWeek < returnWeek;
  }
  return currentWeek >= departureWeek || currentWeek < returnWeek;
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
    if (normalise(territory.countryKey ?? territory.country) === locationCountry) {
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
  const rep = getCountryReputationByIdentity(scout.countryReputations, country);

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
