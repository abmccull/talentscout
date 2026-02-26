/**
 * Scout performance computation — aggregates all career stats from game state.
 *
 * Pure function: accepts GameState, returns derived ScoutPerformanceData.
 * No mutation, no side effects, no framework imports.
 */

import type {
  GameState,
  ScoutReport,
  Position,
  Player,
  DiscoveryRecord,
  PerformanceReview,
  ScoutPerformanceSnapshot,
} from "./types";

// =============================================================================
// OUTPUT TYPES
// =============================================================================

export interface PositionAccuracy {
  position: Position;
  avgQuality: number;
  reportCount: number;
}

export interface AgeGroupAccuracy {
  label: string;
  avgQuality: number;
  reportCount: number;
}

export interface SeasonQualityTrend {
  season: number;
  avgQuality: number;
  reportCount: number;
}

export interface DiscoveryStats {
  totalWonderkids: number;
  totalPlaced: number;
  placementSuccessRate: number;
  bestDiscovery: {
    playerId: string;
    playerName: string;
    potentialAbility: number;
  } | null;
}

export interface FinancialPerformance {
  lifetimeEarnings: number;
  lifetimeExpenses: number;
  netProfit: number;
  revenuePerSeason: SeasonRevenue[];
  roi: number;
}

export interface SeasonRevenue {
  season: number;
  income: number;
  expenses: number;
  net: number;
}

export interface ComparativeContext {
  industryAvgAccuracy: number;
  yourAccuracy: number;
  percentile: number;
  industryAvgQuality: number;
  yourQuality: number;
  qualityPercentile: number;
  industryAvgDiscoveryRate: number;
  yourDiscoveryRate: number;
  discoveryPercentile: number;
}

export interface ScoutPerformanceData {
  // A. Career Overview
  careerTier: number;
  tierLabel: string;
  reputation: number;
  seasonsPlayed: number;
  totalReports: number;
  totalDiscoveries: number;
  careerHitRate: number;

  // B. Accuracy Analytics
  allTimeAvgQuality: number;
  thisSeasonAvgQuality: number;
  accuracyByPosition: PositionAccuracy[];
  accuracyByAgeGroup: AgeGroupAccuracy[];
  qualityTrend: SeasonQualityTrend[];

  // C. Discovery Stats
  discoveryStats: DiscoveryStats;

  // D. Financial Performance
  financialPerformance: FinancialPerformance;

  // E. Comparative Context
  comparativeContext: ComparativeContext;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const TIER_LABELS: Record<number, string> = {
  1: "Freelance Scout",
  2: "Part-Time Regional Scout",
  3: "Full-Time Club Scout",
  4: "Head of Scouting",
  5: "Director of Football",
};

/** PA threshold for a "wonderkid" discovery (4+ star equivalent). */
const WONDERKID_PA_THRESHOLD = 150;

/**
 * Hardcoded industry average benchmarks for comparative context.
 * These represent reasonable midpoints for an average scout.
 */
const INDUSTRY_BENCHMARKS = {
  accuracy: 55,
  quality: 48,
  discoveryRate: 0.15,
};

// =============================================================================
// HELPERS
// =============================================================================

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Calculate a percentile from a value and an industry average.
 * Uses a simple sigmoid-like mapping: 50% at the average,
 * scaling up/down based on distance from average.
 */
function estimatePercentile(value: number, industryAvg: number): number {
  if (industryAvg === 0) return 50;
  const ratio = value / industryAvg;
  // Map ratio to percentile: 1.0 = 50%, 1.5 = ~85%, 0.5 = ~15%
  const percentile = 50 + (ratio - 1) * 70;
  return clamp(Math.round(percentile), 1, 99);
}

function getPlayerAgeGroup(age: number): string {
  if (age < 21) return "U21";
  if (age <= 25) return "21-25";
  return "26+";
}

function getScoutReports(state: GameState): ScoutReport[] {
  return Object.values(state.reports).filter(
    (r) => r.scoutId === state.scout.id,
  );
}

// =============================================================================
// MAIN COMPUTATION
// =============================================================================

/**
 * Compute comprehensive scout performance data from the current game state.
 *
 * This is a pure function that aggregates all career stats, computing
 * accuracy breakdowns, financial performance, discovery stats, and
 * comparative context from the game state.
 */
export function computeScoutPerformance(state: GameState): ScoutPerformanceData {
  const { scout, currentSeason, players, discoveryRecords, performanceReviews, finances } = state;
  const reports = getScoutReports(state);

  // ─── A. Career Overview ──────────────────────────────────────────────────

  const startingSeason = performanceReviews.length > 0
    ? performanceReviews[0].season
    : currentSeason;
  const seasonsPlayed = currentSeason - startingSeason + 1;

  const successfulReports = reports.filter(
    (r) => r.clubResponse === "signed" || r.clubResponse === "shortlisted",
  );
  const careerHitRate =
    reports.length > 0
      ? round1((successfulReports.length / reports.length) * 100)
      : 0;

  // ─── B. Accuracy Analytics ───────────────────────────────────────────────

  const allTimeAvgQuality =
    reports.length > 0 ? round1(average(reports.map((r) => r.qualityScore))) : 0;

  const thisSeasonReports = reports.filter(
    (r) => r.submittedSeason === currentSeason,
  );
  const thisSeasonAvgQuality =
    thisSeasonReports.length > 0
      ? round1(average(thisSeasonReports.map((r) => r.qualityScore)))
      : 0;

  // Accuracy by position
  const positionMap = new Map<Position, number[]>();
  for (const report of reports) {
    const player = players[report.playerId];
    if (!player) continue;
    const pos = player.position;
    if (!positionMap.has(pos)) positionMap.set(pos, []);
    positionMap.get(pos)!.push(report.qualityScore);
  }
  const accuracyByPosition: PositionAccuracy[] = Array.from(positionMap.entries())
    .map(([position, scores]) => ({
      position,
      avgQuality: round1(average(scores)),
      reportCount: scores.length,
    }))
    .sort((a, b) => b.avgQuality - a.avgQuality);

  // Accuracy by age group
  const ageGroupMap = new Map<string, number[]>();
  for (const report of reports) {
    const player = players[report.playerId];
    if (!player) continue;
    const group = getPlayerAgeGroup(player.age);
    if (!ageGroupMap.has(group)) ageGroupMap.set(group, []);
    ageGroupMap.get(group)!.push(report.qualityScore);
  }
  const ageGroupOrder = ["U21", "21-25", "26+"];
  const accuracyByAgeGroup: AgeGroupAccuracy[] = ageGroupOrder
    .filter((label) => ageGroupMap.has(label))
    .map((label) => ({
      label,
      avgQuality: round1(average(ageGroupMap.get(label)!)),
      reportCount: ageGroupMap.get(label)!.length,
    }));

  // Quality trend by season
  const seasonMap = new Map<number, number[]>();
  for (const report of reports) {
    const season = report.submittedSeason;
    if (!seasonMap.has(season)) seasonMap.set(season, []);
    seasonMap.get(season)!.push(report.qualityScore);
  }
  const qualityTrend: SeasonQualityTrend[] = Array.from(seasonMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([season, scores]) => ({
      season,
      avgQuality: round1(average(scores)),
      reportCount: scores.length,
    }));

  // ─── C. Discovery Stats ──────────────────────────────────────────────────

  const wonderkidDiscoveries = discoveryRecords.filter((d) => d.wasWonderkid);

  // "Placed" = reports where the club signed the player
  const placedReports = reports.filter((r) => r.clubResponse === "signed");
  const placedPlayerIds = new Set(placedReports.map((r) => r.playerId));

  // Placement success: of signed players, how many reached decent CA growth?
  // We consider a placement "successful" if the player's CA grew or maintained
  let successfulPlacements = 0;
  for (const playerId of placedPlayerIds) {
    const discovery = discoveryRecords.find((d) => d.playerId === playerId);
    const player = players[playerId];
    if (discovery && player) {
      if (player.currentAbility >= discovery.initialCA) {
        successfulPlacements++;
      }
    } else if (player) {
      // Not tracked as discovery but was signed — count as success if still at club
      successfulPlacements++;
    }
  }
  const placementSuccessRate =
    placedPlayerIds.size > 0
      ? round1((successfulPlacements / placedPlayerIds.size) * 100)
      : 0;

  // Best discovery — highest PA found
  let bestDiscovery: DiscoveryStats["bestDiscovery"] = null;
  if (discoveryRecords.length > 0) {
    let bestRecord: DiscoveryRecord | null = null;
    let bestPA = -1;
    for (const record of discoveryRecords) {
      const pa = record.initialPA ?? 0;
      if (pa > bestPA) {
        bestPA = pa;
        bestRecord = record;
      }
    }
    if (bestRecord) {
      const player = players[bestRecord.playerId];
      bestDiscovery = {
        playerId: bestRecord.playerId,
        playerName: player
          ? `${player.firstName} ${player.lastName}`
          : "Unknown Player",
        potentialAbility: bestPA,
      };
    }
  }

  const discoveryStatsData: DiscoveryStats = {
    totalWonderkids: wonderkidDiscoveries.length,
    totalPlaced: placedPlayerIds.size,
    placementSuccessRate,
    bestDiscovery,
  };

  // ─── D. Financial Performance ────────────────────────────────────────────

  let lifetimeEarnings = 0;
  let lifetimeExpenses = 0;
  const revenuePerSeason: SeasonRevenue[] = [];

  if (finances) {
    const seasonFinances = new Map<number, { income: number; expenses: number }>();

    for (const tx of finances.transactions) {
      if (!seasonFinances.has(tx.season)) {
        seasonFinances.set(tx.season, { income: 0, expenses: 0 });
      }
      const entry = seasonFinances.get(tx.season)!;
      if (tx.amount > 0) {
        entry.income += tx.amount;
        lifetimeEarnings += tx.amount;
      } else {
        entry.expenses += Math.abs(tx.amount);
        lifetimeExpenses += Math.abs(tx.amount);
      }
    }

    for (const [season, data] of Array.from(seasonFinances.entries()).sort(
      ([a], [b]) => a - b,
    )) {
      revenuePerSeason.push({
        season,
        income: data.income,
        expenses: data.expenses,
        net: data.income - data.expenses,
      });
    }
  } else {
    // Estimate from salary history if finances not tracked
    lifetimeEarnings = scout.salary * 4 * seasonsPlayed * 38; // rough weekly over seasons
    lifetimeExpenses = lifetimeEarnings * 0.6; // rough estimate
  }

  const roi =
    lifetimeExpenses > 0
      ? round1((lifetimeEarnings / lifetimeExpenses) * 100 - 100)
      : 0;

  const financialPerformance: FinancialPerformance = {
    lifetimeEarnings,
    lifetimeExpenses,
    netProfit: lifetimeEarnings - lifetimeExpenses,
    revenuePerSeason,
    roi,
  };

  // ─── E. Comparative Context ──────────────────────────────────────────────

  // Calculate player's actual accuracy from postTransferRating
  const ratedReports = reports.filter(
    (r) => r.postTransferRating !== undefined,
  );
  const yourAccuracy =
    ratedReports.length > 0
      ? round1(average(ratedReports.map((r) => r.postTransferRating as number)))
      : allTimeAvgQuality; // fallback to quality score if no post-transfer ratings

  const uniquePlayersReported = new Set(reports.map((r) => r.playerId)).size;
  const yourDiscoveryRate =
    reports.length > 0 ? uniquePlayersReported / reports.length : 0;

  const comparativeContext: ComparativeContext = {
    industryAvgAccuracy: INDUSTRY_BENCHMARKS.accuracy,
    yourAccuracy,
    percentile: estimatePercentile(yourAccuracy, INDUSTRY_BENCHMARKS.accuracy),
    industryAvgQuality: INDUSTRY_BENCHMARKS.quality,
    yourQuality: allTimeAvgQuality,
    qualityPercentile: estimatePercentile(allTimeAvgQuality, INDUSTRY_BENCHMARKS.quality),
    industryAvgDiscoveryRate: INDUSTRY_BENCHMARKS.discoveryRate,
    yourDiscoveryRate: round1(yourDiscoveryRate * 100) / 100,
    discoveryPercentile: estimatePercentile(
      yourDiscoveryRate,
      INDUSTRY_BENCHMARKS.discoveryRate,
    ),
  };

  // ─── Assemble result ─────────────────────────────────────────────────────

  return {
    careerTier: scout.careerTier,
    tierLabel: TIER_LABELS[scout.careerTier] ?? `Tier ${scout.careerTier}`,
    reputation: Math.round(scout.reputation),
    seasonsPlayed,
    totalReports: reports.length,
    totalDiscoveries: discoveryRecords.length,
    careerHitRate,

    allTimeAvgQuality,
    thisSeasonAvgQuality,
    accuracyByPosition,
    accuracyByAgeGroup,
    qualityTrend,

    discoveryStats: discoveryStatsData,

    financialPerformance,

    comparativeContext,
  };
}
