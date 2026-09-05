import { isPortraitOnlyStateChange, preparePortraitWeekCommit } from "@/engine/players/portraits/gameIntegration";
import { runWeeklyWorkerTransaction } from "@/lib/weeklySimulationWorkerClient";
import { useTutorialStore } from "@/stores/tutorialStore";
import type { GameStoreState } from "../gameStoreTypes";
import type { GetState, SetState } from "./types";
import {
  queueWeeklyAutosave,
} from "./weeklyActions";
import {
  flushGameplayAutosave,
  snapshotPersistedGameState,
} from "./persistGameplayAutosave";
import { applyWeeklyTutorialCommands } from "./weeklyTutorialBridge";
import { materializeWeeklyWorkerCommit } from "./weeklyHeadlessTransaction";
import { isBatchAdvanceInProgress } from "./weeklyQuickScoutActions";
import type { WeeklyWorkerInput } from "./weeklyWorkerTypes";

export type WeeklyAsyncActions = Pick<GameStoreState, "advanceWeekAsync">;
let weeklyTransactionSequence = 0;

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
      const transactionId = ++weeklyTransactionSequence;
      const ownsOperation = () => get().activeWeeklyTransactionId === transactionId;
      const sourceIsCurrent = () => {
        const current = get();
        // Saving while a worker runs changes only delivery metadata. It must
        // not abort football progress or overwrite a concurrent gameplay edit.
        return current.gameState !== null
          && current.weekSimulation === sourceSimulation
          && isPortraitOnlyStateChange(
            { ...sourceState, lastSaved: current.gameState.lastSaved },
            current.gameState,
          );
      };
      const rejectStaleResult = () => {
        if (!ownsOperation()) return;
        set({
          isAdvancingWeek: false,
          activeWeeklyTransactionId: null,
          ...(get().weekSimulation === sourceSimulation ? {
            weeklyTransactionError: "Your career changed while this week was simulating. Your decisions were preserved. Retry the week to continue.",
          } : {}),
        });
      };

      if (!isBatchAdvanceInProgress()) {
        void flushGameplayAutosave(snapshotPersistedGameState(sourceState), set).catch((error) => {
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
        activeWeeklyTransactionId: transactionId,
        weeklyTransactionError: null,
      });

      try {
        const execution = await runWeeklyWorkerTransaction(input);
        if (!ownsOperation()) return;
        const current = get();
        if (!sourceIsCurrent()) {
          rejectStaleResult();
          return;
        }

        const commit = execution.materializedCommit
          ?? materializeWeeklyWorkerCommit(sourceState, execution.commit);

        const committedState = commit.patch.gameState && current.gameState
          ? preparePortraitWeekCommit(commit.patch.gameState, current.gameState)
          : commit.patch.gameState;
        set({
          ...commit.patch,
          ...(Object.prototype.hasOwnProperty.call(commit.patch, "gameState") ? { gameState: committedState } : {}),
          isAdvancingWeek: false,
          activeWeeklyTransactionId: null,
          lastWeeklyExecutionRoute: execution.route,
          lastWeeklyWorkerTelemetry: execution.telemetry,
          weeklyTransactionError: null,
        });
        applyWeeklyTutorialCommands(commit.tutorialCommands);

        if (committedState && !isBatchAdvanceInProgress()) {
          queueWeeklyAutosave(committedState, set);
        }
      } catch (error) {
        if (!ownsOperation()) return;
        if (!sourceIsCurrent()) {
          rejectStaleResult();
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        set({
          isAdvancingWeek: false,
          activeWeeklyTransactionId: null,
          weeklyTransactionError: message,
        });
        console.error("Weekly simulation failed:", error);
      } finally {
        // Lock ownership is independent of whether the source snapshot is valid.
        // An obsolete invocation must never release a newer invocation's lock.
        if (ownsOperation()) {
          set({ isAdvancingWeek: false, activeWeeklyTransactionId: null });
        }
      }
    },
  };
}
