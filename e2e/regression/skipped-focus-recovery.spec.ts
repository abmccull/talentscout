import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";

/** Read only the durable autosave; observing the store is not save acceptance. */
async function readReflectionCheckpoint(page: Page, sessionId: string, completionId: string) {
  return page.evaluate(({ sessionId, completionId }) => new Promise<any>((resolve, reject) => {
    const request = indexedDB.open("TalentScoutDB");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("saves", "readonly");
      const read = transaction.objectStore("saves").get(0);
      let checkpoint: unknown = null;
      read.onsuccess = () => {
        const record = read.result;
        const state = record?.state;
        if (!state) return;
        const journal = state.reflectionJournal?.[sessionId];
        checkpoint = {
          storageRevision: record.storageRevision,
          lastSaved: state.lastSaved,
          careerInstanceId: state.careerInstanceId,
          openingCaseId: state.openingCase?.id,
          openingCaseStage: state.openingCase?.stage,
          hasActiveObservationSession: state.activeObservationSession != null,
          completedSession: state.completedInteractiveSessions?.includes(completionId) ?? false,
          journalSessionId: journal?.sessionId ?? null,
          evidenceDecisions: journal?.evidenceDecisions ?? {},
        };
      };
      transaction.oncomplete = () => { db.close(); resolve(checkpoint); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  }), { sessionId, completionId });
}

// Failure contract: completing a watch without Focus must never strand the
// guide in the ended session. All gameplay below uses real controls; the sole
// route override exercises the explicit recovery action from an off-path page.
test("skipped Focus keeps truthful evidence and a reachable guide after reflection and reload", async ({ page, gamePage }, testInfo) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/play", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Start Youth Scout Career", exact: true }).click();
  await page.locator("#scout-first-name").fill("Recovery");
  await page.locator("#scout-last-name").fill("Scout");
  await page.getByRole("button", { name: /Projection Specialist/ }).click();
  await page.getByRole("button", { name: "Take the call", exact: true }).click();
  await gamePage.waitForScreen("observation", 60_000);
  await expect(page.getByRole("heading", { level: 1, name: "The match started early." })).toBeVisible();
  await page.getByRole("button", { name: "Watch the match", exact: true }).click();
  const controls = page.getByTestId("mobile-observation-controls");
  await controls.getByRole("button", { name: "Next phase", exact: true }).click();
  await page.locator('[data-tutorial-id="observation-flag-moment"]:visible').first().click();
  await page.locator('[data-tutorial-id="observation-promising-reaction"]:visible').click();
  await page.getByRole("button", { name: /^Confirm the first read\b/ }).click();
  await controls.getByRole("button", { name: "Next phase", exact: true }).click();
  await controls.getByRole("button", { name: "Reflect", exact: true }).click();
  const classification = page.getByRole("group", { name: "What did this passage show?", exact: true });
  if (await classification.count()) {
    await classification.getByRole("radio", { name: /^No reliable conclusion/ }).check();
  }
  const artifacts: unknown[] = [];
  for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    const complete = page.getByRole("button", { name: "Complete Reflection", exact: true });
    await complete.scrollIntoViewIfNeeded();
    await expect(complete).toBeEnabled();
    const axe = await new AxeBuilder({ page }).analyze();
    artifacts.push({ screen: "reflection", viewport, violations: axe.violations });
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`reflection-${viewport.width}.png`), fullPage: true });
  }
  const reflection = await page.evaluate(() => {
    const { gameState, activeSession } = (window as any).__GAME_STORE__.getState();
    if (!activeSession || !gameState?.openingCase) throw new Error("Opening reflection is missing");
    return {
      sessionId: activeSession.id,
      completionId: activeSession.activityInstanceId ?? activeSession.id,
      careerInstanceId: gameState.careerInstanceId,
      openingCaseId: gameState.openingCase.id,
      evidenceDecisions: activeSession.evidenceDecisions ?? {},
    };
  });
  await page.getByRole("button", { name: "Complete Reflection", exact: true }).click();
  await gamePage.waitForScreen("openingDiscovery");
  await expect.poll(() => page.evaluate(() => {
    const tutorial = (window as any).__TUTORIAL_STORE__.getState();
    return { task: tutorial.currentGuidedTask, focused: tutorial.guidedMilestones.focusedPlayer };
  })).toEqual({ task: "resolvedOpeningDiscovery", focused: false });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => (window as any).__GAME_STORE__.getState().setScreen("calendar"));
  await gamePage.waitForScreen("calendar");
  await page.getByRole("button", { name: "Return to guided step", exact: true }).click();
  await gamePage.waitForScreen("openingDiscovery");
  await expect(page.getByRole("button", { name: /Keep the name private/ })).toBeVisible();

  // Completion paints before the normal coalesced autosave. Wait for the exact
  // durable completion, without forcing a flush or changing the game's timers.
  await expect.poll(
    () => readReflectionCheckpoint(page, reflection.sessionId, reflection.completionId),
    { timeout: 30_000, message: "Completed reflection must reach the real autosave before reload" },
  ).toMatchObject({
    careerInstanceId: reflection.careerInstanceId,
    openingCaseId: reflection.openingCaseId,
    openingCaseStage: "decision",
    hasActiveObservationSession: false,
    completedSession: true,
    journalSessionId: reflection.sessionId,
    evidenceDecisions: reflection.evidenceDecisions,
  });
  await testInfo.attach("skipped-focus-durable-reflection.json", {
    body: JSON.stringify(await readReflectionCheckpoint(page, reflection.sessionId, reflection.completionId), null, 2),
    contentType: "application/json",
  });

  // The real Continue Career flow now reads this accepted IndexedDB snapshot.
  await page.reload();
  await page.getByRole("button", { name: "Continue Career", exact: true }).click();
  await gamePage.waitForScreen("openingDiscovery", 60_000);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByRole("button", { name: /Keep the name private/ })).toBeVisible();
    const axe = await new AxeBuilder({ page }).analyze();
    artifacts.push({ screen: "discovery-after-reload", viewport, violations: axe.violations });
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`discovery-recovered-${viewport.width}.png`), fullPage: true });
  }
  await page.getByRole("button", { name: /Keep the name private/ }).click();
  await gamePage.waitForScreen("reportWriter");
  await gamePage.submitCurrentReportViaUI("note");
  await gamePage.waitForScreen("calendar");
  await testInfo.attach("skipped-focus-accessibility.json", {
    body: JSON.stringify(artifacts, null, 2), contentType: "application/json",
  });
  gamePage.expectNoConsoleErrors();
});
