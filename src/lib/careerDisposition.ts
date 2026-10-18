import type { GameState } from "@/engine/core/types";

const PREFIX = "talentscout:ended-career:v1:";

function dispositionKey(state: GameState): string {
  return `${PREFIX}${state.careerInstanceId ?? `${state.runManifest?.runId ?? "legacy"}:${state.scout.id}:${state.createdAt ?? 0}`}`;
}

function dispositionStorage(): Storage {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch { /* Browser storage can be disabled by policy. */ }
  throw new Error("Ironman career records are unavailable. Enable local storage before continuing this career.");
}

/**
 * A small independent tombstone keeps older manual slots and recovery copies
 * from reopening an ended run. Nothing is deleted: the terminal snapshot and
 * earlier records remain available for inspection/export. Worker evaluation
 * never calls this function; only the owned main-thread commit may do so.
 */
export function persistCareerEnd(state: GameState): void {
  if (!state.careerEnd) return;
  const storage = dispositionStorage();
  const key = dispositionKey(state);
  const record = JSON.stringify({ version: 1, ...state.careerEnd });
  try {
    storage.setItem(key, record);
    if (storage.getItem(key) !== record) throw new Error("read-back did not match");
  } catch (error) {
    throw new Error(`Unable to record the end of this Ironman career. Retry after freeing local storage. ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Every playable load (including imports and recovery) uses this boundary. */
export function assertCareerCanResume(state: GameState): void {
  if (state.careerEnd) {
    throw new Error("This Ironman career ended after dismissal. Its saved history is preserved, but it cannot be resumed. Start a new career to play again.");
  }
  if (state.difficulty !== "ironman") return;
  let record: unknown;
  try {
    const stored = dispositionStorage().getItem(dispositionKey(state));
    if (!stored) return;
    record = JSON.parse(stored);
  } catch (error) {
    throw new Error(`Unable to read this Ironman career's end record. Your saves are preserved. ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!record || typeof record !== "object" || !("reason" in record) || record.reason !== "ironman-fired") {
    throw new Error("This Ironman career's end record cannot be read. Your saves are preserved.");
  }
  throw new Error("This Ironman career ended after dismissal. Earlier manual saves and recovery copies preserve its history and cannot resume it.");
}
