/**
 * Discovery tracking — internal career trajectory recording. Scout accuracy
 * comes from delayed report validation, never from hidden generation values.
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
 * if the scout does not yet). It is diagnostic history, not a scout prediction.
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
// processSeasonDiscoveries
// ---------------------------------------------------------------------------

/**
 * End-of-season batch processing for all tracked discovery records.
 *
 * For each record, adds a career snapshot for `currentSeason` using the live
 * player data. Accuracy is deliberately cleared here and synchronized later
 * from delayed ScoutReport validation; true PA must never masquerade as the
 * scout's own prediction.
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

    return {
      ...addSeasonSnapshot(record, player, currentSeason),
      predictionAccuracy: undefined,
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
