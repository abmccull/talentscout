/**
 * Personality trait generation for players.
 *
 * Each player receives 2–4 personality traits at generation time, weighted by
 * position category and development profile.  The resulting array is stored as
 * the "true" traits on the Player object; scouts discover them incrementally
 * through observation (see personalityReveal.ts).
 */

import type { PersonalityTrait, Position, DevelopmentProfile } from "../core/types";

// ---------------------------------------------------------------------------
// Trait pool
// ---------------------------------------------------------------------------

const ALL_TRAITS: readonly PersonalityTrait[] = [
  "ambitious",
  "loyal",
  "professional",
  "temperamental",
  "determined",
  "easygoing",
  "leader",
  "introvert",
  "flair",
  "controversialCharacter",
  "modelCitizen",
  "pressurePlayer",
  "bigGamePlayer",
  "inconsistent",
  "injuryProne",
  "lateDeveloper",
] as const;

// ---------------------------------------------------------------------------
// Position category mapping
// ---------------------------------------------------------------------------

type PositionCategory = "GK" | "DEF" | "MID" | "FWD";

/**
 * Map each specific position to a broad category used for weight lookup.
 */
const POSITION_CATEGORY: Record<Position, PositionCategory> = {
  GK:  "GK",
  CB:  "DEF",
  LB:  "DEF",
  RB:  "DEF",
  CDM: "MID",
  CM:  "MID",
  CAM: "MID",
  LW:  "FWD",
  RW:  "FWD",
  ST:  "FWD",
};

// ---------------------------------------------------------------------------
// Weight tables
// ---------------------------------------------------------------------------

/**
 * Multiplicative weight adjustments per position category.
 * Base weight for every trait is 1.0; values here multiply that base.
 * Omitted traits remain at weight 1.0.
 */
const POSITION_TRAIT_WEIGHTS: Record<PositionCategory, Partial<Record<PersonalityTrait, number>>> = {
  GK: {
    professional:    2.0,
    pressurePlayer:  1.5,
    leader:          1.3,
    determined:      1.2,
  },
  DEF: {
    determined:  2.0,
    leader:      1.5,
    professional: 1.5,
    loyal:       1.3,
    introvert:   1.1,
  },
  MID: {
    flair:       1.5,
    professional: 1.5,
    easygoing:   1.2,
    determined:  1.2,
    leader:      1.1,
  },
  FWD: {
    ambitious:       2.0,
    flair:           1.5,
    temperamental:   1.3,
    bigGamePlayer:   1.5,
    controversialCharacter: 1.2,
    pressurePlayer:  1.2,
  },
};

/**
 * Multiplicative weight adjustments per development profile.
 * Stacked on top of position weights.
 */
const DEVELOPMENT_TRAIT_WEIGHTS: Record<DevelopmentProfile, Partial<Record<PersonalityTrait, number>>> = {
  earlyBloomer: {
    ambitious:      1.5,
    pressurePlayer: 1.3,
    temperamental:  1.2,
  },
  lateBloomer: {
    determined:     2.0,
    lateDeveloper:  3.0,
    professional:   1.5,
    loyal:          1.2,
  },
  steadyGrower: {
    professional:  2.0,
    modelCitizen:  1.5,
    loyal:         1.5,
    easygoing:     1.2,
  },
  volatile: {
    inconsistent:  2.5,
    temperamental: 1.5,
    flair:         1.5,
    controversialCharacter: 1.3,
  },
};

// ---------------------------------------------------------------------------
// Weighted selection helpers
// ---------------------------------------------------------------------------

/**
 * Build a weight for every trait in the pool by multiplying base (1.0) by
 * any applicable position-category and development-profile multipliers.
 */
function buildWeightedPool(
  positionCategory: PositionCategory,
  developmentProfile: DevelopmentProfile,
): Array<{ trait: PersonalityTrait; weight: number }> {
  const posWeights  = POSITION_TRAIT_WEIGHTS[positionCategory];
  const devWeights  = DEVELOPMENT_TRAIT_WEIGHTS[developmentProfile];

  return ALL_TRAITS.map((trait) => {
    const posMultiplier = posWeights[trait]  ?? 1.0;
    const devMultiplier = devWeights[trait] ?? 1.0;
    return { trait, weight: posMultiplier * devMultiplier };
  });
}

/**
 * Pick one trait from a weighted pool without replacement.
 * Mutates `pool` by removing the selected entry.
 * Returns the selected trait, or null if the pool is empty.
 */
function pickWeightedWithoutReplacement(
  rng: { next(): number },
  pool: Array<{ trait: PersonalityTrait; weight: number }>,
): PersonalityTrait | null {
  if (pool.length === 0) return null;

  const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return null;

  let threshold = rng.next() * totalWeight;
  for (let i = 0; i < pool.length; i++) {
    threshold -= pool[i].weight;
    if (threshold <= 0) {
      const selected = pool[i].trait;
      pool.splice(i, 1);
      return selected;
    }
  }

  // Floating-point rounding fallback: take the last entry
  const last = pool[pool.length - 1];
  pool.splice(pool.length - 1, 1);
  return last.trait;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate 2–4 personality traits for a player.
 *
 * Trait count:
 *   - 2 traits: ~33% of players
 *   - 3 traits: ~33% of players
 *   - 4 traits: ~33% of players
 *
 * Selection is weighted by position category and development profile, using
 * weighted-random-without-replacement so no trait appears twice.
 *
 * @param rng   - Any object with a `next(): number` method (e.g. the game RNG).
 * @param player - Minimal player info needed for weight calculation.
 */
export function generatePersonalityTraits(
  rng: { next(): number },
  player: Pick<{ position: Position; age: number; developmentProfile: DevelopmentProfile }, "position" | "age" | "developmentProfile">,
): PersonalityTrait[] {
  // Determine how many traits (2–4)
  const count = 2 + Math.floor(rng.next() * 3); // yields 2, 2, or 3 (never 4 on its own)
  // Note: floor(rand * 3) → 0,1,2, so count is 2,3,4 ✓

  const posCategory = POSITION_CATEGORY[player.position];
  const pool = buildWeightedPool(posCategory, player.developmentProfile);

  const traits: PersonalityTrait[] = [];
  for (let i = 0; i < count; i++) {
    const picked = pickWeightedWithoutReplacement(rng, pool);
    if (picked === null) break;
    traits.push(picked);
  }

  return traits;
}
