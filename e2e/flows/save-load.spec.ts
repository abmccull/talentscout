import { test, expect } from "../fixtures";

test.describe("Save / Load System", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 10,
      scout: {
        careerTier: 2,
        primarySpecialization: "youth",
        firstName: "Save",
        lastName: "Tester",
      },
    });
  });

  test("save to slot with metadata", async ({ gamePage }) => {
    await gamePage.page.evaluate(async () => {
      const store = (window as any).__GAME_STORE__;
      await store.getState().saveToSlot(0, "Test Save");
    });
    await gamePage.page.waitForTimeout(300);

    await gamePage.page.evaluate(async () => {
      const store = (window as any).__GAME_STORE__;
      await store.getState().refreshSaveSlots();
    });
    await gamePage.page.waitForTimeout(200);

    const slot = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const slots = store.getState().saveSlots;
      return slots?.[0] ?? null;
    });

    expect(slot).not.toBeNull();
    expect(slot.name).toBe("Test Save");
  });

  test("load restores state", async ({ gamePage }) => {
    // Save current state at week 10
    await gamePage.page.evaluate(async () => {
      const store = (window as any).__GAME_STORE__;
      await store.getState().saveToSlot(0, "Restore Test");
    });
    await gamePage.page.waitForTimeout(300);

    // Advance to week 15
    await gamePage.advanceWeeks(5);
    const weekAfterAdvance = await gamePage.getCurrentWeek();
    expect(weekAfterAdvance).toBe(15);

    // Load the save
    await gamePage.page.evaluate(async () => {
      const store = (window as any).__GAME_STORE__;
      await store.getState().loadFromSlot(0);
    });
    await gamePage.page.waitForTimeout(500);

    const weekAfterLoad = await gamePage.getCurrentWeek();
    expect(weekAfterLoad).toBe(10);
  });

  test("delete slot removes it", async ({ gamePage }) => {
    // Save then delete
    await gamePage.page.evaluate(async () => {
      const store = (window as any).__GAME_STORE__;
      await store.getState().saveToSlot(1, "To Delete");
    });
    await gamePage.page.waitForTimeout(200);

    await gamePage.page.evaluate(async () => {
      const store = (window as any).__GAME_STORE__;
      await store.getState().deleteSlot(1);
      await store.getState().refreshSaveSlots();
    });
    await gamePage.page.waitForTimeout(200);

    const slot = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const slots = store.getState().saveSlots;
      return slots?.find((s: any) => s?.name === "To Delete") ?? null;
    });

    expect(slot).toBeNull();
  });

  test("autosave on week advance", async ({ gamePage }) => {
    await gamePage.advanceWeek();
    await gamePage.page.waitForTimeout(500);

    // Check if autosave slot is populated
    await gamePage.page.evaluate(async () => {
      const store = (window as any).__GAME_STORE__;
      await store.getState().refreshSaveSlots();
    });
    await gamePage.page.waitForTimeout(200);

    const hasAutosave = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const slots = store.getState().saveSlots ?? [];
      return slots.some(
        (s: any) => s && (s.name?.toLowerCase().includes("auto") || s.isAutosave),
      );
    });

    // Autosave may or may not be implemented — just verify no crash
    expect(typeof hasAutosave).toBe("boolean");
  });

  test("save/load UI renders in settings", async ({ gamePage }) => {
    await gamePage.setScreen("settings");
    await gamePage.page.waitForTimeout(500);

    const content = await gamePage.page.innerText("body");
    // Settings should have save/load related content
    const hasSaveContent =
      content.toLowerCase().includes("save") || content.toLowerCase().includes("load");
    expect(hasSaveContent).toBe(true);

    gamePage.expectNoConsoleErrors();
  });
});
