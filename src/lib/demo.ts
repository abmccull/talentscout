/**
 * Demo build configuration.
 *
 * When NEXT_PUBLIC_DEMO=true, the game runs in limited demo mode:
 * - Only 2 seasons of play
 * - Only the "youth" specialization is available
 * - Only the "rescue-job" scenario is available
 *
 * Build with: NEXT_PUBLIC_DEMO=true npm run build
 */

import type { Specialization } from "@/engine/core/types";

export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO === "true";

export const DEMO_MAX_SEASONS = 2;

export const DEMO_ALLOWED_SPECS: Specialization[] = ["youth"];

export const DEMO_SCENARIO_IDS = ["rescue-job"];

/**
 * Check if the demo season limit has been reached.
 */
export function isDemoLimitReached(currentSeason: number): boolean {
  return IS_DEMO && currentSeason > DEMO_MAX_SEASONS;
}
