import { expect, test } from "../fixtures";
import type { Locator, Page } from "@playwright/test";

function expectVisibleFocusMatcher() {
  return async (locator: Locator) => {
    await locator.focus();
    await expect(locator).toBeFocused();
    await expect.poll(
      async () => locator.evaluate((element: HTMLElement) => element.matches(":focus-visible")),
      { timeout: 2_000 },
    ).toBe(true);
  };
}

async function expectHeadingOrder(page: Page, screen: string) {
  const headings = await page.locator("#game-main :is(h1,h2,h3,h4,h5,h6)").evaluateAll((nodes: Element[]) =>
    nodes
      .map((node) => {
        const rect = (node as HTMLElement).getBoundingClientRect();
        const style = window.getComputedStyle(node as HTMLElement);
        return {
          level: Number(node.tagName.slice(1)),
          text: (node.textContent ?? "").trim(),
          visible: rect.width > 0
            && rect.height > 0
            && style.visibility !== "hidden"
            && style.display !== "none",
        };
      })
      .filter((node) => node.visible && node.text.length > 0),
  );
  expect(headings.length, `${screen} should expose visible headings`).toBeGreaterThan(0);
  expect(headings[0]?.level, `${screen} should begin with an h1 landmark`).toBe(1);
  for (let index = 1; index < headings.length; index += 1) {
    expect(
      headings[index].level - headings[index - 1].level,
      `${screen} should not skip heading levels`,
    ).toBeLessThanOrEqual(1);
  }
}

async function expectFirstViewportPresence(page: Page, locator: Locator, screen: string, viewportHeight: number) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${screen} should expose its primary object in the first viewport`).not.toBeNull();
  expect(box!.y, `${screen} primary object should start inside the first viewport`).toBeLessThan(viewportHeight);
  expect(box!.y + Math.min(box!.height, 40), `${screen} primary object should be reachable above the fold`).toBeLessThanOrEqual(viewportHeight);
}

async function expectMobileActionReach(page: Page, locator: Locator, screen: string, viewportWidth: number, viewportHeight: number) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  expect(box, `${screen} mobile action should have a bounding box`).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth);
  expect(box!.y).toBeLessThan(viewportHeight);
  expect(box!.height, `${screen} mobile action target should be touch-sized`).toBeGreaterThanOrEqual(44);
}

test.describe("Workspace semantic quality", () => {
  const focusVisible = expectVisibleFocusMatcher();

  test("desk, planner, reports, and career preserve semantic focus and mobile reach", async ({ gamePage }) => {
    const desktop = { width: 1440, height: 900 };
    const mobile = { width: 390, height: 844 };

    await gamePage.goto();
    await gamePage.injectLateGameState("youth");

    const workspaces = [
      {
        screen: "dashboard",
        headingName: /^Scouting Desk$/,
        primaryObject: () => gamePage.page.getByTestId("dashboard-command-center"),
        action: () => gamePage.page.getByTestId("dashboard-command-center").locator("button:visible").first(),
      },
      {
        screen: "calendar",
        headingName: /^Planner$/,
        primaryObject: () => gamePage.page.locator('[data-tutorial-id="calendar-grid"]'),
        action: () => gamePage.page.getByRole("button", { name: /Choose Day|Advance Week/i }).first(),
      },
      {
        screen: "reportHistory",
        headingName: /^Reports$/,
        primaryObject: () => gamePage.page.getByTestId("reports-command-deck"),
        // The honest empty archive leads directly back into evidence creation;
        // comparison controls only appear after a professional artifact exists.
        action: () => gamePage.page.getByTestId("reports-command-deck")
          .getByRole("button", { name: /^Plan the first live look$/i }),
      },
      {
        screen: "career",
        headingName: /^Test Scout$/,
        primaryObject: () => gamePage.page.getByTestId("career-command-bridge"),
        action: () => gamePage.page.getByTestId("career-command-bridge")
          .getByRole("button", { name: /^Plan next week$/i }),
      },
    ] as const;

    for (const workspace of workspaces) {
      await gamePage.page.setViewportSize(desktop);
      await gamePage.setScreen(workspace.screen);
      await expect(
        gamePage.page.getByRole("heading", { name: workspace.headingName }).first(),
      ).toBeVisible();
      await expectHeadingOrder(gamePage.page, workspace.screen);
      await expectFirstViewportPresence(
        gamePage.page,
        workspace.primaryObject(),
        workspace.screen,
        desktop.height,
      );
      await focusVisible(workspace.action());

      await gamePage.page.setViewportSize(mobile);
      await gamePage.setScreen(workspace.screen);
      await expect(
        gamePage.page.getByRole("heading", { name: workspace.headingName }).first(),
      ).toBeVisible();
      await expectFirstViewportPresence(
        gamePage.page,
        workspace.primaryObject(),
        workspace.screen,
        mobile.height,
      );
      await focusVisible(workspace.action());
      await expectMobileActionReach(
        gamePage.page,
        workspace.action(),
        workspace.screen,
        mobile.width,
        mobile.height,
      );
    }

    gamePage.expectNoConsoleErrors();
  });
});
