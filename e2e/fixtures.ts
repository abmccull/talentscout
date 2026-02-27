/**
 * GamePage — custom Playwright fixture for TalentScout E2E tests.
 *
 * Wraps common game operations into a clean API:
 * - Start new games with any configuration
 * - Navigate via sidebar or store injection
 * - Advance weeks, read game state, etc.
 */

import { test as base, expect, type Page } from "@playwright/test";
import { navItem, SELECTORS } from "./helpers/selectors";
import {
  navigateToGame,
  injectGameState,
  injectLateGameState,
  injectMidGameState,
  dismissTutorials,
  getCurrentScreen,
  setScreen,
  getGameStateValue,
  type GameStateOverrides,
} from "./helpers/state-injection";

// ─── GamePage Helper ─────────────────────────────────────────────────────────

export class GamePage {
  readonly page: Page;
  private consoleErrors: string[] = [];

  constructor(page: Page) {
    this.page = page;

    // Collect console errors throughout the test
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        // Filter out known non-actionable errors
        if (text.includes("favicon.ico")) return;
        if (text.includes("hydration")) return;
        if (text.includes("cannot contain a nested")) return; // React DOM nesting warnings
        if (text.includes("Warning:")) return; // React dev-mode warnings
        if (text.includes("Failed to load resource")) return; // Transient dev server 500s
        if (text.includes("Internal Server Error")) return;
        if (text.includes("net::ERR_")) return; // Network errors during page transitions
        if (text.includes("Unexpected end of JSON")) return; // Next.js HMR race condition
        this.consoleErrors.push(text);
      }
    });
  }

  // ── Navigation ─────────────────────────────────────────────────────────

  /** Navigate browser to /play and wait for the game store to be available. */
  async goto(): Promise<void> {
    await navigateToGame(this.page);
    // Dismiss tutorial overlays so they don't block E2E interactions
    await dismissTutorials(this.page);
  }

  /** Click a sidebar nav item by screen name. */
  async navigateTo(screen: string): Promise<void> {
    const selector = navItem(screen);
    await this.page.click(selector);
    await this.page.waitForTimeout(300); // Allow screen transition animation
  }

  /** Set screen directly via the store (faster than clicking). */
  async setScreen(screen: string): Promise<void> {
    await setScreen(this.page, screen);
  }

  /** Get the current screen from the store. */
  async getCurrentScreen(): Promise<string> {
    return getCurrentScreen(this.page);
  }

  /** Wait until the current screen matches the expected value. */
  async waitForScreen(screen: string, timeout = 10_000): Promise<void> {
    await this.page.waitForFunction(
      (expected) => {
        const store = (window as any).__GAME_STORE__;
        return store?.getState()?.currentScreen === expected;
      },
      screen,
      { timeout },
    );
  }

  // ── State Injection ────────────────────────────────────────────────────

  /** Inject a custom game state. */
  async injectState(overrides: GameStateOverrides = {}): Promise<void> {
    await injectGameState(this.page, overrides);
  }

  /** Inject a late-game state with all features unlocked. */
  async injectLateGameState(spec: string = "youth"): Promise<void> {
    await injectLateGameState(this.page, spec);
  }

  /** Inject a mid-game state (tier 2, week 20). */
  async injectMidGameState(spec: string = "youth"): Promise<void> {
    await injectMidGameState(this.page, spec);
  }

  // ── New Game Wizard ────────────────────────────────────────────────────

  /**
   * Automate the 6-step new game wizard.
   *
   * Wizard inputs use placeholders "Alex" / "Morgan".
   * Navigation button is "Continue" (steps 1–5) and "Begin Career" (step 6).
   */
  async startNewGame(config: {
    firstName?: string;
    lastName?: string;
    specialization?: "youth" | "firstTeam" | "regional" | "data";
  } = {}): Promise<void> {
    const { firstName = "Test", lastName = "Scout", specialization = "youth" } = config;

    // Should be on mainMenu or newGame screen
    const currentScreen = await this.getCurrentScreen();
    if (currentScreen === "mainMenu") {
      await this.page.click(SELECTORS.newGameButton);
      await this.page.waitForTimeout(500);
    }

    // Step 1: Identity — clear default values and fill name
    const firstNameInput = this.page.locator('input#scout-first-name, input[placeholder="Alex"]');
    const lastNameInput = this.page.locator('input#scout-last-name, input[placeholder="Morgan"]');
    await firstNameInput.fill(firstName);
    await lastNameInput.fill(lastName);
    await this.page.click('button:has-text("Continue")');
    await this.page.waitForTimeout(400);

    // Step 2: Specialization — click the spec card
    const specNames: Record<string, string> = {
      youth: "Youth Scout",
      firstTeam: "First Team Scout",
      regional: "Regional Expert",
      data: "Data Scout",
    };
    const specName = specNames[specialization] ?? "Youth Scout";
    await this.page.click(`text="${specName}"`);
    await this.page.click('button:has-text("Continue")');
    await this.page.waitForTimeout(400);

    // Step 3: Skills — accept defaults
    await this.page.click('button:has-text("Continue")');
    await this.page.waitForTimeout(400);

    // Step 4: Position — accept defaults (freelance)
    await this.page.click('button:has-text("Continue")');
    await this.page.waitForTimeout(400);

    // Step 5: World — accept defaults (England)
    await this.page.click('button:has-text("Continue")');
    await this.page.waitForTimeout(400);

    // Step 6: Review — click begin
    await this.page.click('button:has-text("Begin Career")');

    // Wait for game to load and land on dashboard
    await this.waitForScreen("dashboard", 30_000);
  }

  // ── Game Actions ───────────────────────────────────────────────────────

  /**
   * Advance one week via batchAdvance(1).
   *
   * batchAdvance bypasses the day-by-day simulation UI entirely,
   * processing the week instantly in the background. This is the
   * correct approach for E2E tests that need fast week progression.
   */
  async advanceWeek(): Promise<void> {
    await this.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store?.getState();
      if (!state) return;
      state.batchAdvance(1);
    });
    await this.page.waitForTimeout(200);
  }

  /** Advance N weeks in a single batch (much faster than N individual advances). */
  async advanceWeeks(n: number): Promise<void> {
    await this.page.evaluate((weeks) => {
      const store = (window as any).__GAME_STORE__;
      const state = store?.getState();
      if (!state) return;
      state.batchAdvance(weeks);
    }, n);
    await this.page.waitForTimeout(300);
  }

  // ── State Queries ──────────────────────────────────────────────────────

  /** Read a value from the game state. */
  async getGameStateValue(path: string): Promise<unknown> {
    return getGameStateValue(this.page, path);
  }

  /** Get the current scout tier. */
  async getScoutTier(): Promise<number> {
    return (await this.getGameStateValue("scout.careerTier")) as number;
  }

  /** Get the current week number. */
  async getCurrentWeek(): Promise<number> {
    return (await this.getGameStateValue("currentWeek")) as number;
  }

  /** Get the scout specialization. */
  async getSpecialization(): Promise<string> {
    return (await this.getGameStateValue("scout.primarySpecialization")) as string;
  }

  // ── Assertions ─────────────────────────────────────────────────────────

  /** Assert no console errors were recorded during the test. */
  expectNoConsoleErrors(): void {
    expect(this.consoleErrors, "Console errors detected").toEqual([]);
  }

  /** Get the list of collected console errors. */
  getConsoleErrors(): string[] {
    return [...this.consoleErrors];
  }

  /** Clear collected console errors (use between sub-tests). */
  clearConsoleErrors(): void {
    this.consoleErrors = [];
  }
}

// ─── Custom Test Fixture ─────────────────────────────────────────────────────

export const test = base.extend<{ gamePage: GamePage }>({
  gamePage: async ({ page }, use) => {
    const gamePage = new GamePage(page);
    await use(gamePage);
  },
});

export { expect } from "@playwright/test";
