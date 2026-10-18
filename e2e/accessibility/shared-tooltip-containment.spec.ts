import type { Locator, TestInfo } from "@playwright/test";
import { test, expect, type GamePage } from "../fixtures";

const HELP = "Process all scheduled activities and advance to the next week.";
const MARGIN = 8;

async function preparePlanner(gamePage: GamePage, width: number, scale: "Medium" | "Large") {
  await gamePage.page.setViewportSize({ width, height: 900 });
  await gamePage.goto();
  // Existing deterministic fixture setup only; behavior is exercised through real controls.
  await gamePage.injectState({
    currentWeek: 5,
    scout: { careerTier: 1, primarySpecialization: "youth" },
  });
  await gamePage.navigateTo("settings");
  await gamePage.page.getByRole("tab", { name: "Graphics", exact: true }).click();
  const scaleOption = gamePage.page.getByRole("radiogroup", { name: "fontSize", exact: true })
    .getByRole("radio", { name: scale, exact: true });
  await scaleOption.locator("..").click();
  await expect(scaleOption).toBeChecked();
  await expect(gamePage.page.locator("html")).toHaveClass(
    new RegExp("font-" + scale.toLowerCase()),
  );
  await gamePage.navigateTo("calendar");
  await expect(gamePage.page.getByRole("button", { name: "Advance Week", exact: true })).toBeVisible();
  await gamePage.page.mouse.move(1, 1);
}

async function geometry(trigger: Locator) {
  return trigger.evaluate((element, content) => {
    const card = [...document.querySelectorAll<HTMLElement>('[role="tooltip"]')]
      .find((candidate) => candidate.textContent?.trim() === content);
    if (!card) return null;
    const box = (rect: DOMRect) => ({
      left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
      width: rect.width, height: rect.height,
    });
    const viewport = {
      left: 0, top: 0, right: document.documentElement.clientWidth,
      bottom: window.innerHeight,
    };
    const triggerBounds = { ...viewport };
    const triggerAncestors: Array<{
      tag: string; id: string; testId: string | null;
      overflowX: string; overflowY: string;
      left: number; top: number; right: number; bottom: number;
    }> = [];
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      const clipsX = /^(auto|scroll|hidden|clip|overlay)$/.test(style.overflowX)
        || /(?:^|\s)(paint|strict|content)(?:\s|$)/.test(style.contain);
      const clipsY = /^(auto|scroll|hidden|clip|overlay)$/.test(style.overflowY)
        || /(?:^|\s)(paint|strict|content)(?:\s|$)/.test(style.contain);
      if (!clipsX && !clipsY) continue;
      const rect = ancestor.getBoundingClientRect();
      const sx = ancestor.offsetWidth ? rect.width / ancestor.offsetWidth : 1;
      const sy = ancestor.offsetHeight ? rect.height / ancestor.offsetHeight : 1;
      const left = rect.left + ancestor.clientLeft * sx;
      const top = rect.top + ancestor.clientTop * sy;
      const right = left + ancestor.clientWidth * sx;
      const bottom = top + ancestor.clientHeight * sy;
      if (clipsX) {
        triggerBounds.left = Math.max(triggerBounds.left, left);
        triggerBounds.right = Math.min(triggerBounds.right, right);
      }
      if (clipsY) {
        triggerBounds.top = Math.max(triggerBounds.top, top);
        triggerBounds.bottom = Math.min(triggerBounds.bottom, bottom);
      }
      triggerAncestors.push({
        tag: ancestor.tagName, id: ancestor.id,
        testId: ancestor.getAttribute("data-testid"),
        overflowX: style.overflowX, overflowY: style.overflowY,
        left, top, right, bottom,
      });
    }
    const bounds = { ...viewport };
    const cardAncestors: Array<{ id: string; overflowX: string; overflowY: string }> = [];
    for (let parent = card.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      const clipsX = /^(auto|scroll|hidden|clip|overlay)$/.test(style.overflowX);
      const clipsY = /^(auto|scroll|hidden|clip|overlay)$/.test(style.overflowY);
      if (!clipsX && !clipsY) continue;
      const rect = parent.getBoundingClientRect();
      if (clipsX) {
        bounds.left = Math.max(bounds.left, rect.left + parent.clientLeft);
        bounds.right = Math.min(bounds.right, rect.left + parent.clientLeft + parent.clientWidth);
      }
      if (clipsY) {
        bounds.top = Math.max(bounds.top, rect.top + parent.clientTop);
        bounds.bottom = Math.min(bounds.bottom, rect.top + parent.clientTop + parent.clientHeight);
      }
      cardAncestors.push({ id: parent.id, overflowX: style.overflowX, overflowY: style.overflowY });
    }
    return {
      url: location.href, viewport, bounds, cardAncestors, triggerBounds, triggerAncestors,
      trigger: box(element.getBoundingClientRect()), card: box(card.getBoundingClientRect()),
      content: card.textContent?.trim(), id: card.id,
      describedBy: element.getAttribute("aria-describedby"),
      pointerEvents: getComputedStyle(card).pointerEvents,
      clientWidth: card.clientWidth, scrollWidth: card.scrollWidth,
      clientHeight: card.clientHeight, scrollHeight: card.scrollHeight,
      fontClass: document.documentElement.className,
    };
  }, HELP);
}

async function expectContained(trigger: Locator) {
  await expect.poll(async () => {
    const result = await geometry(trigger);
    if (!result) return false;
    return result.card.left >= result.bounds.left + MARGIN - 0.5
      && result.card.right <= result.bounds.right - MARGIN + 0.5
      && result.card.top >= result.bounds.top + MARGIN - 0.5
      && result.card.bottom <= result.bounds.bottom - MARGIN + 0.5
      && result.scrollWidth <= result.clientWidth + 1
      && result.scrollHeight <= result.clientHeight + 1;
  }, { message: "Full Planner help must fit its viewport AND the card's actual clipping ancestors" }).toBe(true);
  const result = await geometry(trigger);
  expect(result?.content).toBe(HELP);
  expect(result?.triggerAncestors.some((ancestor) => ancestor.id === "game-main")).toBe(true);
  expect(result?.pointerEvents).toBe("none");
  return result;
}

async function attachEvidence(gamePage: GamePage, trigger: Locator, testInfo: TestInfo, label: string) {
  await testInfo.attach(label + "-geometry", {
    body: JSON.stringify(await geometry(trigger), null, 2),
    contentType: "application/json",
  });
  await testInfo.attach(label + "-render", {
    body: await gamePage.page.screenshot(),
    contentType: "image/png",
  });
}

test.describe("Shared tooltip public containment", () => {
  test.describe.configure({ retries: 0 });

  for (const width of [375, 768, 1440]) {
    for (const scale of ["Medium", "Large"] as const) {
      test("Planner hover and focus fit at " + width + " with " + scale + " text", async ({ gamePage }, testInfo) => {
        await preparePlanner(gamePage, width, scale);
        const page = gamePage.page;
        const advance = page.getByRole("button", { name: "Advance Week", exact: true });
        const help = page.getByRole("tooltip").filter({ hasText: HELP });

        await advance.hover();
        await expect(help).toBeVisible();
        try {
          const result = await expectContained(advance);
          if (width === 375) {
            // The actual responsive layout is left-aligned; no artificial trigger positioning.
            expect((result!.trigger.left + result!.trigger.right) / 2).toBeLessThan(width / 2);
          }
        } finally {
          await attachEvidence(gamePage, advance, testInfo, "hover");
        }
        await page.mouse.move(1, 1);
        await expect(help).toBeHidden();

        await advance.focus();
        await expect(help).toBeVisible();
        try {
          const result = await expectContained(advance);
          expect(result?.id).toBeTruthy();
          expect(result?.describedBy?.split(/\s+/)).toContain(result?.id);
        } finally {
          await attachEvidence(gamePage, advance, testInfo, "keyboard-focus");
        }
        await page.keyboard.press("Tab");
        await expect(help).toBeHidden();
        await advance.focus();
        await expect(help).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(help).toBeHidden();

        await advance.click();
        const warning = page.getByRole("dialog", { name: "Unplanned Days", exact: true });
        await expect(warning).toBeVisible();
        await warning.getByRole("button", { name: "Go Back", exact: true }).click();
        await expect(warning).toBeHidden();
        await expect(advance).toBeVisible();
        gamePage.expectNoConsoleErrors();
      });
    }
  }

  test("focused Planner help tracks resize and real scrolling without a detached card", async ({ gamePage }, testInfo) => {
    await preparePlanner(gamePage, 1440, "Large");
    const page = gamePage.page;
    const advance = page.getByRole("button", { name: "Advance Week", exact: true });
    const help = page.getByRole("tooltip").filter({ hasText: HELP });
    await advance.focus();
    await expect(help).toBeVisible();
    await page.setViewportSize({ width: 768, height: 700 });
    await expectContained(advance);
    await attachEvidence(gamePage, advance, testInfo, "resize");

    const region = page.getByTestId("planner-scroll-region");
    // DOM scrolling models user scrolling in the real application region; it changes no game state.
    await region.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect.poll(async () => advance.evaluate((element) => {
      const region = element.closest('[data-testid="planner-scroll-region"]');
      return !!region && element.getBoundingClientRect().bottom <= region.getBoundingClientRect().top;
    })).toBe(true);
    await expect(help).toBeHidden();
    await region.evaluate((element) => { element.scrollTop = 0; });
    await expect(help).toBeVisible();
    await expectContained(advance);
    await attachEvidence(gamePage, advance, testInfo, "scrolled-back");
    gamePage.expectNoConsoleErrors();
  });

  test("help remains complete when the actual Planner scrolling box is shallow", async ({ gamePage }, testInfo) => {
    await preparePlanner(gamePage, 1440, "Large");
    const page = gamePage.page;
    const region = page.getByTestId("planner-scroll-region");
    // Explicit layout stress fixture on the real control, not a claimed production layout.
    await region.evaluate((element) => { element.style.height = "96px"; });
    const advance = page.getByRole("button", { name: "Advance Week", exact: true });
    await advance.focus();
    await expect(page.getByRole("tooltip").filter({ hasText: HELP })).toBeVisible();
    try {
      const result = await expectContained(advance);
      expect(result!.triggerBounds.bottom - result!.triggerBounds.top).toBeLessThan(100);
      // The portal's own clipping domain differs from the trigger's shallow scroll box.
      expect(result!.cardAncestors.some((ancestor) => ancestor.id === "game-main")).toBe(false);
    } finally {
      await attachEvidence(gamePage, advance, testInfo, "shallow-scroll-box");
    }
    gamePage.expectNoConsoleErrors();
  });

  test("pending hover is cancelled during public navigation", async ({ gamePage }) => {
    await preparePlanner(gamePage, 1440, "Medium");
    const page = gamePage.page;
    await page.getByRole("button", { name: "Advance Week", exact: true }).hover();
    await gamePage.navigateTo("settings");
    // Deliberately longer than the documented 300 ms hover delay.
    await page.waitForTimeout(400);
    await expect(page.getByRole("tooltip").filter({ hasText: HELP })).toHaveCount(0);
    gamePage.expectNoConsoleErrors();
  });
});
