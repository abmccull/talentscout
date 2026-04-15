import { test, expect } from "../fixtures";

test.describe("Handbook Screen", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 1,
      scout: { careerTier: 1, primarySpecialization: "youth" },
    });
  });

  test("handbook renders", async ({ gamePage }) => {
    await gamePage.setScreen("handbook");
    await gamePage.page.waitForTimeout(500);

    const screen = await gamePage.getCurrentScreen();
    expect(screen).toBe("handbook");

    const content = await gamePage.page.innerText("body");
    expect(content.length).toBeGreaterThan(50);
  });

  test("handbook has articles or sections", async ({ gamePage }) => {
    await gamePage.setScreen("handbook");
    await gamePage.page.waitForTimeout(500);

    const content = await gamePage.page.innerText("body");
    // Handbook should contain guide/help content
    const hasContent =
      content.length > 200 ||
      content.toLowerCase().includes("guide") ||
      content.toLowerCase().includes("how") ||
      content.toLowerCase().includes("scout");
    expect(hasContent).toBe(true);
  });

  test("no console errors", async ({ gamePage }) => {
    await gamePage.setScreen("handbook");
    await gamePage.page.waitForTimeout(500);

    gamePage.expectNoConsoleErrors();
  });
});
