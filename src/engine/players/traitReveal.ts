/**
 * Behavioral trait discovery during match observations.
 *
 * Similar to personalityReveal.ts, but for behavioral traits.
 * Each match event has a chance to reveal a matching behavioral trait.
 */

import type { RNG } from "@/engine/rng";
import type {
  MatchEventType,
  Player,
  PlayerTrait,
  Scout,
} from "@/engine/core/types";

// =============================================================================
// TRAIT-EVENT AFFINITY
// =============================================================================

/**
 * Maps event types to traits they can potentially reveal.
 * When a player with trait X performs event Y, and Y is in the affinity
 * list for trait X, there's a chance the scout discovers the trait.
 */
const TRAIT_EVENT_AFFINITY: Record<PlayerTrait, MatchEventType[]> = {
  // Attacking
  placesShots: ["goal", "shot"],
  triesTricks: ["dribble"],
  cutsInside: ["dribble", "shot", "goal"],
  runsWithBall: ["dribble", "sprint"],
  movesIntoChannels: ["goal", "positioning", "sprint"],
  shootsFromDistance: ["shot", "goal"],
  triesKillerBalls: ["assist", "throughBall", "pass"],

  // Defensive
  staysBack: ["tackle", "interception", "positioning"],
  divesStraightIn: ["tackle", "foul"],
  marksPlayerTightly: ["tackle", "interception"],

  // Passing
  dictatesTempo: ["pass", "throughBall", "positioning"],
  playsShortPasses: ["pass", "assist"],
  switchesPlayToFlank: ["pass", "cross", "assist"],
  playsOneTwo: ["pass", "assist"],

  // Physical/Style
  holdsUpBall: ["holdUp"],
  bringsOthersIntoPlay: ["assist", "holdUp", "pass"],
  arrivesLateInBox: ["goal", "positioning"],
  playsWithBackToGoal: ["holdUp"],

  // Positional
  driftsWide: ["cross", "dribble"],
  dropsDeep: ["pass", "positioning", "throughBall"],
};

// =============================================================================
// REVEAL CHECK
// =============================================================================

/** Base chance to reveal a trait when a matching event occurs. */
const BASE_REVEAL_CHANCE = 0.12;

/** Additional chance if scout has high tactical understanding. */
const TACTICAL_BONUS_THRESHOLD = 12;
const TACTICAL_BONUS = 0.05;

/**
 * Check if a behavioral trait should be revealed during a match event.
 *
 * @returns The revealed trait, or null if no reveal occurred.
 */
export function checkTraitReveal(
  rng: RNG,
  player: Player,
  eventType: MatchEventType,
  scout: Scout,
): PlayerTrait | null {
  const unrevealed = (player.playerTraits ?? []).filter(
    (t) => !(player.playerTraitsRevealed ?? []).includes(t),
  );

  if (unrevealed.length === 0) return null;

  for (const trait of unrevealed) {
    const affinity = TRAIT_EVENT_AFFINITY[trait];
    if (!affinity || !affinity.includes(eventType)) continue;

    let chance = BASE_REVEAL_CHANCE;
    if (scout.skills.tacticalUnderstanding >= TACTICAL_BONUS_THRESHOLD) {
      chance += TACTICAL_BONUS;
    }

    if (rng.chance(chance)) {
      return trait;
    }
  }

  return null;
}
