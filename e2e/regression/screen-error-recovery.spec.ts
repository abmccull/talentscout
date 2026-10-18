import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures";
import { getVisualEvidenceProvenance } from "../helpers/releaseEvidencePath";

// Integrate at e2e/regression/screen-error-recovery.spec.ts. The existing E2E
// store exposure selects a disposable projection fault; no new bridge or mock.
async function manualRecord(page: Page) {
  return page.evaluate(() => new Promise<any>((resolve, reject) => {
    const open = indexedDB.open("TalentScoutDB");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const read = database.transaction("saves", "readonly").objectStore("saves").get(1);
      read.onerror = () => { database.close(); reject(read.error); };
      read.onsuccess = () => {
        const record = read.result;
        database.close();
        if (!record) { resolve(null); return; }
        void (async () => {
          const bytes = new TextEncoder().encode(JSON.stringify(record));
          const digest = await crypto.subtle.digest("SHA-256", bytes);
          resolve({
            sha256: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join(""),
            bytes: bytes.byteLength, slot: record.slot, name: record.name,
            revision: record.storageRevision, savedAt: record.savedAt,
            buildVersion: record.buildVersion, scoutId: record.state.scout.id,
            seed: record.state.seed, week: record.state.currentWeek, season: record.state.currentSeason,
          });
        })().catch(reject);
      };
    };
  }));
}

test("screen recovery discloses the last successful save and preserves it through restart", async ({ gamePage, page }, testInfo) => {
  test.setTimeout(120_000);
  // This proof covers the supported reporter-off build, not hosted telemetry.
  expect(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() ?? "", "Run against a reporter-off E2E export").toBe("");
  const sentryRequests: string[] = [];
  page.on("request", request => {
    if (/\.ingest(?:\.us)?\.sentry\.io\b/.test(request.url())) sentryRequests.push(request.url());
  });
  await gamePage.goto();
  // This helper executes actual startNewGame/loadGame actions; it supplies no
  // fake provider, save result, reflection implementation or boundary.
  await gamePage.injectState({ scout: { firstName: "Recovery", lastName: "Proof", primarySpecialization: "youth" } });
  await gamePage.navigateTo("settings");
  await page.getByRole("button", { name: "Quick Save", exact: true }).click();
  await expect(page.getByText("Saved to slot 1", { exact: true })).toBeVisible();
  await expect.poll(() => manualRecord(page)).not.toBeNull();
  const before = await manualRecord(page);
  expect(before.slot).toBe(1);
  expect(before.revision).toBeGreaterThan(0);
  gamePage.expectNoConsoleErrors();

  // Start and finish early through real observation actions. Only the derived
  // reflection result is later malformed; canonical career/session data and
  // the confirmed manual record are never changed into invalid data.
  const validProjection = await page.evaluate(() => {
    const store = (window as any).__GAME_STORE__;
    const state = store.getState().gameState;
    const youth: any = Object.values(state.unsignedYouth)[0];
    if (!youth?.player) throw new Error("Valid Youth career has no observation prospect");
    const player = youth.player;
    const pool = [{ playerId: player.id, name: `${player.firstName} ${player.lastName}`, position: player.position }];
    store.getState().startObservationSession("schoolMatch", pool, player.id, { returnScreen: "dashboard" });
    store.getState().beginSession();
    store.getState().endObservationSession();
    const current = store.getState();
    if (current.activeSession?.state !== "reflection" || !current.lastReflectionResult) {
      throw new Error("Real observation actions did not produce a reflection");
    }
    return structuredClone(current.lastReflectionResult);
  });
  await expect(page.getByRole("heading", { name: "Post-Observation Reflection", exact: true })).toBeVisible();
  gamePage.expectNoConsoleErrors();
  const canonicalBeforeFault = await page.evaluate(() => {
    const state = (window as any).__GAME_STORE__.getState();
    return { scoutId: state.gameState.scout.id, week: state.gameState.currentWeek,
      season: state.gameState.currentSeason, sessionId: state.activeSession.id };
  });
  await page.evaluate(() => {
    const store = (window as any).__GAME_STORE__;
    store.setState({ lastReflectionResult: { ...store.getState().lastReflectionResult, reflectionPrompts: null } });
  });
  await expect(page.getByRole("heading", { name: "Something went wrong on this screen", exact: true })).toBeVisible();
  // This assertion exposes the old falsely broad safety assurance before code.
  await expect(page.getByText(/last successful save/)).toContainText("changes since that save may be lost");
  await expect(page.getByText(/Your game data is safe/)).toHaveCount(0);
  const faultErrors = gamePage.getConsoleErrors();
  expect(faultErrors.some(message => message.includes("ScreenErrorBoundary caught:"))).toBe(true);
  for (const message of faultErrors) {
    expect(message).toMatch(/Cannot read properties of null \(reading ['"]length['"]\)|ScreenErrorBoundary caught:/);
  }
  await page.screenshot({ path: testInfo.outputPath("screen-recovery-last-successful-save.png"), fullPage: true });
  await page.getByRole("button", { name: "Return to Dashboard", exact: true }).click();
  await gamePage.waitForScreen("dashboard");
  await expect(page.locator('[data-game-screen="dashboard"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Something went wrong on this screen", exact: true })).toHaveCount(0);
  await page.evaluate(original => (window as any).__GAME_STORE__.setState({ lastReflectionResult: original }), validProjection);
  const canonicalAfterRecovery = await page.evaluate(() => {
    const state = (window as any).__GAME_STORE__.getState();
    return { scoutId: state.gameState.scout.id, week: state.gameState.currentWeek,
      season: state.gameState.currentSeason, sessionId: state.activeSession.id };
  });
  expect(canonicalAfterRecovery).toEqual(canonicalBeforeFault);
  const afterRecovery = await manualRecord(page);
  expect(afterRecovery).toEqual(before);
  // Clear only the explicitly checked intentional errors. Reject new errors.
  expect(gamePage.getConsoleErrors(), "Recovery introduced a new console error").toEqual(faultErrors);
  gamePage.clearConsoleErrors();
  await gamePage.navigateTo("settings");
  await page.getByRole("button", { name: "Quit to Main Menu", exact: true }).click();
  await gamePage.waitForScreen("mainMenu");
  await expect(page.getByTestId("main-menu-actions")).toBeVisible();
  await expect(page.getByRole("button", { name: "Load Career", exact: true })).toBeEnabled();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (window as any).__GAME_STORE__ !== undefined);
  await expect(page.getByTestId("main-menu-actions")).toBeVisible();
  const afterReload = await manualRecord(page);
  expect(afterReload).toEqual(before);
  await page.getByRole("button", { name: "Load Career", exact: true }).click();
  await page.getByRole("button", { name: `Load ${before.name}`, exact: true }).click();
  await gamePage.waitForScreen("dashboard");
  await expect(page.locator('[data-game-screen="dashboard"]')).toBeVisible();
  const loaded = await page.evaluate(() => {
    const state = (window as any).__GAME_STORE__.getState();
    return { scoutId: state.gameState.scout.id, seed: state.gameState.seed,
      week: state.gameState.currentWeek, season: state.gameState.currentSeason,
      activeSession: state.activeSession, reflection: state.lastReflectionResult };
  });
  expect(loaded).toEqual({ scoutId: before.scoutId, seed: before.seed, week: before.week,
    season: before.season, activeSession: null, reflection: null });
  const afterLoad = await manualRecord(page);
  expect(afterLoad).toEqual(before);
  expect(sentryRequests).toEqual([]);
  gamePage.expectNoConsoleErrors();
  await page.screenshot({ path: testInfo.outputPath("screen-recovery-loaded-confirmed-save.png"), fullPage: true });
  await testInfo.attach("screen-recovery-proof.json", {
    body: JSON.stringify({ evidenceKind: "real-renderer-screen-recovery", provenance: getVisualEvidenceProvenance(),
      reporterScope: "reporter-off", fault: "transient reflectionPrompts:null", faultErrors,
      before, afterRecovery, afterReload, afterLoad, canonicalBeforeFault, canonicalAfterRecovery,
      loaded, sentryRequestCount: sentryRequests.length }, null, 2), contentType: "application/json",
  });
});
