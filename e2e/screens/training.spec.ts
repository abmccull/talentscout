import { test, expect } from "../fixtures";

test.describe("Training Screen", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 5,
      scout: { careerTier: 1, primarySpecialization: "youth" },
    });
  });

  test("training screen renders after week 3", async ({ gamePage }) => {
    await gamePage.setScreen("training");
    await gamePage.page.waitForTimeout(500);

    const screen = await gamePage.getCurrentScreen();
    expect(screen).toBe("training");

    const content = await gamePage.page.innerText("body");
    expect(content.length).toBeGreaterThan(50);
  });

  test("training has course or skill content", async ({ gamePage }) => {
    await gamePage.setScreen("training");
    await gamePage.page.waitForTimeout(500);

    const content = await gamePage.page.innerText("body");
    const hasTrainingContent =
      content.toLowerCase().includes("skill") ||
      content.toLowerCase().includes("train") ||
      content.toLowerCase().includes("course") ||
      content.toLowerCase().includes("learn") ||
      content.toLowerCase().includes("improve");
    expect(hasTrainingContent).toBe(true);
  });

  test("no console errors", async ({ gamePage }) => {
    await gamePage.setScreen("training");
    await gamePage.page.waitForTimeout(500);

    gamePage.expectNoConsoleErrors();
  });
});
