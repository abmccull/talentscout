import { test, expect } from "../fixtures";
import { ALL_GAME_SCREENS } from "../helpers/selectors";

const IS_YOUTH_EARLY_ACCESS = process.env.NEXT_PUBLIC_YOUTH_EARLY_ACCESS !== "false";
/**
 * Route-level smoke coverage intentionally excludes contextual details such
 * as a live observation, a selected player dossier, and a report comparison.
 * Those screens require real prerequisite state and are exercised by their
 * dedicated interaction flows. Opening them from a blank fixture is neither a
 * player path nor a useful rendering assertion.
 */
const YOUTH_EA_STABLE_SCREENS = [
  "dashboard",
  "calendar",
  "youthScouting",
  "reportHistory",
  "career",
  "internationalView",
  "settings",
  "inbox",
  "network",
  "npcManagement",
  "discoveries",
  "performance",
  "alumniDashboard",
  "finances",
  "handbook",
  "futureRoadmap",
  "achievements",
  "equipment",
  "agency",
  "training",
  "rivals",
  "seasonAwards",
] as const;
const SCREENS_UNDER_TEST = IS_YOUTH_EARLY_ACCESS
  ? YOUTH_EA_STABLE_SCREENS
  : ALL_GAME_SCREENS;

test.describe("Screen Routing — Every Screen Renders", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    // Inject late-game state so all screens are available
    await gamePage.injectLateGameState("youth");
  });

  for (const screen of SCREENS_UNDER_TEST) {
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

    for (const screen of SCREENS_UNDER_TEST) {
      await gamePage.setScreen(screen);
      await gamePage.page.waitForTimeout(100); // Minimal wait — stress test
    }

    // Give time for any deferred errors
    await gamePage.page.waitForTimeout(500);
    gamePage.expectNoConsoleErrors();
  });
});
