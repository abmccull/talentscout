/**
 * Discovery tracking — wonderkid career trajectory recording and prediction
 * accuracy measurement.
 *
 * All functions are pure: no mutation of inputs, no side effects.
 */

import type {
  DiscoveryRecord,
  CareerSnapshot,
  Player,
  Scout,
} from "@/engine/core/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum PA to classify a discovery as a "wonderkid" find. */
const WONDERKID_PA_THRESHOLD = 150;

/** Maximum player age to qualify as a wonderkid at the time of discovery. */
const WONDERKID_MAX_AGE = 21;

/**
 * The CA boundary used in the accuracy formula to decide whether a player
 * "reached a high ceiling" (i.e. achieved elite-level development).
 */
const HIGH_CEILING_CA_THRESHOLD = 150;

// ---------------------------------------------------------------------------
// recordDiscovery
// ---------------------------------------------------------------------------

/**
 * Create a new DiscoveryRecord when a scout first observes a player.
 *
 * `wasWonderkid` is set to true when:
 *   - the player's age at discovery is <= 21, AND
 *   - the player's potentialAbility >= 150
 *
 * `initialPA` records the true PA at discovery (the game engine knows it even
 * if the scout does not yet); it is used later for prediction accuracy scoring.
 */
export function recordDiscovery(
  player: Player,
  scout: Scout,
  currentWeek: number,
  currentSeason: number,
): DiscoveryRecord {
  const wasWonderkid =
    player.age <= WONDERKID_MAX_AGE &&
    player.potentialAbility >= WONDERKID_PA_THRESHOLD;

  return {
    playerId: player.id,
    discoveredWeek: currentWeek,
    discoveredSeason: currentSeason,
    initialCA: player.currentAbility,
    initialPA: player.potentialAbility,
    careerSnapshots: [],
    wasWonderkid,
    predictionAccuracy: undefined,
  };
}

// ---------------------------------------------------------------------------
// addSeasonSnapshot
// ---------------------------------------------------------------------------

/**
 * Append a CareerSnapshot for the given season to a DiscoveryRecord.
 *
 * If a snapshot for `season` already exists it is replaced, ensuring
 * idempotent end-of-season processing.
 *
 * Returns a new DiscoveryRecord; the input is never mutated.
 */
export function addSeasonSnapshot(
  record: DiscoveryRecord,
  player: Player,
  season: number,
): DiscoveryRecord {
  const snapshot: CareerSnapshot = {
    season,
    clubId: player.clubId,
    currentAbility: player.currentAbility,
    position: player.position,
    age: player.age,
  };

  // Replace any existing snapshot for this season so the function is safe to
  // call multiple times (e.g. during end-of-season batch processing).
  const filtered = record.careerSnapshots.filter((s) => s.season !== season);

  return {
    ...record,
    careerSnapshots: [...filtered, snapshot],
  };
}

// ---------------------------------------------------------------------------
// calculatePredictionAccuracy
// ---------------------------------------------------------------------------

/**
 * Score the scout's initial assessment against the player's actual development.
 * Returns a value in [0, 100].
 *
 * The scoring tiers are:
 *
 *  1. Scout predicted HIGH ceiling (initialPA >= 150) AND player reached it
 *     (currentAbility >= 150): 90–100
 *
 *  2. Scout predicted HIGH ceiling but player did not reach it: 30–50
 *
 *  3. Scout did NOT predict high ceiling but player exceeded it
 *     (currentAbility >= 150): 10–30
 *
 *  4. General case: 100 - |initialPA - currentAbility| / 2
 *     Clamped to [0, 100].
 *
 * When `initialPA` is absent the function falls back to comparing `initialCA`
 * with `currentAbility` using the general formula.
 */
export function calculatePredictionAccuracy(
  record: DiscoveryRecord,
  player: Player,
): number {
  const predictedCeiling = record.initialPA;
  const currentCA = player.currentAbility;

  const scoutPredictedHighCeiling =
    predictedCeiling !== undefined && predictedCeiling >= HIGH_CEILING_CA_THRESHOLD;
  const playerReachedHighCeiling = currentCA >= HIGH_CEILING_CA_THRESHOLD;

  // -------------------------------------------------------------------------
  // Tier 1 — scout was right about elite potential AND player delivered
  // -------------------------------------------------------------------------
  if (scoutPredictedHighCeiling && playerReachedHighCeiling) {
    if (predictedCeiling === undefined) return 90; // guard; cannot happen here
    // Finer resolution within 90–100 based on how close prediction was to CA
    const error = Math.abs(predictedCeiling - currentCA);
    // error=0 → 100; error=20 → 90; linear interpolation, capped at bounds
    const score = 100 - error * 0.5;
    return Math.round(Math.max(90, Math.min(100, score)));
  }

  // -------------------------------------------------------------------------
  // Tier 2 — scout predicted elite but player fell short
  // -------------------------------------------------------------------------
  if (scoutPredictedHighCeiling && !playerReachedHighCeiling) {
    // Closer the player got, the higher within [30, 50]
    const proximity = currentCA / HIGH_CEILING_CA_THRESHOLD; // 0–1
    const score = 30 + proximity * 20;
    return Math.round(Math.max(30, Math.min(50, score)));
  }

  // -------------------------------------------------------------------------
  // Tier 3 — scout missed it but player exceeded expectations
  // -------------------------------------------------------------------------
  if (!scoutPredictedHighCeiling && playerReachedHighCeiling) {
    // Higher score when the scout at least had a higher initial CA reading
    const baseCA = record.initialCA;
    // How close was the initial CA read to the threshold? 0–1
    const proximity = Math.min(1, baseCA / HIGH_CEILING_CA_THRESHOLD);
    const score = 10 + proximity * 20;
    return Math.round(Math.max(10, Math.min(30, score)));
  }

  // -------------------------------------------------------------------------
  // General case — neither side involved elite thresholds
  // Formula: 100 - |predictedCA - currentCA| / 2
  // Use initialPA when available, otherwise fall back to initialCA.
  // -------------------------------------------------------------------------
  const predictedCA = predictedCeiling ?? record.initialCA;
  const error = Math.abs(predictedCA - currentCA);
  const score = 100 - error / 2;
  return Math.round(Math.max(0, Math.min(100, score)));
}

// ---------------------------------------------------------------------------
// processSeasonDiscoveries
// ---------------------------------------------------------------------------

/**
 * End-of-season batch processing for all tracked discovery records.
 *
 * For each record:
 *  1. Adds a career snapshot for `currentSeason` (uses the live player data).
 *  2. Recalculates prediction accuracy from the latest player state.
 *
 * Players not found in the `players` map are skipped silently (handles the
 * edge case where a tracked player has been removed from the world data).
 *
 * Returns a new array of updated DiscoveryRecords; inputs are not mutated.
 */
export function processSeasonDiscoveries(
  discoveries: DiscoveryRecord[],
  players: Record<string, Player>,
  currentSeason: number,
): DiscoveryRecord[] {
  return discoveries.map((record) => {
    const player = players[record.playerId];
    if (player === undefined) {
      // Player no longer in world data — return unchanged record
      return record;
    }

    const withSnapshot = addSeasonSnapshot(record, player, currentSeason);
    const accuracy = calculatePredictionAccuracy(withSnapshot, player);

    return {
      ...withSnapshot,
      predictionAccuracy: accuracy,
    };
  });
}

// ---------------------------------------------------------------------------
// getWonderkidDiscoveries
// ---------------------------------------------------------------------------

/**
 * Filter a discoveries array to only those flagged as wonderkid finds.
 */
export function getWonderkidDiscoveries(
  discoveries: DiscoveryRecord[],
): DiscoveryRecord[] {
  return discoveries.filter((d) => d.wasWonderkid);
}

// ---------------------------------------------------------------------------
// getDiscoveryStats
// ---------------------------------------------------------------------------

/**
 * Compute summary statistics across all discovery records.
 *
 * `avgAccuracy` is calculated only from records that have a
 * `predictionAccuracy` value. Returns 0 when no accuracy values exist.
 */
export function getDiscoveryStats(
  discoveries: DiscoveryRecord[],
): { total: number; wonderkids: number; avgAccuracy: number } {
  const total = discoveries.length;
  const wonderkids = discoveries.filter((d) => d.wasWonderkid).length;

  const scoredRecords = discoveries.filter(
    (d): d is DiscoveryRecord & { predictionAccuracy: number } =>
      d.predictionAccuracy !== undefined,
  );

  const avgAccuracy =
    scoredRecords.length > 0
      ? scoredRecords.reduce((sum, d) => sum + d.predictionAccuracy, 0) /
        scoredRecords.length
      : 0;

  return {
    total,
    wonderkids,
    avgAccuracy: Math.round(avgAccuracy * 10) / 10, // one decimal place
  };
}
