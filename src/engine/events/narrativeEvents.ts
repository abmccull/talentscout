/**
 * Narrative event generation and processing.
 *
 * This module handles:
 *  1. Weekly event generation — ~12% chance per week, at most one event,
 *     with a 2-week cooldown and specialization-based weighting.
 *  2. Choice resolution — applying a player's response to an event,
 *     including concrete fatigue and reputation changes.
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
  Specialization,
  ChainConsequence,
} from "@/engine/core/types";
import type { RNG } from "@/engine/rng";
import {
  EVENT_TEMPLATES,
  buildEventContext,
  extractRelatedIds,
  type EventTemplate,
} from "./eventTemplates";
import {
  checkPendingChains,
  advanceChain,
  tryTriggerChain,
  CHAIN_TRIGGER_CHANCE,
} from "./eventChains";
import type { ChainStartResult, ChainAdvanceResult } from "./eventChains";

// =============================================================================
// Constants
// =============================================================================

/** Probability that any given week produces a narrative event (base rate). */
const WEEKLY_EVENT_CHANCE = 0.12;

/**
 * Minimum number of weeks between any two narrative events.
 * If an event fired within this many weeks, no new event is generated.
 */
const EVENT_COOLDOWN_WEEKS = 2;

/**
 * Multiplier applied to the weight of events that match the scout's
 * primary specialization.  Higher values make specialization more deterministic.
 */
const SPECIALIZATION_WEIGHT_MULTIPLIER = 2;

// =============================================================================
// Specialization weight map
// =============================================================================

/**
 * Maps each NarrativeEventType to zero or more Specialization tags.
 * If the scout's primarySpecialization appears in the set, the event's
 * selection weight is doubled.
 */
const SPECIALIZATION_EVENT_MAP: Partial<
  Record<NarrativeEventType, Specialization[]>
> = {
  // Youth-specialist events
  wonderkidPressure: ["youth"],
  youthProdigyDilemma: ["youth"],
  debutBrilliance: ["youth"],
  youthAcademyScandal: ["youth"],
  playerHomesick: ["youth"],

  // First-team specialist events
  injurySetback: ["firstTeam"],
  playerControversy: ["firstTeam"],
  rivalClubPoach: ["firstTeam"],
  boardroomCoup: ["firstTeam"],
  managerSacked: ["firstTeam"],
  reportCitedInBoardMeeting: ["firstTeam"],

  // Regional specialist events
  internationalTournament: ["regional"],
  contactBetrayal: ["regional"],
  networkExpansion: ["regional"],
  contactRetirement: ["regional"],
  exclusiveAccess: ["regional"],

  // Data specialist events
  dataRevolution: ["data"],
  lateBloomingSurprise: ["data"],
  hiddenGemVindication: ["data"],
  transferRuleChange: ["data"],
  financialFairPlayImpact: ["data"],

  // Cross-specialization events (relevant to any scout)
  burnout: ["youth", "firstTeam", "regional", "data"],
  scoutingConference: ["youth", "firstTeam", "regional", "data"],
  scoutingAwardNomination: ["youth", "firstTeam", "regional", "data"],
};

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

/**
 * Return the week number of the most recently fired narrative event,
 * or -Infinity if no events have occurred yet.
 */
function mostRecentEventWeek(state: GameState): number {
  if (state.narrativeEvents.length === 0) return -Infinity;
  return Math.max(...state.narrativeEvents.map((e) => e.week));
}

/**
 * Compute a selection weight for a template given the scout's specialization.
 * Events matching the specialization are twice as likely to be chosen.
 */
function templateWeight(
  template: EventTemplate,
  specialization: Specialization,
): number {
  const relevant = SPECIALIZATION_EVENT_MAP[template.type];
  if (relevant && relevant.includes(specialization)) {
    return SPECIALIZATION_WEIGHT_MULTIPLIER;
  }
  return 1;
}

/**
 * Pick a template from the eligible pool using specialization-weighted
 * random selection.  Falls back to a uniform random pick if all weights are 1.
 *
 * @param rng           - Shared PRNG instance.
 * @param eligible      - Templates that passed prerequisite checks.
 * @param specialization - Scout's primary specialization.
 */
function pickWeightedTemplate(
  rng: RNG,
  eligible: EventTemplate[],
  specialization: Specialization,
): EventTemplate {
  const weights = eligible.map((t) => templateWeight(t, specialization));
  const totalWeight = weights.reduce((acc, w) => acc + w, 0);

  let roll = rng.nextInt(0, totalWeight - 1);
  for (let i = 0; i < eligible.length; i++) {
    roll -= weights[i];
    if (roll < 0) return eligible[i];
  }

  // Fallback (should not be reached)
  return eligible[eligible.length - 1];
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Result of the weekly event generation, including chain state changes.
 */
export interface WeeklyEventResult {
  /** The narrative event generated (chain continuation or standalone). */
  event: NarrativeEvent | null;
  /** If a chain was advanced, the updated chain. */
  advancedChain?: ChainAdvanceResult;
  /** If a new chain was started, the chain start result. */
  newChain?: ChainStartResult;
}

/**
 * Attempt to generate a narrative event for the current week.
 *
 * Algorithm:
 *  0. (F2) Check pending chains first — chain continuations take priority
 *     and fire deterministically (bypass the 12% roll).
 *  1. Roll the weekly trigger (12% chance). Return null on miss.
 *  2. Check cooldown — if an event fired within the last 2 weeks, skip.
 *  3. Filter EVENT_TEMPLATES to those whose prerequisites are satisfied.
 *  4. If no templates pass, return null.
 *  5. Pick one template using specialization-weighted random selection.
 *  6. Build the event with contextual title/description/relatedIds.
 *  7. (F2) 10% chance the event spawns a new chain instead of firing standalone.
 *
 * @param rng   - The shared PRNG instance (advances its internal state).
 * @param state - Current game state (read-only).
 * @returns A WeeklyEventResult with event and optional chain updates.
 */
export function generateWeeklyEvent(
  rng: RNG,
  state: GameState,
): WeeklyEventResult {
  // Step 0 (F2) — prioritize pending chain continuations.
  // Chain events bypass the weekly roll and cooldown.
  const pendingChains = checkPendingChains(state);
  if (pendingChains.length > 0) {
    const chain = pendingChains[0]; // advance the first due chain
    const result = advanceChain(rng, state, chain);
    if (result.event) {
      return {
        event: result.event,
        advancedChain: result,
      };
    }
  }

  // Step 1 — weekly trigger roll
  if (!rng.chance(WEEKLY_EVENT_CHANCE)) {
    return { event: null };
  }

  // Step 2 — cooldown check
  const lastWeek = mostRecentEventWeek(state);
  if (state.currentWeek - lastWeek < EVENT_COOLDOWN_WEEKS) {
    return { event: null };
  }

  // Step 3 (F2) — 10% chance to trigger a new chain instead of a standalone event
  if (rng.chance(CHAIN_TRIGGER_CHANCE)) {
    const chainResult = tryTriggerChain(rng, state);
    if (chainResult) {
      return {
        event: chainResult.event,
        newChain: chainResult,
      };
    }
  }

  // Step 4 — filter to eligible templates
  const eligible = EVENT_TEMPLATES.filter((t) => t.prerequisites(state));
  if (eligible.length === 0) {
    return { event: null };
  }

  // Step 5 — pick a template with specialization weighting
  const template = pickWeightedTemplate(
    rng,
    [...eligible],
    state.scout.primarySpecialization,
  );

  // Step 6 — build contextual content
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

  return { event };
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
   * How much the scout's fatigue changes as a result of this choice.
   * Positive = more fatigue, negative = fatigue reduced.
   */
  fatigueChange: number;
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
 *  - fatigueChange: how the choice affects the scout's fatigue level
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
  let fatigueChange = 0;

  switch (event.type) {
    // -------------------------------------------------------------------------
    // Original event choice handlers
    // -------------------------------------------------------------------------

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

    case "rivalPoachBid":
      reputationChange = resolveRivalPoachBidChoice(effect);
      messages.push(
        buildFollowUpMessage(
          rng,
          state,
          event,
          rivalPoachBidOutcomeBody(effect),
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

    // -------------------------------------------------------------------------
    // Scout Personal Life choice handlers
    // -------------------------------------------------------------------------

    case "burnout":
      if (effect === "burnoutRest") {
        fatigueChange = -30;
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "You took the difficult decision to step back for a week. Rest, " +
            "proper meals, and distance from match footage have done their work — " +
            "your mind feels sharper and your notes more precise. Sometimes the " +
            "most productive thing a scout can do is stop.",
          ),
        );
      } else {
        // burnoutPush
        fatigueChange = 10;
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "You pushed through the fatigue and completed the week's schedule. " +
            "The determination is admirable, but the quality of your observations " +
            "has suffered and you can feel it. The body's warning lights are still " +
            "flashing. Next week, you may not have the same choice.",
          ),
        );
      }
      break;

    case "familyEmergency":
      if (effect === "familyRushHome") {
        fatigueChange = -10;
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "You dropped everything and went home. It was the right call — the " +
            "professional world forgives absences when the reasons are genuine, " +
            "and the people who matter to you needed you there. You'll return to " +
            "the work refreshed in a way that no rest week could have achieved.",
          ),
        );
      } else {
        // familyStayFocused
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "You stayed and completed your commitments. The professional in you " +
            "handled the week competently, but a quieter part of you knows the " +
            "cost. The situation at home has been managed from a distance. You'll " +
            "need to find a way to make up for the time.",
          ),
        );
      }
      break;

    case "scoutingConference":
      if (effect === "conferenceAttend") {
        reputationChange = 2;
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "The conference exceeded expectations. Conversations over coffee " +
            "with heads of recruitment from three different countries have given " +
            "you a richer sense of how the best departments operate. Your presence " +
            "also put your name in front of people who matter. A week well spent.",
          ),
        );
      } else {
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "You declined and directed the week toward active scouting instead. " +
            "A pragmatic choice — there will be other conferences, and you had " +
            "players to assess. The work in the stands is always the work.",
          ),
        );
      }
      break;

    case "mentorOffer":
      if (effect === "mentorAccept") {
        reputationChange = 1;
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "You accepted the offer with genuine gratitude. Your first " +
            "conversation with the veteran lasted three hours and covered more " +
            "ground than months of self-study. The relationship has begun — and " +
            "the wisdom on offer is considerable.",
          ),
        );
      } else {
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "You declined politely, citing your current commitments. The veteran " +
            "understood — they've been where you are. The door may not stay " +
            "open indefinitely, but you've kept it ajar.",
          ),
        );
      }
      break;

    case "mediaInterview":
      if (effect === "interviewAccept") {
        reputationChange = 3;
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "The piece ran this week to a positive reception. Your methodology " +
            "came across as rigorous and your track record spoke for itself. A " +
            "handful of club directors have already made enquiries. Public " +
            "profile, handled carefully, can open doors that quiet work alone " +
            "cannot.",
          ),
        );
      } else {
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "You declined the interview. Your work continues to speak for itself " +
            "without the media spotlight. Some of the best scouts in the game are " +
            "names the public has never heard — and they prefer it that way.",
          ),
        );
      }
      break;

    // -------------------------------------------------------------------------
    // Club Drama choice handlers
    // -------------------------------------------------------------------------

    case "scoutingDeptRestructure":
      if (effect === "restructureAccept") {
        reputationChange = 1;
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "You embraced the new structure and positioned yourself as a " +
            "bridge between traditional and analytical approaches. Management " +
            "has noticed your adaptability. There's a long way to go, but " +
            "you're starting the transition from a position of relative strength.",
          ),
        );
      } else {
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "You made your reservations known through the appropriate channels. " +
            "The restructure is proceeding regardless, but management is aware " +
            "of your perspective. Navigate carefully — institutional resistance " +
            "has limits.",
          ),
        );
      }
      break;

    case "rivalClubPoach":
      if (effect === "poachNegotiate") {
        reputationChange = 2;
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "You used the rival's interest as leverage in a frank conversation " +
            "with your director. The conversation was uncomfortable, but by the " +
            "end your current terms have improved. The information asymmetry of " +
            "knowing you're valued elsewhere is a useful thing to carry.",
          ),
        );
      } else if (effect === "poachAccept") {
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "You've indicated interest in the rival's offer. The process now " +
            "enters a more formal phase. This is a significant career juncture — " +
            "handle the transition with the same professionalism you'd want " +
            "from anyone moving on from your department.",
          ),
        );
      } else {
        // poachStayLoyal
        reputationChange = 3;
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "You declined firmly and your current employer has quietly been " +
            "informed of your loyalty. Trust is the currency that matters most " +
            "in this industry, and yours has just appreciated considerably.",
          ),
        );
      }
      break;

    // -------------------------------------------------------------------------
    // Player Stories choice handlers
    // -------------------------------------------------------------------------

    case "playerHomesick":
      if (effect === "homesickVisit") {
        reputationChange = 1;
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "You made the trip and spent an afternoon with the player. The " +
            "conversation was simple but it mattered — they needed to know " +
            "that someone in the organisation genuinely cared. Their form " +
            "this week was noticeably improved. Small gestures compound.",
          ),
        );
      } else {
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "You decided to let the player find their feet independently. " +
            "Some adapt better without intervention. Time will tell whether " +
            "this was the right call.",
          ),
        );
      }
      break;

    case "playerControversy":
      if (effect === "controversyStandBy") {
        reputationChange = 2;
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "You stood by your assessment publicly, citing the thoroughness " +
            "of your due diligence and the distinction between off-field conduct " +
            "and professional ability. The football world has taken note. " +
            "Conviction under pressure is a rare quality.",
          ),
        );
      } else {
        reputationChange = -1;
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "You quietly distanced yourself from the report. The move didn't " +
            "go unnoticed — your credibility on character assessment has taken " +
            "a small hit among those who knew your original position. It may " +
            "pass in time.",
          ),
        );
      }
      break;

    case "youthProdigyDilemma":
      if (effect === "prodigyOwnClub") {
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "You recommended the player to your own club. Whether it's the " +
            "best fit for the youngster's development only time will tell — " +
            "but it's the decision that serves your professional interests in " +
            "the most direct way.",
          ),
        );
      } else if (effect === "prodigyBestFit") {
        reputationChange = 2;
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "You put the player's development ahead of your club's interests " +
            "and recommended the environment where they'll genuinely thrive. " +
            "The family was grateful. Your reputation as someone who truly " +
            "cares about the players themselves has quietly grown.",
          ),
        );
      } else {
        // prodigyNeutral
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "You presented the options honestly and let the family decide. " +
            "A measured position that keeps all doors open for now.",
          ),
        );
      }
      break;

    // -------------------------------------------------------------------------
    // Network Events choice handlers
    // -------------------------------------------------------------------------

    case "contactBetrayal":
      if (effect === "betrayalConfront") {
        reputationChange = 2;
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "You confronted them directly. The conversation was uncomfortable " +
            "but necessary — they knew you knew, and the relationship has been " +
            "severed cleanly. Word has spread in certain circles that you " +
            "don't tolerate duplicity quietly. That reputation has value.",
          ),
        );
      } else {
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "You kept the knowledge to yourself and began feeding the contact " +
            "selectively curated information. They don't know you know. The " +
            "situation may yet work to your advantage.",
          ),
        );
      }
      break;

    case "exclusiveAccess":
      if (effect === "accessAttend") {
        reputationChange = 1;
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "The morning at the training ground was worth every hour. You saw " +
            "things in three players that no amount of match footage could have " +
            "revealed — personality under fatigue, response to coaching feedback, " +
            "the way they interact with teammates. Your notebook is full.",
          ),
        );
      } else {
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "You passed on the session this time. The contact understood — they " +
            "know you're thorough about your schedule. The relationship is intact " +
            "and the offer may come again.",
          ),
        );
      }
      break;

    case "agentDoubleDealing":
      if (effect === "doubleDealExpose") {
        reputationChange = 2;
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "You reported the agent's conduct through the appropriate channels. " +
            "The professional football community is small and long-memoried — " +
            "your reputation for integrity has been quietly noted by several " +
            "people who'll remember it when it matters.",
          ),
        );
      } else {
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "You kept the intelligence and used it to navigate the negotiation " +
            "more advantageously than the agent anticipated. Sometimes the most " +
            "professional response is simply to play the game better.",
          ),
        );
      }
      break;

    case "journalistExpose":
      if (effect === "journalistCooperate") {
        reputationChange = 2;
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "The article ran and your contribution shaped the framing " +
            "meaningfully. The portrayal of your methods was fair and detailed. " +
            "Several people in the game have mentioned reading it. Public " +
            "credibility, carefully managed, has a long tail.",
          ),
        );
      } else {
        messages.push(
          buildFollowUpMessage(
            rng,
            state,
            event,
            "You declined the interview. The article ran without your input " +
            "and mentioned your name briefly in passing. No damage done, but " +
            "an opportunity to shape the narrative was left on the table.",
          ),
        );
      }
      break;

    // -------------------------------------------------------------------------
    // Informational-only events — these should not have choices, but if
    // resolveEventChoice is called defensively on them, handle gracefully.
    // -------------------------------------------------------------------------

    case "managerFired":
    case "debutHatTrick":
    case "targetInjured":
    case "reportCitedInBoardMeeting":
    case "agentDeception":
    case "healthScare":
    case "boardroomCoup":
    case "budgetCut":
    case "managerSacked":
    case "clubFinancialTrouble":
    case "wonderkidPressure":
    case "hiddenGemVindication":
    case "injurySetback":
    case "debutBrilliance":
    case "lateBloomingSurprise":
    case "networkExpansion":
    case "contactRetirement":
    case "transferRuleChange":
    case "dataRevolution":
    case "youthAcademyScandal":
    case "internationalTournament":
    case "scoutingAwardNomination":
    case "financialFairPlayImpact":
      // No player choice defined for these event types.
      break;
  }

  return { updatedEvent, reputationChange, fatigueChange, messages };
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
  | "burnoutRest"
  | "burnoutPush"
  | "familyRushHome"
  | "familyStayFocused"
  | "conferenceAttend"
  | "conferenceDecline"
  | "mentorAccept"
  | "mentorDecline"
  | "interviewAccept"
  | "interviewDecline"
  | "restructureAccept"
  | "restructureResist"
  | "poachNegotiate"
  | "poachAccept"
  | "poachStayLoyal"
  | "homesickVisit"
  | "homesickLeave"
  | "controversyStandBy"
  | "controversyDistance"
  | "prodigyOwnClub"
  | "prodigyBestFit"
  | "prodigyNeutral"
  | "betrayalConfront"
  | "betrayalMonitor"
  | "accessAttend"
  | "accessPass"
  | "doubleDealExpose"
  | "doubleDealLeverage"
  | "journalistCooperate"
  | "journalistRefuse"
  | "counterBid"
  | "concede"
  | string; // fallback for any future template additions

// ---------------------------------------------------------------------------
// Per-type choice resolution helpers (original 3)
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

function resolveRivalPoachBidChoice(effect: EventEffect): number {
  // counterBid: resolved later via the game store (actual bid resolution),
  //   but the narrative system provides a baseline reputation signal.
  //   The real reputation change is applied by the game store based on bid outcome.
  //   Return 0 here — the store handles the actual delta.
  // concede: reputation -2 (letting the rival have the player)
  if (effect === "counterBid") return 0;
  if (effect === "concede") return -2;
  return 0;
}

function rivalPoachBidOutcomeBody(effect: EventEffect): string {
  if (effect === "counterBid") {
    return (
      "You've submitted a counter-bid for the player. The outcome will depend " +
      "on your reputation and the strength of your offer. Check back shortly " +
      "for the result."
    );
  }
  return (
    "You've decided to let the rival have the player. It stings, but sometimes " +
    "discretion is the better part of valour. The rival's victory has been noted " +
    "in scouting circles, and your reputation takes a small hit."
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

// =============================================================================
// CHAIN CONSEQUENCES (A5)
// =============================================================================

/**
 * Format a consequence value for display (e.g. "+5 Reputation", "-3 Club Trust").
 */
export function formatConsequence(c: ChainConsequence): string {
  const sign = c.value > 0 ? "+" : "";
  const suffix = c.type === "playerValue" ? "%" : "";
  const typeLabel: Record<ChainConsequence["type"], string> = {
    reputation: "Reputation",
    clubTrust: "Club Trust",
    contactRelationship: "Contact Relationship",
    budget: "Budget",
    form: "Form",
    playerValue: "Player Value",
  };
  return `${sign}${c.value}${suffix} ${typeLabel[c.type]}`;
}
