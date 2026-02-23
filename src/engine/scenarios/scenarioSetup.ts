/**
 * Scenario setup utilities — apply a scenario's starting parameters to a
 * NewGameConfig and to the freshly-built GameState.
 *
 * Design principles:
 *  - All functions are pure: data in, data out. No side effects.
 *  - No React/Next.js imports.
 *  - `applyScenarioSetup` handles the fields that flow through NewGameConfig.
 *  - `applyScenarioOverrides` handles the fields that must be patched directly
 *    onto GameState after normal initialisation (week, season, reputation, tier).
 */

import type { GameState, NewGameConfig, CareerTier } from "../core/types";
import { SCENARIOS, type ScenarioDef } from "./scenarioDefinitions";

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Look up a scenario definition by its ID.
 * Returns `undefined` when the ID is not recognised.
 *
 * Re-exported here so callers can import everything they need from
 * `scenarioSetup` without touching `scenarioEngine`.
 */
export function getScenarioById(id: string): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

/**
 * Overlay a scenario's setup parameters onto the player's NewGameConfig.
 *
 * Only fields that NewGameConfig supports are applied here. Fields that
 * require direct GameState access (week, season, reputation, tier) are
 * handled by `applyScenarioOverrides` after world generation.
 *
 * @param config   The base NewGameConfig produced by the new-game form.
 * @param scenario The scenario whose setup params should be applied.
 * @returns        A new NewGameConfig with scenario overrides merged in.
 */
export function applyScenarioSetup(
  config: NewGameConfig,
  scenario: ScenarioDef,
): NewGameConfig {
  const { startingCountry } = scenario.setup;

  return {
    ...config,
    // Override the scout's starting country to the scenario's required country.
    startingCountry,
    // Ensure the starting country is included in the selected country set.
    // If the caller already selected countries, add the scenario country if
    // missing; otherwise default to just the scenario country.
    selectedCountries:
      config.selectedCountries !== undefined &&
      config.selectedCountries.length > 0
        ? config.selectedCountries.includes(startingCountry)
          ? config.selectedCountries
          : [...config.selectedCountries, startingCountry]
        : [startingCountry],
  };
}

/**
 * Apply scenario-specific overrides to a freshly-built GameState.
 *
 * Called after the world builder has constructed the full GameState from
 * NewGameConfig. Patches the fields that cannot be driven through
 * NewGameConfig (current week/season, scout reputation, career tier) and
 * stamps the activeScenarioId so the engine can evaluate objectives.
 *
 * @param state    The GameState returned by normal new-game initialisation.
 * @param scenario The scenario whose setup params should be applied.
 * @returns        A new GameState with all scenario overrides applied.
 */
export function applyScenarioOverrides(
  state: GameState,
  scenario: ScenarioDef,
): GameState {
  const { startingWeek, startingSeason, startingReputation, startingTier } =
    scenario.setup;

  // CareerTier is 1 | 2 | 3 | 4 | 5. Clamp to valid range before casting.
  const clampedTier = Math.max(1, Math.min(5, startingTier)) as CareerTier;

  return {
    ...state,
    activeScenarioId: scenario.id,
    currentWeek: startingWeek,
    currentSeason: startingSeason,
    scout: {
      ...state.scout,
      reputation: startingReputation,
      careerTier: clampedTier,
    },
  };
}
