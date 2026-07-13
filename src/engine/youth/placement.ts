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
  League,
} from "@/engine/core/types";
import { normalizeCountryKey } from "@/lib/country";
import { getTransferFlowProbability } from "@/engine/world/transfers";

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
    contractClubId: club.id,
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
 * An eligible preferred audience from an authored report appears first. The
 * scout's own club (if any) is otherwise prioritized regardless of academy
 * rating. Remaining results are ordered by route credibility and academy
 * quality, then capped at 10 for presentation.
 */
export function getEligibleClubsForPlacement(
  youth: UnsignedYouth,
  clubs: Club[],
  scout: Scout,
  leagues: Record<string, League> = {},
  options: { preferredClubId?: string } = {},
): Club[] {
  const youthCountry = normalizeCountryKey(youth.country);
  const clubCountry = (club: Club) => normalizeCountryKey(leagues[club.leagueId]?.country);
  const routeScore = (club: Club) => {
    const destinationCountry = clubCountry(club);
    if (!youthCountry || !destinationCountry) return 0.5;
    return getTransferFlowProbability(youthCountry, destinationCountry);
  };
  const isForeign = (club: Club) => {
    const destinationCountry = clubCountry(club);
    return !!youthCountry && !!destinationCountry && youthCountry !== destinationCountry;
  };
  const eligible = clubs.filter((club) => {
    if (
      club.youthAcademyRating < 5 ||
      club.playerIds.length + (club.academyPlayerIds?.length ?? 0) >= 40
    ) {
      return false;
    }
    if (isForeign(club)) {
      if (youth.player.age < 16) return false;
      if (routeScore(club) < 0.06) return false;
    }
    return true;
  });

  return [...eligible]
    .sort((a, b) => {
      // A filed report may already have a real intended audience (most notably
      // a club-issued academy brief). Keep that eligible club inside the
      // bounded shortlist even when stronger academies would otherwise push it
      // below the presentation cap. Preference never bypasses the eligibility
      // checks above.
      if (a.id === options.preferredClubId && b.id !== options.preferredClubId) return -1;
      if (b.id === options.preferredClubId && a.id !== options.preferredClubId) return 1;
      if (a.id === scout.currentClubId) return -1;
      if (b.id === scout.currentClubId) return 1;
      return (
        Number(isForeign(a)) - Number(isForeign(b)) ||
        routeScore(b) - routeScore(a) ||
        b.youthAcademyRating - a.youthAcademyRating
      );
    })
    .slice(0, 10);
}
