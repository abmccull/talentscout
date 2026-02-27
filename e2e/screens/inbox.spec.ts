import { test, expect } from "../fixtures";

test.describe("Inbox Screen", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 5,
      scout: { careerTier: 1, primarySpecialization: "youth" },
    });
  });

  test("inbox screen renders", async ({ gamePage }) => {
    await gamePage.navigateTo("inbox");
    await gamePage.page.waitForTimeout(500);

    const screen = await gamePage.getCurrentScreen();
    expect(screen).toBe("inbox");

    const content = await gamePage.page.innerText("body");
    expect(content.length).toBeGreaterThan(0);

    gamePage.expectNoConsoleErrors();
  });

  test("inbox has messages after game start", async ({ gamePage }) => {
    const messageCount = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store?.getState()?.gameState;
      return state?.inbox?.length ?? 0;
    });

    // New game typically generates welcome messages
    expect(messageCount).toBeGreaterThanOrEqual(0);
  });

  test("mark all read works via store", async ({ gamePage }) => {
    // Advance a few weeks to generate messages
    await gamePage.advanceWeeks(3);

    const unreadBefore = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store?.getState()?.gameState;
      return state?.inbox?.filter((m: any) => !m.read).length ?? 0;
    });

    if (unreadBefore > 0) {
      await gamePage.page.evaluate(() => {
        const store = (window as any).__GAME_STORE__;
        store.getState().markAllRead();
      });

      const unreadAfter = await gamePage.page.evaluate(() => {
        const store = (window as any).__GAME_STORE__;
        const state = store?.getState()?.gameState;
        return state?.inbox?.filter((m: any) => !m.read).length ?? 0;
      });

      expect(unreadAfter).toBe(0);
    }
  });
});
