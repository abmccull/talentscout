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
 * unrevealed ones) are eligible. An unlisted context reveals no hidden traits.
 */
const CONTEXT_TRAIT_AFFINITY: Record<string, PersonalityTrait[]> = {
  schoolMatch: ["flair", "pressurePlayer", "temperamental", "leader", "determined"],
  grassrootsTournament: ["flair", "pressurePlayer", "temperamental", "leader", "determined"],
  academyVisit: ["professional", "determined", "easygoing", "ambitious", "introvert"],
  parentCoachMeeting: ["professional", "determined", "loyal", "ambitious", "easygoing", "introvert"],
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
    "pressurePlayer",
    "easygoing",
  ],
  academyTrialDay: [
    "ambitious",
    "flair",
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
  /** Optional traits supported by an actual behavioral cue, never a reveal-all switch. */
  supportedTraits?: readonly PersonalityTrait[];
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
  const affinityList = CONTEXT_TRAIT_AFFINITY[context.activityType] ?? [];
  const affinitySet = new Set<PersonalityTrait>(affinityList);
  const supported = context.supportedTraits ? new Set(context.supportedTraits) : undefined;
  // An uninformative context yields no conclusion. A successful random roll
  // never grants permission to reveal an unrelated hidden characteristic.
  const eligible = unrevealed.filter((trait) => affinitySet.has(trait)
    && (!supported || supported.has(trait)));
  if (eligible.length === 0) return null;

  // --- Pick one at random ---

  const idx = Math.floor(rng.next() * eligible.length);
  return eligible[idx] ?? null;
}
