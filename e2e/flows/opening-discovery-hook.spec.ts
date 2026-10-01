import AxeBuilder from "@axe-core/playwright";
import { expect, test, type GamePage } from "../fixtures";

test.describe("guided opening discovery hook", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("talentscout_tutorial");
      localStorage.removeItem("talentscout_player_experience");
    });
  });

  test("quick start reaches an uncertain discovery and persistent consequence through real UI", async ({ page, gamePage }, testInfo) => {
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
    await expect(page.getByText(/Begin as a Youth Scout\. Follow leads, watch young players/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Start Youth Scout Career" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue Career" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Load Career" })).toBeVisible();
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
    await expect(page.getByText(/School match underway .+ Live lead/)).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "The match started early." })).toBeVisible();
    await expect(page.getByText(/Being first, not being certain/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /End (Session )?Early/i })).toHaveCount(0);

    await page.getByRole("button", { name: "Watch the match" }).click();
    const focusToggle = page.getByRole("button", { name: /^Focus targets and lenses/ });
    await expect(focusToggle).toHaveAttribute("aria-expanded", "false");
    await focusToggle.click();
    const focusSheet = page.getByRole("dialog", { name: "Choose your focus" });
    await expect(focusSheet).toBeVisible();
    // The drawer moves keyboard focus on the next rendered frame. Send
    // Escape only once it owns focus, then verify closure and focus return.
    await expect.poll(() => focusSheet.evaluate((sheet) => sheet.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(focusSheet).toHaveCount(0);
    await expect(focusToggle).toBeFocused();
    await focusToggle.click();
    await expect(focusSheet).toBeVisible();
    await focusSheet.getByRole("button", { name: /^Use technical lens for / }).click();
    await expect(focusSheet.getByLabel(/^technical observation lens locked for /)).toBeVisible();
    await focusSheet.getByRole("button", { name: "Close focus controls" }).click();
    await expect(focusSheet).toHaveCount(0);
    await expect(focusToggle).toHaveAttribute("aria-expanded", "false");
    await expect(focusToggle).toBeFocused();
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
    await expect(evidence.getByText("Standout")).toBeVisible();
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
    await expect(evidence.getByText("Under Pressure").first()).toBeVisible();
    await page.getByTestId("mobile-observation-controls").getByRole("button", { name: "Reflect", exact: true }).click();

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
    await expect(page.getByText("Write the name down.")).toBeVisible();
    await expect(page.getByText(/One exceptional action is a lead, not proof/i)).toBeVisible();
    await expect(page.getByText("Your next move", { exact: true })).toBeVisible();
    await expect(page.getByText(/The call you make now will shape who gets access/i)).toBeVisible();
    await expect(page.getByText(/No one knows what this player will become/i)).toBeVisible();
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
    // A guide with safe room may stay expanded after the viewport changes.
    // Exercise minimize and restore from either valid presentation state.
    if (await hideDecisionHelp.isVisible()) await hideDecisionHelp.click();
    await decisionMentor.getByRole("button", { name: "Show mentor help", exact: true }).click();
    await hideDecisionHelp.click();
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

test('assessment selection survives desktop and phone layouts through a real first week', async ({ page, gamePage }, testInfo) => {
  test.setTimeout(180_000);
  const missingAssets: string[] = [];
  page.on('response', (response) => { if (response.status() === 404) missingAssets.push(response.url()); });
  await startResponsiveAssessmentCareer(gamePage, 'Casey');
  await expectUnguidedNavigation(page);
  await page.getByRole('button', { name: 'Watch the match', exact: true }).click();
  await page.getByRole('button', { name: /^Focus targets and lenses/ }).click();
  const focus = page.getByRole('dialog', { name: 'Choose your focus' });
  await focus.getByRole('button', { name: /^Use technical lens for / }).click();
  await focus.getByRole('button', { name: 'Close focus controls' }).click();
  const controls = page.getByTestId('mobile-observation-controls');
  await controls.getByRole('button', { name: 'Next phase', exact: true }).click();
  await page.getByRole('button', { name: 'Flag standout moment', exact: true }).click();
  await page.locator('[data-tutorial-id="observation-promising-reaction"]:visible').click();
  await page.getByRole('button', { name: /^Try to prove yourself wrong/ }).click();
  await controls.getByRole('button', { name: 'Next phase', exact: true }).click();
  await controls.getByRole('button', { name: 'Reflect', exact: true }).click();
  await page.getByRole('group', { name: 'What did this passage show?' }).getByRole('radio').first().check();
  const savedReflection = await page.evaluate(() => JSON.parse(JSON.stringify(
    (window as any).__GAME_STORE__.getState().activeSession,
  )));
  // Read the real autosave before unload; never flush or inject the checkpoint.
  await expect.poll(() => readUnguidedCheckpoint(page), { timeout: 15_000 })
    .toMatchObject({ requested: false, session: savedReflection });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Continue Career', exact: true }).click();
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
  const outerProgress = page.getByRole('region', { name: 'Report progress', exact: true });
  await expect(outerProgress).toContainText('5 decisions remaining');
  await page.getByRole('group', { name: 'Saved evidence' }).getByRole('radio').first().locator('..').click();
  await page.getByRole('group', { name: 'What it suggests' }).getByRole('radio').first().locator('..').click();
  const recommendedUnknown = page.getByRole('group', { name: 'What remains untested' }).getByRole('radio').first().locator('..');
  await expect(recommendedUnknown).toContainText('Recommended');
  await recommendedUnknown.scrollIntoViewIfNeeded();
  const wrapping = await recommendedUnknown.evaluate((label) => {
    const row = label.querySelector(':scope > span') as HTMLElement;
    const content = row.firstElementChild as HTMLElement;
    const badge = Array.from(label.children).find((child) => child.textContent?.trim() === 'Recommended') as HTMLElement;
    const cardRect = label.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    return {
      cardWidth: cardRect.width,
      contentWidth: contentRect.width,
      contentLength: content.innerText.length,
      contentOverflows: content.scrollWidth > content.clientWidth + 1,
      badgeBelowContent: badge.getBoundingClientRect().top >= row.getBoundingClientRect().bottom,
    };
  });
  expect(wrapping.contentLength).toBeGreaterThan(80);
  expect(wrapping.contentWidth).toBeGreaterThanOrEqual(Math.min(120, wrapping.cardWidth * 0.55));
  expect(wrapping.contentOverflows).toBe(false);
  expect(wrapping.badgeBelowContent).toBe(true);
  await testInfo.attach('recommended-choice-layout.json', { body: JSON.stringify(wrapping, null, 2), contentType: 'application/json' });
  await page.screenshot({ path: testInfo.outputPath('report-mobile-recommended-long-choice.png'), fullPage: true });
  await recommendedUnknown.click();
  await expect(page.getByText('3/5 complete', { exact: true })).toBeVisible();
  await expect(outerProgress).toContainText('2 decisions remaining');
  await page.screenshot({ path: testInfo.outputPath('report-mobile-progress-3-of-5.png'), fullPage: true });
  await page.getByRole('group', { name: 'Next test' }).getByRole('radio').first().locator('..').click();
  await page.getByRole('group', { name: 'Recommended action' }).getByRole('radio', { name: /^Keep private/ }).locator('..').click();
  // Choosing the recommendation moves the phone wizard to Confidence. Return
  // to the actual visible radio to verify native checked state, not card color.
  await page.getByRole('button', { name: 'Next action', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Recommended action' }).getByRole('radio', { name: /^Keep private/ })).toBeChecked();
  await page.getByRole('button', { name: 'Confidence', exact: true }).click();
  await page.getByRole('group', { name: 'Confidence', exact: true }).getByRole('radio', { name: /^Tentative/ }).locator('..').click();
  await expect(page.getByRole('group', { name: 'Confidence', exact: true }).getByRole('radio', { name: /^Tentative/ })).toBeChecked();

  // The desktop and mobile layouts remain mounted. Their radio groups must
  // preserve one selected visible input through edits and breakpoint changes.
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByRole('group', { name: 'Recommended action' }).getByRole('radio', { name: /^Keep private/ })).toBeChecked();
  await expect(page.getByRole('group', { name: 'Confidence', exact: true }).getByRole('radio', { name: /^Tentative/ })).toBeChecked();
  await page.getByRole('group', { name: 'Recommended action' }).getByRole('radio', { name: /^Test in harder context/ }).locator('..').click();
  await expect(page.getByRole('group', { name: 'Recommended action' }).getByRole('radio', { name: /^Test in harder context/ })).toBeChecked();
  await page.getByRole('group', { name: 'Confidence', exact: true }).getByRole('radio', { name: /^Working/ }).locator('..').click();
  await expect(page.getByRole('group', { name: 'Confidence', exact: true }).getByRole('radio', { name: /^Working/ })).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('group', { name: 'Confidence', exact: true }).getByRole('radio', { name: /^Working/ })).toBeChecked();
  await page.getByRole('button', { name: 'Next action', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Recommended action' }).getByRole('radio', { name: /^Test in harder context/ })).toBeChecked();
  await page.getByRole('group', { name: 'Recommended action' }).getByRole('radio', { name: /^Keep private/ }).locator('..').click();
  await page.getByRole('group', { name: 'Confidence', exact: true }).getByRole('radio', { name: /^Tentative/ }).locator('..').click();
  await expect(page.getByRole('group', { name: 'Confidence', exact: true }).getByRole('radio', { name: /^Tentative/ })).toBeChecked();
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByRole('group', { name: 'Recommended action' }).getByRole('radio', { name: /^Keep private/ })).toBeChecked();
  await expect(page.getByRole('group', { name: 'Confidence', exact: true }).getByRole('radio', { name: /^Tentative/ })).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('5/5 complete', { exact: true })).toBeVisible();
  await expect(outerProgress).toContainText('0 decisions remaining');
  const submit = page.getByRole('button', { name: 'File initial assessment', exact: true });
  await expect(submit).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('report-mobile-progress-5-of-5.png'), fullPage: true });
  // Reopening a completed step must not reset the parent progress counter.
  await page.getByRole('button', { name: 'Untested', exact: true }).click();
  await expect(page.getByText('5/5 complete', { exact: true })).toBeVisible();
  await expect(outerProgress).toContainText('0 decisions remaining');
  await page.getByRole('button', { name: 'Confidence', exact: true }).click();
  await submit.click();
  await gamePage.waitForScreen('calendar');
  await page.setViewportSize({ width: 1280, height: 720 });
  await gamePage.advanceCanonicalWeek();
  await expect.poll(() => page.evaluate(() => (window as any).__GAME_STORE__.getState().gameState.currentWeek)).toBe(2);
  await expectUnguidedNavigation(page);
  await expect.poll(() => readUnguidedCheckpoint(page), { timeout: 15_000 })
    .toMatchObject({ requested: false, week: 2 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Continue Career', exact: true }).click();
  await gamePage.waitForScreen('dashboard');
  await expectUnguidedNavigation(page);
  await expect(page.getByRole('button', { name: 'Settings', exact: true })).toBeEnabled();
  const desk = page.getByRole('heading', { name: 'Scouting Desk', exact: true });
  await expect(desk).toBeVisible();
  const firstWeekMentor = page.getByRole('dialog', { name: 'Mentor: Good First Week', exact: true });
  if (await firstWeekMentor.isVisible()) await firstWeekMentor.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel(/^Mentor:/)).toHaveCount(0);
  await desk.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const closeScreenGuide = page.getByRole('button', { name: 'Close screen guide', exact: true });
  if (await closeScreenGuide.isVisible()) {
    await page.screenshot({ path: testInfo.outputPath('week2-desk-guide-desktop.png') });
    await closeScreenGuide.click();
    await expect(closeScreenGuide).toHaveCount(0);
  }
  await page.screenshot({ path: testInfo.outputPath('week2-desk-desktop-viewport.png') });
  await page.screenshot({ path: testInfo.outputPath('week2-desk-desktop-fullpage.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await desk.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('week2-desk-mobile-viewport.png') });
  await page.screenshot({ path: testInfo.outputPath('week2-desk-mobile-fullpage.png'), fullPage: true });
  await testInfo.attach('week2-desk-state.json', {
    body: JSON.stringify(await page.evaluate(() => {
      const state = (window as any).__GAME_STORE__.getState().gameState;
      return { week: state.currentWeek, season: state.currentSeason, openingCase: state.openingCase, reportCount: Object.keys(state.reports).length };
    }), null, 2), contentType: 'application/json',
  });
  expect(missingAssets).toEqual([]);
  gamePage.expectNoConsoleErrors();
});
