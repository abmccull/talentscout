import { describe, expect, it } from "vitest";
import type { CountryReputation, GameState } from "@/engine/core/types";
import {
  countCountriesScouted,
  getAchievementProgress,
} from "@/engine/core/achievementEngine";
import { ACHIEVEMENTS } from "@/lib/achievements";

function country(
  id: string,
  overrides: Partial<CountryReputation> = {},
): CountryReputation {
  return {
    country: id,
    familiarity: 0,
    reportsSubmitted: 0,
    successfulFinds: 0,
    contactCount: 0,
    ...overrides,
  };
}

function stateWithCountries(
  countryReputations: Record<string, CountryReputation>,
): GameState {
  return { scout: { countryReputations } } as unknown as GameState;
}

describe("achievement integrity", () => {
  it("does not award global progress for dormant world records", () => {
    const reputations = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => {
        const id = `country-${index}`;
        return [id, country(id, index === 0 ? { familiarity: 50 } : {})];
      }),
    );
    const state = stateWithCountries(reputations);
    const frequentFlyer = ACHIEVEMENTS.find(
      (achievement) => achievement.id === "countries-3",
    );

    expect(countCountriesScouted(state)).toBe(0);
    expect(frequentFlyer?.check(state)).toBe(false);
    expect(getAchievementProgress(state, "countries-3")).toMatchObject({
      current: 0,
      target: 3,
      percentage: 0,
    });
  });

  it("counts countries only after meaningful scouting activity", () => {
    const state = stateWithCountries({
      england: country("england", { familiarity: 51 }),
      france: country("france", { reportsSubmitted: 1 }),
      brazil: country("brazil", { contactCount: 1 }),
      germany: country("germany"),
    });
    const frequentFlyer = ACHIEVEMENTS.find(
      (achievement) => achievement.id === "countries-3",
    );

    expect(countCountriesScouted(state)).toBe(3);
    expect(frequentFlyer?.check(state)).toBe(true);
    expect(getAchievementProgress(state, "countries-3")?.current).toBe(3);
  });
});
