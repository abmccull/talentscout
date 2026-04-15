import { test, expect } from "../fixtures";

/**
 * Regression: verify all 4 observation modes complete successfully
 * for representative activity types.
 */
test.describe("Observation Modes Regression", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectMidGameState("youth");
  });

  const modeTests = [
    { activity: "schoolMatch", expectedMode: "fullObservation" },
    { activity: "followUpSession", expectedMode: "investigation" },
    { activity: "databaseQuery", expectedMode: "analysis" },
    { activity: "statsBriefing", expectedMode: "quickInteraction" },
  ] as const;

  for (const { activity, expectedMode } of modeTests) {
    test(`${expectedMode} mode (${activity}) completes full lifecycle`, async ({ gamePage }) => {
      test.setTimeout(60_000);

      await gamePage.startObservationSession(activity);

      await gamePage.page.evaluate(() => {
        const store = (window as any).__GAME_STORE__;
        if (store.getState().activeSession?.state === "setup") {
          store.getState().beginSession();
        }
      });
      await gamePage.page.waitForTimeout(200);

      const session = await gamePage.getActiveSession();
      expect(session).not.toBeNull();
      expect(session!.mode).toBe(expectedMode);

      // Advance through all phases with auto-interaction
      for (let i = 0; i < 25; i++) {
        const current = await gamePage.getActiveSession();
        if (!current || current.state !== "active") break;

        await gamePage.page.evaluate(() => {
          const store = (window as any).__GAME_STORE__;
          const s = store.getState().activeSession;
          const phase = s?.phases?.[s.currentPhaseIndex];

          // Auto-interact based on mode
          if (phase?.dialogueNodes?.length) {
            const node = phase.dialogueNodes[0];
            if (node.options?.length) {
              store.getState().selectDialogueOption(node.id, node.options[0].id);
            }
          }
          if (phase?.dataPoints?.length) {
            store.getState().selectDataPoint(phase.dataPoints[0].id);
          }
          if (phase?.choices?.length) {
            store.getState().selectStrategicChoice(phase.choices[0].id);
          }

          store.getState().advanceSessionPhase();
        });
        await gamePage.page.waitForTimeout(30);
      }

      // End session
      const afterPhases = await gamePage.getActiveSession();
      if (afterPhases) {
        await gamePage.page.evaluate(() => {
          (window as any).__GAME_STORE__.getState().endObservationSession();
        });
        await gamePage.page.waitForTimeout(200);
      }

      const final = await gamePage.getActiveSession();
      expect(final).toBeNull();

      gamePage.expectNoConsoleErrors();
    });
  }
});
