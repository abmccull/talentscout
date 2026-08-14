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

    const beginAssignment = page.getByRole("button", { name: "Take the call" });
    await beginAssignment.scrollIntoViewIfNeeded();
    await expect(beginAssignment).toBeEnabled();
    await beginAssignment.click();

    await gamePage.waitForScreen("observation", 60_000);
    await expect(page.getByRole("heading", { name: "The match started early." })).toBeVisible();
    await expect(page.getByText(/Being first, not being certain/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /End (Session )?Early/i })).toHaveCount(0);

    await page.getByRole("button", { name: "Watch the match" }).click();

    const plannerNav = page.locator('[data-tutorial-id="nav-calendar"]');
    await expect(plannerNav).toBeDisabled();
    await expect(page.getByText(/Guided assignment in progress/i)).toBeVisible();

    const evidence = page.locator('[data-tutorial-id="observation-evidence-feed"]');
    await expect(evidence.getByText("Standout")).toBeVisible();
    const flagMoment = page.locator('[data-tutorial-id="observation-flag-moment"]:visible');
    await expect(flagMoment).toContainText("Flag moment");
    await flagMoment.click();
    const promising = page.locator('[data-tutorial-id="observation-promising-reaction"]:visible');
    await expect(promising).toHaveText("Promising");
    await promising.click();
    await expect(page.getByText(/moment flagged/i)).toBeVisible();

    await page.getByRole("button", { name: "Write the name" }).click();
    await gamePage.waitForScreen("reportWriter");
    await expect(page.getByText("Write the name down")).toBeVisible();
    await expect(page.getByRole("button", { name: /Keep the name private/ })).toBeVisible();
    await expect(page.getByRole("group", { name: "Saved evidence" })).toHaveCount(0);
    await expect(page.getByText("Answer a real club need")).toHaveCount(0);
    await expect(page.getByLabel(/Ask (Margaret|Tommy) for help/i)).toHaveCount(0);

    await page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const serialized = JSON.parse(JSON.stringify(store.getState().gameState));
      store.getState().loadGame(serialized);
    });
    await gamePage.waitForScreen("reportWriter");
    await expect(page.getByRole("button", { name: /Keep the name private/ })).toBeVisible();

    await page.getByRole("button", { name: /Keep the name private/ }).click();

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
    await page.getByRole("button", { name: "File the name" }).click();
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
