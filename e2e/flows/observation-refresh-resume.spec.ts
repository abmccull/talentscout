import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";

async function readAutosave(page: Page) {
  return page.evaluate(async () => new Promise<any>((resolve, reject) => {
    const opening = indexedDB.open("TalentScoutDB");
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const database = opening.result;
      const read = database.transaction("saves", "readonly").objectStore("saves").get(0);
      read.onerror = () => { database.close(); reject(read.error); };
      read.onsuccess = () => {
        const state = read.result?.state;
        database.close();
        // Use the same JSON boundary as the expected snapshot: IndexedDB can
        // retain -0, while the save's portable representation normalizes it.
        resolve(JSON.parse(JSON.stringify({ session: state?.activeObservationSession, openingCase: state?.openingCase })));
      };
    };
  }));
}

async function checkpointAndReload(page: Page) {
  const session = await page.evaluate(() => JSON.parse(JSON.stringify(
    (window as any).__GAME_STORE__.getState().activeSession,
  )));
  // Assert the authoritative save before unload. A best-effort pagehide flush
  // must not make missing gameplay autosaves appear to work.
  await expect.poll(async () => (await readAutosave(page)).session, { timeout: 15_000 }).toMatchObject(session);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Continue Career", exact: true }).click();
  await expect.poll(() => page.evaluate(() => {
    const state = (window as any).__GAME_STORE__.getState();
    return JSON.parse(JSON.stringify({ screen: state.currentScreen, session: state.activeSession }));
  })).toMatchObject({ screen: "observation", session });
}

test("opening watch resumes saved decisions through real browser reloads", async ({ page, gamePage }, testInfo) => {
  test.setTimeout(180_000);
  await page.goto("/play", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Start Youth Scout Career", exact: true }).click();
  await page.locator("#scout-first-name").fill("Resume");
  await page.locator("#scout-last-name").fill("Scout");
  await page.getByRole("button", { name: /Projection Specialist/ }).click();
  await page.getByRole("button", { name: "Take the call", exact: true }).click();
  await page.getByRole("button", { name: "Watch the match", exact: true }).click();

  await checkpointAndReload(page);
  await expect(page.getByRole("button", { name: "Watch the match", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /^Use technical lens for / }).click();
  await expect(page.getByRole("button", { name: /^Remove focus from / }).first()).toBeVisible();
  await checkpointAndReload(page);
  const resumedMentor = page.getByLabel("Mentor: Keep watching", { exact: true });
  await expect(resumedMentor).toBeVisible();
  // Resizing can capture a frame before the mentor has remeasured its target.
  // Require the actual settled panel to fit before saving visual evidence.
  const expectMentorWithinViewport = async () => {
    await expect.poll(() => resumedMentor.evaluate((panel) => {
      const rect = panel.getBoundingClientRect();
      return rect.left >= 0 && rect.top >= 0
        && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight;
    })).toBe(true);
  };
  await expectMentorWithinViewport();
  await page.screenshot({ path: testInfo.outputPath("resumed-focus-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectMentorWithinViewport();
  await page.screenshot({ path: testInfo.outputPath("resumed-focus-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });

  const controls = page.getByTestId("mobile-observation-controls");
  await controls.getByRole("button", { name: "Next phase", exact: true }).click();
  // Any observed passage can be saved; the generated opening need not contain
  // an exceptional performance to test durable scouting decisions.
  await page.locator('[data-tutorial-id="observation-flag-moment"]:visible').first().click();
  await page.locator('[data-tutorial-id="observation-promising-reaction"]:visible').click();
  await page.getByRole("button", { name: /^Confirm the first read\b/ }).click();
  await checkpointAndReload(page);
  await expect(page.locator('[data-tutorial-id="observation-evidence-feed"]').getByLabel("Flagged", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const session = (window as any).__GAME_STORE__.getState().activeSession;
    return { phase: session.currentPhaseIndex, approach: session.halftimeApproach, reaction: session.flaggedMoments[0]?.reaction };
  })).toEqual({ phase: 1, approach: "confirm", reaction: "promising" });

  await controls.getByRole("button", { name: "Next phase", exact: true }).click();
  await controls.getByRole("button", { name: "Reflect on the watch", exact: true }).click();
  await checkpointAndReload(page);
  const interpretation = page.getByRole("group", { name: "What did this passage show?" });
  await expect(interpretation).toBeVisible();
  await interpretation.getByRole("radio").first().check();
  await checkpointAndReload(page);
  await expect(interpretation.getByRole("radio").first()).toBeChecked();
  await page.getByRole("button", { name: "Complete Reflection", exact: true }).click();
  await gamePage.waitForScreen("openingDiscovery");
  await page.getByRole("button", { name: /Keep the name private/ }).click();
  await gamePage.waitForScreen("reportWriter");
  await expect.poll(async () => (await readAutosave(page)).openingCase).toMatchObject({ stage: "report", selectedChoiceId: "protect" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Continue Career", exact: true }).click();
  await gamePage.waitForScreen("reportWriter");
  await expect(page.getByRole("group", { name: "Saved evidence" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const state = (window as any).__GAME_STORE__.getState().gameState;
    return state.consequenceState.decisions[state.openingCase.decisionId]?.selectedOptionId;
  })).toBe("protect");
  gamePage.expectNoConsoleErrors();
});
