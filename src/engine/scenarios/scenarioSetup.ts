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

import type {
  CareerTier,
  GameState,
  NewGameConfig,
  YouthRecruitmentBrief,
} from "../core/types";
import { createWeekSchedule } from "../core/calendar";
import { simulateHistoricalWorldMatchWeeks } from "../core/gameLoop";
import { getSeasonLength } from "../core/gameDate";
import { generateSeasonEvents } from "../core/seasonEvents";
import {
  getCurrentTransferWindow,
  initializeTransferWindows,
  isTransferWindowOpen,
} from "../core/transferWindow";
import { createWeeklyStrategyState } from "../core/weeklyStrategy";
import {
  createCareerChronologyState,
  recordCareerTierReached,
} from "../career/chronology";
import { createRNG } from "../rng";
import {
  applyWorldConditionSeasonStart,
  createWorldConditionArcState,
  startWorldConditionArcs,
} from "../world";
import { generateSeasonTournaments } from "../youth";
import { getScenarioDefinition, type ScenarioDef } from "./scenarioDefinitions";

interface GameDate {
  week: number;
  season: number;
}

type ExtendedYouthRecruitmentBrief = YouthRecruitmentBrief & {
  issuedWeek?: number;
  issuedSeason?: number;
};

function absoluteGameWeek(date: GameDate, seasonLength: number): number {
  return (date.season - 1) * seasonLength + date.week - 1;
}

function addGameWeeks(date: GameDate, weeks: number, seasonLength: number): GameDate {
  const absolute = absoluteGameWeek(date, seasonLength) + Math.max(0, weeks);
  return {
    week: absolute % seasonLength + 1,
    season: Math.floor(absolute / seasonLength) + 1,
  };
}

function rebaseOpeningRecruitmentBriefs(
  briefs: GameState["youthRecruitmentBriefs"],
  opening: GameDate,
  seasonLength: number,
): GameState["youthRecruitmentBriefs"] {
  return Object.fromEntries(Object.entries(briefs).map(([id, brief]) => {
    if (brief.status !== "open") return [id, brief];
    const duration = Math.max(
      1,
      absoluteGameWeek(
        { week: brief.expiresWeek, season: brief.expiresSeason },
        seasonLength,
      ) - absoluteGameWeek(
        { week: brief.createdWeek, season: brief.createdSeason },
        seasonLength,
      ),
    );
    const expiry = addGameWeeks(opening, duration, seasonLength);
    const extended = brief as ExtendedYouthRecruitmentBrief;
    return [id, {
      ...brief,
      createdWeek: opening.week,
      createdSeason: opening.season,
      expiresWeek: expiry.week,
      expiresSeason: expiry.season,
      ...(extended.issuedWeek !== undefined ? { issuedWeek: opening.week } : {}),
      ...(extended.issuedSeason !== undefined ? { issuedSeason: opening.season } : {}),
      ...(brief.recruitmentSnapshot
        ? {
            recruitmentSnapshot: {
              ...brief.recruitmentSnapshot,
              capturedWeek: opening.week,
              capturedSeason: opening.season,
            },
          }
        : {}),
    }];
  }));
}

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
  return getScenarioDefinition(id);
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

/**
 * Reconcile every date-sensitive opening subsystem after a scenario has
 * selected its starting week and career tier. This function is intentionally
 * reserved for a freshly generated game: it establishes implied pre-season
 * history and must never be run over an in-progress save.
 */
export function reconcileScenarioOpeningState(
  state: GameState,
  scenario: ScenarioDef,
): GameState {
  const overridden = applyScenarioOverrides(state, scenario);
  const opening = {
    week: overridden.currentWeek,
    season: overridden.currentSeason,
  };
  const seasonLength = getSeasonLength(overridden.fixtures, opening.season);
  const windows = initializeTransferWindows(opening.season).map((window) => ({
    ...window,
    isOpen: isTransferWindowOpen([window], opening.week),
  }));
  const activeWindow = getCurrentTransferWindow(windows, opening.week);
  const chronology = recordCareerTierReached(
    createCareerChronologyState({
      currentSeason: opening.season,
      careerTier: overridden.scout.careerTier,
    }),
    overridden.scout.careerTier,
    opening,
  );
  const seasonEvents = generateSeasonEvents(opening.season, seasonLength).map((event) => ({
    ...event,
    // A mid-season scenario inherits earlier calendar events as history; it
    // must not surface them later as unresolved actions.
    resolved: event.endWeek < opening.week ? true : event.resolved,
  }));
  const inheritedMatchHistory = simulateHistoricalWorldMatchWeeks(
    overridden,
    opening.week,
  );

  let reconciled: GameState = {
    ...overridden,
    ...inheritedMatchHistory,
    schedule: createWeekSchedule(opening.week, opening.season),
    weeklyStrategy: createWeeklyStrategyState(opening.week, opening.season),
    careerChronology: chronology,
    seasonEvents,
    transferWindow: activeWindow,
    youthTournaments: generateSeasonTournaments(
      createRNG(`${overridden.runManifest.rootSeed}-tournaments-s${opening.season}`),
      opening.season,
      overridden.countries,
      overridden.scout,
    ),
    youthRecruitmentBriefs: rebaseOpeningRecruitmentBriefs(
      overridden.youthRecruitmentBriefs,
      opening,
      seasonLength,
    ),
    // Initial arcs were authored against the generic week-one state. Reset
    // them so the scenario's first visible beat starts at its real opening.
    worldConditionArcState: createWorldConditionArcState(
      undefined,
      overridden.countries,
    ),
  };

  reconciled = applyWorldConditionSeasonStart(reconciled);
  reconciled = {
    ...reconciled,
    worldConditionArcState: startWorldConditionArcs({
      state: createWorldConditionArcState(
        reconciled.worldConditionArcState,
        reconciled.countries,
      ),
      rootSeed: reconciled.runManifest.rootSeed,
      conditions: reconciled.worldConditionState?.active ?? [],
      now: opening,
      seasonLength,
    }),
    // A challenge begins with a clean, current inbox rather than unread mail
    // stamped nineteen weeks before the player was hired.
    inbox: reconciled.inbox.map((message) => ({
      ...message,
      week: opening.week,
      season: opening.season,
    })),
  };
  return reconciled;
}
