import {
  WEEKLY_TRANSACTION_PROTOCOL_VERSION,
  createWeeklyTransactionJob,
  createWeeklyTransactionWorkerRequest,
  executeWeeklyTransactionWithFallback,
  isBrowserWorkerRuntimeAvailable,
  type WeeklyTransactionWorkerDispatcher,
  type WeeklyTransactionWorkerRequest,
  type WeeklyTransactionWorkerResponse,
  type WeeklyWorkerStageTimings,
} from "@/engine/core/weeklyTransactionProtocol";
import {
  compactWeeklyWorkerCommit,
  materializeWeeklyWorkerCommit,
  runHeadlessWeeklyTransaction,
} from "@/stores/actions/weeklyHeadlessTransaction";
import { createWeeklyWorkerWireState } from "@/stores/actions/weeklyWorkerSync";
import type {
  WeeklyWorkerCommit,
  WeeklyWorkerExecution,
  WeeklyWorkerInput,
  WeeklyWorkerMessage,
  WeeklyWorkerWireRequest,
} from "@/stores/actions/weeklyWorkerTypes";
import { getSeasonLength } from "@/engine/core/gameDate";

/**
 * A worker is an optimization, never a reason to strand the player on the
 * week-complete screen. Healthy weekly simulations finish comfortably inside
 * this budget; a stalled worker falls back to the authoritative main-thread
 * transaction while the result is still contextually immediate.
 */
export const WEEKLY_WORKER_TIMEOUT_MS = 8_000;
export const WEEKLY_WORKER_ROLLOVER_TIMEOUT_MS = 30_000;

export function getWeeklyWorkerTimeoutMs(input: WeeklyWorkerInput): number {
  const state = input.gameState;
  const seasonLength = getSeasonLength(state.fixtures, state.currentSeason);
  return state.currentWeek >= seasonLength
    ? WEEKLY_WORKER_ROLLOVER_TIMEOUT_MS
    : WEEKLY_WORKER_TIMEOUT_MS;
}

function monotonicNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

interface PendingTransaction {
  owner: Worker;
  timings: WeeklyWorkerStageTimings;
  resolve: (response: WeeklyTransactionWorkerResponse<WeeklyWorkerCommit>) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

let worker: Worker | null = null;
let workerReadiness: { owner: Worker; createdAt: number; readyAt: number | null } | null = null;
let workerBaseState: WeeklyWorkerInput["gameState"] | null = null;
let transactionSequence = 0;
let lifecycleGeneration = 0;

export function getWeeklySimulationGeneration(): number {
  return lifecycleGeneration;
}

class WeeklySimulationCancelledError extends Error {
  constructor() {
    super("Weekly simulation was cancelled because the active game changed.");
    this.name = "WeeklySimulationCancelledError";
  }
}
const pendingTransactions = new Map<string, PendingTransaction>();

function disposeWorker(
  reason = new Error("Weekly simulation worker was disposed."),
  owner: Worker | null = worker,
): void {
  if (!owner) return;
  owner.terminate();
  if (worker === owner) {
    worker = null;
    workerReadiness = null;
    workerBaseState = null;
  }
  for (const [jobId, pending] of pendingTransactions) {
    if (pending.owner !== owner) continue;
    clearTimeout(pending.timeoutId);
    pendingTransactions.delete(jobId);
    pending.reject(reason);
  }
}

function getWorker(): Worker | null {
  if (!isBrowserWorkerRuntimeAvailable()) return null;
  if (worker) return worker;

  const createdAt = monotonicNow();
  const activeWorker = new Worker(new URL("../workers/weeklySimulation.worker.ts", import.meta.url), {
    type: "module",
    name: "talentscout-weekly-simulation",
  });
  worker = activeWorker;
  const readiness = { owner: activeWorker, createdAt, readyAt: null as number | null };
  workerReadiness = readiness;
  activeWorker.addEventListener("message", (event: MessageEvent<WeeklyWorkerMessage>) => {
    if (worker !== activeWorker) return;
    const message = event.data;
    if (message.kind === "weekly-worker-ready") {
      if (message.protocolVersion === WEEKLY_TRANSACTION_PROTOCOL_VERSION) readiness.readyAt = monotonicNow();
      return;
    }
    const pending = pendingTransactions.get(message.jobId);
    if (!pending || pending.owner !== activeWorker) return;
    clearTimeout(pending.timeoutId);
    pendingTransactions.delete(message.jobId);

    if (message.kind === "weekly-transaction-error") {
      const error = new Error(message.error.message);
      error.name = message.error.name;
      if (message.error.stack) error.stack = message.error.stack;
      pending.reject(error);
      return;
    }
    if (message.timings) Object.assign(pending.timings, message.timings);
    pending.resolve({
      protocolVersion: message.protocolVersion,
      kind: message.kind,
      jobId: message.jobId,
      source: message.source,
      state: message.state,
    });
  });
  activeWorker.addEventListener("error", (event) => {
    if (worker !== activeWorker) return;
    disposeWorker(new Error(event.message || "Weekly simulation worker failed."), activeWorker);
  });
  activeWorker.addEventListener("messageerror", () => {
    if (worker !== activeWorker) return;
    disposeWorker(new Error("Weekly simulation worker returned unreadable data."), activeWorker);
  });
  return activeWorker;
}

/** Best-effort priming must never prevent an otherwise valid career from loading. */
export function warmWeeklySimulationWorker(): void {
  try {
    getWorker();
  } catch (error) {
    console.warn("Could not warm the weekly simulation worker:", error);
  }
}

function dispatchWeeklyTransaction(
  request: WeeklyTransactionWorkerRequest<WeeklyWorkerInput>,
  timings: WeeklyWorkerStageTimings,
): Promise<WeeklyTransactionWorkerResponse<WeeklyWorkerCommit>> {
    const activeWorker = getWorker();
    if (!activeWorker) {
      return Promise.reject(new Error("Weekly simulation worker is unavailable."));
    }

    const readiness = workerReadiness?.owner === activeWorker ? workerReadiness : null;
    timings.workerReadyAtRequest = readiness?.readyAt != null;
    return new Promise((resolve, reject) => {
      const timeoutMs = getWeeklyWorkerTimeoutMs(request.state);
      const timeoutId = setTimeout(() => {
        const pending = pendingTransactions.get(request.job.id);
        if (pending?.timeoutId !== timeoutId || pending.owner !== activeWorker) return;
        disposeWorker(new Error("Weekly simulation worker timed out."), activeWorker);
      }, timeoutMs);
      let postedAt: number | null = null;
      pendingTransactions.set(request.job.id, {
        owner: activeWorker, timings, reject, timeoutId,
        resolve: (response) => {
          if (readiness?.readyAt != null) {
            timings.workerStartupObservedMs = Math.max(0, readiness.readyAt - readiness.createdAt);
            if (postedAt !== null) {
              timings.workerReadinessWaitObservedMs = Math.max(0, readiness.readyAt - postedAt);
            }
          }
          resolve(response);
        },
      });
      try {
        const preparationStartedAt = monotonicNow();
        const wireRequest: WeeklyWorkerWireRequest = {
          kind: request.kind,
          protocolVersion: request.protocolVersion,
          job: request.job,
          state: createWeeklyWorkerWireState(workerBaseState, request.state),
        };
        timings.rendererRequestPreparationMs = Math.max(0, monotonicNow() - preparationStartedAt);
        postedAt = monotonicNow();
        activeWorker.postMessage(wireRequest);
        timings.rendererPostMessageMs = Math.max(0, monotonicNow() - postedAt);
      } catch (error) {
        clearTimeout(timeoutId);
        pendingTransactions.delete(request.job.id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
}

export async function runWeeklyWorkerTransaction(
  input: WeeklyWorkerInput,
): Promise<WeeklyWorkerExecution> {
  const generation = lifecycleGeneration;
  const assertActiveGeneration = () => {
    if (generation !== lifecycleGeneration) throw new WeeklySimulationCancelledError();
  };
  const startedAt = monotonicNow();
  const baseJob = createWeeklyTransactionJob(input.gameState);
  transactionSequence += 1;
  const job = { ...baseJob, id: `${baseJob.id}:job${transactionSequence}` };
  const request = createWeeklyTransactionWorkerRequest(job, input);
  const timings: WeeklyWorkerStageTimings = {};
  const dispatcher: WeeklyTransactionWorkerDispatcher<WeeklyWorkerInput, WeeklyWorkerCommit> = {
    run: (workerRequest) => dispatchWeeklyTransaction(workerRequest, timings),
  };
  const pendingResult = executeWeeklyTransactionWithFallback(
    request,
    () => {
      assertActiveGeneration();
      // Final telemetry represents the selected fallback, not a rejected worker response.
      delete timings.wireSyncMs;
      const computeStartedAt = monotonicNow();
      const fullCommit = runHeadlessWeeklyTransaction(input);
      const computeMs = monotonicNow() - computeStartedAt;
      const compactionStartedAt = monotonicNow();
      const compact = compactWeeklyWorkerCommit(input.gameState, fullCommit, computeMs);
      timings.compactionMs = Math.max(0, monotonicNow() - compactionStartedAt);
      return compact;
    },
    isBrowserWorkerRuntimeAvailable() ? dispatcher : undefined,
  );
  const dispatchedWorker = worker;
  const result = await pendingResult;
  assertActiveGeneration();
  const fallbackReason = result.fallbackReason === "synchronous-store-transaction"
    ? undefined
    : result.fallbackReason;
  const route = result.route === "worker" ? "worker" : "main-thread-fallback";
  let materializedCommit;
  const materializationStartedAt = monotonicNow();
  try {
    materializedCommit = materializeWeeklyWorkerCommit(
      input.gameState,
      result.state,
    );
  } catch (error) {
    disposeWorker(error instanceof Error ? error : new Error(String(error)), dispatchedWorker);
    throw error;
  }
  timings.rendererMaterializationMs = Math.max(0, monotonicNow() - materializationStartedAt);
  assertActiveGeneration();
  if (route === "worker" && worker === dispatchedWorker) {
    workerBaseState = materializedCommit.patch.gameState ?? null;
  } else if (route !== "worker") {
    disposeWorker(undefined, dispatchedWorker);
  }
  return {
    commit: result.state,
    materializedCommit,
    route,
    fallbackReason,
    telemetry: {
      ...result.state.metrics,
      ...timings,
      route,
      fallbackReason,
      roundTripMs: Math.max(0, monotonicNow() - startedAt),
    },
  };
}

/** Cancel in-flight work when a save is replaced or the game is disposed. */
export function terminateWeeklySimulationWorker(): void {
  lifecycleGeneration += 1;
  disposeWorker(new WeeklySimulationCancelledError());
}
