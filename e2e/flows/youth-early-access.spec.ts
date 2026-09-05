import type { Page } from "@playwright/test";
import type { GamePage } from "../fixtures";
import { test, expect } from "../fixtures";
import { SELECTORS } from "../helpers/selectors";
import { dismissTutorials, navigateToGame } from "../helpers/state-injection";

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
  // Dismissing before the wizard marks this player as experienced and selects
  // a veteran prologue. Enter with the fresh profile; dismiss after creation.
  await navigateToGame(gamePage.page);
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

  // Every new Youth EA career begins inside the authored discovery session.
  // Dismissing tutorial overlays must not skip that gameplay hook.
  await gamePage.waitForScreen("observation", 30_000);
  if (!options.keepTutorials) await dismissTutorials(gamePage.page);
}

async function createListedFirstReport(gamePage: GamePage, scoutLastName: string) {
  await startFreshYouthCareer(gamePage, scoutLastName);
  const page = gamePage.page;
  // The authored opening owns the first watch; workspace navigation returns
  // after its observation, access decision, and initial assessment.
  await expect(page.locator('[data-tutorial-id="nav-calendar"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Watch the match", exact: true }).click();
  await page.getByRole("button", { name: /^Use technical lens for / }).click();
  await expect(page.getByRole("button", { name: /^Remove focus from / }).first()).toBeVisible();

  const watchControls = page.getByTestId("mobile-observation-controls");
  await watchControls.getByRole("button", { name: "Next phase", exact: true }).click();
  await page.locator('[data-tutorial-id="observation-flag-moment"]:visible').click();
  await page.locator('[data-tutorial-id="observation-promising-reaction"]:visible').click();
  await page.getByRole("button", { name: /^Confirm the first read\b/ }).click();
  await watchControls.getByRole("button", { name: "Next phase", exact: true }).click();
  await watchControls.getByRole("button", { name: "Reflect on the watch", exact: true }).click();
  await page.getByRole("group", { name: "What did this passage show?" })
    .getByRole("radio").first().check();
  await page.getByRole("button", { name: "Complete Reflection", exact: true }).click();
  await gamePage.waitForScreen("openingDiscovery");

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
    const evidencePlayerIds = new Set(
      journalEntries.flatMap((entry) => (entry.evidenceCards ?? []).map((card: any) => card.playerId)),
    );
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
      reportablePipelineCount: Object.values(state?.unsignedYouth ?? {}).filter((youth: any) =>
        evidencePlayerIds.has(youth.player.id)
        && youth.discoveredBy.includes(state.scout.id),
      ).length,
      insightPoints: state?.scout.insightState?.points ?? 0,
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
  expect(sessionOutcome.reportablePipelineCount).toBeGreaterThan(0);
  // The live opening banks insight immediately; specialization practice is
  // awarded when the scheduled week settles, asserted in the next-week journey.
  expect(sessionOutcome.insightPoints).toBeGreaterThan(0);
  expect(sessionOutcome.unlockedPerks).toContain("youth_grassroots_access");
  expect(sessionOutcome.unlockedPerks).not.toContain("youth_academy_access");

  await page.getByRole("button", { name: /Keep the name private/ }).click();
  await gamePage.waitForScreen("reportWriter");
  await expect(page.getByRole("group", { name: "Saved evidence" })).toBeVisible();
  await gamePage.submitCurrentReportViaUI("recommend");
  await gamePage.waitForScreen("calendar");
  await expect(gamePage.page.locator('[data-tutorial-id="report-marketplace-prompt"]')).toHaveCount(0);

  const latestReport = await gamePage.page.evaluate(() => {
    const store = (window as any).__GAME_STORE__;
    const reports = Object.values(store.getState().gameState?.reports ?? {}) as any[];
    return reports.at(-1) ?? null;
  });

  expect(latestReport?.craftBreakdown).toBeTruthy();
  expect(latestReport?.evidenceAssessment?.kind).toBe("initial");
  expect(latestReport?.craftBreakdown?.observationDepth).toBeGreaterThan(0);
  expect(latestReport?.qualityBreakdown).toBeUndefined();
  expect(latestReport?.postTransferRating).toBeUndefined();
  expect(Array.isArray(latestReport?.strengths)).toBe(true);
  expect(
    (latestReport?.weaknesses ?? []).every(
      (descriptor: unknown) => typeof descriptor === "string" && descriptor.length > 0,
    ),
  ).toBe(true);

  // Filing the opening assessment does not silently put it on the market.
  expect(await gamePage.getGameStateValue("finances.reportListings")).toEqual([]);
  await gamePage.navigateTo("reportHistory");
  await page.getByRole("button", { name: /^List report for .+ for sale$/ }).click();
  const listingDialog = page.getByRole("dialog", { name: "List Report for Sale" });
  await listingDialog.getByLabel("Asking price (£)").fill("500");
  await listingDialog.getByRole("button", { name: "List for Sale", exact: true }).click();
  await expect(listingDialog).toBeHidden();
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
      gamePage.page.getByRole("heading", { name: "The match started early." }),
    ).toBeVisible();
    await expect(gamePage.page.getByRole("group", { name: "What are you here to learn?" })).toBeVisible();
    await expect(gamePage.page.getByRole("button", { name: "Watch the match", exact: true })).toBeEnabled();
    await expect(gamePage.page.getByRole("dialog", { name: "Mentor: Take the first look" })).toHaveCount(0);
    await expect(gamePage.page.locator('[data-tutorial-id="nav-calendar"]')).toHaveCount(0);
    await expect(gamePage.page.getByRole("button", { name: "Open navigation menu" })).toHaveCount(0);
    await expect(gamePage.page.getByRole("button", { name: "View Agency →" })).toHaveCount(0);
    await expect(gamePage.page.getByRole("button", { name: "Leaderboard" })).toHaveCount(0);
    await expect(gamePage.page.getByRole("button", { name: "Analytics" })).toHaveCount(0);
    await expect(gamePage.page.getByRole("heading", { name: /Rival Scouts Activity/ })).toHaveCount(0);

    gamePage.expectNoConsoleErrors();
  });

  test("screen scope preserves drill-downs and contains stale full-game routes", async ({ gamePage }) => {
    await startFreshYouthCareer(gamePage, "Scope");

    const actionRoutes = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      store.getState().setScreen("agency");
      const allowedDetail = store.getState().currentScreen;
      store.getState().setScreen("analytics");
      const futureFallback = store.getState().currentScreen;
      return { allowedDetail, futureFallback };
    });

    expect(actionRoutes).toEqual({
      allowedDetail: "agency",
      futureFallback: "career",
    });

    // Direct state restoration bypasses the navigation action. The play-route
    // boundary must still normalize it before a full-game module can render.
    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      store.setState({ currentScreen: "match" });
    });
    await gamePage.waitForScreen("calendar");

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
    const specializationBefore = await gamePage.page.evaluate(() => {
      const state = (window as any).__GAME_STORE__.getState().gameState;
      return {
        level: state.scout.specializationLevel,
        xp: state.scout.specializationXp,
        followUpBooked: (state.schedule?.activities ?? []).some(
          (activity: { type?: string; targetId?: string } | null) =>
            activity?.type === "followUpSession"
            && activity.targetId === state.openingCase?.playerId,
        ),
      };
    });
    expect(specializationBefore.followUpBooked).toBe(true);

    await gamePage.navigateTo("calendar");
    await gamePage.advanceCanonicalWeek();
    const specializationAfter = await gamePage.page.evaluate(() => {
      const scout = (window as any).__GAME_STORE__.getState().gameState.scout;
      return { level: scout.specializationLevel, xp: scout.specializationXp };
    });
    // XP is the remainder within a level. An exact threshold earns a level
    // and leaves zero XP; both representations must prove real advancement.
    expect(specializationAfter.level).toBeGreaterThanOrEqual(specializationBefore.level);
    if (specializationAfter.level === specializationBefore.level) {
      expect(specializationAfter.xp).toBeGreaterThan(specializationBefore.xp);
    }
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
