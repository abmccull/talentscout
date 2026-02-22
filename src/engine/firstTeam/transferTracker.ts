/**
 * Transfer tracker — monitors the performance of players signed on the scout's
 * recommendation and calculates hit-rate statistics.
 *
 * This module mirrors the alumni tracking pattern used for youth placements but
 * is tailored to first-team transfers: it generates per-season performance
 * snapshots with appearances, goals, and assists, then classifies each transfer
 * as a hit, flop, decent, or too early to judge.
 *
 * Design notes:
 *  - Pure functions: no side effects, no mutation of inputs.
 *  - All randomness flows through the RNG instance.
 *  - Rating scale: 0–100 (70+ = hit, 40–70 = decent, <40 = flop).
 */

import type { RNG } from "@/engine/rng";
import type { Player, Position, TransferRecord } from "@/engine/core/types";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Seasons required before an outcome can be classified as anything but tooEarly. */
const MIN_SEASONS_FOR_OUTCOME = 2;

/** Rating thresholds for outcome classification. */
const RATING_THRESHOLDS = {
  HIT: 70,
  FLOP: 40,
} as const;

/**
 * Typical season appearance ranges by position.
 * First-team regulars appear 25–38 times; fringe players 8–24.
 * These are baseline ranges before CA-relative modifiers.
 */
const BASE_APPEARANCE_RANGE: Record<Position, [number, number]> = {
  GK:  [20, 38],
  CB:  [22, 38],
  LB:  [20, 36],
  RB:  [20, 36],
  CDM: [22, 36],
  CM:  [20, 34],
  CAM: [18, 34],
  LW:  [18, 34],
  RW:  [18, 34],
  ST:  [18, 34],
} as const;

/**
 * Goals-per-appearance probability ranges by position.
 * Defenders / keepers rarely score; forwards score frequently.
 * Values are (goalsPerApp) — multiplied by appearances to give season total.
 */
const GOALS_PER_APPEARANCE: Record<Position, [number, number]> = {
  GK:  [0.00, 0.01],
  CB:  [0.01, 0.05],
  LB:  [0.01, 0.06],
  RB:  [0.01, 0.06],
  CDM: [0.02, 0.08],
  CM:  [0.04, 0.14],
  CAM: [0.08, 0.22],
  LW:  [0.12, 0.32],
  RW:  [0.12, 0.32],
  ST:  [0.20, 0.55],
} as const;

/**
 * Assists-per-appearance probability ranges by position.
 */
const ASSISTS_PER_APPEARANCE: Record<Position, [number, number]> = {
  GK:  [0.00, 0.01],
  CB:  [0.01, 0.04],
  LB:  [0.03, 0.12],
  RB:  [0.03, 0.12],
  CDM: [0.03, 0.10],
  CM:  [0.05, 0.18],
  CAM: [0.10, 0.28],
  LW:  [0.08, 0.22],
  RW:  [0.08, 0.22],
  ST:  [0.04, 0.14],
} as const;

// =============================================================================
// HELPERS
// =============================================================================

/** Bound a number within [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Compute the average current ability of all players currently at a club.
 * Returns 100 as neutral default when squad is empty.
 */
function squadAverageCA(
  clubId: string,
  players: Record<string, Player>,
): number {
  const squad = Object.values(players).filter((p) => p.clubId === clubId);
  if (squad.length === 0) return 100;
  const total = squad.reduce((sum, p) => sum + p.currentAbility, 0);
  return total / squad.length;
}

/**
 * Generate a seasonal performance snapshot for a player at their current club.
 *
 * Rating is computed as:
 *   base = (player.currentAbility / 200) * 100   — pure CA-based floor
 *   CA ratio bonus: if CA > squadAvg → +5; if CA < squadAvg * 0.8 → −10
 *   form modifier: player.form in [-3, 3] → each unit adds ±3 to rating
 *   gaussian noise: ±8 std-dev to simulate season variance
 *
 * Appearances are randomised within position-appropriate ranges, compressed
 * downward when the player is significantly below squad average CA (a weaker
 * player will spend more time on the bench or loaned out).
 */
function generateSeasonSnapshot(
  rng: RNG,
  player: Player,
  clubId: string,
  allPlayers: Record<string, Player>,
  season: number,
): TransferRecord["seasonPerformance"][number] {
  const sqAvg = squadAverageCA(clubId, allPlayers);

  // Base rating from CA
  let rating = (player.currentAbility / 200) * 100;

  // CA relative to squad
  if (player.currentAbility > sqAvg) {
    rating += 5;
  } else if (player.currentAbility < sqAvg * 0.8) {
    rating -= 10;
  }

  // Form modifier
  rating += player.form * 3;

  // Gaussian noise (season variance)
  rating += rng.gaussian(0, 8);

  rating = clamp(Math.round(rating), 0, 100);

  // Appearances — scale by how well the player fits the squad quality
  const [appMin, appMax] = BASE_APPEARANCE_RANGE[player.position];
  let appearances = rng.nextInt(appMin, appMax);

  // Below-average players get fewer appearances
  if (player.currentAbility < sqAvg * 0.8) {
    appearances = Math.round(appearances * 0.6);
  } else if (player.currentAbility < sqAvg) {
    appearances = Math.round(appearances * 0.85);
  }

  appearances = clamp(appearances, 0, 38);

  // Goals and assists based on position-specific rates
  const [gpaMin, gpaMax] = GOALS_PER_APPEARANCE[player.position];
  const [apaMin, apaMax] = ASSISTS_PER_APPEARANCE[player.position];

  const goalsPerApp = rng.nextFloat(gpaMin, gpaMax);
  const assistsPerApp = rng.nextFloat(apaMin, apaMax);

  // Scale by a quality factor: higher CA relative to position average → better output
  const qualityFactor = clamp(player.currentAbility / (sqAvg || 100), 0.4, 1.8);
  const goals = Math.round(appearances * goalsPerApp * qualityFactor);
  const assists = Math.round(appearances * assistsPerApp * qualityFactor);

  return { season, rating, appearances, goals, assists };
}

/**
 * Classify a transfer outcome based on accumulated season performance.
 *
 * Rules:
 *  - "tooEarly" if fewer than MIN_SEASONS_FOR_OUTCOME snapshots exist.
 *  - "hit"    if average rating >= 70.
 *  - "flop"   if average rating <  40.
 *  - "decent" otherwise (40–70).
 */
function classifyOutcome(
  snapshots: TransferRecord["seasonPerformance"],
): TransferRecord["outcome"] {
  if (snapshots.length < MIN_SEASONS_FOR_OUTCOME) return "tooEarly";

  const avgRating =
    snapshots.reduce((sum, s) => sum + s.rating, 0) / snapshots.length;

  if (avgRating >= RATING_THRESHOLDS.HIT) return "hit";
  if (avgRating < RATING_THRESHOLDS.FLOP) return "flop";
  return "decent";
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Update transfer records for the current season.
 *
 * For each active record (outcome === "tooEarly" or undefined):
 *  1. Check the player still exists in the world.  If not, leave the record
 *     unchanged (player may have retired or moved outside the tracked pool).
 *  2. Generate a seasonal performance snapshot using RNG.
 *  3. Append the snapshot to seasonPerformance.
 *  4. Re-classify the outcome based on all accumulated snapshots.
 *
 * Records already classified as "hit", "flop", or "decent" are not
 * re-processed unless the caller opts in by removing the outcome field before
 * passing — this keeps the function idempotent per season.
 *
 * @param rng           - Seeded PRNG instance.
 * @param records       - All existing transfer records.
 * @param players       - All players in the game world.
 * @param currentSeason - The season year being processed.
 */
export function updateTransferRecords(
  rng: RNG,
  records: TransferRecord[],
  players: Record<string, Player>,
  currentSeason: number,
): TransferRecord[] {
  return records.map((record) => {
    // Skip records that have already been fully classified and processed
    // (caller can clear outcome to force reprocessing)
    if (record.outcome === "hit" || record.outcome === "flop" || record.outcome === "decent") {
      return record;
    }

    const player = players[record.playerId];

    if (!player) {
      // Player no longer in world — retain record as-is for historical display
      return record;
    }

    // Check if a snapshot for this season already exists (idempotency guard)
    const alreadySnapped = record.seasonPerformance.some(
      (s) => s.season === currentSeason,
    );
    if (alreadySnapped) {
      return record;
    }

    // Generate a fresh seasonal snapshot
    const snapshot = generateSeasonSnapshot(
      rng,
      player,
      record.toClubId,
      players,
      currentSeason,
    );

    const updatedPerformance = [...record.seasonPerformance, snapshot];
    const outcome = classifyOutcome(updatedPerformance);

    return {
      ...record,
      seasonPerformance: updatedPerformance,
      outcome,
    };
  });
}

/**
 * Calculate aggregate hit-rate statistics for a scout's transfer record history.
 *
 * Only records with a resolved outcome (not "tooEarly") are counted in the
 * totals; records that are "tooEarly" are still included in the `total` count
 * so the caller can display pending / early-stage records.
 *
 * @param records - Transfer records to aggregate.
 */
export function calculateScoutHitRate(
  records: TransferRecord[],
): { total: number; hits: number; flops: number; rate: number } {
  const total = records.length;
  const hits = records.filter((r) => r.outcome === "hit").length;
  const flops = records.filter((r) => r.outcome === "flop").length;

  // Rate = hits / resolved records (exclude tooEarly and undefined)
  const resolved = records.filter(
    (r) => r.outcome === "hit" || r.outcome === "flop" || r.outcome === "decent",
  ).length;

  const rate = resolved === 0 ? 0 : Math.round((hits / resolved) * 100);

  return { total, hits, flops, rate };
}
