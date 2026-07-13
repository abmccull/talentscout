/**
 * Build-scope configuration.
 *
 * Youth Early Access is enabled by default so unsupported specializations stay
 * hidden until the full game is ready. Opt out with:
 *   NEXT_PUBLIC_YOUTH_EARLY_ACCESS=false
 *
 * Demo mode remains separate and opt-in:
 *   NEXT_PUBLIC_DEMO=true
 * It adds short-season/scenario restrictions on top of the current build scope.
 */

import type { Specialization } from "@/engine/core/types";

export const IS_YOUTH_EARLY_ACCESS =
  process.env.NEXT_PUBLIC_YOUTH_EARLY_ACCESS !== "false";

export const YOUTH_EARLY_ACCESS_ALLOWED_SPECS: Specialization[] = ["youth"];

export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO === "true";

export const DEMO_MAX_SEASONS = 2;

export const DEMO_ALLOWED_SPECS: Specialization[] = ["youth"];

export const DEMO_SCENARIO_IDS = ["the_rescue_job"];

/**
 * Check if the demo season limit has been reached.
 */
export function isDemoLimitReached(currentSeason: number): boolean {
  return IS_DEMO && currentSeason > DEMO_MAX_SEASONS;
}
