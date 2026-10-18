/// <reference lib="webworker" />

import { WEEKLY_TRANSACTION_PROTOCOL_VERSION } from "@/engine/core/weeklyTransactionProtocol";
import {
  compactWeeklyWorkerCommit,
  runHeadlessWeeklyTransaction,
} from "@/stores/actions/weeklyHeadlessTransaction";
import type {
  WeeklyWorkerCommit,
  WeeklyWorkerInput,
  WeeklyWorkerMessage,
  WeeklyWorkerWireRequest,
} from "@/stores/actions/weeklyWorkerTypes";
import { materializeWeeklyWorkerWireState } from "@/stores/actions/weeklyWorkerSync";

const workerScope = self as DedicatedWorkerGlobalScope;
let cachedGameState: WeeklyWorkerInput["gameState"] | null = null;

workerScope.addEventListener(
  "message",
  async (event: MessageEvent<WeeklyWorkerWireRequest>) => {
    const request = event.data;
    if (
      request?.kind !== "weekly-transaction-request"
      || request.protocolVersion !== WEEKLY_TRANSACTION_PROTOCOL_VERSION
    ) {
      return;
    }

    try {
      const wireSyncStartedAt = performance.now();
      const input = materializeWeeklyWorkerWireState(cachedGameState, request.state);
      const wireSyncMs = Math.max(0, performance.now() - wireSyncStartedAt);
      const startedAt = performance.now();
      const fullCommit = runHeadlessWeeklyTransaction(input);
      // Preserve computeMs: canonical simulation only, before delta compaction.
      const computeMs = performance.now() - startedAt;
      const compactionStartedAt = performance.now();
      const state: WeeklyWorkerCommit = compactWeeklyWorkerCommit(input.gameState, fullCommit, computeMs);
      const compactionMs = Math.max(0, performance.now() - compactionStartedAt);
      const nextGameState = fullCommit.patch.gameState;
      if (!nextGameState) {
        throw new Error("Weekly simulation worker completed without an active game state.");
      }
      cachedGameState = nextGameState;
      const response: WeeklyWorkerMessage = {
        kind: "weekly-transaction-result",
        protocolVersion: WEEKLY_TRANSACTION_PROTOCOL_VERSION,
        jobId: request.job.id,
        source: request.job.source,
        state,
        timings: { wireSyncMs, compactionMs },
      };
      workerScope.postMessage(response);
    } catch (error) {
      const normalized = error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { name: "Error", message: String(error) };
      const response: WeeklyWorkerMessage = {
        kind: "weekly-transaction-error",
        protocolVersion: WEEKLY_TRANSACTION_PROTOCOL_VERSION,
        jobId: request.job.id,
        error: normalized,
      };
      workerScope.postMessage(response);
    }
  },
);

// Loading is observable without making readiness a new prerequisite for dispatch.
workerScope.postMessage({
  kind: "weekly-worker-ready",
  protocolVersion: WEEKLY_TRANSACTION_PROTOCOL_VERSION,
} satisfies WeeklyWorkerMessage);

export {};
