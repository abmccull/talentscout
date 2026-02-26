/**
 * Behavioral trait generation for players.
 *
 * Behavioral traits describe what a player does on the pitch (e.g. "cuts inside",
 * "places shots"). Distinct from personality traits which describe who they are
 * off the pitch.
 *
 * Traits are generated at player creation based on position and attribute values,
 * then discovered by scouts during match observations.
 */

import type { RNG } from "@/engine/rng";
import type { Player, PlayerAttribute, PlayerTrait, Position } from "@/engine/core/types";

// =============================================================================
// TRAIT POOL
// =============================================================================

interface TraitEntry {
  trait: PlayerTrait;
  /** Positions where this trait is more common. Empty = all positions. */
  positionBias: Position[];
  /** Attributes that make this trait more likely if high. */
  attributeDrivers: PlayerAttribute[];
  /** Minimum attribute average needed for the trait to be eligible (1-20). */
  minAttrThreshold: number;
}

export const TRAIT_POOL: TraitEntry[] = [
  // Attacking
  { trait: "placesShots", positionBias: ["ST", "CAM", "LW", "RW"], attributeDrivers: ["finishing", "composure"], minAttrThreshold: 12 },
  { trait: "triesTricks", positionBias: ["LW", "RW", "CAM", "ST"], attributeDrivers: ["dribbling", "agility", "balance"], minAttrThreshold: 13 },
  { trait: "cutsInside", positionBias: ["LW", "RW"], attributeDrivers: ["dribbling", "shooting", "agility"], minAttrThreshold: 12 },
  { trait: "runsWithBall", positionBias: ["LW", "RW", "CM", "LB", "RB"], attributeDrivers: ["pace", "dribbling", "stamina"], minAttrThreshold: 12 },
  { trait: "movesIntoChannels", positionBias: ["ST", "CAM", "LW", "RW"], attributeDrivers: ["offTheBall", "anticipation", "pace"], minAttrThreshold: 12 },
  { trait: "shootsFromDistance", positionBias: ["CM", "CAM", "CDM"], attributeDrivers: ["shooting", "composure"], minAttrThreshold: 13 },
  { trait: "triesKillerBalls", positionBias: ["CAM", "CM", "CDM"], attributeDrivers: ["vision", "passing", "composure"], minAttrThreshold: 14 },

  // Defensive
  { trait: "staysBack", positionBias: ["CB", "CDM", "LB", "RB"], attributeDrivers: ["positioning", "teamwork", "marking"], minAttrThreshold: 12 },
  { trait: "divesStraightIn", positionBias: ["CB", "CDM", "CM"], attributeDrivers: ["tackling", "strength"], minAttrThreshold: 11 },
  { trait: "marksPlayerTightly", positionBias: ["CB", "CDM", "LB", "RB"], attributeDrivers: ["marking", "anticipation", "stamina"], minAttrThreshold: 13 },

  // Passing
  { trait: "dictatesTempo", positionBias: ["CM", "CDM", "CAM"], attributeDrivers: ["passing", "vision", "composure"], minAttrThreshold: 14 },
  { trait: "playsShortPasses", positionBias: ["CM", "CDM", "CB"], attributeDrivers: ["passing", "firstTouch", "teamwork"], minAttrThreshold: 12 },
  { trait: "switchesPlayToFlank", positionBias: ["CM", "CDM", "CB"], attributeDrivers: ["passing", "vision"], minAttrThreshold: 13 },
  { trait: "playsOneTwo", positionBias: ["CAM", "ST", "LW", "RW"], attributeDrivers: ["firstTouch", "passing", "offTheBall"], minAttrThreshold: 12 },

  // Physical/Style
  { trait: "holdsUpBall", positionBias: ["ST"], attributeDrivers: ["strength", "balance", "firstTouch"], minAttrThreshold: 13 },
  { trait: "bringsOthersIntoPlay", positionBias: ["ST", "CAM"], attributeDrivers: ["passing", "vision", "teamwork"], minAttrThreshold: 13 },
  { trait: "arrivesLateInBox", positionBias: ["CM", "CAM"], attributeDrivers: ["offTheBall", "anticipation", "stamina"], minAttrThreshold: 12 },
  { trait: "playsWithBackToGoal", positionBias: ["ST"], attributeDrivers: ["strength", "balance", "firstTouch"], minAttrThreshold: 12 },

  // Positional
  { trait: "driftsWide", positionBias: ["LW", "RW", "ST", "CAM"], attributeDrivers: ["pace", "dribbling", "offTheBall"], minAttrThreshold: 11 },
  { trait: "dropsDeep", positionBias: ["ST", "CAM", "CM"], attributeDrivers: ["passing", "vision", "firstTouch"], minAttrThreshold: 12 },
];

// =============================================================================
// CONFLICT PAIRS
// =============================================================================

/** Trait pairs that cannot coexist on the same player. */
const CONFLICTING_PAIRS: [PlayerTrait, PlayerTrait][] = [
  ["staysBack", "arrivesLateInBox"],
  ["playsShortPasses", "switchesPlayToFlank"],
  ["cutsInside", "driftsWide"],
  ["staysBack", "runsWithBall"],
  ["dropsDeep", "movesIntoChannels"],
];

function hasConflict(existing: PlayerTrait[], candidate: PlayerTrait): boolean {
  for (const [a, b] of CONFLICTING_PAIRS) {
    if (candidate === a && existing.includes(b)) return true;
    if (candidate === b && existing.includes(a)) return true;
  }
  return false;
}

// =============================================================================
// GENERATION
// =============================================================================

/**
 * Generate 2-4 behavioral traits for a player based on their position
 * and attribute values.
 */
export function generateBehavioralTraits(
  rng: RNG,
  player: Pick<Player, "position" | "attributes">,
): PlayerTrait[] {
  const eligible: Array<{ trait: PlayerTrait; weight: number }> = [];

  for (const entry of TRAIT_POOL) {
    // Calculate average of attribute drivers
    const driverAvg =
      entry.attributeDrivers.reduce(
        (sum, attr) => sum + (player.attributes[attr] ?? 10),
        0,
      ) / entry.attributeDrivers.length;

    if (driverAvg < entry.minAttrThreshold) continue;

    // Base weight from attribute strength
    let weight = (driverAvg - entry.minAttrThreshold + 1) * 2;

    // Position bias: +50% if player is at a favored position
    if (entry.positionBias.length === 0 || entry.positionBias.includes(player.position)) {
      weight *= 1.5;
    } else {
      weight *= 0.3; // Low but not zero — edge cases can happen
    }

    eligible.push({ trait: entry.trait, weight: Math.max(0.1, weight) });
  }

  // Pick 2-4 non-conflicting traits
  if (eligible.length < 2) return eligible.map((e) => e.trait);
  const count = rng.nextInt(2, Math.min(4, eligible.length));
  const selected: PlayerTrait[] = [];

  for (let i = 0; i < count && eligible.length > 0; i++) {
    const pick = rng.pickWeighted(eligible.map((e) => ({ item: e.trait, weight: e.weight })));
    if (hasConflict(selected, pick)) continue;
    selected.push(pick);
    // Remove picked trait from eligible pool
    const idx = eligible.findIndex((e) => e.trait === pick);
    if (idx >= 0) eligible.splice(idx, 1);
  }

  return selected;
}
