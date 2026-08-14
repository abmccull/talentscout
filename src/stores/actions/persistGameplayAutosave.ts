import type { GameState } from "@/engine/core/types";
import { getActiveSaveProvider } from "@/lib/activeSaveProvider";
import { persistGameState } from "@/lib/saveProvider";
import { createAutosaveQueue, scheduleAfterPaint } from "./autosaveQueue";
import type { SetState } from "./types";

interface AutosaveRequest {
  state: GameState;
  set: SetState;
}

const autosaveQueue = createAutosaveQueue<AutosaveRequest>({
  schedule: scheduleAfterPaint,
  onRequest: ({ set }) => set({ autosaveError: null }),
  persist: async ({ state }) => {
    const provider = await getActiveSaveProvider();
    await persistGameState(provider, "autosave", state, "Autosave");
  },
  onError: (error, { set }) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("Autosave failed:", error);
    set({ autosaveError: message });
  },
});

export function snapshotPersistedGameState(
  gameState: GameState,
  activeSession?: GameState["activeObservationSession"] | null,
): GameState {
  return {
    ...gameState,
    activeObservationSession: activeSession ?? gameState.activeObservationSession ?? null,
    lastSaved: Date.now(),
  };
}

export function queueGameplayAutosave(state: GameState, set: SetState): void {
  autosaveQueue.request({ state, set });
}

export const queueWeeklyAutosave = queueGameplayAutosave;
