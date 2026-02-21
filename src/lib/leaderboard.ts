/**
 * Local leaderboard system backed by IndexedDB (via Dexie).
 *
 * Cloud synchronisation is not yet configured; all data lives in the
 * browser's IndexedDB. The table is declared in db.ts at version 2.
 *
 * Score formula:
 *   score = reputation * 2 + totalDiscoveries * 5 + predictionAccuracy * 1.5
 *
 * `predictionAccuracy` is the arithmetic mean of all DiscoveryRecord
 * `predictionAccuracy` values for the season. Records that have not yet
 * received a retrospective accuracy rating are excluded from the average.
 * When no rated records exist the value is 0.
 */

import type { GameState, LeaderboardEntry, Scout } from "@/engine/core/types";
import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the average predictionAccuracy across all DiscoveryRecords that
 * have been rated (i.e. the optional field is present and numeric).
 * Returns 0 when no rated records exist.
 */
function computeAveragePredictionAccuracy(state: GameState): number {
  const rated = state.discoveryRecords.filter(
    (r) => typeof r.predictionAccuracy === "number",
  );
  if (rated.length === 0) return 0;

  const sum = rated.reduce((acc, r) => acc + (r.predictionAccuracy ?? 0), 0);
  return sum / rated.length;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a LeaderboardEntry from end-of-season state.
 *
 * The `id` field is a freshly generated UUID so each submission is unique
 * even if the same scout plays multiple seasons.
 */
export function createLeaderboardEntry(
  scout: Scout,
  state: GameState,
  season: number,
): LeaderboardEntry {
  const reputation = scout.reputation;
  const totalDiscoveries = state.discoveryRecords.length;
  const predictionAccuracy = computeAveragePredictionAccuracy(state);

  const score =
    reputation * 2 + totalDiscoveries * 5 + predictionAccuracy * 1.5;

  return {
    id: crypto.randomUUID(),
    scoutName: `${scout.firstName} ${scout.lastName}`,
    score,
    season,
    reputation,
    totalDiscoveries,
    predictionAccuracy,
    submittedAt: Date.now(),
  };
}

/**
 * Persist a leaderboard entry to IndexedDB.
 *
 * Dexie's `++id` primary key means the provided `id` field (UUID string) is
 * stored as-is — the `++` prefix only activates auto-increment when the key
 * is a number type. Since LeaderboardEntry uses a string UUID we use `put`
 * which will upsert by the `id` value.
 */
export async function submitLeaderboardEntry(
  entry: LeaderboardEntry,
): Promise<void> {
  await db.leaderboard.put(entry);
}

/**
 * Retrieve the top `limit` entries sorted by score descending.
 * Defaults to the top 20 entries.
 */
export async function getLeaderboard(
  limit: number = 20,
): Promise<LeaderboardEntry[]> {
  // Dexie's .orderBy() sorts ascending; we reverse for descending score.
  return db.leaderboard.orderBy("score").reverse().limit(limit).toArray();
}

/**
 * Return the highest-scoring entry for a given scout name, or null if no
 * entries exist for that name.
 */
export async function getPersonalBest(
  scoutName: string,
): Promise<LeaderboardEntry | null> {
  // Filter by scoutName then pick the max-score record.
  const entries = await db.leaderboard
    .where("scoutName")
    .equals(scoutName)
    .toArray();

  if (entries.length === 0) return null;

  return entries.reduce((best, current) =>
    current.score > best.score ? current : best,
  );
}

/**
 * Delete all leaderboard entries. Intended for testing and debugging only.
 */
export async function clearLeaderboard(): Promise<void> {
  await db.leaderboard.clear();
}
