import type { Page, TestInfo } from "@playwright/test";
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

async function createListedFirstReport(gamePage: GamePage, scoutLastName: string, testInfo: TestInfo) {
  await startFreshYouthCareer(gamePage, scoutLastName);
  const page = gamePage.page;
  // The authored opening owns the first watch; workspace navigation returns
  // after its observation, access decision, and initial assessment.
  await expect(page.locator('[data-tutorial-id="nav-calendar"]')).toHaveCount(0);
  // Choose a public question that fits the scout's actual allocated strength.
  // A technical lens aimed at the tactical passage is not guaranteed evidence.
  const projectionQuestion = page.getByRole("group", { name: "What are you here to learn?" })
    .getByRole("radio", { name: /^What might translate to the next level\?/ });
  // ChoiceCard's native input is sr-only; activate its public label with the
  // pointer and retain the actual radio-state assertion.
  await projectionQuestion.locator("..").click();
  await expect(projectionQuestion).toBeChecked();
  const openingTarget = await page.evaluate(() => {
    const store = (window as any).__GAME_STORE__.getState();
    const playerId = store.gameState.openingCase.playerId as string;
    const player = store.activeSession.players.find((candidate: any) => candidate.playerId === playerId);
    return { playerId, name: player.name as string };
  });
  await page.getByRole("button", { name: "Watch the match", exact: true }).click();
  const focusOpeningTarget = async () => {
    await page.getByRole("button", { name: /^Focus targets and lenses/ }).click();
    const sheet = page.getByRole("dialog", { name: "Choose your focus" });
    const addFocus = sheet.getByRole("button", { name: `Add focus to ${openingTarget.name}`, exact: true });
    // The selected opening player opens its picker when the sheet mounts.
    // Wait for that state instead of racing its effect with the toggle.
    await expect(addFocus).toHaveAttribute("aria-expanded", "true");
    await sheet.getByRole("button", { name: `Use general lens for ${openingTarget.name}`, exact: true }).click();
    await expect(sheet.getByLabel(`general observation lens locked for ${openingTarget.name}`, { exact: true }))
      .toBeVisible();
    await sheet.getByRole("button", { name: "Close focus controls", exact: true }).click();
    expect(await page.evaluate((id) => {
      const session = (window as any).__GAME_STORE__.getState().activeSession;
      const player = session.players.find((candidate: any) => candidate.playerId === id);
      return { focused: player.isFocused, lens: player.currentLens,
        phaseFocused: player.focusedPhases.includes(session.currentPhaseIndex) };
    }, openingTarget.playerId)).toEqual({ focused: true, lens: "general", phaseFocused: true });
  };
  await focusOpeningTarget();

  const watchControls = page.getByTestId("mobile-observation-controls");
  await watchControls.getByRole("button", { name: "Next phase", exact: true }).click();
  // The three-phase opening's midpoint refreshes tokens and clears the first
  // focus. Renew it through the same real drawer before retaining the passage.
  await focusOpeningTarget();
  const openingPassage = await page.evaluate((playerId) => {
    const session = (window as any).__GAME_STORE__.getState().activeSession;
    const moment = session.phases[session.currentPhaseIndex].moments
      .find((candidate: any) => candidate.playerId === playerId && candidate.isStandout);
    const cue = session.cueReadings.find((candidate: any) => candidate.momentId === moment?.id);
    if (!moment || !cue) throw new Error("Opening player has no current standout passage and cue");
    return { momentId: moment.id as string, playerId: moment.playerId as string, detail: cue.detail as string };
  }, openingTarget.playerId);
  expect(openingPassage.playerId).toBe(openingTarget.playerId);
  // The authored lead can share this phase with another standout. Scope the
  // real public action to the card's exact player and displayed passage.
  const openingMomentCard = page.getByRole("region", { name: "What you noticed", exact: true })
    .locator("div.rounded-xl")
    .filter({ has: page.getByText(openingTarget.name, { exact: true }) })
    .filter({ has: page.getByText(openingPassage.detail, { exact: true }) });
  await expect(openingMomentCard).toHaveCount(1);
  await openingMomentCard.getByRole("button", { name: "Flag standout moment", exact: true }).click();
  await openingMomentCard.getByRole("button", { name: "Promising", exact: true }).click();
  expect(await page.evaluate(() =>
    (window as any).__GAME_STORE__.getState().activeSession.flaggedMoments.map((flag: any) => ({
      momentId: flag.moment.id, playerId: flag.moment.playerId, reaction: flag.reaction,
    })))).toEqual([{ momentId: openingPassage.momentId, playerId: openingTarget.playerId, reaction: "promising" }]);
  await page.getByRole("button", { name: /^Confirm the first read\b/ }).click();
  await watchControls.getByRole("button", { name: "Next phase", exact: true }).click();
  await watchControls.getByRole("button", { name: "Reflect", exact: true }).click();
  const earnedCue = await page.evaluate((momentId) => {
    const session = (window as any).__GAME_STORE__.getState().activeSession;
    return session.cueReadings.find((cue: any) => cue.momentId === momentId) ?? null;
  }, openingPassage.momentId);
  expect(earnedCue).toMatchObject({ playerId: openingTarget.playerId, momentId: openingPassage.momentId,
    questionId: "projection", lens: "general" });
  expect(["usable", "strong", "exceptional"]).toContain(earnedCue.clarity);
  expect(earnedCue.suggestedClassifications).toContain("preReceiveDecision");
  await testInfo.attach("earned-opening-cue.json", {
    body: JSON.stringify(earnedCue, null, 2), contentType: "application/json",
  });
  await page.screenshot({ path: testInfo.outputPath("earned-opening-reflection.png"), fullPage: true });
  await page.getByRole("group", { name: "What did this passage show?" })
    .getByRole("radio", { name: /^Decision before receiving\b/ }).check();
  expect(await page.evaluate((id) =>
    (window as any).__GAME_STORE__.getState().activeSession.evidenceDecisions[id]?.classification,
  earnedCue.id)).toBe("preReceiveDecision");
  await page.getByRole("button", { name: "Complete Reflection", exact: true }).click();
  await gamePage.waitForScreen("openingDiscovery");

  const sessionOutcome = await gamePage.page.evaluate(({ sessionId, cueId, playerId }) => {
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
    const openingJournal = state?.reflectionJournal?.[sessionId];
    const openingObservations = interactiveObservations.filter(
      (observation) => observation.sourceSessionId === sessionId,
    );
    const evidencePlayerIds = new Set(
      journalEntries.flatMap((entry) => (entry.evidenceCards ?? []).map((card: any) => card.playerId)),
    );
    return {
      observationCount: observations.length,
      discoveryCount: (state?.discoveryRecords ?? []).length,
      interactiveObservationCount: interactiveObservations.length,
      // Numeric observations intentionally omit the general lens. The durable
      // cue card retains that lens and the exact public reflection decision.
      openingEvidence: {
        sessionId: openingJournal?.sessionId ?? null,
        questionId: openingJournal?.scoutingQuestionId ?? null,
        card: openingJournal?.evidenceCards?.find((card: any) => card.id === cueId) ?? null,
        classification: openingJournal?.evidenceDecisions?.[cueId]?.classification ?? null,
        journalObservationIds: (openingJournal?.observationIds ?? []).slice().sort(),
        actualSessionObservationIds: openingObservations.map((observation) => observation.id).sort(),
        actualPlayerObservationIds: openingObservations
          .filter((observation) => observation.playerId === playerId)
          .map((observation) => observation.id).sort(),
        completionRecorded: completedIds.has(openingJournal?.activityInstanceId ?? sessionId),
      },
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
  }, { sessionId: earnedCue.sessionId, cueId: earnedCue.id, playerId: openingTarget.playerId });

  expect(
    sessionOutcome.observationCount > 0 || sessionOutcome.discoveryCount > 0,
  ).toBe(true);
  expect(sessionOutcome.interactiveObservationCount).toBeGreaterThan(0);
  expect(sessionOutcome.openingEvidence).toMatchObject({
    sessionId: earnedCue.sessionId, questionId: "projection",
    classification: "preReceiveDecision", completionRecorded: true,
  });
  expect(sessionOutcome.openingEvidence.card).toEqual({
    ...earnedCue, version: 1, sourceType: "liveObservation",
    classification: "preReceiveDecision",
    independenceKey: `session:${earnedCue.sessionId}:${openingTarget.playerId}:preReceiveDecision`,
  });
  expect(sessionOutcome.openingEvidence.actualPlayerObservationIds.length).toBeGreaterThan(0);
  expect(sessionOutcome.openingEvidence.journalObservationIds)
    .toEqual(sessionOutcome.openingEvidence.actualSessionObservationIds);
  await testInfo.attach("durable-opening-evidence.json", {
    body: JSON.stringify({ earnedCue, sessionOutcome }, null, 2), contentType: "application/json",
  });
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

  expect(latestReport?.playerId).toBe(openingTarget.playerId);
  expect(latestReport?.evidenceAssessment?.evidenceIds).toContain(earnedCue.id);
  expect(latestReport?.evidenceAssessment?.claims.some((claim: any) =>
    claim.support === "supported" && claim.evidenceIds.includes(earnedCue.id))).toBe(true);
  await testInfo.attach("first-earned-supported-report.json", {
    body: JSON.stringify(latestReport, null, 2), contentType: "application/json",
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
  const listReport = page.getByRole("button", { name: `List report for ${openingTarget.name} for sale`, exact: true });
  await expect(listReport).toBeEnabled();
  await listReport.click();
  const listingDialog = page.getByRole("dialog", { name: "List Report for Sale" });
  await listingDialog.getByLabel("Asking price (£)").fill("500");
  await listingDialog.getByRole("button", { name: "List for Sale", exact: true }).click();
  await expect(listingDialog).toBeHidden();
  const listing = await page.evaluate(() => {
    const state = (window as any).__GAME_STORE__.getState().gameState;
    return state.finances.reportListings.at(-1) ?? null;
  });
  expect(listing).toMatchObject({ reportId: latestReport.id, status: "active", price: 500 });
  await testInfo.attach("first-real-ui-listing.json", {
    body: JSON.stringify(listing, null, 2), contentType: "application/json",
  });
  await page.screenshot({ path: testInfo.outputPath("first-real-ui-listing.png"), fullPage: true });
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

  test("fresh youth career reaches first listed report through the real UI flow", async ({ gamePage }, testInfo) => {
    await createListedFirstReport(gamePage, "Journey", testInfo);

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

  test("the first listed youth report gets a bid next week and can be accepted", async ({ gamePage }, testInfo) => {
    await createListedFirstReport(gamePage, "Outcome", testInfo);

    const balanceBeforeBid = (await gamePage.getGameStateValue("finances.balance")) as number;

    await gamePage.navigateTo("calendar");
    await gamePage.advanceCanonicalWeek();
    expect(await gamePage.getGameStateValue("scout.specializationXp")).toBeGreaterThan(0);
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
