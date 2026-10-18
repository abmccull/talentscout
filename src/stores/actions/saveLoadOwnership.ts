import type { GetState, SetState } from "./types";

let saveLoadSequence = 0;

/** One owner across slot loads, recovery restores, and conflict resolution. */
export async function runOwnedSaveLoad(
  get: GetState,
  set: SetState,
  kind: "load" | "conflict",
  work: (isCurrent: () => boolean) => Promise<void>,
): Promise<void> {
  const requestId = ++saveLoadSequence;
  const isCurrent = () => get().activeSaveLoadId === requestId;
  set({
    activeSaveLoadId: requestId,
    isLoadingSave: kind === "load",
    isResolvingSaveConflict: kind === "conflict",
  });
  try {
    await work(isCurrent);
  } catch (error) {
    // A superseded request no longer owns the active screen's failure feedback.
    if (isCurrent()) throw error;
  } finally {
    if (isCurrent()) {
      set({ activeSaveLoadId: null, isLoadingSave: false, isResolvingSaveConflict: false });
    }
  }
}
