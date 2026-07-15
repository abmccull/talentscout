/**
 * Fast-forward, delegation, and leadership actions that sit beside the
 * canonical weekly simulation. These actions deliberately delegate their
 * world updates back through the store's normal day/week actions instead of
 * owning a second simulation path.
 */
import type { GetState, SetState } from "./types";
import type { GameStoreState } from "../gameStoreTypes";
import type {
  BatchAdvanceResult,
  BatchWeekSummary,
  GameState,
  QuickScoutPriorities,
} from "@/engine/core/types";
import {
  autoScheduleWeek,
  buildDefaultPriorities,
  delegateScoutingTask,
} from "@/engine/core/quickScout";
import { getScheduledActivityInstances } from "@/engine/core/calendar";
import {
  chooseLeadershipResponsibility,
  type LeadershipResponsibilityChoice,
} from "@/engine/career/leadership";

export type WeeklyQuickScoutActions = Pick<
  GameStoreState,
  | "autoSchedule"
  | "batchAdvance"
  | "delegateScouting"
  | "resolveLeadershipResponsibility"
>;

/**
 * Batch advancement is one player command even though it resolves multiple
 * canonical weeks. The owning weekly action uses this to avoid serializing a
 * full save before and after every simulated week.
 */
let batchAdvanceDepth = 0;

export function isBatchAdvanceInProgress(): boolean {
  return batchAdvanceDepth > 0;
}

export interface WeeklyQuickScoutActionDependencies {
  queueAutosave: (state: GameState, set: SetState) => void;
}

/**
 * Actions which orchestrate the existing weekly transaction rather than
 * simulate the world themselves. Keeping the autosave callback injected
 * avoids a runtime dependency back into the large weekly action factory.
 */
export function createWeeklyQuickScoutActions(
  get: GetState,
  set: SetState,
  { queueAutosave }: WeeklyQuickScoutActionDependencies,
): WeeklyQuickScoutActions {
  return {
    autoSchedule: (priorities?: QuickScoutPriorities) => {
      const { gameState } = get();
      if (!gameState) return;
      const policy = priorities ?? buildDefaultPriorities(gameState);
      const schedule = autoScheduleWeek(gameState, policy);
      set({
        gameState: { ...gameState, schedule },
        weekSimulation: null,
      });
    },

    batchAdvance: async (weeks: number, priorities?: QuickScoutPriorities) => {
      const initialState = get().gameState;
      if (!initialState) return;

      // This is deliberately an input policy over the authoritative
      // day-by-day/week transaction. It must never own a second world
      // simulation, so every iteration calls the regular store actions.
      const requestedWeeks = Math.min(Math.max(1, weeks), 8);
      const startingFatigue = initialState.scout.fatigue;
      const weekSummaries: BatchWeekSummary[] = [];
      const totalSkillXp: Record<string, number> = {};
      const totalAttributeXp: Record<string, number> = {};
      let totalNewMessages = 0;
      let totalPlayersDiscovered = 0;
      let totalObservationsGenerated = 0;
      let seasonTransitionOccurred = false;

      batchAdvanceDepth += 1;
      try {
        for (let index = 0; index < requestedWeeks; index += 1) {
          const before = get().gameState;
          if (!before || before.scout.fatigue >= 100) break;

          const policy = priorities ?? buildDefaultPriorities(before);
          get().autoSchedule(policy);
          const scheduled = get().gameState;
          if (!scheduled) break;
          const scheduledInstances = getScheduledActivityInstances(scheduled.schedule);

          get().startWeekSimulation();
          if (!get().weekSimulation) break;
          await get().fastForwardWeek();

          const after = get().gameState;
          if (!after) break;
          const advanced = after.currentSeason !== before.currentSeason
            || after.currentWeek !== before.currentWeek;
          if (!advanced) break;

          const newMessages = Math.max(0, after.inbox.length - before.inbox.length);
          const newDiscoveries = Math.max(
            0,
            after.discoveryRecords.length - before.discoveryRecords.length,
          );
          const newObservations = Math.max(
            0,
            Object.keys(after.observations).length - Object.keys(before.observations).length,
          );
          const didTransition = after.currentSeason !== before.currentSeason;
          seasonTransitionOccurred ||= didTransition;

          const keyEvents = after.inbox
            .slice(before.inbox.length)
            .slice(0, 5)
            .map((message) => message.title);
          if (didTransition) keyEvents.unshift(`Season ${before.currentSeason} ended`);

          weekSummaries.push({
            week: before.currentWeek,
            season: before.currentSeason,
            fatigueChange: after.scout.fatigue - before.scout.fatigue,
            matchesAttended: scheduledInstances.filter(({ activity }) => activity.type === "attendMatch").length,
            reportsWritten: scheduledInstances.filter(({ activity }) => activity.type === "writeReport").length,
            meetingsHeld: scheduledInstances.filter(({ activity }) => activity.type === "networkMeeting").length,
            newMessages,
            playersDiscovered: newDiscoveries,
            observationsGenerated: newObservations,
            keyEvents,
          });

          for (const [skill, xp] of Object.entries(after.scout.skillXp)) {
            const delta = (xp ?? 0) - (before.scout.skillXp[skill as keyof typeof before.scout.skillXp] ?? 0);
            if (delta > 0) totalSkillXp[skill] = (totalSkillXp[skill] ?? 0) + delta;
          }
          for (const [attribute, xp] of Object.entries(after.scout.attributeXp)) {
            const delta = (xp ?? 0) - (before.scout.attributeXp[attribute as keyof typeof before.scout.attributeXp] ?? 0);
            if (delta > 0) totalAttributeXp[attribute] = (totalAttributeXp[attribute] ?? 0) + delta;
          }
          totalNewMessages += newMessages;
          totalPlayersDiscovered += newDiscoveries;
          totalObservationsGenerated += newObservations;

          if (didTransition) break;
        }
      } finally {
        batchAdvanceDepth = Math.max(0, batchAdvanceDepth - 1);
      }

      const finalState = get().gameState;
      if (!finalState) return;
      const result: BatchAdvanceResult = {
        weekSummaries,
        weeksAdvanced: weekSummaries.length,
        startingFatigue,
        endingFatigue: finalState.scout.fatigue,
        totalSkillXp,
        totalAttributeXp,
        totalNewMessages,
        totalPlayersDiscovered,
        totalObservationsGenerated,
        seasonTransitionOccurred,
      };
      set({ batchSummary: result });
      queueAutosave(finalState, set);
    },

    delegateScouting: (npcScoutId: string, playerId: string) => {
      const { gameState } = get();
      if (!gameState) return;
      const { state, result } = delegateScoutingTask(gameState, npcScoutId, playerId);
      if (result.accepted) {
        set({ gameState: state });
        return;
      }
      set({
        gameState: {
          ...gameState,
          inbox: [
            ...gameState.inbox,
            {
              id: `deleg-rej-${npcScoutId}-${playerId}-${gameState.currentWeek}`,
              week: gameState.currentWeek,
              season: gameState.currentSeason,
              type: "event",
              title: "Delegation Rejected",
              body: result.rejectionReason ?? "NPC scout could not accept.",
              read: false,
              actionRequired: false,
            },
          ],
        },
      });
    },

    resolveLeadershipResponsibility: (
      responsibilityId: string,
      choice: LeadershipResponsibilityChoice,
      npcScoutId?: string,
    ) => {
      const { gameState } = get();
      if (!gameState) return;
      const result = chooseLeadershipResponsibility(
        gameState,
        responsibilityId,
        choice,
        npcScoutId,
      );
      if (result.accepted) {
        set({ gameState: result.state });
        return;
      }
      set({
        gameState: {
          ...gameState,
          inbox: [
            ...gameState.inbox,
            {
              id: `leadership-choice-rejected:${responsibilityId}:${gameState.currentSeason}:${gameState.currentWeek}`,
              week: gameState.currentWeek,
              season: gameState.currentSeason,
              type: "event",
              title: "Leadership choice unavailable",
              body: result.reason ?? "That responsibility can no longer be changed.",
              read: false,
              actionRequired: false,
            },
          ],
        },
      });
    },
  };
}
