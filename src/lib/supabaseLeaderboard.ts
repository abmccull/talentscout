/**
 * Cloud leaderboard functions backed by Supabase PostgreSQL.
 *
 * These functions mirror the local leaderboard API in leaderboard.ts but
 * persist entries to and retrieve them from the `leaderboard_entries` table
 * instead of IndexedDB.  They are intended to be called alongside (or as a
 * replacement for) the local functions when the user is authenticated and has
 * cloud saves enabled.
 *
 * Database table: `leaderboard_entries`
 *   id                  uuid PRIMARY KEY
 *   user_id             uuid NOT NULL
 *   scout_name          text NOT NULL
 *   score               numeric NOT NULL
 *   season              int  NOT NULL
 *   reputation          numeric NOT NULL
 *   total_discoveries   int  NOT NULL
 *   prediction_accuracy numeric NOT NULL
 *   submitted_at        bigint NOT NULL   -- Unix ms timestamp
 *
 * Row-Level Security: INSERT restricted to authenticated users inserting their
 * own user_id; SELECT is public (global leaderboard is world-readable).
 */

import { supabase } from "./supabase";
import type { LeaderboardEntry } from "@/engine/core/types";

// ---------------------------------------------------------------------------
// Row shape returned by Supabase
// ---------------------------------------------------------------------------

interface LeaderboardRow {
  id: string;
  scout_name: string;
  score: number | string;         // numeric may come back as string
  season: number;
  reputation: number | string;
  total_discoveries: number;
  prediction_accuracy: number | string;
  submitted_at: number | string;  // bigint comes back as string
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Submit a leaderboard entry to the cloud.
 *
 * The `entry.id` is used as the primary key so that a locally generated UUID
 * (from `createLeaderboardEntry`) is preserved and the same entry cannot be
 * inserted twice (the second attempt will violate the PK constraint and return
 * an error, which is rethrown).
 *
 * @param userId  The authenticated Supabase user ID.
 * @param entry   The entry produced by `createLeaderboardEntry()`.
 */
export async function submitCloudLeaderboardEntry(
  userId: string,
  entry: LeaderboardEntry,
): Promise<void> {
  const { error } = await supabase.from("leaderboard_entries").insert({
    id: entry.id,
    user_id: userId,
    scout_name: entry.scoutName,
    score: entry.score,
    season: entry.season,
    reputation: entry.reputation,
    total_discoveries: entry.totalDiscoveries,
    prediction_accuracy: entry.predictionAccuracy,
    submitted_at: entry.submittedAt,
  });

  if (error) throw new Error(`Leaderboard submit failed: ${error.message}`);
}

/**
 * Fetch the global leaderboard sorted by score descending.
 *
 * Returns at most `limit` entries (default: 20).  Because the table is
 * world-readable (public SELECT via RLS) this function works for both
 * authenticated and anonymous users.
 *
 * @param limit  Maximum number of entries to return (default 20).
 */
export async function getCloudLeaderboard(
  limit: number = 20,
): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from("leaderboard_entries")
    .select(
      "id, scout_name, score, season, reputation, total_discoveries, prediction_accuracy, submitted_at",
    )
    .order("score", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Leaderboard fetch failed: ${error.message}`);

  return (data ?? []).map((row: LeaderboardRow) => ({
    id: row.id,
    scoutName: row.scout_name,
    score: Number(row.score),
    season: row.season,
    reputation: Number(row.reputation),
    totalDiscoveries: row.total_discoveries,
    predictionAccuracy: Number(row.prediction_accuracy),
    submittedAt: Number(row.submitted_at),
  }));
}
