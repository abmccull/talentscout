import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "../fixtures";
import { navItem } from "../helpers/selectors";

async function expectObjectivePanelAccessible(
  page: import("@playwright/test").Page,
  testId: string,
) {
  const result = await new AxeBuilder({ page })
    .include(`[data-testid="${testId}"]`)
    .analyze();
  expect(
    result.violations.filter(
      (violation) => violation.impact === "critical" || violation.impact === "serious",
    ),
  ).toEqual([]);
}

test.describe("Youth geography and travel", () => {
  test("country dossier owns focus, closes with Escape, and restores its map marker", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 1,
      currentSeason: 1,
      countries: ["england", "brazil"],
      scout: {
        careerTier: 2,
        primarySpecialization: "youth",
        careerPath: "independent",
      },
    });

    await gamePage.navigateTo("internationalView");
    const brazilMarker = gamePage.page.getByRole("button", {
      name: /^Brazil.*familiarity/i,
    });
    await brazilMarker.focus();
    await gamePage.page.keyboard.press("Enter");

    const dossier = gamePage.page.getByRole("dialog", {
      name: "Brazil intel dossier",
    });
    const closeButton = dossier.getByRole("button", { name: "Close", exact: true });
    await expect(dossier).toBeVisible();
    await expect(closeButton).toBeFocused();
    const closeBox = await closeButton.boundingBox();
    expect(closeBox?.width).toBeGreaterThanOrEqual(44);
    expect(closeBox?.height).toBeGreaterThanOrEqual(44);

    await gamePage.page.keyboard.press("Escape");
    await expect(dossier).toBeHidden();
    await expect(brazilMarker).toBeFocused();
    await expect(gamePage.page.locator(navItem("internationalView"))).toHaveAttribute(
      "aria-current",
      "page",
    );
    gamePage.expectNoConsoleErrors();
  });

  test("country browser exposes active destinations, football coverage, and earned local intelligence", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 1,
      currentSeason: 1,
      countries: ["england", "nigeria"],
      scout: {
        careerTier: 2,
        primarySpecialization: "youth",
        careerPath: "independent",
      },
    });
    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      store.getState().loadGame({
        ...state,
        regionalKnowledge: {
          ...state.regionalKnowledge,
          nigeria: {
            ...state.regionalKnowledge.nigeria,
            countryId: "nigeria",
            knowledgeLevel: 38,
            discoveredLeagues: ["hl_nga_npl"],
            culturalInsights: [],
            localContacts: ["local-contact-nigeria"],
            scoutingEfficiency: 0.88,
          },
        },
      });
    });

    await gamePage.navigateTo("internationalView");
    await gamePage.page.getByRole("button", { name: /Browse countries/i }).click();
    const browser = gamePage.page.getByTestId("country-browser");
    await expect(browser).toBeVisible();
    await expect(browser.getByRole("button", { name: /England, Live calendar/i })).toBeVisible();
    const nigeria = browser.getByRole("button", { name: /Nigeria, Scouting network/i });
    await expect(nigeria).toBeVisible();

    await nigeria.click();
    await expect(browser).toBeHidden();
    const dossier = gamePage.page.getByRole("dialog", { name: "Nigeria intel dossier" });
    await expect(dossier).toContainText("Football coverage");
    await expect(dossier).toContainText("Scouting network");
    await expect(dossier).toContainText("Regional knowledge");
    await expect(dossier).toContainText("Operational presence");
    await expect(dossier).toContainText("38/100");
    await expect(dossier).toContainText("Nigeria National League");
    const dossierAxe = await new AxeBuilder({ page: gamePage.page })
      .include('[role="dialog"]')
      .analyze();
    expect(
      dossierAxe.violations.filter(
        (violation) => violation.impact === "critical" || violation.impact === "serious",
      ),
    ).toEqual([]);
    await gamePage.page.keyboard.press("Escape");
    await expect(dossier).toBeHidden();
    const browserTrigger = gamePage.page.getByRole("button", { name: /Browse countries/i });
    await expect(browserTrigger).toBeFocused();
    await browserTrigger.click();
    await expect(browser).toBeVisible();

    const search = browser.getByRole("textbox", { name: "Search active countries" });
    await search.fill("england");
    await expect(browser.getByRole("button", { name: /England, Live calendar/i })).toBeVisible();
    await expect(nigeria).toHaveCount(0);
    gamePage.expectNoConsoleErrors();
  });

  test("country browser and dossier remain operable at a phone viewport", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.page.setViewportSize({ width: 390, height: 844 });
    await gamePage.injectState({
      currentWeek: 1,
      currentSeason: 1,
      countries: ["england", "nigeria"],
      scout: {
        careerTier: 2,
        primarySpecialization: "youth",
        careerPath: "independent",
      },
    });

    await gamePage.navigateTo("internationalView");
    const browserTrigger = gamePage.page.getByRole("button", { name: /Browse countries/i });
    await expect(browserTrigger).toBeVisible();
    await browserTrigger.click();

    const browser = gamePage.page.getByTestId("country-browser");
    await expect(browser).toBeVisible();
    const browserBox = await browser.boundingBox();
    expect(browserBox?.x).toBeGreaterThanOrEqual(0);
    expect(browserBox?.width).toBeLessThanOrEqual(390);

    const nigeria = browser.getByRole("button", { name: /Nigeria, Scouting network/i });
    await nigeria.click();
    await expect(browser).toBeHidden();
    const dossier = gamePage.page.getByRole("dialog", { name: "Nigeria intel dossier" });
    await expect(dossier).toBeVisible();
    const dossierBox = await dossier.boundingBox();
    expect(dossierBox?.x).toBeGreaterThanOrEqual(0);
    expect((dossierBox?.x ?? 0) + (dossierBox?.width ?? 0)).toBeLessThanOrEqual(390);
    expect(dossierBox?.y).toBeGreaterThanOrEqual(0);
    expect((dossierBox?.y ?? 0) + (dossierBox?.height ?? 0)).toBeLessThanOrEqual(844);

    await gamePage.page.keyboard.press("Escape");
    await expect(dossier).toBeHidden();
    await expect(browserTrigger).toBeFocused();
    gamePage.expectNoConsoleErrors();
  });

  test("international travel is visible, funded, scheduled, and becomes the effective location", async ({ gamePage }) => {
    test.setTimeout(120_000);
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 1,
      currentSeason: 1,
      countries: ["england", "brazil"],
      scout: {
        careerTier: 2,
        primarySpecialization: "youth",
        careerPath: "independent",
        reputation: 35,
        fatigue: 5,
      },
    });

    await expect(gamePage.page.locator(navItem("internationalView"))).toBeVisible();
    await gamePage.navigateTo("internationalView");
    await expect(gamePage.page.getByText(/Currently in:/).first()).toBeVisible();

    const booked = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const before = store.getState().gameState;
      const funded = {
        ...before,
        finances: {
          ...before.finances,
          balance: 100_000,
        },
        schedule: {
          ...before.schedule,
          activities: [...before.schedule.activities],
        },
      };
      store.getState().loadGame({
        ...funded,
        schedule: {
          ...funded.schedule,
          activities: Array(7).fill({
            type: "rest",
            slots: 1,
            description: "Occupied",
          }),
        },
      });
      const blockedBalanceBefore = store.getState().gameState.finances.balance;
      const blocked = store.getState().bookInternationalTravel("brazil");
      const blockedState = store.getState().gameState;

      store.getState().loadGame(funded);
      const balanceBefore = store.getState().gameState.finances.balance;
      const accepted = store.getState().bookInternationalTravel("brazil");
      const after = store.getState().gameState;
      const travelSlots = after.schedule.activities.filter(
        (activity: any) => activity?.type === "internationalTravel",
      );
      return {
        destination: after.scout.travelBooking?.destinationCountry,
        departureWeek: after.scout.travelBooking?.departureWeek,
        accepted,
        blocked,
        blockedDestination: blockedState.scout.travelBooking?.destinationCountry,
        blockedBalanceBefore,
        blockedBalanceAfter: blockedState.finances.balance,
        balanceBefore,
        balanceAfter: after.finances.balance,
        travelSlotCount: travelSlots.length,
        targetIds: [...new Set(travelSlots.map((activity: any) => activity.targetId))],
        instanceIds: [...new Set(travelSlots.map((activity: any) => activity.instanceId))],
      };
    });

    expect(booked.destination).toBe("brazil");
    expect(booked.departureWeek).toBe(2);
    expect(booked.accepted).toBe(true);
    expect(booked.blocked).toBe(false);
    expect(booked.blockedDestination).toBeUndefined();
    expect(booked.blockedBalanceAfter).toBe(booked.blockedBalanceBefore);
    expect(booked.balanceAfter).toBeLessThan(booked.balanceBefore);
    expect(booked.travelSlotCount).toBeGreaterThan(0);
    expect(booked.targetIds).toEqual(["brazil"]);
    expect(booked.instanceIds).toHaveLength(1);

    await gamePage.navigateTo("calendar");
    await gamePage.advanceCanonicalWeek();

    const arrived = await gamePage.page.evaluate(() => {
      const state = (window as any).__GAME_STORE__.getState().gameState;
      return {
        week: state.currentWeek,
        destination: state.scout.travelBooking?.destinationCountry,
        isAbroad: state.scout.travelBooking?.isAbroad,
      };
    });
    expect(arrived).toEqual({ week: 2, destination: "brazil", isAbroad: true });
    gamePage.expectNoConsoleErrors();
  });

  test("assignment objectives are visible and travel-only returns fail without rewards", async ({ gamePage }) => {
    test.setTimeout(120_000);
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 1,
      currentSeason: 1,
      countries: ["england", "brazil"],
      scout: {
        careerTier: 3,
        primarySpecialization: "youth",
        careerPath: "independent",
        reputation: 40,
        fatigue: 5,
      },
    });
    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      store.getState().loadGame({
        ...state,
        finances: { ...state.finances, balance: 100_000 },
        internationalAssignments: [{
          id: "e2e-senior-assignment",
          country: "brazil",
          region: "South America",
          description: "Observe a senior friendly and return with evidence.",
          weekAvailable: 1,
          duration: 1,
          reputationReward: 2,
          type: "seniorFriendly",
        }],
        activeInternationalAssignment: null,
        internationalAssignmentHistory: [],
      });
    });

    await gamePage.navigateTo("internationalView");
    const offerObjectives = gamePage.page.getByTestId("international-assignment-objectives");
    await expect(offerObjectives).toContainText("Required deliverables");
    await expect(offerObjectives).toContainText("0/2");
    await expect(offerObjectives).toContainText("0/1");
    await expectObjectivePanelAccessible(
      gamePage.page,
      "international-assignment-objectives",
    );
    await expect(gamePage.page.getByText("Up to +2 rep")).toBeVisible();
    await gamePage.page.getByRole("button", { name: "Open on Map", exact: true }).click();
    await expect(gamePage.page.getByText(
      "Choose a trip posture before you commit. Full completion can earn up to +2 reputation; objectives are graded at return.",
    )).toBeVisible();
    await gamePage.page.keyboard.press("Escape");
    await gamePage.page.getByRole("button", { name: "Review trip", exact: true }).click();
    const dossier = gamePage.page.getByRole("dialog", { name: "Brazil intel dossier" });
    await expect(dossier).toBeVisible();
    await expect(gamePage.page.getByTestId("active-international-objectives")).toHaveCount(0);
    await expect(gamePage.page.getByText("Travel Booked!")).toHaveCount(0);
    await dossier.getByRole("button", { name: "Commit trip", exact: true }).click();

    const activeObjectives = gamePage.page.getByTestId("active-international-objectives");
    await expect(activeObjectives).toContainText("Objective progress");
    await expect(activeObjectives).toContainText(/travel alone earns no assignment reward/i);
    await expectObjectivePanelAccessible(gamePage.page, "active-international-objectives");

    await gamePage.advanceWeeks(1);
    await gamePage.setScreen("internationalView");
    await expect(gamePage.page.getByTestId("active-international-objectives")).toContainText("0/2");
    await gamePage.advanceWeeks(1);
    const outcome = await gamePage.page.evaluate(() => {
      const state = (window as any).__GAME_STORE__.getState().gameState;
      const history = state.internationalAssignmentHistory ?? [];
      return {
        activeAssignment: state.activeInternationalAssignment,
        outcome: history.at(-1)?.outcome,
        completionMessage: state.inbox.find(
          (message: any) => message.relatedId === "e2e-senior-assignment",
        )?.body,
      };
    });
    expect(outcome.activeAssignment).toBeNull();
    expect(outcome.outcome).toMatchObject({
      grade: "failed",
      completionPercent: 0,
      reputationDelta: -1,
      familiarityDelta: 0,
    });
    expect(outcome.completionMessage).toContain("Travel alone earns no assignment credit");
    expect(outcome.completionMessage).toContain("Reputation -1");
    gamePage.expectNoConsoleErrors();
  });
});
