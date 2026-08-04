import { describe, expect, it } from "vitest";

import type { CulturalInsight } from "@/engine/core/types";
import { FOOTBALL_CULTURE_PLAYBOOK_CONTENT_PACK } from "@/engine/content/registry";
import { createRNG } from "@/engine/rng";
import { generateCulturalInsight } from "@/engine/specializations/regionalKnowledge";
import {
  getExplicitFootballCulturePlaybook,
  getFootballCulturePlaybook,
  listExplicitFootballCulturePlaybooks,
  listFootballCultureInsightDefinitions,
} from "@/engine/world/footballCulturePlaybooks";
import {
  createCountrySeasonCalendar,
  resolveCountryCalendarEffects,
  resolvePersistedCountryCalendarEffects,
} from "@/engine/world/footballCultureCalendar";
import {
  resolveFootballCultureContext,
} from "@/engine/world/footballCulture";
import { getShippedCountryKeys } from "@/lib/country";

describe("football culture playbooks", () => {
  it("ships a validated explicit playbook catalog for every shipped country", () => {
    expect(FOOTBALL_CULTURE_PLAYBOOK_CONTENT_PACK.manifest.id).toBe(
      "talentscout.football-culture-playbooks",
    );
    expect(FOOTBALL_CULTURE_PLAYBOOK_CONTENT_PACK.manifest.contentVersion).toBe(
      "football-culture-playbooks.1",
    );
    expect(FOOTBALL_CULTURE_PLAYBOOK_CONTENT_PACK.entries).toHaveLength(22);
    expect(listExplicitFootballCulturePlaybooks()).toHaveLength(
      FOOTBALL_CULTURE_PLAYBOOK_CONTENT_PACK.entries.length,
    );
  });

  it("ships explicit playbooks for every shipped country with four insight types and calendar windows", () => {
    const shippedCountries = getShippedCountryKeys();

    expect(shippedCountries).toHaveLength(22);

    for (const countryId of shippedCountries) {
      const playbook = getExplicitFootballCulturePlaybook(countryId);
      const insightDefinitions = listFootballCultureInsightDefinitions(countryId);

      expect(playbook, countryId).not.toBeNull();
      expect(playbook?.countryId).toBe(countryId);
      expect(new Set(insightDefinitions.map((entry) => entry.type)).size).toBe(4);
      expect(playbook?.calendarWindows.length).toBeGreaterThan(0);
    }
  });

  it("keeps the country calendar deterministic, persists generated variation, and returns a neutral fallback for unknown markets", () => {
    const seededOptions = {
      weeksPerSeason: 38,
      rootSeed: "career-seed",
      activeWorldConditionIds: ["showcase-circuit", "agent-exclusivity-wave"],
    } as const;
    const first = createCountrySeasonCalendar("england", 3, seededOptions);
    const replay = createCountrySeasonCalendar("england", 3, seededOptions);
    const shifted = createCountrySeasonCalendar("england", 3, {
      ...seededOptions,
      rootSeed: "career-seed-b",
    });
    const active = resolveCountryCalendarEffects("england", 3, 14, seededOptions);
    const activeReplay = resolveCountryCalendarEffects("england", 3, 14, seededOptions);
    const persisted = resolvePersistedCountryCalendarEffects(first, 14);
    const fallbackPlaybook = getFootballCulturePlaybook("iceland");
    const fallbackCalendar = createCountrySeasonCalendar("iceland", 3);

    expect(replay).toEqual(first);
    expect(first.windows[0].generationKey).toBe(first.generationKey);
    expect(first.windows[0].activeWorldConditionIds).toEqual([
      "agent-exclusivity-wave",
      "showcase-circuit",
    ]);
    expect(activeReplay).toEqual(active);
    expect(persisted).toEqual(active);
    expect(active.activeWindowIds.length).toBeGreaterThan(0);
    expect(shifted.generationKey).not.toBe(first.generationKey);
    expect(
      shifted.windows.some((window, index) =>
        window.weekShift !== first.windows[index]?.weekShift
        || window.intensityModifier !== first.windows[index]?.intensityModifier,
      ),
    ).toBe(true);
    expect(fallbackPlaybook.explicit).toBe(false);
    expect(fallbackCalendar.windows).toEqual([]);
  });

  it("unlocks four unique insight types for every shipped country and keeps outputs free of player truth", () => {
    for (const countryId of getShippedCountryKeys()) {
      const rng = createRNG(`culture-${countryId}`);
      const unlocked: CulturalInsight[] = [];
      const thresholds: Array<[number, number]> = [
        [0, 10],
        [10, 25],
        [25, 45],
        [45, 70],
      ];

      for (const [oldLevel, newLevel] of thresholds) {
        const insight = generateCulturalInsight(rng, countryId, oldLevel, newLevel, unlocked);
        expect(insight, `${countryId}:${oldLevel}-${newLevel}`).not.toBeNull();
        if (insight) unlocked.push(insight);
      }

      const context = resolveFootballCultureContext(countryId, unlocked, {
        season: 2,
        week: 12,
      });

      expect(new Set(unlocked.map((entry) => entry.type)).size).toBe(4);
      expect(context.insightIds).toHaveLength(4);
      expect(JSON.stringify(context)).not.toMatch(/currentAbility|potentialAbility|trueAttributes/);
    }
  });
});
