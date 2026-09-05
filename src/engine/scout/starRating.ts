/**
 * Star rating system — maps internal CA/PA (1–200) to a half-star scale
 * (0.5–5.0) and provides perception functions for scouts to estimate
 * player overall ability and potential.
 *
 * Pure engine module — no React or framework imports.
 */

import { projectAbilityFromEvidence } from "@/engine/scout/abilityProjection";
import type { RNG } from "@/engine/rng";
import type {
  Player,
  Scout,
  Observation,
  ObservationContext,
  AbilityReading,
} from "@/engine/core/types";

// ---------------------------------------------------------------------------
// Star ↔ Ability mapping
// ---------------------------------------------------------------------------

/**
 * Convert a 1–200 ability value to a 0.5–5.0 half-star rating.
 *
 * Linear mapping snapped to nearest 0.5:
 *   CA   1-20  → 0.5★    CA 101-120 → 3.0★
 *   CA  21-40  → 1.0★    CA 121-140 → 3.5★
 *   CA  41-60  → 1.5★    CA 141-160 → 4.0★
 *   CA  61-80  → 2.0★    CA 161-180 → 4.5★
 *   CA  81-100 → 2.5★    CA 181-200 → 5.0★
 */
export function abilityToStars(ability: number): number {
  const clamped = Math.max(1, Math.min(200, ability));
  // Map 1-200 to 0.5-5.0
  const raw = 0.5 + ((clamped - 1) / 199) * 4.5;
  // Snap to nearest 0.5
  return Math.round(raw * 2) / 2;
}

/**
 * Convert a 0.5–5.0 star rating to the midpoint ability value (1–200).
 */
export function starsToAbility(stars: number): number {
  const clamped = Math.max(0.5, Math.min(5.0, stars));
  const raw = ((clamped - 0.5) / 4.5) * 199 + 1;
  return Math.round(raw);
}

/** Project from public age and retained scouting evidence; never from true CA/PA. */
export function generateAbilityReading(
  _rng: RNG,
  player: Pick<Player, "id" | "age" | "position">,
  scout: Scout,
  existingObservations: Observation[],
  context: ObservationContext,
  playerObservations?: readonly Observation[],
  currentReadings: readonly import("@/engine/core/types").AttributeReading[] = [],
): AbilityReading {
  return projectAbilityFromEvidence(
    player, scout, playerObservations ?? existingObservations, context, currentReadings,
  );
}
