import { expect, test, type GamePage } from "../fixtures";

// Failure contract, written before the shared mentor repair: background guidance
// must not cover or steal focus from a real game dialog. Canceling must preserve
// the week and guided task; confirming once must commit exactly one week. Keep
// the guide active throughout setup so tutorial-dismissal helpers cannot mask it.
async function reachGuidedPlanner(gamePage: GamePage): Promise<void> {
  const { page } = gamePage;
  await page.goto("/play", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Start Youth Scout Career", exact: true }).click();
  await page.locator("#scout-first-name").fill("Modal");
  await page.locator("#scout-last-name").fill("Review");
  await page.getByRole("button", { name: /Projection Specialist/ }).click();
  await page.getByRole("button", { name: "Take the call", exact: true }).click();
  await gamePage.waitForScreen("observation", 60_000);
  await page.getByRole("button", { name: "Watch the match", exact: true }).click();

  await page.getByRole("button", { name: /^Focus targets and lenses/ }).click();
  const focusSheet = page.getByRole("dialog", { name: "Choose your focus", exact: true });
  await focusSheet.getByRole("button", { name: /^Use technical lens for / }).click();
  await expect(focusSheet.getByLabel(/^technical observation lens locked for /)).toBeVisible();
  await focusSheet.getByRole("button", { name: "Close focus controls", exact: true }).click();
  await page.locator('[data-tutorial-id="observation-advance-to-standout"]:visible').click();
  await page.locator('[data-tutorial-id="observation-flag-moment"]:visible').click();
  await page.locator('[data-tutorial-id="observation-promising-reaction"]:visible').click();
  await expect(page.getByLabel("Flagged", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Confirm the first read\b/ }).click();
  const controls = page.getByTestId("mobile-observation-controls");
  await controls.getByRole("button", { name: "Next phase", exact: true }).click();
  await controls.getByRole("button", { name: "Reflect", exact: true }).click();
  await page.getByRole("group", { name: "What did this passage show?", exact: true })
    .getByRole("radio", { name: /^No reliable conclusion/ }).check();
  const completeReflection = page.getByRole("button", { name: "Complete Reflection", exact: true });
  await completeReflection.scrollIntoViewIfNeeded();
  await completeReflection.click();
  await gamePage.waitForScreen("openingDiscovery");
  await page.getByRole("button", { name: /Keep the name private/ }).click();
  await gamePage.waitForScreen("reportWriter");
  await gamePage.submitCurrentReportViaUI("note");
  await gamePage.waitForScreen("calendar");
  await expect(page.getByRole("heading", { name: /Planner/i })).toBeVisible();
}

async function readCheckpoint(page: GamePage["page"]) {
  return page.evaluate(() => {
    const game = (window as any).__GAME_STORE__.getState();
    const tutorial = (window as any).__TUTORIAL_STORE__.getState();
    return {
      screen: game.currentScreen as string,
      season: game.gameState.currentSeason as number,
      week: game.gameState.currentWeek as number,
      busy: game.isAdvancingWeek as boolean,
      guided: {
        kind: tutorial.guidedSessionKind as string,
        active: tutorial.guidedSessionActive as boolean,
        completed: tutorial.guidedSessionCompleted as boolean,
        dismissed: tutorial.dismissed as boolean,
        task: tutorial.currentGuidedTask as string | null,
        milestones: { ...tutorial.guidedMilestones } as Record<string, boolean>,
      },
    };
  });
}

test.describe("guided mentor and Planner modal ownership", () => {
  test.setTimeout(180_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("talentscout_tutorial");
      localStorage.removeItem("talentscout_player_experience");
    });
  });

  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
    test(`game confirmation keeps pointer and focus ownership at ${viewport.width}x${viewport.height}`, async ({ gamePage, page }, testInfo) => {
      await page.setViewportSize(viewport);
      await reachGuidedPlanner(gamePage);
      const before = await readCheckpoint(page);
      expect(before).toMatchObject({ screen: "calendar", week: 1, busy: false,
        guided: { kind: "discoveryHook", active: true, completed: false,
          dismissed: false, task: "advancedWeek" } });
      expect(before.guided.milestones.advancedWeek).toBe(false);

      const mentor = page.getByLabel("Mentor: Let the world answer back", { exact: true });
      const advanceWeek = page.getByRole("button", { name: "Advance Week", exact: true });
      const warning = page.getByRole("dialog", { name: "Unplanned Days", exact: true });
      await expect(mentor).toBeVisible();
      await advanceWeek.click();
      await expect(warning).toBeVisible();
      const goBack = warning.getByRole("button", { name: "Go Back", exact: true });
      const advance = warning.getByRole("button", { name: "Advance", exact: true });
      await expect(goBack).toBeFocused();
      await page.screenshot({ path: testInfo.outputPath(`mentor-warning-${viewport.width}.png`), fullPage: true });
      await expect(mentor).toBeHidden();
      // A normal pointer must reach the actual modal button, without force,
      // DOM click(), keyboard fallback, or dismissing the mentor first.
      await goBack.click({ timeout: 5_000 });
      await expect(warning).toBeHidden();
      await expect(advanceWeek).toBeFocused();
      await expect(mentor).toBeVisible();
      const afterGoBack = await readCheckpoint(page);
      expect(afterGoBack).toEqual(before);

      await advanceWeek.click();
      await expect(warning).toBeVisible();
      await expect(goBack).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(advance).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(goBack).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(warning).toBeHidden();
      await expect(advanceWeek).toBeFocused();
      await expect(mentor).toBeVisible();
      const afterEscape = await readCheckpoint(page);
      expect(afterEscape).toEqual(before);

      await advanceWeek.click();
      await expect(warning).toBeVisible();
      expect(await readCheckpoint(page)).toEqual(before);
      await page.screenshot({ path: testInfo.outputPath(`mentor-warning-confirm-${viewport.width}.png`), fullPage: true });
      await advance.click({ timeout: 5_000 });
      await expect(warning).toBeHidden();
      // Unplanned Days calls the existing confirm function directly; it is
      // already the confirmation and must enter the simulation with one click.
      await gamePage.waitForScreen("weekSimulation");
      await gamePage.settleCanonicalWeek(before.season);
      const terminal = await readCheckpoint(page);
      expect(terminal).toMatchObject({ screen: "calendar", season: before.season,
        week: before.week + 1, busy: false,
        guided: { active: false, completed: true, task: null, milestones: { advancedWeek: true } } });
      await expect(warning).toBeHidden();
      await expect(mentor).toBeHidden();
      await page.screenshot({ path: testInfo.outputPath(`mentor-week-committed-${viewport.width}.png`), fullPage: true });
      await testInfo.attach("mentor-modal-ownership-state.json", {
        body: JSON.stringify({ viewport, before, afterGoBack, afterEscape, terminal }, null, 2),
        contentType: "application/json",
      });
      gamePage.expectNoConsoleErrors();
    });
  }
});
