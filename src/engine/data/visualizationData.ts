/** Scouting coverage counts for the observed-information dashboard. */

import type { Player, Observation, HeatMapData, HeatMapCell } from "@/engine/core/types";

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
