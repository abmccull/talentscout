import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { findUnpartitionedGameStateKeys } from "@/engine/core/gameStatePartitions";
import type { GameState } from "@/engine/core/types";
import type { WorldConditionInstance } from "@/engine/world/worldConditions";
import { buildCulturalCalendarKey } from "@/engine/world/culturalCalendarState";
import { createCountrySeasonCalendar } from "@/engine/world/footballCultureCalendar";
import { getShippedCountryKeys } from "@/lib/country";
import { migrateSaveState } from "@/lib/db";

const goldenV0Path = fileURLToPath(
  new URL("../fixtures/saves/v0-save-record.json", import.meta.url),
);

function migratedState(): GameState {
  const record = JSON.parse(readFileSync(goldenV0Path, "utf8")) as {
    state: Record<string, unknown>;
  };
  return migrateSaveState(record.state);
}

function condition(
  definitionId: string,
  season: number,
): WorldConditionInstance {
  return {
    id: `${definitionId}:s${season}`,
    definitionId,
    scope: "global",
    season,
    modifiers: {
      discoveryMultiplier: 1,
      observationConfidenceMultiplier: 1,
      opportunityMultiplier: 1,
      developmentMultiplier: 1,
      breakthroughMultiplier: 1,
      recruitmentScoreAdjustment: 0,
      travelCostMultiplier: 1,
      travelDurationDelta: 0,
      travelFatigueMultiplier: 1,
      marketplaceValueMultiplier: 1,
      rivalPressureMultiplier: 1,
      seasonalFinanceAdjustment: 0,
    },
  };
}

describe("cultural calendar persistence compatibility", () => {
  it("keeps stored current-season calendars, backfills retained seasons, and prunes stale history during save migration", () => {
    const baseline = migratedState();
    const existingCurrent = createCountrySeasonCalendar("england", 5, {
      weeksPerSeason: 38,
      rootSeed: "legacy-seed",
      activeWorldConditionIds: ["legacy-condition"],
    });
    const source: GameState = {
      ...baseline,
      currentSeason: 5,
      countries: getShippedCountryKeys(),
      worldConditionState: {
        version: 1,
        activeSeason: 5,
        active: [condition("showcase-circuit", 5)],
        history: [
          { season: 4, callback: "Season four", conditions: [condition("credit-squeeze", 4)] },
          { season: 5, callback: "Season five", conditions: [condition("showcase-circuit", 5)] },
        ],
      },
      culturalCalendarState: {
        version: 1,
        calendars: {
          [buildCulturalCalendarKey("england", 2)]: createCountrySeasonCalendar("england", 2),
          [buildCulturalCalendarKey("england", 5)]: existingCurrent,
        },
      },
    };

    const first = migrateSaveState(source);
    const replay = migrateSaveState(first);

    expect(replay).toEqual(first);
    expect(first.culturalCalendarState?.calendars[buildCulturalCalendarKey("england", 5)])
      .toEqual(existingCurrent);
    expect(first.culturalCalendarState?.calendars[buildCulturalCalendarKey("england", 4)])
      .toMatchObject({
        countryId: "england",
        season: 4,
      });
    expect(first.culturalCalendarState?.calendars[buildCulturalCalendarKey("england", 2)])
      .toBeUndefined();
    expect(Object.keys(first.culturalCalendarState?.calendars ?? {})).toHaveLength(44);
    expect(findUnpartitionedGameStateKeys(first)).toEqual([]);
  });
});
