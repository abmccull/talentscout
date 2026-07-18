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
      const input = materializeWeeklyWorkerWireState(cachedGameState, request.state);
      const startedAt = performance.now();
      const fullCommit = runHeadlessWeeklyTransaction(input);
      const state: WeeklyWorkerCommit = compactWeeklyWorkerCommit(
        input.gameState,
        fullCommit,
        performance.now() - startedAt,
      );
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

export {};
