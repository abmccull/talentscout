/**
 * Transfer Window — daily mode for the TalentScout engine.
 *
 * During transfer windows the game shifts from weekly ticks to a higher-
 * frequency daily mode: 3 activity slots per day instead of 1 slot per
 * day-in-week. This creates deadline pressure and lets clubs make rapid
 * signings in the final hours of the window.
 *
 * All functions are pure — no side effects, no mutation, no I/O.
 *
 * Window schedule (per season):
 *   Summer: weeks 1–8   (pre-season; heavy activity)
 *   Winter: weeks 20–23 (mid-season; shorter, more urgent)
 */

import type { RNG } from "@/engine/rng";
import type {
  GameState,
  TransferWindowState,
  TransferWindowType,
  DaySchedule,
  Activity,
  InboxMessage,
} from "@/engine/core/types";

// =============================================================================
// PUBLIC RESULT TYPES
// =============================================================================

/**
 * Result of processing a single day during a transfer window.
 * Analogous to TickResult but scoped to one day instead of one week.
 */
export interface DailyTickResult {
  /** An urgent assessment request, if one was generated this day. */
  urgentAssessment?: UrgentAssessment;
  /** Inbox messages generated today (deadline reminders, window news, etc.) */
  messages: InboxMessage[];
}

/**
 * A manager's request that the scout urgently evaluates a specific player
 * before the transfer window deadline.
 *
 * Completing the assessment within the deadline grants reputationReward;
 * missing it applies reputationPenalty.
 */
export interface UrgentAssessment {
  id: string;
  /** The player the club wants assessed. */
  playerId: string;
  /** The club that made the request (display name). */
  requestedBy: string;
  /**
   * Absolute day number by which the assessment must be submitted.
   * Computed as currentDay + 1..3 at generation time.
   */
  deadline: number;
  /** Whether the scout has submitted the assessment. */
  completed: boolean;
  /** Reputation gained on successful completion. */
  reputationReward: number;
  /** Reputation lost if the deadline is missed. */
  reputationPenalty: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Number of activity slots per day during a transfer window. */
const DAILY_SLOTS = 3;

/** Probability of an urgent assessment request arriving on any given day. */
const URGENT_ASSESSMENT_DAILY_CHANCE = 0.15;

/**
 * The final week of a window is considered "deadline day" territory.
 * Pressure mechanics (UI hints, increased urgency) activate here.
 */
const DEADLINE_DAY_FINAL_WEEK_OFFSET = 0;

/** Summer window: starts at week 1, closes after week 8 (inclusive). */
const SUMMER_OPEN_WEEK = 1;
const SUMMER_CLOSE_WEEK = 8;

/** Winter window: starts at week 20, closes after week 23 (inclusive). */
const WINTER_OPEN_WEEK = 20;
const WINTER_CLOSE_WEEK = 23;

/** Reputation reward for completing an urgent assessment on time. */
const URGENT_ASSESSMENT_REPUTATION_REWARD = 3;

/** Reputation penalty for missing an urgent assessment deadline. */
const URGENT_ASSESSMENT_REPUTATION_PENALTY = 2;

// =============================================================================
// ID GENERATION
// =============================================================================

/**
 * Generate a short unique ID for game entities.
 * Mirrors the generateId helper used in gameLoop.ts — deterministic via RNG.
 */
function generateId(prefix: string, rng: RNG): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 12; i++) {
    id += chars[rng.nextInt(0, chars.length - 1)];
  }
  return `${prefix}_${id}`;
}

// =============================================================================
// 1. initializeTransferWindows
// =============================================================================

/**
 * Create the two standard transfer windows for a given season.
 *
 * Every season has exactly two windows:
 *   - Summer (weeks 1–8):  pre-season; heavy recruitment activity.
 *   - Winter (weeks 20–23): mid-season; shorter window, higher urgency.
 *
 * Both windows start as open=false; callers use isTransferWindowOpen() to
 * check activation based on the current game week.
 *
 * @param season  The season year (used for documentation; not stored in state).
 * @returns       Array of two TransferWindowState objects [summer, winter].
 */
export function initializeTransferWindows(season: number): TransferWindowState[] {
  // season parameter is accepted for API consistency (callers may want to
  // pass it for logging / future date-based mechanics).
  void season;

  const summer: TransferWindowState = {
    type: "summer" as TransferWindowType,
    isOpen: false,
    openWeek: SUMMER_OPEN_WEEK,
    closeWeek: SUMMER_CLOSE_WEEK,
    urgentRequestCount: 0,
  };

  const winter: TransferWindowState = {
    type: "winter" as TransferWindowType,
    isOpen: false,
    openWeek: WINTER_OPEN_WEEK,
    closeWeek: WINTER_CLOSE_WEEK,
    urgentRequestCount: 0,
  };

  return [summer, winter];
}

// =============================================================================
// 2. isTransferWindowOpen
// =============================================================================

/**
 * Return true if any transfer window is currently open for the given week.
 *
 * A window is "open" when currentWeek is within [window.openWeek, window.closeWeek]
 * inclusive. The window's isOpen flag in state is informational; this function
 * is the authoritative check based on week numbers.
 *
 * @param windows      All transfer windows for the current season.
 * @param currentWeek  The week to check.
 */
export function isTransferWindowOpen(
  windows: TransferWindowState[],
  currentWeek: number,
): boolean {
  return windows.some(
    (w) => currentWeek >= w.openWeek && currentWeek <= w.closeWeek,
  );
}

// =============================================================================
// 3. getCurrentTransferWindow
// =============================================================================

/**
 * Return the active transfer window for the given week, or undefined if no
 * window is open.
 *
 * When multiple windows overlap (should not happen in normal season config but
 * is handled defensively), the first matching window is returned.
 *
 * @param windows      All transfer windows for the current season.
 * @param currentWeek  The week to check.
 */
export function getCurrentTransferWindow(
  windows: TransferWindowState[],
  currentWeek: number,
): TransferWindowState | undefined {
  return windows.find(
    (w) => currentWeek >= w.openWeek && currentWeek <= w.closeWeek,
  );
}

// =============================================================================
// 4. createDaySchedule
// =============================================================================

/**
 * Create an empty daily schedule for use during transfer windows.
 *
 * Transfer window days have 3 activity slots (vs. the weekly schedule's
 * 1 slot per day). All slots start as null (unscheduled).
 *
 * @param week    The week this day belongs to.
 * @param season  The current season.
 * @param day     Day number within the week (1–7, Monday = 1).
 * @returns       A fresh DaySchedule with DAILY_SLOTS null slots.
 */
export function createDaySchedule(
  week: number,
  season: number,
  day: number,
): DaySchedule {
  return {
    week,
    season,
    day,
    slots: Array<Activity | null>(DAILY_SLOTS).fill(null),
  };
}

// =============================================================================
// 5. generateUrgentAssessment
// =============================================================================

/**
 * Attempt to generate an urgent player assessment request.
 *
 * The manager picks a player from the world's transfer targets (all players
 * in the game world are candidates for scouting; the scout does not yet have
 * a dedicated shortlist). A random club issues the request with a tight
 * 1–3 day deadline.
 *
 * Returns null when:
 *   - No players exist in the game world.
 *   - No clubs exist in the game world.
 *
 * @param rng    Seeded RNG (mutated in place).
 * @param state  Current game state.
 * @returns      An UrgentAssessment, or null if one cannot be created.
 */
export function generateUrgentAssessment(
  rng: RNG,
  state: GameState,
): UrgentAssessment | null {
  const allClubs = Object.values(state.clubs);
  if (allClubs.length === 0) return null;

  // Filter candidate players by scout specialization
  const spec = state.scout.primarySpecialization;
  let candidateIds = Object.keys(state.players);

  if (spec === "youth") {
    candidateIds = candidateIds.filter((id) => {
      const p = state.players[id];
      return p && p.age <= 21;
    });
  } else if (spec === "firstTeam") {
    candidateIds = candidateIds.filter((id) => {
      const p = state.players[id];
      return p && p.age >= 20;
    });
  }

  if (candidateIds.length === 0) return null;

  // Pick a random player to be assessed
  const playerId = rng.pick(candidateIds);

  // Pick a random club as the requester (prefer clubs other than the scout's
  // own club to represent external transfer interest, but don't hard-block it)
  const externalClubs = allClubs.filter(
    (c) => c.id !== state.scout.currentClubId,
  );
  const requestingClub =
    externalClubs.length > 0 ? rng.pick(externalClubs) : rng.pick(allClubs);

  // Deadline: 1–3 days from now (expressed as a relative day offset; callers
  // add this to the current absolute day number)
  const deadlineOffset = rng.nextInt(1, 3);

  // Compute an absolute deadline day:
  // day-in-week (1–7) + offset, capped at a large number for callers that
  // track absolute days. The caller should resolve this against their day counter.
  const currentDayInWeek = state.dailySchedule?.day ?? 1;
  const absoluteDeadlineDay = currentDayInWeek + deadlineOffset;

  return {
    id: generateId("ua", rng),
    playerId,
    requestedBy: requestingClub.name,
    deadline: absoluteDeadlineDay,
    completed: false,
    reputationReward: URGENT_ASSESSMENT_REPUTATION_REWARD,
    reputationPenalty: URGENT_ASSESSMENT_REPUTATION_PENALTY,
  };
}

// =============================================================================
// 6. isDeadlineDayPressure
// =============================================================================

/**
 * Return true when the current week is in the final week of the transfer window.
 *
 * "Deadline day pressure" is active whenever currentWeek >= window.closeWeek.
 * During this period the UI should surface urgency cues and the engine may
 * increase the probability of urgent assessment requests.
 *
 * @param window       The active transfer window.
 * @param currentWeek  The current game week.
 */
export function isDeadlineDayPressure(
  window: TransferWindowState,
  currentWeek: number,
): boolean {
  return currentWeek >= window.closeWeek - DEADLINE_DAY_FINAL_WEEK_OFFSET;
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Build an inbox message ID using the same pattern as gameLoop.ts.
 */
function makeMessageId(prefix: string, rng: RNG): string {
  return generateId(`msg_${prefix}`, rng);
}

/**
 * Generate an inbox message notifying the scout of a new urgent assessment.
 * Message framing adapts to the scout's specialization.
 */
function buildUrgentAssessmentMessage(
  assessment: UrgentAssessment,
  state: GameState,
  rng: RNG,
): InboxMessage {
  const player = state.players[assessment.playerId];
  const playerName = player
    ? `${player.firstName} ${player.lastName}`
    : "an unnamed player";
  const position = player ? ` (${player.position})` : "";
  const age = player ? `, age ${player.age}` : "";

  const isYouth = state.scout.primarySpecialization === "youth";

  const title = isYouth
    ? `Urgent: Evaluate prospect ${playerName} by day ${assessment.deadline}`
    : `Urgent: Assess ${playerName} by day ${assessment.deadline}`;

  const body = isYouth
    ? `${assessment.requestedBy} is interested in signing young talent and wants your assessment of ${playerName}${position}${age} before the transfer window closes. Submit your report by day ${assessment.deadline}. Completing this on time earns +${assessment.reputationReward} reputation; missing it costs −${assessment.reputationPenalty}.`
    : `${assessment.requestedBy} has requested an urgent assessment of ${playerName}${position} before the transfer window closes. Submit your report by day ${assessment.deadline}. Completing this on time earns +${assessment.reputationReward} reputation; missing it costs −${assessment.reputationPenalty}.`;

  return {
    id: makeMessageId("urgent_assessment", rng),
    week: state.currentWeek,
    season: state.currentSeason,
    type: "assignment",
    title,
    body,
    read: false,
    actionRequired: true,
    relatedId: assessment.playerId,
  };
}

/**
 * Generate a deadline-day pressure inbox message.
 * Reminds the scout that the window closes at the end of this week.
 */
function buildDeadlineDayMessage(
  window: TransferWindowState,
  state: GameState,
  rng: RNG,
): InboxMessage {
  const windowLabel = window.type === "summer" ? "Summer" : "Winter";

  return {
    id: makeMessageId("deadline_day", rng),
    week: state.currentWeek,
    season: state.currentSeason,
    type: "event",
    title: `${windowLabel} Transfer Window closing — deadline day`,
    body: `The ${windowLabel} Transfer Window closes at the end of week ${window.closeWeek}. Any pending reports or urgent assessments must be submitted before the deadline. Clubs are making final decisions now.`,
    read: false,
    actionRequired: false,
    relatedId: undefined,
  };
}

// =============================================================================
// 7. processDailyTick
// =============================================================================

/**
 * Process one day during a transfer window.
 *
 * Each call represents a single day within the window. The function:
 *   1. Rolls for an urgent assessment request (~15% daily probability).
 *   2. Generates a deadline-day message on the first day of the final week.
 *   3. Returns all changes for that day without mutating state.
 *
 * The caller is responsible for:
 *   - Applying the returned UrgentAssessment to the game state.
 *   - Appending the returned messages to state.inbox.
 *   - Advancing the day counter.
 *
 * @param state  Current game state (not mutated).
 * @param rng    Seeded RNG (IS mutated — advances internal state).
 * @param day    The current day number (used for deadline calculations).
 * @returns      DailyTickResult with optional urgent assessment and messages.
 */
export function processDailyTick(
  state: GameState,
  rng: RNG,
  day: number,
): DailyTickResult {
  const messages: InboxMessage[] = [];
  let urgentAssessment: UrgentAssessment | undefined;

  // Determine if we are inside an active transfer window
  const windows = state.seasonEvents
    .filter(
      (e) =>
        e.type === "summerTransferWindow" || e.type === "winterTransferWindow",
    )
    .map((e): TransferWindowState => ({
      type: e.type === "summerTransferWindow" ? "summer" : "winter",
      isOpen: state.currentWeek >= e.startWeek && state.currentWeek <= e.endWeek,
      openWeek: e.startWeek,
      closeWeek: e.endWeek,
      urgentRequestCount: state.transferWindow?.urgentRequestCount ?? 0,
    }));

  // Also honour the dedicated transferWindow field if populated
  const activeWindow =
    state.transferWindow ??
    (windows.length > 0
      ? getCurrentTransferWindow(windows, state.currentWeek)
      : undefined);

  // Roll for urgent assessment — only when inside a window
  if (activeWindow && rng.chance(URGENT_ASSESSMENT_DAILY_CHANCE)) {
    const assessment = generateUrgentAssessment(rng, state);
    if (assessment) {
      // Anchor the deadline to the absolute day parameter
      urgentAssessment = {
        ...assessment,
        deadline: day + (assessment.deadline - (state.dailySchedule?.day ?? 1)),
      };
      messages.push(
        buildUrgentAssessmentMessage(urgentAssessment, state, rng),
      );
    }
  }

  // Deadline-day pressure message: fire once when entering the final week of
  // the window. We detect "day 1 of the final week" by checking if this day
  // is the first day of week closeWeek.
  if (
    activeWindow &&
    isDeadlineDayPressure(activeWindow, state.currentWeek) &&
    state.currentWeek === activeWindow.closeWeek &&
    (state.dailySchedule?.day ?? 1) === 1
  ) {
    messages.push(buildDeadlineDayMessage(activeWindow, state, rng));
  }

  return { urgentAssessment, messages };
}
