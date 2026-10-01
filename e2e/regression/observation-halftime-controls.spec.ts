import { expect, test } from "../fixtures";

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
      await page.getByRole("group", { name: /^Interactive observation pitch at / })
        .locator("button[data-observation-pitch-marker]").first().tap();
      const focusToggle = page.getByRole("button", { name: /^Focus targets and lenses/ });
      // Bound the original stationary hit interception without forcing the pointer.
      await focusToggle.click({ timeout: 5_000 });
      const sheet = page.getByRole("dialog", { name: "Choose your focus" });
      await expect(sheet).toBeVisible();
      const available = await page.evaluate(() =>
        (window as any).__GAME_STORE__.getState().activeSession.focusTokens.available);
      await sheet.getByRole("button", { name: `Use technical lens for ${setup.target.name}`, exact: true }).click();
      await expect(sheet.getByLabel(`technical observation lens locked for ${setup.target.name}`, { exact: true })).toBeVisible();
      await sheet.getByRole("button", { name: "Close focus controls", exact: true }).click();
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
      // The locked choice retains its panel: the drawer must still receive a
      // normal pointer and expose the same actual allocation afterwards.
      await focusToggle.click({ timeout: 5_000 });
      await expect(sheet.getByLabel(`technical observation lens locked for ${setup.target.name}`, { exact: true })).toBeVisible();
      await sheet.getByRole("button", { name: "Close focus controls", exact: true }).click();
      await expect(page.getByRole("region", { name: "What you noticed" })).toBeVisible();
      await expect(controls.getByRole("button", { name: "Next phase", exact: true })).toBeEnabled();
      gamePage.expectNoConsoleErrors();
      await testInfo.attach("actual-halftime-control-state.json", {
        body: JSON.stringify({ viewport, setup, actual }, null, 2), contentType: "application/json",
      });
      await page.screenshot({ path: testInfo.outputPath(`halftime-controls-${viewport.width}.png`), fullPage: true });
    });
  }
});
