/**
 * Quick Scout Mode — auto-scheduling, batch advancement, and NPC delegation.
 *
 * For experienced players who want to streamline repetitive weekly planning.
 * All functions are pure: no side effects, no mutation, no React imports.
 *
 * Key features:
 *  - autoScheduleWeek: intelligently fills empty calendar days
 *  - batchAdvanceWeeks: advances multiple weeks and returns a condensed summary
 *  - delegateScoutingTask: assigns an NPC scout to observe a specific player
 */

import type { RNG } from "@/engine/rng";
import type {
  GameState,
  Activity,
  WeekSchedule,
  QuickScoutPriorities,
  BatchWeekSummary,
  BatchAdvanceResult,
  DelegationResult,
  NPCDelegation,
  NPCScout,
  Contact,
  ScoutSkill,
} from "./types";
import {
  ACTIVITY_FATIGUE_COSTS,
  canAddActivity,
  addActivity,
  getAvailableActivities,
  processCompletedWeek,
  applyWeekResults,
  createWeekSchedule,
} from "./calendar";
import { processWeeklyTick, advanceWeek } from "./gameLoop";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fatigue threshold above which the scheduler inserts rest days. */
const AUTO_REST_FATIGUE_THRESHOLD = 70;

/** Contact relationship decay threshold — schedule meeting if below this. */
const CONTACT_DECAY_THRESHOLD = 40;

/** Minimum observations before auto-scheduling a writeReport activity. */
const MIN_OBS_FOR_REPORT = 3;

/** Maximum weeks that can be batch-advanced at once. */
const MAX_BATCH_WEEKS = 8;

/** NPC fatigue threshold — delegation rejected if above this. */
const NPC_DELEGATION_FATIGUE_LIMIT = 80;

// ---------------------------------------------------------------------------
// 1. Auto-Schedule Week
// ---------------------------------------------------------------------------

/**
 * Fill empty days in the current week schedule with optimal activities
 * based on the provided priorities and current game state.
 *
 * Priority order:
 *  1. Rest when fatigue > 70
 *  2. Match observations for priority target players
 *  3. Network meetings for contacts with decaying trust
 *  4. Report writing for well-observed players
 *  5. Training/study on weakest skills
 *  6. Fill remaining with study
 *
 * @returns A new WeekSchedule with empty slots filled.
 */
export function autoScheduleWeek(
  state: GameState,
  priorities: QuickScoutPriorities,
): WeekSchedule {
  let schedule = { ...state.schedule, activities: [...state.schedule.activities] };
  const { scout } = state;

  // Get engine-available activities for this week
  const available = getAvailableActivities(
    scout,
    state.currentWeek,
    Object.values(state.fixtures).filter((f) => f.week === state.currentWeek && !f.played),
    Object.values(state.contacts),
    state.subRegions,
    state.observations,
    state.unsignedYouth,
    state.players,
  );

  // Estimate current fatigue trajectory across the week
  let projectedFatigue = scout.fatigue;

  // Build a priority queue of candidate activities
  const candidates = buildCandidateQueue(state, priorities, available);

  // Fill empty days from Monday to Sunday
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    if (schedule.activities[dayIndex] !== null) {
      // Already scheduled — account for fatigue
      const existing = schedule.activities[dayIndex]!;
      projectedFatigue += ACTIVITY_FATIGUE_COSTS[existing.type] ?? 0;
      continue;
    }

    // Choose what to schedule at this slot
    const activity = pickBestActivity(
      candidates,
      schedule,
      dayIndex,
      projectedFatigue,
      priorities,
    );

    if (activity) {
      schedule = addActivity(schedule, activity, dayIndex);
      projectedFatigue += ACTIVITY_FATIGUE_COSTS[activity.type] ?? 0;

      // Remove used candidate if it's a one-shot (match/meeting/report)
      const idx = candidates.findIndex(
        (c) => c.type === activity.type && c.targetId === activity.targetId,
      );
      if (idx !== -1 && (activity.targetId || activity.type === "rest")) {
        candidates.splice(idx, 1);
      }
    }
  }

  return schedule;
}

/**
 * Build a ranked list of candidate activities based on priorities.
 */
function buildCandidateQueue(
  state: GameState,
  priorities: QuickScoutPriorities,
  available: Activity[],
): Activity[] {
  const candidates: Array<Activity & { _priority: number }> = [];

  for (const act of available) {
    let priority = 0;

    // Match attendance for target players gets highest priority
    if (act.type === "attendMatch" && act.targetId) {
      const fixture = state.fixtures[act.targetId];
      if (fixture) {
        const isTargetMatch = priorities.targetPlayerIds.some((pid) => {
          const player = state.players[pid];
          if (!player) return false;
          return player.clubId === fixture.homeClubId || player.clubId === fixture.awayClubId;
        });
        priority = isTargetMatch ? 100 : 50;
      }
    }

    // Network meetings for contacts with low/decaying trust
    if (act.type === "networkMeeting" && priorities.maintainContacts && act.targetId) {
      const contact = state.contacts[act.targetId];
      if (contact && contact.relationship < CONTACT_DECAY_THRESHOLD) {
        priority = 80;
      } else if (contact) {
        priority = 30;
      }
    }

    // Report writing for well-observed players
    if (act.type === "writeReport" && priorities.writeReports && act.targetId) {
      const obsCount = Object.values(state.observations).filter(
        (o) => o.playerId === act.targetId,
      ).length;
      if (obsCount >= MIN_OBS_FOR_REPORT) {
        priority = 70;
      }
    }

    // Study/training for weakest skills
    if (act.type === "study" && priorities.trainWeakSkills) {
      priority = 40;
    }

    // Rest is always a candidate (with dynamic priority based on fatigue)
    if (act.type === "rest") {
      priority = 10; // Base — boosted dynamically in pickBestActivity
    }

    // Video analysis as a fallback
    if (act.type === "watchVideo") {
      priority = 20;
    }

    candidates.push({ ...act, _priority: priority });
  }

  // Sort descending by priority
  candidates.sort((a, b) => b._priority - a._priority);

  // Strip internal _priority field for the returned list
  return candidates.map(({ _priority: _, ...rest }) => rest as Activity);
}

/**
 * Pick the best activity for a given day slot, considering fatigue and
 * what fits in the remaining schedule.
 */
function pickBestActivity(
  candidates: Activity[],
  schedule: WeekSchedule,
  dayIndex: number,
  projectedFatigue: number,
  priorities: QuickScoutPriorities,
): Activity | null {
  // If fatigue is high, force rest
  if (projectedFatigue >= AUTO_REST_FATIGUE_THRESHOLD) {
    const restActivity: Activity = {
      type: "rest",
      slots: 1,
      description: "Auto-scheduled rest day",
    };
    if (canAddActivity(schedule, restActivity, dayIndex)) {
      return restActivity;
    }
  }

  // Try candidates in priority order
  for (const candidate of candidates) {
    if (canAddActivity(schedule, candidate, dayIndex)) {
      return candidate;
    }
  }

  // Fallback: study (always 1 slot, always available)
  const fallback: Activity = {
    type: "study",
    slots: 1,
    description: "Auto-scheduled study session",
  };
  if (canAddActivity(schedule, fallback, dayIndex)) {
    return fallback;
  }

  return null;
}

// ---------------------------------------------------------------------------
// 2. Batch Advance Weeks
// ---------------------------------------------------------------------------

/**
 * Advance multiple weeks at once, auto-scheduling each one and processing
 * the game loop. Returns a condensed summary of all weeks.
 *
 * The batch stops early if:
 *  - An end-of-season transition occurs
 *  - The scout's fatigue reaches 100
 *  - The requested number of weeks is reached
 *
 * @param state  Current game state.
 * @param rng    Seeded RNG instance.
 * @param weeks  Number of weeks to advance (clamped to MAX_BATCH_WEEKS).
 * @param priorities  Auto-schedule priorities for filling empty days.
 * @returns The final game state and a BatchAdvanceResult summary.
 */
export function batchAdvanceWeeks(
  state: GameState,
  rng: RNG,
  weeks: number,
  priorities: QuickScoutPriorities,
): { state: GameState; result: BatchAdvanceResult } {
  const clampedWeeks = Math.min(Math.max(1, weeks), MAX_BATCH_WEEKS);
  const startingFatigue = state.scout.fatigue;

  const weekSummaries: BatchWeekSummary[] = [];
  const totalSkillXp: Record<string, number> = {};
  const totalAttributeXp: Record<string, number> = {};
  let totalNewMessages = 0;
  let totalPlayersDiscovered = 0;
  let totalObservationsGenerated = 0;
  let seasonTransitionOccurred = false;

  let currentState = state;

  for (let i = 0; i < clampedWeeks; i++) {
    const prevInboxCount = currentState.inbox.length;
    const prevObsCount = Object.keys(currentState.observations).length;
    const prevDiscoveryCount = currentState.discoveryRecords.length;

    // Auto-schedule the current week
    const scheduledWeek = autoScheduleWeek(currentState, priorities);
    currentState = { ...currentState, schedule: scheduledWeek };

    // Process the week's activities
    const weekResult = processCompletedWeek(
      currentState.schedule,
      currentState.scout,
      rng,
    );
    const updatedScout = applyWeekResults(currentState.scout, weekResult);
    currentState = { ...currentState, scout: updatedScout };

    // Run the game loop tick
    const tickResult = processWeeklyTick(currentState, rng);
    currentState = advanceWeek(currentState, tickResult);

    // Reset schedule for next week
    currentState = {
      ...currentState,
      schedule: createWeekSchedule(currentState.currentWeek, currentState.currentSeason),
    };

    // Collect summary data
    const newMessages = Math.max(0, currentState.inbox.length - prevInboxCount);
    const newObs = Math.max(0, Object.keys(currentState.observations).length - prevObsCount);
    const newDiscoveries = Math.max(0, currentState.discoveryRecords.length - prevDiscoveryCount);

    const keyEvents: string[] = [];
    if (tickResult.endOfSeasonTriggered) {
      keyEvents.push(`Season ${currentState.currentSeason - 1} ended`);
      seasonTransitionOccurred = true;
    }
    if (tickResult.transfers.length > 0) {
      keyEvents.push(`${tickResult.transfers.length} transfer(s) completed`);
    }
    if (tickResult.npcScoutResults.length > 0) {
      const totalReports = tickResult.npcScoutResults.reduce(
        (sum, r) => sum + r.reportsGenerated.length, 0,
      );
      if (totalReports > 0) {
        keyEvents.push(`${totalReports} NPC scout report(s) received`);
      }
    }
    if (newDiscoveries > 0) {
      keyEvents.push(`${newDiscoveries} new player(s) discovered`);
    }

    const weekSummary: BatchWeekSummary = {
      week: currentState.currentWeek - 1, // The week that was just processed
      season: currentState.currentSeason,
      fatigueChange: weekResult.fatigueChange,
      matchesAttended: weekResult.matchesAttended.length,
      reportsWritten: weekResult.reportsWritten.length,
      meetingsHeld: weekResult.meetingsHeld.length,
      newMessages,
      playersDiscovered: newDiscoveries,
      observationsGenerated: newObs,
      keyEvents,
    };
    weekSummaries.push(weekSummary);

    // Accumulate totals
    for (const [skill, xp] of Object.entries(weekResult.skillXpGained)) {
      totalSkillXp[skill] = (totalSkillXp[skill] ?? 0) + (xp ?? 0);
    }
    for (const [attr, xp] of Object.entries(weekResult.attributeXpGained)) {
      totalAttributeXp[attr] = (totalAttributeXp[attr] ?? 0) + (xp ?? 0);
    }
    totalNewMessages += newMessages;
    totalPlayersDiscovered += newDiscoveries;
    totalObservationsGenerated += newObs;

    // Early exit conditions
    if (seasonTransitionOccurred) break;
    if (currentState.scout.fatigue >= 100) break;
  }

  const result: BatchAdvanceResult = {
    weekSummaries,
    weeksAdvanced: weekSummaries.length,
    startingFatigue,
    endingFatigue: currentState.scout.fatigue,
    totalSkillXp,
    totalAttributeXp,
    totalNewMessages,
    totalPlayersDiscovered,
    totalObservationsGenerated,
    seasonTransitionOccurred,
  };

  return { state: currentState, result };
}

// ---------------------------------------------------------------------------
// 3. Delegate Scouting Task
// ---------------------------------------------------------------------------

/**
 * Assign an NPC scout to perform a focused observation on a specific player.
 *
 * The NPC will take 2-3 weeks depending on their quality (higher quality =
 * faster). Delegation is rejected if the NPC's fatigue is too high or if
 * they are not assigned to a territory.
 *
 * @param state       Current game state.
 * @param npcScoutId  ID of the NPC scout to delegate to.
 * @param playerId    ID of the player to observe.
 * @returns Updated state and delegation result.
 */
export function delegateScoutingTask(
  state: GameState,
  npcScoutId: string,
  playerId: string,
): { state: GameState; result: DelegationResult } {
  const npcScout = state.npcScouts[npcScoutId];

  if (!npcScout) {
    return {
      state,
      result: {
        npcScout: {} as NPCScout,
        estimatedWeeks: 0,
        accepted: false,
        rejectionReason: "NPC scout not found.",
      },
    };
  }

  // Validate the target player exists
  const player = state.players[playerId];
  if (!player) {
    return {
      state,
      result: {
        npcScout,
        estimatedWeeks: 0,
        accepted: false,
        rejectionReason: "Target player not found.",
      },
    };
  }

  // Check fatigue
  if (npcScout.fatigue > NPC_DELEGATION_FATIGUE_LIMIT) {
    return {
      state,
      result: {
        npcScout,
        estimatedWeeks: 0,
        accepted: false,
        rejectionReason: `${npcScout.firstName} ${npcScout.lastName} is too fatigued (${npcScout.fatigue}/100) to accept a delegation.`,
      },
    };
  }

  // Check territory assignment
  if (!npcScout.territoryId) {
    return {
      state,
      result: {
        npcScout,
        estimatedWeeks: 0,
        accepted: false,
        rejectionReason: `${npcScout.firstName} ${npcScout.lastName} has no territory assigned.`,
      },
    };
  }

  // Calculate estimated weeks: quality 5 = 2 weeks, quality 1 = 3 weeks
  const estimatedWeeks = npcScout.quality >= 4 ? 2 : 3;

  // Create the delegation record
  const delegationId = `deleg_${npcScoutId}_${playerId}_w${state.currentWeek}`;
  const delegation: NPCDelegation = {
    id: delegationId,
    npcScoutId,
    playerId,
    startWeek: state.currentWeek,
    completionWeek: state.currentWeek + estimatedWeeks,
    completed: false,
  };

  // Update NPC scout fatigue (accepting a delegation costs fatigue)
  const updatedNpc: NPCScout = {
    ...npcScout,
    fatigue: Math.min(100, npcScout.fatigue + 10),
  };

  // Store delegation in inbox as a pending task message
  const newMessage = {
    id: `delegation-${delegationId}`,
    week: state.currentWeek,
    season: state.currentSeason,
    type: "news" as const,
    title: `Delegation: ${npcScout.firstName} ${npcScout.lastName} assigned`,
    body: `${npcScout.firstName} ${npcScout.lastName} has been assigned to observe ${player.firstName} ${player.lastName}. Expected completion in ${estimatedWeeks} week(s).`,
    read: false,
    actionRequired: false,
  };

  const updatedState: GameState = {
    ...state,
    npcScouts: {
      ...state.npcScouts,
      [npcScoutId]: updatedNpc,
    },
    inbox: [...state.inbox, newMessage],
    // Store active delegations in a spot on GameState
    // We use npcReports as the destination once complete; for now, tag via inbox
  };

  return {
    state: updatedState,
    result: {
      npcScout: updatedNpc,
      estimatedWeeks,
      accepted: true,
    },
  };
}

// ---------------------------------------------------------------------------
// 4. Helpers
// ---------------------------------------------------------------------------

/**
 * Get the weakest scout skill for training prioritization.
 */
export function getWeakestSkill(
  skills: Record<ScoutSkill, number>,
): ScoutSkill {
  let weakest: ScoutSkill = "technicalEye";
  let lowest = Infinity;

  for (const [skill, value] of Object.entries(skills) as Array<[ScoutSkill, number]>) {
    if (value < lowest) {
      lowest = value;
      weakest = skill;
    }
  }

  return weakest;
}

/**
 * Get contacts whose trust is decaying (low relationship or long since last contact).
 */
export function getDecayingContacts(
  contacts: Record<string, Contact>,
  currentWeek: number,
): Contact[] {
  return Object.values(contacts).filter((c) => {
    const weeksWithoutContact = currentWeek - (c.lastInteractionWeek ?? 0);
    return c.relationship < CONTACT_DECAY_THRESHOLD || weeksWithoutContact > 8;
  });
}

/**
 * Build default priorities from the current game state.
 * Useful for one-click auto-schedule.
 */
export function buildDefaultPriorities(state: GameState): QuickScoutPriorities {
  return {
    targetPlayerIds: state.watchlist.slice(0, 5),
    trainWeakSkills: true,
    maintainContacts: true,
    writeReports: true,
  };
}
