import { test, expect } from "../fixtures";
import { ALL_GAME_SCREENS } from "../helpers/selectors";

test.describe("Screen Routing — Every Screen Renders", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    // Inject late-game state so all screens are available
    await gamePage.injectLateGameState("youth");
  });

  for (const screen of ALL_GAME_SCREENS) {
    test(`${screen} renders without crash`, async ({ gamePage }) => {
      gamePage.clearConsoleErrors();

      await gamePage.setScreen(screen);
      await gamePage.page.waitForTimeout(500);

      // Verify we're on the expected screen
      const current = await gamePage.getCurrentScreen();
      expect(current).toBe(screen);

      // Verify the page has content (not a blank screen)
      const bodyText = await gamePage.page.locator("body").innerText();
      expect(bodyText.length).toBeGreaterThan(0);

      // Verify no JS errors
      gamePage.expectNoConsoleErrors();
    });
  }

  test("rapid screen switching does not crash", async ({ gamePage }) => {
    gamePage.clearConsoleErrors();

    for (const screen of ALL_GAME_SCREENS) {
      await gamePage.setScreen(screen);
      await gamePage.page.waitForTimeout(100); // Minimal wait — stress test
    }

    // Give time for any deferred errors
    await gamePage.page.waitForTimeout(500);
    gamePage.expectNoConsoleErrors();
  });
});
