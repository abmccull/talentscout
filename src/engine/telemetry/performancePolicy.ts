/**
 * One source of truth for automated regression guardrails and physical release
 * certification targets.  The two tiers intentionally differ: a throttled
 * Chromium journey is a repeatable regression signal, while the physical tier
 * is the player-facing release promise.
 */

export const PERFORMANCE_POLICY_VERSION = 1;

export const CHROMIUM_EMULATION_BUDGET = Object.freeze({
  coldLoadMs: 15_000,
  navigationP95Ms: 2_500,
  oneWeekAdvanceMs: 6_000,
  jsHeapUsedBytes: 512 * 1024 * 1024,
  domNodes: 18_000,
});

export const PHYSICAL_MINIMUM_HARDWARE_BUDGET = Object.freeze({
  coldStartToMenuP95Ms: 12_000,
  newCareerToDeskP95Ms: 15_000,
  currentSeasonLoadP95Ms: 8_000,
  thirtySeasonLoadP95Ms: 15_000,
  navigationP95Ms: 500,
  ordinaryWeekAdvanceP95Ms: 5_000,
  seasonRolloverP95Ms: 15_000,
  steadyProcessTreeMemoryBytes: 1.25 * 1024 * 1024 * 1024,
  peakProcessTreeMemoryBytes: 1.75 * 1024 * 1024 * 1024,
  sustainedMinimumFramesPerSecond: 30,
});

export type ChromiumEmulationMetric = keyof typeof CHROMIUM_EMULATION_BUDGET;

/** Returns a stable pass/fail map suitable for evidence artifacts and tests. */
export function evaluateChromiumEmulationBudget(
  measured: Partial<Record<ChromiumEmulationMetric, number>>,
): Record<ChromiumEmulationMetric, boolean> {
  return Object.fromEntries(
    Object.entries(CHROMIUM_EMULATION_BUDGET).map(([key, budget]) => {
      const value = measured[key as ChromiumEmulationMetric];
      return [
        key,
        typeof value === "number" && Number.isFinite(value) && value <= budget,
      ];
    }),
  ) as Record<ChromiumEmulationMetric, boolean>;
}

/** Physical certification cannot be inferred from Chromium throttling. */
export const PHYSICAL_CERTIFICATION_LIMITATION =
  "Chromium emulation is regression evidence only; physical minimum-hardware certification remains required.";
