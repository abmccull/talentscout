/**
 * Shared helper to aggregate observation ability readings into a
 * perceived-ability summary suitable for any UI component.
 *
 * Pure engine module — no React or framework imports.
 */

import type { Observation } from "@/engine/core/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PerceivedAbility {
  /** Perceived current ability: 0.5–5.0, snapped to 0.5. */
  ca: number;
  /** Derived CA range lower bound (0.5–5.0). */
  caLow: number;
  /** Derived CA range upper bound (0.5–5.0). */
  caHigh: number;
  /** CA confidence 0–0.92. */
  caConfidence: number;
  /** PA range lower bound (0.5–5.0). */
  paLow: number;
  /** PA range upper bound (0.5–5.0). */
  paHigh: number;
  /** PA confidence 0–0.85. */
  paConfidence: number;
  /** Number of observations that contributed ability readings. */
  observationCount: number;
}

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

/**
 * Aggregate ability readings from a player's observations into a single
 * perceived-ability summary. Uses the 3 most recent observations that
 * contain an `abilityReading`.
 *
 * Returns `null` if the player has no ability readings.
 */
export function getPerceivedAbility(
  observations: Observation[],
  playerId: string,
): PerceivedAbility | null {
  const playerObs = observations.filter(
    (o) => o.playerId === playerId && o.abilityReading,
  );

  if (playerObs.length === 0) return null;

  const recent = playerObs.slice(-3);

  const avgCA =
    recent.reduce((s, o) => s + o.abilityReading!.perceivedCA, 0) /
    recent.length;
  const avgCAConf =
    recent.reduce((s, o) => s + o.abilityReading!.caConfidence, 0) /
    recent.length;
  const avgPALow =
    recent.reduce((s, o) => s + o.abilityReading!.perceivedPALow, 0) /
    recent.length;
  const avgPAHigh =
    recent.reduce((s, o) => s + o.abilityReading!.perceivedPAHigh, 0) /
    recent.length;
  const avgPAConf =
    recent.reduce((s, o) => s + o.abilityReading!.paConfidence, 0) /
    recent.length;

  // Snap to nearest 0.5
  const ca = Math.round(avgCA * 2) / 2;
  const paLow = Math.round(avgPALow * 2) / 2;
  const paHigh = Math.min(5.0, Math.round(avgPAHigh * 2) / 2);

  // Derive CA range from confidence: less confidence → wider spread
  const caSpread = (1 - avgCAConf) * 2.0;
  const caLow = clamp(Math.round((ca - caSpread) * 2) / 2, 0.5, 5.0);
  const caHigh = clamp(Math.round((ca + caSpread) * 2) / 2, 0.5, 5.0);

  return {
    ca,
    caLow,
    caHigh,
    caConfidence: avgCAConf,
    paLow,
    paHigh,
    paConfidence: avgPAConf,
    observationCount: playerObs.length,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
