/**
 * Scout performance analytics — monthly snapshots and trend analysis.
 *
 * All functions are pure: they accept state/data in and return derived values
 * out. No mutation, no side effects, no framework imports.
 */

import type {
  Scout,
  ScoutReport,
  ScoutSkill,
  ScoutPerformanceSnapshot,
  GameState,
} from "@/engine/core/types";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Average an array of numbers. Returns 0 for empty arrays. */
function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Clamp a value to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Extract all scout reports from state that belong to the given scout.
 */
function scoutReports(state: GameState): ScoutReport[] {
  return Object.values(state.reports).filter(
    (r) => r.scoutId === state.scout.id,
  );
}

// ---------------------------------------------------------------------------
// Snapshot creation
// ---------------------------------------------------------------------------

/**
 * Create a performance snapshot for the scout at the given point in time.
 *
 * Metrics calculated:
 *  - accuracy:       average postTransferRating across reports that have one
 *  - totalReports:   cumulative reports submitted by this scout
 *  - avgQuality:     average qualityScore across all reports
 *  - discoveryRate:  unique players reported on / total reports (0–1)
 *  - skills:         current skill levels copied from the scout
 *  - reputation:     current scout reputation
 *
 * When no reports exist all numeric metrics default to 0.
 */
export function createPerformanceSnapshot(
  scout: Scout,
  state: GameState,
  currentWeek: number,
  currentSeason: number,
): ScoutPerformanceSnapshot {
  const reports = scoutReports(state);

  // Accuracy — use postTransferRating when available (retrospective accuracy)
  const ratedReports = reports.filter(
    (r) => r.postTransferRating !== undefined,
  );
  const accuracy =
    ratedReports.length > 0
      ? average(ratedReports.map((r) => r.postTransferRating as number))
      : 0;

  // Total reports
  const totalReports = reports.length;

  // Average quality score across all reports
  const avgQuality =
    reports.length > 0
      ? average(reports.map((r) => r.qualityScore))
      : 0;

  // Discovery rate: unique players / total reports
  // A player is "discovered" if the scout was the first to report on them.
  // We approximate this as the number of distinct playerIds reported on.
  const uniquePlayerIds = new Set(reports.map((r) => r.playerId));
  const discoveryRate =
    totalReports > 0 ? uniquePlayerIds.size / totalReports : 0;

  return {
    season: currentSeason,
    week: currentWeek,
    accuracy: Math.round(accuracy * 10) / 10,
    totalReports,
    avgQuality: Math.round(avgQuality * 10) / 10,
    discoveryRate: Math.round(discoveryRate * 1000) / 1000, // 3 d.p.
    skills: { ...scout.skills },
    reputation: scout.reputation,
  };
}

// ---------------------------------------------------------------------------
// Monthly snapshot gating
// ---------------------------------------------------------------------------

/**
 * Create a snapshot only on monthly week boundaries (every 4 weeks).
 *
 * Week 1, 5, 9, 13, … are considered snapshot weeks.
 * Returns null on all other weeks.
 */
export function processMonthlySnapshot(
  state: GameState,
): ScoutPerformanceSnapshot | null {
  const { currentWeek, currentSeason, scout } = state;

  // Snapshot weeks: 1, 5, 9, 13, 17, 21, 25, 29, 33, 37, …
  const isSnapshotWeek = (currentWeek - 1) % 4 === 0;
  if (!isSnapshotWeek) return null;

  return createPerformanceSnapshot(scout, state, currentWeek, currentSeason);
}

// ---------------------------------------------------------------------------
// Trend extraction
// ---------------------------------------------------------------------------

/**
 * Extract the accuracy timeseries from a sorted list of snapshots.
 * Suitable for passing directly to a chart component.
 */
export function getAccuracyTrend(
  snapshots: ScoutPerformanceSnapshot[],
): { week: number; season: number; accuracy: number }[] {
  return snapshots.map((s) => ({
    week: s.week,
    season: s.season,
    accuracy: s.accuracy,
  }));
}

/**
 * Extract one skill's level over time from a sorted list of snapshots.
 */
export function getSkillProgressionTrend(
  snapshots: ScoutPerformanceSnapshot[],
  skill: ScoutSkill,
): { week: number; season: number; level: number }[] {
  return snapshots.map((s) => ({
    week: s.week,
    season: s.season,
    level: s.skills[skill],
  }));
}

// ---------------------------------------------------------------------------
// Overall performance rating
// ---------------------------------------------------------------------------

/**
 * Calculate an overall 0–100 performance rating from the most recent
 * snapshots (up to 4, i.e. the last ~month of monthly snapshots).
 *
 * Weighting:
 *  - Accuracy:       40 %  (0–100 scale)
 *  - Average quality: 30 %  (0–100 scale)
 *  - Discovery rate: 30 %  (0–1 scale, normalised to 0–100)
 *
 * When fewer than 4 snapshots exist all available snapshots are used.
 * Returns 0 when no snapshots are provided.
 */
export function getOverallPerformanceRating(
  snapshots: ScoutPerformanceSnapshot[],
): number {
  if (snapshots.length === 0) return 0;

  // Use the most recent 4 snapshots
  const recent = snapshots.slice(-4);

  const avgAccuracy = average(recent.map((s) => s.accuracy));
  const avgQuality = average(recent.map((s) => s.avgQuality));
  // discoveryRate is 0–1; normalise to 0–100
  const avgDiscoveryRate = average(recent.map((s) => s.discoveryRate)) * 100;

  const rating =
    avgAccuracy * 0.4 +
    avgQuality * 0.3 +
    avgDiscoveryRate * 0.3;

  return clamp(Math.round(rating * 10) / 10, 0, 100);
}

// ---------------------------------------------------------------------------
// Period comparison
// ---------------------------------------------------------------------------

/**
 * Compare two groups of snapshots for trend arrows (improving / declining).
 *
 * Each group should typically cover the same number of snapshots so the
 * comparison is fair, but the function handles unequal lengths gracefully
 * by averaging whatever is available in each group.
 *
 * Returns the signed delta for each key metric:
 *  - accuracyChange:  positive = improving accuracy
 *  - qualityChange:   positive = improving report quality
 *  - rateChange:      positive = rising discovery rate (raw 0–1 delta)
 *
 * When either period has no snapshots the corresponding change is 0.
 */
export function comparePerformancePeriods(
  recent: ScoutPerformanceSnapshot[],
  previous: ScoutPerformanceSnapshot[],
): { accuracyChange: number; qualityChange: number; rateChange: number } {
  if (recent.length === 0 || previous.length === 0) {
    return { accuracyChange: 0, qualityChange: 0, rateChange: 0 };
  }

  const recentAccuracy  = average(recent.map((s) => s.accuracy));
  const prevAccuracy    = average(previous.map((s) => s.accuracy));

  const recentQuality   = average(recent.map((s) => s.avgQuality));
  const prevQuality     = average(previous.map((s) => s.avgQuality));

  const recentRate      = average(recent.map((s) => s.discoveryRate));
  const prevRate        = average(previous.map((s) => s.discoveryRate));

  return {
    accuracyChange: Math.round((recentAccuracy - prevAccuracy) * 10) / 10,
    qualityChange:  Math.round((recentQuality  - prevQuality)  * 10) / 10,
    rateChange:     Math.round((recentRate     - prevRate)     * 1000) / 1000,
  };
}
