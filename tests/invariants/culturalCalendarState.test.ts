import { describe, expect, it } from "vitest";

import { getSeasonLength } from "@/engine/core/gameDate";
import type { GameState } from "@/engine/core/types";
import type { WorldConditionInstance } from "@/engine/world/worldConditions";
import {
  buildCulturalCalendarKey,
  listCulturalCalendarConditionDefinitionIds,
  refreshCulturalCalendarState,
  resolveStateCountrySeasonCalendar,
} from "@/engine/world/culturalCalendarState";
import { createCountrySeasonCalendar } from "@/engine/world/footballCultureCalendar";
import { getShippedCountryKeys } from "@/lib/country";

function condition(
  definitionId: string,
  season: number,
  countryId?: string,
): WorldConditionInstance {
  return {
    id: `${definitionId}:s${season}${countryId ? `:${countryId}` : ""}`,
    definitionId,
    scope: countryId ? "regional" : "global",
    season,
    ...(countryId ? { countryId } : {}),
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

function stateFixture() {
  return {
    countries: getShippedCountryKeys(),
    currentSeason: 4,
    fixtures: {} as GameState["fixtures"],
    runManifest: { rootSeed: "career-seed" } as GameState["runManifest"],
    worldConditionState: {
      version: 1 as const,
      activeSeason: 4,
      active: [
        condition("showcase-circuit", 4),
        condition("agent-exclusivity-wave", 4),
      ],
      history: [
        {
          season: 3,
          callback: "Season three",
          conditions: [condition("credit-squeeze", 3)],
        },
        {
          season: 4,
          callback: "Season four",
          conditions: [
            condition("showcase-circuit", 4),
            condition("agent-exclusivity-wave", 4),
          ],
        },
      ],
    },
  } satisfies Pick<
    GameState,
    "countries" | "currentSeason" | "fixtures" | "runManifest" | "worldConditionState"
  >;
}

describe("cultural calendar state", () => {
  it("retains only current and previous season calendars for the generated world and preserves stored entries", () => {
    const state = stateFixture();
    const preserved = createCountrySeasonCalendar("england", 4, {
      weeksPerSeason: getSeasonLength(state.fixtures, 4),
      rootSeed: "legacy-seed",
      activeWorldConditionIds: ["legacy-condition"],
    });
    const refreshed = refreshCulturalCalendarState({
      ...state,
      culturalCalendarState: {
        version: 1,
        calendars: {
          [buildCulturalCalendarKey("england", 4)]: preserved,
          [buildCulturalCalendarKey("england", 2)]: createCountrySeasonCalendar("england", 2),
        },
      },
    });

    expect(Object.keys(refreshed.calendars)).toHaveLength(44);
    expect(refreshed.calendars[buildCulturalCalendarKey("england", 4)]).toEqual(preserved);
    expect(refreshed.calendars[buildCulturalCalendarKey("england", 2)]).toBeUndefined();
    expect(refreshed.calendars[buildCulturalCalendarKey("england", 3)]?.activeWorldConditionIds)
      .toEqual(["credit-squeeze"]);
    expect(refreshed.calendars[buildCulturalCalendarKey("england", 4)]?.activeWorldConditionIds)
      .toEqual(["legacy-condition"]);
  });

  it("freezes condition definition ids per season and resolves current calendars from persisted state", () => {
    const state = stateFixture();
    expect(listCulturalCalendarConditionDefinitionIds(state, 3)).toEqual(["credit-squeeze"]);
    expect(listCulturalCalendarConditionDefinitionIds(state, 4)).toEqual([
      "agent-exclusivity-wave",
      "showcase-circuit",
    ]);

    const refreshed = refreshCulturalCalendarState(state);
    const resolved = resolveStateCountrySeasonCalendar(
      { ...state, culturalCalendarState: refreshed },
      "england",
    );

    expect(resolved).toEqual(refreshed.calendars[buildCulturalCalendarKey("england", 4)]);
    expect(resolveStateCountrySeasonCalendar({ ...state, culturalCalendarState: refreshed }, "iceland"))
      .toBeUndefined();
  });

  it("does not let one country's regional condition rewrite another country's calendar", () => {
    const fixture = stateFixture();
    const state = {
      ...fixture,
      worldConditionState: {
        ...fixture.worldConditionState,
        active: [
          condition("showcase-circuit", 4),
          condition("england-access-squeeze", 4, "england"),
          condition("brazil-showcase-wave", 4, "brazil"),
        ],
        history: [{
          season: 4,
          callback: "Regional conditions",
          conditions: [
            condition("showcase-circuit", 4),
            condition("england-access-squeeze", 4, "england"),
            condition("brazil-showcase-wave", 4, "brazil"),
          ],
        }],
      },
    } satisfies Pick<
      GameState,
      "countries" | "currentSeason" | "fixtures" | "runManifest" | "worldConditionState"
    >;

    expect(listCulturalCalendarConditionDefinitionIds(state, 4, "england")).toEqual([
      "england-access-squeeze",
      "showcase-circuit",
    ]);
    expect(listCulturalCalendarConditionDefinitionIds(state, 4, "brazil")).toEqual([
      "brazil-showcase-wave",
      "showcase-circuit",
    ]);
  });

  it("is idempotent when a worker/store adapter reapplies the same retained window", () => {
    const state = stateFixture();
    const first = refreshCulturalCalendarState(state);
    const replay = refreshCulturalCalendarState({
      ...state,
      culturalCalendarState: first,
    });

    expect(replay).toEqual(first);
  });
});
