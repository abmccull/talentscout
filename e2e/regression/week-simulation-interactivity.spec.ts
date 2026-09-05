import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import type { GamePage } from "../fixtures";

async function openWeekJourney(gamePage: GamePage) {
  await gamePage.goto();
  await gamePage.injectState({
    currentWeek: 12,
    scout: {
      firstName: "Journey",
      lastName: "Scout",
      primarySpecialization: "youth",
      reputation: 48,
    },
  });
  await gamePage.page.evaluate(() => {
    const store = (window as any).__GAME_STORE__;
    store.getState().autoSchedule();
    store.getState().startWeekSimulation();
  });
  await gamePage.waitForScreen("weekSimulation");
  await expect(gamePage.page.getByRole("heading", { name: "Week in Progress" })).toBeVisible();
}

async function expectNoBlockingAxeViolations(page: Page) {
  await page.waitForTimeout(250);
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations
    .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target.join(" ")),
    }));
  expect(blocking).toEqual([]);
}

async function resolveCurrentDecisionThroughUI(page: Page) {
  const choice = await page.evaluate(() => {
    const store = (window as any).__GAME_STORE__;
    const simulation = store.getState().weekSimulation;
    const day = simulation?.dayResults?.[simulation.currentDay];
    const options = day?.interaction?.options ?? [];
    return options.find((option: any) => option.id !== "focus") ?? options[0] ?? null;
  });
  expect(choice, "the deterministic opening day should offer a scouting decision").not.toBeNull();
  if (!choice) throw new Error("No scouting decision was generated for the opening day");

  const button = page.getByRole("button", { name: new RegExp(choice.label, "i") }).first();
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await expect(page.getByText(new RegExp(`Approach locked: ${choice.label}`, "i"))).toBeVisible();
}

async function expectWeekActionsContained(page: Page, phone: boolean) {
  const geometry = await page.getByTestId("week-journey-screen").locator("footer").evaluate((footer) => {
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: rect.height };
    };
    const nav = document.querySelector('nav[aria-label="Youth Scout workspace"]');
    return {
      footer: box(footer),
      actions: [...footer.querySelectorAll("button")].map(box),
      nav: nav ? box(nav) : null,
      width: innerWidth,
      height: innerHeight,
    };
  });
  const floor = phone ? geometry.nav!.top : geometry.height;
  if (phone) {
    expect(geometry.nav).not.toBeNull();
    expect(geometry.nav!.height).toBeGreaterThanOrEqual(64);
  }
  for (const rect of [geometry.footer, ...geometry.actions]) {
    expect(rect.top).toBeGreaterThanOrEqual(-1);
    expect(rect.bottom).toBeLessThanOrEqual(floor + 1);
    expect(rect.left).toBeGreaterThanOrEqual(-1);
    expect(rect.right).toBeLessThanOrEqual(geometry.width + 1);
  }
  expect(geometry.actions).toHaveLength(2);
  for (const action of geometry.actions) expect(action.height).toBeGreaterThanOrEqual(44);
}

test.describe("Week Simulation journey", () => {

  for (const viewport of [
    { width: 768, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`${viewport.width}px normal-motion week actions remain reachable through scrolling`, async ({ gamePage }) => {
      const page = gamePage.page;
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.setViewportSize(viewport);
      await page.addInitScript(() => {
        localStorage.setItem("talentscout_settings", JSON.stringify({
          reducedMotion: false,
          autoPlayWeekSimulation: false,
        }));
      });
      await openWeekJourney(gamePage);
      const screen = page.getByTestId("week-journey-screen");
      const footer = screen.locator("footer");
      const advance = footer.getByRole("button", { name: "Advance to next day", exact: true });
      await expect(screen).toHaveAttribute("data-reduced-motion", "false");
      await expect(page.locator("html")).not.toHaveClass(/\breduced-motion\b/);
      await expect(advance).toBeDisabled();
      // Measure the initial viewport before any control is scrolled into view.
      await expectWeekActionsContained(page, viewport.width < 768);

      const maxScroll = await page.evaluate(() =>
        Math.max(0, document.scrollingElement!.scrollHeight - innerHeight),
      );
      if (maxScroll > 2) {
        await page.mouse.move(viewport.width - 24, Math.floor(viewport.height / 2));
        await page.mouse.wheel(0, Math.ceil(maxScroll / 2));
        await expect.poll(() => page.evaluate(() => document.scrollingElement!.scrollTop))
          .toBeGreaterThan(0);
        await expectWeekActionsContained(page, viewport.width < 768);
        await page.mouse.wheel(0, maxScroll + viewport.height);
        await expect.poll(() => page.evaluate(() =>
          document.scrollingElement!.scrollHeight - innerHeight - document.scrollingElement!.scrollTop,
        )).toBeLessThanOrEqual(2);
        await expectWeekActionsContained(page, viewport.width < 768);
      }

      const rapport = page.getByTestId("current-day-journey")
        .getByRole("region", { name: "Your call", exact: true })
        .getByRole("button", { name: /^Build Rapport\b/ });
      await rapport.scrollIntoViewIfNeeded();
      await rapport.click();
      await expect(page.getByText("Approach locked: Build Rapport", { exact: true })).toBeVisible();
      await expect(advance).toBeEnabled();
      await expectWeekActionsContained(page, viewport.width < 768);
      expect(await advance.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return hit !== null && button.contains(hit);
      })).toBe(true);
      await advance.click();
      await expect(page.getByRole("progressbar", { name: "Weekly journey progress" }))
        .toHaveAttribute("aria-valuetext", "Viewing day 2 of 7");
      gamePage.expectNoConsoleErrors();
    });
  }

  test("390px layout stacks the timeline, journey, and actions without horizontal clipping", async ({ gamePage }) => {
    await gamePage.page.setViewportSize({ width: 390, height: 844 });
    await openWeekJourney(gamePage);

    const timeline = gamePage.page.getByTestId("week-timeline");
    const journey = gamePage.page.getByTestId("current-day-journey");
    await expect(timeline).toBeVisible();
    await expect(journey).toBeVisible();
    await expect(gamePage.page.getByRole("region", { name: "Current day details" })).toBeVisible();
    await expect(journey.locator("main")).toHaveCount(0);
    await expect(journey).not.toHaveAttribute("aria-live", /.+/);
    await expect(gamePage.page.getByTestId("week-journey-status")).toContainText("Decision required");
    const commitment = journey.getByTestId("week-journey-beat-1");
    await expect(commitment.getByRole("heading", { name: "Network Meeting", exact: true })).toBeVisible();
    await expect(commitment).toContainText("Monday");
    const story = journey.getByRole("region", { name: "Today’s story and decision", exact: true });
    await expect(story).toBeVisible();
    await expect(story.getByRole("heading", { name: "Your call", exact: true })).toBeVisible();
    await expect(gamePage.page.getByRole("heading", { name: "Decision pending", exact: true })).toBeVisible();
    await expect(gamePage.page.getByTestId("unresolved-day-consequence")).toBeVisible();
    await expect(gamePage.page.getByRole("group", { name: "Day outcome summary" })).toHaveCount(0);

    const geometry = await gamePage.page.evaluate(() => {
      const viewportWidth = window.innerWidth;
      const timeline = document.querySelector('[data-testid="week-timeline"]')?.getBoundingClientRect();
      const journey = document.querySelector('[data-testid="current-day-journey"]')?.getBoundingClientRect();
      return {
        viewportWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
        timeline: timeline ? { left: timeline.left, right: timeline.right, width: timeline.width } : null,
        journey: journey ? { left: journey.left, right: journey.right, width: journey.width } : null,
      };
    });

    expect(geometry.documentScrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.bodyScrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.timeline).not.toBeNull();
    expect(geometry.journey).not.toBeNull();
    expect(geometry.timeline!.left).toBeGreaterThanOrEqual(0);
    expect(geometry.timeline!.right).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(geometry.journey!.left).toBeGreaterThanOrEqual(0);
    expect(geometry.journey!.right).toBeLessThanOrEqual(geometry.viewportWidth);
    expect(Math.abs(geometry.timeline!.width - geometry.journey!.width)).toBeLessThanOrEqual(2);

    await resolveCurrentDecisionThroughUI(gamePage.page);
    await expect(gamePage.page.getByRole("heading", { name: "Today’s result", exact: true })).toBeVisible();
    await expect(gamePage.page.getByTestId("unresolved-day-consequence")).toHaveCount(0);
    const outcomeSummary = gamePage.page.getByRole("group", { name: "Day outcome summary" });
    await expect(outcomeSummary).toBeVisible();
    await expect(outcomeSummary).toContainText("Fatigue");
    await expect(gamePage.page.getByTestId("week-journey-status")).toContainText("Consequences revealed");
    const nextDay = gamePage.page.getByRole("button", { name: "Advance to next day" });
    await nextDay.scrollIntoViewIfNeeded();
    await expect(nextDay).toBeVisible();
    await expect(nextDay).toBeEnabled();
    const nextBox = await nextDay.boundingBox();
    expect(nextBox).not.toBeNull();
    expect(nextBox!.x).toBeGreaterThanOrEqual(0);
    expect(nextBox!.x + nextBox!.width).toBeLessThanOrEqual(390);
    expect(nextBox!.height).toBeGreaterThanOrEqual(44);

    const skip = gamePage.page.getByRole("button", {
      name: "Skip remaining days and complete the week",
    });
    await expect(skip).toBeVisible();
    const skipBox = await skip.boundingBox();
    expect(skipBox).not.toBeNull();
    expect(skipBox!.x + skipBox!.width).toBeLessThanOrEqual(390);
    expect(skipBox!.height).toBeGreaterThanOrEqual(44);

    await expectNoBlockingAxeViolations(gamePage.page);

    await nextDay.click();
    await expect(gamePage.page.getByRole("progressbar", { name: "Weekly journey progress" }))
      .toHaveAttribute("aria-valuetext", "Viewing day 2 of 7");
    gamePage.expectNoConsoleErrors();
  });

  test("reduced-motion preference keeps the same semantic three-beat journey", async ({ gamePage }) => {
    await gamePage.page.emulateMedia({ reducedMotion: "reduce" });
    await gamePage.page.setViewportSize({ width: 1440, height: 900 });
    await openWeekJourney(gamePage);

    const screen = gamePage.page.getByTestId("week-journey-screen");
    await expect(screen).toHaveAttribute("data-reduced-motion", "true");
    await expect(gamePage.page.getByTestId("week-journey-beat-1")).toBeVisible();
    await expect(gamePage.page.getByTestId("week-journey-beat-2")).toBeVisible();
    await expect(gamePage.page.getByTestId("week-journey-beat-3")).toBeVisible();
    await expect(gamePage.page.getByRole("progressbar", { name: "Weekly journey progress" }))
      .toHaveAttribute("aria-valuetext", "Viewing day 1 of 7");
    await expect(gamePage.page.getByTestId("weekly-progress-fill"))
      .toHaveAttribute("data-reduced-motion", "true");
    await expectNoBlockingAxeViolations(gamePage.page);
    gamePage.expectNoConsoleErrors();
  });

  test("a completed live session resolves the outcome without forcing a duplicate day choice", async ({ gamePage }) => {
    await gamePage.page.setViewportSize({ width: 1280, height: 800 });
    await openWeekJourney(gamePage);

    await expect(gamePage.page.getByTestId("unresolved-day-consequence")).toBeVisible();
    const completionKey = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const snapshot = store.getState();
      const simulation = snapshot.weekSimulation;
      const day = simulation?.dayResults?.[simulation.currentDay];
      const activity = day?.activity;
      if (!activity) return null;
      const key = activity.instanceId
        ? `${activity.instanceId}:d${day.dayIndex}`
        : `${activity.type}-d${day.dayIndex}`;
      store.setState({
        gameState: {
          ...snapshot.gameState,
          completedInteractiveSessions: [
            ...(snapshot.gameState.completedInteractiveSessions ?? []),
            key,
          ],
        },
      });
      return key;
    });

    expect(completionKey, "the opening day should have a completable activity").not.toBeNull();
    await expect(gamePage.page.getByRole("heading", { name: "Today’s result", exact: true })).toBeVisible();
    await expect(gamePage.page.getByTestId("unresolved-day-consequence")).toHaveCount(0);
    await expect(gamePage.page.getByText("Session completed")).toBeVisible();
    await expect(gamePage.page.getByRole("button", { name: "Advance to next day" })).toBeEnabled();
    await expect(gamePage.page.getByTestId("week-journey-status")).toContainText("Consequences revealed");
    await expectNoBlockingAxeViolations(gamePage.page);
    gamePage.expectNoConsoleErrors();
  });
});
