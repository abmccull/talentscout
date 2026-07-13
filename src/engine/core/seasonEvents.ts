/**
 * Season calendar events module.
 *
 * Provides pre-defined seasonal events that repeat each season (transfer
 * windows, international breaks, tournaments) and utility functions for
 * querying the event calendar. All functions are pure and deterministic —
 * no RNG is required because every event is fixed to known week ranges.
 */

import type {
  SeasonEvent,
  SeasonEventType,
  SeasonEventEffect,
  SeasonEventChoice,
  Specialization,
} from "./types";

// =============================================================================
// INTERNAL EVENT DEFINITIONS
// =============================================================================

/**
 * Raw descriptor used to build SeasonEvent objects without the ID, which is
 * computed from season + type + startWeek at generation time.
 */
interface EventDefinition {
  type: SeasonEventType;
  name: string;
  startWeek: number;
  endWeek: number;
  description: string;
  effects?: SeasonEventEffect[];
  choices?: SeasonEventChoice[];
  relevantSpecializations?: Specialization[];
}

/** Canonical authoring calendar. Definitions are scaled at runtime. */
export const AUTHORED_SEASON_LENGTH_WEEKS = 38;

function normalizeSeasonLength(seasonLength: number): number {
  return Number.isInteger(seasonLength) && seasonLength > 0
    ? seasonLength
    : AUTHORED_SEASON_LENGTH_WEEKS;
}

/** Map an authored 38-week event point onto the active competition calendar. */
export function scaleAuthoredSeasonWeek(
  authoredWeek: number,
  seasonLength = AUTHORED_SEASON_LENGTH_WEEKS,
): number {
  const targetLength = normalizeSeasonLength(seasonLength);
  const clampedAuthoredWeek = Math.max(
    1,
    Math.min(AUTHORED_SEASON_LENGTH_WEEKS, authoredWeek),
  );
  if (targetLength === 1) return 1;
  return Math.round(
    ((clampedAuthoredWeek - 1) * (targetLength - 1))
      / (AUTHORED_SEASON_LENGTH_WEEKS - 1),
  ) + 1;
}

/** Evenly spaced, de-duplicated labels for the rendered season timeline. */
export function getSeasonTimelineLabelWeeks(seasonLength: number): number[] {
  const targetLength = normalizeSeasonLength(seasonLength);
  return [...new Set([0, 0.25, 0.5, 0.75, 1].map((progress) => (
    Math.round(progress * (targetLength - 1)) + 1
  )))];
}

/** Percentage position of a week on a fixture-derived season timeline. */
export function getSeasonWeekProgressPercent(
  week: number,
  seasonLength: number,
): number {
  const finalWeek = normalizeSeasonLength(seasonLength);
  if (finalWeek === 1) return 0;
  const clampedWeek = Math.max(1, Math.min(finalWeek, week));
  return ((clampedWeek - 1) / (finalWeek - 1)) * 100;
}

/** Inclusive percentage width of an event segment on the season timeline. */
export function getSeasonSegmentWidthPercent(
  startWeek: number,
  endWeek: number,
  seasonLength: number,
): number {
  const finalWeek = normalizeSeasonLength(seasonLength);
  if (finalWeek === 1) return 100;
  const start = Math.max(1, Math.min(finalWeek, startWeek));
  const end = Math.max(start, Math.min(finalWeek, endWeek));
  return Math.min(100, ((end - start + 1) / (finalWeek - 1)) * 100);
}

/**
 * The canonical set of season events in week order.
 * Every entry maps to exactly one SeasonEvent per season.
 */
const EVENT_DEFINITIONS: readonly EventDefinition[] = [
  {
    type: "preSeasonTournament",
    name: "Pre-season Tournament",
    startWeek: 1,
    endWeek: 2,
    description: "Pre-season preparations and friendly tournaments",
    relevantSpecializations: ["firstTeam", "regional", "data"],
    effects: [
      { type: "scoutingCostModifier", value: -0.4, targetScope: "global" },
      { type: "attributeRevealBonus", value: 0.25, targetScope: "global" },
    ],
    choices: [
      {
        label: "Focus on Youth Prospects",
        description:
          "Concentrate scouting on youth tournaments for better reveals on young players.",
        effects: [
          { type: "scoutingCostModifier", value: -0.4, targetScope: "global" },
          { type: "attributeRevealBonus", value: 0.5, targetScope: "global" },
          { type: "fatigueModifier", value: 0.15, targetScope: "global" },
        ],
      },
      {
        label: "Network with Agents",
        description:
          "Use the tournament to build contacts rather than observe matches.",
        effects: [
          { type: "reputationBonus", value: 3, targetScope: "global" },
          { type: "scoutingCostModifier", value: -0.2, targetScope: "global" },
        ],
      },
    ],
  },
  {
    type: "summerTransferWindow",
    name: "Summer Transfer Window",
    startWeek: 1,
    endWeek: 8,
    description: "Summer transfer window is open — panic pricing in final weeks",
    relevantSpecializations: ["firstTeam", "regional", "data"],
    effects: [
      { type: "transferPriceModifier", value: 0.0, targetScope: "global" },
    ],
    choices: [
      {
        label: "Aggressive Scouting Push",
        description:
          "Double down on scouting to find bargains before the window closes.",
        effects: [
          { type: "scoutingCostModifier", value: -0.2, targetScope: "global" },
          { type: "fatigueModifier", value: 0.2, targetScope: "global" },
        ],
      },
      {
        label: "Wait for Deadline Deals",
        description:
          "Hold resources until panic pricing kicks in late in the window.",
        effects: [
          { type: "transferPriceModifier", value: -0.15, targetScope: "global" },
        ],
      },
    ],
  },
  {
    type: "transferDeadlineDrama",
    name: "Transfer Deadline Drama",
    startWeek: 5,
    endWeek: 5,
    description:
      "Last-minute deals create inflated prices as clubs scramble to complete signings before the window shuts",
  },
  {
    type: "earlySeasonAssessment",
    name: "Early Season Assessment",
    startWeek: 9,
    endWeek: 9,
    description:
      "Clubs assess early results — reputation rewards for accurate predictions on player form",
    effects: [
      { type: "reputationBonus", value: 2, targetScope: "global" },
      { type: "attributeRevealBonus", value: 0.15, targetScope: "global" },
    ],
  },
  {
    type: "internationalBreak",
    name: "International Break 1",
    startWeek: 10,
    endWeek: 10,
    description:
      "First international break — players called up are unavailable for club matches",
    effects: [
      { type: "playerAvailability", value: -0.15, targetScope: "global" },
      { type: "attributeRevealBonus", value: 0.2, targetScope: "global" },
      { type: "fatigueModifier", value: -0.1, targetScope: "global" },
    ],
  },
  {
    type: "midSeasonFormCheck",
    name: "Mid-Season Form Check",
    startWeek: 12,
    endWeek: 12,
    description:
      "Clubs assess scouting department performance at the halfway mark of the first half",
  },
  {
    type: "domesticCupRounds",
    name: "Domestic Cup Rounds",
    startWeek: 13,
    endWeek: 14,
    description:
      "Cup matches offer lower-pressure observation opportunities with increased youth squad rotation",
    effects: [
      { type: "youthIntake", value: 0.3, targetScope: "global" },
      { type: "scoutingCostModifier", value: -0.15, targetScope: "global" },
    ],
    choices: [
      {
        label: "Focus on Cup Upsets",
        description:
          "Scout cup underdogs for hidden gems performing above their level.",
        effects: [
          { type: "attributeRevealBonus", value: 0.3, targetScope: "global" },
          { type: "youthIntake", value: 0.4, targetScope: "global" },
        ],
      },
      {
        label: "Maintain League Focus",
        description:
          "Ignore the cup distraction and stay focused on league talent.",
        effects: [
          { type: "reputationBonus", value: 2, targetScope: "global" },
          { type: "scoutingCostModifier", value: -0.1, targetScope: "global" },
        ],
      },
    ],
  },
  {
    type: "injuryCrisisPeriod",
    name: "Injury Crisis Period",
    startWeek: 15,
    endWeek: 15,
    description:
      "Fixture congestion leads to higher injury rates across all leagues, affecting player availability",
  },
  {
    type: "fixtureCongestion",
    name: "Fixture Congestion",
    startWeek: 16,
    endWeek: 17,
    description:
      "Heavy schedule means more matches to scout but higher fatigue risk for your team",
    effects: [
      { type: "fatigueModifier", value: 0.15, targetScope: "global" },
      { type: "attributeRevealBonus", value: 0.2, targetScope: "global" },
    ],
    choices: [
      {
        label: "Double Down on Scouting",
        description:
          "Take advantage of the packed schedule to observe more players.",
        effects: [
          { type: "attributeRevealBonus", value: 0.35, targetScope: "global" },
          { type: "fatigueModifier", value: 0.3, targetScope: "global" },
        ],
      },
      {
        label: "Rotate and Rest",
        description:
          "Manage fatigue by attending fewer matches this period.",
        effects: [
          { type: "fatigueModifier", value: -0.1, targetScope: "global" },
        ],
      },
    ],
  },
  {
    type: "internationalBreak",
    name: "International Break 2",
    startWeek: 18,
    endWeek: 18,
    description:
      "Second international break — opportunity to scout international talent",
    effects: [
      { type: "playerAvailability", value: -0.15, targetScope: "global" },
      { type: "attributeRevealBonus", value: 0.2, targetScope: "global" },
      { type: "fatigueModifier", value: -0.1, targetScope: "global" },
    ],
    choices: [
      {
        label: "Scout International Matches",
        description:
          "Travel to international venues for higher-quality observations.",
        effects: [
          { type: "attributeRevealBonus", value: 0.4, targetScope: "global" },
          { type: "scoutingCostModifier", value: 0.3, targetScope: "global" },
          { type: "fatigueModifier", value: 0.1, targetScope: "global" },
        ],
      },
      {
        label: "Rest and Prepare",
        description:
          "Use the break to recover fatigue and prepare for the second half.",
        effects: [
          { type: "fatigueModifier", value: -0.3, targetScope: "global" },
        ],
      },
    ],
  },
  {
    type: "midSeasonReview",
    name: "Mid-Season Review",
    startWeek: 19,
    endWeek: 19,
    description:
      "Board evaluates the scouting department at the halfway point of the season",
    effects: [
      { type: "reputationBonus", value: 3, targetScope: "global" },
    ],
  },
  {
    type: "winterTransferWindow",
    name: "Winter Transfer Window",
    startWeek: 20,
    endWeek: 23,
    description:
      "January transfer window — mid-season transfers, loan recalls, desperation deals",
    relevantSpecializations: ["firstTeam", "regional", "data"],
    effects: [
      { type: "transferPriceModifier", value: -0.15, targetScope: "global" },
    ],
    choices: [
      {
        label: "Target Relegation Clubs",
        description:
          "Focus on players from struggling clubs willing to sell cheap.",
        effects: [
          { type: "transferPriceModifier", value: -0.25, targetScope: "global" },
          { type: "scoutingCostModifier", value: 0.1, targetScope: "global" },
        ],
      },
      {
        label: "Loan Market Sweep",
        description:
          "Identify loan opportunities from top-flight clubs with surplus talent.",
        effects: [
          { type: "transferPriceModifier", value: -0.1, targetScope: "global" },
          { type: "attributeRevealBonus", value: 0.15, targetScope: "global" },
        ],
      },
    ],
  },
  {
    type: "januaryWindowFrenzy",
    name: "January Window Frenzy",
    startWeek: 25,
    endWeek: 25,
    description:
      "Clubs desperate after a poor first half look to sell, creating opportunities for shrewd scouts",
  },
  {
    type: "relegationBattle",
    name: "Relegation Battle",
    startWeek: 26,
    endWeek: 27,
    description:
      "Bottom clubs grow desperate and are willing to sell at a discount, creating bargain opportunities",
    effects: [
      { type: "transferPriceModifier", value: -0.2, targetScope: "global" },
      { type: "scoutingCostModifier", value: 0.1, targetScope: "global" },
    ],
    choices: [
      {
        label: "Target Distressed Clubs",
        description:
          "Focus scouting on relegation-threatened clubs for bargain signings.",
        effects: [
          { type: "transferPriceModifier", value: -0.35, targetScope: "global" },
          { type: "scoutingCostModifier", value: 0.15, targetScope: "global" },
        ],
      },
      {
        label: "Focus on Emerging Talent",
        description:
          "Look for young players breaking through in the relegation fight.",
        effects: [
          { type: "youthIntake", value: 0.3, targetScope: "global" },
          { type: "attributeRevealBonus", value: 0.2, targetScope: "global" },
        ],
      },
    ],
  },
  {
    type: "internationalBreak",
    name: "International Break 3",
    startWeek: 28,
    endWeek: 28,
    description: "Third international break of the season",
    effects: [
      { type: "playerAvailability", value: -0.15, targetScope: "global" },
      { type: "attributeRevealBonus", value: 0.2, targetScope: "global" },
      { type: "fatigueModifier", value: -0.1, targetScope: "global" },
    ],
  },
  {
    type: "europeanQuarterFinals",
    name: "European Quarter-Finals",
    startWeek: 29,
    endWeek: 29,
    description:
      "Continental competition creates high-profile scouting opportunities against elite opposition",
    effects: [
      { type: "attributeRevealBonus", value: 0.3, targetScope: "global" },
      { type: "scoutingCostModifier", value: 0.2, targetScope: "global" },
    ],
    choices: [
      {
        label: "Attend European Matches",
        description:
          "Scout elite European fixtures for top-tier talent assessment.",
        effects: [
          { type: "attributeRevealBonus", value: 0.5, targetScope: "global" },
          { type: "scoutingCostModifier", value: 0.35, targetScope: "global" },
        ],
      },
      {
        label: "Scout Domestic Underdogs",
        description:
          "While rivals focus on Europe, find domestic talent with less competition.",
        effects: [
          { type: "scoutingCostModifier", value: -0.15, targetScope: "global" },
          { type: "reputationBonus", value: 2, targetScope: "global" },
        ],
      },
    ],
  },
  {
    type: "youthCup",
    name: "Youth Cup",
    startWeek: 30,
    endWeek: 33,
    description:
      "Youth cup tournament in progress — increased youth prospect visibility",
    effects: [
      { type: "youthIntake", value: 0.5, targetScope: "global" },
      { type: "attributeRevealBonus", value: 0.3, targetScope: "global" },
    ],
    choices: [
      {
        label: "Dedicate to Youth Scouting",
        description:
          "Send all resources to the youth cup for maximum prospect evaluation.",
        effects: [
          { type: "youthIntake", value: 0.75, targetScope: "global" },
          { type: "attributeRevealBonus", value: 0.5, targetScope: "global" },
          { type: "fatigueModifier", value: 0.15, targetScope: "global" },
        ],
      },
      {
        label: "Balanced Approach",
        description:
          "Attend some youth cup matches while maintaining regular scouting duties.",
        effects: [
          { type: "youthIntake", value: 0.3, targetScope: "global" },
          { type: "attributeRevealBonus", value: 0.2, targetScope: "global" },
        ],
      },
    ],
  },
  {
    type: "springRevival",
    name: "Spring Revival",
    startWeek: 31,
    endWeek: 31,
    description:
      "Promotion and relegation battles intensify as players give everything, boosting scouting accuracy",
  },
  {
    type: "titleRacePressure",
    name: "Title Race Pressure",
    startWeek: 35,
    endWeek: 35,
    description:
      "Top clubs ramp up recruitment planning for the summer, increasing urgency and reputation rewards",
  },
  {
    type: "seasonAwardsBuildUp",
    name: "Season Awards Build-Up",
    startWeek: 37,
    endWeek: 37,
    description:
      "Awards season creates media attention, boosting the profile of discovered wonderkids and scout visibility",
  },
  {
    type: "endOfSeasonReview",
    name: "End-of-Season Review",
    startWeek: 38,
    endWeek: 38,
    description:
      "Season review and contract renewals — board evaluation affects reputation",
    effects: [
      { type: "reputationBonus", value: 5, targetScope: "global" },
    ],
    choices: [
      {
        label: "Highlight Discoveries",
        description:
          "Present your best finds to the board for a reputation boost.",
        effects: [
          { type: "reputationBonus", value: 10, targetScope: "global" },
        ],
      },
      {
        label: "Negotiate Better Resources",
        description:
          "Use your track record to secure reduced scouting costs next season.",
        effects: [
          { type: "reputationBonus", value: 3, targetScope: "global" },
          { type: "scoutingCostModifier", value: -0.2, targetScope: "global" },
        ],
      },
    ],
  },
] as const;

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Generate the full list of pre-defined season events for a given season year.
 *
 * Each event receives a deterministic unique ID in the form
 * `se_<season>_<type>_<startWeek>`. Because multiple international breaks
 * share the same `type` value, the `startWeek` ensures uniqueness within a
 * season.
 *
 * @param season - The season year, e.g. 2024.
 * @returns An ordered array of SeasonEvent objects, sorted by startWeek.
 */
export function generateSeasonEvents(
  season: number,
  seasonLength = AUTHORED_SEASON_LENGTH_WEEKS,
): SeasonEvent[] {
  const targetLength = normalizeSeasonLength(seasonLength);
  return EVENT_DEFINITIONS.map((def): SeasonEvent => {
    const startWeek = scaleAuthoredSeasonWeek(def.startWeek, targetLength);
    const endWeek = Math.max(
      startWeek,
      scaleAuthoredSeasonWeek(def.endWeek, targetLength),
    );
    return {
      id: `se_${season}_${def.type}_${startWeek}`,
      type: def.type,
      name: def.name,
      startWeek,
      endWeek,
      description: def.description,
      effects: def.effects ? [...def.effects] : undefined,
      choices: def.choices
        ? def.choices.map((c) => ({
            label: c.label,
            description: c.description,
            effects: [...c.effects],
          }))
        : undefined,
      relevantSpecializations: def.relevantSpecializations
        ? [...def.relevantSpecializations]
        : undefined,
      resolved: false,
    };
  });
}

/**
 * Return every event from `events` that is currently active, i.e. where
 * `startWeek <= currentWeek <= endWeek`.
 *
 * @param events     - The full season event list (from generateSeasonEvents).
 * @param currentWeek - The week to test against.
 * @returns A (possibly empty) array of active SeasonEvent objects.
 */
export function getActiveSeasonEvents(
  events: SeasonEvent[],
  currentWeek: number,
): SeasonEvent[] {
  return events.filter(
    (event) => event.startWeek <= currentWeek && currentWeek <= event.endWeek,
  );
}

/**
 * Return every event that starts within the next `lookahead` weeks (exclusive
 * of the current week itself, i.e. `currentWeek < startWeek <= currentWeek + lookahead`).
 *
 * @param events      - The full season event list.
 * @param currentWeek - The reference week.
 * @param lookahead   - Number of weeks to look ahead.
 * @returns Events ordered by startWeek ascending.
 */
export function getUpcomingSeasonEvents(
  events: SeasonEvent[],
  currentWeek: number,
  lookahead: number,
): SeasonEvent[] {
  return events.filter(
    (event) =>
      event.startWeek > currentWeek &&
      event.startWeek <= currentWeek + lookahead,
  );
}

/**
 * Return true if any event with type `"internationalBreak"` is active during
 * `currentWeek`.
 *
 * @param events      - The full season event list.
 * @param currentWeek - The week to test.
 */
export function isInternationalBreak(
  events: SeasonEvent[],
  currentWeek: number,
): boolean {
  return events.some(
    (event) =>
      event.type === "internationalBreak" &&
      event.startWeek <= currentWeek &&
      currentWeek <= event.endWeek,
  );
}

/**
 * Determine the broad phase of the season based on the current week.
 *
 * Canonical 38-week authoring boundaries, proportionally scaled at runtime:
 *  - Weeks  1– 4 → "preseason"
 *  - Weeks  5–15 → "earlyseason"
 *  - Weeks 16–28 → "midseason"
 *  - Weeks 29–36 → "lateseason"
 *  - Weeks 37–38 → "endseason"
 *
 * @param currentWeek - The week number on the active fixture-derived calendar.
 * @param seasonLength - Active fixture-derived season length.
 */
export function getSeasonPhase(
  currentWeek: number,
  seasonLength = AUTHORED_SEASON_LENGTH_WEEKS,
): "preseason" | "earlyseason" | "midseason" | "lateseason" | "endseason" {
  const targetLength = normalizeSeasonLength(seasonLength);
  const week = Math.max(1, Math.min(targetLength, currentWeek));
  if (week <= scaleAuthoredSeasonWeek(4, targetLength)) {
    return "preseason";
  }
  if (week <= scaleAuthoredSeasonWeek(15, targetLength)) {
    return "earlyseason";
  }
  if (week <= scaleAuthoredSeasonWeek(28, targetLength)) {
    return "midseason";
  }
  if (week <= scaleAuthoredSeasonWeek(36, targetLength)) {
    return "lateseason";
  }
  return "endseason";
}
