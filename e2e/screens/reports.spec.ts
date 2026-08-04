import { test, expect } from "../fixtures";

test.describe("Reports Screen", () => {
  test("youth reports opens on the accountability-first workspace", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectLateGameState("youth");

    await gamePage.setScreen("reportHistory");
    await gamePage.page.waitForTimeout(500);

    await expect(gamePage.page.getByTestId("reports-command-deck")).toBeVisible();
    await expect(gamePage.page.getByTestId("reports-comparison-tray")).toBeVisible();
    await expect(
      gamePage.page.getByRole("heading", { name: "Report traffic" }),
    ).toBeVisible();
    await expect(gamePage.page.getByRole("list", { name: "Report lifecycle" }).last()).toContainText("File");
    await expect(gamePage.page.getByRole("list", { name: "Report lifecycle" }).last()).toContainText("Club response");
    await expect(gamePage.page.getByRole("list", { name: "Report lifecycle" }).last()).toContainText("Consequence");

    gamePage.expectNoConsoleErrors();
  });
});
