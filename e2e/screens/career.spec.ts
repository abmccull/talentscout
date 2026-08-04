import { dismissCareerMomentOverlays, test, expect } from "../fixtures";

test.describe("Career Screen", () => {
  test("youth career opens on the command bridge workspace", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectLateGameState("youth");

    await gamePage.setScreen("career");
    await dismissCareerMomentOverlays(gamePage.page).catch(() => {});
    await gamePage.page.waitForTimeout(500);

    await expect(gamePage.page.getByTestId("career-command-bridge")).toBeVisible();
    await expect(
      gamePage.page.getByRole("heading", { name: "Command bridge" }),
    ).toBeVisible();

    gamePage.expectNoConsoleErrors();
  });
});
