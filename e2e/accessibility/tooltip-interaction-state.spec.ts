import type { JSHandle, Locator, Page, TestInfo } from "@playwright/test";
import { test, expect, type GamePage } from "../fixtures";

const ADVANCE_HELP = "Process all scheduled activities and advance to the next week.";
const REST_REASON = "Fatigue at 75% — rest recommended";
const ITINERARY_NAME = "Weekly itinerary days. Use left and right arrow keys to scroll.";

async function preparePlanner(gamePage: GamePage) {
  await gamePage.page.setViewportSize({ width: 1440, height: 900 });
  await gamePage.goto();
  // Existing supported new-career setup only; no evidence or private state reads.
  await gamePage.injectState({
    currentWeek: 5,
    scout: { careerTier: 1, primarySpecialization: "youth", fatigue: 75 },
  });
  await gamePage.navigateTo("calendar");
  await expect(gamePage.page.getByRole("button", { name: "Advance Week", exact: true }))
    .toBeVisible();
  await gamePage.page.mouse.move(1, 1);
}

async function attachPublicState(
  page: Page,
  targets: Array<{ label: string; locator: Locator }>,
  testInfo: TestInfo,
  name: string,
) {
  const controls = [];
  for (const { label, locator } of targets) {
    const count = await locator.count();
    const first = count === 0 ? null : await locator.first().evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        tag: element.tagName, id: element.id, role: element.getAttribute("role"),
        ariaLabel: element.getAttribute("aria-label"),
        text: element.textContent?.trim(),
        focused: document.activeElement === element,
        hovered: element.matches(":hover"),
        tabIndex: (element as HTMLElement).tabIndex,
        describedBy: element.getAttribute("aria-describedby"),
        display: style.display, visibility: style.visibility,
      };
    });
    controls.push({ label, count, first });
  }
  const tooltips = await page.locator('[role="tooltip"]').evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return {
        id: element.id, text: element.textContent?.trim(),
        display: style.display, visibility: style.visibility,
      };
    }),
  );
  await testInfo.attach(name + ".json", {
    body: JSON.stringify({ url: page.url(), controls, tooltips }, null, 2),
    contentType: "application/json",
  });
  await testInfo.attach(name + ".png", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
}

test.describe("shared Tooltip interaction source states", () => {
  test.describe.configure({ retries: 0 });

  test("focus keeps Advance Week help open after pointer departure", async ({ gamePage }, testInfo) => {
    const page = gamePage.page;
    const advance = page.getByRole("button", { name: "Advance Week", exact: true });
    const help = page.getByRole("tooltip").filter({ hasText: ADVANCE_HELP });
    try {
      await preparePlanner(gamePage);
      await advance.focus();
      await expect(advance).toBeFocused();
      await expect(help).toBeVisible();
      await advance.hover();
      await expect(help).toBeVisible();

      await page.mouse.move(1, 1);
      await expect(advance).toBeFocused();
      await expect.poll(() => advance.evaluate((element) => element.matches(":hover")))
        .toBe(false);
      // This state contract is independent of tooltip clipping/geometry.
      await expect(help, "Help must remain open while its real trigger retains focus")
        .toBeVisible();
      gamePage.expectNoConsoleErrors();
    } finally {
      await attachPublicState(page, [{ label: "Advance Week", locator: advance }],
        testInfo, "focused-after-pointer-departure");
    }
  });

  test("hover keeps Advance Week help open after real keyboard Tab", async ({ gamePage }, testInfo) => {
    const page = gamePage.page;
    const advance = page.getByRole("button", { name: "Advance Week", exact: true });
    const itinerary = page.getByRole("region", { name: ITINERARY_NAME, exact: true });
    const help = page.getByRole("tooltip").filter({ hasText: ADVANCE_HELP });
    try {
      await preparePlanner(gamePage);
      await expect(itinerary).toBeVisible();
      await advance.focus();
      await advance.hover();
      await expect(advance).toBeFocused();
      await expect(help).toBeVisible();

      // Real keyboard navigation, without moving the pointer or injecting focus events.
      await page.keyboard.press("Tab");
      await expect(itinerary,
        "Public precondition: the existing itinerary region follows Advance Week in Tab order")
        .toBeFocused();
      await expect(advance).not.toBeFocused();
      await expect.poll(() => advance.evaluate((element) => element.matches(":hover")),
        { message: "The pointer must still hover the actual Advance Week trigger" })
        .toBe(true);
      await expect(help, "Help must remain open while its real trigger remains hovered")
        .toBeVisible();
      gamePage.expectNoConsoleErrors();
    } finally {
      await attachPublicState(page, [
        { label: "Advance Week", locator: advance },
        { label: "Keyboard-next itinerary region", locator: itinerary },
      ], testInfo, "hovered-after-keyboard-focus-departure");
    }
  });

  test("first Escape dismisses hovered reason before second Escape returns to Desk", async ({ gamePage }, testInfo) => {
    const page = gamePage.page;
    const preview = page.getByRole("button", { name: /^Week Preview\b/ });
    const applyAll = page.getByRole("button", { name: "Apply All", exact: true });
    const calendarNav = page.locator('[data-tutorial-id="nav-calendar"]');
    const deskNav = page.locator('[data-tutorial-id="nav-dashboard"]');
    const reason = page.getByTestId("planner-scroll-region")
      .getByText(REST_REASON, { exact: true }).first();
    const help = page.getByRole("tooltip").filter({ hasText: REST_REASON });
    let escapeObserver: JSHandle<{
      observations: Array<{
        key: string; eventPhase: number; defaultPrevented: boolean;
        cancelBubble: boolean; targetText: string | null;
      }>;
      cleanup: () => void;
    }> | null = null;
    try {
      await preparePlanner(gamePage);
      await expect(calendarNav).toHaveAttribute("aria-current", "page");
      await expect(preview, "Public precondition: the actual fatigue Week Preview exists")
        .toBeVisible();
      if (await preview.getByText("Show", { exact: true }).isVisible()) await preview.click();
      await expect(page.getByText("Suggested Schedule", { exact: true })).toBeVisible();
      await expect(reason, "Public precondition: the actual fatigue reason span exists")
        .toBeVisible();
      await expect(applyAll).toBeVisible();
      await applyAll.focus();
      await expect(applyAll).toBeFocused();
      await reason.hover();
      await expect(applyAll, "Hover must preserve the existing focused public control")
        .toBeFocused();
      await expect(help).toBeVisible();

      // Passively record actual native Escape in capture phase. Event flags
      // depend on listener ordering and are diagnostic, not the UI contract.
      escapeObserver = await page.evaluateHandle(() => {
        const observations: Array<{
          key: string; eventPhase: number; defaultPrevented: boolean;
          cancelBubble: boolean; targetText: string | null;
        }> = [];
        const observe = (event: KeyboardEvent) => {
          if (event.key !== "Escape") return;
          observations.push({
            key: event.key,
            eventPhase: event.eventPhase,
            defaultPrevented: event.defaultPrevented,
            cancelBubble: event.cancelBubble,
            targetText: event.target instanceof Element ? event.target.textContent?.trim() ?? null : null,
          });
        };
        window.addEventListener("keydown", observe, { capture: true, passive: true });
        return {
          observations,
          cleanup: () => window.removeEventListener("keydown", observe, true),
        };
      });
      await page.keyboard.press("Escape");

      // Check actual UI priority first. The original product routes to Desk,
      // so its preceding failure must reach this retention/focus contract.
      await expect(calendarNav,
        "First Escape must dismiss visible help before the ordinary Escape-to-Desk shortcut")
        .toHaveAttribute("aria-current", "page");
      await expect(applyAll, "Tooltip dismissal must preserve the existing keyboard focus")
        .toBeFocused();
      await expect.poll(() => reason.evaluate((element) => element.matches(":hover")))
        .toBe(true);
      await expect(help,
        "First Escape must dismiss hover-only help while its actual reason remains hovered")
        .toHaveCount(0);
      await attachPublicState(page, [
        { label: "Calendar navigation after first Escape", locator: calendarNav },
        { label: "Existing focused Apply All control", locator: applyAll },
        { label: "Actual fatigue reason span", locator: reason },
      ], testInfo, "first-escape-tooltip-dismissal-and-planner-retention");

      // A dismissed Tooltip must release the existing screen shortcut.
      // Use a second real key, without moving hover or focus between presses.
      await page.keyboard.press("Escape");
      await expect(deskNav,
        "Second Escape must retain the existing return-to-Desk behavior after help dismissal")
        .toHaveAttribute("aria-current", "page");
      await expect(calendarNav).not.toHaveAttribute("aria-current", "page");
      await expect(help).toHaveCount(0);
      gamePage.expectNoConsoleErrors();
    } finally {
      if (escapeObserver) {
        const observations = await escapeObserver.evaluate((state) => state.observations);
        await escapeObserver.evaluate((state) => state.cleanup());
        await escapeObserver.dispose();
        await testInfo.attach("native-capture-escape-observations.json", {
          body: JSON.stringify({ observations, flagsAreDiagnosticOnly: true }, null, 2),
          contentType: "application/json",
        });
      }
      await attachPublicState(page, [
        { label: "Calendar navigation", locator: calendarNav },
        { label: "Desk navigation", locator: deskNav },
        { label: "Week Preview", locator: preview },
        { label: "Existing focused Apply All control", locator: applyAll },
        { label: "Actual fatigue reason span", locator: reason },
      ], testInfo, "first-tooltip-then-ordinary-screen-escape");
    }
  });
});
