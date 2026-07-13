import type { Page } from "@playwright/test";
import type { GamePage } from "../fixtures";
import { test, expect } from "../fixtures";
import { SELECTORS } from "../helpers/selectors";

async function allocateYouthPoints(page: Page) {
  const allocations: Record<string, number> = {
    technicalEye: 2,
    physicalAssessment: 1,
    psychologicalRead: 1,
    playerJudgment: 1,
    potentialAssessment: 3,
  };

  for (const [skill, amount] of Object.entries(allocations)) {
    for (let i = 0; i < amount; i++) {
      await page.getByRole("button", { name: `Increase ${skill}` }).click();
    }
  }
}

async function startFreshYouthCareer(
  gamePage: GamePage,
  scoutLastName: string,
  options: { keepTutorials?: boolean } = {},
) {
  if (options.keepTutorials) {
    await gamePage.page.goto("/play");
    await gamePage.page.waitForFunction(() => Boolean((window as any).__GAME_STORE__));
  } else {
    await gamePage.goto();
  }
  await gamePage.page.locator(SELECTORS.newGameButton).first().click();

  await gamePage.page.locator(SELECTORS.firstNameInput).fill("Youth");
  await gamePage.page.locator(SELECTORS.lastNameInput).fill(scoutLastName);
  await gamePage.page.getByRole("button", { name: /^Continue$/ }).click();

  await expect(
    gamePage.page.getByText(/Assign all 8 bonus skill points to continue/i),
  ).toBeVisible();
  await expect(gamePage.page.getByRole("button", { name: /^Continue$/ })).toBeDisabled();

  await allocateYouthPoints(gamePage.page);
  await gamePage.page.getByRole("button", { name: /^Continue$/ }).click();

  await expect(
    gamePage.page.getByRole("heading", { name: "Build Your World" }),
  ).toBeVisible();
  await gamePage.page.getByRole("button", { name: /^Continue$/ }).click();
  await expect(
    gamePage.page.getByRole("heading", { name: /Review & Begin/i }),
  ).toBeVisible();
  await gamePage.page.getByRole("button", { name: /^Begin Career$/ }).click();

  await gamePage.waitForScreen(options.keepTutorials ? "observation" : "dashboard", 30_000);
}

async function createListedFirstReport(gamePage: GamePage, scoutLastName: string) {
  await startFreshYouthCareer(gamePage, scoutLastName);
  await gamePage.navigateTo("calendar");
  await gamePage.scheduleActivityByLabel("School Match", "Mon");
  await gamePage.advanceCanonicalWeek({ launchLiveSession: true });

  const sessionOutcome = await gamePage.page.evaluate(() => {
    const store = (window as any).__GAME_STORE__;
    const state = store.getState().gameState;
    const observations = Object.values(state?.observations ?? {}) as any[];
    const completedIds = new Set(state?.completedInteractiveSessions ?? []);
    const interactiveObservations = observations.filter((observation) => observation.sourceSessionId);
    const replacedFallbackObservations = observations.filter(
      (observation) => observation.activityInstanceId
        && completedIds.has(observation.activityInstanceId)
        && !observation.sourceSessionId,
    );
    const journalEntries = Object.values(state?.reflectionJournal ?? {}) as any[];
    return {
      observationCount: observations.length,
      discoveryCount: (state?.discoveryRecords ?? []).length,
      interactiveObservationCount: interactiveObservations.length,
      focusedObservationCount: interactiveObservations.filter(
        (observation) => observation.focusLens === "technical",
      ).length,
      replacedFallbackObservationCount: replacedFallbackObservations.length,
      durableFlagCount: journalEntries.reduce(
        (total, entry) => total + (entry.flaggedMoments?.length ?? 0),
        0,
      ),
      linkedObservationCount: journalEntries.reduce(
        (total, entry) => total + (entry.observationIds?.length ?? 0),
        0,
      ),
      specializationXp: state?.scout.specializationXp ?? 0,
      unlockedPerks: state?.scout.unlockedPerks ?? [],
    };
  });

  expect(
    sessionOutcome.observationCount > 0 || sessionOutcome.discoveryCount > 0,
  ).toBe(true);
  expect(sessionOutcome.interactiveObservationCount).toBeGreaterThan(0);
  expect(sessionOutcome.focusedObservationCount).toBeGreaterThan(0);
  expect(sessionOutcome.replacedFallbackObservationCount).toBe(0);
  expect(sessionOutcome.durableFlagCount).toBeGreaterThan(0);
  expect(sessionOutcome.linkedObservationCount).toBe(
    sessionOutcome.interactiveObservationCount,
  );
  expect(sessionOutcome.specializationXp).toBeGreaterThan(0);
  expect(sessionOutcome.unlockedPerks).toContain("youth_grassroots_access");
  expect(sessionOutcome.unlockedPerks).not.toContain("youth_academy_access");

  await gamePage.openFirstYouthPlayerProfile();
  await expect(
    gamePage.page.getByRole("heading", { name: /Turn the read into a report/ }),
  ).toBeVisible();
  await gamePage.page.getByRole("button", { name: /^Write Report$/ }).click();
  await gamePage.waitForScreen("reportWriter");
  await gamePage.submitCurrentReportViaUI("recommend");
  await gamePage.waitForScreen("reportHistory");

  const latestReport = await gamePage.page.evaluate(() => {
    const store = (window as any).__GAME_STORE__;
    const reports = Object.values(store.getState().gameState?.reports ?? {}) as any[];
    return reports.at(-1) ?? null;
  });

  expect(latestReport?.craftBreakdown).toBeTruthy();
  expect(latestReport?.craftBreakdown?.observationDepth).toBeGreaterThan(0);
  expect(latestReport?.qualityBreakdown).toBeUndefined();
  expect(latestReport?.postTransferRating).toBeUndefined();
  expect(Array.isArray(latestReport?.strengths)).toBe(true);
  expect(
    (latestReport?.weaknesses ?? []).every(
      (descriptor: unknown) => typeof descriptor === "string" && descriptor.length > 0,
    ),
  ).toBe(true);

  await expect(
    gamePage.page.locator('[data-tutorial-id="report-marketplace-prompt"]'),
  ).toBeVisible();
  await gamePage.page.getByRole("button", { name: /^List Now$/ }).click();
}

test.describe("Youth Early Access", () => {
  test.setTimeout(180_000);

  test("fresh onboarding starts inside the discovery loop with no out-of-scope workspace links", async ({ gamePage }) => {
    await startFreshYouthCareer(gamePage, "Guide", { keepTutorials: true });

    const tutorialState = await gamePage.page.evaluate(() => {
      const state = (window as any).__TUTORIAL_STORE__.getState();
      return {
        active: state.guidedSessionActive,
        currentTask: state.currentGuidedTask,
        viewedDashboard: state.guidedMilestones.viewedDashboard,
      };
    });

    expect(tutorialState).toEqual({
      active: true,
      currentTask: "attendedMatch",
      viewedDashboard: false,
    });
    await expect(
      gamePage.page.getByRole("dialog", { name: "Mentor: Take the first look" }),
    ).toBeVisible();
    await expect(
      gamePage.page.getByRole("heading", { name: "The match started early." }),
    ).toBeVisible();
    await expect(gamePage.page.getByRole("button", { name: "View Agency →" })).toHaveCount(0);
    await expect(gamePage.page.getByRole("button", { name: "Leaderboard" })).toHaveCount(0);
    await expect(gamePage.page.getByRole("button", { name: "Analytics" })).toHaveCount(0);
    await expect(gamePage.page.getByRole("heading", { name: /Rival Scouts Activity/ })).toHaveCount(0);

    gamePage.expectNoConsoleErrors();
  });

  test("fresh youth career reaches first listed report through the real UI flow", async ({ gamePage }) => {
    await createListedFirstReport(gamePage, "Journey");

    expect(await gamePage.getGameStateValue("scout.primarySpecialization")).toBe("youth");
    expect(await gamePage.getGameStateValue("scout.currentClubId")).toBeFalsy();
    expect(await gamePage.getGameStateValue("scout.salary")).toBe(0);
    expect(await gamePage.getGameStateValue("scout.careerPath")).toBe("independent");
    expect(await gamePage.getGameStateValue("finances.careerPath")).toBe("independent");

    const latestListing = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const listings = store.getState().gameState?.finances?.reportListings ?? [];
      return listings.at(-1) ?? null;
    });

    expect(latestListing).not.toBeNull();
    expect(latestListing.status).toBe("active");

    gamePage.expectNoConsoleErrors();
  });

  test("the first listed youth report gets a bid next week and can be accepted", async ({ gamePage }) => {
    await createListedFirstReport(gamePage, "Outcome");

    const balanceBeforeBid = (await gamePage.getGameStateValue("finances.balance")) as number;

    await gamePage.navigateTo("calendar");
    await gamePage.advanceCanonicalWeek();
    await gamePage.navigateTo("inbox");

    const firstBidMessage = gamePage.page
      .getByRole("button", { name: /^Unread message: Bid from / })
      .first();
    await expect(firstBidMessage).toBeVisible();
    await firstBidMessage.click();
    await gamePage.page.getByRole("button", { name: /^Accept Bid$/ }).click();

    const postSaleState = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      const listings = state?.finances?.reportListings ?? [];
      const latestListing = listings.at(-1);
      return {
        balance: state?.finances?.balance ?? 0,
        listingStatus: latestListing?.status ?? null,
        acceptedBidCount: latestListing?.bids?.filter(
          (bid: { status: string }) => bid.status === "accepted",
        ).length ?? 0,
      };
    });

    expect(postSaleState.balance).toBeGreaterThan(balanceBeforeBid);
    expect(postSaleState.listingStatus).toBe("active");
    expect(postSaleState.acceptedBidCount).toBe(1);

    gamePage.expectNoConsoleErrors();
  });
});
