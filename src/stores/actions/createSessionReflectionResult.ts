import type { GameState } from "@/engine/core/types";
import type { ObservationSession } from "@/engine/observation/types";
import { generateReflection, type ReflectionResult } from "@/engine/observation/reflection";
import { getActiveEquipmentBonuses } from "@/engine/finance";
import { createRNG } from "@/engine/rng";
import { resolveScoutPerkModifiers } from "@/engine/specializations/perks";

/** Reconstruct the same reflection after either a phase transition or save load. */
export function createSessionReflectionResult(
  gameState: GameState,
  session: ObservationSession,
): ReflectionResult {
  const rng = createRNG(`${gameState.seed}-reflection-${gameState.currentWeek}`);
  const equipmentBonuses = gameState.finances?.equipment
    ? getActiveEquipmentBonuses(gameState.finances.equipment.loadout)
    : undefined;
  // The trigger divides intuition by 200, so convert the equipment chance bonus.
  const gutBoost = (equipmentBonuses?.gutFeelingBonus ?? 0) * 200;
  const perkModifiers = resolveScoutPerkModifiers(gameState.scout);
  const paAccuracyBonus = equipmentBonuses?.paEstimateAccuracy ?? 0;

  return generateReflection(
    session,
    rng,
    gameState.scout.attributes.intuition + gutBoost,
    gameState.scout.specializationLevel,
    {
      paEstimate: perkModifiers.hasPAEstimate,
      paEstimateMargin: perkModifiers.paEstimateMargin,
    },
    paAccuracyBonus,
    gameState.players,
  );
}
