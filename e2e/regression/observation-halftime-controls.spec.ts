import { expect, test } from "../fixtures";
import { observationRail } from "../helpers/observation-rail";

test.describe("half-time watch controls", () => {
  test.use({ hasTouch: true });

  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 },
    { width: 768, height: 900 }, { width: 1023, height: 900 },
    { width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
    test(`a real half-time choice leaves focus and evidence reachable at ${viewport.width}px`, async ({ gamePage, page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await gamePage.goto();
      await gamePage.injectMidGameState("youth");
      await gamePage.startObservationSession("schoolMatch");
      await page.getByRole("button", { name: "Begin Observation", exact: true }).click();
      const setup = await page.evaluate(() => {
        const session = (window as any).__GAME_STORE__.getState().activeSession;
        return { id: session.id, midpoint: Math.floor(session.phases.length / 2),
          target: { id: session.players[0].playerId, name: session.players[0].name },
          playerIds: session.players.map((player: any) => player.playerId) };
      });
      expect(setup.midpoint).toBeGreaterThan(0);
      const controls = page.getByTestId("mobile-observation-controls");
      for (let phase = 0; phase < setup.midpoint; phase++) {
        await controls.getByRole("button", { name: "Next phase", exact: true }).click();
        await page.waitForFunction((expected) =>
          (window as any).__GAME_STORE__.getState().activeSession.currentPhaseIndex === expected, phase + 1);
      }
      await expect(page.getByRole("region", { name: "How will you watch the second half?" })).toBeVisible();
      const rail = observationRail(page);
      await expect(rail).toHaveCount(1);
      await rail.locator("button[data-observation-pitch-marker]").first().tap();
      const lensGroup = page.getByRole("group", { name: `Observation lens for ${setup.target.name}`, exact: true });
      await expect(lensGroup).toHaveCount(1);
      const technical = lensGroup.getByRole("button", { name: `Use technical lens for ${setup.target.name}`, exact: true });
      const available = await page.evaluate(() =>
        (window as any).__GAME_STORE__.getState().activeSession.focusTokens.available);
      await technical.click({ timeout: 5_000 });
      const release = page.getByRole("button", { name: `Remove focus from ${setup.target.name}`, exact: true });
      await expect(release).toHaveCount(1);
      await expect(release).toBeVisible();
      await page.getByRole("button", { name: /^Confirm the first read\b/ }).click();
      const actual = await page.evaluate((id) => {
        const session = (window as any).__GAME_STORE__.getState().activeSession;
        const player = session.players.find((player: any) => player.playerId === id);
        return { id: session.id, phase: session.currentPhaseIndex,
          playerIds: session.players.map((player: any) => player.playerId),
          approach: session.halftimeApproach, available: session.focusTokens.available,
          target: { focused: player.isFocused, lens: player.currentLens,
            phaseFocused: player.focusedPhases.includes(session.currentPhaseIndex) } };
      }, setup.target.id);
      expect(actual).toMatchObject({ id: setup.id, phase: setup.midpoint, playerIds: setup.playerIds,
        available: available - 1, target: { focused: true, lens: "technical", phaseFocused: true } });
      expect(actual.approach).toBeTruthy();
      // The chosen allocation stays readable and actionable in the same inline
      // panel after the real approach choice. Trial hit-testing never releases it.
      await expect(lensGroup).toHaveCount(0);
      await release.click({ trial: true, timeout: 5_000 });
      const releaseBounds = await release.evaluate(element => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return { width: rect.width, height: rect.height, unobscured: hit === element || Boolean(hit && element.contains(hit)) };
      });
      expect(releaseBounds.width).toBeGreaterThanOrEqual(44);
      expect(releaseBounds.height).toBeGreaterThanOrEqual(44);
      expect(releaseBounds.unobscured).toBe(true);
      await expect(page.getByRole("region", { name: "What you noticed" })).toBeVisible();
      await expect(controls.getByRole("button", { name: "Next phase", exact: true })).toBeEnabled();
      gamePage.expectNoConsoleErrors();
      await testInfo.attach("actual-halftime-control-state.json", {
        body: JSON.stringify({ viewport, setup, actual, releaseBounds }, null, 2), contentType: "application/json",
      });
      await page.screenshot({ path: testInfo.outputPath(`halftime-controls-${viewport.width}.png`), fullPage: true });
    });
  }
});
