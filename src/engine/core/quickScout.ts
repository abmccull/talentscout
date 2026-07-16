/**
 * Quick Scout Mode — auto-scheduling, batch advancement, and NPC delegation.
 *
 * For experienced players who want to streamline repetitive weekly planning.
 * All functions are pure: no side effects, no mutation, no React imports.
 *
 * Key features:
 *  - autoScheduleWeek: intelligently fills empty calendar days
 *  - delegateScoutingTask: assigns an NPC scout to observe a specific player
 */

import type { RNG } from "@/engine/rng";
import type {
  GameState,
  Activity,
  WeekSchedule,
  QuickScoutPriorities,
  DelegationResult,
  NPCDelegation,
  NPCScout,
  NPCScoutReport,
  Contact,
  Fixture,
  GameDate,
  ScoutSkill,
  Player,
  ScoutSourcePerspective,
} from "./types";
import {
  ACTIVITY_FATIGUE_COSTS,
  canAddActivity,
  addActivity,
  enforceForcedRestSchedule,
  getAvailableActivities,
  isForcedRestRequired,
} from "./calendar";
import { isFixtureInSeason } from "@/engine/world/fixtures";
import { addGameWeeks, gameWeeksBetween } from "./gameDate";
import {
  adjustRecommendationForPerspective,
  buildNPCRecommendationEvidenceClaim,
  deriveNPCScoutPerspective,
} from "@/engine/scout/sourcePerspectives";
import {
  getWeeklyIntentActivityPriority,
  normalizeWeeklyStrategyState,
} from "./weeklyStrategy";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Fatigue threshold above which the scheduler inserts rest days. */
const AUTO_REST_FATIGUE_THRESHOLD = 70;

/** Contact relationship decay threshold — schedule meeting if below this. */
const CONTACT_DECAY_THRESHOLD = 40;

/** Minimum observations before auto-scheduling a writeReport activity. */
const MIN_OBS_FOR_REPORT = 3;

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
  if (isForcedRestRequired(scout.fatigue)) {
    return enforceForcedRestSchedule(schedule, scout.fatigue);
  }

  // Get engine-available activities for this week
  const available = getAvailableActivities(
    scout,
    state.currentWeek,
    Object.values(state.fixtures).filter(
      (f) =>
        isFixtureInSeason(f, state.currentSeason) &&
        f.week === state.currentWeek &&
        !f.played,
    ),
    Object.values(state.contacts),
    state.subRegions,
    state.observations,
    state.unsignedYouth,
    state.players,
    {
      activeLoans: state.activeLoans,
      loanRecommendations: state.loanRecommendations,
      transferWindow: state.transferWindow,
    },
    state.youthTournaments,
    state.reports,
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
 *
 * Activities with a `targetPool` (deduplicated cards) are expanded into
 * one candidate per target, each with `targetId` resolved and `targetPool`
 * removed so downstream scheduling works unchanged.
 */
function buildCandidateQueue(
  state: GameState,
  priorities: QuickScoutPriorities,
  available: Activity[],
): Activity[] {
  const candidates: Array<Activity & { _priority: number }> = [];
  const strategy = normalizeWeeklyStrategyState(
    state.weeklyStrategy,
    state.currentWeek,
    state.currentSeason,
  );

  // Expand pooled activities into one candidate per target
  const resolved: Activity[] = [];
  for (const act of available) {
    if (act.targetPool && act.targetPool.length > 0 && !act.targetId) {
      for (const target of act.targetPool) {
        resolved.push({
          ...act,
          targetId: target.id,
          targetPool: undefined,
          description: act.description,
        });
      }
    } else {
      resolved.push(act);
    }
  }

  for (const act of resolved) {
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

    // Youth follow-up activities
    if (
      (act.type === "followUpSession" ||
        act.type === "parentCoachMeeting" ||
        act.type === "writePlacementReport") &&
      act.targetId
    ) {
      priority = 45;
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

    // A standing weekly intent turns auto-scheduling into a strategic input,
    // not a generic best-card filler. Manual schedules receive the same intent
    // effects later in the authoritative week transaction.
    priority += getWeeklyIntentActivityPriority(strategy.intentId, act);

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

  const activeDelegations = Object.values(state.npcDelegations ?? {}).filter(
    (delegation) => !delegation.completed,
  );
  const existingScoutDelegation = activeDelegations.find(
    (delegation) => delegation.npcScoutId === npcScoutId,
  );
  if (existingScoutDelegation) {
    const existingTarget = state.players[existingScoutDelegation.playerId];
    const existingTargetName = existingTarget
      ? `${existingTarget.firstName} ${existingTarget.lastName}`
      : "another player";
    return {
      state,
      result: {
        npcScout,
        estimatedWeeks: 0,
        accepted: false,
        rejectionReason: `${npcScout.firstName} ${npcScout.lastName} is already covering ${existingTargetName}.`,
      },
    };
  }

  const existingPlayerDelegation = activeDelegations.find(
    (delegation) => delegation.playerId === playerId,
  );
  if (existingPlayerDelegation) {
    const assignedScout = state.npcScouts[existingPlayerDelegation.npcScoutId];
    const assignedScoutName = assignedScout
      ? `${assignedScout.firstName} ${assignedScout.lastName}`
      : "another scout";
    return {
      state,
      result: {
        npcScout,
        estimatedWeeks: 0,
        accepted: false,
        rejectionReason: `${player.firstName} ${player.lastName} is already assigned to ${assignedScoutName}.`,
      },
    };
  }

  // Calculate estimated weeks: quality 5 = 2 weeks, quality 1 = 3 weeks
  const estimatedWeeks = npcScout.quality >= 4 ? 2 : 3;
  const completionTiming = estimateDelegationCompletion(
    state.fixtures,
    state.currentWeek,
    state.currentSeason,
    estimatedWeeks,
  );

  // Create the delegation record
  const delegationId = `deleg_${npcScoutId}_${playerId}_w${state.currentWeek}`;
  const delegation: NPCDelegation = {
    id: delegationId,
    npcScoutId,
    playerId,
    startWeek: state.currentWeek,
    startSeason: state.currentSeason,
    estimatedWeeks,
    weeksRemaining: estimatedWeeks,
    completionWeek: completionTiming.week,
    completionSeason: completionTiming.season,
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
    npcDelegations: {
      ...state.npcDelegations,
      [delegationId]: delegation,
    },
    inbox: [...state.inbox, newMessage],
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

function estimateDelegationCompletion(
  fixtures: GameState["fixtures"],
  startWeek: number,
  startSeason: number,
  estimatedWeeks: number,
): { week: number; season: number } {
  return addGameWeeks(
    fixtures,
    { week: startWeek, season: startSeason },
    estimatedWeeks,
  );
}

function clampDelegationReportQuality(value: number): number {
  return Math.max(1, Math.min(100, value));
}

function specializationBonus(npcScout: NPCScout, player: Player): number {
  switch (npcScout.specialization) {
    case "youth":
      return player.age < 21 ? 10 : 0;
    case "firstTeam":
      return player.currentAbility >= 130 ? 10 : 0;
    case "regional":
      return 6;
    case "data":
      return player.currentAbility >= 100 ? 8 : 2;
    default:
      return 0;
  }
}

function deriveDelegationRecommendation(
  quality: number,
  player: Player,
  perspective: ScoutSourcePerspective,
): NPCScoutReport["recommendation"] {
  const signal = adjustRecommendationForPerspective(
    quality * 0.7 + (player.currentAbility / 200) * 100 * 0.3,
    perspective,
  );
  if (signal >= 75) return "pursue";
  if (signal >= 45) return "shortlist";
  return "monitor";
}

function createDelegationReport(
  rng: RNG,
  state: GameState,
  delegation: NPCDelegation,
  npcScout: NPCScout,
  player: Player,
): NPCScoutReport {
  const baseQuality = npcScout.quality * 18 + 8 + specializationBonus(npcScout, player);
  const fatiguePenalty = npcScout.fatigue > 70 ? 12 : 0;
  const focusedBonus = 8;
  const noisyQuality = Math.round(
    rng.gaussian(baseQuality + focusedBonus - fatiguePenalty, 6),
  );
  const quality = clampDelegationReportQuality(noisyQuality);
  const perspective = deriveNPCScoutPerspective(npcScout);
  const recommendation = deriveDelegationRecommendation(quality, player, perspective);
  const reportId = `npc_deleg_${delegation.id}_${state.currentSeason}_${state.currentWeek}`;
  const sourceName = `${npcScout.firstName} ${npcScout.lastName}`;
  const summary =
    `${npcScout.firstName} ${npcScout.lastName} completed a focused follow-up on ` +
    `${player.firstName} ${player.lastName}. ` +
    `The report graded ${quality}/100 and recommends you ` +
    `${recommendation === "pursue" ? "move quickly" : recommendation === "shortlist" ? "keep the player under close watch" : "continue monitoring"} ` +
    `after a delegated assignment that lasted ${delegation.estimatedWeeks} week(s).`;

  return {
    id: reportId,
    npcScoutId: npcScout.id,
    playerId: player.id,
    week: state.currentWeek,
    season: state.currentSeason,
    quality,
    summary,
    recommendation,
    reviewed: false,
    sourcePerspective: perspective,
    evidenceClaims: [buildNPCRecommendationEvidenceClaim({
      reportId,
      playerId: player.id,
      sourceName,
      perspective,
      recommendation,
      quality,
      week: state.currentWeek,
      season: state.currentSeason,
    })],
  };
}

export function processNPCDelegations(
  state: GameState,
  rng: RNG,
): { state: GameState; completedReports: NPCScoutReport[] } {
  const delegations = state.npcDelegations ?? {};
  const activeDelegations = Object.values(delegations).filter(
    (delegation) => !delegation.completed,
  );

  if (activeDelegations.length === 0) {
    return { state, completedReports: [] };
  }

  const updatedDelegations = { ...delegations };
  const updatedNpcReports = { ...state.npcReports };
  const updatedNpcScouts = { ...state.npcScouts };
  const updatedInbox = [...state.inbox];
  const completedReports: NPCScoutReport[] = [];

  for (const delegation of activeDelegations) {
    const decrementedWeeks = Math.max(0, (delegation.weeksRemaining ?? delegation.estimatedWeeks) - 1);
    if (decrementedWeeks > 0) {
      updatedDelegations[delegation.id] = {
        ...delegation,
        weeksRemaining: decrementedWeeks,
      };
      continue;
    }

    const npcScout = updatedNpcScouts[delegation.npcScoutId];
    const player = state.players[delegation.playerId];

    if (!npcScout || !player) {
      updatedDelegations[delegation.id] = {
        ...delegation,
        weeksRemaining: 0,
        completed: true,
        completedWeek: state.currentWeek,
        completedSeason: state.currentSeason,
      };
      updatedInbox.push({
        id: `delegation-missing-${delegation.id}`,
        week: state.currentWeek,
        season: state.currentSeason,
        type: "event",
        title: "Delegated Scouting Closed",
        body: "A delegated assignment ended without a report because the target or scout was no longer available.",
        read: false,
        actionRequired: false,
      });
      continue;
    }

    const report = createDelegationReport(rng, state, delegation, npcScout, player);
    updatedNpcReports[report.id] = report;
    updatedNpcScouts[npcScout.id] = {
      ...npcScout,
      reportsSubmitted: npcScout.reportsSubmitted + 1,
    };
    updatedDelegations[delegation.id] = {
      ...delegation,
      weeksRemaining: 0,
      completed: true,
      completedWeek: state.currentWeek,
      completedSeason: state.currentSeason,
      resultReportId: report.id,
    };
    updatedInbox.push({
      id: `delegation-complete-${delegation.id}`,
      week: state.currentWeek,
      season: state.currentSeason,
      type: "feedback",
      title: "Delegated Report Delivered",
      body:
        `${npcScout.firstName} ${npcScout.lastName} has returned a focused report on ` +
        `${player.firstName} ${player.lastName}. Review it from NPC Scout Management.`,
      read: false,
      actionRequired: false,
      relatedId: report.id,
    });
    completedReports.push(report);
  }

  return {
    state: {
      ...state,
      npcDelegations: updatedDelegations,
      npcReports: updatedNpcReports,
      npcScouts: updatedNpcScouts,
      inbox: updatedInbox,
    },
    completedReports,
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
  currentDate: GameDate,
  fixtures: Record<string, Fixture>,
): Contact[] {
  return Object.values(contacts).filter((c) => {
    const weeksWithoutContact = c.lastInteractionAt
      ? Math.max(0, gameWeeksBetween(fixtures, c.lastInteractionAt, currentDate))
      : Number.POSITIVE_INFINITY;
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
