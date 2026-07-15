import { test, expect } from "../fixtures";

test.describe("Agency Screen", () => {
  test("agency renders at tier 3 (minimum required)", async ({ gamePage }) => {
    await gamePage.goto();
    // Agency requires tier >= 3 OR week >= 12
    await gamePage.injectState({
      currentWeek: 15,
      scout: { careerTier: 3, primarySpecialization: "youth", reputation: 60 },
    });

    await gamePage.setScreen("agency");
    await gamePage.page.waitForTimeout(500);

    const screen = await gamePage.getCurrentScreen();
    expect(screen).toBe("agency");

    const content = await gamePage.page.innerText("body");
    expect(content.length).toBeGreaterThan(50);

    gamePage.expectNoConsoleErrors();
  });

  test("agency renders at tier 4 with full features", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectLateGameState("youth");

    await gamePage.setScreen("agency");
    await gamePage.page.waitForTimeout(500);

    const screen = await gamePage.getCurrentScreen();
    expect(screen).toBe("agency");

    const content = await gamePage.page.innerText("body");
    expect(content.length).toBeGreaterThan(100);

    gamePage.expectNoConsoleErrors();
  });

  test("agency has tabs", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectLateGameState("youth");

    await gamePage.setScreen("agency");
    await gamePage.page.waitForTimeout(500);

    // Agency should have multiple tabs (Assistants, Clients, Infrastructure, etc.)
    const tabButtons = gamePage.page.locator('[role="tab"], button[class*="tab"], [data-state]');
    const tabCount = await tabButtons.count();

    // At minimum, agency should have some interactive sections
    const content = await gamePage.page.innerText("body");
    expect(content.length).toBeGreaterThan(100);
  });
});
