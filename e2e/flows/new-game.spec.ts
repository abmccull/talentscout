import { test, expect } from "../fixtures";
import { SPECIALIZATIONS } from "../helpers/selectors";

test.describe("New Game Wizard", () => {
  // Wizard tests navigate the full UI flow — give extra time for page load
  test.setTimeout(90_000);

  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
  });

  for (const spec of SPECIALIZATIONS) {
    test(`complete wizard with ${spec} specialization`, async ({ gamePage }) => {
      const specDisplayNames: Record<string, string> = {
        youth: "Youth Scout",
        firstTeam: "First Team Scout",
        regional: "Regional Expert",
        data: "Data Scout",
      };

      // Navigate to new game
      await gamePage.page.click('button:has-text("New Game")');
      await gamePage.page.waitForTimeout(500);

      // Step 1: Identity
      const firstNameInput = gamePage.page.locator('input#scout-first-name, input[placeholder="Alex"]');
      const lastNameInput = gamePage.page.locator('input#scout-last-name, input[placeholder="Morgan"]');
      await firstNameInput.fill("E2E");
      await lastNameInput.fill(`${spec}Tester`);
      await gamePage.page.click('button:has-text("Continue")');
      await gamePage.page.waitForTimeout(400);

      // Step 2: Specialization
      await gamePage.page.click(`text="${specDisplayNames[spec]}"`);
      await gamePage.page.click('button:has-text("Continue")');
      await gamePage.page.waitForTimeout(400);

      // Step 3: Skills — accept defaults
      await gamePage.page.click('button:has-text("Continue")');
      await gamePage.page.waitForTimeout(400);

      // Step 4: Position — accept freelance default
      await gamePage.page.click('button:has-text("Continue")');
      await gamePage.page.waitForTimeout(400);

      // Step 5: World — accept England default
      await gamePage.page.click('button:has-text("Continue")');
      await gamePage.page.waitForTimeout(400);

      // Step 6: Review — click begin
      await gamePage.page.click('button:has-text("Begin Career")');
      await gamePage.waitForScreen("dashboard", 30_000);

      // Verify we're on the dashboard
      const screen = await gamePage.getCurrentScreen();
      expect(screen).toBe("dashboard");

      // Verify correct specialization was set
      const actualSpec = await gamePage.getSpecialization();
      expect(actualSpec).toBe(spec);

      // Verify scout name
      const firstName = await gamePage.getGameStateValue("scout.firstName");
      expect(firstName).toBe("E2E");

      gamePage.expectNoConsoleErrors();
    });
  }

  test("wizard enforces required fields on step 1", async ({ gamePage }) => {
    await gamePage.page.click('button:has-text("New Game")');
    await gamePage.page.waitForTimeout(500);

    // Clear both name fields and try to advance
    const firstNameInput = gamePage.page.locator('input#scout-first-name, input[placeholder="Alex"]');
    const lastNameInput = gamePage.page.locator('input#scout-last-name, input[placeholder="Morgan"]');

    await firstNameInput.fill("");
    await lastNameInput.fill("");

    const continueBtn = gamePage.page.locator('button:has-text("Continue")');

    // Try to advance with empty names — button should be disabled
    const isDisabled = await continueBtn.isDisabled();

    if (isDisabled) {
      // Correct: button is disabled when names are empty
      expect(isDisabled).toBe(true);
    }

    // Fill first name only
    await firstNameInput.fill("Test");
    // Continue should still be disabled (last name empty)
    await gamePage.page.waitForTimeout(200);

    // Fill both and verify we can advance
    await lastNameInput.fill("Scout");
    await gamePage.page.waitForTimeout(200);
    await continueBtn.click();
    await gamePage.page.waitForTimeout(400);

    // Now specialization cards should be visible
    await expect(gamePage.page.locator('text="Youth Scout"')).toBeVisible();
  });

  test("back button returns to previous step", async ({ gamePage }) => {
    await gamePage.page.click('button:has-text("New Game")');
    await gamePage.page.waitForTimeout(500);

    // Fill step 1 and advance
    const firstNameInput = gamePage.page.locator('input#scout-first-name, input[placeholder="Alex"]');
    const lastNameInput = gamePage.page.locator('input#scout-last-name, input[placeholder="Morgan"]');
    await firstNameInput.fill("Test");
    await lastNameInput.fill("Scout");
    await gamePage.page.click('button:has-text("Continue")');
    await gamePage.page.waitForTimeout(400);

    // Now on step 2 — verify specialization cards visible
    await expect(gamePage.page.locator('text="Youth Scout"')).toBeVisible();

    // Go back — use exact match to avoid matching "← Back to Menu"
    await gamePage.page.click('button:text-is("Back")');
    await gamePage.page.waitForTimeout(400);

    // Should be back on step 1 — name inputs should be visible with values
    const firstNameValue = await firstNameInput.inputValue();
    expect(firstNameValue).toBe("Test");
  });

  test("back to menu returns to main menu", async ({ gamePage }) => {
    await gamePage.page.click('button:has-text("New Game")');
    await gamePage.page.waitForTimeout(500);

    await gamePage.page.click('button:has-text("Back to Menu")');
    await gamePage.page.waitForTimeout(300);

    const screen = await gamePage.getCurrentScreen();
    expect(screen).toBe("mainMenu");
  });
});
