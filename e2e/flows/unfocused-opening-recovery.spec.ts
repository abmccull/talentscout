import { test, expect } from "../fixtures";
import { readOpeningLead, advanceGeneratedWatchToReflection, classifyDisplayedLeadEvidence } from "../helpers/generated-watch";

test.use({ viewport: { width: 711, height: 452 }, contextOptions: { reducedMotion: "reduce" } });

test.beforeEach(async ({ page }) => {
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
});

test("unfocused opening keeps uncertainty and can book a genuine follow-up", async ({ page, gamePage }, testInfo) => {
  test.setTimeout(180_000);
  await page.goto("/play");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Graphics", exact: true }).click();
  await page.getByRole("radio", { name: "Large", exact: true }).locator("..").click();
  await page.getByRole("button", { name: "Back to main menu", exact: true }).click();
  await page.getByRole("button", { name: "Start Youth Scout Career", exact: true }).click();
  await page.locator("#scout-first-name").fill("Keyboard");
  await page.locator("#scout-last-name").fill("Reflow");
  await page.getByRole("button", { name: /Projection Specialist/ }).click();
  await page.getByRole("button", { name: "Take the call", exact: true }).click();
  await gamePage.waitForScreen("observation", 60_000);
  const question = page.getByRole("group", { name: "What are you here to learn?" });
  await question.locator("summary").click();
  await question.getByRole("radio", { name: /^What might translate to the next level\?/ }).locator("..").click();
  await page.getByRole("button", { name: "Watch the match", exact: true }).click();
  // Keep an unfocused passage without inventing first-hand observations.
  const hideHelp = page.getByRole("button", { name: "Hide mentor help", exact: true });
  if (await hideHelp.isVisible()) await hideHelp.click();
  const lead = await readOpeningLead(page);
  await advanceGeneratedWatchToReflection(page, { lead, focus: false });
  if (await hideHelp.isVisible()) await hideHelp.click();
  await classifyDisplayedLeadEvidence(page, lead, true);
  await page.getByRole("button", { name: "Complete Reflection", exact: true }).click();
  await gamePage.waitForScreen("openingDiscovery");
  await page.getByRole("button", { name: /Keep the name private/ }).click();
  await gamePage.waitForScreen("reportWriter");
  await expect(page.getByText("Evidence needed", { exact: true })).toBeVisible();
  const beforeRecovery = await page.evaluate((playerId) => {
    const state = (window as any).__GAME_STORE__.getState().gameState;
    return { reports: Object.values(state.reports), observations: Object.values(state.observations)
      .filter((entry: any) => entry.playerId === playerId) };
  }, lead.playerId);
  expect(beforeRecovery).toEqual({ reports: [], observations: [] });
  await page.getByRole("button", { name: "Plan focused observation", exact: true }).click();
  await gamePage.waitForScreen("calendar");
  await expect(page.getByRole("heading", { name: "Planner", exact: true })).toBeVisible();
  if (await hideHelp.isVisible()) await hideHelp.click();
  await testInfo.attach("planner-recovery.txt", { body: await page.locator("body").ariaSnapshot(), contentType: "text/plain" });
  await page.screenshot({ path: testInfo.outputPath("planner-recovery.png"), fullPage: true });
  const booked = await page.evaluate((playerId) => {
    const state = (window as any).__GAME_STORE__.getState();
    return { pending: state.pendingCalendarActivity, activities: state.gameState.schedule.activities,
      guided: state.gameState.guidedSessionRequested, playerId };
  }, lead.playerId);
  await testInfo.attach("recovery-state.json", { body: JSON.stringify(booked, null, 2), contentType: "application/json" });
  const chooseDay = page.getByRole("button", { name: "Choose a day for this work", exact: true });
  await expect(chooseDay, "Recovery must carry the selected lead into a concrete follow-up").toBeVisible();
  await chooseDay.click();
  const place = page.getByRole("button", { name: /^Place Follow-up Session on / }).and(page.locator("button:enabled"));
  await place.first().click();
  await expect(page.locator('[data-activity-type="followUpSession"]').getByTestId("planner-activity-target").filter({ hasText: lead.name })).toBeVisible();
  let watched = false;
  await gamePage.advanceCanonicalWeek({ launchLiveSession: true, completeLiveSession: async () => {
    const question = page.getByRole("group", { name: "What are you here to learn?" });
    await question.locator("summary").click();
    await question.getByRole("radio", { name: /^What might translate to the next level\?/ }).locator("..").click();
    await page.locator('[data-tutorial-id="observation-begin-session"]').click();
    await advanceGeneratedWatchToReflection(page, { lead, focus: true, hideMentorHelp: true });
    if (await hideHelp.isVisible()) await hideHelp.click();
    await classifyDisplayedLeadEvidence(page, lead, true);
    await page.getByRole("button", { name: "Complete Reflection", exact: true }).click();
    watched = true;
  } });
  expect(watched).toBe(true);
  const afterWatch = await page.evaluate((playerId) => {
    const state = (window as any).__GAME_STORE__.getState().gameState;
    return { reports: Object.values(state.reports), observations: Object.values(state.observations)
      .filter((entry: any) => entry.playerId === playerId) as any[] };
  }, lead.playerId);
  expect(afterWatch.reports).toEqual([]);
  expect(afterWatch.observations.length).toBeGreaterThan(0);
  expect(afterWatch.observations.every((entry) => entry.attributeReadings.length === 0 && !entry.abilityReading)).toBe(true);
  const showHelp = page.getByRole("button", { name: "Show mentor help", exact: true });
  if (await showHelp.isVisible()) await showHelp.click();
  await page.getByRole("button", { name: "Return to guided step", exact: true }).click();
  await expect(page.getByRole("group", { name: "Saved evidence", exact: true })).toBeVisible();
  await expect(page.getByText("Evidence needed", { exact: true })).toHaveCount(0);
  await testInfo.attach("earned-recovery.json", { body: JSON.stringify({ beforeRecovery, afterWatch }, null, 2), contentType: "application/json" });
  await page.screenshot({ path: testInfo.outputPath("earned-recovery-assessment.png"), fullPage: true });
  gamePage.expectNoConsoleErrors();
});
