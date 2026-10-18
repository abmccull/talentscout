import { persistCareerEnd } from "@/lib/careerDisposition";
import { preparePortraitWeekCommit } from "@/engine/players/portraits/gameIntegration";
import type { GameState } from "@/engine/core/types";
import { getWeeklySimulationGeneration, runWeeklyWorkerTransaction } from "@/lib/weeklySimulationWorkerClient";
import { useTutorialStore } from "@/stores/tutorialStore";
import type { GameStoreState } from "../gameStoreTypes";
import type { GetState, SetState } from "./types";
import { queueWeeklyAutosave } from "./weeklyActions";
import { flushGameplayAutosave, snapshotPersistedGameState } from "./persistGameplayAutosave";
import { applyWeeklyTutorialCommands } from "./weeklyTutorialBridge";
import { materializeWeeklyWorkerCommit } from "./weeklyHeadlessTransaction";
import { isBatchAdvanceInProgress } from "./weeklyQuickScoutActions";
import type { WeeklyWorkerInput } from "./weeklyWorkerTypes";

export type WeeklyAsyncActions = Pick<GameStoreState, "advanceWeekAsync">;

// These saved mirrors do not change football state. The corresponding live
// session and simulation identities are checked separately before committing.
const LIVE_METADATA_FIELDS = new Set(["playerPortraits", "lastSaved", "activeObservationSession", "pendingWeekRecovery"]);
function isCompatibleSource(source: GameState, current: GameState | null): boolean {
  if (!current) return false;
  if (source === current) return true;
  return [...new Set([...Object.keys(source), ...Object.keys(current)])]
    .filter(key => !LIVE_METADATA_FIELDS.has(key))
    .every(key => Object.is(source[key as keyof GameState], current[key as keyof GameState]));
}

function prepareCommittedState(simulated: GameState, latest: GameState): GameState {
  const committed = preparePortraitWeekCommit(simulated, latest);
  const savedAt = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
  const recovery = committed.pendingWeekRecovery;
  return {
    ...committed,
    lastSaved: Math.max(savedAt(committed.lastSaved), savedAt(latest.lastSaved)),
    // Canonical session clears/transitions win over a saved pre-week mirror.
    activeObservationSession: committed.activeObservationSession ?? null,
    pendingWeekRecovery: recovery?.season === committed.currentSeason && recovery.week === committed.currentWeek
      ? recovery : null,
  };
}

/** Commit only the active job's compatible world; ownership controls its latch. */
export function createWeeklyAsyncActions(get: GetState, set: SetState): WeeklyAsyncActions {
  let activeAdvance: { token: symbol; generation: number } | null = null;
  return {
    advanceWeekAsync: async () => {
      const source = get();
      const sourceState = source.gameState;
      const sourceSimulation = source.weekSimulation;
      const sourceSession = source.activeSession ?? null;
      if (!sourceState || !sourceSimulation || source.isAdvancingWeek) return "skipped";
      const owner = { token: Symbol("weekly-advance"), generation: getWeeklySimulationGeneration() };
      activeAdvance = owner;
      const ownsAdvance = () => activeAdvance === owner && owner.generation === getWeeklySimulationGeneration();

      if (!isBatchAdvanceInProgress()) {
        void flushGameplayAutosave(snapshotPersistedGameState(sourceState), set).catch(error => {
          console.warn("Pre-advance checkpoint autosave failed:", error);
        });
      }
      const tutorial = useTutorialStore.getState();
      const input: WeeklyWorkerInput = {
        gameState: sourceState, weekSimulation: sourceSimulation,
        currentScreen: source.currentScreen, isLoaded: source.isLoaded,
        tutorial: {
          completedSequences: [...tutorial.completedSequences], visitedScreens: [...tutorial.visitedScreens],
          dismissedHints: [...tutorial.dismissedHints], discoveredFeatures: [...tutorial.discoveredFeatures],
        },
      };
      set({ isAdvancingWeek: true, weeklyTransactionError: null });
      try {
        const execution = await runWeeklyWorkerTransaction(input);
        if (!ownsAdvance()) return "cancelled";
        const current = get();
        if (!isCompatibleSource(sourceState, current.gameState)
          || current.weekSimulation !== sourceSimulation
          || (current.activeSession ?? null) !== sourceSession) {
          set({ isAdvancingWeek: false,
            weeklyTransactionError: "Your career changed while this week was being resolved. Your changes are safe; complete the week again." });
          return "cancelled";
        }
        const commit = execution.materializedCommit ?? materializeWeeklyWorkerCommit(sourceState, execution.commit);
        const committedState = commit.patch.gameState && current.gameState
          ? prepareCommittedState(commit.patch.gameState, current.gameState) : commit.patch.gameState;
        if (committedState?.careerEnd) persistCareerEnd(committedState);
        set({
          ...commit.patch,
          ...(Object.prototype.hasOwnProperty.call(commit.patch, "gameState") ? { gameState: committedState?.careerEnd ? null : committedState } : {}),
          isAdvancingWeek: false, lastWeeklyExecutionRoute: execution.route,
          lastWeeklyWorkerTelemetry: execution.telemetry, weeklyTransactionError: null,
        });
        applyWeeklyTutorialCommands(commit.tutorialCommands);
        if (committedState && (committedState.careerEnd || !isBatchAdvanceInProgress())) queueWeeklyAutosave(committedState, set);
        return "committed";
      } catch (error) {
        if (!ownsAdvance()) return "cancelled";
        set({ isAdvancingWeek: false, weeklyTransactionError: error instanceof Error ? error.message : String(error) });
        console.error("Weekly simulation failed:", error);
        return "failed";
      } finally {
        if (activeAdvance === owner) {
          activeAdvance = null;
          if (owner.generation === getWeeklySimulationGeneration() && get().isAdvancingWeek) set({ isAdvancingWeek: false });
        }
      }
    },
  };
}
