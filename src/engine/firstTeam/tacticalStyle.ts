/**
 * Tactical style generation for clubs.
 *
 * Each club gets a TacticalStyle that describes how they play, generated
 * deterministically from their scouting philosophy and reputation.
 */

import type { RNG } from "@/engine/rng";
import type { ScoutingPhilosophy, TacticalIdentity, TacticalStyle } from "@/engine/core/types";
import { getDefaultEventDistribution, getMatchupProfile } from "@/engine/match/tactics";

// =============================================================================
// IDENTITY PROFILES
// =============================================================================

interface IdentityProfile {
  identity: TacticalIdentity;
  defensiveLine: [number, number];
  pressingIntensity: [number, number];
  tempo: [number, number];
  width: [number, number];
  directness: [number, number];
}

const IDENTITY_PROFILES: Record<TacticalIdentity, IdentityProfile> = {
  possessionBased: {
    identity: "possessionBased",
    defensiveLine: [12, 16],
    pressingIntensity: [12, 16],
    tempo: [6, 10],
    width: [10, 14],
    directness: [3, 7],
  },
  highPress: {
    identity: "highPress",
    defensiveLine: [14, 18],
    pressingIntensity: [16, 20],
    tempo: [14, 18],
    width: [10, 14],
    directness: [8, 13],
  },
  counterAttacking: {
    identity: "counterAttacking",
    defensiveLine: [4, 8],
    pressingIntensity: [4, 8],
    tempo: [12, 16],
    width: [8, 12],
    directness: [10, 15],
  },
  directPlay: {
    identity: "directPlay",
    defensiveLine: [6, 10],
    pressingIntensity: [8, 12],
    tempo: [14, 18],
    width: [14, 18],
    directness: [14, 18],
  },
  balanced: {
    identity: "balanced",
    defensiveLine: [8, 13],
    pressingIntensity: [8, 13],
    tempo: [8, 13],
    width: [8, 13],
    directness: [8, 13],
  },
  wingPlay: {
    identity: "wingPlay",
    defensiveLine: [10, 14],
    pressingIntensity: [10, 14],
    tempo: [10, 14],
    width: [16, 20],
    directness: [10, 14],
  },
};

// =============================================================================
// PHILOSOPHY → IDENTITY MAPPING
// =============================================================================

/** Weighted identity distribution per scouting philosophy. */
const PHILOSOPHY_IDENTITY_WEIGHTS: Record<ScoutingPhilosophy, Array<{ item: TacticalIdentity; weight: number }>> = {
  academyFirst: [
    { item: "possessionBased", weight: 40 },
    { item: "highPress", weight: 20 },
    { item: "balanced", weight: 20 },
    { item: "wingPlay", weight: 15 },
    { item: "counterAttacking", weight: 5 },
  ],
  winNow: [
    { item: "highPress", weight: 30 },
    { item: "possessionBased", weight: 25 },
    { item: "counterAttacking", weight: 20 },
    { item: "balanced", weight: 15 },
    { item: "wingPlay", weight: 10 },
  ],
  marketSmart: [
    { item: "balanced", weight: 30 },
    { item: "counterAttacking", weight: 25 },
    { item: "highPress", weight: 20 },
    { item: "possessionBased", weight: 15 },
    { item: "wingPlay", weight: 10 },
  ],
  globalRecruiter: [
    { item: "possessionBased", weight: 25 },
    { item: "wingPlay", weight: 25 },
    { item: "balanced", weight: 20 },
    { item: "highPress", weight: 15 },
    { item: "directPlay", weight: 10 },
    { item: "counterAttacking", weight: 5 },
  ],
};

// =============================================================================
// GENERATION
// =============================================================================

function rangeValue(rng: RNG, range: [number, number]): number {
  return Math.round(Math.max(1, Math.min(20, rng.nextInt(range[0], range[1]))));
}

/**
 * Generate a tactical style for a club based on its philosophy and reputation.
 *
 * Higher reputation clubs bias toward more proactive styles.
 */
export function generateTacticalStyle(
  rng: RNG,
  philosophy: ScoutingPhilosophy,
  reputation: number,
): TacticalStyle {
  // Select identity with reputation influence
  const weights = PHILOSOPHY_IDENTITY_WEIGHTS[philosophy].map((w) => {
    let adjusted = w.weight;
    // High-rep clubs more likely to get proactive identities
    if (reputation >= 70) {
      if (w.item === "possessionBased" || w.item === "highPress") adjusted *= 1.3;
      if (w.item === "directPlay" || w.item === "counterAttacking") adjusted *= 0.7;
    }
    // Low-rep clubs more likely to get reactive identities
    if (reputation < 40) {
      if (w.item === "directPlay" || w.item === "counterAttacking") adjusted *= 1.5;
      if (w.item === "possessionBased") adjusted *= 0.5;
    }
    return { item: w.item, weight: adjusted };
  });

  const identity = rng.pickWeighted(weights);
  const profile = IDENTITY_PROFILES[identity];

  const matchupProfile = getMatchupProfile(identity);

  return {
    defensiveLine: rangeValue(rng, profile.defensiveLine),
    pressingIntensity: rangeValue(rng, profile.pressingIntensity),
    tempo: rangeValue(rng, profile.tempo),
    width: rangeValue(rng, profile.width),
    directness: rangeValue(rng, profile.directness),
    tacticalIdentity: identity,
    eventDistribution: getDefaultEventDistribution(identity),
    strengthAgainst: matchupProfile.strengthAgainst,
    weakAgainst: matchupProfile.weakAgainst,
  };
}

/**
 * Generate a tactical style deterministically from philosophy and reputation.
 * Used for migration of existing saves (no RNG needed — uses a simple hash).
 */
export function deriveTacticalStyleFromPhilosophy(
  philosophy: ScoutingPhilosophy,
  reputation: number,
): TacticalStyle {
  // Deterministic identity selection based on philosophy
  const identityMap: Record<ScoutingPhilosophy, TacticalIdentity> = {
    academyFirst: "possessionBased",
    winNow: reputation >= 60 ? "highPress" : "counterAttacking",
    marketSmart: "balanced",
    globalRecruiter: reputation >= 50 ? "wingPlay" : "balanced",
  };

  const identity = identityMap[philosophy];
  const profile = IDENTITY_PROFILES[identity];

  const matchupProfile = getMatchupProfile(identity);

  // Use midpoints of ranges for deterministic derivation
  return {
    defensiveLine: Math.round((profile.defensiveLine[0] + profile.defensiveLine[1]) / 2),
    pressingIntensity: Math.round((profile.pressingIntensity[0] + profile.pressingIntensity[1]) / 2),
    tempo: Math.round((profile.tempo[0] + profile.tempo[1]) / 2),
    width: Math.round((profile.width[0] + profile.width[1]) / 2),
    directness: Math.round((profile.directness[0] + profile.directness[1]) / 2),
    tacticalIdentity: identity,
    eventDistribution: getDefaultEventDistribution(identity),
    strengthAgainst: matchupProfile.strengthAgainst,
    weakAgainst: matchupProfile.weakAgainst,
  };
}
