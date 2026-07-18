import type { Observation } from "@/engine/core/types";

export interface ObservationSeasonTrend {
  season: number;
  observationCount: number;
  readingCount: number;
  averagePerceivedValue: number;
  averageConfidence: number;
}

export interface ObservationTrend {
  seasons: ObservationSeasonTrend[];
  direction: "rising" | "stable" | "falling" | "insufficient";
  explanation: string;
}

/** Build a player-safe trend from the scout's own readings only. */
export function buildObservationTrend(
  observations: readonly Observation[],
  historyDepth = 4,
): ObservationTrend {
  const grouped = new Map<number, Observation[]>();
  for (const observation of observations) {
    grouped.set(observation.season, [
      ...(grouped.get(observation.season) ?? []),
      observation,
    ]);
  }
  const seasons = [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .slice(-Math.max(1, historyDepth))
    .map(([season, seasonObservations]) => {
      const readings = seasonObservations.flatMap((observation) => observation.attributeReadings);
      return {
        season,
        observationCount: seasonObservations.length,
        readingCount: readings.length,
        averagePerceivedValue: readings.length > 0
          ? Math.round(
              readings.reduce((sum, reading) => sum + reading.perceivedValue, 0)
              / readings.length
              * 10,
            ) / 10
          : 0,
        averageConfidence: readings.length > 0
          ? Math.round(
              readings.reduce((sum, reading) => sum + reading.confidence, 0)
              / readings.length
              * 100,
            )
          : 0,
      };
    });
  if (seasons.length < 2) {
    return {
      seasons,
      direction: "insufficient",
      explanation: "A second season of comparable observations is needed before calling a trajectory.",
    };
  }
  const delta = seasons.at(-1)!.averagePerceivedValue - seasons[0].averagePerceivedValue;
  const direction = delta >= 0.8 ? "rising" : delta <= -0.8 ? "falling" : "stable";
  return {
    seasons,
    direction,
    explanation: direction === "rising"
      ? "Your recorded readings are trending upward; another live context should test whether the improvement holds."
      : direction === "falling"
        ? "Your recorded readings have softened; separate form, role, and fitness before revising the long-term view."
        : "Your recorded readings are broadly stable across the available seasons.",
  };
}
