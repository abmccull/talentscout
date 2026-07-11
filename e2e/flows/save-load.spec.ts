import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures";

async function readSaveSlots(page: Page) {
  return page.evaluate(async () => {
    const store = (window as any).__GAME_STORE__;
    await store.getState().refreshSaveSlots();
    return store.getState().saveSlots.map((slot: any) => ({
      slot: slot.slot,
      name: slot.name,
      week: slot.week,
      season: slot.season,
      source: slot.source,
    }));
  });
}

test.describe("Save and Load", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 4,
      scout: {
        firstName: "Save",
        lastName: "Tester",
        primarySpecialization: "youth",
      },
    });
    await gamePage.navigateTo("settings");
  });

  test("quick saves use manual slots 1 through 5", async ({ gamePage }) => {
    for (let i = 0; i < 5; i++) {
      await gamePage.page.getByRole("button", { name: /^Quick Save$/ }).click();
      await expect(gamePage.page.getByText(/Saved to slot \d/)).toBeVisible();
    }

    const saveSlots = await readSaveSlots(gamePage.page);
    const manualSlots = saveSlots
      .filter((slot: { slot: number }) => slot.slot > 0)
      .map((slot: { slot: number }) => slot.slot)
      .sort((left: number, right: number) => left - right);

    expect(manualSlots).toEqual([1, 2, 3, 4, 5]);
    expect(saveSlots.some((slot: { slot: number }) => slot.slot === 0)).toBe(false);

    gamePage.expectNoConsoleErrors();
  });

  test("autosave stays in slot 0 while manual saves load and delete independently", async ({ gamePage }) => {
    const manualWeek = await gamePage.getCurrentWeek();

    await gamePage.page.getByRole("button", { name: /^Quick Save$/ }).click();
    await expect(gamePage.page.getByText("Saved to slot 1")).toBeVisible();

    await gamePage.navigateTo("calendar");
    await gamePage.advanceCanonicalWeek();
    const autosavedWeek = await gamePage.getCurrentWeek();
    expect(autosavedWeek).toBeGreaterThan(manualWeek);

    await gamePage.navigateTo("settings");

    const saveSlots = await readSaveSlots(gamePage.page);
    const manualSlot = saveSlots.find((slot: { slot: number }) => slot.slot === 1);
    const autosaveSlot = saveSlots.find((slot: { slot: number }) => slot.slot === 0);

    expect(manualSlot).toMatchObject({ slot: 1, week: manualWeek });
    expect(autosaveSlot).toMatchObject({ slot: 0, week: autosavedWeek });

    await gamePage.page.getByRole("button", { name: /^Manage Saves$/ }).click();
    const loadDialog = gamePage.page.getByRole("dialog", { name: "Save and Load Game" });
    await loadDialog.getByRole("tab", { name: "Load" }).click();
    await loadDialog.getByRole("button", { name: "Load save slot 1" }).click();
    await loadDialog.getByRole("button", { name: "Confirm" }).click();
    await gamePage.waitForScreen("dashboard");
    await gamePage.page.waitForFunction(
      (week) => (window as any).__GAME_STORE__?.getState()?.gameState?.currentWeek === week,
      manualWeek,
    );
    expect(await gamePage.getCurrentWeek()).toBe(manualWeek);

    await gamePage.navigateTo("settings");
    await gamePage.page.getByRole("button", { name: /^Manage Saves$/ }).click();
    const deleteDialog = gamePage.page.getByRole("dialog", { name: "Save and Load Game" });
    await deleteDialog.getByRole("button", { name: "Delete save slot 1" }).click();
    await deleteDialog.getByRole("button", { name: "Confirm" }).click();

    const saveSlotsAfterDelete = await readSaveSlots(gamePage.page);
    expect(saveSlotsAfterDelete.some((slot: { slot: number }) => slot.slot === 1)).toBe(false);
    expect(saveSlotsAfterDelete.some((slot: { slot: number }) => slot.slot === 0)).toBe(true);

    gamePage.expectNoConsoleErrors();
  });

  test("other-specialization saves stay preserved, hidden, and rejected by the load boundary", async ({ gamePage }) => {
    const result = await gamePage.page.evaluate(async () => {
      const store = (window as any).__GAME_STORE__;
      const youthState = structuredClone(store.getState().gameState);
      const legacyState = {
        ...youthState,
        scout: {
          ...youthState.scout,
          primarySpecialization: "firstTeam",
        },
      };

      store.getState().loadGame(legacyState);
      await store.getState().saveToSlot(2, "Preserved First Team Save");
      store.getState().loadGame(youthState);
      await store.getState().refreshSaveSlots();

      let error = "";
      try {
        await store.getState().loadFromSlot(2);
      } catch (loadError) {
        error = loadError instanceof Error ? loadError.message : String(loadError);
      }

      return {
        error,
        specialization: store.getState().gameState?.scout?.primarySpecialization,
      };
    });

    expect(result.specialization).toBe("youth");
    expect(result.error).toContain("not available in Youth Scout Early Access");

    await gamePage.navigateTo("settings");
    await gamePage.page.getByRole("button", { name: /^Manage Saves$/ }).click();
    const saveDialog = gamePage.page.getByRole("dialog", { name: "Save and Load Game" });
    await expect(saveDialog.getByText(/preserved and hidden/i)).toBeVisible();
    await expect(saveDialog.getByText("Slot 2 — Preserved full-game save")).toBeVisible();

    gamePage.expectNoConsoleErrors();
  });
});
