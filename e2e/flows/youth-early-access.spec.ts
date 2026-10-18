import type { Page, TestInfo } from "@playwright/test";
import type { GamePage } from "../fixtures";
import { test, expect } from "../fixtures";
import { SELECTORS } from "../helpers/selectors";
import { dismissTutorials, navigateToGame } from "../helpers/state-injection";
import { advanceGeneratedWatchToReflection, classifyDisplayedLeadEvidence, readOpeningLead, type WatchedLead } from "../helpers/generated-watch";

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

  // Every new Youth EA career begins inside its generated discovery session.
  // Dismissing tutorial overlays must not skip that gameplay hook.
  await gamePage.waitForScreen("observation", 30_000);
  if (!options.keepTutorials) await dismissTutorials(gamePage.page);
}

/** Read the real slot after normal autosave; never flush or fabricate evidence. */
async function readDurableAcceptance(page: Page, reportId?: string) {
  return page.evaluate((wantedReportId) => new Promise<any>((resolve, reject) => {
    const request = indexedDB.open("TalentScoutDB");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("saves", "readonly");
      const read = transaction.objectStore("saves").get(0);
      let result: unknown = null;
      read.onsuccess = () => {
        const row = read.result;
        const state = row?.state;
        if (!state) return;
        result = { careerInstanceId: state.careerInstanceId, storageRevision: row.storageRevision,
          lastSaved: state.lastSaved, report: wantedReportId ? state.reports?.[wantedReportId] : undefined,
          journal: state.reflectionJournal, completed: state.completedInteractiveSessions,
          listings: state.finances?.reportListings ?? [], balance: state.finances?.balance };
      };
      transaction.oncomplete = () => { db.close(); resolve(result); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  }), reportId);
}

async function retainRealWatch(gamePage: GamePage, lead: WatchedLead, testInfo: TestInfo, label: string) {
  const page = gamePage.page;
  const projection = page.getByRole("group", { name: "What are you here to learn?" })
    .getByRole("radio", { name: /^What might translate to the next level\?/ });
  await projection.locator("..").click();
  await expect(projection).toBeChecked();
  await page.locator('[data-tutorial-id="observation-begin-session"]').click();
  const watch = await advanceGeneratedWatchToReflection(page, { lead, focus: true });
  const selections = await classifyDisplayedLeadEvidence(page, lead);
  // Classification can rewrite a cue and peripheral attention can downgrade
  // it. Capture the final public card, rather than expecting raw cue wording.
  const displayedCards = await page.getByRole("group", { name: "What did this passage show?", exact: true })
    .evaluateAll((groups) => groups.map((group) => ({
      cueId: group.querySelector("input")?.getAttribute("name")?.replace(/^cue-classification-/, ""),
      text: group.closest("article")?.textContent ?? "",
    })));
  await testInfo.attach(`${label}-observed-cues.json`, {
    body: JSON.stringify({ lead, watch, selections, displayedCards }, null, 2), contentType: "application/json",
  });
  await page.screenshot({ path: testInfo.outputPath(`${label}-reflection.png`), fullPage: true });
  await page.getByRole("button", { name: "Complete Reflection", exact: true }).click();
  await expect.poll(() => gamePage.getCurrentScreen()).not.toBe("observation");
  const outcome = await page.evaluate(({ sessionId, playerId }) => {
    const state = (window as any).__GAME_STORE__.getState().gameState;
    const journal = state.reflectionJournal?.[sessionId];
    const observations = Object.values(state.observations ?? {}) as any[];
    const sessionObservations = observations.filter((observation) => observation.sourceSessionId === sessionId);
    const completed = new Set(state.completedInteractiveSessions ?? []);
    return { journal, observations: sessionObservations,
      completionRecorded: completed.has(journal?.activityInstanceId ?? sessionId),
      replacedFallbacks: observations.filter((observation) => observation.activityInstanceId
        && completed.has(observation.activityInstanceId) && !observation.sourceSessionId).length,
      leadDiscovered: Boolean(state.unsignedYouth[playerId]?.discoveredBy.includes(state.scout.id)),
      insightPoints: state.scout.insightState?.points ?? 0,
      specialization: { level: state.scout.specializationLevel, xp: state.scout.specializationXp },
      unlockedPerks: state.scout.unlockedPerks ?? [] };
  }, { sessionId: watch.sessionId, playerId: lead.playerId });
  expect(outcome.completionRecorded).toBe(true);
  expect(outcome.replacedFallbacks).toBe(0);
  expect(outcome.journal.sessionId).toBe(watch.sessionId);
  expect(outcome.journal.scoutingQuestionId).toBe("projection");
  expect(outcome.observations.length).toBeGreaterThan(0);
  expect(outcome.journal.observationIds.slice().sort()).toEqual(outcome.observations.map((item: any) => item.id).sort());
  expect(outcome.observations.some((item: any) => item.playerId === lead.playerId)).toBe(true);
  expect(outcome.leadDiscovered).toBe(true);
  for (const selection of selections) {
    const cue = watch.cues.find((candidate: any) => candidate.id === selection.cueId);
    expect(cue, "A public reflection choice must refer to a real session cue").toBeTruthy();
    const card = outcome.journal.evidenceCards.find((candidate: any) => candidate.id === selection.cueId);
    expect(card).toMatchObject({ id: cue.id, sessionId: cue.sessionId, momentId: cue.momentId,
      playerId: cue.playerId, minute: cue.minute, questionId: cue.questionId, lens: cue.lens,
      version: 1, sourceType: "liveObservation",
      classification: selection.classification,
      independenceKey: `session:${watch.sessionId}:${lead.playerId}:${selection.classification}` });
    const displayed = displayedCards.find((candidate) => candidate.cueId === card.id);
    expect(displayed, "Retained evidence must match a card actually shown after classification").toBeTruthy();
    expect(displayed!.text).toContain(card.summary);
    expect(displayed!.text).toContain(card.detail);
    expect(displayed!.text).toContain(card.clarity + " read");
    expect(outcome.journal.evidenceDecisions[selection.cueId].classification).toBe(selection.classification);
    if (["glimpse", "missed"].includes(cue.clarity)) expect(selection.classification).toBe("noConclusion");
  }
  await expect.poll(async () => {
    const saved = await readDurableAcceptance(page);
    return { careerInstanceId: saved?.careerInstanceId, journal: saved?.journal?.[watch.sessionId] };
  }, { timeout: 30_000 }).toMatchObject({ careerInstanceId: watch.careerInstanceId, journal: outcome.journal });
  await testInfo.attach(`${label}-durable-evidence.json`, {
    body: JSON.stringify({ lead, watch, selections, displayedCards, outcome,
      savedJournal: (await readDurableAcceptance(page))?.journal?.[watch.sessionId] }, null, 2),
    contentType: "application/json",
  });
  return { watch, selections, outcome };
}

/** Read the public Supported label; neither a promising flag nor a seed guarantees it. */
async function chooseInitialEvidence(page: Page) {
  await page.getByRole("button", { name: /^Evidence\b/ }).click();
  const options = await page.getByRole("group", { name: "Saved evidence" }).getByRole("radio")
    .evaluateAll((inputs) => inputs.map((input) => ({ value: (input as HTMLInputElement).value,
      label: input.closest("label")?.textContent?.trim() ?? "" })));
  expect(options.length).toBeGreaterThan(0);
  for (let index = 0; index < options.length; index++) {
    await page.getByRole("button", { name: /^Evidence\b/ }).click();
    await page.getByRole("group", { name: "Saved evidence" }).getByRole("radio").nth(index).locator("..").click();
    const supported = page.getByRole("group", { name: "What it suggests" }).locator("label")
      .filter({ hasText: /· Supported\b/ }).first();
    if (await supported.isVisible()) {
      const claimLabel = await supported.innerText();
      await supported.click();
      return { evidenceId: options[index].value, evidenceLabel: options[index].label,
        claimLabel, supported: true, options };
    }
  }
  // Keep an inconclusive first look as a private monitoring decision. Returning
  // false never bypasses commercial acceptance: the caller must earn more views.
  await page.getByRole("button", { name: /^Evidence\b/ }).click();
  await page.getByRole("group", { name: "Saved evidence" }).getByRole("radio").first().locator("..").click();
  const withhold = page.getByRole("group", { name: "What it suggests" })
    .getByRole("radio", { name: /^Record it without a conclusion/ });
  const claimLabel = await withhold.locator("..").innerText();
  await withhold.locator("..").click();
  return { evidenceId: options[0].value, evidenceLabel: options[0].label,
    claimLabel, supported: false, options };
}

async function fileAvailableAssessment(gamePage: GamePage, testInfo: TestInfo, label: string) {
  const page = gamePage.page;
  const file = page.getByRole("button", { name: "File initial assessment", exact: true });
  let choice: { evidenceId: string; supported: boolean; [key: string]: unknown };
  if (await file.isVisible()) {
    choice = await chooseInitialEvidence(page);
    await page.getByRole("group", { name: "What remains untested" }).getByRole("radio").first().locator("..").click();
    await page.getByRole("group", { name: "Next test" }).getByRole("radio").first().locator("..").click();
    await page.getByRole("group", { name: "Recommended action" }).getByRole("radio", {
      name: choice.supported ? /^Test in harder context\b/ : /^Keep private\b/,
    }).locator("..").click();
    await page.getByRole("group", { name: "Confidence" }).getByRole("radio", {
      name: choice.supported ? /^Working\b/ : /^Tentative\b/,
    }).locator("..").click();
    await expect(file).toBeEnabled();
    await testInfo.attach(`${label}-public-report-decision.json`, {
      body: JSON.stringify(choice, null, 2), contentType: "application/json",
    });
    await file.click();
  } else {
    // A later real brief can promote the writer to its professional workflow.
    // Inspect the displayed cue options, then let the shared public UI helper
    // complete that form with the observed cue rather than an old inconclusion.
    const build = page.getByRole("tab", { name: /^Build the case\b/ });
    if (await build.isVisible()) await build.click();
    let evidenceId: string | null = null;
    for (const categoryName of ["Development potential", "Tactical role fit", "Character and adaptation risk"]) {
      const category = page.getByRole("group", { name: categoryName, exact: true });
      const assess = category.getByRole("radio", { name: "Interpret a saved cue", exact: true });
      if (!await assess.isEnabled()) continue;
      await assess.locator("..").click();
      const supportedOption = category.getByLabel("Supporting cue").getByRole("option")
        .filter({ hasText: /(?:Usable|Strong|Exceptional) evidence:/ }).first();
      if (await supportedOption.count()) {
        evidenceId = await supportedOption.getAttribute("value");
        break;
      }
    }
    choice = { evidenceId: evidenceId ?? "", supported: evidenceId !== null };
    await gamePage.submitCurrentReportViaUI(evidenceId ? "recommend" : "note", {
      preferredEvidenceId: evidenceId ?? undefined,
    });
  }
  await expect.poll(() => gamePage.getCurrentScreen()).not.toBe("reportWriter");
  const report = await page.evaluate(() => (Object.values(
    (window as any).__GAME_STORE__.getState().gameState.reports) as any[]).at(-1));
  expect(report).toBeTruthy();
  if (choice.supported) {
    expect(report.evidenceAssessment.claims.some((claim: any) =>
      claim.support === "supported" && claim.evidenceIds.includes(choice.evidenceId))).toBe(true);
  } else {
    expect(report.evidenceAssessment.claims.some((claim: any) => claim.support === "supported")).toBe(false);
    expect(report.recommendedAction).toBe("monitor");
    expect(await gamePage.getGameStateValue("finances.reportListings")).toEqual([]);
  }
  await expect.poll(async () => (await readDurableAcceptance(page, report.id))?.report,
    { timeout: 30_000 }).toEqual(report);
  await testInfo.attach(`${label}-filed-report.json`, {
    body: JSON.stringify({ choice, report }, null, 2), contentType: "application/json",
  });
  return { report, choice };
}

async function openLeadProfile(gamePage: GamePage, lead: WatchedLead) {
  await gamePage.navigateTo("youthScouting");
  await gamePage.page.getByRole("button", { name: `View profile for ${lead.name}`, exact: true }).first().click();
  await gamePage.waitForScreen("playerProfile");
}

async function ensureLeadFollowUp(gamePage: GamePage, lead: WatchedLead) {
  const alreadyBooked = await gamePage.page.evaluate((playerId) =>
    (window as any).__GAME_STORE__.getState().gameState.schedule.activities.some((activity: any) =>
      activity?.type === "followUpSession" && activity.targetId === playerId), lead.playerId);
  if (!alreadyBooked) {
    await openLeadProfile(gamePage, lead);
    await gamePage.page.getByRole("button", { name: "Plan next observation", exact: true }).click();
    await gamePage.waitForScreen("calendar");
    await gamePage.page.getByRole("button", { name: "Choose a day for this work", exact: true }).click();
    const place = gamePage.page.getByRole("button", { name: /^Place Follow-up Session on / }).and(gamePage.page.locator("button:enabled"));
    await place.first().click();
  }
  await gamePage.navigateTo("calendar");
  await expect(gamePage.page.locator('[data-activity-type="followUpSession"]')
    .getByTestId("planner-activity-target").filter({ hasText: lead.name })).toBeVisible();
}

async function createListedFirstReport(gamePage: GamePage, scoutLastName: string, testInfo: TestInfo) {
  await startFreshYouthCareer(gamePage, scoutLastName);
  const page = gamePage.page;
  await expect(page.locator('[data-tutorial-id="nav-calendar"]')).toHaveCount(0);
  const lead = await readOpeningLead(page);
  const opening = await retainRealWatch(gamePage, lead, testInfo, "opening");
  expect(opening.outcome.insightPoints).toBeGreaterThan(0);
  expect(opening.outcome.unlockedPerks).toContain("youth_grassroots_access");
  expect(opening.outcome.unlockedPerks).not.toContain("youth_academy_access");
  await gamePage.waitForScreen("openingDiscovery");
  await page.getByRole("button", { name: /Keep the name private/ }).click();
  await gamePage.waitForScreen("reportWriter");
  let filed = await fileAvailableAssessment(gamePage, testInfo, "opening");
  expect(filed.report.playerId).toBe(lead.playerId);
  expect(filed.report.evidenceAssessment.kind).toBe("initial");
  expect(filed.report.craftBreakdown.observationDepth).toBeGreaterThan(0);
  expect(filed.report.qualityBreakdown).toBeUndefined();
  expect(filed.report.postTransferRating).toBeUndefined();
  expect(Array.isArray(filed.report.strengths)).toBe(true);
  expect((filed.report.weaknesses ?? []).every((value: unknown) => typeof value === "string" && value.length > 0)).toBe(true);
  const openingFollowUpBooked = await page.evaluate((playerId) =>
    (window as any).__GAME_STORE__.getState().gameState.schedule.activities.some((activity: any) =>
      activity?.type === "followUpSession" && activity.targetId === playerId), lead.playerId);
  expect(openingFollowUpBooked, "The initial assessment must schedule its promised next test").toBe(true);

  const earnedSessions = [opening.watch.sessionId];
  for (let visit = 1; !filed.choice.supported && visit <= 3; visit++) {
    await ensureLeadFollowUp(gamePage, lead);
    const earnedBefore = earnedSessions.length;
    await gamePage.advanceCanonicalWeek({ launchLiveSession: true,
      completeLiveSession: async (livePage) => {
        const containsLead = await livePage.page.evaluate((playerId) =>
          (window as any).__GAME_STORE__.getState().activeSession.players.some((player: any) => player.playerId === playerId), lead.playerId);
        if (!containsLead) { await livePage.completeObservationViaUI(); return; }
        const earned = await retainRealWatch(livePage, lead, testInfo, `follow-up-${visit}`);
        earnedSessions.push(earned.watch.sessionId);
        await livePage.waitForScreen("weekSimulation");
      },
    });
    expect(earnedSessions.length, "The booked follow-up must be watched, not quick-simulated").toBeGreaterThan(earnedBefore);
    await openLeadProfile(gamePage, lead);
    await page.getByText("Player actions & contacts", { exact: true }).click();
    await page.getByRole("button", { name: /^(Write Report|Record an inconclusive report)$/ }).click();
    await gamePage.waitForScreen("reportWriter");
    filed = await fileAvailableAssessment(gamePage, testInfo, `follow-up-${visit}`);
  }
  expect(filed.choice.supported,
    "A commercial report must be earned through an actual opening/follow-up; see observed cue artifacts if still inconclusive")
    .toBe(true);
  const latestReport = filed.report;
  expect(latestReport.playerId).toBe(lead.playerId);
  expect(latestReport.evidenceAssessment.evidenceIds).toContain(filed.choice.evidenceId);
  const sourceEvidence = await page.evaluate((cueId) => {
    const state = (window as any).__GAME_STORE__.getState().gameState;
    return (Object.values(state.reflectionJournal) as any[])
      .flatMap((entry: any) => entry.evidenceCards).find((card: any) => card.id === cueId);
  }, filed.choice.evidenceId);
  expect(sourceEvidence.playerId).toBe(lead.playerId);
  expect(earnedSessions).toContain(sourceEvidence.sessionId);
  expect(sourceEvidence.classification).not.toBe("noConclusion");
  expect(["usable", "strong", "exceptional"]).toContain(sourceEvidence.clarity);
  await testInfo.attach("first-earned-supported-report.json", {
    body: JSON.stringify({ lead, earnedSessions, sourceEvidence, latestReport }, null, 2), contentType: "application/json",
  });

  // Filing never silently lists the report. Listing is an explicit real action.
  expect(await gamePage.getGameStateValue("finances.reportListings")).toEqual([]);
  await gamePage.navigateTo("reportHistory");
  const listReport = page.getByRole("button", { name: `List report for ${lead.name} for sale`, exact: true })
    .and(page.locator("button:enabled"));
  await expect(listReport).toHaveCount(1);
  await expect(listReport).toBeEnabled();
  await listReport.click();
  const dialog = page.getByRole("dialog", { name: "List Report for Sale" });
  await dialog.getByLabel("Asking price (£)").fill("500");
  await dialog.getByRole("button", { name: "List for Sale", exact: true }).click();
  await expect(dialog).toBeHidden();
  const listing = await page.evaluate(() => (window as any).__GAME_STORE__.getState().gameState.finances.reportListings.at(-1));
  expect(listing).toMatchObject({ reportId: latestReport.id, status: "active", price: 500 });
  await expect.poll(async () => (await readDurableAcceptance(page, latestReport.id))?.listings
    .find((candidate: any) => candidate.id === listing.id), { timeout: 30_000 }).toEqual(listing);
  await testInfo.attach("first-real-ui-listing.json", {
    body: JSON.stringify({ listing, durable: await readDurableAcceptance(page, latestReport.id) }, null, 2), contentType: "application/json",
  });
  await page.screenshot({ path: testInfo.outputPath("first-real-ui-listing.png"), fullPage: true });
  return { lead, reportId: latestReport.id, listingId: listing.id,
    openingSpecialization: opening.outcome.specialization, openingFollowUpBooked };
}

test.describe("Youth Early Access", () => {
  test.setTimeout(300_000);

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
    const journey = await createListedFirstReport(gamePage, "Outcome", testInfo);

    const specializationBefore = journey.openingSpecialization;
    expect(journey.openingFollowUpBooked).toBe(true);

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
    const balanceBeforeBid = (await gamePage.getGameStateValue("finances.balance")) as number;
    await gamePage.page.getByRole("button", { name: /^Accept Bid$/ }).click();

    const postSaleState = await gamePage.page.evaluate((listingId) => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      const listings = state?.finances?.reportListings ?? [];
      const latestListing = listings.find((listing: any) => listing.id === listingId);
      return {
        balance: state?.finances?.balance ?? 0,
        listingStatus: latestListing?.status ?? null,
        acceptedAmount: (latestListing?.bids ?? []).filter((bid: any) => bid.status === "accepted")
          .reduce((total: number, bid: any) => total + bid.amount, 0),
        acceptedBidCount: latestListing?.bids?.filter(
          (bid: { status: string }) => bid.status === "accepted",
        ).length ?? 0,
      };
    }, journey.listingId);

    expect(postSaleState.acceptedAmount).toBeGreaterThan(0);
    expect(postSaleState.balance - balanceBeforeBid).toBe(postSaleState.acceptedAmount);
    expect(postSaleState.listingStatus).toBe("active");
    expect(postSaleState.acceptedBidCount).toBe(1);

    await expect.poll(async () => {
      const saved = await readDurableAcceptance(gamePage.page, journey.reportId);
      const listing = saved?.listings.find((candidate: any) => candidate.id === journey.listingId);
      return { balance: saved?.balance, status: listing?.status,
        acceptedBidCount: listing?.bids.filter((bid: any) => bid.status === "accepted").length };
    }, { timeout: 30_000 }).toEqual({ balance: postSaleState.balance, status: "active", acceptedBidCount: 1 });
    await testInfo.attach("accepted-bid-durable.json", {
      body: JSON.stringify({ postSaleState, saved: await readDurableAcceptance(gamePage.page, journey.reportId) }, null, 2),
      contentType: "application/json",
    });
    await gamePage.page.screenshot({ path: testInfo.outputPath("accepted-real-youth-report-bid.png"), fullPage: true });


    gamePage.expectNoConsoleErrors();
  });
});

