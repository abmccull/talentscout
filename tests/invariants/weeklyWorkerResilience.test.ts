import { describe, expect, it } from "vitest";
import {
  getWeeklyWorkerTimeoutMs,
  WEEKLY_WORKER_ROLLOVER_TIMEOUT_MS,
  WEEKLY_WORKER_TIMEOUT_MS,
} from "@/lib/weeklySimulationWorkerClient";
import type { WeeklyWorkerInput } from "@/stores/actions/weeklyWorkerTypes";

describe("weekly simulation worker resilience", () => {
  it("falls back before a stalled worker can break the weekly gameplay loop", () => {
    expect(WEEKLY_WORKER_TIMEOUT_MS).toBeGreaterThan(0);
    expect(WEEKLY_WORKER_TIMEOUT_MS).toBeLessThanOrEqual(10_000);
  });

  it("allows the authoritative season rollover more time without weakening ordinary weeks", () => {
    const input = {
      gameState: {
        currentSeason: 1,
        currentWeek: 38,
        fixtures: [],
      },
    } as unknown as WeeklyWorkerInput;

    expect(getWeeklyWorkerTimeoutMs(input)).toBe(WEEKLY_WORKER_ROLLOVER_TIMEOUT_MS);
    expect(WEEKLY_WORKER_ROLLOVER_TIMEOUT_MS).toBeGreaterThan(WEEKLY_WORKER_TIMEOUT_MS);
    expect(WEEKLY_WORKER_ROLLOVER_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});
