import { describe, expect, it, vi } from "vitest";
import {
  createMainThreadWeeklyTransactionPlan,
  createWeeklyTransactionJob,
  createWeeklyTransactionWorkerRequest,
  executeWeeklyTransactionWithFallback,
  isBrowserWorkerRuntimeAvailable,
  isMatchingWeeklyTransactionWorkerResponse,
} from "@/engine/core/weeklyTransactionProtocol";

const SOURCE = {
  seed: "weekly-worker-contract",
  currentSeason: 3,
  currentWeek: 17,
  scout: { primarySpecialization: "youth" as const },
};

describe("weekly transaction worker protocol", () => {
  it("has a deterministic serializable job identity and explicit synchronous plan", () => {
    const job = createWeeklyTransactionJob(SOURCE);

    expect(JSON.parse(JSON.stringify(job))).toEqual(job);
    expect(job).toMatchObject({
      id: "weekly:weekly-worker-contract:s3:w17:youth",
      source: { mode: "youth", season: 3, week: 17 },
    });
    expect(createMainThreadWeeklyTransactionPlan(job)).toEqual({
      route: "main-thread",
      fallbackReason: "synchronous-store-transaction",
    });
    expect(typeof isBrowserWorkerRuntimeAvailable()).toBe("boolean");
  });

  it("falls back to the authoritative main-thread result without a worker", async () => {
    const job = createWeeklyTransactionJob(SOURCE);
    const request = createWeeklyTransactionWorkerRequest(job, { weeks: 1 });
    const mainThread = vi.fn(() => ({ weeks: 2 }));

    await expect(
      executeWeeklyTransactionWithFallback(request, mainThread),
    ).resolves.toEqual({
      route: "main-thread-fallback",
      fallbackReason: "worker-unavailable",
      state: { weeks: 2 },
    });
    expect(mainThread).toHaveBeenCalledTimes(1);

    await expect(
      executeWeeklyTransactionWithFallback(request, mainThread, {
        run: async () => {
          throw new Error("worker stopped");
        },
      }),
    ).resolves.toEqual({
      route: "main-thread-fallback",
      fallbackReason: "worker-failed",
      state: { weeks: 2 },
    });
    expect(mainThread).toHaveBeenCalledTimes(2);
  });

  it("accepts only a response for the exact source transaction", async () => {
    const job = createWeeklyTransactionJob(SOURCE);
    const request = createWeeklyTransactionWorkerRequest(job, { weeks: 1 });
    const mainThread = vi.fn(() => ({ weeks: 2 }));
    const matchingResponse = {
      protocolVersion: request.protocolVersion,
      kind: "weekly-transaction-result" as const,
      jobId: job.id,
      source: job.source,
      state: { weeks: 3 },
    };

    expect(isMatchingWeeklyTransactionWorkerResponse(job, matchingResponse)).toBe(true);
    await expect(
      executeWeeklyTransactionWithFallback(request, mainThread, {
        run: async () => matchingResponse,
      }),
    ).resolves.toEqual({ route: "worker", state: { weeks: 3 } });
    expect(mainThread).not.toHaveBeenCalled();

    const staleResponse = { ...matchingResponse, jobId: "weekly:stale" };
    await expect(
      executeWeeklyTransactionWithFallback(request, mainThread, {
        run: async () => staleResponse,
      }),
    ).resolves.toEqual({
      route: "main-thread-fallback",
      fallbackReason: "worker-response-mismatch",
      state: { weeks: 2 },
    });
    expect(mainThread).toHaveBeenCalledTimes(1);
  });
});
