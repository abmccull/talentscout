/**
 * Narrative event generation and processing.
 *
 * This module handles:
 *  1. Weekly event generation — ~5% chance per week, at most one event.
 *  2. Choice resolution — applying a player's response to an event.
 *  3. Query helpers — retrieving active (unacknowledged) events and marking
 *     events as acknowledged.
 *
 * All functions are pure: given the same inputs they produce the same outputs.
 * The RNG is the only source of non-determinism and it advances each call.
 */

import type {
  GameState,
  NarrativeEvent,
  NarrativeEventType,
  InboxMessage,
} from "@/engine/core/types";
import type { RNG } from "@/engine/rng";
import {
  EVENT_TEMPLATES,
  buildEventContext,
  extractRelatedIds,
} from "./eventTemplates";

// =============================================================================
// Constants
// =============================================================================

/** Probability that any given week produces a narrative event. */
const WEEKLY_EVENT_CHANCE = 0.05;

// =============================================================================
// Private helpers
// =============================================================================

/**
 * Generate a short random alphanumeric ID for a new narrative event.
 * Prefixed with "evt_" to make the entity type obvious in logs.
 */
function generateEventId(rng: RNG): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 12; i++) {
    id += chars[rng.nextInt(0, chars.length - 1)];
  }
  return `evt_${id}`;
}

/**
 * Generate a short random alphanumeric ID for a new inbox message.
 */
function generateMessageId(rng: RNG): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 12; i++) {
    id += chars[rng.nextInt(0, chars.length - 1)];
  }
  return `msg_${id}`;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Attempt to generate a narrative event for the current week.
 *
 * Algorithm:
 *  1. Roll the weekly trigger (5% chance). Return null on miss.
 *  2. Filter EVENT_TEMPLATES to those whose prerequisites are satisfied.
 *  3. If no templates pass, return null.
 *  4. Pick one template at random from the eligible pool.
 *  5. Build the event with contextual title/description/relatedIds.
 *
 * @param rng   - The shared PRNG instance (advances its internal state).
 * @param state - Current game state (read-only).
 * @returns A new NarrativeEvent, or null if no event fires this week.
 */
export function generateWeeklyEvent(
  rng: RNG,
  state: GameState,
): NarrativeEvent | null {
  // Step 1 — weekly trigger roll
  if (!rng.chance(WEEKLY_EVENT_CHANCE)) {
    return null;
  }

  // Step 2 — filter to eligible templates
  const eligible = EVENT_TEMPLATES.filter((t) => t.prerequisites(state));
  if (eligible.length === 0) {
    return null;
  }

  // Step 3 — pick a template
  const template = rng.pick(eligible);

  // Step 4 — build contextual content
  const ctx = buildEventContext(template.type, state);
  const relatedIds = extractRelatedIds(template.type, state);

  const event: NarrativeEvent = {
    id: generateEventId(rng),
    type: template.type,
    week: state.currentWeek,
    season: state.currentSeason,
    title: template.titleTemplate,
    description: template.descriptionTemplate(ctx),
    relatedIds,
    acknowledged: false,
    choices: template.choices ? [...template.choices] : undefined,
    selectedChoice: undefined,
  };

  return event;
}

// =============================================================================
// Choice resolution
// =============================================================================

/**
 * Describes the side-effects of resolving an event choice.
 */
export interface EventChoiceResult {
  /** The event with selectedChoice set to the chosen index. */
  updatedEvent: NarrativeEvent;
  /**
   * How much the scout's reputation changes as a result of this choice.
   * Positive = reputation gain, negative = reputation loss, 0 = no change.
   */
  reputationChange: number;
  /**
   * Any inbox messages generated to inform the player of downstream
   * consequences (e.g. "You rushed your report — it was accepted").
   */
  messages: InboxMessage[];
}

/**
 * Process a player's choice on a narrative event.
 *
 * Each event type maps its choices to specific effects:
 *  - reputationChange: how the choice affects the scout's global reputation
 *  - An optional follow-up inbox message narrating the outcome
 *
 * @param event       - The event on which the player made a choice.
 * @param choiceIndex - Zero-based index of the selected choice.
 * @param state       - Current game state (used to seed message context).
 * @param rng         - The shared PRNG (used for message ID generation).
 * @returns EventChoiceResult with the updated event and any side-effects.
 * @throws {RangeError} if choiceIndex is out of bounds.
 */
export function resolveEventChoice(
  event: NarrativeEvent,
  choiceIndex: number,
  state: GameState,
  rng: RNG,
): EventChoiceResult {
  if (!event.choices || event.choices.length === 0) {
    throw new RangeError(
      `resolveEventChoice: event ${event.id} has no choices`,
    );
  }
  if (choiceIndex < 0 || choiceIndex >= event.choices.length) {
    throw new RangeError(
      `resolveEventChoice: choiceIndex ${choiceIndex} out of bounds ` +
        `(event has ${event.choices.length} choices)`,
    );
  }

  const choice = event.choices[choiceIndex];
  const effect = choice.effect as EventEffect;

  const updatedEvent: NarrativeEvent = { ...event, selectedChoice: choiceIndex };
  const messages: InboxMessage[] = [];
  let reputationChange = 0;

  switch (event.type) {
    case "rivalPoach":
      reputationChange = resolveRivalPoachChoice(effect);
      messages.push(
        buildFollowUpMessage(
          rng,
          state,
          event,
          rivalPoachOutcomeBody(effect),
        ),
      );
      break;

    case "exclusiveTip":
      reputationChange = resolveExclusiveTipChoice(effect);
      messages.push(
        buildFollowUpMessage(
          rng,
          state,
          event,
          exclusiveTipOutcomeBody(effect),
        ),
      );
      break;

    case "rivalRecruitment":
      reputationChange = resolveRivalRecruitmentChoice(effect);
      messages.push(
        buildFollowUpMessage(
          rng,
          state,
          event,
          rivalRecruitmentOutcomeBody(effect),
        ),
      );
      break;

    // Events with no choices defined should never reach here, but handle
    // defensively so TypeScript exhaustiveness check is satisfied.
    case "managerFired":
    case "debutHatTrick":
    case "targetInjured":
    case "reportCitedInBoardMeeting":
    case "agentDeception":
      // No player choice for these event types.
      break;
  }

  return { updatedEvent, reputationChange, messages };
}

// ---------------------------------------------------------------------------
// Typed effect tags
// ---------------------------------------------------------------------------

/**
 * All effect strings used across event templates.
 * Using a union type lets TypeScript catch typos in the switch.
 */
type EventEffect =
  | "rushReport"
  | "ignore"
  | "investigate"
  | "engage"
  | "decline"
  | string; // fallback for any future template additions

// ---------------------------------------------------------------------------
// Per-type choice resolution helpers
// ---------------------------------------------------------------------------

function resolveRivalPoachChoice(effect: EventEffect): number {
  // rushReport: small reputation gain (shows decisiveness, meets deadline)
  // ignore: slight reputation dip (missed a window to assert your work)
  if (effect === "rushReport") return 3;
  if (effect === "ignore") return -1;
  return 0;
}

function rivalPoachOutcomeBody(effect: EventEffect): string {
  if (effect === "rushReport") {
    return (
      "You moved quickly and submitted your report ahead of the rival. " +
      "The club has acknowledged receipt and the player is now on their shortlist. " +
      "Your responsiveness didn't go unnoticed."
    );
  }
  return (
    "You elected not to rush. The rival scout submitted their report first, " +
    "and the club is now considering their recommendation. Your earlier " +
    "groundwork may still carry weight, but momentum is against you."
  );
}

function resolveExclusiveTipChoice(effect: EventEffect): number {
  // investigate: moderate gain — proactive, could unearth a gem
  // ignore: no change — safe but forgoes potential upside
  if (effect === "investigate") return 5;
  return 0;
}

function exclusiveTipOutcomeBody(effect: EventEffect): string {
  if (effect === "investigate") {
    return (
      "You followed up on the tip and spent time observing the player in " +
      "question. The contact's lead appears genuine — there's something worth " +
      "monitoring here. Add them to your watchlist and continue gathering data."
    );
  }
  return (
    "You decided the tip wasn't worth pursuing this week. The window to act " +
    "may have passed, but you've conserved your schedule for existing priorities."
  );
}

function resolveRivalRecruitmentChoice(effect: EventEffect): number {
  // engage: small gain (market value confirmed) but risks current employer trust
  // decline: no reputation change, but signals loyalty
  if (effect === "engage") return 4;
  if (effect === "decline") return 1;
  return 0;
}

function rivalRecruitmentOutcomeBody(effect: EventEffect): string {
  if (effect === "engage") {
    return (
      "You entered into exploratory conversations with the rival club. Word " +
      "travels fast in scouting circles and your market value is now evident " +
      "to all parties. Whether or not anything comes of it, your negotiating " +
      "position at your current employer has quietly improved."
    );
  }
  return (
    "You declined the approach with professionalism. The rival club respected " +
    "your loyalty, and your current employer's management took quiet note. " +
    "Trust is a currency that compounds over time."
  );
}

// ---------------------------------------------------------------------------
// Inbox message builder
// ---------------------------------------------------------------------------

function buildFollowUpMessage(
  rng: RNG,
  state: GameState,
  event: NarrativeEvent,
  body: string,
): InboxMessage {
  return {
    id: generateMessageId(rng),
    week: state.currentWeek,
    season: state.currentSeason,
    type: "event",
    title: `Follow-up: ${event.title}`,
    body,
    read: false,
    actionRequired: false,
    relatedId: event.id,
  };
}

// =============================================================================
// Query helpers
// =============================================================================

/**
 * Return all events that have not yet been acknowledged by the player.
 *
 * @param events - The full narrative event array from GameState.
 * @returns A filtered array containing only unacknowledged events.
 */
export function getActiveEvents(events: NarrativeEvent[]): NarrativeEvent[] {
  return events.filter((e) => !e.acknowledged);
}

/**
 * Return a new events array with the specified event marked as acknowledged.
 * Does not mutate the input array.
 *
 * @param events  - The full narrative event array from GameState.
 * @param eventId - ID of the event to acknowledge.
 * @returns A new array. The target event has acknowledged = true; all others
 *          are returned unchanged (same object reference).
 */
export function acknowledgeEvent(
  events: NarrativeEvent[],
  eventId: string,
): NarrativeEvent[] {
  return events.map((e) =>
    e.id === eventId ? { ...e, acknowledged: true } : e,
  );
}
