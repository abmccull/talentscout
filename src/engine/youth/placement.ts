/**
 * Placement pipeline — the core loop for recommending unsigned youth to clubs.
 *
 * Design notes:
 *  - Pure functions: no side effects, no mutation.
 *  - All randomness flows through the RNG instance.
 *  - The placement system converts unsigned youth into signed players.
 */

import type { RNG } from "@/engine/rng";
import type {
  UnsignedYouth,
  PlacementReport,
  Club,
  Scout,
  Observation,
  Player,
  ConvictionLevel,
} from "@/engine/core/types";

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Compute the average confidence across all attribute readings in an
 * observation set that are relevant to the given youth player.
 */
function averageConfidence(observations: Observation[], youthPlayerId: string): number {
  const readings = observations
    .filter((obs) => obs.playerId === youthPlayerId)
    .flatMap((obs) => obs.attributeReadings);

  if (readings.length === 0) return 0;

  const total = readings.reduce((sum, r) => sum + r.confidence, 0);
  return total / readings.length;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Create a placement report from scout observations of an unsigned youth.
 *
 * Conviction level rules (in descending priority):
 *  - 6+ observations with avg confidence > 0.6  → "tablePound"
 *  - 4–5 observations with avg confidence > 0.5  → "strongRecommend"
 *  - 2–3 observations                             → "recommend"
 *  - 1 observation                                → "note"
 *
 * Quality score (0–100) is a weighted combination of:
 *  - Observation count  (40%): min(count / 6, 1) * 40
 *  - Average confidence (30%): avgConfidence * 30
 *  - Scout reputation   (15%): (scout.reputation / 100) * 15
 *  - Youth buzz level   (15%): (youth.buzzLevel / 100) * 15
 */
export function generatePlacementReport(
  _rng: RNG,
  youth: UnsignedYouth,
  targetClub: Club,
  observations: Observation[],
  scout: Scout,
  week: number,
  season: number,
): PlacementReport {
  const youthObservations = observations.filter((obs) => obs.playerId === youth.player.id);
  const count = youthObservations.length;
  const avgConfidence = averageConfidence(observations, youth.player.id);

  // Derive conviction level
  let conviction: ConvictionLevel;
  if (count >= 6 && avgConfidence > 0.6) {
    conviction = "tablePound";
  } else if (count >= 4 && avgConfidence > 0.5) {
    conviction = "strongRecommend";
  } else if (count >= 2) {
    conviction = "recommend";
  } else {
    conviction = "note";
  }

  // Quality score (0–100)
  const countFactor = Math.min(count / 6, 1) * 40;
  const confidenceFactor = avgConfidence * 30;
  const reputationFactor = (scout.reputation / 100) * 15;
  const buzzFactor = (youth.buzzLevel / 100) * 15;
  const qualityScore = Math.round(countFactor + confidenceFactor + reputationFactor + buzzFactor);

  // Generate a stable deterministic id from the constituent ids
  const id = `pr_${youth.id.slice(0, 8)}_${targetClub.id.slice(0, 8)}_${scout.id.slice(0, 8)}_s${season}w${week}`;

  return {
    id,
    unsignedYouthId: youth.id,
    targetClubId: targetClub.id,
    scoutId: scout.id,
    conviction,
    clubResponse: "pending",
    qualityScore,
    week,
    season,
  };
}

/**
 * Returns a 0–1 probability that the club will accept the placement.
 *
 * Base chance by conviction:
 *   "note"           → 0.10
 *   "recommend"      → 0.40
 *   "strongRecommend"→ 0.65
 *   "tablePound"     → 0.85
 *
 * Multiplicative modifiers:
 *   Scout reputation:       * (0.5 + scout.reputation / 200)    → [0.5x, 1.0x]
 *   Club academy quality:   rating > 15 → * 0.7
 *                           rating 10–15 → * 1.0
 *                           rating < 10 → * 1.3
 *   Youth buzz level:       * (0.7 + youth.buzzLevel / 300)      → [0.7x, 1.03x]
 *   Youth PA indicator:     if potentialAbility > 150 → * 1.2
 *   Perk bonus:             if placementReputationBonus → * 1.25
 *
 * Result is clamped to [0.05, 0.95].
 */
export function calculateClubAcceptanceChance(
  report: PlacementReport,
  youth: UnsignedYouth,
  club: Club,
  scout: Scout,
  perkModifiers?: { placementReputationBonus?: boolean },
): number {
  // Base chance by conviction
  const BASE_CHANCE: Record<ConvictionLevel, number> = {
    note: 0.10,
    recommend: 0.40,
    strongRecommend: 0.65,
    tablePound: 0.85,
  };

  let chance = BASE_CHANCE[report.conviction];

  // Scout reputation modifier: range [0.5, 1.0]
  chance *= 0.5 + scout.reputation / 200;

  // Club academy selectivity
  if (club.youthAcademyRating > 15) {
    chance *= 0.7;
  } else if (club.youthAcademyRating < 10) {
    chance *= 1.3;
  }
  // Rating 10–15: * 1.0 (no change)

  // Youth buzz modifier: range [0.7, 1.03]
  chance *= 0.7 + youth.buzzLevel / 300;

  // High-PA bonus
  if (youth.player.potentialAbility > 150) {
    chance *= 1.2;
  }

  // Perk bonus
  if (perkModifiers?.placementReputationBonus) {
    chance *= 1.25;
  }

  return Math.min(0.95, Math.max(0.05, chance));
}

/**
 * Roll the placement outcome and, on success, convert the unsigned youth to a
 * signed player at the target club.
 *
 * Placement type:
 *   age 14–15 → "academyIntake"
 *   age 16+   → "youthContract"
 *
 * Wage is calculated as: Math.round(currentAbility * 50)
 * Contract expiry: report.season + 3
 */
export function processPlacementOutcome(
  rng: RNG,
  report: PlacementReport,
  chance: number,
  youth: UnsignedYouth,
  club: Club,
): {
  success: boolean;
  placementType: "academyIntake" | "youthContract" | null;
  updatedYouth: UnsignedYouth;
  newPlayer?: Player;
} {
  const success = rng.chance(chance);

  if (!success) {
    return {
      success: false,
      placementType: null,
      updatedYouth: { ...youth, placed: false },
    };
  }

  // Determine placement type by age
  const placementType: "academyIntake" | "youthContract" =
    youth.player.age <= 15 ? "academyIntake" : "youthContract";

  // Build the signed player
  const newPlayer: Player = {
    ...youth.player,
    clubId: club.id,
    contractExpiry: report.season + 3,
    wage: Math.round(youth.player.currentAbility * 50),
  };

  // Mark youth as placed
  const updatedYouth: UnsignedYouth = {
    ...youth,
    placed: true,
    placedClubId: club.id,
  };

  return {
    success: true,
    placementType,
    updatedYouth,
    newPlayer,
  };
}

/**
 * Return clubs that are reasonable targets for placing this youth.
 *
 * Filters:
 *  - youthAcademyRating >= 5
 *  - playerIds.length < 30 (squad not full)
 *
 * The scout's own club (if any) appears first regardless of academy rating.
 * Results are sorted by youthAcademyRating descending (best academies first),
 * then the top 10 are returned.
 */
export function getEligibleClubsForPlacement(
  _youth: UnsignedYouth,
  clubs: Club[],
  scout: Scout,
): Club[] {
  const eligible = clubs.filter(
    (club) => club.youthAcademyRating >= 5 && club.playerIds.length < 30,
  );

  // Sort by youthAcademyRating descending, then promote scout's club to front
  const sorted = [...eligible].sort((a, b) => b.youthAcademyRating - a.youthAcademyRating);

  if (scout.currentClubId) {
    const scoutClubIndex = sorted.findIndex((c) => c.id === scout.currentClubId);
    if (scoutClubIndex > 0) {
      // Move scout's club to the front
      const [scoutClub] = sorted.splice(scoutClubIndex, 1);
      sorted.unshift(scoutClub);
    }
  }

  return sorted.slice(0, 10);
}
