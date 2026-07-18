import { getActiveSaveProvider } from "@/lib/activeSaveProvider";
import { persistGameState } from "@/lib/saveProvider";
import { runWeeklyWorkerTransaction } from "@/lib/weeklySimulationWorkerClient";
import { useTutorialStore } from "@/stores/tutorialStore";
import type { GameStoreState } from "../gameStoreTypes";
import type { GetState, SetState } from "./types";
import {
  queueWeeklyAutosave,
} from "./weeklyActions";
import { applyWeeklyTutorialCommands } from "./weeklyTutorialBridge";
import { materializeWeeklyWorkerCommit } from "./weeklyHeadlessTransaction";
import { isBatchAdvanceInProgress } from "./weeklyQuickScoutActions";
import type { WeeklyWorkerInput } from "./weeklyWorkerTypes";

export type WeeklyAsyncActions = Pick<GameStoreState, "advanceWeekAsync">;

/**
 * Coordinates the worker without granting it authority over the live store.
 * A result is committed only if the exact source state and simulation are
 * still active when it returns.
 */
export function createWeeklyAsyncActions(
  get: GetState,
  set: SetState,
): WeeklyAsyncActions {
  return {
    advanceWeekAsync: async () => {
      const sourceState = get().gameState;
      const sourceSimulation = get().weekSimulation;
      if (!sourceState || !sourceSimulation || get().isAdvancingWeek) return;

      if (!isBatchAdvanceInProgress()) {
        getActiveSaveProvider()
          .then((provider) => persistGameState(
            provider,
            "autosave",
            sourceState,
            "Autosave",
          ))
          .catch((error) => {
            console.warn("Pre-advance checkpoint autosave failed:", error);
          });
      }

      const tutorial = useTutorialStore.getState();
      const input: WeeklyWorkerInput = {
        gameState: sourceState,
        weekSimulation: sourceSimulation,
        currentScreen: get().currentScreen,
        isLoaded: get().isLoaded,
        tutorial: {
          completedSequences: [...tutorial.completedSequences],
          visitedScreens: [...tutorial.visitedScreens],
          dismissedHints: [...tutorial.dismissedHints],
          discoveredFeatures: [...tutorial.discoveredFeatures],
        },
      };

      set({
        isAdvancingWeek: true,
        weeklyTransactionError: null,
      });

      try {
        const execution = await runWeeklyWorkerTransaction(input);
        const current = get();
        const sourceIsStillActive = current.gameState === sourceState
          && current.weekSimulation === sourceSimulation;
        if (!sourceIsStillActive) return;

        const commit = execution.materializedCommit
          ?? materializeWeeklyWorkerCommit(sourceState, execution.commit);

        set({
          ...commit.patch,
          isAdvancingWeek: false,
          lastWeeklyExecutionRoute: execution.route,
          lastWeeklyWorkerTelemetry: execution.telemetry,
          weeklyTransactionError: null,
        });
        applyWeeklyTutorialCommands(commit.tutorialCommands);

        const committedState = commit.patch.gameState;
        if (committedState && !isBatchAdvanceInProgress()) {
          queueWeeklyAutosave(committedState, set);
        }
      } catch (error) {
        const current = get();
        const sourceIsStillActive = current.gameState === sourceState
          && current.weekSimulation === sourceSimulation;
        if (!sourceIsStillActive) return;
        const message = error instanceof Error ? error.message : String(error);
        set({
          isAdvancingWeek: false,
          weeklyTransactionError: message,
        });
        console.error("Weekly simulation failed:", error);
      } finally {
        const current = get();
        if (
          current.isAdvancingWeek
          && current.gameState === sourceState
          && current.weekSimulation === sourceSimulation
        ) {
          set({ isAdvancingWeek: false });
        }
      }
    },
  };
}
