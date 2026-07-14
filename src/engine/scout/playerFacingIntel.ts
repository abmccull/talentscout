import {
  ATTRIBUTE_DOMAINS,
  type AnomalyFlag,
  type BarChartData,
  type InjuryHistory,
  type League,
  type Observation,
  type Player,
  type RadarChartData,
  type ScatterPlotData,
  type StatisticalProfile,
  type TrendLineData,
} from "@/engine/core/types";
import { getPerceivedAbility } from "./perceivedAbility";

const TREND_COLORS = [
  "#34d399",
  "#f59e0b",
  "#3b82f6",
  "#ef4444",
] as const;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function humanize(value: string): string {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (first) => first.toUpperCase())
    .trim();
}

/**
 * Builds the market chart exclusively from ability estimates the scout has
 * actually earned. Players without an ability reading are intentionally absent.
 */
export function buildObservedMarketScatter(
  players: Record<string, Player>,
  observations: Observation[],
  anomalyFlags: AnomalyFlag[],
): ScatterPlotData {
  const anomalyPlayerIds = new Set(anomalyFlags.map((flag) => flag.playerId));
  let yMax = 1;
  const points = Object.values(players).flatMap((player) => {
    const perceived = getPerceivedAbility(observations, player.id);
    if (!perceived) return [];
    yMax = Math.max(yMax, player.marketValue);
    return [{
      playerId: player.id,
      label: `${player.firstName[0]}. ${player.lastName}`,
      x: perceived.ca,
      y: player.marketValue,
      category: player.position,
      isAnomaly: anomalyPlayerIds.has(player.id),
    }];
  });

  return {
    points,
    xLabel: "Observed CA estimate (stars)",
    yLabel: "Market Value",
    xMax: 5,
    yMax,
  };
}

/** Aggregate report-side ability estimates by league without consulting CA/PA. */
export function buildObservedLeagueComparison(
  players: Record<string, Player>,
  leagues: Record<string, League>,
  observations: Observation[],
): BarChartData {
  const leagueByClubId = new Map<string, League>();
  for (const league of Object.values(leagues)) {
    for (const clubId of league.clubIds) leagueByClubId.set(clubId, league);
  }

  const aggregates = new Map<string, {
    league: League;
    caTotal: number;
    paTotal: number;
    count: number;
  }>();
  for (const player of Object.values(players)) {
    const league = leagueByClubId.get(player.clubId);
    const perceived = getPerceivedAbility(observations, player.id);
    if (!league || !perceived) continue;
    const aggregate = aggregates.get(league.id) ?? {
      league,
      caTotal: 0,
      paTotal: 0,
      count: 0,
    };
    aggregate.caTotal += perceived.ca;
    aggregate.paTotal += (perceived.paLow + perceived.paHigh) / 2;
    aggregate.count += 1;
    aggregates.set(league.id, aggregate);
  }

  const bars = [...aggregates.values()]
    .map(({ league, caTotal, paTotal, count }) => ({
      key: league.id,
      label: league.shortName || league.name,
      value: round1(caTotal / count),
      secondaryValue: round1(paTotal / count),
    }))
    .sort((left, right) => right.value - left.value);

  return {
    bars,
    yLabel: "Observed ability estimates (stars)",
    maxValue: 5,
  };
}

/**
 * Produces a genuine evidence history: each point is the average perceived CA
 * recorded in that season, rather than a reconstruction from true CA and PA.
 */
export function buildObservedDevelopmentTrends(
  players: Player[],
  observations: Observation[],
  currentSeason: number,
  seasonSpan = 5,
): TrendLineData[] {
  const firstSeason = currentSeason - seasonSpan + 1;
  return players.flatMap((player, index) => {
    const bySeason = new Map<number, number[]>();
    for (const observation of observations) {
      if (
        observation.playerId !== player.id
        || !observation.abilityReading
        || observation.season < firstSeason
        || observation.season > currentSeason
      ) continue;
      const values = bySeason.get(observation.season) ?? [];
      values.push(observation.abilityReading.perceivedCA);
      bySeason.set(observation.season, values);
    }
    if (bySeason.size === 0) return [];
    return [{
      playerId: player.id,
      label: `${player.firstName[0]}. ${player.lastName}`,
      points: [...bySeason.entries()]
        .sort(([left], [right]) => left - right)
        .map(([season, values]) => ({
          season,
          value: round1(values.reduce((sum, value) => sum + value, 0) / values.length),
        })),
      color: TREND_COLORS[index % TREND_COLORS.length],
    }];
  });
}

/** Build a radar from earned statistical data or perceived attribute readings. */
export function buildObservedPlayerRadar(
  player: Player,
  observations: Observation[],
  profile?: StatisticalProfile,
): RadarChartData | null {
  if (profile) {
    const percentiles = profile.percentiles;
    return {
      label: `${player.firstName[0]}. ${player.lastName}`,
      axes: [
        { key: "goals", label: "Goals", value: percentiles.goals, max: 100 },
        { key: "assists", label: "Assists", value: percentiles.assists, max: 100 },
        { key: "passing", label: "Passing", value: percentiles.passCompletion, max: 100 },
        { key: "tackles", label: "Tackles", value: percentiles.tacklesWon, max: 100 },
        { key: "interceptions", label: "Interceptions", value: percentiles.interceptions, max: 100 },
        { key: "aerial", label: "Aerial", value: percentiles.aerialDuelsWon, max: 100 },
        { key: "dribble", label: "Dribble", value: percentiles.dribbleSuccess, max: 100 },
        { key: "shots", label: "Shots", value: percentiles.shotsOnTarget, max: 100 },
      ],
    };
  }

  const latestReadings = new Map<string, { value: number; confidence: number }>();
  for (const observation of observations) {
    if (observation.playerId !== player.id) continue;
    for (const reading of observation.attributeReadings) {
      const existing = latestReadings.get(reading.attribute);
      if (!existing || reading.confidence >= existing.confidence) {
        latestReadings.set(reading.attribute, {
          value: reading.perceivedValue,
          confidence: reading.confidence,
        });
      }
    }
  }

  const domains = new Map<string, number[]>();
  for (const [attribute, reading] of latestReadings) {
    const domain = ATTRIBUTE_DOMAINS[attribute as keyof typeof ATTRIBUTE_DOMAINS];
    const values = domains.get(domain) ?? [];
    values.push(reading.value);
    domains.set(domain, values);
  }
  const domainAxes = [...domains.entries()].map(([domain, values]) => ({
    key: domain,
    label: humanize(domain),
    value: round1(values.reduce((sum, value) => sum + value, 0) / values.length),
    max: 20,
  }));

  const axes = domainAxes.length >= 3
    ? domainAxes
    : [...latestReadings.entries()]
        .sort(([, left], [, right]) => right.confidence - left.confidence)
        .slice(0, 8)
        .map(([attribute, reading]) => ({
          key: attribute,
          label: humanize(attribute),
          value: reading.value,
          max: 20,
        }));

  if (axes.length < 3) return null;
  return {
    axes,
    label: `${player.firstName[0]}. ${player.lastName}`,
  };
}

/**
 * Injury concern derived only from the visible injury log. The engine's hidden
 * proneness coefficient and reinjury timer must not cross the UI boundary.
 */
export function hasObservableRecurringInjuryConcern(
  history: Pick<InjuryHistory, "injuries" | "totalWeeksMissed"> | undefined,
): boolean {
  if (!history) return false;
  const seriousInjuries = history.injuries.filter(
    (injury) => injury.severity === "serious" || injury.severity === "career-threatening",
  ).length;
  return history.injuries.length >= 3 || seriousInjuries >= 2 || history.totalWeeksMissed >= 24;
}
