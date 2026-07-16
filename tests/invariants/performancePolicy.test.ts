import { describe, expect, it } from "vitest";
import {
  CHROMIUM_EMULATION_BUDGET,
  CHROMIUM_EMULATION_SEASON_ROLLOVER_BUDGET_MS,
  evaluateChromiumEmulationBudget,
  PHYSICAL_MINIMUM_HARDWARE_BUDGET,
} from "@/engine/telemetry/performancePolicy";

describe("performance policy", () => {
  it("keeps automated emulation checks finite and independently evaluable", () => {
    const passing = evaluateChromiumEmulationBudget(CHROMIUM_EMULATION_BUDGET);
    expect(passing).toEqual({
      coldLoadMs: true,
      navigationP95Ms: true,
      oneWeekAdvanceMs: true,
      jsHeapUsedBytes: true,
      domNodes: true,
    });
  });

  it("fails closed for missing, non-finite, and over-budget measurements", () => {
    const failing = evaluateChromiumEmulationBudget({
      coldLoadMs: Number.NaN,
      navigationP95Ms: CHROMIUM_EMULATION_BUDGET.navigationP95Ms + 1,
      oneWeekAdvanceMs: 0,
      jsHeapUsedBytes: 0,
    });

    expect(failing).toMatchObject({
      coldLoadMs: false,
      navigationP95Ms: false,
      oneWeekAdvanceMs: true,
      jsHeapUsedBytes: true,
      domNodes: false,
    });
  });

  it("keeps the physical-player interaction target stricter than the emulated guardrail", () => {
    expect(PHYSICAL_MINIMUM_HARDWARE_BUDGET.navigationP95Ms).toBeLessThan(
      CHROMIUM_EMULATION_BUDGET.navigationP95Ms,
    );
    expect(PHYSICAL_MINIMUM_HARDWARE_BUDGET.ordinaryWeekAdvanceP95Ms).toBeLessThan(
      CHROMIUM_EMULATION_BUDGET.oneWeekAdvanceMs,
    );
  });

  it("keeps season-boundary emulation finite and aligned with the physical target", () => {
    expect(Number.isFinite(CHROMIUM_EMULATION_SEASON_ROLLOVER_BUDGET_MS)).toBe(true);
    expect(CHROMIUM_EMULATION_SEASON_ROLLOVER_BUDGET_MS).toBeGreaterThan(
      CHROMIUM_EMULATION_BUDGET.oneWeekAdvanceMs,
    );
    expect(CHROMIUM_EMULATION_SEASON_ROLLOVER_BUDGET_MS).toBe(
      PHYSICAL_MINIMUM_HARDWARE_BUDGET.seasonRolloverP95Ms,
    );
  });
});
