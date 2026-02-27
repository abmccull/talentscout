/**
 * State injection helpers for E2E tests.
 *
 * Provides functions to inject game state directly into the Zustand store
 * via page.evaluate(), bypassing the slow new-game wizard for most tests.
 */

import type { Page } from "@playwright/test";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Minimal game state overrides. These merge into the default game state
 * created by the store. Full type definition lives in the game's core/types.ts.
 */
export interface GameStateOverrides {
  currentWeek?: number;
  currentSeason?: number;
  scout?: Partial<{
    firstName: string;
    lastName: string;
    careerTier: number;
    primarySpecialization: string;
    careerPath: string;
    reputation: number;
    fatigue: number;
    age: number;
    avatarId: number;
  }>;
  countries?: string[];
  [key: string]: unknown;
}

// ─── Core Injection ──────────────────────────────────────────────────────────

/**
 * Dismiss all tutorial overlays so they don't block E2E interactions.
 */
export async function dismissTutorials(page: Page): Promise<void> {
  await page.evaluate(() => {
    const tutorialStore = (window as any).__TUTORIAL_STORE__;
    if (tutorialStore) {
      tutorialStore.getState().dismissForever();
    }
    // Also set localStorage directly as a fallback
    try {
      const key = "talentscout_tutorial";
      const existing = JSON.parse(localStorage.getItem(key) || "{}");
      existing.dismissed = true;
      localStorage.setItem(key, JSON.stringify(existing));
    } catch {}
  });
}

/**
 * Inject game state into the Zustand store by triggering a new game
 * and then patching the resulting state with overrides.
 */
export async function injectGameState(
  page: Page,
  overrides: GameStateOverrides = {},
): Promise<void> {
  // Dismiss tutorials first so overlays don't block interactions
  await dismissTutorials(page);

  await page.evaluate(async (overrides) => {
    const store = (window as any).__GAME_STORE__;
    if (!store) throw new Error("__GAME_STORE__ not found on window — is the dev server running?");

    // Start a fresh game with minimal config
    await store.getState().startNewGame({
      scoutFirstName: overrides.scout?.firstName ?? "Test",
      scoutLastName: overrides.scout?.lastName ?? "Scout",
      scoutAge: overrides.scout?.age ?? 28,
      specialization: overrides.scout?.primarySpecialization ?? "youth",
      difficulty: "normal",
      worldSeed: "e2e-seed-42",
      selectedCountries: overrides.countries ?? ["england"],
      nationality: "English",
      avatarId: overrides.scout?.avatarId ?? 1,
    });

    // Now patch the state with any overrides
    const currentState = store.getState().gameState;
    if (!currentState) throw new Error("Game state is null after startNewGame");

    const patchedState = { ...currentState };

    if (overrides.currentWeek !== undefined) {
      patchedState.currentWeek = overrides.currentWeek;
    }
    if (overrides.currentSeason !== undefined) {
      patchedState.currentSeason = overrides.currentSeason;
    }
    if (overrides.scout) {
      patchedState.scout = { ...patchedState.scout };
      if (overrides.scout.careerTier !== undefined) {
        patchedState.scout.careerTier = overrides.scout.careerTier;
      }
      if (overrides.scout.reputation !== undefined) {
        patchedState.scout.reputation = overrides.scout.reputation;
      }
      if (overrides.scout.fatigue !== undefined) {
        patchedState.scout.fatigue = overrides.scout.fatigue;
      }
      if (overrides.scout.careerPath !== undefined) {
        patchedState.scout.careerPath = overrides.scout.careerPath;
      }
    }

    // Load the patched state
    store.getState().loadGame(patchedState);
  }, overrides);

  // Dismiss tutorials again after state injection (startNewGame may re-trigger them)
  await dismissTutorials(page);
}

/**
 * Inject a late-game state with all features unlocked for screen-rendering tests.
 */
export async function injectLateGameState(
  page: Page,
  specialization: string = "youth",
): Promise<void> {
  await injectGameState(page, {
    currentWeek: 40,
    currentSeason: 2,
    countries: ["england", "spain", "germany"],
    scout: {
      firstName: "Test",
      lastName: "Scout",
      careerTier: 4,
      primarySpecialization: specialization,
      careerPath: "independent",
      reputation: 80,
      fatigue: 20,
    },
  });
}

/**
 * Inject a mid-game state (tier 2, week 20).
 */
export async function injectMidGameState(
  page: Page,
  specialization: string = "youth",
): Promise<void> {
  await injectGameState(page, {
    currentWeek: 20,
    currentSeason: 1,
    countries: ["england"],
    scout: {
      firstName: "Test",
      lastName: "Scout",
      careerTier: 2,
      primarySpecialization: specialization,
      careerPath: "club",
      reputation: 40,
      fatigue: 30,
    },
  });
}

/**
 * Navigate to /play and wait for the page to be ready.
 */
export async function navigateToGame(page: Page): Promise<void> {
  await page.goto("/play", { timeout: 60_000, waitUntil: "domcontentloaded" });
  // Wait for the game store to be exposed on window
  await page.waitForFunction(() => (window as any).__GAME_STORE__ !== undefined, {
    timeout: 60_000,
  });
}

/**
 * Read the current screen from the game store.
 */
export async function getCurrentScreen(page: Page): Promise<string> {
  return page.evaluate(() => {
    const store = (window as any).__GAME_STORE__;
    return store?.getState()?.currentScreen ?? "unknown";
  });
}

/**
 * Set the current screen directly via the store.
 */
export async function setScreen(page: Page, screen: string): Promise<void> {
  await page.evaluate((screen) => {
    const store = (window as any).__GAME_STORE__;
    store?.getState()?.setScreen(screen);
  }, screen);
  // Brief wait for React to re-render
  await page.waitForTimeout(200);
}

/**
 * Get a value from the game state.
 */
export async function getGameStateValue(page: Page, path: string): Promise<unknown> {
  return page.evaluate((path) => {
    const store = (window as any).__GAME_STORE__;
    const state = store?.getState()?.gameState;
    if (!state) return undefined;
    return path.split(".").reduce((obj: any, key: string) => obj?.[key], state);
  }, path);
}
