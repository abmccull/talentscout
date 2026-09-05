import AxeBuilder from "@axe-core/playwright";
import { dismissCareerMomentOverlays, expect, test, type GamePage } from "../fixtures";
import { firstLoopTelemetry } from "../helpers/firstLoopTelemetry";

test.describe("guided opening discovery hook", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("talentscout_tutorial");
      localStorage.removeItem("talentscout_player_experience");
    });
  });

  test("quick start reaches an uncertain discovery and persistent consequence through real UI", async ({ page, gamePage }, testInfo) => {
    const telemetry = firstLoopTelemetry(page, "guided-opening");
    const missingResources: string[] = [];
    page.on("response", (response) => {
      if (response.status() === 404) missingResources.push(response.url());
    });
    // Capture launch assets as well as requests made later in the assignment.
    await page.goto("/play", { waitUntil: "domcontentloaded" });
    await expect.poll(() => page.evaluate(() => JSON.parse(
      localStorage.getItem("talentscout_audio") ?? "null",
    ))).toMatchObject({
      mixVersion: 2,
      master: 0.75,
      music: 0.35,
      sfx: 0.8,
      ambience: 0.35,
    });
    await expect(page.getByText(/Youth Scout Career .+ Early Access/)).toBeVisible();
    await expect(page.getByText(/Discover young players\. Build the evidence\. Back your judgement\./i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Start Youth Scout Career" })).toBeVisible();
    await telemetry.mark("cold-menu");
    // An empty menu offers a new career; save actions appear only for real saves.
    const emptyContinue = page.getByRole("button", { name: "Continue Career", exact: true, includeHidden: true });
    const emptyLoad = page.getByRole("button", { name: "Load Career", exact: true, includeHidden: true });
    await expect(emptyContinue).toBeHidden();
    await expect(emptyContinue).toBeDisabled();
    await expect(emptyLoad).toBeHidden();
    await expect(emptyLoad).toBeDisabled();
    await expect(page.getByRole("button", { name: "What's Coming" })).toBeVisible();
    await expect(page.getByText(/core loop is proven|scouting specialization|will return after/i)).toHaveCount(0);
    const desktopMenuAxe = await new AxeBuilder({ page }).analyze();
    expect(
      desktopMenuAxe.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical",
      ),
    ).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("main-menu-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("button", { name: "Start Youth Scout Career" })).toBeVisible();
    await expect(emptyContinue).toBeHidden();
    await expect(emptyLoad).toBeHidden();
    const mobileMenuAxe = await new AxeBuilder({ page }).analyze();
    expect(
      mobileMenuAxe.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical",
      ),
    ).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("main-menu-mobile.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.getByRole("button", { name: "Start Youth Scout Career" }).click();
    await page.locator("#scout-first-name").fill("Ava");
    await page.locator("#scout-last-name").fill("Morgan");

    await expect(page.getByText("Your first scouting assignment", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "A trusted contact has spotted someone." })).toBeVisible();
    await expect(page.getByText(/A school match is underway\./)).toBeVisible();
    await expect(page.getByText(/^Your edge:/)).toHaveCount(4);
    await expect(page.getByText(/first case:|guided opening|one important call|first decision in under five minutes|career DNA|observation beats|irreversible call/i)).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("opening-start-desktop.png"),
      fullPage: true,
    });

    const persona = page.getByRole("button", { name: /Projection Specialist/ }).first();
    await persona.click();
    await expect(persona).toHaveAttribute("aria-pressed", "true");

    const beginAssignment = page.getByRole("button", { name: "Take the call" });
    await beginAssignment.scrollIntoViewIfNeeded();
    await expect(beginAssignment).toBeEnabled();
    await beginAssignment.click();

    await gamePage.waitForScreen("observation", 60_000);
    await telemetry.mark("first-watch");
    await expect(page.getByRole("heading", { name: "The match started early." })).toBeVisible();
    await expect(page.getByText(/No academy scout is here yet\./i)).toBeVisible();
    await expect(page.getByRole("button", { name: /End (Session )?Early/i })).toHaveCount(0);

    await page.getByRole("button", { name: "Watch the match" }).click();
    const technicalLens = page.getByRole("button", { name: /^Use technical lens for / });
    await technicalLens.focus();
    // Escape belongs to the control that owns focus; an inline lens is not a modal.
    await expect(technicalLens).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(technicalLens).toBeFocused();
    await expect(page.getByRole("dialog", { name: "Choose your focus" })).toHaveCount(0);
    await page.keyboard.press("Enter");
    const releaseFocus = page.getByRole("button", { name: /^Remove focus from / }).first();
    await expect(releaseFocus).toBeFocused();
    await expect.poll(() => page.evaluate(() => {
      const state = (window as any).__GAME_STORE__.getState();
      const target = state.activeSession.players.find(
        (player: any) => player.playerId === state.gameState.openingCase.playerId,
      );
      return { focused: target?.isFocused, lens: target?.currentLens };
    })).toEqual({ focused: true, lens: "technical" });

    // The Watch room omits workspace navigation at both viewport sizes.
    await expect(page.locator('[data-tutorial-id="nav-calendar"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open navigation menu" })).toHaveCount(0);

    await page.evaluate(() => {
      (window as any).__GAME_STORE__.setState({ currentScreen: "calendar" });
    });
    await gamePage.waitForScreen("calendar");
    await expect(page.locator('[data-tutorial-id="nav-dashboard"]')).toBeDisabled();
    await expect(page.getByText(/Guided assignment in progress/i)).toBeVisible();
    const returnToStep = page.getByRole("button", { name: "Return to guided step" });
    await expect(returnToStep).toBeVisible();
    await returnToStep.click();
    await gamePage.waitForScreen("observation");
    await expect(page.locator('[data-tutorial-id="observation-advance-to-standout"]:visible')).toBeVisible();
    await page.waitForTimeout(250);
    const desktopGuidanceLayout = await page.evaluate(() => {
      const target = Array.from(document.querySelectorAll<HTMLElement>(
        '[data-tutorial-id="observation-advance-to-standout"]',
      )).find((element) => element.getBoundingClientRect().width > 0);
      const mentor = document.querySelector<HTMLElement>('[aria-label="Mentor: Keep watching"]');
      const targetRect = target?.getBoundingClientRect();
      const mentorRect = mentor?.getBoundingClientRect();
      return {
        viewportHeight: window.innerHeight,
        target: targetRect ? { top: targetRect.top, bottom: targetRect.bottom } : null,
        mentor: mentorRect ? { top: mentorRect.top, bottom: mentorRect.bottom } : null,
      };
    });
    expect(desktopGuidanceLayout.target).not.toBeNull();
    expect(desktopGuidanceLayout.target!.top).toBeGreaterThanOrEqual(0);
    expect(desktopGuidanceLayout.target!.bottom).toBeLessThanOrEqual(desktopGuidanceLayout.viewportHeight);
    expect(desktopGuidanceLayout.mentor).not.toBeNull();
    expect(desktopGuidanceLayout.mentor!.top).toBeGreaterThanOrEqual(0);
    expect(desktopGuidanceLayout.mentor!.bottom).toBeLessThanOrEqual(desktopGuidanceLayout.viewportHeight);

    await page.screenshot({
      path: testInfo.outputPath("tutorial-next-action-desktop.png"),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('[data-tutorial-id="mobile-nav-calendar"]')).toHaveCount(0);
    const watchingMentor = page.getByLabel("Mentor: Keep watching", { exact: true });
    await expect(watchingMentor).toBeVisible();
    await expect(watchingMentor).not.toHaveAttribute("aria-modal", "true");
    const mobileAxe = await new AxeBuilder({ page }).analyze();
    expect(
      mobileAxe.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical",
      ),
    ).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("tutorial-next-action-mobile.png"),
      fullPage: true,
    });

    const nextGuidedPhase = page.locator(
      '[data-tutorial-id="observation-advance-to-standout"]:visible',
    );
    await expect(nextGuidedPhase).toContainText(/Next phase/i);
    await nextGuidedPhase.click();
    await page.setViewportSize({ width: 1280, height: 720 });

    const evidence = page.locator('[data-tutorial-id="observation-evidence-feed"]');
    await expect(evidence.getByText("Standout moment", { exact: true })).toBeVisible();
    const flagMoment = page.locator('[data-tutorial-id="observation-flag-moment"]:visible');
    await expect(flagMoment).toContainText("Flag moment");
    await page.waitForTimeout(150);
    await page.screenshot({
      path: testInfo.outputPath("tutorial-flag-moment-desktop.png"),
    });
    await flagMoment.click();
    const promising = page.locator('[data-tutorial-id="observation-promising-reaction"]:visible');
    await expect(promising).toHaveText("Promising");
    await page.waitForTimeout(100);
    await page.screenshot({
      path: testInfo.outputPath("tutorial-promising-desktop.png"),
    });
    await promising.click();
    await expect(evidence.getByLabel("Flagged", { exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const state = (window as any).__GAME_STORE__.getState();
      return state.activeSession.flaggedMoments.filter((flagged: any) =>
        flagged.moment.playerId === state.gameState.openingCase.playerId
        && flagged.moment.isStandout
        && flagged.reaction === "promising",
      ).length;
    })).toBe(1);

    const halftimeApproach = page.getByRole("button", { name: /^Confirm the first read\b/ });
    await expect(halftimeApproach).toBeVisible();
    await halftimeApproach.click();
    await page.getByTestId("mobile-observation-controls").getByRole("button", { name: "Next phase", exact: true }).click();
    await expect.poll(() => page.evaluate(() =>
      (window as any).__GAME_STORE__.getState().activeSession.currentPhaseIndex,
    )).toBe(2);
    await expect(evidence.getByRole("heading", { name: "What you noticed" })).toBeVisible();
    await page.getByTestId("mobile-observation-controls").getByRole("button", { name: "Reflect on the watch", exact: true }).click();

    const evidenceInterpretation = page.getByRole("group", { name: "What did this passage show?" });
    await expect(evidenceInterpretation).toBeVisible();
    await evidenceInterpretation.getByRole("radio").first().check();

    const completeReflection = page.getByRole("button", { name: "Complete Reflection" });
    await expect(completeReflection).toBeVisible();
    await expect.poll(async () => completeReflection.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      return rect.top >= 12 && rect.bottom <= window.innerHeight - 12;
    })).toBe(true);
    await expect(page.locator('[data-tutorial-id="observation-complete-reflection"]')).toBeVisible();
    await expect.poll(async () => page.evaluate(() => {
      const button = document.querySelector<HTMLElement>(
        '[data-tutorial-id="observation-complete-reflection"]',
      );
      const mentor = document.querySelector<HTMLElement>(
        '[aria-label="Mentor: Complete the observation session"]',
      );
      if (!button || !mentor) return false;
      const buttonRect = button.getBoundingClientRect();
      const mentorRect = mentor.getBoundingClientRect();
      const overlapWidth = Math.max(
        0,
        Math.min(buttonRect.right, mentorRect.right) - Math.max(buttonRect.left, mentorRect.left),
      );
      const overlapHeight = Math.max(
        0,
        Math.min(buttonRect.bottom, mentorRect.bottom) - Math.max(buttonRect.top, mentorRect.top),
      );
      return overlapWidth * overlapHeight === 0;
    })).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("tutorial-complete-reflection-desktop.png"),
    });
    await completeReflection.click();

    await gamePage.waitForScreen("openingDiscovery");
    const openingDecision = page.getByTestId("opening-discovery");
    await expect(openingDecision).toBeVisible();
    await expect(page.getByText("Write the name down", { exact: true })).toBeVisible();
    await expect(page.getByText(/One exceptional action is a lead, not proof/i)).toBeVisible();
    await expect(page.getByText("Your next move", { exact: true })).toBeVisible();
    await expect(page.getByText(/Your choice affects access, discretion, and trust\./i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "The open question", exact: true })).toBeVisible();
    await expect(openingDecision.getByText(/\bthe game\b|your reputation decision|each choice changes access|early access can become/i)).toHaveCount(0);
    const openingDecisionAxe = await new AxeBuilder({ page }).analyze();
    expect(
      openingDecisionAxe.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical",
      ),
    ).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("opening-decision-desktop.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText("Your next move", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Keep the name private/ })).toBeVisible();
    const openingDecisionMobileAxe = await new AxeBuilder({ page }).analyze();
    expect(
      openingDecisionMobileAxe.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical",
      ),
    ).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("opening-decision-mobile.png"),
      fullPage: true,
    });
    await page.setViewportSize({ width: 806, height: 691 });
    const decisionMentor = page.getByLabel("Mentor: Decide who hears the name", { exact: true });
    await expect(decisionMentor).toBeVisible();
    const hideDecisionHelp = decisionMentor.getByRole("button", { name: "Hide mentor help", exact: true });
    const showDecisionHelp = decisionMentor.getByRole("button", { name: "Show mentor help", exact: true });
    // Resize measurement may replace automatic compact help with the expanded
    // panel. Normalize that transient state before testing manual collapse.
    await expect(async () => {
      if (await hideDecisionHelp.isVisible()) return;
      await showDecisionHelp.click({ timeout: 500 });
      await expect(hideDecisionHelp).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 5_000, intervals: [100, 250] });
    // These user actions must all execute; geometry cannot undo manual collapse.
    await hideDecisionHelp.click();
    await expect(showDecisionHelp).toBeVisible();
    await showDecisionHelp.click();
    await expect(hideDecisionHelp).toBeVisible();
    await hideDecisionHelp.click();
    await expect(showDecisionHelp).toBeVisible();
    const choices = page.getByRole("group", { name: "Choose what to do with the lead" }).getByRole("button");
    await expect(choices).toHaveCount(3);
    for (const choice of await choices.all()) {
      await choice.scrollIntoViewIfNeeded();
      await expect.poll(() => choice.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return hit !== null && button.contains(hit);
      })).toBe(true);
    }
    await expect.poll(() => page.evaluate(() => JSON.parse(
      localStorage.getItem("talentscout_tutorial") ?? "null",
    )?.dismissed)).toBe(false);
    await page.screenshot({ path: testInfo.outputPath("opening-decision-tablet.png"), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 720 });

    await page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const serialized = JSON.parse(JSON.stringify(store.getState().gameState));
      store.getState().loadGame(serialized);
    });
    await gamePage.waitForScreen("openingDiscovery");
    await expect(page.getByTestId("opening-discovery")).toBeVisible();

    await page.getByRole("button", { name: /Keep the name private/ }).click();
    await gamePage.waitForScreen("reportWriter");
    await telemetry.mark("first-report");
    await expect(page.getByRole("heading", { name: "Write Scouting Report" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Saved evidence" })).toBeVisible();
    await expect(page.getByText("Answer a real club need")).toHaveCount(0);
    await expect(page.getByLabel(/Ask (Margaret|Tommy) for help/i)).toHaveCount(0);

    const persisted = await page.evaluate(() => {
      const state = (window as any).__GAME_STORE__.getState().gameState;
      const openingCase = state.openingCase;
      const decision = state.consequenceState.decisions[openingCase.decisionId];
      return {
        stage: openingCase.stage,
        choice: openingCase.selectedChoiceId,
        discovered: state.discoveryRecords.filter(
          (record: any) => record.playerId === openingCase.playerId,
        ).length,
        selectedOptionId: decision?.selectedOptionId,
        scheduledStages: Object.values(state.consequenceState.consequences)
          .filter((item: any) => item.decisionId === openingCase.decisionId)
          .length,
      };
    });
    expect(persisted).toMatchObject({
      stage: "report",
      choice: "protect",
      discovered: 1,
      selectedOptionId: "protect",
    });
    expect(persisted.scheduledStages).toBeGreaterThanOrEqual(2);

    const axe = await new AxeBuilder({ page }).analyze();
    expect(
      axe.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical",
      ),
    ).toEqual([]);
    await gamePage.submitCurrentReportViaUI("note");
    await gamePage.waitForScreen("calendar");
    await telemetry.mark("first-filing");
    await expect(page.locator('[data-tutorial-id="report-marketplace-prompt"]')).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /Planner/i })).toBeVisible();

    const latestReport = await page.evaluate(() => {
      const state = (window as any).__GAME_STORE__.getState().gameState;
      const reports = Object.values(state?.reports ?? {}) as any[];
      return reports.at(-1) ?? null;
    });
    expect(latestReport).not.toBeNull();
    expect(latestReport.evidenceAssessment?.kind).toBe("initial");
    expect(latestReport.evidenceAssessment?.evidenceIds.length).toBeGreaterThan(0);
    expect(latestReport.evidenceAssessment?.unknowns.length).toBeGreaterThan(0);
    expect(latestReport.summary).toContain("At ");
    expect(latestReport.summary).not.toMatch(/\bthe game\b/i);
    expect(latestReport.briefId ?? null).toBeNull();
    expect(missingResources, "The opening flow requested missing production assets").toEqual([]);
    await telemetry.finish();
    gamePage.expectNoConsoleErrors();
  });
});

async function readUnguidedCheckpoint(page: GamePage['page']) {
  return page.evaluate(() => new Promise<any>((resolve, reject) => {
    const opening = indexedDB.open('TalentScoutDB');
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const read = db.transaction('saves', 'readonly').objectStore('saves').get(0);
      read.onerror = () => { db.close(); reject(read.error); };
      read.onsuccess = () => {
        const state = read.result?.state;
        db.close();
        resolve(JSON.parse(JSON.stringify({
          requested: state?.guidedSessionRequested,
          week: state?.currentWeek,
          season: state?.currentSeason,
          schedule: state?.schedule,
          reports: state?.reports,
          session: state?.activeObservationSession,
        })));
      };
    };
  }));
}

async function expectUnguidedNavigation(page: GamePage['page']) {
  await expect.poll(() => page.evaluate(() => ({
    requested: (window as any).__GAME_STORE__.getState().gameState.guidedSessionRequested,
    locked: [...document.querySelectorAll('button[title]')].some((button) =>
      button.getAttribute('title') === 'Finish the highlighted tutorial step first'),
  }))).toEqual({ requested: false, locked: false });
}

async function startResponsiveAssessmentCareer(gamePage: GamePage, name: string) {
  const { page } = gamePage;
  await page.goto('/play', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Start Youth Scout Career', exact: true }).click();
  await page.locator('#scout-first-name').fill(name);
  await page.locator('#scout-last-name').fill('Visual');
  await page.getByRole('radio', { name: /^Start without the guide/ }).locator('..').click();
  await page.getByRole('button', { name: /Projection Specialist/ }).click();
  await page.getByRole('button', { name: 'Take the call', exact: true }).click();
  await gamePage.waitForScreen('observation');
}

async function expectNoAutomaticGuidance(page: GamePage['page']) {
  // First-visit navigation can schedule guidance at 300/800ms. Inspect after
  // both timers have had a chance to fire, before a hint's 15s auto-dismiss.
  await page.waitForTimeout(1_000);
  await expect.poll(() => page.evaluate(() => {
    const game = (window as any).__GAME_STORE__.getState().gameState;
    const tutorial = (window as any).__TUTORIAL_STORE__.getState();
    return {
      requested: game.guidedSessionRequested,
      tutorialActive: tutorial.tutorialActive,
      guidedSessionActive: tutorial.guidedSessionActive,
      activeScreenGuide: tutorial.activeScreenGuide,
      activeHint: tutorial.activeHint,
      pendingScreenGuide: tutorial.pendingScreenGuide,
    };
  })).toEqual({
    requested: false,
    tutorialActive: false,
    guidedSessionActive: false,
    activeScreenGuide: null,
    activeHint: null,
    pendingScreenGuide: null,
  });
  // These surfaces do not share MentorOverlay's aria-label convention.
  await expect(page.getByRole('status', { name: /^Hint from / })).toHaveCount(0);
  await expect(page.locator('[role="complementary"][aria-labelledby="screen-guide-title"]')).toHaveCount(0);
  await expect(page.locator('#screen-guide-title')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Dismiss hint', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Close screen guide', exact: true })).toHaveCount(0);
  await expect(page.getByLabel(/^Mentor:/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show mentor help', exact: true })).toHaveCount(0);
}

async function expectManualHelpAvailable(page: GamePage['page'], screen: 'dashboard' | 'calendar', firstTitle: string) {
  const ask = page.getByRole('button', { name: /^Ask (Tommy|Margaret) for help$/ });
  await expect(ask).toBeVisible();
  await expect(ask).toBeEnabled();
  await ask.click();
  const panel = page.locator('[role="complementary"][aria-labelledby="screen-guide-title"]');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('heading', { name: firstTitle, exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const tutorial = (window as any).__TUTORIAL_STORE__.getState();
    return {
      activeScreenGuide: tutorial.activeScreenGuide,
      tutorialActive: tutorial.tutorialActive,
      guidedSessionActive: tutorial.guidedSessionActive,
      activeHint: tutorial.activeHint,
      pendingScreenGuide: tutorial.pendingScreenGuide,
    };
  })).toEqual({ activeScreenGuide: screen, tutorialActive: false, guidedSessionActive: false, activeHint: null, pendingScreenGuide: null });
  await panel.getByRole('button', { name: 'Close screen guide', exact: true }).click();
  await expectNoAutomaticGuidance(page);
  await expect(ask).toBeEnabled();
}

async function openAssessmentStep(page: GamePage['page'], step: string) {
  const heading = page.getByRole('button', { name: new RegExp(`^${step}\\b`) });
  await expect(heading).toBeEnabled();
  await heading.click();
  await expect(heading).toHaveAttribute('aria-expanded', 'true');
}

async function expectAssessmentProgress(page: GamePage['page'], completed: number) {
  await expect(page.getByText(`${completed} / 5 decisions`, { exact: true })).toBeVisible();
  const native = await page.evaluate(() => {
    const names = ['Saved evidence', 'What it suggests', 'What remains untested', 'Next test', 'Recommended action', 'Confidence'];
    const groups = Array.from(document.querySelectorAll('fieldset')).filter((field) =>
      names.includes(field.querySelector('legend')?.textContent?.trim() ?? ''),
    );
    const checked = names.map((name) => groups.some((field) =>
      field.querySelector('legend')?.textContent?.trim() === name
      && field.querySelector<HTMLInputElement>('input[type="radio"]:checked') !== null,
    ));
    const count = [checked[0], checked[1], checked[2], checked[3] && checked[4], checked[5]].filter(Boolean).length;
    return { groups: groups.length, completed: count, remaining: 5 - count };
  });
  expect(native).toEqual({ groups: 6, completed, remaining: 5 - completed });
  const filingStatus = page.locator('#initial-assessment-filing-status');
  await expect(filingStatus).toBeVisible();
  await expect(filingStatus).not.toHaveText('');
  const submit = page.getByRole('button', { name: 'File initial assessment', exact: true });
  await expect(submit).toHaveAttribute('aria-describedby', 'initial-assessment-filing-status');
  if (completed === 5) {
    await expect(filingStatus).toHaveText('Ready to file and open the case.');
    await expect(submit).toBeEnabled();
  } else {
    await expect(filingStatus).not.toHaveText('Ready to file and open the case.');
    await expect(submit).toBeDisabled();
  }
}

test('assessment selection survives desktop and phone layouts through a real first week', async ({ page, gamePage }, testInfo) => {
  const telemetry = firstLoopTelemetry(page, "unguided-week-and-restart");
  test.setTimeout(180_000);
  const missingAssets: string[] = [];
  page.on('response', (response) => { if (response.status() === 404) missingAssets.push(response.url()); });
  await startResponsiveAssessmentCareer(gamePage, 'Casey');
  await expectUnguidedNavigation(page);
  await page.getByRole('button', { name: 'Watch the match', exact: true }).click();
  await page.getByRole('button', { name: /^Use technical lens for / }).click();
  await expect(page.getByRole('button', { name: /^Remove focus from / }).first()).toBeVisible();
  const controls = page.getByTestId('mobile-observation-controls');
  await controls.getByRole('button', { name: 'Next phase', exact: true }).click();
  await page.getByRole('button', { name: 'Flag standout moment', exact: true }).click();
  await page.locator('[data-tutorial-id="observation-promising-reaction"]:visible').click();
  await page.getByRole('button', { name: /^Try to prove yourself wrong/ }).click();
  await controls.getByRole('button', { name: 'Next phase', exact: true }).click();
  await controls.getByRole('button', { name: 'Reflect on the watch', exact: true }).click();
  await page.getByRole('group', { name: 'What did this passage show?' }).getByRole('radio').first().check();
  const savedReflection = await page.evaluate(() => JSON.parse(JSON.stringify(
    (window as any).__GAME_STORE__.getState().activeSession,
  )));
  // Read the real autosave before unload; never flush or inject the checkpoint.
  await expect.poll(() => readUnguidedCheckpoint(page), { timeout: 15_000 })
    .toMatchObject({ requested: false, session: savedReflection });
  await page.reload({ waitUntil: 'domcontentloaded' });
  // The actual IndexedDB checkpoint must now expose both save actions.
  const savedContinue = page.getByRole('button', { name: 'Continue Career', exact: true });
  const savedLoad = page.getByRole('button', { name: 'Load Career', exact: true });
  await expect(savedContinue).toBeVisible();
  await expect(savedContinue).toBeEnabled();
  await expect(savedLoad).toBeVisible();
  await expect(savedLoad).toBeEnabled();
  await savedContinue.click();
  await gamePage.waitForScreen('observation');
  await expect(page.getByRole('group', { name: 'What did this passage show?' }).getByRole('radio').first()).toBeChecked();
  await expectUnguidedNavigation(page);
  await page.getByRole('button', { name: 'Complete Reflection', exact: true }).click();
  await gamePage.waitForScreen('openingDiscovery');
  await page.getByRole('button', { name: /Call a club now/ }).click();
  await gamePage.waitForScreen('reportWriter');
  await expectUnguidedNavigation(page);
  // Observation uses a full-screen shell. Verify visible workspace navigation
  // after returning to the report, where the player's save controls exist.
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await expectAssessmentProgress(page, 0);
  await openAssessmentStep(page, 'Evidence');
  await page.getByRole('group', { name: 'Saved evidence' }).getByRole('radio').first().locator('..').click();
  await openAssessmentStep(page, 'Suggests');
  await page.getByRole('group', { name: 'What it suggests' }).getByRole('radio').first().locator('..').click();
  await openAssessmentStep(page, 'Untested');
  const recommendedUnknown = page.getByRole('group', { name: 'What remains untested' }).getByRole('radio').first().locator('..');
  await expect(recommendedUnknown).toContainText('Suggested');
  await recommendedUnknown.scrollIntoViewIfNeeded();
  const wrapping = await recommendedUnknown.evaluate((label) => {
    const row = label.querySelector(':scope > span') as HTMLElement;
    const content = row.firstElementChild as HTMLElement;
    const badge = Array.from(content.querySelectorAll('span')).find((child) => child.textContent?.trim() === 'Suggested') as HTMLElement;
    const title = badge?.previousElementSibling as HTMLElement;
    const marker = row.lastElementChild as HTMLElement;
    if (!badge || !title || !marker) throw new Error('Choice title, suggestion badge and selection marker must exist');
    const cardRect = label.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const badgeRect = badge.getBoundingClientRect();
    const titleRect = title.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    const overlap = (a: DOMRect, b: DOMRect) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
      * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return {
      cardWidth: cardRect.width,
      contentWidth: contentRect.width,
      contentLength: content.innerText.length,
      contentOverflows: content.scrollWidth > content.clientWidth + 1,
      badgeInContent: content.contains(badge) && badgeRect.left >= contentRect.left - 1 && badgeRect.right <= contentRect.right + 1,
      badgeTitleOverlap: overlap(badgeRect, titleRect),
      contentMarkerOverlap: overlap(contentRect, markerRect),
    };
  });
  expect(wrapping.contentLength).toBeGreaterThan(80);
  expect(wrapping.contentWidth).toBeGreaterThanOrEqual(Math.min(120, wrapping.cardWidth * 0.55));
  expect(wrapping.contentOverflows).toBe(false);
  expect(wrapping.badgeInContent).toBe(true);
  expect(wrapping.badgeTitleOverlap).toBe(0);
  expect(wrapping.contentMarkerOverlap).toBe(0);
  await testInfo.attach('recommended-choice-layout.json', { body: JSON.stringify(wrapping, null, 2), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('report-mobile-recommended-long-choice.png'), fullPage: true });
  await recommendedUnknown.click();
  await expectAssessmentProgress(page, 3);
  await page.screenshot({ path: testInfo.outputPath('report-mobile-progress-3-of-5.png'), fullPage: true });
  await openAssessmentStep(page, 'Next action');
  await page.getByRole('group', { name: 'Next test' }).getByRole('radio').first().locator('..').click();
  await page.getByRole('group', { name: 'Recommended action' }).getByRole('radio', { name: /^Keep private/ }).locator('..').click();
  // All sizes use the same accordion. Reopen a step before asserting its native input.
  await openAssessmentStep(page, 'Next action');
  await expect(page.getByRole('group', { name: 'Recommended action' }).getByRole('radio', { name: /^Keep private/ })).toBeChecked();
  await openAssessmentStep(page, 'Confidence');
  await page.getByRole('group', { name: 'Confidence', exact: true }).getByRole('radio', { name: /^Tentative/ }).locator('..').click();
  await expect(page.getByRole('group', { name: 'Confidence', exact: true }).getByRole('radio', { name: /^Tentative/ })).toBeChecked();
  await expectAssessmentProgress(page, 5);

  // Native checked state survives phone -> desktop -> phone, including edits.
  await page.setViewportSize({ width: 1280, height: 720 });
  await openAssessmentStep(page, 'Next action');
  await expect(page.getByRole('group', { name: 'Recommended action' }).getByRole('radio', { name: /^Keep private/ })).toBeChecked();
  await openAssessmentStep(page, 'Confidence');
  await expect(page.getByRole('group', { name: 'Confidence', exact: true }).getByRole('radio', { name: /^Tentative/ })).toBeChecked();
  await openAssessmentStep(page, 'Next action');
  await page.getByRole('group', { name: 'Recommended action' }).getByRole('radio', { name: /^Test in harder context/ }).locator('..').click();
  await openAssessmentStep(page, 'Next action');
  await expect(page.getByRole('group', { name: 'Recommended action' }).getByRole('radio', { name: /^Test in harder context/ })).toBeChecked();
  await openAssessmentStep(page, 'Confidence');
  await page.getByRole('group', { name: 'Confidence', exact: true }).getByRole('radio', { name: /^Working/ }).locator('..').click();
  await expect(page.getByRole('group', { name: 'Confidence', exact: true }).getByRole('radio', { name: /^Working/ })).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  await openAssessmentStep(page, 'Confidence');
  await expect(page.getByRole('group', { name: 'Confidence', exact: true }).getByRole('radio', { name: /^Working/ })).toBeChecked();
  await openAssessmentStep(page, 'Next action');
  await expect(page.getByRole('group', { name: 'Recommended action' }).getByRole('radio', { name: /^Test in harder context/ })).toBeChecked();
  await page.getByRole('group', { name: 'Recommended action' }).getByRole('radio', { name: /^Keep private/ }).locator('..').click();
  await openAssessmentStep(page, 'Confidence');
  await page.getByRole('group', { name: 'Confidence', exact: true }).getByRole('radio', { name: /^Tentative/ }).locator('..').click();
  await expect(page.getByRole('group', { name: 'Confidence', exact: true }).getByRole('radio', { name: /^Tentative/ })).toBeChecked();
  await page.setViewportSize({ width: 1280, height: 720 });
  await openAssessmentStep(page, 'Next action');
  await expect(page.getByRole('group', { name: 'Recommended action' }).getByRole('radio', { name: /^Keep private/ })).toBeChecked();
  await openAssessmentStep(page, 'Confidence');
  await expect(page.getByRole('group', { name: 'Confidence', exact: true }).getByRole('radio', { name: /^Tentative/ })).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  await expectAssessmentProgress(page, 5);
  const submit = page.getByRole('button', { name: 'File initial assessment', exact: true });
  await expect(submit).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('report-mobile-progress-5-of-5.png'), fullPage: true });
  // Reopening a completed step must not reset decisions or readiness.
  await openAssessmentStep(page, 'Untested');
  await expectAssessmentProgress(page, 5);
  await openAssessmentStep(page, 'Confidence');
  await submit.click();
  await gamePage.waitForScreen('calendar');
  await expectNoAutomaticGuidance(page);
  // A real Week 1 report books its follow-up but must leave other work reachable.
  // Later-week injected calendars do not exercise this opening planner gate.
  const openingPlan = await page.evaluate(() => {
    const state = (window as any).__GAME_STORE__.getState().gameState;
    return JSON.parse(JSON.stringify({
      week: state.currentWeek,
      season: state.currentSeason,
      playerId: state.openingCase.playerId,
      reports: state.reports,
      schedule: state.schedule,
    }));
  });
  expect(openingPlan).toMatchObject({ week: 1, season: 1 });
  expect(Object.keys(openingPlan.reports)).toHaveLength(1);
  expect(openingPlan.schedule.activities).toHaveLength(7);
  expect(openingPlan.schedule.activities[0]).toMatchObject({
    type: 'followUpSession', slots: 1, targetId: openingPlan.playerId,
  });
  expect(openingPlan.schedule.activities[0].instanceId).toEqual(expect.any(String));
  expect(openingPlan.schedule.activities.slice(1)).toEqual(Array(6).fill(null));
  const itinerary = page.locator('[data-tutorial-id="calendar-grid"]');
  await expect(itinerary.getByRole('button', { name: /open day — choose work$/i })).toHaveCount(6);

  // The phone must open a usable sheet from an actual open day.
  await page.setViewportSize({ width: 390, height: 844 });
  await itinerary.getByRole('button', { name: /^tue open day — choose work$/i }).click();
  const opportunities = page.getByRole('dialog', {
    name: 'Select one live opportunity, then place it on the strip', exact: true,
  });
  await expect(opportunities).toBeVisible();
  await expect(opportunities.getByRole('button', { name: 'Choose Day for School Match', exact: true })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('week1-available-work-phone.png') });
  await opportunities.getByRole('button', { name: 'Close opportunity sheet', exact: true }).click();
  await expect(opportunities).toBeHidden();

  // The desktop open-day control must reveal the same real activity choices.
  await page.setViewportSize({ width: 1280, height: 720 });
  await itinerary.getByRole('button', { name: /^tue open day — choose work$/i }).click();
  const schoolMatch = page.getByRole('button', { name: 'Choose Day for School Match', exact: true });
  await expect(schoolMatch).toBeVisible();
  await schoolMatch.click();
  await itinerary.getByRole('button', { name: /^Place School Match on tue$/i }).click();
  await expect(itinerary.getByRole('status')).toContainText(/School Match scheduled for tue/i);

  const bookedPlan = await page.evaluate(() => {
    const state = (window as any).__GAME_STORE__.getState().gameState;
    return JSON.parse(JSON.stringify({
      week: state.currentWeek, season: state.currentSeason,
      reports: state.reports, schedule: state.schedule,
    }));
  });
  expect(bookedPlan).toMatchObject({ week: 1, season: 1, reports: openingPlan.reports });
  expect(bookedPlan.schedule.activities[0]).toEqual(openingPlan.schedule.activities[0]);
  const match = bookedPlan.schedule.activities[1];
  expect(match).toMatchObject({ type: 'schoolMatch', slots: 2 });
  expect(match.instanceId).toEqual(expect.any(String));
  expect(match.instanceId.length).toBeGreaterThan(0);
  expect(match.instanceId).not.toBe(openingPlan.schedule.activities[0].instanceId);
  expect(bookedPlan.schedule.activities[2]).toEqual(match);
  expect(bookedPlan.schedule.activities.slice(3)).toEqual(Array(4).fill(null));
  await expect(itinerary.getByRole('button', { name: /open day — choose work$/i })).toHaveCount(4);
  // Read the real autosave: a toast or in-memory mutation alone is insufficient.
  await expect.poll(() => readUnguidedCheckpoint(page), { timeout: 15_000 })
    .toMatchObject(bookedPlan);
  await expectNoAutomaticGuidance(page);
  await itinerary.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('week1-booked-work-desktop.png') });
  await testInfo.attach('week1-planner-booked-work.json', {
    body: JSON.stringify(bookedPlan, null, 2), contentType: 'application/json',
  });
  await gamePage.advanceCanonicalWeek();
  await expect.poll(() => page.evaluate(() => (window as any).__GAME_STORE__.getState().gameState.currentWeek)).toBe(2);
  await expectUnguidedNavigation(page);
  await expectNoAutomaticGuidance(page);
  await expect.poll(() => readUnguidedCheckpoint(page), { timeout: 15_000 })
    .toMatchObject({ requested: false, week: 2 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Continue Career', exact: true }).click();
  await gamePage.waitForScreen('dashboard');
  await expectUnguidedNavigation(page);
  // Career consequences are legitimate persisted content even without a guide.
  // Acknowledge only their real Continue control, without clearing store state.
  await dismissCareerMomentOverlays(page, 5);
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeEnabled();
  const desk = page.getByRole('heading', { name: 'The scouting desk', exact: true });
  await expect(desk).toBeVisible();
  const firstWeekMentor = page.getByRole('dialog', { name: 'Mentor: Good First Week', exact: true });
  // Explicit no-guide careers must never receive the week-two check-in.
  await expect(firstWeekMentor).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expectNoAutomaticGuidance(page);
  await desk.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  // Automatic help must be absent, while an explicit Ask remains available.
  await expectManualHelpAvailable(page, 'dashboard', 'Your Reputation');
  await page.screenshot({ path: testInfo.outputPath('week2-desk-desktop-viewport.png') });
  await page.screenshot({ path: testInfo.outputPath('week2-desk-desktop-fullpage.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await desk.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('week2-desk-mobile-viewport.png') });
  await page.screenshot({ path: testInfo.outputPath('week2-desk-mobile-fullpage.png'), fullPage: true });
  // Filing reached Planner directly; now exercise its first real nav click.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('talentscout_seen_nav') ?? '[]'))).not.toContain('calendar');
  await page.locator('[data-tutorial-id="mobile-nav-calendar"]:visible').click();
  await gamePage.waitForScreen('calendar');
  await expect(page.getByRole('heading', { name: /Planner/i })).toBeVisible();
  await expectNoAutomaticGuidance(page);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('talentscout_seen_nav') ?? '[]'))).toContain('calendar');
  await expectManualHelpAvailable(page, 'calendar', 'Weekly Grid');
  await expectUnguidedNavigation(page);
  await page.screenshot({ path: testInfo.outputPath('week2-planner-no-automatic-help-mobile.png'), fullPage: true });
  // Return through the real nav so the final Desk evidence stays comparable.
  await page.locator('[data-tutorial-id="mobile-nav-dashboard"]:visible').click();
  await gamePage.waitForScreen('dashboard');
  await expectNoAutomaticGuidance(page);
  await testInfo.attach('week2-desk-state.json', {
    body: JSON.stringify(await page.evaluate(() => {
      const state = (window as any).__GAME_STORE__.getState().gameState;
      const tutorial = (window as any).__TUTORIAL_STORE__.getState();
      return { week: state.currentWeek, season: state.currentSeason, openingCase: state.openingCase, reportCount: Object.keys(state.reports).length, guidedSessionRequested: state.guidedSessionRequested, tutorialActive: tutorial.tutorialActive, guidedSessionActive: tutorial.guidedSessionActive, activeScreenGuide: tutorial.activeScreenGuide, activeHint: tutorial.activeHint, pendingScreenGuide: tutorial.pendingScreenGuide };
    }), null, 2), contentType: 'application/json',
  });
  expect(missingAssets).toEqual([]);
  await telemetry.mark("week-two-after-persisted-restarts");
  await telemetry.finish();
  gamePage.expectNoConsoleErrors();
});
