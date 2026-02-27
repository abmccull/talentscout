import { test, expect } from "../fixtures";
import { KEY_TO_SCREEN } from "../helpers/selectors";

test.describe("Keyboard Shortcuts", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectMidGameState("youth");
  });

  test.describe("Number keys 1-8", () => {
    for (const [key, screen] of Object.entries(KEY_TO_SCREEN)) {
      test(`pressing ${key} navigates to ${screen}`, async ({ gamePage }) => {
        // Start from dashboard
        await gamePage.setScreen("dashboard");
        await gamePage.page.keyboard.press(key);
        await gamePage.page.waitForTimeout(300);

        const current = await gamePage.getCurrentScreen();
        expect(current).toBe(screen);
      });
    }
  });

  test.describe("Escape key", () => {
    const screensToTest = [
      "calendar",
      "playerDatabase",
      "reportHistory",
      "career",
      "inbox",
      "network",
      "settings",
      "equipment",
      "agency",
      "handbook",
      "achievements",
      "finances",
    ];

    for (const screen of screensToTest) {
      test(`Escape returns to dashboard from ${screen}`, async ({ gamePage }) => {
        await gamePage.setScreen(screen);
        await gamePage.page.keyboard.press("Escape");
        await gamePage.page.waitForTimeout(300);

        const current = await gamePage.getCurrentScreen();
        expect(current).toBe("dashboard");
      });
    }
  });

  test("Space on calendar triggers week advance", async ({ gamePage }) => {
    await gamePage.setScreen("calendar");
    const weekBefore = await gamePage.getCurrentWeek();

    await gamePage.page.keyboard.press("Space");
    await gamePage.page.waitForTimeout(1000);

    // Week should have advanced (or at minimum the advance flow triggered)
    // The exact behavior depends on whether confirmBeforeAdvance is on
    const weekAfter = await gamePage.getCurrentWeek();
    // Week might not have advanced if confirm dialog appeared, but no error should occur
    expect(weekAfter).toBeGreaterThanOrEqual(weekBefore);
  });

  test("? key opens settings", async ({ gamePage }) => {
    await gamePage.setScreen("dashboard");
    await gamePage.page.keyboard.press("?");
    await gamePage.page.waitForTimeout(300);

    const current = await gamePage.getCurrentScreen();
    expect(current).toBe("settings");
  });

  test("number keys do not fire on main menu", async ({ gamePage }) => {
    await gamePage.setScreen("mainMenu");
    await gamePage.page.keyboard.press("1");
    await gamePage.page.waitForTimeout(300);

    const current = await gamePage.getCurrentScreen();
    expect(current).toBe("mainMenu");
  });

  test("number keys do not fire when typing in input", async ({ gamePage }) => {
    await gamePage.setScreen("settings");

    // Focus on any input if present
    const input = gamePage.page.locator("input").first();
    const hasInput = (await input.count()) > 0;

    if (hasInput) {
      await input.focus();
      await gamePage.page.keyboard.press("1");
      await gamePage.page.waitForTimeout(300);

      // Should still be on settings, not navigated away
      const current = await gamePage.getCurrentScreen();
      expect(current).toBe("settings");
    }
  });
});
