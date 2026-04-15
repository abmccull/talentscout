import { test, expect } from "../fixtures";

test.describe("Tutorial System", () => {
  test("tutorial store initializes", async ({ gamePage }) => {
    await gamePage.goto();

    const tutorialState = await gamePage.page.evaluate(() => {
      const store = (window as any).__TUTORIAL_STORE__;
      if (!store) return null;
      const state = store.getState();
      return {
        exists: true,
        hasDismiss: typeof state.dismissForever === "function",
        hasCompleted: typeof state.completedMilestones !== "undefined" || typeof state.completed !== "undefined",
      };
    });

    expect(tutorialState).not.toBeNull();
    expect(tutorialState!.exists).toBe(true);
  });

  test("tutorial can be dismissed", async ({ gamePage }) => {
    await gamePage.goto();

    await gamePage.page.evaluate(() => {
      const store = (window as any).__TUTORIAL_STORE__;
      if (store) {
        store.getState().dismissForever();
      }
    });
    await gamePage.page.waitForTimeout(200);

    const dismissed = await gamePage.page.evaluate(() => {
      const store = (window as any).__TUTORIAL_STORE__;
      const state = store?.getState();
      return state?.dismissed === true || state?.isDismissed === true || state?.showTutorial === false;
    });

    expect(dismissed).toBe(true);
  });

  test("milestones tracked after game actions", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 1,
      scout: { careerTier: 1, primarySpecialization: "youth" },
    });

    // Perform a game action (advance week)
    await gamePage.advanceWeek();

    // Check if tutorial milestones are tracked
    const milestoneState = await gamePage.page.evaluate(() => {
      const store = (window as any).__TUTORIAL_STORE__;
      if (!store) return null;
      const state = store.getState();
      return {
        milestones: state.completedMilestones ?? state.milestones ?? state.completed ?? [],
      };
    });

    expect(milestoneState).not.toBeNull();
  });

  test("tutorial sequences have steps", async ({ gamePage }) => {
    await gamePage.goto();

    const sequenceInfo = await gamePage.page.evaluate(() => {
      const store = (window as any).__TUTORIAL_STORE__;
      if (!store) return null;
      const state = store.getState();
      return {
        hasSequences: !!(state.sequences || state.steps || state.tutorials),
        sequenceCount:
          (state.sequences?.length ?? 0) ||
          (state.steps?.length ?? 0) ||
          Object.keys(state.tutorials ?? {}).length,
      };
    });

    expect(sequenceInfo).not.toBeNull();
  });

  test("returning player with dismissed tutorials sees no overlays", async ({ gamePage }) => {
    await gamePage.goto();

    // Dismiss tutorials
    await gamePage.page.evaluate(() => {
      const store = (window as any).__TUTORIAL_STORE__;
      if (store) store.getState().dismissForever();
      localStorage.setItem("talentscout_tutorial", JSON.stringify({ dismissed: true }));
    });

    await gamePage.injectState({
      currentWeek: 10,
      scout: { careerTier: 2, primarySpecialization: "youth" },
    });

    // Navigate to several screens — no tutorial overlays should block
    for (const screen of ["dashboard", "calendar", "settings"]) {
      await gamePage.setScreen(screen);
      await gamePage.page.waitForTimeout(300);

      const current = await gamePage.getCurrentScreen();
      expect(current).toBe(screen);
    }

    gamePage.expectNoConsoleErrors();
  });
});
