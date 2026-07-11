import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures";
import { SELECTORS } from "../helpers/selectors";

async function expectNoBlockingViolations(page: Page, state: string) {
  const result = await new AxeBuilder({ page }).analyze();
  const blocking = result.violations
    .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      targets: violation.nodes.map((node) => node.target.join(" ")),
    }));

  expect(blocking, `${state} has serious or critical accessibility violations`).toEqual([]);
}

test.describe("Youth Early Access accessibility", () => {
  test.setTimeout(120_000);

  test("mobile main menu and creation entry have no blocking axe violations", async ({ gamePage }) => {
    await gamePage.page.setViewportSize({ width: 390, height: 844 });
    await gamePage.goto();
    await gamePage.page.locator(SELECTORS.newGameButton).first().waitFor({ state: "visible" });

    await expectNoBlockingViolations(gamePage.page, "mobile main menu");

    await gamePage.page.locator(SELECTORS.newGameButton).first().click();
    await expect(
      gamePage.page.getByRole("heading", { name: "Your Identity" }),
    ).toBeVisible();
    await expectNoBlockingViolations(gamePage.page, "mobile identity step");
  });

  test("mobile dashboard and calendar have no blocking axe violations", async ({ gamePage }) => {
    await gamePage.page.setViewportSize({ width: 390, height: 844 });
    await gamePage.goto();
    await gamePage.startNewGame({
      firstName: "Access",
      lastName: "Scout",
      specialization: "youth",
    });
    await expect(gamePage.page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await gamePage.page.waitForTimeout(1_000);
    const achievementDismiss = gamePage.page.getByRole("button", {
      name: "Dismiss achievement notification",
    });
    if (await achievementDismiss.isVisible({ timeout: 500 }).catch(() => false)) {
      await achievementDismiss.click();
      await gamePage.page.waitForTimeout(250);
    }

    await expectNoBlockingViolations(gamePage.page, "mobile dashboard");

    await gamePage.page.getByRole("button", { name: "Open navigation menu" }).click();
    await gamePage.navigateTo("calendar");
    await expectNoBlockingViolations(gamePage.page, "mobile calendar");
  });

  test("the six core workspaces have no blocking axe violations on desktop or mobile", async ({ gamePage }) => {
    const workspaces = [
      ["dashboard", "Scouting Desk"],
      ["calendar", "Planner"],
      ["youthScouting", "Prospects"],
      ["reportHistory", "Reports"],
      ["internationalView", "World"],
      ["career", "Career"],
    ] as const;

    await gamePage.goto();
    await gamePage.injectLateGameState("youth");

    for (const viewport of [
      { name: "desktop", width: 1440, height: 900 },
      { name: "mobile", width: 390, height: 844 },
    ] as const) {
      await gamePage.page.setViewportSize({ width: viewport.width, height: viewport.height });

      for (const [screen, label] of workspaces) {
        await gamePage.setScreen(screen);
        await gamePage.page.waitForTimeout(250);
        await expectNoBlockingViolations(
          gamePage.page,
          `${viewport.name} ${label}`,
        );
      }
    }
  });
});
