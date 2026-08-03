import type {
  GameModeId,
  GameState,
  RunKind,
  Specialization,
} from "./types";
import {
  getActiveGameMode,
  getActiveGameModeId,
  getActiveRunKind,
} from "./gameStatePartitions";
import { compactLongCareerHistory } from "../world/saveRetention";
import {
  createMainThreadWeeklyTransactionPlan,
  createWeeklyTransactionJob,
  type WeeklyTransactionExecutionPlan,
  type WeeklyTransactionJob,
} from "./weeklyTransactionProtocol";
import {
  CANONICAL_WEEKLY_SIMULATION_PHASES,
  cloneDiagnostics,
  cloneExecution,
  clonePhaseTimings,
  cloneTelemetry,
  cloneTransaction,
  emitTelemetry,
  type WeeklySimulationDiagnosticValue,
  type WeeklySimulationPhase,
  type WeeklySimulationPhaseTiming,
  type WeeklySimulationTelemetry,
} from "./weeklySimulationTelemetry";

export {
  CANONICAL_WEEKLY_SIMULATION_PHASES,
  observeWeeklySimulationTelemetry,
  type WeeklySimulationDiagnosticValue,
  type WeeklySimulationPhase,
  type WeeklySimulationPhaseTiming,
  type WeeklySimulationTelemetry,
  type WeeklySimulationTelemetryListener,
} from "./weeklySimulationTelemetry";

export interface WeekAdvancePreflightInput {
  hasWeekSimulation: boolean;
  hasPendingDayInteractions: boolean;
  demoLimitReached: boolean;
  hasPendingInteractiveMatch: boolean;
}

export type WeekAdvancePreflight =
  | { kind: "start-week-simulation" }
  | { kind: "await-day-interaction" }
  | { kind: "show-demo-end" }
  | { kind: "start-pending-match" }
  | { kind: "ready" };

/**
 * Keep gate priority stable across every advancement entry point. In
 * particular, starting the day-by-day shell precedes the demo check because
 * legacy saves and the existing UI expect that first click to enter the shell.
 */
export function evaluateWeekAdvancePreflight(
  input: WeekAdvancePreflightInput,
): WeekAdvancePreflight {
  if (!input.hasWeekSimulation) return { kind: "start-week-simulation" };
  if (input.hasPendingDayInteractions) return { kind: "await-day-interaction" };
  if (input.demoLimitReached) return { kind: "show-demo-end" };
  if (input.hasPendingInteractiveMatch) return { kind: "start-pending-match" };
  return { kind: "ready" };
}

export interface WeeklySimulationPipelineSnapshot {
  mode: Specialization;
  gameModeId: GameModeId;
  runKind: RunKind;
  sourceSeason: number;
  sourceWeek: number;
  completedPhases: readonly WeeklySimulationPhase[];
  activePhase?: WeeklySimulationPhase;
  phaseTimings: readonly WeeklySimulationPhaseTiming[];
  startedAtMs: number;
  completedAtMs?: number;
  transaction: WeeklyTransactionJob;
  execution: WeeklyTransactionExecutionPlan;
  diagnostics?: Readonly<Record<string, WeeklySimulationDiagnosticValue>>;
}

export interface WeeklySimulationPipelineOptions {
  /** Injectable clock keeps timing telemetry deterministic in tests. */
  now?: () => number;
  /** Metadata only: the live transaction remains synchronous for now. */
  transaction?: WeeklyTransactionJob;
  execution?: WeeklyTransactionExecutionPlan;
  onTelemetry?: (telemetry: WeeklySimulationTelemetry) => void;
}

function monotonicNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export interface WeeklySimulationPipeline {
  readonly snapshot: () => WeeklySimulationPipelineSnapshot;
  enter: (phase: WeeklySimulationPhase) => void;
  noteDiagnostic: (
    key: string,
    value: WeeklySimulationDiagnosticValue | undefined,
  ) => void;
  complete: (state: GameState) => GameState;
}

/**
 * A small typed transaction guard around the existing mature simulation path.
 * It does not perform a second simulation or persist a trace; it makes phase
 * ordering explicit while the large weekly action is gradually decomposed.
 */
export function createWeeklySimulationPipeline(
  source: GameState,
  options: WeeklySimulationPipelineOptions = {},
): WeeklySimulationPipeline {
  let nextPhaseIndex = 0;
  const completedPhases: WeeklySimulationPhase[] = [];
  const mode = getActiveGameMode(source);
  const gameModeId = getActiveGameModeId(source);
  const runKind = getActiveRunKind(source);
  const transaction = options.transaction ?? createWeeklyTransactionJob(source);
  const execution = options.execution ?? createMainThreadWeeklyTransactionPlan(transaction);
  const now = options.now ?? monotonicNow;
  // A malformed optional diagnostics clock must not leak Infinity into an
  // otherwise valid week transaction.
  let lastObservedAtMs = 0;
  const readNow = (): number => {
    const candidate = now();
    if (!Number.isFinite(candidate)) return lastObservedAtMs;
    lastObservedAtMs = Math.max(lastObservedAtMs, candidate);
    return lastObservedAtMs;
  };
  const startedAtMs = readNow();
  const phaseTimings: WeeklySimulationPhaseTiming[] = [];
  let activePhase: { phase: WeeklySimulationPhase; startedAtMs: number } | null = null;
  let completedAtMs: number | undefined;
  let completedTelemetry: WeeklySimulationTelemetry | null = null;
  const diagnostics: Record<string, WeeklySimulationDiagnosticValue> = {};

  const finishActivePhase = (atMs: number): void => {
    if (!activePhase) return;
    phaseTimings.push({
      phase: activePhase.phase,
      startedAtMs: activePhase.startedAtMs,
      completedAtMs: atMs,
      elapsedMs: Math.max(0, atMs - activePhase.startedAtMs),
    });
    activePhase = null;
  };

  const snapshot = (): WeeklySimulationPipelineSnapshot => ({
    mode,
    gameModeId,
    runKind,
    sourceSeason: source.currentSeason,
    sourceWeek: source.currentWeek,
    completedPhases: [...completedPhases],
    ...(activePhase ? { activePhase: activePhase.phase } : {}),
    phaseTimings: clonePhaseTimings(phaseTimings),
    startedAtMs,
    ...(completedAtMs !== undefined ? { completedAtMs } : {}),
    transaction: cloneTransaction(transaction),
    execution: cloneExecution(execution),
    ...(Object.keys(diagnostics).length > 0
      ? { diagnostics: cloneDiagnostics(diagnostics) }
      : {}),
  });

  return {
    snapshot,
    enter: (phase) => {
      const expected = CANONICAL_WEEKLY_SIMULATION_PHASES[nextPhaseIndex];
      if (phase !== expected) {
        throw new Error(
          `Weekly simulation phase out of order: expected ${expected ?? "completion"}, received ${phase}`,
        );
      }
      const enteredAtMs = readNow();
      finishActivePhase(enteredAtMs);
      completedPhases.push(phase);
      nextPhaseIndex += 1;
      activePhase = { phase, startedAtMs: enteredAtMs };
    },
    noteDiagnostic: (key, value) => {
      if (!key) return;
      if (value === undefined) {
        delete diagnostics[key];
        return;
      }
      if (typeof value === "number" && !Number.isFinite(value)) return;
      diagnostics[key] = value;
    },
    complete: (state) => {
      if (nextPhaseIndex !== CANONICAL_WEEKLY_SIMULATION_PHASES.length) {
        const expected = CANONICAL_WEEKLY_SIMULATION_PHASES[nextPhaseIndex];
        throw new Error(
          `Weekly simulation completed before phase ${expected ?? "unknown"}`,
        );
      }
      if (
        state.currentSeason === source.currentSeason
        && state.currentWeek === source.currentWeek
      ) {
        throw new Error("Weekly simulation completed without advancing the game date");
      }
      if (!completedTelemetry) {
        completedAtMs = readNow();
        finishActivePhase(completedAtMs);
        completedTelemetry = {
          transaction: cloneTransaction(transaction),
          execution: cloneExecution(execution),
          sourceSeason: source.currentSeason,
          sourceWeek: source.currentWeek,
          mode,
          gameModeId,
          runKind,
          startedAtMs,
          completedAtMs,
          elapsedMs: Math.max(0, completedAtMs - startedAtMs),
          phases: clonePhaseTimings(phaseTimings),
          ...(Object.keys(diagnostics).length > 0
            ? { diagnostics: cloneDiagnostics(diagnostics) }
            : {}),
        };
        try {
          options.onTelemetry?.(cloneTelemetry(completedTelemetry));
        } catch {
          // A diagnostics callback cannot invalidate the authoritative commit.
        }
        emitTelemetry(completedTelemetry);
      }
      return state;
    },
  };
}

/**
 * Runtime compaction occurs as soon as a season has been archived, rather than
 * waiting for the next save/load round trip. The compactor preserves causal
 * references and is idempotent, so this is safe for all advancement modes.
 */
export function compactCompletedSeasonHistory(
  before: Pick<GameState, "currentSeason">,
  after: GameState,
): GameState {
  return after.currentSeason > before.currentSeason
    ? compactLongCareerHistory(after)
    : after;
}
