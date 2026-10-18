import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";

async function readSavedWatch(page: Page) {
  return page.evaluate(() => new Promise<any>((resolve, reject) => {
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
        checkpoint = { careerInstanceId: state.careerInstanceId,
          storageRevision: record.storageRevision, lastSaved: state.lastSaved,
          sessionId: state.activeObservationSession?.id,
          sessionState: state.activeObservationSession?.state,
          phase: state.activeObservationSession?.currentPhaseIndex };
      };
      transaction.oncomplete = () => { db.close(); resolve(checkpoint); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  }));
}

// Authored before save feedback UI: observe normal queue acceptance through
// visible text and independently read the persisted row, without a forced flush.
test("watch and reflection show quiet save feedback only after accepted persistence", async ({ page, gamePage }, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/play", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Start Youth Scout Career", exact: true }).click();
  await page.locator("#scout-first-name").fill("Save");
  await page.locator("#scout-last-name").fill("Feedback");
  await page.getByRole("button", { name: /Projection Specialist/ }).click();
  await page.getByRole("button", { name: "Take the call", exact: true }).click();
  await gamePage.waitForScreen("observation", 60_000);
  const identity = await page.evaluate(() => {
    const state = (window as any).__GAME_STORE__.getState();
    return { careerInstanceId: state.gameState.careerInstanceId, sessionId: state.activeSession.id };
  });

  // Observe DOM presentation only. Recording mutations catches a short saving
  // state without slowing persistence or requiring arbitrary sleeps.
  await page.evaluate(() => {
    const state = window as any;
    state.__watchSaveTransitions = [];
    const record = () => {
      const node = document.querySelector('[data-testid="watch-save-status"]');
      if (!node) return;
      const status = node.getAttribute("data-save-status");
      const previous = state.__watchSaveTransitions.at(-1);
      if (previous?.status !== status) state.__watchSaveTransitions.push({ status, text: node.textContent });
    };
    state.__watchSaveObserver = new MutationObserver(record);
    state.__watchSaveObserver.observe(document.body, { childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ["data-save-status"] });
  });
  await page.getByRole("button", { name: "Watch the match", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__watchSaveTransitions.some((entry: any) =>
    entry.status === "pending" && entry.text === "Saving…"))).toBe(true);
  const feedback = page.getByTestId("watch-save-status");
  await expect(feedback).toHaveText("Saved locally");
  await expect(feedback).toHaveAttribute("data-save-status", "saved");
  await expect(feedback).toHaveAttribute("aria-live", "off");
  await expect(feedback).not.toHaveAttribute("role", "status");
  await expect.poll(() => readSavedWatch(page)).toMatchObject({ ...identity, sessionState: "active", phase: 0 });
  const activeCheckpoint = await readSavedWatch(page);

  const controls = page.getByTestId("mobile-observation-controls");
  await controls.getByRole("button", { name: "Next phase", exact: true }).click();
  // The opening requires recording its standout before phase two can advance.
  // Keep Focus unused while fulfilling that real gameplay prerequisite.
  await page.locator('[data-tutorial-id="observation-flag-moment"]:visible').first().click();
  await page.locator('[data-tutorial-id="observation-promising-reaction"]:visible').click();
  await page.getByRole("button", { name: /^Confirm the first read\b/ }).click();
  await controls.getByRole("button", { name: "Next phase", exact: true }).click();
  await controls.getByRole("button", { name: "Reflect", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Post-Observation Reflection", exact: true })).toBeVisible();
  await expect.poll(() => readSavedWatch(page)).toMatchObject({ ...identity, sessionState: "reflection", phase: 2 });
  await expect(feedback).toHaveText("Saved locally");
  const reflectionCheckpoint = await readSavedWatch(page);

  const bounds: unknown[] = [];
  for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect(feedback).toBeVisible();
    const measured = await feedback.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const header = element.closest("header")!.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
        header: { left: header.left, right: header.right, top: header.top, bottom: header.bottom } };
    });
    expect(measured.left).toBeGreaterThanOrEqual(measured.header.left);
    expect(measured.right).toBeLessThanOrEqual(measured.header.right);
    expect(measured.top).toBeGreaterThanOrEqual(measured.header.top);
    expect(measured.bottom).toBeLessThanOrEqual(measured.header.bottom);
    bounds.push({ viewport, ...measured });
    await page.screenshot({ path: testInfo.outputPath(`reflection-save-feedback-${viewport.width}.png`) });
  }
  const transitions = await page.evaluate(() => {
    (window as any).__watchSaveObserver.disconnect();
    return (window as any).__watchSaveTransitions;
  });
  await testInfo.attach("watch-save-acceptance.json", {
    body: JSON.stringify({ identity, transitions, activeCheckpoint, reflectionCheckpoint, bounds }, null, 2),
    contentType: "application/json",
  });
  gamePage.expectNoConsoleErrors();
});
