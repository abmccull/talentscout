import { areEquivalentSaveStates } from "@/lib/saveStateComparison";
import { queueGameplayAutosave, snapshotPersistedGameState } from "./persistGameplayAutosave";
import type { GetState, SetState } from "./types";

/**
 * The live career/finance action groups share this commit boundary. Headless
 * simulation keeps its plain setter and cannot schedule persistence.
 */
export function createDurableGameplaySetter(get: GetState, set: SetState): SetState {
  return (partial) => {
    const before = get();
    const patch = typeof partial === "function" ? partial(before) : partial;
    set(patch);
    const after = get();
    const next = patch.gameState;
    if (!before.gameState || !next || after.gameState !== next) return;
    // Rejected choices may add feedback, and no-op helpers may clone a record.
    // Neither should create a decision save. Reference equality makes unchanged
    // world branches cheap; only changed branches need structural comparison.
    if (areEquivalentSaveStates({ ...before.gameState, inbox: next.inbox }, next)) return;
    // A synchronous subscriber may replace the career during set(); the exact
    // committed reference above prevents this action from saving over it.
    queueGameplayAutosave(snapshotPersistedGameState(next, after.activeSession), set);
  };
}
