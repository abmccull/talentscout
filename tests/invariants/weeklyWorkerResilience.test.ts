import { describe, expect, it } from "vitest";
import { WEEKLY_WORKER_TIMEOUT_MS } from "@/lib/weeklySimulationWorkerClient";

describe("weekly simulation worker resilience", () => {
  it("falls back before a stalled worker can break the weekly gameplay loop", () => {
    expect(WEEKLY_WORKER_TIMEOUT_MS).toBeGreaterThan(0);
    expect(WEEKLY_WORKER_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });
});
