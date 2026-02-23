/**
 * Personality trait reveal during observation sessions.
 *
 * Each time a scout observes a player, there is a chance that one previously
 * hidden personality trait is discovered.  The probability depends on:
 *   - Base chance (8%)
 *   - Scout's psychologicalRead skill level
 *   - The observational lens in use
 *   - The type of activity being performed
 *
 * Context-specific rules narrow which traits can be revealed per session type,
 * modelling how different scouting scenarios expose different behavioural cues.
 */

import type { PersonalityTrait } from "../core/types";

// ---------------------------------------------------------------------------
// Context trait affinity
// ---------------------------------------------------------------------------

/**
 * Traits that are naturally observable in each activity context.
 * When a context has an affinity list, only those traits (intersected with
 * unrevealed ones) are eligible.  Contexts that are not listed here allow
 * any unrevealed trait to be revealed.
 */
const CONTEXT_TRAIT_AFFINITY: Record<string, PersonalityTrait[]> = {
  liveMatch: [
    "bigGamePlayer",
    "pressurePlayer",
    "temperamental",
    "leader",
    "inconsistent",
    "flair",
    "controversialCharacter",
  ],
  trainingVisit: [
    "professional",
    "determined",
    "easygoing",
    "modelCitizen",
    "ambitious",
    "introvert",
  ],
  trainingGround: [
    "professional",
    "determined",
    "easygoing",
    "modelCitizen",
    "ambitious",
    "introvert",
  ],
  youthTrial: [
    "ambitious",
    "flair",
    "lateDeveloper",
    "pressurePlayer",
    "easygoing",
  ],
  academyTrialDay: [
    "ambitious",
    "flair",
    "lateDeveloper",
    "pressurePlayer",
    "easygoing",
  ],
  followUpSession: [
    "professional",
    "determined",
    "loyal",
    "ambitious",
    "easygoing",
    "introvert",
  ],
  youthTournament: [
    "flair",
    "bigGamePlayer",
    "pressurePlayer",
    "temperamental",
    "inconsistent",
    "determined",
  ],
  youthFestival: [
    "flair",
    "bigGamePlayer",
    "pressurePlayer",
    "temperamental",
    "inconsistent",
    "determined",
  ],
};

// ---------------------------------------------------------------------------
// Activity types that carry a bonus reveal chance
// ---------------------------------------------------------------------------

const BONUS_ACTIVITY_TYPES = new Set<string>([
  "trainingVisit",
  "trainingGround",
  "youthTrial",
  "academyTrialDay",
  "followUpSession",
  "parentCoachMeeting",
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RevealContext {
  /** The activity or observation context type (e.g. "liveMatch", "trainingVisit"). */
  activityType: string;
  /** The observational lens in use, if any. */
  lens?: string;
}

/**
 * Attempt to reveal one previously hidden personality trait.
 *
 * Probability breakdown:
 *   Base:               8%
 *   +5% psychologicalRead >= 3 (scout skill bonus)
 *   +5% lens === "mental"
 *   +3% for activity types that provide close personal contact
 *
 * If the roll succeeds, a random unrevealed trait is selected from those
 * eligible in the given context.  If all traits are already revealed or no
 * eligible unrevealed traits remain, returns null.
 *
 * @param rng     - RNG with a `next(): number` method.
 * @param scout   - Minimal scout info: skills record and primarySpecialization.
 * @param player  - Player with personalityTraits (true) and personalityRevealed.
 * @param context - Activity type and optional lens string.
 * @returns The revealed trait, or null.
 */
export function checkPersonalityReveal(
  rng: { next(): number },
  scout: {
    skills: Record<string, { level: number } | number>;
    primarySpecialization: string;
  },
  player: {
    personalityTraits: PersonalityTrait[];
    personalityRevealed: PersonalityTrait[];
  },
  context: RevealContext,
): PersonalityTrait | null {
  // Nothing left to reveal
  const revealedSet = new Set<PersonalityTrait>(player.personalityRevealed);
  const unrevealed = player.personalityTraits.filter((t) => !revealedSet.has(t));
  if (unrevealed.length === 0) return null;

  // --- Calculate reveal probability ---

  let chance = 0.08; // 8% base

  // Scout psychologicalRead bonus — handles both {level: number} and raw number
  const psychoRaw = scout.skills["psychologicalRead"];
  const psychoLevel =
    psychoRaw === undefined
      ? 0
      : typeof psychoRaw === "number"
      ? psychoRaw
      : (psychoRaw as { level: number }).level;

  if (psychoLevel >= 3) {
    chance += 0.05;
  }

  // Lens bonus
  if (context.lens === "mental") {
    chance += 0.05;
  }

  // Activity proximity bonus
  if (BONUS_ACTIVITY_TYPES.has(context.activityType)) {
    chance += 0.03;
  }

  // Roll
  if (rng.next() >= chance) return null;

  // --- Determine eligible traits ---

  // Combine the primary activityType affinity lookup with any context-specific keys
  const affinityList =
    CONTEXT_TRAIT_AFFINITY[context.activityType] ?? null;

  let eligible: PersonalityTrait[];
  if (affinityList !== null) {
    // Intersect unrevealed with context-appropriate traits
    const affinitySet = new Set<PersonalityTrait>(affinityList);
    eligible = unrevealed.filter((t) => affinitySet.has(t));

    // If the intersection is empty (player's traits don't overlap with this
    // context's affinity), fall back to any unrevealed trait so the roll is
    // never wasted.
    if (eligible.length === 0) {
      eligible = unrevealed;
    }
  } else {
    eligible = unrevealed;
  }

  // --- Pick one at random ---

  const idx = Math.floor(rng.next() * eligible.length);
  return eligible[idx] ?? null;
}
