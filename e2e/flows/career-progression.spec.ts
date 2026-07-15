import { test, expect } from "../fixtures";

test.describe("Career Progression", () => {
  test("tier 1 scout shows correct tier", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 5,
      scout: { careerTier: 1, primarySpecialization: "youth" },
    });

    const tier = await gamePage.getScoutTier();
    expect(tier).toBe(1);

    // Career screen should show tier info
    await gamePage.navigateTo("career");
    const content = await gamePage.page.innerText("body");
    expect(content).toContain("Tier");
  });

  test("tier 2 scout has expanded career drill-downs", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectMidGameState("youth");

    const tier = await gamePage.getScoutTier();
    expect(tier).toBe(2);

    // The EA shell deliberately keeps six permanent workspaces. Network and
    // rivals are Career drill-downs rather than permanent sidebar entries.
    await gamePage.navigateTo("career");
    await gamePage.page.getByRole("tab", { name: "Track Record" }).click();
    const records = gamePage.page.getByTestId("career-record-drilldowns");
    await expect(records).toBeVisible();
    await records.getByRole("button", { name: /Network/i }).click();
    await gamePage.waitForScreen("network");

    await gamePage.setScreen("rivals");
    await gamePage.waitForScreen("rivals");
  });

  test("tier 4 scout has full feature set", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectLateGameState("youth");

    const tier = await gamePage.getScoutTier();
    expect(tier).toBe(4);

    // Leadership staff management is a Career detail, not a permanent nav item.
    await gamePage.setScreen("npcManagement");
    await gamePage.waitForScreen("npcManagement");
    await expect(gamePage.page.getByRole("heading", { name: "NPC Scout Management" })).toBeVisible();
  });

  test("career screen renders for each tier", async ({ gamePage }) => {
    test.setTimeout(120_000); // 4 sequential goto() + inject cycles
    for (const tierLevel of [1, 2, 3, 4]) {
      await gamePage.goto();
      await gamePage.injectState({
        currentWeek: 10,
        scout: { careerTier: tierLevel, primarySpecialization: "youth" },
      });

      await gamePage.setScreen("career");
      await gamePage.page.waitForTimeout(500);

      const screen = await gamePage.getCurrentScreen();
      expect(screen).toBe("career");

      gamePage.expectNoConsoleErrors();
      gamePage.clearConsoleErrors();
    }
  });
});
