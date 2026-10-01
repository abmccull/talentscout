import { revealKnownGamePortraits } from "@/engine/players/portraits/gameIntegration";
import { isFinancialPeriodClose } from "@/engine/core/annualization";
import { getWeeklyWorkCounts } from "@/lib/weeklyWorkCounts";
import { getLiveActivitySummary } from "@/lib/liveActivitySummary";
import {
  type WeekProcessingResult,
} from "@/engine/core/calendar";
import { getSeasonLength, type TickResult } from "@/engine/core/gameLoop";
import type { GameState } from "@/engine/core/types";
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
  if (input.persistenceEnabled) state = revealKnownGamePortraits(state);
  const beforeWeek = input.beforeWeek;
  const newInboxCount = state.inbox.length - beforeWeek.inbox.length;
  const isPayWeek = isFinancialPeriodClose(
    beforeWeek.currentWeek,
    getSeasonLength(beforeWeek.fixtures, beforeWeek.currentSeason),
  );
  const weekSummary: WeekSummary = {
    continueScreen:
      input.tickResult.endOfSeasonTriggered && state.seasonAwardsData
        ? "seasonAwards"
        : undefined,
    fatigueChange: state.scout.fatigue - beforeWeek.scout.fatigue,
    reputationChange: state.scout.reputation - beforeWeek.scout.reputation,
    skillXpGained: input.weekResult.skillXpGained as Record<string, number>,
    attributeXpGained: input.weekResult.attributeXpGained as Record<string, number>,
    ...getWeeklyWorkCounts(beforeWeek, state),
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
    activityQualities: input.qualityRollsByDay.map(({ dayIndex, result }) => {
      const activity = beforeWeek.schedule.activities[dayIndex];
      const live = activity ? getLiveActivitySummary(beforeWeek, activity, dayIndex) : null;
      return {
        activityType: result.activityType,
        tier: live?.tier ?? result.tier,
        narrative: `[${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][dayIndex]}] ${live?.narrative ?? result.narrative}`,
      };
    }),
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
