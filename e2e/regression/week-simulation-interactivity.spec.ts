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

test.describe("Week Simulation journey", () => {
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
    await expect(gamePage.page.getByRole("heading", { name: "What you set out to do" })).toBeVisible();
    await expect(gamePage.page.getByRole("heading", { name: "What unfolded" })).toBeVisible();
    await expect(gamePage.page.getByRole("heading", { name: "Outcome waiting on your call" })).toBeVisible();
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
    await expect(gamePage.page.getByRole("heading", { name: "What changed" })).toBeVisible();
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
    await expect(gamePage.page.getByRole("heading", { name: "What changed" })).toBeVisible();
    await expect(gamePage.page.getByTestId("unresolved-day-consequence")).toHaveCount(0);
    await expect(gamePage.page.getByText("Session completed")).toBeVisible();
    await expect(gamePage.page.getByRole("button", { name: "Advance to next day" })).toBeEnabled();
    await expect(gamePage.page.getByTestId("week-journey-status")).toContainText("Consequences revealed");
    await expectNoBlockingAxeViolations(gamePage.page);
    gamePage.expectNoConsoleErrors();
  });
});
