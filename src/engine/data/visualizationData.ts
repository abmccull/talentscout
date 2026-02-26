/**
 * Data preparation functions for the visualization dashboard (F20).
 *
 * All functions are pure: inputs in, visualization-ready data out.
 * No React imports, no side effects, no mutation of inputs.
 */

import type {
  Player,
  League,
  Observation,
  AnomalyFlag,
  Position,
  ScatterPlotData,
  ScatterDataPoint,
  HeatMapData,
  HeatMapCell,
  TrendLineData,
  TrendDataPoint,
  BarChartData,
  BarChartBar,
  RadarChartData,
  RadarAxis,
  StatisticalProfile,
} from "@/engine/core/types";

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/** Clamp a number to [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Stable color assignment for player trend lines based on index. */
const TREND_COLORS = [
  "#34d399", // emerald-400
  "#f59e0b", // amber-500
  "#3b82f6", // blue-500
  "#ef4444", // red-500
  "#a855f7", // purple-500
  "#06b6d4", // cyan-500
  "#f97316", // orange-500
  "#ec4899", // pink-500
] as const;

// =============================================================================
// SCATTER PLOT DATA
// =============================================================================

/** Filter options for scatter plot generation. */
export interface ScatterFilter {
  /** If set, only include players of this position. */
  position?: Position;
  /** Minimum current ability to include. */
  minCA?: number;
  /** Maximum age to include. */
  maxAge?: number;
  /** Minimum age to include. */
  minAge?: number;
  /** League ID filter. */
  leagueId?: string;
}

/**
 * Generate scatter plot data for the player market view.
 *
 * Default axes: x = currentAbility, y = marketValue.
 * Each point is categorized by position and flagged if anomalous.
 *
 * @param players      - All players in the game.
 * @param anomalyFlags - Active anomaly flags.
 * @param filter       - Optional filters to narrow the scatter.
 * @param clubs        - Club lookup for league filtering.
 * @param leagues      - League lookup for league filtering.
 */
export function generateScatterData(
  players: Record<string, Player>,
  anomalyFlags: AnomalyFlag[],
  filter?: ScatterFilter,
  clubs?: Record<string, { leagueId: string }>,
  leagues?: Record<string, League>,
): ScatterPlotData {
  const anomalyPlayerIds = new Set(anomalyFlags.map((a) => a.playerId));

  // Collect league club IDs if filtering by league
  let leagueClubIds: Set<string> | undefined;
  if (filter?.leagueId && leagues && clubs) {
    const league = leagues[filter.leagueId];
    if (league) {
      leagueClubIds = new Set(league.clubIds);
    }
  }

  const points: ScatterDataPoint[] = [];
  let xMax = 0;
  let yMax = 0;

  for (const player of Object.values(players)) {
    // Apply filters
    if (filter?.position && player.position !== filter.position) continue;
    if (filter?.minCA !== undefined && player.currentAbility < filter.minCA) continue;
    if (filter?.maxAge !== undefined && player.age > filter.maxAge) continue;
    if (filter?.minAge !== undefined && player.age < filter.minAge) continue;
    if (leagueClubIds && !leagueClubIds.has(player.clubId)) continue;

    const x = player.currentAbility;
    const y = player.marketValue;

    if (x > xMax) xMax = x;
    if (y > yMax) yMax = y;

    points.push({
      playerId: player.id,
      label: `${player.firstName[0]}. ${player.lastName}`,
      x,
      y,
      category: player.position,
      isAnomaly: anomalyPlayerIds.has(player.id),
    });
  }

  return {
    points,
    xLabel: "Current Ability",
    yLabel: "Market Value",
    xMax: Math.max(xMax, 200),
    yMax: Math.max(yMax, 1),
  };
}

/**
 * Generate scatter data for age vs potential ability.
 * Useful for identifying development opportunities.
 */
export function generateAgePotentialScatter(
  players: Record<string, Player>,
  anomalyFlags: AnomalyFlag[],
  filter?: ScatterFilter,
): ScatterPlotData {
  const anomalyPlayerIds = new Set(anomalyFlags.map((a) => a.playerId));
  const points: ScatterDataPoint[] = [];
  let yMax = 0;

  for (const player of Object.values(players)) {
    if (filter?.position && player.position !== filter.position) continue;
    if (filter?.minCA !== undefined && player.currentAbility < filter.minCA) continue;
    if (filter?.maxAge !== undefined && player.age > filter.maxAge) continue;
    if (filter?.minAge !== undefined && player.age < filter.minAge) continue;

    const y = player.potentialAbility;
    if (y > yMax) yMax = y;

    points.push({
      playerId: player.id,
      label: `${player.firstName[0]}. ${player.lastName}`,
      x: player.age,
      y,
      category: player.position,
      isAnomaly: anomalyPlayerIds.has(player.id),
    });
  }

  return {
    points,
    xLabel: "Age",
    yLabel: "Potential Ability",
    xMax: 40,
    yMax: Math.max(yMax, 200),
  };
}

// =============================================================================
// HEAT MAP DATA
// =============================================================================

/**
 * Generate a scouting coverage heat map by country/region.
 *
 * Intensity is based on observation count per country, normalized to 0-1.
 *
 * @param observations - All observations in the game.
 * @param players      - All players for nationality lookup.
 * @param countries    - List of country names in the game world.
 */
export function generateCoverageHeatMap(
  observations: Record<string, Observation>,
  players: Record<string, Player>,
  countries: string[],
): HeatMapData {
  // Count observations per country (via player nationality)
  const countByCountry: Record<string, number> = {};
  for (const country of countries) {
    countByCountry[country] = 0;
  }

  for (const obs of Object.values(observations)) {
    const player = players[obs.playerId];
    if (player) {
      const country = player.nationality;
      if (countByCountry[country] !== undefined) {
        countByCountry[country]++;
      } else {
        countByCountry[country] = 1;
      }
    }
  }

  const maxValue = Math.max(1, ...Object.values(countByCountry));

  const cells: HeatMapCell[] = Object.entries(countByCountry)
    .sort((a, b) => b[1] - a[1])
    .map(([country, count]) => ({
      key: country,
      label: country,
      intensity: count / maxValue,
      rawValue: count,
    }));

  return {
    cells,
    title: "Scouting Coverage by Country",
    maxValue,
  };
}

// =============================================================================
// DEVELOPMENT TRENDS
// =============================================================================

/**
 * Generate development trend line data for selected players.
 *
 * Since we don't store historical CA snapshots, we simulate a trajectory
 * using the player's current state, development profile, and age to
 * project where they have been and where they are heading.
 *
 * @param players     - Player records (subset to display).
 * @param currentSeason - Current in-game season for x-axis context.
 * @param seasonSpan    - Number of seasons to show (default 5).
 */
export function generateDevelopmentTrends(
  players: Player[],
  currentSeason: number,
  seasonSpan = 5,
): TrendLineData[] {
  return players.map((player, idx) => {
    const points: TrendDataPoint[] = [];
    const color = TREND_COLORS[idx % TREND_COLORS.length];

    for (let offset = -(seasonSpan - 1); offset <= 0; offset++) {
      const season = currentSeason + offset;
      const ageAtSeason = player.age + offset;

      // Estimate CA at that point based on development profile
      const ca = estimateHistoricalCA(player, ageAtSeason);
      points.push({ season, value: ca });
    }

    return {
      playerId: player.id,
      label: `${player.firstName[0]}. ${player.lastName}`,
      points,
      color,
    };
  });
}

/**
 * Estimate a player's CA at a given age based on their development profile.
 * This is an approximation since we don't store historical snapshots.
 */
function estimateHistoricalCA(player: Player, targetAge: number): number {
  const currentAge = player.age;
  const ca = player.currentAbility;
  const pa = player.potentialAbility;

  if (targetAge >= currentAge) return ca;
  if (targetAge < 15) return Math.round(pa * 0.2);

  // Growth curve factor based on development profile
  const ageDiff = currentAge - targetAge;
  let growthPerYear: number;

  switch (player.developmentProfile) {
    case "earlyBloomer":
      // Most growth happened early; less growth per year in recent years
      growthPerYear = targetAge < 22 ? (pa - ca * 0.3) / 7 : (pa - ca) / 10;
      break;
    case "lateBloomer":
      // Very little early growth, accelerates after 24
      growthPerYear = targetAge < 24 ? (pa * 0.1) / 9 : (pa - ca * 0.4) / 6;
      break;
    case "volatile":
      // Unpredictable — use average with some variance simulation
      growthPerYear = (ca - pa * 0.3) / Math.max(1, currentAge - 16);
      break;
    case "steadyGrower":
    default:
      // Linear progression
      growthPerYear = (ca - pa * 0.3) / Math.max(1, currentAge - 16);
      break;
  }

  const estimatedCA = Math.round(ca - ageDiff * growthPerYear);
  return clamp(estimatedCA, Math.round(pa * 0.15), pa);
}

// =============================================================================
// LEAGUE COMPARISON
// =============================================================================

/**
 * Generate a league comparison bar chart.
 *
 * Each bar represents a league with the average current ability of its players.
 *
 * @param players - All players in the game world.
 * @param leagues - All leagues.
 */
export function generateLeagueComparison(
  players: Record<string, Player>,
  leagues: Record<string, League>,
): BarChartData {
  const bars: BarChartBar[] = [];
  let maxValue = 0;

  for (const league of Object.values(leagues)) {
    const clubIdSet = new Set(league.clubIds);
    const leaguePlayers = Object.values(players).filter((p) =>
      clubIdSet.has(p.clubId),
    );

    if (leaguePlayers.length === 0) continue;

    const avgCA =
      leaguePlayers.reduce((sum, p) => sum + p.currentAbility, 0) /
      leaguePlayers.length;
    const avgPA =
      leaguePlayers.reduce((sum, p) => sum + p.potentialAbility, 0) /
      leaguePlayers.length;

    const roundedCA = Math.round(avgCA);
    if (roundedCA > maxValue) maxValue = roundedCA;

    bars.push({
      key: league.id,
      label: league.shortName || league.name,
      value: roundedCA,
      secondaryValue: Math.round(avgPA),
    });
  }

  // Sort by value descending
  bars.sort((a, b) => b.value - a.value);

  return {
    bars,
    yLabel: "Average CA",
    maxValue: Math.max(maxValue, 200),
  };
}

// =============================================================================
// RADAR CHART DATA
// =============================================================================

/**
 * Generate radar chart data for a player's attribute profile.
 *
 * Uses the per-90 percentiles from a statistical profile if available,
 * otherwise falls back to attribute domain averages.
 *
 * @param player  - The player to profile.
 * @param profile - Optional statistical profile for percentile-based radar.
 */
export function generatePlayerRadar(
  player: Player,
  profile?: StatisticalProfile,
): RadarChartData {
  const axes: RadarAxis[] = [];

  if (profile) {
    // Use statistical profile percentiles
    const p = profile.percentiles;
    axes.push(
      { key: "goals", label: "Goals", value: p.goals, max: 100 },
      { key: "assists", label: "Assists", value: p.assists, max: 100 },
      { key: "passing", label: "Passing", value: p.passCompletion, max: 100 },
      { key: "tackles", label: "Tackles", value: p.tacklesWon, max: 100 },
      { key: "interceptions", label: "Interceptions", value: p.interceptions, max: 100 },
      { key: "aerial", label: "Aerial", value: p.aerialDuelsWon, max: 100 },
      { key: "dribble", label: "Dribble", value: p.dribbleSuccess, max: 100 },
      { key: "shots", label: "Shots", value: p.shotsOnTarget, max: 100 },
    );
  } else {
    // Fallback: use raw attributes grouped by domain
    const a = player.attributes;

    const technical = (a.firstTouch + a.passing + a.dribbling + a.shooting + a.crossing + a.heading) / 6;
    const physical = (a.pace + a.strength + a.stamina + a.agility) / 4;
    const mental = (a.composure + a.positioning + a.workRate + a.decisionMaking + a.leadership) / 5;
    const tactical = (a.offTheBall + a.pressing + a.defensiveAwareness) / 3;

    axes.push(
      { key: "technical", label: "Technical", value: technical, max: 20 },
      { key: "physical", label: "Physical", value: physical, max: 20 },
      { key: "mental", label: "Mental", value: mental, max: 20 },
      { key: "tactical", label: "Tactical", value: tactical, max: 20 },
      { key: "shooting", label: "Shooting", value: a.shooting, max: 20 },
      { key: "passing", label: "Passing", value: a.passing, max: 20 },
      { key: "pace", label: "Pace", value: a.pace, max: 20 },
      { key: "defense", label: "Defense", value: a.defensiveAwareness, max: 20 },
    );
  }

  return {
    axes,
    label: `${player.firstName[0]}. ${player.lastName}`,
  };
}
