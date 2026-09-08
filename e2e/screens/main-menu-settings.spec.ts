import { test, expect } from "../fixtures";

async function openMainMenu(gamePage: import("../fixtures").GamePage) {
  await gamePage.goto();
  const skipIntro = gamePage.page.getByRole("button", { name: "Skip intro" });
  if (await skipIntro.isVisible({ timeout: 500 }).catch(() => false)) {
    await skipIntro.click();
  }
  await expect(gamePage.page.getByTestId("main-menu-actions")).toBeVisible();
}

test.describe("Main menu settings", () => {
  test("opens a real settings menu before a career starts", async ({ gamePage }) => {
    await openMainMenu(gamePage);

    await gamePage.page.getByTestId("main-menu-settings").click();
    await gamePage.waitForScreen("settings");
    await expect(gamePage.page.getByTestId("settings-screen")).toBeVisible();
    await expect(gamePage.page.getByTestId("settings-preferences")).toBeVisible();
    await expect(gamePage.page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

    await expect(gamePage.page.getByRole("tab", { name: "Audio" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(gamePage.page.getByLabel("Mute all audio")).toBeVisible();
    await expect(gamePage.page.getByLabel("Master volume")).toBeVisible();

    await gamePage.page.getByRole("tab", { name: "Graphics" }).click();
    await expect(gamePage.page.getByRole("tab", { name: "Graphics" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(gamePage.page.getByText("Interface scale")).toBeVisible();
    await expect(gamePage.page.getByLabel("Toggle fullscreen")).toBeVisible();

    await gamePage.page.getByRole("radiogroup", { name: "fontSize" }).getByText("Large", { exact: true }).click();
    await expect(gamePage.page.locator("html")).toHaveClass(/font-large/);

    await gamePage.page.getByRole("tab", { name: "Gameplay" }).click();
    await expect(gamePage.page.getByLabel("Toggle auto-play week simulation")).toBeVisible();
    await expect(gamePage.page.getByLabel("Toggle confirm before advancing week")).toBeVisible();
    await expect(gamePage.page.getByText("Simulation speed")).toHaveCount(0);
    await expect(gamePage.page.getByText("Notifications")).toHaveCount(0);
    await expect(gamePage.page.getByText("Keyboard shortcuts")).toHaveCount(0);

    await gamePage.page.getByRole("tab", { name: "Accessibility" }).click();
    await expect(gamePage.page.getByLabel("Toggle reduced motion")).toBeVisible();
    await expect(gamePage.page.getByLabel("Colorblind mode")).toBeVisible();

    await gamePage.page.getByRole("button", { name: "Back to main menu" }).click();
    await gamePage.waitForScreen("mainMenu");
    await expect(gamePage.page.getByTestId("main-menu-actions")).toBeVisible();
  });
});
