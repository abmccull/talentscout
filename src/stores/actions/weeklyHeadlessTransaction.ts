import type { TutorialState } from "@/stores/tutorialStore";
import { observeWeeklySimulationTelemetry } from "@/engine/core/weeklySimulationPipeline";
import type { GameStoreState } from "../gameStoreTypes";
import { createProgressionActions } from "./progressionActions";
import type { GetState, SetState } from "./types";
import {
  createWeeklyActions,
  type WeeklyActionRuntime,
} from "./weeklyActions";
import type {
  WeeklyHeadlessCommit,
  WeeklyTransactionStorePatch,
  WeeklyTutorialCommand,
  WeeklyWorkerCommit,
  WeeklyWorkerInput,
  WeeklyArrayDelta,
  WeeklyRecordDelta,
  WeeklyValueDelta,
} from "./weeklyWorkerTypes";

const WEEKLY_PATCH_KEYS = [
  "gameState",
  "isLoaded",
  "currentScreen",
  "lastWeekSummary",
  "scenarioProgress",
  "scenarioOutcome",
  "scenarioOutcomeScenarioId",
  "pendingCelebration",
] as const satisfies readonly (keyof WeeklyTransactionStorePatch)[];

function createHeadlessTutorialState(
  input: WeeklyWorkerInput["tutorial"],
  commands: WeeklyTutorialCommand[],
): TutorialState {
  const state = {
    completedSequences: new Set(input.completedSequences),
    visitedScreens: new Set(input.visitedScreens),
    dismissedHints: new Set(input.dismissedHints),
    discoveredFeatures: new Set(input.discoveredFeatures),
    completeMilestone: (id: Parameters<TutorialState["completeMilestone"]>[0]) => {
      commands.push({ type: "completeMilestone", id });
    },
    startSequence: (id: Parameters<TutorialState["startSequence"]>[0]) => {
      commands.push({ type: "startSequence", id });
    },
    queueSequence: (id: Parameters<TutorialState["queueSequence"]>[0]) => {
      commands.push({ type: "queueSequence", id });
    },
    showHint: (hint: Parameters<TutorialState["showHint"]>[0]) => {
      commands.push({ type: "showHint", hint });
    },
    recordFeatureDiscovery: (feature: string) => {
      commands.push({ type: "recordFeatureDiscovery", feature });
    },
  };
  return state as unknown as TutorialState;
}

/** Execute the canonical transaction against an isolated, persistence-free store. */
export function runHeadlessWeeklyTransaction(
  input: WeeklyWorkerInput,
): WeeklyHeadlessCommit {
  const tutorialCommands: WeeklyTutorialCommand[] = [];
  const patch: WeeklyTransactionStorePatch = {};
  let simulationPhases: WeeklyHeadlessCommit["simulationPhases"];
  const stopObserving = observeWeeklySimulationTelemetry((telemetry) => {
    simulationPhases = telemetry.phases.map(({ phase, elapsedMs }) => ({
      phase,
      elapsedMs,
    }));
  });

  let store = {
    gameState: input.gameState,
    weekSimulation: input.weekSimulation,
    currentScreen: input.currentScreen,
    isLoaded: input.isLoaded,
  } as unknown as GameStoreState;

  const get: GetState = () => store;
  const set: SetState = (partial) => {
    const resolved = typeof partial === "function" ? partial(store) : partial;
    store = { ...store, ...resolved };
    for (const key of WEEKLY_PATCH_KEYS) {
      if (Object.prototype.hasOwnProperty.call(resolved, key)) {
        Object.assign(patch, { [key]: resolved[key] });
      }
    }
  };

  const runtime: WeeklyActionRuntime = {
    persistenceEnabled: false,
    getTutorialState: () => createHeadlessTutorialState(input.tutorial, tutorialCommands),
  };
  const progressionActions = createProgressionActions(get, set);
  const weeklyActions = createWeeklyActions(get, set, runtime);
  store = {
    ...store,
    ...progressionActions,
    ...weeklyActions,
    getPendingMatches: () => [],
  };

  try {
    weeklyActions.advanceWeek();
  } finally {
    stopObserving();
  }
  if (!Object.prototype.hasOwnProperty.call(patch, "gameState")) {
    throw new Error("Headless weekly transaction completed without a state commit.");
  }

  return {
    patch,
    tutorialCommands,
    ...(simulationPhases ? { simulationPhases } : {}),
  };
}

function estimateResponseBytes(value: unknown): number {
  const serialized = JSON.stringify(value) ?? "undefined";
  return typeof TextEncoder === "function"
    ? new TextEncoder().encode(serialized).byteLength
    : serialized.length;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function createRecordDelta(
  source: Record<string, unknown>,
  next: Record<string, unknown>,
): WeeklyRecordDelta {
  const changedEntries: Record<string, WeeklyValueDelta> = {};
  for (const key of Object.keys(next)) {
    const delta = createValueDelta(source[key], next[key]);
    if (delta) changedEntries[key] = delta;
  }
  const removedEntries = Object.keys(source)
    .filter((key) => !Object.prototype.hasOwnProperty.call(next, key));
  return { changedEntries, removedEntries };
}

function createArrayDelta(source: unknown[], next: unknown[]): WeeklyArrayDelta {
  const changedEntries: Record<string, WeeklyValueDelta> = {};
  for (let index = 0; index < next.length; index += 1) {
    const delta = createValueDelta(source[index], next[index]);
    if (delta) changedEntries[index] = delta;
  }
  return { nextLength: next.length, changedEntries };
}

function createValueDelta(source: unknown, next: unknown): WeeklyValueDelta | null {
  if (Object.is(source, next)) return null;
  if (Array.isArray(source) && Array.isArray(next)) {
    const delta = createArrayDelta(source, next);
    if (
      source.length === next.length
      && Object.keys(delta.changedEntries).length === 0
    ) return null;
    const nested: WeeklyValueDelta = { kind: "array", delta };
    if (estimateResponseBytes(nested) < estimateResponseBytes(next)) return nested;
  } else if (isPlainRecord(source) && isPlainRecord(next)) {
    const delta = createRecordDelta(source, next);
    if (
      Object.keys(delta.changedEntries).length === 0
      && delta.removedEntries.length === 0
    ) return null;
    const nested: WeeklyValueDelta = { kind: "record", delta };
    if (estimateResponseBytes(nested) < estimateResponseBytes(next)) return nested;
  }
  return { kind: "replace", value: next };
}

function materializeValueDelta(source: unknown, delta: WeeklyValueDelta): unknown {
  if (delta.kind === "replace") return delta.value;
  if (delta.kind === "record") {
    if (!isPlainRecord(source)) throw new Error("Cannot materialize nested record delta.");
    const next = { ...source };
    for (const [key, entryDelta] of Object.entries(delta.delta.changedEntries)) {
      next[key] = materializeValueDelta(source[key], entryDelta);
    }
    for (const key of delta.delta.removedEntries) delete next[key];
    return next;
  }
  if (!Array.isArray(source)) throw new Error("Cannot materialize nested array delta.");
  const next: unknown[] = source.slice(0, delta.delta.nextLength);
  next.length = delta.delta.nextLength;
  for (const [index, entryDelta] of Object.entries(delta.delta.changedEntries)) {
    next[Number(index)] = materializeValueDelta(source[Number(index)], entryDelta);
  }
  return next;
}

/** Convert a full isolated-store result into a shallow immutable state delta. */
export function compactWeeklyWorkerCommit(
  sourceState: WeeklyWorkerInput["gameState"],
  commit: WeeklyHeadlessCommit,
  computeMs: number,
): WeeklyWorkerCommit {
  const { gameState: nextState, ...patch } = commit.patch;
  if (nextState === undefined) {
    throw new Error("Weekly transaction cannot be compacted without a game-state commit.");
  }

  let gameState: WeeklyWorkerCommit["gameState"];
  let changedFieldCount: number;
  let changedEntryCount = 0;
  const payloadHotspots: NonNullable<
    WeeklyWorkerCommit["metrics"]["payloadHotspots"]
  > = [];
  if (nextState === null) {
    gameState = { kind: "replace", state: null };
    changedFieldCount = 1;
    changedEntryCount = 1;
  } else {
    const changedFields: Partial<typeof nextState> = {};
    const recordDeltas: Partial<Record<keyof typeof nextState, WeeklyRecordDelta>> = {};
    const arrayDeltas: Partial<Record<keyof typeof nextState, WeeklyArrayDelta>> = {};
    const nextKeys = Object.keys(nextState) as Array<keyof typeof nextState>;
    for (const key of nextKeys) {
      const sourceValue = sourceState[key];
      const nextValue = nextState[key];
      if (Object.is(sourceValue, nextValue)) continue;

      if (Array.isArray(sourceValue) && Array.isArray(nextValue)) {
        const valueDelta = createValueDelta(sourceValue, nextValue);
        if (!valueDelta) continue;
        if (valueDelta?.kind === "array") {
          const delta = valueDelta.delta;
          Object.assign(arrayDeltas, { [key]: delta });
          changedEntryCount += Object.keys(delta.changedEntries).length;
          payloadHotspots.push({
            field: String(key),
            strategy: "array-delta",
            bytes: estimateResponseBytes(delta),
          });
          continue;
        }
      }

      if (isPlainRecord(sourceValue) && isPlainRecord(nextValue)) {
        const valueDelta = createValueDelta(sourceValue, nextValue);
        if (!valueDelta) continue;
        const delta = valueDelta?.kind === "record" ? valueDelta.delta : null;
        if (!delta) {
          Object.assign(changedFields, { [key]: nextValue });
          changedEntryCount += 1;
          payloadHotspots.push({
            field: String(key),
            strategy: "replace",
            bytes: estimateResponseBytes(nextValue),
          });
          continue;
        }
        const deltaEntryCount = Object.keys(delta.changedEntries).length
          + delta.removedEntries.length;
        Object.assign(recordDeltas, { [key]: delta });
        changedEntryCount += deltaEntryCount;
        payloadHotspots.push({
          field: String(key),
          strategy: "record-delta",
          bytes: estimateResponseBytes(delta),
        });
        continue;
      }

      Object.assign(changedFields, { [key]: nextValue });
      changedEntryCount += 1;
      payloadHotspots.push({
        field: String(key),
        strategy: "replace",
        bytes: estimateResponseBytes(nextValue),
      });
    }
    const removedFields = (Object.keys(sourceState) as Array<keyof typeof sourceState>)
      .filter((key) => !Object.prototype.hasOwnProperty.call(nextState, key));
    payloadHotspots.push(...removedFields.map((key) => ({
      field: String(key),
      strategy: "remove" as const,
      bytes: 0,
    })));
    payloadHotspots.sort((left, right) => right.bytes - left.bytes);
    payloadHotspots.splice(8);

    gameState = {
      kind: "delta",
      changedFields,
      recordDeltas,
      arrayDeltas,
      removedFields,
    };
    changedFieldCount = Object.keys(changedFields).length
      + Object.keys(recordDeltas).length
      + Object.keys(arrayDeltas).length
      + removedFields.length;
    changedEntryCount += removedFields.length;

  }

  const compact = {
    patch,
    gameState,
    tutorialCommands: commit.tutorialCommands,
    metrics: {
      computeMs: Math.max(0, computeMs),
      changedFieldCount,
      changedEntryCount,
      totalFieldCount: Object.keys(sourceState).length,
      responseBytes: 0,
      ...(commit.simulationPhases ? { phaseTimings: commit.simulationPhases } : {}),
      ...(payloadHotspots.length > 0 ? { payloadHotspots } : {}),
    },
  } satisfies WeeklyWorkerCommit;
  compact.metrics.responseBytes = estimateResponseBytes(compact);
  return compact;
}

/** Reconstruct the authoritative next state only after source identity validation. */
export function materializeWeeklyWorkerCommit(
  sourceState: WeeklyWorkerInput["gameState"],
  commit: WeeklyWorkerCommit,
): WeeklyHeadlessCommit {
  let gameState: WeeklyTransactionStorePatch["gameState"];
  if (commit.gameState.kind === "replace") {
    gameState = commit.gameState.state;
  } else {
    const materialized = {
      ...sourceState,
      ...commit.gameState.changedFields,
    };
    for (const [rawKey, delta] of Object.entries(commit.gameState.recordDeltas)) {
      const key = rawKey as keyof typeof materialized;
      const sourceRecord = sourceState[key];
      if (!isPlainRecord(sourceRecord) || !delta) {
        throw new Error(`Cannot materialize record delta for ${rawKey}.`);
      }
      const nextRecord: Record<string, unknown> = { ...sourceRecord };
      for (const [entryKey, entryDelta] of Object.entries(delta.changedEntries)) {
        nextRecord[entryKey] = materializeValueDelta(sourceRecord[entryKey], entryDelta);
      }
      for (const removedKey of delta.removedEntries) delete nextRecord[removedKey];
      Object.assign(materialized, { [key]: nextRecord });
    }
    for (const [rawKey, delta] of Object.entries(commit.gameState.arrayDeltas)) {
      const key = rawKey as keyof typeof materialized;
      const sourceArray = sourceState[key];
      if (!Array.isArray(sourceArray) || !delta) {
        throw new Error(`Cannot materialize array delta for ${rawKey}.`);
      }
      const nextArray: unknown[] = sourceArray.slice(0, delta.nextLength);
      nextArray.length = delta.nextLength;
      for (const [index, entryDelta] of Object.entries(delta.changedEntries)) {
        nextArray[Number(index)] = materializeValueDelta(
          sourceArray[Number(index)],
          entryDelta,
        );
      }
      Object.assign(materialized, { [key]: nextArray });
    }
    for (const key of commit.gameState.removedFields) {
      delete (materialized as Partial<typeof materialized>)[key];
    }
    gameState = materialized;
  }
  return {
    patch: { ...commit.patch, gameState },
    tutorialCommands: commit.tutorialCommands,
  };
}
