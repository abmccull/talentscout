import type {
  GameModeId,
  RunKind,
  Specialization,
} from "./types";
import type {
  WeeklyTransactionExecutionPlan,
  WeeklyTransactionJob,
} from "./weeklyTransactionProtocol";

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

export interface WeeklySimulationPhaseTiming {
  phase: WeeklySimulationPhase;
  startedAtMs: number;
  completedAtMs: number;
  elapsedMs: number;
}

export type WeeklySimulationDiagnosticValue = string | number | boolean | null;

export interface WeeklySimulationTelemetry {
  transaction: WeeklyTransactionJob;
  execution: WeeklyTransactionExecutionPlan;
  sourceSeason: number;
  sourceWeek: number;
  mode: Specialization;
  gameModeId: GameModeId;
  runKind: RunKind;
  startedAtMs: number;
  completedAtMs: number;
  elapsedMs: number;
  phases: readonly WeeklySimulationPhaseTiming[];
  diagnostics?: Readonly<Record<string, WeeklySimulationDiagnosticValue>>;
}

export type WeeklySimulationTelemetryListener = (
  telemetry: WeeklySimulationTelemetry,
) => void;

const telemetryListeners = new Set<WeeklySimulationTelemetryListener>();

export function observeWeeklySimulationTelemetry(
  listener: WeeklySimulationTelemetryListener,
): () => void {
  telemetryListeners.add(listener);
  return () => telemetryListeners.delete(listener);
}

export function cloneTransaction(
  job: WeeklyTransactionJob,
): WeeklyTransactionJob {
  return { ...job, source: { ...job.source } };
}

export function cloneExecution(
  execution: WeeklyTransactionExecutionPlan,
): WeeklyTransactionExecutionPlan {
  return { ...execution };
}

export function clonePhaseTimings(
  timings: readonly WeeklySimulationPhaseTiming[],
): WeeklySimulationPhaseTiming[] {
  return timings.map((timing) => ({ ...timing }));
}

export function cloneDiagnostics(
  diagnostics?: Readonly<Record<string, WeeklySimulationDiagnosticValue>>,
): Record<string, WeeklySimulationDiagnosticValue> | undefined {
  if (!diagnostics || Object.keys(diagnostics).length === 0) return undefined;
  return { ...diagnostics };
}

export function cloneTelemetry(
  telemetry: WeeklySimulationTelemetry,
): WeeklySimulationTelemetry {
  return {
    ...telemetry,
    transaction: cloneTransaction(telemetry.transaction),
    execution: cloneExecution(telemetry.execution),
    phases: clonePhaseTimings(telemetry.phases),
    ...(telemetry.diagnostics
      ? { diagnostics: cloneDiagnostics(telemetry.diagnostics) }
      : {}),
  };
}

export function emitTelemetry(telemetry: WeeklySimulationTelemetry): void {
  for (const listener of telemetryListeners) {
    try {
      listener(cloneTelemetry(telemetry));
    } catch {
      // Observability must never turn a completed career week into a failure.
    }
  }
}
