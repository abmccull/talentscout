import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "../fixtures";
import { seedStructuredEvidenceForPlayer } from "../helpers/structured-evidence";

for (const viewport of [{ name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 }, { name: "desktop", width: 1440, height: 900 }]) {
  test(`evidence decisions remain usable on ${viewport.name}`, async ({ gamePage }, info) => {
    test.setTimeout(120_000);
    const page = gamePage.page;
    page.setDefaultTimeout(15_000);
    await page.setViewportSize(viewport);
    await gamePage.goto();
    await gamePage.injectState({ currentWeek: 3, currentSeason: 1 });
    const playerId = await page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      const youth = Object.values(state.unsignedYouth)[0] as any;
      const id = youth.player.id;
      store.getState().loadGame({ ...state,
        unsignedYouth: { ...state.unsignedYouth, [youth.id]: { ...youth,
          discoveredBy: [...new Set([...youth.discoveredBy, state.scout.id])] } },
        observations: { ...state.observations, responsiveObservation: {
          id: "responsiveObservation", playerId: id, scoutId: state.scout.id,
          sourceSessionId: "responsiveSession", week: 3, season: 1, context: "schoolMatch",
          attributeReadings: [], notes: [], flaggedMoments: [],
        } },
      });
      store.getState().selectPlayer(id);
      return id as string;
    });
    await seedStructuredEvidenceForPlayer(page, playerId);
    await page.evaluate(id => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      const journalId = `e2e_structured_journal_${id}`;
      store.getState().loadGame({ ...state, reflectionJournal: { ...state.reflectionJournal,
        [journalId]: { ...state.reflectionJournal[journalId], conversationDecisions: [{
          phaseIndex: 1, nodeId: "inquiry", optionId: "ask", optionText: "Ask for an example",
          narrativeText: "An attributed account", insightPointsAwarded: 0, relationshipDeltaApplied: 0,
          inquiry: { playerId: id, questionId: "decisions", sourceName: "Coach", status: "unanswered" },
        }] },
      } });
      store.getState().selectPlayer(id);
    }, playerId);
    await gamePage.setScreen("playerProfile");
    await expect(page.getByText("Conversation questions to test", { exact: true })).toBeVisible();
    await expect(page.getByText("How quickly does the player read danger?", { exact: true })).toBeVisible();
    const dismiss = page.getByRole("button", { name: "Dismiss achievement notification" });
    if (await dismiss.isVisible()) await dismiss.click();
    await page.screenshot({ path: info.outputPath("decision.png"), fullPage: true });
    await page.getByRole("button", { name: "Review supporting evidence", exact: true }).click();
    await expect(page.locator("#evidence-hypothesis-lane")).toHaveCount(0);
    await page.getByRole("tab", { name: "Accessible list", exact: true }).click();
    await expect(page.locator("#evidence-list-hypotheses")).toHaveCount(0);
    await expect(page.locator('section[aria-labelledby="evidence-list-claims"]')).toContainText("Use the report writer");
    await expect(page.locator('section[aria-labelledby="evidence-list-unknowns"]')).toContainText("How quickly does the player read danger?");
    await page.screenshot({ path: info.outputPath("evidence-list.png"), fullPage: true });
    const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth, main: document.querySelector<HTMLElement>("#game-main")?.clientWidth,
      mainScroll: document.querySelector<HTMLElement>("#game-main")?.scrollWidth }));
    expect(widths.document).toBeLessThanOrEqual(widths.viewport + 1);
    expect(widths.mainScroll).toBeLessThanOrEqual((widths.main ?? 0) + 1);
    const axe = await new AxeBuilder({ page }).include("#game-main").analyze();
    await info.attach("axe", { body: JSON.stringify(axe.violations, null, 2), contentType: "application/json" });
    expect(axe.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    await page.getByRole("button", { name: "Build report from evidence", exact: true }).click();
    await gamePage.waitForScreen("reportWriter");
    await expect(page.getByRole("button", { name: "Back to player profile", exact: true })).toBeVisible();
    await expect(page.getByText("Loading workspace...", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("report-writer.png"), fullPage: true });
    const judgment = page.getByTestId("report-judgment-potential");
    const disclosure = judgment.locator("summary");
    if (await disclosure.isVisible() && await judgment.getAttribute("open") === null) await disclosure.click();
    await judgment.getByText("Interpret a saved cue", { exact: true }).click();
    await judgment.getByRole("combobox", { name: "Supporting cue", exact: true }).selectOption({ index: 1 });
    await expect(judgment.getByRole("group", { name: "Interpretation", exact: true })).toBeVisible();
    await expect(judgment.getByTestId("report-selected-cue-potential")).toContainText("The player controlled a difficult pass and completed the next action cleanly.");
    await expect(judgment.getByTestId("report-selected-cue-potential")).toBeVisible();
    await page.screenshot({ path: info.outputPath("report-judgment-expanded.png"), fullPage: true });
    const reportWidths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth, main: document.querySelector<HTMLElement>("#game-main")?.clientWidth,
      mainScroll: document.querySelector<HTMLElement>("#game-main")?.scrollWidth }));
    expect(reportWidths.document).toBeLessThanOrEqual(reportWidths.viewport + 1);
    expect(reportWidths.mainScroll).toBeLessThanOrEqual((reportWidths.main ?? 0) + 1);
    const reportAxe = await new AxeBuilder({ page }).include("#game-main").analyze();
    await info.attach("report-axe", { body: JSON.stringify(reportAxe.violations, null, 2), contentType: "application/json" });
    expect(reportAxe.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    await judgment.getByRole("group", { name: "Interpretation", exact: true }).getByRole("radio").first().check();
    await judgment.getByRole("group", { name: "What remains unknown", exact: true }).getByRole("radio").first().check();
    for (const category of ["roleFit", "characterRisk"]) {
      const section = page.getByTestId(`report-judgment-${category}`);
      const summary = section.locator("summary");
      if (await summary.isVisible() && await section.getAttribute("open") === null) await summary.click();
      await section.getByText("Leave unassessed", { exact: true }).click();
      await section.getByRole("group", { name: "What remains unknown", exact: true }).getByRole("radio").first().check();
    }
    await page.getByRole("tab", { name: /^Risk\b/ }).click();
    const risk = page.getByRole("group", { name: "Risk posture", exact: true });
    await risk.getByRole("combobox", { name: "Pressure response assessment", exact: true }).selectOption("observed");
    await risk.getByRole("combobox", { name: "Supporting cue", exact: true }).selectOption({ index: 3 });
    // Completing the final required choice opens review; return to inspect the saved risk.
    await expect(page.getByRole("tab", { name: /^(Final review|Review)\b/ })).toBeEnabled();
    await page.getByRole("tab", { name: /^Risk\b/ }).click();
    await expect(risk.getByTestId("report-risk-cue-pressureResponse")).toContainText("The player recovered calmly after losing the ball under pressure.");
    await expect(risk.getByTestId("report-risk-cue-pressureResponse")).toBeVisible();
    await expect(page.getByText("Pressure response references evidence outside this report.", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: /^(Final review|Review)\b/ })).toBeEnabled();
    await page.screenshot({ path: info.outputPath("report-risk-expanded.png"), fullPage: true });
    const riskWidths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth, main: document.querySelector<HTMLElement>("#game-main")?.clientWidth,
      mainScroll: document.querySelector<HTMLElement>("#game-main")?.scrollWidth }));
    expect(riskWidths.document).toBeLessThanOrEqual(riskWidths.viewport + 1);
    expect(riskWidths.mainScroll).toBeLessThanOrEqual((riskWidths.main ?? 0) + 1);
    const riskAxe = await new AxeBuilder({ page }).include("#game-main").analyze();
    await info.attach("risk-axe", { body: JSON.stringify(riskAxe.violations, null, 2), contentType: "application/json" });
    expect(riskAxe.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    await risk.getByRole("combobox", { name: "Pressure response assessment", exact: true }).selectOption("untested");
    await expect(risk.getByTestId("report-risk-cue-pressureResponse")).toHaveCount(0);
    const observedRisk = viewport.name !== "tablet";
    if (observedRisk) {
      await risk.getByRole("combobox", { name: "Pressure response assessment", exact: true }).selectOption("observed");
      await risk.getByRole("combobox", { name: "Supporting cue", exact: true }).selectOption({ index: 3 });
    }
    await page.getByRole("tab", { name: /^(Final review|Review)\b/ }).click();
    await page.getByRole("button", { name: "Submit Report", exact: true }).click();
    await gamePage.waitForScreen("reportHistory");
    await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();
    const filed = await page.evaluate(id => {
      const reports = Object.values((window as any).__GAME_STORE__.getState().gameState.reports) as any[];
      return reports.filter(report => report.playerId === id);
    }, playerId);
    expect(filed).toHaveLength(1);
    const savedReport = filed[0];
    const riskId = `e2e_evidence_${playerId}_2`;
    expect(savedReport.riskAssessments).toContainEqual({ id: "pressureResponse", label: "Pressure response",
      status: observedRisk ? "observed" : "untested", evidenceIds: observedRisk ? [riskId] : [] });
    expect(savedReport.categoryVerdicts.characterRisk.status).toBe("notAssessed");
    expect(savedReport.categoryVerdicts.characterRisk.evidenceIds).toEqual([]);
    if (observedRisk) expect(savedReport.evidenceAssessment.evidenceIds).toContain(riskId);
    else expect(savedReport.evidenceAssessment.evidenceIds).not.toContain(riskId);
    await gamePage.navigateTo("settings");
    await page.getByRole("button", { name: "Quick Save", exact: true }).click();
    await expect(page.getByText("Saved to slot 1", { exact: true })).toBeVisible();
    // Clear only the disposable fixture's in-memory reports, then restore the real local manual slot.
    await page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      store.getState().loadGame({ ...store.getState().gameState, reports: {} });
    });
    await gamePage.navigateTo("settings");
    await page.getByRole("button", { name: "Manage Saves", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Save and Load Game", exact: true });
    await dialog.getByRole("tab", { name: "Load", exact: true }).click();
    await dialog.getByRole("button", { name: "Load save slot 1", exact: true }).click();
    await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
    await gamePage.waitForScreen("dashboard");
    await expect.poll(() => page.evaluate(id => (window as any).__GAME_STORE__.getState().gameState.reports[id], savedReport.id)).toEqual(savedReport);
    await gamePage.setScreen("reportHistory");
    await expect(page.getByRole("heading", { name: "Reports", exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath("restored-report-history.png"), fullPage: true });



  });
}
