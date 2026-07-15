import {
  createWeeklyTransactionJob,
  createWeeklyTransactionWorkerRequest,
  executeWeeklyTransactionWithFallback,
  isBrowserWorkerRuntimeAvailable,
  type WeeklyTransactionWorkerDispatcher,
  type WeeklyTransactionWorkerRequest,
  type WeeklyTransactionWorkerResponse,
} from "@/engine/core/weeklyTransactionProtocol";
import {
  compactWeeklyWorkerCommit,
  runHeadlessWeeklyTransaction,
} from "@/stores/actions/weeklyHeadlessTransaction";
import type {
  WeeklyWorkerCommit,
  WeeklyWorkerExecution,
  WeeklyWorkerInput,
  WeeklyWorkerMessage,
  WeeklyWorkerWireRequest,
} from "@/stores/actions/weeklyWorkerTypes";

const WORKER_TIMEOUT_MS = 120_000;

function monotonicNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

interface PendingTransaction {
  resolve: (response: WeeklyTransactionWorkerResponse<WeeklyWorkerCommit>) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

let worker: Worker | null = null;
let transactionSequence = 0;
const pendingTransactions = new Map<string, PendingTransaction>();

function rejectAllPending(error: Error): void {
  for (const pending of pendingTransactions.values()) {
    clearTimeout(pending.timeoutId);
    pending.reject(error);
  }
  pendingTransactions.clear();
}

function disposeWorker(reason?: Error): void {
  worker?.terminate();
  worker = null;
  if (reason) rejectAllPending(reason);
}

function getWorker(): Worker | null {
  if (!isBrowserWorkerRuntimeAvailable()) return null;
  if (worker) return worker;

  worker = new Worker(new URL("../workers/weeklySimulation.worker.ts", import.meta.url), {
    type: "module",
    name: "talentscout-weekly-simulation",
  });
  worker.addEventListener("message", (event: MessageEvent<WeeklyWorkerMessage>) => {
    const message = event.data;
    const pending = pendingTransactions.get(message.jobId);
    if (!pending) return;
    clearTimeout(pending.timeoutId);
    pendingTransactions.delete(message.jobId);

    if (message.kind === "weekly-transaction-error") {
      const error = new Error(message.error.message);
      error.name = message.error.name;
      if (message.error.stack) error.stack = message.error.stack;
      pending.reject(error);
      return;
    }
    try {
      pending.resolve({
        protocolVersion: message.protocolVersion,
        kind: message.kind,
        jobId: message.jobId,
        source: message.source,
        state: JSON.parse(message.stateJson) as WeeklyWorkerCommit,
      });
    } catch (error) {
      pending.reject(new Error(
        `Weekly simulation worker returned invalid JSON: ${String(error)}`,
      ));
    }
  });
  worker.addEventListener("error", (event) => {
    disposeWorker(new Error(event.message || "Weekly simulation worker failed."));
  });
  worker.addEventListener("messageerror", () => {
    disposeWorker(new Error("Weekly simulation worker returned unreadable data."));
  });
  return worker;
}

/** Start loading the simulation bundle before the player advances their first week. */
export function warmWeeklySimulationWorker(): void {
  getWorker();
}

const dispatcher: WeeklyTransactionWorkerDispatcher<WeeklyWorkerInput, WeeklyWorkerCommit> = {
  run: (request: WeeklyTransactionWorkerRequest<WeeklyWorkerInput>) => {
    const activeWorker = getWorker();
    if (!activeWorker) {
      return Promise.reject(new Error("Weekly simulation worker is unavailable."));
    }

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        pendingTransactions.delete(request.job.id);
        reject(new Error("Weekly simulation worker timed out."));
        disposeWorker();
      }, WORKER_TIMEOUT_MS);
      pendingTransactions.set(request.job.id, { resolve, reject, timeoutId });
      const wireRequest: WeeklyWorkerWireRequest = {
        kind: request.kind,
        protocolVersion: request.protocolVersion,
        job: request.job,
        stateJson: JSON.stringify(request.state),
      };
      activeWorker.postMessage(wireRequest);
    });
  },
};

export async function runWeeklyWorkerTransaction(
  input: WeeklyWorkerInput,
): Promise<WeeklyWorkerExecution> {
  const startedAt = monotonicNow();
  const baseJob = createWeeklyTransactionJob(input.gameState);
  transactionSequence += 1;
  const job = { ...baseJob, id: `${baseJob.id}:job${transactionSequence}` };
  const request = createWeeklyTransactionWorkerRequest(job, input);
  const result = await executeWeeklyTransactionWithFallback(
    request,
    () => {
      const computeStartedAt = monotonicNow();
      const fullCommit = runHeadlessWeeklyTransaction(input);
      return compactWeeklyWorkerCommit(
        input.gameState,
        fullCommit,
        monotonicNow() - computeStartedAt,
      );
    },
    isBrowserWorkerRuntimeAvailable() ? dispatcher : undefined,
  );
  const fallbackReason = result.fallbackReason === "synchronous-store-transaction"
    ? undefined
    : result.fallbackReason;
  const route = result.route === "worker" ? "worker" : "main-thread-fallback";
  return {
    commit: result.state,
    route,
    fallbackReason,
    telemetry: {
      ...result.state.metrics,
      route,
      fallbackReason,
      roundTripMs: Math.max(0, monotonicNow() - startedAt),
    },
  };
}

/** Cancel in-flight work when a save is replaced or the game is disposed. */
export function terminateWeeklySimulationWorker(): void {
  disposeWorker(new Error("Weekly simulation was cancelled because the active game changed."));
}
