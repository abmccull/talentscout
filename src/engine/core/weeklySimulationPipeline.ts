import type { GameState, Specialization } from "./types";
import { getActiveGameMode } from "./gameStatePartitions";
import { compactLongCareerHistory } from "../world/saveRetention";
import {
  createMainThreadWeeklyTransactionPlan,
  createWeeklyTransactionJob,
  type WeeklyTransactionExecutionPlan,
  type WeeklyTransactionJob,
} from "./weeklyTransactionProtocol";

/**
 * Ordered checkpoints for the one authoritative week transaction. They are
 * deliberately presentation-free: manual advancement, fast-forward, and
 * batch advancement all pass through the same action and therefore share this
 * exact order.
 */
export const CANONICAL_WEEKLY_SIMULATION_PHASES = [
  "activity-resolution",
  "world-systems",
  "core-world-tick",
  "post-tick-accountability",
  "season-rollover",
  "finalize",
] as const;

export type WeeklySimulationPhase =
  (typeof CANONICAL_WEEKLY_SIMULATION_PHASES)[number];

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
  sourceSeason: number;
  sourceWeek: number;
  completedPhases: readonly WeeklySimulationPhase[];
  activePhase?: WeeklySimulationPhase;
  phaseTimings: readonly WeeklySimulationPhaseTiming[];
  startedAtMs: number;
  completedAtMs?: number;
  transaction: WeeklyTransactionJob;
  execution: WeeklyTransactionExecutionPlan;
}

export interface WeeklySimulationPhaseTiming {
  phase: WeeklySimulationPhase;
  startedAtMs: number;
  completedAtMs: number;
  elapsedMs: number;
}

export interface WeeklySimulationTelemetry {
  transaction: WeeklyTransactionJob;
  execution: WeeklyTransactionExecutionPlan;
  sourceSeason: number;
  sourceWeek: number;
  mode: Specialization;
  startedAtMs: number;
  completedAtMs: number;
  elapsedMs: number;
  phases: readonly WeeklySimulationPhaseTiming[];
}

export interface WeeklySimulationPipelineOptions {
  /** Injectable clock keeps timing telemetry deterministic in tests. */
  now?: () => number;
  /** Metadata only: the live transaction remains synchronous for now. */
  transaction?: WeeklyTransactionJob;
  execution?: WeeklyTransactionExecutionPlan;
  onTelemetry?: (telemetry: WeeklySimulationTelemetry) => void;
}

export type WeeklySimulationTelemetryListener = (
  telemetry: WeeklySimulationTelemetry,
) => void;

const telemetryListeners = new Set<WeeklySimulationTelemetryListener>();

/**
 * Observe completed transactions without persisting timing data into a save.
 * Listener failures are deliberately isolated from the authoritative game loop.
 */
export function observeWeeklySimulationTelemetry(
  listener: WeeklySimulationTelemetryListener,
): () => void {
  telemetryListeners.add(listener);
  return () => telemetryListeners.delete(listener);
}

function monotonicNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function cloneTransaction(job: WeeklyTransactionJob): WeeklyTransactionJob {
  return { ...job, source: { ...job.source } };
}

function cloneExecution(
  execution: WeeklyTransactionExecutionPlan,
): WeeklyTransactionExecutionPlan {
  return { ...execution };
}

function clonePhaseTimings(
  timings: readonly WeeklySimulationPhaseTiming[],
): WeeklySimulationPhaseTiming[] {
  return timings.map((timing) => ({ ...timing }));
}

function cloneTelemetry(
  telemetry: WeeklySimulationTelemetry,
): WeeklySimulationTelemetry {
  return {
    ...telemetry,
    transaction: cloneTransaction(telemetry.transaction),
    execution: cloneExecution(telemetry.execution),
    phases: clonePhaseTimings(telemetry.phases),
  };
}

function emitTelemetry(telemetry: WeeklySimulationTelemetry): void {
  for (const listener of telemetryListeners) {
    try {
      listener(cloneTelemetry(telemetry));
    } catch {
      // Observability must never turn a completed career week into a failure.
    }
  }
}

export interface WeeklySimulationPipeline {
  readonly snapshot: () => WeeklySimulationPipelineSnapshot;
  enter: (phase: WeeklySimulationPhase) => void;
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
    sourceSeason: source.currentSeason,
    sourceWeek: source.currentWeek,
    completedPhases: [...completedPhases],
    ...(activePhase ? { activePhase: activePhase.phase } : {}),
    phaseTimings: clonePhaseTimings(phaseTimings),
    startedAtMs,
    ...(completedAtMs !== undefined ? { completedAtMs } : {}),
    transaction: cloneTransaction(transaction),
    execution: cloneExecution(execution),
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
          startedAtMs,
          completedAtMs,
          elapsedMs: Math.max(0, completedAtMs - startedAtMs),
          phases: clonePhaseTimings(phaseTimings),
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
