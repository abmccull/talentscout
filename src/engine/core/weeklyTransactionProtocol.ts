import type { GameState, Specialization } from "./types";

/**
 * Wire contract for a future worker-backed weekly transaction. The live game
 * deliberately keeps the authoritative transaction synchronous until every
 * phase has a worker-safe implementation; this contract lets callers opt into
 * a validated worker later without creating a parallel simulation today.
 */
export const WEEKLY_TRANSACTION_PROTOCOL_VERSION = 1 as const;

export type WeeklyTransactionExecutionRoute =
  | "main-thread"
  | "main-thread-fallback"
  | "worker";

export type WeeklyTransactionFallbackReason =
  | "synchronous-store-transaction"
  | "worker-unavailable"
  | "worker-failed"
  | "worker-response-mismatch";

export interface WeeklyWorkerMetrics {
  computeMs: number;
  changedFieldCount: number;
  changedEntryCount: number;
  totalFieldCount: number;
  responseBytes: number;
  payloadHotspots?: Array<{
    field: string;
    strategy: "replace" | "record-delta" | "array-delta" | "remove";
    bytes: number;
  }>;
  phaseTimings?: Array<{
    phase: string;
    elapsedMs: number;
  }>;
}

export interface WeeklyWorkerTelemetry extends WeeklyWorkerMetrics {
  route: "worker" | "main-thread-fallback";
  fallbackReason?: Exclude<
    WeeklyTransactionFallbackReason,
    "synchronous-store-transaction"
  >;
  roundTripMs: number;
}

export interface WeeklyTransactionSource {
  seed: string;
  mode: Specialization;
  season: number;
  week: number;
}

export interface WeeklyTransactionJob {
  protocolVersion: typeof WEEKLY_TRANSACTION_PROTOCOL_VERSION;
  kind: "weekly-transaction";
  id: string;
  source: WeeklyTransactionSource;
}

export interface WeeklyTransactionSourceState {
  seed: GameState["seed"];
  currentSeason: GameState["currentSeason"];
  currentWeek: GameState["currentWeek"];
  scout: Pick<GameState["scout"], "primarySpecialization">;
}

export interface WeeklyTransactionExecutionPlan {
  route: Exclude<WeeklyTransactionExecutionRoute, "worker">;
  fallbackReason: WeeklyTransactionFallbackReason;
}

export interface WeeklyTransactionWorkerRequest<State = GameState> {
  protocolVersion: typeof WEEKLY_TRANSACTION_PROTOCOL_VERSION;
  kind: "weekly-transaction-request";
  job: WeeklyTransactionJob;
  state: State;
}

export interface WeeklyTransactionWorkerResponse<State = GameState> {
  protocolVersion: typeof WEEKLY_TRANSACTION_PROTOCOL_VERSION;
  kind: "weekly-transaction-result";
  jobId: string;
  source: WeeklyTransactionSource;
  state: State;
}

export interface WeeklyTransactionWorkerDispatcher<Input = GameState, Output = Input> {
  run: (
    request: WeeklyTransactionWorkerRequest<Input>,
  ) => Promise<WeeklyTransactionWorkerResponse<Output>>;
}

export interface WeeklyTransactionExecutionResult<State> {
  route: WeeklyTransactionExecutionRoute;
  fallbackReason?: WeeklyTransactionFallbackReason;
  state: State;
}

export function createWeeklyTransactionJob(
  state: WeeklyTransactionSourceState,
): WeeklyTransactionJob {
  const source: WeeklyTransactionSource = {
    seed: state.seed,
    mode: state.scout.primarySpecialization,
    season: state.currentSeason,
    week: state.currentWeek,
  };
  return {
    protocolVersion: WEEKLY_TRANSACTION_PROTOCOL_VERSION,
    kind: "weekly-transaction",
    id: `weekly:${source.seed}:s${source.season}:w${source.week}:${source.mode}`,
    source,
  };
}

/**
 * The current complete transaction closes over synchronous Zustand actions,
 * interaction gates, and UI feedback. Advertise that constraint explicitly
 * rather than trying to transfer partially-mutated state to a browser worker.
 */
export function createMainThreadWeeklyTransactionPlan(
  _job: WeeklyTransactionJob,
): WeeklyTransactionExecutionPlan {
  return {
    route: "main-thread",
    fallbackReason: "synchronous-store-transaction",
  };
}

export function createWeeklyTransactionWorkerRequest<State>(
  job: WeeklyTransactionJob,
  state: State,
): WeeklyTransactionWorkerRequest<State> {
  return {
    protocolVersion: WEEKLY_TRANSACTION_PROTOCOL_VERSION,
    kind: "weekly-transaction-request",
    job,
    state,
  };
}

export function isMatchingWeeklyTransactionWorkerResponse<State>(
  job: WeeklyTransactionJob,
  response: WeeklyTransactionWorkerResponse<State>,
): boolean {
  return response.protocolVersion === WEEKLY_TRANSACTION_PROTOCOL_VERSION
    && response.kind === "weekly-transaction-result"
    && response.jobId === job.id
    && response.source.seed === job.source.seed
    && response.source.mode === job.source.mode
    && response.source.season === job.source.season
    && response.source.week === job.source.week;
}

/** Browser support check only; this function never creates a Worker. */
export function isBrowserWorkerRuntimeAvailable(): boolean {
  return typeof Worker === "function";
}

/**
 * A future async caller may use this runner after it has supplied a complete
 * worker implementation. Invalid or failed worker replies always fall back to
 * the authoritative main-thread callback, preventing stale worker output from
 * becoming game truth.
 */
export async function executeWeeklyTransactionWithFallback<Input, Output = Input>(
  request: WeeklyTransactionWorkerRequest<Input>,
  runOnMainThread: () => Output | Promise<Output>,
  dispatcher?: WeeklyTransactionWorkerDispatcher<Input, Output>,
): Promise<WeeklyTransactionExecutionResult<Output>> {
  if (!dispatcher) {
    return {
      route: "main-thread-fallback",
      fallbackReason: "worker-unavailable",
      state: await runOnMainThread(),
    };
  }

  try {
    const response = await dispatcher.run(request);
    if (isMatchingWeeklyTransactionWorkerResponse(request.job, response)) {
      return { route: "worker", state: response.state };
    }
    return {
      route: "main-thread-fallback",
      fallbackReason: "worker-response-mismatch",
      state: await runOnMainThread(),
    };
  } catch {
    return {
      route: "main-thread-fallback",
      fallbackReason: "worker-failed",
      state: await runOnMainThread(),
    };
  }
}
