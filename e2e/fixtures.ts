/**
 * GamePage custom fixture for TalentScout E2E tests.
 */

import { test as base, expect, type Page } from "@playwright/test";
import { mobileNavItem, navItem, SELECTORS } from "./helpers/selectors";
import {
  navigateToGame,
  injectGameState,
  injectLateGameState,
  injectMidGameState,
  dismissTutorials,
  getCurrentScreen,
  setScreen,
  getGameStateValue,
  getDefaultSkillAllocations,
  type GameStateOverrides,
} from "./helpers/state-injection";

const youthEarlyAccess = process.env.NEXT_PUBLIC_YOUTH_EARLY_ACCESS !== "false";

/** Acknowledge the persisted emotional-moment queue through its real modal UI. */
export async function dismissCareerMomentOverlays(
  page: Page,
  maxAcknowledgements = 12,
): Promise<void> {
  for (let index = 0; index < maxAcknowledgements; index++) {
    const overlay = page.getByTestId("career-moment-overlay");
    if (!(await overlay.isVisible({ timeout: 500 }).catch(() => false))) return;
    await overlay.getByRole("button", { name: "Continue", exact: true }).click();
    await page.waitForTimeout(100);
  }

  throw new Error(
    `Career moment queue did not drain after ${maxAcknowledgements} acknowledgements`,
  );
}

export class GamePage {
  readonly page: Page;
  private consoleErrors: string[] = [];

  constructor(page: Page) {
    this.page = page;

    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (text.includes("favicon.ico")) return;
      this.consoleErrors.push(text);
    });

    page.on("pageerror", (error) => {
      this.consoleErrors.push(error.stack ?? error.message);
    });
  }

  private async allocateWizardSkillPoints(
    specialization: "youth" | "firstTeam" | "regional" | "data" = "youth",
  ): Promise<void> {
    const allocations = getDefaultSkillAllocations(specialization);
    for (const [skill, amount] of Object.entries(allocations)) {
      for (let i = 0; i < amount; i++) {
        await this.page.getByRole("button", { name: `Increase ${skill}` }).click();
      }
    }
  }

  private async resolveWeekSimulationInteraction(): Promise<boolean> {
    const choiceRegion = this.page.getByRole("region", { name: "Day interaction choice" });
    if (!(await choiceRegion.isVisible({ timeout: 1_000 }).catch(() => false))) {
      return true;
    }

    const selectedChoice = choiceRegion.getByText(/^Selected:/);
    if (await selectedChoice.isVisible({ timeout: 250 }).catch(() => false)) {
      return true;
    }

    const decisionButtons = choiceRegion.getByRole("button");
    if (!(await decisionButtons.first().isVisible({ timeout: 2_000 }).catch(() => false))) {
      return false;
    }

    const focusButton = choiceRegion.getByRole("button", { name: /^Focus Prospect\b/i });
    if (await focusButton.isVisible({ timeout: 500 }).catch(() => false)) {
      await focusButton.click();
    } else {
      await decisionButtons.first().click();
    }

    const confirmFocus = this.page.getByRole("button", { name: /^Confirm Focus$/ });
    if (await confirmFocus.isVisible({ timeout: 500 }).catch(() => false)) {
      await confirmFocus.click();
    }

    await selectedChoice.waitFor({ state: "visible", timeout: 5_000 });
    return true;
  }

  private async dismissBlockingDialogs(): Promise<void> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const dialogs = this.page.getByRole("dialog");
      const dialogCount = await dialogs.count();
      let dismissed = false;
      for (let index = dialogCount - 1; index >= 0; index--) {
        const dialog = dialogs.nth(index);
        if (!(await dialog.isVisible({ timeout: 250 }).catch(() => false))) continue;
        const dismissButton = dialog.getByRole("button", {
          name: /^(Incredible!|Continue|Close week summary|Continue to promotion|Continue to milestone)$/,
        });
        if (!(await dismissButton.isVisible({ timeout: 250 }).catch(() => false))) continue;
        await dismissButton.click();
        await this.page.waitForTimeout(150);
        dismissed = true;
        break;
      }
      if (!dismissed) return;
    }
  }

  async goto(): Promise<void> {
    await navigateToGame(this.page);
    await dismissTutorials(this.page);
  }

  async navigateTo(screen: string): Promise<void> {
    const viewport = this.page.viewportSize();
    const isMobile = Boolean(viewport && viewport.width < 768);
    const mobileSidebarOpen = isMobile && await this.page
      .locator('aside[aria-label="Game navigation"]')
      .evaluate((sidebar) => sidebar.classList.contains("translate-x-0"));

    await this.page.click(
      isMobile && !mobileSidebarOpen ? mobileNavItem(screen) : navItem(screen),
    );
    await this.waitForScreen(screen, 60_000);
    // `currentScreen` changes before a first-visit dynamic workspace has
    // downloaded and committed. Wait for the route-level loading fallback to
    // leave so callers measure and interact with the destination they named,
    // rather than accidentally charging its load to the next click.
    await this.page
      .getByText(/^Loading workspace/)
      .waitFor({ state: "hidden", timeout: 60_000 });
  }

  async setScreen(screen: string): Promise<void> {
    await setScreen(this.page, screen);
  }

  async getCurrentScreen(): Promise<string> {
    return getCurrentScreen(this.page);
  }

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

  async injectState(overrides: GameStateOverrides = {}): Promise<void> {
    await injectGameState(this.page, overrides);
  }

  async injectLateGameState(spec: string = "youth"): Promise<void> {
    await injectLateGameState(this.page, spec);
  }

  async injectMidGameState(spec: string = "youth"): Promise<void> {
    await injectMidGameState(this.page, spec);
  }

  async startNewGame(config: {
    firstName?: string;
    lastName?: string;
    specialization?: "youth" | "firstTeam" | "regional" | "data";
  } = {}): Promise<void> {
    const { firstName = "Test", lastName = "Scout", specialization = "youth" } = config;

    if ((await this.getCurrentScreen()) === "mainMenu") {
      await this.page.locator(SELECTORS.newGameButton).first().click();
      await this.page.waitForTimeout(500);
    }

    await this.page
      .locator('input#scout-first-name, input[placeholder="Alex"]')
      .fill(firstName);
    await this.page
      .locator('input#scout-last-name, input[placeholder="Morgan"]')
      .fill(lastName);
    if (youthEarlyAccess) {
      const deskOpening = this.page.getByRole("radio", { name: /Start at the Desk/i });
      if (await deskOpening.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await deskOpening.evaluate((input: HTMLInputElement) => input.click());
      }
    }
    await this.page.click('button:has-text("Continue")');
    await this.page.waitForTimeout(400);

    if (!youthEarlyAccess) {
      const specNames: Record<string, string> = {
        youth: "Youth Scout",
        firstTeam: "First Team Scout",
        regional: "Regional Expert",
        data: "Data Scout",
      };
      await this.page
        .getByRole("button", { name: new RegExp(specNames[specialization] ?? "Youth Scout") })
        .click();
      await this.page.click('button:has-text("Continue")');
      await this.page.waitForTimeout(400);
    }

    await this.allocateWizardSkillPoints(specialization);
    await this.page.click('button:has-text("Continue")');
    await this.page.waitForTimeout(400);

    if (!youthEarlyAccess) {
      await this.page.click('button:has-text("Continue")');
      await this.page.waitForTimeout(400);
    }

    await this.page.click('button:has-text("Continue")');
    await this.page.waitForTimeout(400);

    await this.page.click('button:has-text("Begin Career")');
    await this.waitForScreen("dashboard", 30_000);
    // Starting a career intentionally initializes contextual onboarding. E2E
    // gameplay stories test the underlying screen/action contract, so dismiss
    // that overlay after creation just as state-injection helpers do.
    await dismissTutorials(this.page);
  }

  async advanceWeek(): Promise<void> {
    await this.page.evaluate(async () => {
      const store = (window as any).__GAME_STORE__;
      const state = store?.getState();
      if (!state) return;
      await state.batchAdvance(1);
    });
    await this.page.waitForTimeout(200);
  }

  async advanceWeeks(n: number): Promise<void> {
    await this.page.evaluate(async (weeks) => {
      const store = (window as any).__GAME_STORE__;
      const state = store?.getState();
      if (!state) return;
      await state.batchAdvance(weeks);
    }, n);
    await this.page.waitForTimeout(300);
  }

  async advanceCanonicalWeek(options: { launchLiveSession?: boolean } = {}): Promise<void> {
    const { launchLiveSession = false } = options;
    await this.page.getByRole("button", { name: /^Advance Week$/ }).click();

    const emptyDayAdvance = this.page.getByRole("button", { name: /^Advance$/ });
    if (await emptyDayAdvance.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await emptyDayAdvance.click();
    }

    await this.waitForScreen("weekSimulation", 10_000);

    const settlementDeadline = Date.now() + 30_000;
    while (Date.now() < settlementDeadline) {
      // Milestones can replace the final simulation controls with a week-summary
      // and celebration stack. These are acknowledgement dialogs, not gameplay
      // choices, so clear them before looking for the next canonical control.
      await this.dismissBlockingDialogs();
      if (await this.getCurrentScreen() === "calendar") break;

      const interactionResolved = await this.resolveWeekSimulationInteraction();
      if (!interactionResolved) {
        await this.page.waitForTimeout(250);
        continue;
      }

      if (launchLiveSession) {
        const launchLiveSessionButton = this.page.getByRole("button", {
          name: /^Launch Live Session$/,
        });
        if (
          await launchLiveSessionButton.isVisible({ timeout: 1_000 }).catch(() => false)
        ) {
          // The handler immediately replaces the week-simulation tree with the
          // observation screen. Dispatch directly so Playwright does not retry
          // the already-successful click after the source button detaches.
          await launchLiveSessionButton.evaluate((element) => {
            (element as HTMLButtonElement).click();
          });
          await this.waitForScreen("observation", 10_000);
          await this.completeObservationViaUI();
          await this.waitForScreen("weekSimulation", 10_000);
          continue;
        }
      }

      const viewCalendar = this.page.getByRole("button", { name: /^View Calendar$/ });
      if (await viewCalendar.isVisible({ timeout: 1_000 }).catch(() => false)) {
        const enabled = await viewCalendar.evaluate(
          (element) => !(element as HTMLButtonElement).disabled,
        ).catch(() => false);
        if (!enabled) {
          await this.page.waitForTimeout(250);
          continue;
        }
        // The final simulation commit can replace this source control with the
        // Planner and Week Summary between the visibility check and click.
        // Reconcile that legitimate transition first, then keep the click
        // bounded so a detached control cannot consume the entire test budget.
        await this.page.waitForTimeout(100);
        await this.dismissBlockingDialogs();
        if (await this.getCurrentScreen() === "calendar") break;
        const clicked = await viewCalendar.click({ timeout: 2_000 })
          .then(() => true)
          .catch(() => false);
        if (clicked) break;
        continue;
      }

      const completeWeek = this.page.getByRole("button", {
        name: /^(Complete the week and process results|Complete Week)$/i,
      });
      if (await completeWeek.isVisible({ timeout: 1_000 }).catch(() => false)) {
        const enabled = await completeWeek.evaluate(
          (element) => !(element as HTMLButtonElement).disabled,
        ).catch(() => false);
        if (!enabled) {
          await this.page.waitForTimeout(250);
          continue;
        }
        await completeWeek.click();
        await this.page.waitForTimeout(200);
        continue;
      }

      const nextDay = this.page.getByRole("button", { name: /^(Advance to next day|Next Day)$/i });
      if (await nextDay.isVisible({ timeout: 1_000 }).catch(() => false)) {
        const enabled = await nextDay.evaluate(
          (element) => !(element as HTMLButtonElement).disabled,
        ).catch(() => false);
        if (!enabled) {
          await this.page.waitForTimeout(250);
          continue;
        }
        await nextDay.click();
        await this.page.waitForTimeout(200);
        continue;
      }

      await this.page.waitForTimeout(250);
    }

    // Career-moment cinema is queued after the canonical commit and can mount
    // just after the Planner returns. Give that post-commit overlay one render
    // turn, then clear it so the caller receives an actually interactive screen.
    await this.page.waitForTimeout(250);
    await this.dismissBlockingDialogs();

    const finalScreen = await this.getCurrentScreen();
    if (finalScreen !== "calendar") {
      const consoleContext = this.consoleErrors.length > 0
        ? `\nConsole errors:\n${this.consoleErrors.join("\n")}`
        : "";
      throw new Error(
        `Canonical week ended on unexpected screen: ${finalScreen}${consoleContext}`,
      );
    }
  }

  async scheduleActivityByLabel(
    activityLabel: string,
    dayLabel: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun" = "Mon",
  ): Promise<void> {
    const activityCard = this.page.locator("article").filter({
      has: this.page.getByRole("heading", { name: activityLabel, exact: true }),
    }).first();
    await activityCard.getByRole("button", { name: /Choose Day/ }).click();
    await this.page
      .getByRole("button", { name: `Place ${activityLabel} on ${dayLabel}` })
      .click();
  }

  async openFirstYouthPlayerProfile(): Promise<void> {
    await this.navigateTo("youthScouting");
    await this.page.locator('button[aria-label^="View profile for "]').first().click();
    await this.waitForScreen("playerProfile");
  }

  async submitCurrentReportViaUI(
    conviction: "note" | "recommend" | "strongRecommend" | "tablePound" = "recommend",
  ): Promise<void> {
    const convictionLabels: Record<typeof conviction, string> = {
      note: "Note",
      recommend: "Recommend",
      strongRecommend: "Strong Recommend",
      tablePound: "Table Pound",
    };

    await this.page
      .getByRole("radio", { name: new RegExp(`^${convictionLabels[conviction]}\\b`) })
      .click();
    await this.page.getByRole("button", { name: /^Submit Report$/ }).click();
  }

  async completeObservationViaUI(): Promise<void> {
    await dismissTutorials(this.page);
    const beginObservation = this.page.locator(
      '[data-tutorial-id="observation-begin-session"]',
    );
    await beginObservation.waitFor({ state: "visible", timeout: 10_000 });
    await beginObservation.click();

    const focusButton = this.page.locator('button[aria-label^="Add focus to "]').first();
    if (await focusButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await focusButton.click();
      const technicalLens = this.page
        .getByRole("button", { name: /^Use technical lens for /i })
        .first();
      if (await technicalLens.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await technicalLens.click();
      } else {
        await this.page.keyboard.press("Escape");
      }
    }

    const flagMoment = this.page.getByRole("button", { name: /^Flag this moment$/ }).first();
    if (await flagMoment.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await flagMoment.click();
      await this.page.getByRole("button", { name: /^Promising$/ }).click();
    }

    let reachedReflection = false;
    for (let step = 0; step < 30; step++) {
      // Observation milestones can enqueue contextual mentor cards after a
      // phase transition. Keep gameplay assertions independent from tutorial
      // pointer interception at every interaction boundary.
      await dismissTutorials(this.page);
      const strategicChoice = this.page
        .getByRole("group", { name: /^(Strategic choices|Response options|Data points)$/ })
        .locator("button:not(:disabled)")
        .first();
      if (
        await strategicChoice.isVisible({ timeout: 300 }).catch(() => false)
        && await strategicChoice.isEnabled()
      ) {
        await strategicChoice.click();
      }
      const reflection = this.page.getByRole("button", { name: /^Go to Reflection$/ });
      if (await reflection.isVisible({ timeout: 500 }).catch(() => false)) {
        await reflection.click();
        reachedReflection = true;
        break;
      }

      const nextPhase = this.page.getByRole("button", { name: /^Next Phase$/ });
      if (await nextPhase.isVisible({ timeout: 500 }).catch(() => false)) {
        await nextPhase.click();
        await this.page.waitForTimeout(100);
        continue;
      }

      await this.page.waitForTimeout(100);
    }

    if (!reachedReflection) {
      throw new Error("Observation never reached reflection");
    }

    await dismissTutorials(this.page);
    const completeReflection = this.page.getByRole("button", {
      name: /^Complete (Reflection|Session)$/,
    });
    await completeReflection.waitFor({ state: "visible", timeout: 10_000 });
    await completeReflection.click();

    const continueButton = this.page.getByRole("button", { name: /^Continue$/ });
    const completionRoute = await Promise.race([
      this.waitForScreen("weekSimulation", 10_000).then(() => "weekSimulation" as const),
      this.waitForScreen("openingDiscovery", 10_000).then(() => "openingDiscovery" as const),
      continueButton
        .waitFor({ state: "visible", timeout: 10_000 })
        .then(() => "continue" as const),
    ]);
    if (completionRoute === "continue") {
      await continueButton.click();
    }
  }

  async getGameStateValue(path: string): Promise<unknown> {
    return getGameStateValue(this.page, path);
  }

  async getScoutTier(): Promise<number> {
    return (await this.getGameStateValue("scout.careerTier")) as number;
  }

  async getCurrentWeek(): Promise<number> {
    return (await this.getGameStateValue("currentWeek")) as number;
  }

  async getSpecialization(): Promise<string> {
    return (await this.getGameStateValue("scout.primarySpecialization")) as string;
  }

  async startObservationSession(
    activityType: string,
    targetPlayerId?: string,
  ): Promise<void> {
    await this.page.evaluate(
      ({ activityType: type, targetPlayerId: targetId }) => {
        const store = (window as any).__GAME_STORE__;
        const state = store.getState().gameState;
        if (!state) throw new Error("No game state");

        const players = Object.values(state.players) as any[];
        if (players.length === 0) throw new Error("No players in game state");

        const pool = players.slice(0, 5).map((player: any) => ({
          playerId: player.id,
          name: `${player.firstName} ${player.lastName}`,
          position: player.position ?? "Forward",
        }));

        store.getState().startObservationSession(type, pool, targetId ?? pool[0].playerId);
      },
      { activityType, targetPlayerId },
    );
    await this.page.waitForTimeout(300);
  }

  async getActiveSession(): Promise<{
    mode: string;
    state: string;
    currentPhaseIndex: number;
    totalPhases: number;
    focusTokens: { available: number; total: number };
    flaggedMoments: number;
    hypotheses: number;
    reflectionNotes: number;
    insightPointsEarned: number;
    activityType: string;
  } | null> {
    return this.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const session = store?.getState()?.activeSession;
      if (!session) return null;
      return {
        mode: session.mode,
        state: session.state,
        currentPhaseIndex: session.currentPhaseIndex,
        totalPhases: session.phases?.length ?? 0,
        focusTokens: {
          available: session.focusTokens?.available ?? 0,
          total: session.focusTokens?.total ?? 0,
        },
        flaggedMoments: session.flaggedMoments?.length ?? 0,
        hypotheses: session.hypotheses?.length ?? 0,
        reflectionNotes: session.reflectionNotes?.length ?? 0,
        insightPointsEarned: session.insightPointsEarned ?? 0,
        activityType: session.activityType,
      };
    });
  }

  async scheduleActivityByType(activityType: string, dayIndex: number): Promise<void> {
    await this.page.evaluate(
      ({ activityType: type, dayIndex: day }) => {
        const store = (window as any).__GAME_STORE__;
        store.getState().scheduleActivity(
          { type, slots: 1, description: `E2E ${type}` },
          day,
        );
      },
      { activityType, dayIndex },
    );
    await this.page.waitForTimeout(100);
  }

  async submitReportViaStore(
    conviction: "note" | "recommend" | "strongRecommend" | "tablePound" = "recommend",
  ): Promise<boolean> {
    return this.page.evaluate((reportConviction) => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      if (!state || Object.keys(state.players).length === 0) return false;

      const playerId = Object.keys(state.players)[0];
      store.getState().startReport(playerId);

      try {
        store.getState().submitReport(
          reportConviction,
          "E2E test report summary",
          ["pace", "finishing"],
          ["positioning"],
        );
        return true;
      } catch {
        return false;
      }
    }, conviction);
  }

  expectNoConsoleErrors(): void {
    expect(this.consoleErrors, "Console errors detected").toEqual([]);
  }

  getConsoleErrors(): string[] {
    return [...this.consoleErrors];
  }

  clearConsoleErrors(): void {
    this.consoleErrors = [];
  }
}

export const test = base.extend<{ gamePage: GamePage }>({
  gamePage: async ({ page }, use) => {
    await use(new GamePage(page));
  },
});

export { expect } from "@playwright/test";
