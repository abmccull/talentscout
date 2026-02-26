/**
 * Personality Effects Engine (F9)
 *
 * Generates personality profiles for players and provides gameplay modifiers:
 *  - Transfer willingness: how likely a player is to accept a move
 *  - Dressing room impact: team morale effect (-3 to +3)
 *  - Form volatility: how much form swings (0-1)
 *  - Big match modifier: rating adjustment in important matches (-2 to +2)
 *
 * All functions are pure — no side effects, no React imports.
 */

import type {
  PersonalityArchetype,
  PersonalityProfile,
  PersonalityTrait,
  Player,
  Position,
} from "@/engine/core/types";

// =============================================================================
// ARCHETYPE DEFINITIONS
// =============================================================================

interface ArchetypeConfig {
  archetype: PersonalityArchetype;
  transferWillingness: number;
  dressingRoomImpact: number;
  formVolatility: number;
  bigMatchModifier: number;
  /** Personality traits that make this archetype more likely. */
  affinityTraits: PersonalityTrait[];
  /** Base weight for random selection (before affinity bonuses). */
  baseWeight: number;
}

const ARCHETYPE_CONFIGS: readonly ArchetypeConfig[] = [
  {
    archetype: "leader",
    transferWillingness: 0.3,
    dressingRoomImpact: 3,
    formVolatility: 0.3,
    bigMatchModifier: 1,
    affinityTraits: ["leader", "determined", "professional"],
    baseWeight: 8,
  },
  {
    archetype: "mercenary",
    transferWillingness: 0.9,
    dressingRoomImpact: -1,
    formVolatility: 0.5,
    bigMatchModifier: 0,
    affinityTraits: ["ambitious", "controversialCharacter"],
    baseWeight: 6,
  },
  {
    archetype: "homesick",
    transferWillingness: 0.2,
    dressingRoomImpact: 0,
    formVolatility: 0.6,
    bigMatchModifier: -1,
    affinityTraits: ["loyal", "introvert"],
    baseWeight: 5,
  },
  {
    archetype: "ambitious",
    transferWillingness: 0.7,
    dressingRoomImpact: 1,
    formVolatility: 0.4,
    bigMatchModifier: 1,
    affinityTraits: ["ambitious", "determined", "bigGamePlayer"],
    baseWeight: 10,
  },
  {
    archetype: "loyal",
    transferWillingness: 0.15,
    dressingRoomImpact: 2,
    formVolatility: 0.25,
    bigMatchModifier: 0,
    affinityTraits: ["loyal", "modelCitizen", "professional"],
    baseWeight: 10,
  },
  {
    archetype: "disruptive",
    transferWillingness: 0.6,
    dressingRoomImpact: -2,
    formVolatility: 0.7,
    bigMatchModifier: 0,
    affinityTraits: ["temperamental", "controversialCharacter"],
    baseWeight: 4,
  },
  {
    archetype: "introvert",
    transferWillingness: 0.35,
    dressingRoomImpact: 0,
    formVolatility: 0.35,
    bigMatchModifier: -1,
    affinityTraits: ["introvert", "easygoing"],
    baseWeight: 8,
  },
  {
    archetype: "professional",
    transferWillingness: 0.5,
    dressingRoomImpact: 1,
    formVolatility: 0.2,
    bigMatchModifier: 0,
    affinityTraits: ["professional", "modelCitizen", "determined"],
    baseWeight: 12,
  },
  {
    archetype: "hothead",
    transferWillingness: 0.55,
    dressingRoomImpact: -1,
    formVolatility: 0.8,
    bigMatchModifier: -1,
    affinityTraits: ["temperamental", "controversialCharacter", "flair"],
    baseWeight: 5,
  },
  {
    archetype: "clutch",
    transferWillingness: 0.4,
    dressingRoomImpact: 2,
    formVolatility: 0.35,
    bigMatchModifier: 2,
    affinityTraits: ["bigGamePlayer", "pressurePlayer", "determined"],
    baseWeight: 7,
  },
] as const;

// =============================================================================
// PROFILE GENERATION
// =============================================================================

/**
 * Generate a personality profile for a player.
 *
 * The archetype is selected via weighted random, with affinity bonuses
 * from the player's existing personality traits. The numeric modifiers
 * are then set from the archetype config, with slight random jitter to
 * make each player feel unique.
 *
 * @param rng    - RNG instance for deterministic generation.
 * @param player - Minimal player data needed for archetype selection.
 * @returns A fully populated PersonalityProfile.
 */
export function generatePersonalityProfile(
  rng: { next(): number },
  player: Pick<Player, "personalityTraits" | "position" | "age" | "developmentProfile">,
): PersonalityProfile {
  const traitSet = new Set(player.personalityTraits);

  // Build weighted pool for archetype selection
  const pool: Array<{ config: ArchetypeConfig; weight: number }> = ARCHETYPE_CONFIGS.map(
    (config) => {
      let weight = config.baseWeight;

      // Bonus weight for each matching affinity trait
      for (const affinityTrait of config.affinityTraits) {
        if (traitSet.has(affinityTrait)) {
          weight *= 2.0;
        }
      }

      // Position-based adjustments
      if (config.archetype === "leader" && isDefensivePosition(player.position)) {
        weight *= 1.5;
      }
      if (config.archetype === "clutch" && isAttackingPosition(player.position)) {
        weight *= 1.3;
      }
      if (config.archetype === "ambitious" && player.age <= 23) {
        weight *= 1.4;
      }
      if (config.archetype === "loyal" && player.age >= 28) {
        weight *= 1.3;
      }

      return { config, weight };
    },
  );

  // Weighted random selection
  const totalWeight = pool.reduce((sum, entry) => sum + entry.weight, 0);
  let threshold = rng.next() * totalWeight;
  let selectedConfig = pool[pool.length - 1].config;

  for (const entry of pool) {
    threshold -= entry.weight;
    if (threshold <= 0) {
      selectedConfig = entry.config;
      break;
    }
  }

  // Apply jitter to numeric values for individuality
  const jitter = (base: number, range: number, min: number, max: number): number => {
    const offset = (rng.next() - 0.5) * range * 2;
    return Math.max(min, Math.min(max, Math.round((base + offset) * 100) / 100));
  };

  return {
    archetype: selectedConfig.archetype,
    traits: [...player.personalityTraits],
    transferWillingness: jitter(selectedConfig.transferWillingness, 0.1, 0, 1),
    dressingRoomImpact: Math.round(
      jitter(selectedConfig.dressingRoomImpact, 0.5, -3, 3),
    ),
    formVolatility: jitter(selectedConfig.formVolatility, 0.1, 0, 1),
    bigMatchModifier: Math.round(
      jitter(selectedConfig.bigMatchModifier, 0.5, -2, 2),
    ),
    hiddenUntilRevealed: true,
    revealedTraits: [],
  };
}

// =============================================================================
// GAMEPLAY EFFECTS
// =============================================================================

/**
 * Apply form volatility from personality profile to a base form value.
 *
 * High volatility causes bigger form swings — the form is pushed further
 * from 0 in whichever direction it's heading. Low volatility dampens
 * form swings toward the mean.
 *
 * @param profile   - The player's personality profile.
 * @param baseForm  - The raw form value [-3, 3] before personality adjustment.
 * @returns Adjusted form value, still clamped to [-3, 3].
 */
export function applyPersonalityToForm(
  profile: PersonalityProfile | undefined,
  baseForm: number,
): number {
  if (!profile) return baseForm;

  // Volatility 0.5 = no change. Above 0.5 amplifies, below dampens.
  const amplification = 1 + (profile.formVolatility - 0.5) * 0.6;
  const adjusted = baseForm * amplification;

  return Math.max(-3, Math.min(3, Math.round(adjusted)));
}

/**
 * Apply big-match modifier from personality profile to a match rating.
 *
 * Only applies when `isImportantMatch` is true (top of table clashes,
 * cup finals, derbies, etc.).
 *
 * @param profile         - The player's personality profile.
 * @param baseRating      - The raw match rating [1, 10] before adjustment.
 * @param isImportantMatch - Whether this fixture is classified as important.
 * @returns Adjusted rating, clamped to [1.0, 10.0].
 */
export function applyPersonalityToMatchRating(
  profile: PersonalityProfile | undefined,
  baseRating: number,
  isImportantMatch: boolean,
): number {
  if (!profile || !isImportantMatch) return baseRating;

  // Apply big match modifier (scaled by 0.3 to keep it subtle)
  const modifier = profile.bigMatchModifier * 0.3;
  const adjusted = baseRating + modifier;

  return Math.max(1.0, Math.min(10.0, Math.round(adjusted * 10) / 10));
}

/**
 * Evaluate how willing a player is to accept a transfer move.
 *
 * Factors in the player's personality profile, current vs target club
 * reputation, and age-based ambition.
 *
 * @param profile         - The player's personality profile.
 * @param currentClubRep  - Current club reputation (0-100).
 * @param targetClubRep   - Target club reputation (0-100).
 * @param playerAge       - Player's current age.
 * @returns A willingness score 0-1, where 1 = very willing to move.
 */
export function evaluateTransferWillingness(
  profile: PersonalityProfile | undefined,
  currentClubRep: number,
  targetClubRep: number,
  playerAge: number,
): number {
  if (!profile) return 0.5;

  let willingness = profile.transferWillingness;

  // Moving to a more prestigious club increases willingness
  const repDiff = targetClubRep - currentClubRep;
  if (repDiff > 0) {
    willingness += repDiff / 200; // Up to +0.5 for a massive step up
  } else {
    willingness += repDiff / 300; // Down to -0.33 for a big step down
  }

  // Young ambitious players are more willing to move for development
  if (playerAge <= 23 && profile.archetype === "ambitious") {
    willingness += 0.15;
  }

  // Older players tend to be more settled
  if (playerAge >= 30) {
    willingness -= 0.1;
  }

  return Math.max(0, Math.min(1, willingness));
}

/**
 * Evaluate a player's dressing room impact on team chemistry.
 *
 * The impact is a combination of the player's own profile modifier
 * plus synergy/clash effects with existing team personalities.
 *
 * @param profile          - The player's personality profile.
 * @param teamArchetypes   - Array of archetypes already in the dressing room.
 * @returns Net impact on team morale [-5, +5].
 */
export function evaluateDressingRoomImpact(
  profile: PersonalityProfile | undefined,
  teamArchetypes: PersonalityArchetype[],
): number {
  if (!profile) return 0;

  let impact = profile.dressingRoomImpact;

  // Synergy: leaders boost other leaders, professionals boost each other
  const leaderCount = teamArchetypes.filter((a) => a === "leader").length;
  if (profile.archetype === "leader" && leaderCount > 0) {
    impact += 0.5; // Leaders inspire each other
  }

  // Clash: multiple disruptive players amplify negativity
  const disruptiveCount = teamArchetypes.filter((a) => a === "disruptive" || a === "hothead").length;
  if ((profile.archetype === "disruptive" || profile.archetype === "hothead") && disruptiveCount > 0) {
    impact -= 0.5; // Troublemakers feed off each other
  }

  // Professional stabilizer: reduces negative impact of disruptive players
  const professionalCount = teamArchetypes.filter((a) => a === "professional").length;
  if (profile.archetype === "disruptive" && professionalCount >= 3) {
    impact += 0.5; // Strong professional culture mitigates disruption
  }

  return Math.max(-5, Math.min(5, Math.round(impact)));
}

// =============================================================================
// PROGRESSIVE REVEAL
// =============================================================================

/**
 * Determine if a personality trait should be revealed during observation,
 * and if the archetype should be uncovered.
 *
 * Progressive discovery thresholds:
 *  - Observation 1-2: chance to reveal 0-1 traits
 *  - Observation 3+:  archetype revealed (hiddenUntilRevealed = false)
 *  - Observation 5+:  full personality profile visible (all traits revealed)
 *
 * @param rng              - RNG instance.
 * @param profile          - The player's current personality profile.
 * @param observationCount - How many times this player has been observed.
 * @param scoutPsychSkill  - Scout's psychologicalRead skill level (1-20).
 * @returns Updated profile (new object, never mutated).
 */
export function progressivePersonalityReveal(
  rng: { next(): number },
  profile: PersonalityProfile,
  observationCount: number,
  scoutPsychSkill: number,
): PersonalityProfile {
  const revealedSet = new Set(profile.revealedTraits);
  const unrevealed = profile.traits.filter((t) => !revealedSet.has(t));

  let hiddenUntilRevealed = profile.hiddenUntilRevealed;

  // Archetype reveal: 3+ observations or high skill scout (skill >= 15 can do it in 2)
  const archetypeThreshold = scoutPsychSkill >= 15 ? 2 : 3;
  if (observationCount >= archetypeThreshold) {
    hiddenUntilRevealed = false;
  }

  // Full reveal: 5+ observations or very high skill scout
  const fullRevealThreshold = scoutPsychSkill >= 18 ? 4 : 5;
  if (observationCount >= fullRevealThreshold) {
    return {
      ...profile,
      hiddenUntilRevealed: false,
      revealedTraits: [...profile.traits],
    };
  }

  // Individual trait reveal: chance per observation
  if (unrevealed.length > 0) {
    // Base 15% chance, boosted by scout skill
    const revealChance = 0.15 + (scoutPsychSkill / 100);
    if (rng.next() < revealChance) {
      const idx = Math.floor(rng.next() * unrevealed.length);
      const newRevealed = [...profile.revealedTraits, unrevealed[idx]];
      return {
        ...profile,
        hiddenUntilRevealed,
        revealedTraits: newRevealed,
      };
    }
  }

  // Only update hiddenUntilRevealed if it changed
  if (hiddenUntilRevealed !== profile.hiddenUntilRevealed) {
    return { ...profile, hiddenUntilRevealed };
  }

  return profile;
}

// =============================================================================
// DISPLAY HELPERS
// =============================================================================

/** Human-readable label for each archetype. */
export const ARCHETYPE_LABELS: Record<PersonalityArchetype, string> = {
  leader: "Natural Leader",
  mercenary: "Mercenary",
  homesick: "Homesick",
  ambitious: "Ambitious",
  loyal: "One-Club Player",
  disruptive: "Disruptive Influence",
  introvert: "Quiet Professional",
  professional: "Model Professional",
  hothead: "Hothead",
  clutch: "Big-Game Player",
};

/** Short description of each archetype's effect. */
export const ARCHETYPE_DESCRIPTIONS: Record<PersonalityArchetype, string> = {
  leader: "Positive dressing room influence. Steady form. Rises in big matches.",
  mercenary: "Always looking for a better deal. High transfer willingness.",
  homesick: "Reluctant to move. Form can suffer away from home environment.",
  ambitious: "Willing to move for advancement. Performs well under pressure.",
  loyal: "Very unlikely to request a transfer. Stabilizing team presence.",
  disruptive: "Can upset dressing room harmony. Unpredictable behavior.",
  introvert: "Quiet but reliable. May shrink in high-pressure situations.",
  professional: "Consistent performer. Low form volatility. Good team player.",
  hothead: "Volatile temperament. Wild form swings. Disciplinary risk.",
  clutch: "Thrives in big moments. Significant rating boost in key matches.",
};

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

function isDefensivePosition(pos: Position): boolean {
  return pos === "GK" || pos === "CB" || pos === "CDM";
}

function isAttackingPosition(pos: Position): boolean {
  return pos === "ST" || pos === "LW" || pos === "RW" || pos === "CAM";
}
