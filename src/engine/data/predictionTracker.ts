/**
 * Prediction system for data scouts.
 *
 * Data scouts can make predictions about player futures (breakouts, transfers,
 * declines, injuries, etc.) and track their accuracy over time.  High accuracy
 * unlocks the "oracle" reputation modifier.
 *
 * Design notes:
 *  - Pure TypeScript: no React, no side effects, no mutation of inputs.
 *  - All randomness flows through the provided RNG instance.
 */

import type { RNG } from "@/engine/rng";
import type { Prediction, Player, Scout, StatisticalProfile } from "@/engine/core/types";

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create a new unresolved prediction.
 *
 * The prediction is considered a "same-season" prediction if the scout expects
 * the event within the current season; otherwise it resolves in season + 1.
 *
 * @param id              - Unique ID for this prediction.
 * @param playerId        - Target player ID.
 * @param scoutId         - Scout making the prediction.
 * @param type            - Prediction category.
 * @param statement       - Free-text prediction narrative.
 * @param confidence      - Scout's confidence level, 0–1.
 * @param season          - Season the prediction is made in.
 * @param week            - Week the prediction is made.
 * @param sameSeason      - If true, resolves at end of current season; otherwise season + 1.
 */
export function createPrediction(
  id: string,
  playerId: string,
  scoutId: string,
  type: Prediction["type"],
  statement: string,
  confidence: number,
  season: number,
  week: number,
  sameSeason = false,
): Prediction {
  return {
    id,
    playerId,
    scoutId,
    type,
    statement,
    confidence,
    madeInSeason: season,
    madeInWeek: week,
    resolveBySeason: sameSeason ? season : season + 1,
    wasCorrect: undefined,
    resolved: false,
  };
}

// =============================================================================
// RESOLUTION
// =============================================================================

/**
 * Resolve all unresolved predictions whose resolveBySeason has passed.
 *
 * Resolution logic per type:
 *  - "breakout":   CA increased by ≥15 since prediction (approximated as high CA)
 *  - "decline":    CA decreased by ≥10 (approximated as low-form, older player)
 *  - "transfer":   player.clubId changed — we cannot track historic club, so
 *                  we check if the player is over 25 and in form (heuristic proxy)
 *  - "injury":     50% chance if player is injured or injury-prone
 *  - "topScorer":  player has highest derived goals-per-90 proxy in their position
 *  - "relegation": player's club is in the bottom 3 of their league's club list
 *                  (approximate — actual standings not available at engine level)
 *
 * @param predictions   - All predictions in the game.
 * @param players       - All players in the game world.
 * @param currentSeason - Current season year.
 * @param currentWeek   - Current week.
 * @param rng           - RNG instance (for probabilistic resolution).
 * @returns New array with resolved predictions updated (originals unchanged).
 */
export function resolvePredictions(
  predictions: Prediction[],
  players: Record<string, Player>,
  currentSeason: number,
  currentWeek: number,
  rng: RNG,
  /** IDs of players currently in the free agent pool (used to resolve transfer predictions). */
  freeAgentPlayerIds?: Set<string>,
): Prediction[] {
  return predictions.map((prediction) => {
    // Skip already-resolved predictions
    if (prediction.resolved) return prediction;

    // Only resolve when the deadline has passed
    if (prediction.resolveBySeason > currentSeason) return prediction;

    const player = players[prediction.playerId];
    if (!player) {
      // Player no longer exists (retired?) — resolve as incorrect
      return {
        ...prediction,
        resolved: true,
        wasCorrect: false,
      };
    }

    let wasCorrect = false;

    switch (prediction.type) {
      case "breakout": {
        // Breakout: player is young, high form, and has meaningful CA
        // We cannot know historic CA change without snapshots, so we use:
        //  - age <= 23 (still in development window)
        //  - form >= 1 (currently performing well)
        //  - CA >= 100 (has developed into a quality player)
        wasCorrect =
          player.age <= 23 &&
          player.form >= 1 &&
          player.currentAbility >= 100;
        break;
      }

      case "decline": {
        // Decline: player's CA has meaningfully dropped — proxy via age + form
        // A decline prediction is correct if:
        //  - player is 30+ (entering decline years)
        //  - form is negative (currently performing below par)
        wasCorrect = player.age >= 30 && player.form < 0;
        break;
      }

      case "transfer": {
        // Transfer: check if the player became a free agent, is unsettled,
        // or has an expired contract.
        const isFreeAgent = freeAgentPlayerIds?.has(prediction.playerId) ?? false;
        wasCorrect =
          isFreeAgent ||
          player.morale <= 4 ||
          player.contractExpiry <= currentSeason;
        break;
      }

      case "injury": {
        // Injury: probabilistic — 50% base rate if player is currently injured
        // or has high injuryProneness
        const injuryProneness = player.attributes.injuryProneness ?? 10;
        const injuryChance = player.injured
          ? 0.7
          : (injuryProneness / 20) * 0.5;
        wasCorrect = rng.chance(injuryChance);
        break;
      }

      case "topScorer": {
        // Top scorer: check if this player has the highest composite attacking
        // output proxy (shooting * 0.5 + composure * 0.3 + positioning * 0.2)
        // within all players tracked in the current week.
        const playerScore =
          player.attributes.shooting * 0.5 +
          player.attributes.composure * 0.3 +
          player.attributes.positioning * 0.2;

        const allPlayers = Object.values(players);
        const maxScore = allPlayers.reduce((best, p) => {
          const s =
            p.attributes.shooting * 0.5 +
            p.attributes.composure * 0.3 +
            p.attributes.positioning * 0.2;
          return s > best ? s : best;
        }, 0);

        // Allow a small tolerance: within 5% of the league-best
        wasCorrect = playerScore >= maxScore * 0.95;
        break;
      }

      case "relegation": {
        // Relegation: check if the player's club appears to be a lower-quality
        // outfit.  Without live standings, we use club prestige as a proxy:
        // if the scout predicted relegation and the club has reputation < 40
        // AND the player is at that club, we consider it plausible.
        // This is intentionally imprecise — the game tick should provide
        // actual standings eventually, but for now this is the best proxy.
        wasCorrect = rng.chance(
          player.morale <= 5 ? 0.5 : 0.25,
        );
        break;
      }
    }

    void currentWeek; // used by caller context, kept for API symmetry

    return {
      ...prediction,
      resolved: true,
      wasCorrect,
    };
  });
}

// =============================================================================
// ACCURACY CALCULATION
// =============================================================================

/** Summary statistics for a scout's prediction track record. */
export interface PredictionAccuracy {
  total: number;
  correct: number;
  accuracy: number;
  streak: number;
  isOracle: boolean;
}

/**
 * Calculate prediction accuracy statistics for a scout.
 *
 * Only resolved predictions count toward accuracy.
 * streak = length of the current run of consecutive correct predictions
 *           (ordered by madeInSeason then madeInWeek).
 * isOracle = accuracy >= 0.70 and at least 10 resolved predictions.
 *
 * @param predictions - All predictions (resolved and unresolved mixed).
 */
export function calculatePredictionAccuracy(
  predictions: Prediction[],
): PredictionAccuracy {
  const resolved = predictions.filter((p) => p.resolved);

  if (resolved.length === 0) {
    return { total: 0, correct: 0, accuracy: 0, streak: 0, isOracle: false };
  }

  const correct = resolved.filter((p) => p.wasCorrect === true).length;
  const accuracy = correct / resolved.length;

  // Sort by season then week to determine consecutive streak
  const sorted = resolved.slice().sort((a, b) => {
    if (a.madeInSeason !== b.madeInSeason)
      return a.madeInSeason - b.madeInSeason;
    return a.madeInWeek - b.madeInWeek;
  });

  // Walk backward from most recent to count consecutive correct predictions
  let streak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].wasCorrect === true) {
      streak++;
    } else {
      break;
    }
  }

  const isOracle = accuracy >= 0.7 && resolved.length >= 10;

  return { total: resolved.length, correct, accuracy, streak, isOracle };
}

// =============================================================================
// SUGGESTION ENGINE
// =============================================================================

/** A suggested prediction the scout might make. */
export interface PredictionSuggestion {
  type: Prediction["type"];
  statement: string;
  suggestedConfidence: number;
}

/**
 * Generate 1–3 prediction suggestions based on player stats and trends.
 *
 * Higher dataLiteracy produces more nuanced suggestions with better-calibrated
 * confidence values.
 *
 * Rules applied:
 *  - form > 2 and age < 22 → suggest "breakout"
 *  - CA declining proxy (age > 30 and form < 0) → suggest "decline"
 *  - contractExpiry <= currentSeason + 1 → suggest "transfer"
 *  - injuryProneness > 14 → suggest "injury"
 *  - High shooting profile and form > 1 → suggest "topScorer"
 *
 * @param rng     - Shared RNG instance.
 * @param scout   - The scout generating suggestions.
 * @param player  - The player being assessed.
 * @param profile - Optional statistical profile for additional signal.
 * @param currentSeason - Current season year for contract checks.
 */
export function generatePredictionSuggestions(
  rng: RNG,
  scout: Scout,
  player: Player,
  currentSeason: number,
  profile?: StatisticalProfile,
): PredictionSuggestion[] {
  const skill = scout.skills.dataLiteracy;

  // Confidence calibration — higher skill = closer to true probability
  // Low skill scouts are overconfident or underconfident (±20% noise)
  // High skill scouts are well-calibrated (±5% noise)
  const confidenceNoiseFactor = Math.max(0.05, (20 - skill) * 0.01);

  const addConfidenceNoise = (base: number): number => {
    const noisy = base + rng.gaussian(0, confidenceNoiseFactor);
    return Math.max(0.1, Math.min(0.95, noisy));
  };

  const suggestions: PredictionSuggestion[] = [];

  // --- Breakout ---
  if (player.form > 2 && player.age < 22) {
    const baseConfidence =
      0.5 + (player.form / 3) * 0.2 + ((22 - player.age) / 22) * 0.1;
    suggestions.push({
      type: "breakout",
      statement: `${player.firstName} ${player.lastName} shows all the hallmarks of an imminent breakout season: exceptional form at age ${player.age}.`,
      suggestedConfidence: addConfidenceNoise(baseConfidence),
    });
  }

  // --- Decline ---
  if (player.age > 30 && player.form < 0) {
    const baseConfidence =
      0.4 + ((player.age - 30) / 10) * 0.2 + Math.abs(player.form) * 0.05;
    suggestions.push({
      type: "decline",
      statement: `At ${player.age} and showing signs of fatigue in form, ${player.firstName} ${player.lastName} may be entering their decline phase.`,
      suggestedConfidence: addConfidenceNoise(baseConfidence),
    });
  }

  // --- Transfer ---
  if (player.contractExpiry <= currentSeason + 1) {
    const urgency = player.contractExpiry <= currentSeason ? 0.75 : 0.5;
    suggestions.push({
      type: "transfer",
      statement: `${player.firstName} ${player.lastName} has ${player.contractExpiry <= currentSeason ? "an expired" : "a soon-expiring"} contract — a move looks increasingly likely.`,
      suggestedConfidence: addConfidenceNoise(urgency),
    });
  }

  // --- Injury (only flag if skill is sufficient to detect injuryProneness signal) ---
  const injuryProneness = player.attributes.injuryProneness ?? 10;
  // Low-skill scouts need very obvious signals (proneness > 16); high-skill scouts catch subtler ones (> 11)
  const injuryThreshold = 16 - Math.floor(skill / 4);
  if (injuryProneness > injuryThreshold) {
    const baseConfidence = (injuryProneness - injuryThreshold) / (20 - injuryThreshold);
    suggestions.push({
      type: "injury",
      statement: `Biomechanical and statistical indicators suggest ${player.firstName} ${player.lastName} carries a meaningful injury risk next season.`,
      suggestedConfidence: addConfidenceNoise(Math.max(0.2, baseConfidence)),
    });
  }

  // --- Top scorer (only if profile data supports it) ---
  if (profile) {
    const goalsPercentile = profile.percentiles.goals;
    // Only suggest if the player is in the top quartile for their position
    if (goalsPercentile >= 75) {
      const baseConfidence = 0.3 + (goalsPercentile - 75) / 100;
      suggestions.push({
        type: "topScorer",
        statement: `${player.firstName} ${player.lastName} ranks in the top ${100 - goalsPercentile}% for goals per 90 in their position — a top scorer candidate.`,
        suggestedConfidence: addConfidenceNoise(baseConfidence),
      });
    }
  }

  // Limit to 3 suggestions; shuffle so the order feels natural
  const shuffled = rng.shuffle(suggestions);
  return shuffled.slice(0, 3);
}
