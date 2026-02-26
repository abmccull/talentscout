/**
 * Match Tactical Layer (F5)
 *
 * Implements tactical style influences on match simulation:
 *  - Style-specific event distributions that shift phase event frequencies
 *  - Rock-paper-scissors matchup calculation between tactical identities
 *  - Tactical modifier application to base event weights
 *  - AI substitution generation based on match state
 *
 * Pure engine module — no React imports, no side effects, immutable inputs.
 */

import type { RNG } from "@/engine/rng";
import type {
  MatchEventType,
  MatchSubstitution,
  Player,
  TacticalIdentity,
  TacticalMatchup,
  TacticalStyle,
} from "@/engine/core/types";

// =============================================================================
// STYLE EVENT DISTRIBUTIONS
// =============================================================================

/**
 * Per-identity event weight modifiers. Values are multiplicative:
 *  - 1.0 = no change from base weights
 *  - 1.3 = +30% frequency for that event type
 *  - 0.7 = -30% frequency for that event type
 *
 * Unlisted event types default to 1.0.
 */
export const STYLE_EVENT_DISTRIBUTIONS: Record<
  TacticalIdentity,
  Partial<Record<MatchEventType, number>>
> = {
  highPress: {
    tackle: 1.3,
    interception: 1.2,
    sprint: 1.15,
    error: 1.1,
    pass: 0.9,
    positioning: 0.85,
  },
  possessionBased: {
    pass: 1.4,
    throughBall: 1.2,
    positioning: 1.15,
    dribble: 1.1,
    tackle: 0.8,
    sprint: 0.85,
  },
  counterAttacking: {
    sprint: 1.3,
    dribble: 1.2,
    throughBall: 1.15,
    tackle: 1.1,
    pass: 0.7,
    positioning: 0.8,
  },
  directPlay: {
    header: 1.2,
    cross: 1.2,
    aerialDuel: 1.3,
    sprint: 1.1,
    pass: 0.8,
    throughBall: 0.8,
  },
  wingPlay: {
    cross: 1.35,
    dribble: 1.2,
    sprint: 1.15,
    pass: 1.05,
    header: 1.1,
    tackle: 0.9,
  },
  balanced: {
    // Balanced style has no strong biases
    pass: 1.05,
    tackle: 1.05,
    sprint: 1.0,
    dribble: 1.0,
  },
};

// =============================================================================
// TACTICAL MATCHUP — ROCK-PAPER-SCISSORS
// =============================================================================

/**
 * Strength/weakness matrix between tactical identities.
 *
 * Each identity has styles it counters and styles that counter it:
 *  - highPress beats possessionBased and balanced (intense pressure disrupts build-up)
 *  - possessionBased beats directPlay and wingPlay (retains ball, denies supply)
 *  - counterAttacking beats highPress (exploits high line with pace)
 *  - directPlay beats counterAttacking (aerial dominance bypasses deep block)
 *  - wingPlay beats highPress (stretches pressing shape)
 *  - balanced has mild advantages/disadvantages (adaptable but not dominant)
 */
const MATCHUP_MATRIX: Record<TacticalIdentity, {
  strongAgainst: TacticalIdentity[];
  weakAgainst: TacticalIdentity[];
}> = {
  highPress: {
    strongAgainst: ["possessionBased", "balanced"],
    weakAgainst: ["counterAttacking", "wingPlay"],
  },
  possessionBased: {
    strongAgainst: ["directPlay", "wingPlay"],
    weakAgainst: ["highPress", "counterAttacking"],
  },
  counterAttacking: {
    strongAgainst: ["highPress", "possessionBased"],
    weakAgainst: ["directPlay", "balanced"],
  },
  directPlay: {
    strongAgainst: ["counterAttacking", "balanced"],
    weakAgainst: ["possessionBased", "wingPlay"],
  },
  wingPlay: {
    strongAgainst: ["highPress", "directPlay"],
    weakAgainst: ["possessionBased", "balanced"],
  },
  balanced: {
    strongAgainst: ["counterAttacking", "wingPlay"],
    weakAgainst: ["highPress", "directPlay"],
  },
};

/**
 * Calculate the tactical matchup between two teams' playing styles.
 *
 * The matchup produces quality modifiers (applied to event quality rolls)
 * and event frequency shifts (merged from both teams' style distributions).
 *
 * Advantage magnitude: +0.15 for a strength matchup, -0.15 for weakness.
 * Neutral matchups produce 0 modifier.
 *
 * @param homeStyle - The home team's tactical style
 * @param awayStyle - The away team's tactical style
 * @returns A TacticalMatchup with modifiers and event frequency shifts
 */
export function calculateTacticalMatchup(
  homeStyle: TacticalStyle,
  awayStyle: TacticalStyle,
): TacticalMatchup {
  const homeId = homeStyle.tacticalIdentity;
  const awayId = awayStyle.tacticalIdentity;

  const homeMatrix = MATCHUP_MATRIX[homeId];
  const awayMatrix = MATCHUP_MATRIX[awayId];

  // Compute directional advantages
  let homeModifier = 0;
  let awayModifier = 0;

  if (homeMatrix.strongAgainst.includes(awayId)) {
    homeModifier += 0.15;
  }
  if (homeMatrix.weakAgainst.includes(awayId)) {
    homeModifier -= 0.15;
  }
  if (awayMatrix.strongAgainst.includes(homeId)) {
    awayModifier += 0.15;
  }
  if (awayMatrix.weakAgainst.includes(homeId)) {
    awayModifier -= 0.15;
  }

  // Scale modifiers by style parameter intensity (pressing, tempo, etc.)
  // Higher pressing intensity amplifies the advantage/disadvantage
  const homeIntensityFactor = 0.7 + (homeStyle.pressingIntensity / 20) * 0.6;
  const awayIntensityFactor = 0.7 + (awayStyle.pressingIntensity / 20) * 0.6;

  homeModifier = clamp(homeModifier * homeIntensityFactor, -0.3, 0.3);
  awayModifier = clamp(awayModifier * awayIntensityFactor, -0.3, 0.3);

  // Merge event frequency shifts: blend both styles' distributions
  const eventShift = mergeEventShifts(
    homeStyle.eventDistribution ?? STYLE_EVENT_DISTRIBUTIONS[homeId],
    awayStyle.eventDistribution ?? STYLE_EVENT_DISTRIBUTIONS[awayId],
  );

  return {
    homeStyle: homeId,
    awayStyle: awayId,
    homeModifier,
    awayModifier,
    eventShift,
  };
}

// =============================================================================
// TACTICAL MODIFIER APPLICATION
// =============================================================================

/**
 * Apply tactical modifiers to base event weights for a specific phase.
 *
 * Takes the default event weight map and adjusts it according to:
 *  1. The combined style event distribution (from both teams in the match)
 *  2. The team-specific matchup modifier (advantage/disadvantage)
 *
 * @param baseWeights - The default phase event weights
 * @param matchup - The calculated tactical matchup
 * @param teamSide - Which team's perspective ("home" | "away")
 * @returns Adjusted event weights (new object, base is not mutated)
 */
export function applyTacticalModifiers(
  baseWeights: Partial<Record<MatchEventType, number>>,
  matchup: TacticalMatchup,
  teamSide: "home" | "away",
): Partial<Record<MatchEventType, number>> {
  const result: Partial<Record<MatchEventType, number>> = {};

  // Get the relevant team's style distribution
  const styleDistribution = teamSide === "home"
    ? (STYLE_EVENT_DISTRIBUTIONS[matchup.homeStyle] ?? {})
    : (STYLE_EVENT_DISTRIBUTIONS[matchup.awayStyle] ?? {});

  // Apply style distribution modifiers to base weights
  for (const [eventTypeKey, baseWeight] of Object.entries(baseWeights)) {
    const eventType = eventTypeKey as MatchEventType;
    const styleMultiplier = styleDistribution[eventType] ?? 1.0;

    // Also incorporate the combined matchup event shift for shared effects
    const shiftMultiplier = matchup.eventShift[eventType] ?? 1.0;

    // Blend: 60% team-specific style, 40% combined matchup shift
    const blendedMultiplier = styleMultiplier * 0.6 + shiftMultiplier * 0.4;

    const adjusted = (baseWeight ?? 0) * Math.max(0.1, blendedMultiplier);
    if (adjusted > 0) {
      result[eventType] = adjusted;
    }
  }

  return result;
}

/**
 * Compute a quality modifier for an event based on the tactical matchup.
 * Positive modifiers improve event quality, negative reduce it.
 *
 * @param matchup - The tactical matchup
 * @param playerId - The player performing the event
 * @param homePlayers - Set of home team player IDs
 * @returns Quality modifier to add to the base event quality
 */
export function getTacticalQualityModifier(
  matchup: TacticalMatchup,
  playerId: string,
  homePlayers: ReadonlySet<string>,
): number {
  const isHome = homePlayers.has(playerId);
  const modifier = isHome ? matchup.homeModifier : matchup.awayModifier;
  // Scale modifier to a 1-10 quality impact (matchup range is -0.3 to +0.3)
  // This translates to roughly -1.5 to +1.5 on the 1-10 quality scale
  return modifier * 5;
}

// =============================================================================
// SUBSTITUTION GENERATION
// =============================================================================

/**
 * Generate AI substitutions during a match based on injuries, cards, and
 * tactical considerations.
 *
 * Rules:
 *  - Injury subs happen immediately after the injury event
 *  - Red card subs can trigger a tactical reshuffle
 *  - Tactical subs happen at half-time (45') or ~60-75' based on fatigue
 *  - Maximum 5 subs per team (modern rules)
 *
 * @param rng - RNG instance for deterministic randomness
 * @param teamPlayers - Players on the team's squad (starters + bench)
 * @param starterIds - IDs of the 11 starting players
 * @param injuredPlayerIds - IDs of players injured during the match
 * @param redCardPlayerIds - IDs of players sent off during the match
 * @returns Array of MatchSubstitution events
 */
export function generateSubstitutions(
  rng: RNG,
  teamPlayers: readonly Player[],
  starterIds: readonly string[],
  injuredPlayerIds: readonly string[],
  redCardPlayerIds: readonly string[],
): MatchSubstitution[] {
  const subs: MatchSubstitution[] = [];
  const maxSubs = 5;
  const usedSubIds = new Set<string>();
  const removedFromPitch = new Set<string>();

  // Build bench (non-starters)
  const starterSet = new Set(starterIds);
  const bench = teamPlayers.filter((p) => !starterSet.has(p.id) && !p.injured);

  function pickBenchPlayer(preferredPosition?: string): Player | undefined {
    // Prefer same position, then any available bench player
    const available = bench.filter((p) => !usedSubIds.has(p.id));
    if (available.length === 0) return undefined;

    if (preferredPosition) {
      const posMatch = available.filter((p) => p.position === preferredPosition);
      if (posMatch.length > 0) return rng.pick(posMatch);
    }
    return rng.pick(available);
  }

  // 1. Injury substitutions — happen right after injury
  for (const injuredId of injuredPlayerIds) {
    if (subs.length >= maxSubs) break;
    if (removedFromPitch.has(injuredId)) continue;

    const injured = teamPlayers.find((p) => p.id === injuredId);
    if (!injured) continue;

    const replacement = pickBenchPlayer(injured.position);
    if (!replacement) continue;

    subs.push({
      minute: rng.nextInt(1, 85), // minute will be overridden by caller with actual injury minute
      playerOutId: injuredId,
      playerInId: replacement.id,
      tacticalReason: "injury",
    });
    usedSubIds.add(replacement.id);
    removedFromPitch.add(injuredId);
  }

  // 2. Red card — tactical reshuffle (bring on a defender if attacker sent off, etc.)
  for (const redCardId of redCardPlayerIds) {
    if (subs.length >= maxSubs) break;
    if (removedFromPitch.has(redCardId)) continue;

    // Red carded players leave the pitch; we don't sub them in
    // but we might make a tactical sub to adjust the remaining 10
    removedFromPitch.add(redCardId);
  }

  // 3. Tactical substitutions — half-time or ~60-75 minutes
  // Only if we haven't used all subs on injuries/cards
  const remainingSubs = maxSubs - subs.length;
  if (remainingSubs > 0) {
    // Decide how many tactical subs (1-3, but limited by remaining)
    const tacticalSubCount = Math.min(remainingSubs, rng.nextInt(1, 3));

    // Find starters still on pitch who might be subbed (lowest stamina, oldest, etc.)
    const onPitch = starterIds.filter(
      (id) => !removedFromPitch.has(id),
    );

    // Pick players to sub based on fatigue (use stamina attribute as proxy)
    const subCandidates = onPitch
      .map((id) => teamPlayers.find((p) => p.id === id))
      .filter((p): p is Player => !!p && p.position !== "GK")
      .sort((a, b) => a.attributes.stamina - b.attributes.stamina);

    for (let i = 0; i < tacticalSubCount && i < subCandidates.length; i++) {
      const playerOut = subCandidates[i];
      const replacement = pickBenchPlayer(playerOut.position);
      if (!replacement) continue;

      // Tactical subs at half-time or in the 60-75 window
      const minute = i === 0 && rng.chance(0.4)
        ? 46
        : rng.nextInt(60, 78);

      subs.push({
        minute,
        playerOutId: playerOut.id,
        playerInId: replacement.id,
        tacticalReason: "fatigue",
      });
      usedSubIds.add(replacement.id);
      removedFromPitch.add(playerOut.id);
    }
  }

  // Sort by minute
  return [...subs].sort((a, b) => a.minute - b.minute);
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Merge two event distribution maps by averaging their multipliers.
 * Events present in only one map use that map's value blended with 1.0.
 */
function mergeEventShifts(
  distA: Partial<Record<MatchEventType, number>>,
  distB: Partial<Record<MatchEventType, number>>,
): Partial<Record<MatchEventType, number>> {
  const allKeys = new Set([
    ...Object.keys(distA),
    ...Object.keys(distB),
  ]) as Set<MatchEventType>;

  const merged: Partial<Record<MatchEventType, number>> = {};
  for (const key of allKeys) {
    const a = distA[key] ?? 1.0;
    const b = distB[key] ?? 1.0;
    merged[key] = (a + b) / 2;
  }
  return merged;
}

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Get the default event distribution for a tactical identity.
 * Useful for clubs that don't yet have a custom eventDistribution set.
 */
export function getDefaultEventDistribution(
  identity: TacticalIdentity,
): Partial<Record<MatchEventType, number>> {
  return { ...STYLE_EVENT_DISTRIBUTIONS[identity] };
}

/**
 * Get the strength/weakness lists for a tactical identity.
 * Used by tacticalStyle.ts to populate the fields on TacticalStyle.
 */
export function getMatchupProfile(
  identity: TacticalIdentity,
): { strengthAgainst: TacticalIdentity[]; weakAgainst: TacticalIdentity[] } {
  const entry = MATCHUP_MATRIX[identity];
  return {
    strengthAgainst: [...entry.strongAgainst],
    weakAgainst: [...entry.weakAgainst],
  };
}
