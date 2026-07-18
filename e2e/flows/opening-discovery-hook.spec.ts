import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "../fixtures";

test.describe("guided opening discovery hook", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("talentscout_tutorial");
      localStorage.removeItem("talentscout_player_experience");
    });
    await page.goto("/play", { waitUntil: "domcontentloaded" });
  });

  test("quick start reaches an uncertain discovery and persistent consequence through real UI", async ({ page, gamePage }, testInfo) => {
    const missingResources: string[] = [];
    page.on("response", (response) => {
      if (response.status() === 404) missingResources.push(response.url());
    });
    await expect.poll(() => page.evaluate(() => JSON.parse(
      localStorage.getItem("talentscout_audio") ?? "null",
    ))).toMatchObject({
      mixVersion: 2,
      master: 0.75,
      music: 0.35,
      sfx: 0.8,
      ambience: 0.35,
    });
    await expect(page.getByText("Youth Scout Career · Early Access", { exact: true })).toBeVisible();
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
    await expect(page.getByText("School match underway · Live lead", { exact: true })).toBeVisible();
    await expect(page.getByText(/^Your edge:/)).toHaveCount(4);
    await expect(page.getByText(/first case:|guided opening|one important call|first decision in under five minutes|career DNA|observation beats|irreversible call/i)).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("opening-start-desktop.png"),
      fullPage: true,
    });

    const persona = page.getByRole("button", { name: /Projection Specialist/ }).first();
    await persona.click();
    await expect(persona).toHaveAttribute("aria-pressed", "true");

    const beginAssignment = page.getByRole("button", { name: "Begin first assignment" });
    await beginAssignment.scrollIntoViewIfNeeded();
    await expect(beginAssignment).toBeEnabled();
    await beginAssignment.click();

    await gamePage.waitForScreen("observation", 60_000);
    await expect(page.getByRole("heading", { name: "The match started early." })).toBeVisible();
    await expect(page.getByText(/Being first, not being certain/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /End (Session )?Early/i })).toHaveCount(0);

    await page.getByRole("button", { name: "Watch the match" }).click();
    await page.getByRole("button", { name: /^Use technical lens for / }).click();

    const plannerNav = page.locator('[data-tutorial-id="nav-calendar"]');
    await expect(plannerNav).toBeDisabled();
    await expect(page.getByText(/Guided assignment in progress/i)).toBeVisible();

    await page.evaluate(() => {
      (window as any).__GAME_STORE__.setState({ currentScreen: "calendar" });
    });
    await gamePage.waitForScreen("calendar");
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
      const mentor = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Mentor: Keep watching"]');
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
    await expect(page.locator('[data-tutorial-id="mobile-nav-calendar"]')).toBeDisabled();
    await expect(page.getByRole("dialog", { name: /Mentor: Keep watching/i })).toBeVisible();
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
    await expect(page.getByText(/moment flagged/i)).toBeVisible();

    const halftimeApproach = page.getByRole("button", { name: /^Confirm the first read\b/ });
    await expect(halftimeApproach).toBeVisible();
    await halftimeApproach.click();
    await page.getByRole("button", { name: "Next Phase" }).click();
    await expect(evidence.getByText("Under Pressure").first()).toBeVisible();
    await page.getByRole("button", { name: "Go to Reflection" }).click();

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
        '[role="dialog"][aria-label="Mentor: Complete the observation session"]',
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
    await expect(page.getByRole("heading", { name: /Shape the first football read on/i })).toBeVisible();
    await expect(page.getByRole("group", { name: "Saved evidence" })).toBeVisible();
    await expect(page.getByRole("group", { name: "What it suggests" })).toBeVisible();
    await expect(page.getByRole("group", { name: "What remains untested" })).toBeVisible();
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
    await page.getByRole("group", { name: "Saved evidence" }).getByRole("radio").first().locator("..").click();
    await page.getByRole("group", { name: "What it suggests" }).getByRole("radio", { name: /Make the measured read/i }).locator("..").click();
    await page.getByRole("group", { name: "What remains untested" }).getByRole("radio").first().locator("..").click();
    await page.getByRole("group", { name: "Next test" }).getByRole("radio").first().locator("..").click();
    await page.getByRole("group", { name: "Recommended action" }).getByRole("radio", { name: /Test in harder context/i }).locator("..").click();
    await page.getByRole("group", { name: "Confidence" }).getByRole("radio", { name: /^Working\b/i }).locator("..").click();
    await page.getByRole("button", { name: "File initial assessment" }).click();
    await gamePage.waitForScreen("reportHistory");

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
