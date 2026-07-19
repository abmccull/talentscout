import { isFinancialPeriodClose } from "@/engine/core/annualization";
import {
  getScheduledActivityInstances,
  type WeekProcessingResult,
} from "@/engine/core/calendar";
import { getSeasonLength, type TickResult } from "@/engine/core/gameLoop";
import type { Activity, GameState } from "@/engine/core/types";
import type { WeeklySimulationPipeline } from "@/engine/core/weeklySimulationPipeline";
import { resolveScenarioOutcome } from "@/engine/scenarios";
import type { TutorialState } from "@/stores/tutorialStore";
import type { GameScreen, WeekSummary } from "../gameStoreTypes";
import type { SetState } from "./types";
import type { WeeklyActivityQualityRoll } from "./weeklyActivityPreparation";
import {
  derivePendingCelebration,
  deriveScenarioState,
} from "./weeklySimulationSupport";
import {
  processWeeklyContextualHint,
  processWeeklyTutorialMilestones,
} from "./weeklyPresentationEffects";

const YOUTH_SUMMARY_ACTIVITY_TYPES = new Set<Activity["type"]>([
  "schoolMatch",
  "grassrootsTournament",
  "streetFootball",
  "academyTrialDay",
  "youthFestival",
  "youthTournament",
  "academyVisit",
  "watchVideo",
  "followUpSession",
  "parentCoachMeeting",
  "trainingVisit",
]);

export interface WeeklyCompletionHandoffInput {
  beforeWeek: GameState;
  state: GameState;
  pipeline: WeeklySimulationPipeline;
  tickResult: Pick<TickResult, "endOfSeasonTriggered">;
  weekResult: WeekProcessingResult;
  qualityRollsByDay: readonly WeeklyActivityQualityRoll[];
  rivalAlertCount: number;
  newlyUnlockedToolIds: readonly string[];
  set: SetState;
  persistenceEnabled: boolean;
  getTutorialState: () => TutorialState;
  queueAutosave: (state: GameState, set: SetState) => void;
}

/** Commit the completed transaction to presentation state, then persist it. */
export function completeWeeklyHandoff(
  input: WeeklyCompletionHandoffInput,
): GameState {
  input.pipeline.enter("finalize");
  let state = input.pipeline.complete(input.state);
  const beforeWeek = input.beforeWeek;
  const newInboxCount = state.inbox.length - beforeWeek.inbox.length;
  const isPayWeek = isFinancialPeriodClose(
    beforeWeek.currentWeek,
    getSeasonLength(beforeWeek.fixtures, beforeWeek.currentSeason),
  );
  const youthActivityCount = getScheduledActivityInstances(beforeWeek.schedule).filter(
    ({ activity }) => YOUTH_SUMMARY_ACTIVITY_TYPES.has(activity.type),
  ).length;
  const weekSummary: WeekSummary = {
    continueScreen:
      input.tickResult.endOfSeasonTriggered && state.seasonAwardsData
        ? "seasonAwards"
        : undefined,
    fatigueChange: state.scout.fatigue - beforeWeek.scout.fatigue,
    reputationChange: state.scout.reputation - beforeWeek.scout.reputation,
    skillXpGained: input.weekResult.skillXpGained as Record<string, number>,
    attributeXpGained: input.weekResult.attributeXpGained as Record<string, number>,
    matchesAttended: beforeWeek.scout.primarySpecialization === "youth"
      ? youthActivityCount
      : input.weekResult.matchesAttended.length,
    reportsWritten: input.weekResult.reportsWritten.length,
    meetingsHeld: input.weekResult.meetingsHeld.length,
    newMessages: Math.max(0, newInboxCount),
    rivalAlerts: input.rivalAlertCount,
    financeSummary: isPayWeek && beforeWeek.finances
      ? {
          income: beforeWeek.finances.monthlyIncome,
          expenses: Object.values(beforeWeek.finances.expenses).reduce(
            (sum, value) => sum + value,
            0,
          ),
        }
      : null,
    activityQualities: input.qualityRollsByDay.map(({ dayIndex, result }) => ({
      activityType: result.activityType,
      tier: result.tier,
      narrative: `[${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][dayIndex]}] ${result.narrative}`,
    })),
    playersDiscovered: Math.max(
      0,
      state.discoveryRecords.length - beforeWeek.discoveryRecords.length,
    ),
    observationsGenerated: Math.max(
      0,
      Object.keys(state.observations).length - Object.keys(beforeWeek.observations).length,
    ),
  };

  const { scenarioProgressUpdate, scenarioOutcomeUpdate } = deriveScenarioState(state);
  const pendingCelebration = derivePendingCelebration(
    beforeWeek,
    state,
    scenarioOutcomeUpdate,
    [...input.newlyUnlockedToolIds],
  );
  let resolvedScenarioId: string | null = null;
  if (scenarioOutcomeUpdate !== null) {
    const latched = resolveScenarioOutcome(state, scenarioOutcomeUpdate);
    state = latched.state;
    resolvedScenarioId = latched.resolvedScenarioId;
  }
  const tierPromoted = state.scout.careerTier > beforeWeek.scout.careerTier;
  processWeeklyTutorialMilestones(
    beforeWeek,
    state,
    tierPromoted,
    input.getTutorialState(),
  );

  input.set({
    gameState: state,
    lastWeekSummary: weekSummary,
    ...(scenarioProgressUpdate !== null ? { scenarioProgress: scenarioProgressUpdate } : {}),
    ...(scenarioOutcomeUpdate !== null
      ? {
          scenarioOutcome: scenarioOutcomeUpdate,
          scenarioOutcomeScenarioId: resolvedScenarioId,
        }
      : {}),
    ...(pendingCelebration !== null ? { pendingCelebration } : {}),
    ...(input.tickResult.endOfSeasonTriggered && state.seasonAwardsData
      ? { currentScreen: "calendar" as GameScreen }
      : {}),
  });
  processWeeklyContextualHint(state, input.getTutorialState());
  if (input.persistenceEnabled) {
    input.queueAutosave(state, input.set);
  }
  return state;
}
