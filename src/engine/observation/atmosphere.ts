/**
 * Venue Atmosphere System
 *
 * Each observation venue has a distinct atmosphere that affects what scouts
 * can observe. Street football is chaotic and reveals raw talent; academy
 * trial days are controlled and reveal tactical understanding.
 *
 * Dynamic events (rain starting, crowd disturbance, lopsided scores)
 * change the atmosphere mid-session, creating unpredictable conditions.
 */

import type { PlayerAttribute } from "@/engine/core/types";
import { RNG } from "@/engine/rng/index";
import type { AtmosphereEvent, VenueAtmosphere } from "./types";

// =============================================================================
// CONSTANTS
// =============================================================================

const WEATHER_CONDITIONS = [
  "clear",
  "overcast",
  "light_rain",
  "heavy_rain",
  "cold",
  "hot",
] as const;

type WeatherCondition = (typeof WEATHER_CONDITIONS)[number];

// =============================================================================
// EVENT TEMPLATES
// =============================================================================

interface EventTemplate {
  id: string;
  description: string;
  effect: AtmosphereEvent["effect"];
  affectedAttributes?: PlayerAttribute[];
  noiseDelta: number;
}

const EVENT_TEMPLATES: readonly EventTemplate[] = [
  {
    id: "rain_starts",
    description: "Rain starts falling, slicking the surface and changing the pace of play.",
    effect: "amplify",
    affectedAttributes: ["balance", "agility"],
    noiseDelta: 0.1,
  },
  {
    id: "crowd_erupts",
    description: "The crowd erupts after a controversial decision, raising the tension sharply.",
    effect: "amplify",
    affectedAttributes: ["composure", "bigGameTemperament"],
    noiseDelta: 0.15,
  },
  {
    id: "lopsided_score",
    description: "The match becomes one-sided — the trailing team's reactions reveal character.",
    effect: "reveal",
    affectedAttributes: ["workRate", "leadership", "composure"],
    noiseDelta: 0.05,
  },
  {
    id: "parent_interference",
    description: "A parent shouts instructions from the sideline, unsettling nearby players.",
    effect: "dampen",
    affectedAttributes: ["composure", "decisionMaking"],
    noiseDelta: 0.1,
  },
  {
    id: "waterlogged_pitch",
    description: "One side of the pitch becomes waterlogged, turning every run into a physical test.",
    effect: "amplify",
    affectedAttributes: ["strength", "stamina", "pace"],
    noiseDelta: 0.1,
  },
  {
    id: "altercation",
    description: "Tempers flare between two players — the reaction of those around them is telling.",
    effect: "reveal",
    affectedAttributes: ["bigGameTemperament", "composure", "leadership"],
    noiseDelta: 0.2,
  },
  {
    id: "late_talent",
    description: "A new player joins the session mid-way, drawing immediate attention from everyone.",
    effect: "reveal",
    affectedAttributes: ["anticipation", "positioning", "workRate"],
    noiseDelta: 0.05,
  },
  {
    id: "formation_change",
    description: "The coach switches to a different formation, demanding quick tactical adjustment.",
    effect: "amplify",
    affectedAttributes: ["offTheBall", "pressing", "defensiveAwareness", "vision"],
    noiseDelta: 0.05,
  },
  {
    id: "injury_stoppage",
    description: "Play stops for an extended injury, breaking concentration for everyone.",
    effect: "distraction",
    affectedAttributes: [],
    noiseDelta: 0.1,
  },
  {
    id: "heavy_foul",
    description: "A heavy challenge sparks a prolonged argument, testing everyone's temperament.",
    effect: "reveal",
    affectedAttributes: ["bigGameTemperament", "composure"],
    noiseDelta: 0.15,
  },
  {
    id: "brilliant_goal",
    description: "A moment of genuine brilliance lifts the session — players respond in different ways.",
    effect: "reveal",
    affectedAttributes: ["workRate", "anticipation", "bigGameTemperament"],
    noiseDelta: -0.05,
  },
  {
    id: "wind_gusts",
    description: "Strong wind gusts sweep across the pitch, disrupting long balls and loose touches.",
    effect: "dampen",
    affectedAttributes: ["crossing", "passing", "firstTouch"],
    noiseDelta: 0.1,
  },
  {
    id: "referee_chaos",
    description: "A series of poor refereeing decisions leaves players frustrated and reactive.",
    effect: "amplify",
    affectedAttributes: ["composure", "professionalism", "leadership"],
    noiseDelta: 0.15,
  },
  {
    id: "crowded_touchline",
    description: "Scouts and coaches crowd the touchline, raising the stakes for every player.",
    effect: "amplify",
    affectedAttributes: ["bigGameTemperament", "composure", "consistency"],
    noiseDelta: 0.1,
  },
  {
    id: "fast_start",
    description: "The session opens at a breakneck pace — intensity reveals physical limits early.",
    effect: "amplify",
    affectedAttributes: ["stamina", "pace", "workRate"],
    noiseDelta: 0.05,
  },
];

// =============================================================================
// VENUE DESCRIPTIONS
// =============================================================================

const SCHOOL_MATCH_DESCRIPTIONS = [
  "A mid-week fixture on a compact school pitch — compact space and limited tactical structure expose natural instincts.",
  "School match on a bumpy grass pitch. Controlled environment but inconsistent surface keeps technique honest.",
  "The school ground is quiet, teachers occasionally watching from the edge. Tactics are loose but individual quality stands out.",
];

const GRASSROOTS_TOURNAMENT_DESCRIPTIONS = [
  "A multi-team grassroots day with back-to-back fixtures. Stamina and attitude reveal themselves across games.",
  "Local tournament at the park, flags and cones marking the pitch. Intensity builds as the day progresses.",
  "High energy grassroots event — the mix of abilities creates natural pressure tests for the better players.",
];

const STREET_FOOTBALL_DESCRIPTIONS = [
  "Raw pick-up football on a concrete surface. Rules are loose and creativity is rewarded immediately.",
  "Street game between neighbourhood kids — no coaches, no system, pure instinct and improvisation.",
  "Evening kickabout under the floodlights of a car park. Chaos is the only constant here.",
];

const ACADEMY_TRIAL_DESCRIPTIONS = [
  "A structured academy trial with clipboard coaches watching every touch. Players perform under a microscope.",
  "Clinical trial environment — drills, then small-sided games. Tactical instructions given throughout.",
  "Academy assessment day. The format is controlled but the personal stakes create a unique pressure.",
];

const YOUTH_FESTIVAL_DESCRIPTIONS = [
  "A high-profile youth festival drawing clubs from across the region. Every player knows what is at stake.",
  "Festival atmosphere with multiple pitches running simultaneously — scouts everywhere, pressure everywhere.",
  "Youth tournament final stages. The noise and competition reveal which players raise their game.",
];

const RESERVE_MATCH_DESCRIPTIONS = [
  "A reserve fixture played in near silence — players making their case for a step up.",
  "Reserve game on a sparse ground. The low crowd makes individual effort even more visible.",
  "Under-23 fixture with a handful of coaches watching. Every player is auditioning.",
];

const TRAINING_VISIT_DESCRIPTIONS = [
  "Training session behind closed gates. No match pressure reveals technical habits unfiltered.",
  "Pre-season training open to scouts. Players work through structured drills with focused coaching.",
  "Quiet training visit — the absence of an audience strips away performance and exposes the real player.",
];

const TRIAL_MATCH_DESCRIPTIONS = [
  "A trial match where players know their careers may hinge on the next 90 minutes.",
  "High-stakes trial fixture — every player is performing for their professional future.",
  "Trial game with a knowledgeable crowd of scouts. The pressure is palpable from kick-off.",
];

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

/**
 * Creates a VenueAtmosphere for the given venue type.
 * Weather is randomly selected; description is drawn from a pool of variants.
 */
export function createVenueAtmosphere(venueType: string, rng: RNG): VenueAtmosphere {
  const weather = rng.pick(WEATHER_CONDITIONS) as WeatherCondition;

  switch (venueType) {
    case "schoolMatch":
      return {
        venueType,
        chaosLevel: 0.2,
        amplifiedAttributes: ["positioning", "teamwork", "offTheBall"],
        dampenedAttributes: ["dribbling", "pace"],
        weather,
        crowdIntensity: 0.3,
        description: rng.pick(SCHOOL_MATCH_DESCRIPTIONS),
      };

    case "grassrootsTournament":
      return {
        venueType,
        chaosLevel: 0.4,
        amplifiedAttributes: ["stamina", "workRate", "composure"],
        dampenedAttributes: [],
        weather,
        crowdIntensity: 0.5,
        description: rng.pick(GRASSROOTS_TOURNAMENT_DESCRIPTIONS),
      };

    case "streetFootball":
      return {
        venueType,
        chaosLevel: 0.7,
        amplifiedAttributes: ["dribbling", "firstTouch", "agility", "balance"],
        dampenedAttributes: ["positioning", "marking", "defensiveAwareness"],
        weather,
        crowdIntensity: 0.2,
        description: rng.pick(STREET_FOOTBALL_DESCRIPTIONS),
      };

    case "academyTrialDay":
      return {
        venueType,
        chaosLevel: 0.1,
        amplifiedAttributes: ["offTheBall", "pressing", "composure"],
        dampenedAttributes: ["leadership"],
        weather,
        crowdIntensity: 0.4,
        description: rng.pick(ACADEMY_TRIAL_DESCRIPTIONS),
      };

    case "youthFestival":
      return {
        venueType,
        chaosLevel: 0.3,
        amplifiedAttributes: ["composure", "anticipation", "bigGameTemperament"],
        dampenedAttributes: [],
        weather,
        crowdIntensity: 0.7,
        description: rng.pick(YOUTH_FESTIVAL_DESCRIPTIONS),
      };

    case "attendMatch": {
      // Weather-reactive amplification: rain highlights balance and agility,
      // clear conditions add no special signal — the match quality speaks.
      const weatherAmplified: PlayerAttribute[] =
        weather === "light_rain" || weather === "heavy_rain"
          ? ["balance", "agility"]
          : [];
      return {
        venueType,
        chaosLevel: 0.3,
        amplifiedAttributes: weatherAmplified,
        dampenedAttributes: [],
        weather,
        crowdIntensity: 0.8,
        description:
          weather === "heavy_rain"
            ? "A professional fixture played in heavy rain — conditions create an unplanned stress test."
            : weather === "light_rain"
            ? "A senior match under drizzle — the surface keeps every touch and movement honest."
            : "A professional fixture. High intensity and packed stands create the best observable conditions.",
      };
    }

    case "reserveMatch":
      return {
        venueType,
        chaosLevel: 0.2,
        amplifiedAttributes: ["stamina", "workRate"],
        dampenedAttributes: [],
        weather,
        crowdIntensity: 0.2,
        description: rng.pick(RESERVE_MATCH_DESCRIPTIONS),
      };

    case "trainingVisit":
      return {
        venueType,
        chaosLevel: 0.1,
        amplifiedAttributes: ["firstTouch", "passing", "offTheBall", "pressing", "vision"],
        dampenedAttributes: ["composure"],
        weather,
        crowdIntensity: 0.1,
        description: rng.pick(TRAINING_VISIT_DESCRIPTIONS),
      };

    case "trialMatch":
      return {
        venueType,
        chaosLevel: 0.3,
        amplifiedAttributes: ["composure", "bigGameTemperament"],
        dampenedAttributes: [],
        weather,
        crowdIntensity: 0.5,
        description: rng.pick(TRIAL_MATCH_DESCRIPTIONS),
      };

    case "scoutingMission": {
      // A broader mission across unfamiliar venues — amplification varies randomly
      // to reflect the unpredictable contexts a scout encounters.
      const missionAmplified = rng.pick<PlayerAttribute[]>([
        ["anticipation", "vision", "offTheBall"],
        ["stamina", "workRate", "composure"],
        ["dribbling", "agility", "firstTouch"],
        ["leadership", "bigGameTemperament", "professionalism"],
      ]);
      return {
        venueType,
        chaosLevel: 0.4,
        amplifiedAttributes: missionAmplified,
        dampenedAttributes: [],
        weather,
        crowdIntensity: 0.6,
        description:
          "A wide-ranging scouting mission across unfamiliar venues — conditions are variable and rewards go to the attentive eye.",
      };
    }

    default:
      return {
        venueType,
        chaosLevel: 0.3,
        amplifiedAttributes: [],
        dampenedAttributes: [],
        weather,
        crowdIntensity: 0.5,
        description: "Standard observation conditions with no notable atmospheric factors.",
      };
  }
}

// =============================================================================
// DYNAMIC EVENT GENERATION
// =============================================================================

/**
 * Attempts to generate a dynamic atmosphere event for a given session phase.
 * Returns null when no event fires (75% of the time).
 *
 * Event selection is shaped by the venue type and session progress — some
 * events are only plausible at youth venues, others only late in a match.
 */
export function generateAtmosphereEvent(
  rng: RNG,
  atmosphere: VenueAtmosphere,
  phaseIndex: number,
  totalPhases: number,
): AtmosphereEvent | null {
  // 25% base chance per phase
  if (!rng.chance(0.25)) {
    return null;
  }

  const progress = totalPhases > 1 ? phaseIndex / (totalPhases - 1) : 0;
  const isYouthVenue =
    atmosphere.venueType === "schoolMatch" ||
    atmosphere.venueType === "grassrootsTournament" ||
    atmosphere.venueType === "streetFootball" ||
    atmosphere.venueType === "academyTrialDay" ||
    atmosphere.venueType === "youthFestival";

  const isMatchVenue =
    atmosphere.venueType === "attendMatch" ||
    atmosphere.venueType === "reserveMatch" ||
    atmosphere.venueType === "trialMatch" ||
    atmosphere.venueType === "scoutingMission";

  const isTraining = atmosphere.venueType === "trainingVisit";

  // Build a weighted pool of candidate events based on context
  const candidates: Array<{ item: EventTemplate; weight: number }> = [];

  for (const template of EVENT_TEMPLATES) {
    let weight = 1;

    switch (template.id) {
      // Weather events become more likely when the atmosphere already has rain
      case "rain_starts":
        weight =
          atmosphere.weather === "overcast" || atmosphere.weather === "light_rain" ? 3 : 0.5;
        break;

      // Crowd events require meaningful crowd presence
      case "crowd_erupts":
        weight = atmosphere.crowdIntensity >= 0.5 ? 3 : 0.5;
        break;

      // Lopsided score is only plausible in a real competitive match
      case "lopsided_score":
        weight = isMatchVenue || isYouthVenue ? (progress >= 0.4 ? 2.5 : 0.5) : 0;
        break;

      // Parent interference is a youth-venue phenomenon
      case "parent_interference":
        weight = isYouthVenue ? 3 : 0;
        break;

      // Waterlogged pitch happens outdoors in wet conditions
      case "waterlogged_pitch":
        weight =
          atmosphere.weather === "light_rain" || atmosphere.weather === "heavy_rain" ? 2.5 : 0;
        break;

      // Altercations are more likely in high-chaos, high-stakes environments
      case "altercation":
        weight = atmosphere.chaosLevel >= 0.4 ? 2 : 0.5;
        break;

      // Late-arriving talent is plausible at youth festivals or trial days
      case "late_talent":
        weight =
          atmosphere.venueType === "youthFestival" ||
          atmosphere.venueType === "academyTrialDay" ||
          atmosphere.venueType === "grassrootsTournament"
            ? 2
            : 0.3;
        break;

      // Formation change requires a coach to be present and directing play
      case "formation_change":
        weight =
          isTraining ||
          atmosphere.venueType === "academyTrialDay" ||
          atmosphere.venueType === "trialMatch"
            ? 2.5
            : 0.5;
        break;

      // Injury stoppages can happen anywhere but are more disruptive in chaos
      case "injury_stoppage":
        weight = atmosphere.chaosLevel >= 0.5 ? 1.5 : 1.0;
        break;

      // Heavy fouls are more common in competitive or high-intensity venues
      case "heavy_foul":
        weight = isMatchVenue || atmosphere.venueType === "grassrootsTournament" ? 2 : 0.5;
        break;

      // Brilliant goals need a proper match context
      case "brilliant_goal":
        weight = isMatchVenue || isYouthVenue ? 1.5 : 0;
        break;

      // Wind gusts are more disruptive in exposed environments
      case "wind_gusts":
        weight =
          atmosphere.weather === "cold" || atmosphere.weather === "overcast" ? 2 : 0.5;
        break;

      // Referee chaos suits competitive environments with authority figures
      case "referee_chaos":
        weight = isMatchVenue ? 2 : isYouthVenue ? 1 : 0;
        break;

      // Crowded touchline suits high-profile matches and festivals
      case "crowded_touchline":
        weight =
          atmosphere.crowdIntensity >= 0.6 ||
          atmosphere.venueType === "academyTrialDay" ||
          atmosphere.venueType === "trialMatch"
            ? 2
            : 0.5;
        break;

      // Fast start is only interesting in the opening phases
      case "fast_start":
        weight = phaseIndex <= 1 ? 2.5 : 0;
        break;

      default:
        weight = 1;
    }

    if (weight > 0) {
      candidates.push({ item: template, weight });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  const chosen = rng.pickWeighted(candidates);

  return {
    id: `${chosen.id}_${phaseIndex}`,
    description: chosen.description,
    effect: chosen.effect,
    affectedAttributes:
      chosen.affectedAttributes && chosen.affectedAttributes.length > 0
        ? chosen.affectedAttributes
        : undefined,
    noiseDelta: chosen.noiseDelta,
  };
}

// =============================================================================
// NOISE MULTIPLIER
// =============================================================================

/**
 * Calculates the cumulative observation noise multiplier for the current state
 * of an observation session.
 *
 * Base: 1.0 + chaosLevel * 0.5
 * Each accumulated event adds its noiseDelta.
 * Result is clamped to [0.5, 2.0].
 */
export function getAtmosphereNoiseMultiplier(
  atmosphere: VenueAtmosphere,
  events: AtmosphereEvent[],
): number {
  const base = 1.0 + atmosphere.chaosLevel * 0.5;
  const eventDelta = events.reduce((sum, event) => sum + event.noiseDelta, 0);
  const raw = base + eventDelta;
  return Math.min(2.0, Math.max(0.5, raw));
}

// =============================================================================
// ATTRIBUTE SIGNAL HELPERS
// =============================================================================

/**
 * Returns true when the given attribute is in the atmosphere's amplified list.
 * Amplified attributes produce more accurate readings in this environment.
 */
export function isAttributeAmplified(
  atmosphere: VenueAtmosphere,
  attribute: PlayerAttribute,
): boolean {
  return atmosphere.amplifiedAttributes.includes(attribute);
}

/**
 * Returns true when the given attribute is in the atmosphere's dampened list.
 * Dampened attributes produce noisier, less reliable readings.
 */
export function isAttributeDampened(
  atmosphere: VenueAtmosphere,
  attribute: PlayerAttribute,
): boolean {
  return atmosphere.dampenedAttributes.includes(attribute);
}

/**
 * Returns the observation accuracy multiplier for a given attribute in this
 * atmosphere. Used by the perception engine to scale confidence on readings.
 *
 * - 1.3x for amplified attributes (environment highlights this quality)
 * - 0.7x for dampened attributes (environment obscures this quality)
 * - 1.0x otherwise (neutral observation conditions)
 */
export function getAmplificationMultiplier(
  atmosphere: VenueAtmosphere,
  attribute: PlayerAttribute,
): number {
  if (isAttributeAmplified(atmosphere, attribute)) return 1.3;
  if (isAttributeDampened(atmosphere, attribute)) return 0.7;
  return 1.0;
}
