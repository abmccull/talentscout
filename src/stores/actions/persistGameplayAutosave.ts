import type { GameState } from "@/engine/core/types";
import { getActiveSaveProvider } from "@/lib/activeSaveProvider";
import { persistGameState } from "@/lib/saveProvider";
import { createAutosaveQueue, scheduleCoalescedGameplayPersist } from "./autosaveQueue";
import type { SetState } from "./types";

interface AutosaveRequest {
  state: GameState;
  set: SetState;
  generation: number;
}

let persistTail = Promise.resolve();
let committedSavedAt = 0;
let lastSnapshotSavedAt = 0;
let generation = 0;
let latestRequest: AutosaveRequest | null = null;

/** Return whether the previous career still has queued or in-flight work. */
export function resetGameplayAutosaveWatermark(): boolean {
  const hadPendingAutosave = latestRequest !== null;
  generation += 1;
  committedSavedAt = 0;
  lastSnapshotSavedAt = 0;
  latestRequest = null;
  return hadPendingAutosave;
}

async function persistAutosaveSnapshot(request: AutosaveRequest): Promise<void> {
  const { state, generation: requestedGeneration } = request;
  const run = persistTail.then(async () => {
    if (requestedGeneration !== generation) return;
    if (state.lastSaved > 0 && state.lastSaved < committedSavedAt) return;
    const provider = await getActiveSaveProvider();
    if (requestedGeneration !== generation) return;
    try {
      await persistGameState(provider, "autosave", state, "Autosave");
    } catch (error) {
      // An old career's failed write must not reject the new career's flush.
      if (requestedGeneration === generation) throw error;
      return;
    }
    if (requestedGeneration === generation) {
      committedSavedAt = Math.max(committedSavedAt, state.lastSaved);
    }
  });
  // Keep this tail across generations. A write already inside IndexedDB cannot
  // be cancelled, and the replacement career must always persist after it.
  persistTail = run.then(() => undefined, () => undefined);
  await run;
}

const autosaveQueue = createAutosaveQueue<AutosaveRequest>({
  schedule: scheduleCoalescedGameplayPersist,
  onRequest: (request) => {
    latestRequest = request;
    request.set({ autosaveError: null });
  },
  persist: persistAutosaveSnapshot,
  onSuccess: (request) => {
    if (request.generation !== generation) return;
    if (latestRequest === request) latestRequest = null;
    request.set({ autosaveError: null });
  },
  onError: (error, request) => {
    if (request.generation !== generation) return;
    if (latestRequest === request) latestRequest = null;
    const message = error instanceof Error ? error.message : String(error);
    console.warn("Autosave failed:", error);
    request.set({ autosaveError: message });
  },
});

export function snapshotPersistedGameState(
  gameState: GameState,
  activeSession?: GameState["activeObservationSession"] | null,
): GameState {
  // Wall time can move backwards after a clock correction. Fresh snapshots
  // must still sort after this career's earlier snapshots and committed save.
  // A loaded future-dated career keeps its own baseline; a new generation
  // starts from its own state instead of inheriting the previous career's time.
  const previousSavedAt = Number.isFinite(gameState.lastSaved)
    ? Math.max(0, gameState.lastSaved)
    : 0;
  lastSnapshotSavedAt = Math.max(
    Date.now(),
    Math.max(previousSavedAt, committedSavedAt, lastSnapshotSavedAt) + 1,
  );
  return {
    ...gameState,
    activeObservationSession: activeSession === undefined
      ? gameState.activeObservationSession ?? null
      : activeSession,
    lastSaved: lastSnapshotSavedAt,
  };
}

export function queueGameplayAutosave(state: GameState, set: SetState): void {
  // Weekly commits can carry the previous save's timestamp. Capture every
  // newly queued gameplay result here without replacing the live store object.
  autosaveQueue.request({ state: snapshotPersistedGameState(state), set, generation });
}

export async function flushGameplayAutosave(state: GameState, set: SetState): Promise<void> {
  autosaveQueue.request({ state, set, generation });
  await autosaveQueue.flushNow();
}

export const queueWeeklyAutosave = queueGameplayAutosave;
