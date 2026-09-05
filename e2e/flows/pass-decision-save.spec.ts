import type { Page } from "@playwright/test";
import type { GameState } from "../../src/engine/core/types";
import { expect, test } from "../fixtures";

/** Read only: no save flush, injected evidence, or store action can satisfy this test. */
async function readDecisionCheckpoint(page: Page, source: "live" | "autosave") {
  return page.evaluate(async (source) => {
    const project = (state: GameState | undefined) => state ? JSON.parse(JSON.stringify({
      playerId: state.openingCase?.playerId,
      openingStage: state.openingCase?.stage,
      week: state.currentWeek,
      season: state.currentSeason,
      reports: state.reports,
      cases: state.scoutingCases,
      reviews: state.recommendationReviews,
      reputation: state.scout.reputation,
      skillXp: state.scout.skillXp,
      skills: state.scout.skills,
      reportsSubmitted: state.scout.reportsSubmitted,
      discoveries: state.discoveryRecords,
      finances: state.finances,
      schedule: state.schedule,
      placementReports: state.placementReports,
    })) : null;
    if (source === "live") return project((window as any).__GAME_STORE__?.getState()?.gameState);
    return new Promise<any>((resolve, reject) => {
      const open = indexedDB.open("TalentScoutDB");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const database = open.result;
        const read = database.transaction("saves", "readonly").objectStore("saves").get(0);
        read.onerror = () => { database.close(); reject(read.error); };
        read.onsuccess = () => { const saved = project(read.result?.state); database.close(); resolve(saved); };
      };
    });
  }, source);
}

/**
 * Saves materialize these six optional finance defaults in
 * gameStateGameplayMigration. Keep every field and every non-default value;
 * only absence and its documented persisted default are equivalent here.
 * The before/after filing check below still compares the raw live snapshot.
 */
function checkpointWithSaveDefaults(checkpoint: Awaited<ReturnType<typeof readDecisionCheckpoint>>) {
  if (!checkpoint?.finances) return checkpoint;
  return {
    ...checkpoint,
    finances: {
      ...checkpoint.finances,
      creditScore: checkpoint.finances.creditScore ?? 50,
      distressLevel: checkpoint.finances.distressLevel ?? "healthy",
      weeksInDistress: checkpoint.finances.weeksInDistress ?? 0,
      failedContractCount: checkpoint.finances.failedContractCount ?? 0,
      blacklistedClubs: checkpoint.finances.blacklistedClubs ?? [],
      bankruptcyRecoveryCooldown: checkpoint.finances.bankruptcyRecoveryCooldown ?? 0,
    },
  };
}

async function openAssessmentStep(page: Page, step: string) {
  const button = page.getByRole("button", { name: new RegExp(`^${step}\\b`) });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
}

test("a real observed Pass for now survives autosave and reload without recruitment or rewards", async ({ page, gamePage }, testInfo) => {
  test.setTimeout(180_000);
  await page.goto("/play", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Start Youth Scout Career", exact: true }).click();
  await page.locator("#scout-first-name").fill("Casey");
  await page.locator("#scout-last-name").fill("Pass");
  await page.getByRole("radio", { name: /^Start without the guide/ }).locator("..").click();
  await page.getByRole("button", { name: /Projection Specialist/ }).click();
  await page.getByRole("button", { name: "Take the call", exact: true }).click();
  await gamePage.waitForScreen("observation", 60_000);

  // Earn the evidence through the existing opening UI, without modifying the session.
  await page.getByRole("button", { name: "Watch the match", exact: true }).click();
  await page.getByRole("button", { name: /^Use technical lens for / }).click();
  const controls = page.getByTestId("mobile-observation-controls");
  await controls.getByRole("button", { name: "Next phase", exact: true }).click();
  await page.locator('[data-tutorial-id="observation-flag-moment"]:visible').first().click();
  await page.locator('[data-tutorial-id="observation-promising-reaction"]:visible').click();
  await page.getByRole("button", { name: /^Try to prove yourself wrong/ }).click();
  await controls.getByRole("button", { name: "Next phase", exact: true }).click();
  await controls.getByRole("button", { name: "Reflect on the watch", exact: true }).click();
  await page.getByRole("group", { name: "What did this passage show?" }).getByRole("radio").first().check();
  await page.getByRole("button", { name: "Complete Reflection", exact: true }).click();
  await gamePage.waitForScreen("openingDiscovery");
  await page.getByRole("button", { name: /Keep the name private/ }).click();
  await gamePage.waitForScreen("reportWriter");

  const before = await readDecisionCheckpoint(page, "live");
  expect(Object.keys(before.reports)).toHaveLength(0);
  await openAssessmentStep(page, "Evidence");
  await page.getByRole("group", { name: "Saved evidence" }).getByRole("radio").first().locator("..").click();
  await openAssessmentStep(page, "Suggests");
  await page.getByRole("group", { name: "What it suggests" }).getByRole("radio").first().locator("..").click();
  await openAssessmentStep(page, "Untested");
  await page.getByRole("group", { name: "What remains untested" }).getByRole("radio").first().locator("..").click();
  await openAssessmentStep(page, "Next action");
  await page.getByRole("group", { name: "Next test", exact: true }).getByRole("radio").first().locator("..").click();
  await page.getByRole("group", { name: "Recommended action" }).getByRole("radio", { name: /^Pass for now/ }).locator("..").click();
  await openAssessmentStep(page, "Confidence");
  await page.getByRole("group", { name: "Confidence", exact: true }).getByRole("radio", { name: /^Tentative/ }).locator("..").click();
  await expect(page.getByText("5 / 5 decisions", { exact: true })).toBeVisible();
  const file = page.getByRole("button", { name: "File initial assessment", exact: true });
  await expect(file).toBeEnabled();
  await file.click();
  await gamePage.waitForScreen("reportHistory");
  await expect(page.locator('[data-tutorial-id="report-marketplace-prompt"]')).toHaveCount(0);

  const filed = await readDecisionCheckpoint(page, "live");
  const reports = Object.values(filed.reports) as GameState["reports"][string][];
  expect(reports).toHaveLength(1);
  const report = reports[0];
  expect(report).toMatchObject({ recommendedAction: "pass", conviction: "note", reputationDelta: 0,
    evidenceAssessment: { kind: "initial", recommendation: "pass" }, decisionReceipt: { action: "pass", confidence: "tentative" } });
  expect(report.evidenceObservationIds?.length).toBeGreaterThan(0);
  expect(report.decisionReceipt?.evidenceCardIds.length).toBeGreaterThan(0);
  expect(filed.cases[report.caseId!]).toMatchObject({ status: "closed", reportIds: [report.id] });
  expect(Object.values(filed.reviews)).toHaveLength(2);
  for (const field of ["reputation", "skillXp", "skills", "reportsSubmitted", "discoveries", "finances", "schedule", "placementReports"] as const) {
    expect(filed[field], `Filing a private pass changed ${field}`).toEqual(before[field]);
  }
  expect(filed.openingStage).toBe("complete");
  expect(await page.evaluate(() => (window as any).__GAME_STORE__.getState().pendingListingReportId)).toBeNull();

  // IndexedDB must contain the committed decision before unload. Only the
  // documented optional finance defaults may differ from the live object.
  const persistedCheckpoint = checkpointWithSaveDefaults(filed);
  await expect.poll(async () => checkpointWithSaveDefaults(await readDecisionCheckpoint(page, "autosave")), { timeout: 20_000 }).toEqual(persistedCheckpoint);
  await page.screenshot({ path: testInfo.outputPath("pass-filed-report-history.png"), fullPage: true });
  await page.reload({ waitUntil: "domcontentloaded" });
  const continueCareer = page.getByRole("button", { name: "Continue Career", exact: true });
  await expect(continueCareer).toBeEnabled();
  await continueCareer.click();
  await gamePage.waitForScreen("dashboard", 60_000);
  await expect.poll(async () => checkpointWithSaveDefaults(await readDecisionCheckpoint(page, "live")), { timeout: 15_000 }).toEqual(persistedCheckpoint);
  await expect.poll(async () => checkpointWithSaveDefaults(await readDecisionCheckpoint(page, "autosave")), { timeout: 15_000 }).toEqual(persistedCheckpoint);
  await gamePage.navigateTo("youthScouting");
  await expect(page.getByText("No next look planned; spend attention elsewhere.").first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("pass-retained-after-reload.png"), fullPage: true });
  await testInfo.attach("pass-receipt.json", { body: JSON.stringify(report.decisionReceipt, null, 2), contentType: "application/json" });
  gamePage.expectNoConsoleErrors();
});
