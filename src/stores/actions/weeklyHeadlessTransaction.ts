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
  return estimateResponseBytesWithCache(value);
}

function estimateSerializedBytes(serialized: string): number {
  return typeof TextEncoder === "function"
    ? new TextEncoder().encode(serialized).byteLength
    : serialized.length;
}

type JsonMetricsCache = {
  serializedObjects: WeakMap<object, string>;
  serializedByteLengths: Map<string, number>;
};

function createJsonMetricsCache(): JsonMetricsCache {
  return {
    serializedObjects: new WeakMap<object, string>(),
    serializedByteLengths: new Map<string, number>(),
  };
}

function serializeJsonValue(value: unknown, cache?: JsonMetricsCache): string {
  if (value !== null && typeof value === "object") {
    const cached = cache?.serializedObjects.get(value as object);
    if (cached !== undefined) return cached;
    const serialized = JSON.stringify(value) ?? "undefined";
    cache?.serializedObjects.set(value as object, serialized);
    return serialized;
  }
  return JSON.stringify(value) ?? "undefined";
}

function estimateResponseBytesWithCache(
  value: unknown,
  cache?: JsonMetricsCache,
): number {
  const serialized = serializeJsonValue(value, cache);
  const cachedBytes = cache?.serializedByteLengths.get(serialized);
  if (cachedBytes !== undefined) return cachedBytes;
  const bytes = estimateSerializedBytes(serialized);
  cache?.serializedByteLengths.set(serialized, bytes);
  return bytes;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function areJsonValuesEqual(
  source: unknown,
  next: unknown,
  cache?: JsonMetricsCache,
): boolean {
  if (Object.is(source, next)) return true;
  if (
    source === null
    || next === null
    || typeof source !== "object"
    || typeof next !== "object"
  ) return false;
  return serializeJsonValue(source, cache) === serializeJsonValue(next, cache);
}

function createRecordDelta(
  source: Record<string, unknown>,
  next: Record<string, unknown>,
  depth: number,
  cache: JsonMetricsCache,
): WeeklyRecordDelta {
  const changedEntries: Record<string, WeeklyValueDelta> = {};
  for (const key of Object.keys(next)) {
    const delta = createValueDelta(source[key], next[key], depth + 1, cache);
    if (delta) changedEntries[key] = delta;
  }
  const removedEntries = Object.keys(source)
    .filter((key) => !Object.prototype.hasOwnProperty.call(next, key));
  return { changedEntries, removedEntries };
}

function createArrayDelta(
  source: unknown[],
  next: unknown[],
  cache: JsonMetricsCache,
): WeeklyArrayDelta {
  const changedEntries: Record<string, WeeklyValueDelta> = {};
  for (let index = 0; index < next.length; index += 1) {
    if (!areJsonValuesEqual(source[index], next[index], cache)) {
      changedEntries[index] = { kind: "replace", value: next[index] };
    }
  }
  return { nextLength: next.length, changedEntries };
}

/**
 * Entity records benefit from one nested field-level delta (for example a
 * player changing only form and recent ratings). Deeper recursion made the
 * old compactor repeatedly stringify the same growing histories, so nested
 * objects below this boundary are compared once and replaced atomically.
 */
const MAX_WEEKLY_DELTA_DEPTH = 2;

function createArrayWindowDelta(
  source: unknown[],
  next: unknown[],
  cache: JsonMetricsCache,
): WeeklyValueDelta | null {
  // Rolling histories are deliberately small. Bounding this optimization
  // avoids quadratic overlap searches on large presentation arrays.
  if (source.length > 32 || next.length > 32) return null;
  const maximumOverlap = Math.min(source.length, next.length);
  for (let overlap = maximumOverlap; overlap > 0; overlap -= 1) {
    const sourceStart = source.length - overlap;
    let matches = true;
    for (let index = 0; index < overlap; index += 1) {
      if (!areJsonValuesEqual(source[sourceStart + index], next[index], cache)) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;
    const dropFirst = sourceStart;
    const append = next.slice(overlap);
    if (dropFirst === 0 && append.length === 0) return null;
    const delta: WeeklyValueDelta = {
      kind: "array-window",
      dropFirst,
      append,
    };
    return estimateResponseBytesWithCache(delta, cache)
      < estimateResponseBytesWithCache(next, cache)
      ? delta
      : null;
  }
  return null;
}

function createValueDelta(
  source: unknown,
  next: unknown,
  depth = 0,
  cache = createJsonMetricsCache(),
): WeeklyValueDelta | null {
  if (Object.is(source, next)) return null;
  if (Array.isArray(source) && Array.isArray(next)) {
    const windowDelta = createArrayWindowDelta(source, next, cache);
    if (windowDelta) return windowDelta;
  }
  if (depth >= MAX_WEEKLY_DELTA_DEPTH) {
    return areJsonValuesEqual(source, next, cache)
      ? null
      : { kind: "replace", value: next };
  }
  if (Array.isArray(source) && Array.isArray(next)) {
    const delta = createArrayDelta(source, next, cache);
    if (
      source.length === next.length
      && Object.keys(delta.changedEntries).length === 0
    ) return null;
    const nested: WeeklyValueDelta = { kind: "array", delta };
    if (estimateResponseBytesWithCache(nested, cache) < estimateResponseBytesWithCache(next, cache)) {
      return nested;
    }
  } else if (isPlainRecord(source) && isPlainRecord(next)) {
    const delta = createRecordDelta(source, next, depth, cache);
    if (
      Object.keys(delta.changedEntries).length === 0
      && delta.removedEntries.length === 0
    ) return null;
    const nested: WeeklyValueDelta = { kind: "record", delta };
    if (estimateResponseBytesWithCache(nested, cache) < estimateResponseBytesWithCache(next, cache)) {
      return nested;
    }
  }
  return { kind: "replace", value: next };
}

function materializeValueDelta(source: unknown, delta: WeeklyValueDelta): unknown {
  if (delta.kind === "replace") return delta.value;
  if (delta.kind === "array-window") {
    if (!Array.isArray(source)) throw new Error("Cannot materialize array-window delta.");
    return [...source.slice(delta.dropFirst), ...delta.append];
  }
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
    const jsonMetricsCache = createJsonMetricsCache();
    const changedFields: Partial<typeof nextState> = {};
    const recordDeltas: Partial<Record<keyof typeof nextState, WeeklyRecordDelta>> = {};
    const arrayDeltas: Partial<Record<keyof typeof nextState, WeeklyArrayDelta>> = {};
    const nextKeys = Object.keys(nextState) as Array<keyof typeof nextState>;
    for (const key of nextKeys) {
      const sourceValue = sourceState[key];
      const nextValue = nextState[key];
      if (Object.is(sourceValue, nextValue)) continue;

      if (Array.isArray(sourceValue) && Array.isArray(nextValue)) {
        const valueDelta = createValueDelta(sourceValue, nextValue, 0, jsonMetricsCache);
        if (!valueDelta) continue;
        if (valueDelta?.kind === "array") {
          const delta = valueDelta.delta;
          Object.assign(arrayDeltas, { [key]: delta });
          changedEntryCount += Object.keys(delta.changedEntries).length;
          payloadHotspots.push({
            field: String(key),
            strategy: "array-delta",
            bytes: estimateResponseBytesWithCache(delta, jsonMetricsCache),
          });
          continue;
        }
      }

      if (isPlainRecord(sourceValue) && isPlainRecord(nextValue)) {
        const valueDelta = createValueDelta(sourceValue, nextValue, 0, jsonMetricsCache);
        if (!valueDelta) continue;
        const delta = valueDelta?.kind === "record" ? valueDelta.delta : null;
        if (!delta) {
          Object.assign(changedFields, { [key]: nextValue });
          changedEntryCount += 1;
          payloadHotspots.push({
            field: String(key),
            strategy: "replace",
            bytes: estimateResponseBytesWithCache(nextValue, jsonMetricsCache),
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
          bytes: estimateResponseBytesWithCache(delta, jsonMetricsCache),
        });
        continue;
      }

      Object.assign(changedFields, { [key]: nextValue });
      changedEntryCount += 1;
      payloadHotspots.push({
        field: String(key),
        strategy: "replace",
        bytes: estimateResponseBytesWithCache(nextValue, jsonMetricsCache),
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
