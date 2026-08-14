import type { GameState } from "@/engine/core/types";
import { getActiveSaveProvider } from "@/lib/activeSaveProvider";
import { persistGameState } from "@/lib/saveProvider";
import { createAutosaveQueue, scheduleCoalescedGameplayPersist } from "./autosaveQueue";
import type { SetState } from "./types";

interface AutosaveRequest {
  state: GameState;
  set: SetState;
}

let persistTail = Promise.resolve();
let committedSavedAt = 0;

async function persistAutosaveSnapshot(state: GameState): Promise<void> {
  const run = persistTail.then(async () => {
    if (state.lastSaved > 0 && state.lastSaved < committedSavedAt) return;
    const provider = await getActiveSaveProvider();
    await persistGameState(provider, "autosave", state, "Autosave");
    committedSavedAt = Math.max(committedSavedAt, state.lastSaved);
  });
  persistTail = run.then(() => undefined, () => undefined);
  await run;
}

const autosaveQueue = createAutosaveQueue<AutosaveRequest>({
  schedule: scheduleCoalescedGameplayPersist,
  onRequest: ({ set }) => set({ autosaveError: null }),
  persist: async ({ state }) => {
    await persistAutosaveSnapshot(state);
  },
  onSuccess: ({ set }) => set({ autosaveError: null }),
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

export async function flushGameplayAutosave(state: GameState, set: SetState): Promise<void> {
  autosaveQueue.request({ state, set });
  await autosaveQueue.flushNow();
}

export const queueWeeklyAutosave = queueGameplayAutosave;
