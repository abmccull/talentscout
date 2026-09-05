import { test, expect } from "../fixtures";

test.describe("Manual save failure recovery", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({ currentWeek: 4, scout: { firstName: "Save", lastName: "Retry", primarySpecialization: "youth" } });
    await gamePage.navigateTo("settings");
    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const originalSave = store.getState().saveToSlot;
      let attempts = 0;
      store.setState({ saveToSlot: async (slot: number, name: string) => {
        attempts += 1;
        if (attempts === 1) throw new Error("Storage is temporarily unavailable.");
        return originalSave(slot, name);
      } });
    });
  });

  test("quick save exposes failure and retries the same slot", async ({ gamePage }) => {
    await gamePage.page.getByRole("button", { name: "Quick Save", exact: true }).click();
    await expect(gamePage.page.getByRole("alert").filter({ hasText: "Could not save to slot 1" })).toContainText("Could not save to slot 1");
    await expect(gamePage.page.getByText("Saved to slot 1", { exact: true })).toHaveCount(0);
    await gamePage.page.getByRole("button", { name: "Retry save", exact: true }).click();
    await expect(gamePage.page.getByText("Saved to slot 1", { exact: true })).toBeVisible();
    await expect(gamePage.page.getByRole("button", { name: "Retry save", exact: true })).toHaveCount(0);
    gamePage.expectNoConsoleErrors();
  });

  test("save modal preserves failure until the player retries", async ({ gamePage }) => {
    await gamePage.page.getByRole("button", { name: "Manage Saves", exact: true }).click();
    const dialog = gamePage.page.getByRole("dialog", { name: "Save and Load Game" });
    await dialog.getByRole("button", { name: "Save", exact: true }).first().click();
    await expect(dialog.getByRole("alert")).toContainText("Could not save to slot 1");
    await expect(dialog.getByText("Saved", { exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Retry save", exact: true }).click();
    await expect(dialog.getByText("Saved", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    gamePage.expectNoConsoleErrors();
  });
});
