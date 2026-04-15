import { test, expect } from "../fixtures";

test.describe("Loan Activities", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectMidGameState("youth");
  });

  test("loanMonitoring starts investigation mode with dialogue nodes", async ({ gamePage }) => {
    await gamePage.startObservationSession("loanMonitoring");

    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      if (store.getState().activeSession?.state === "setup") {
        store.getState().beginSession();
      }
    });
    await gamePage.page.waitForTimeout(200);

    const session = await gamePage.getActiveSession();
    expect(session).not.toBeNull();
    expect(session!.mode).toBe("investigation");

    // Check for dialogue nodes
    const hasDialogue = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const s = store.getState().activeSession;
      const phase = s?.phases?.[s.currentPhaseIndex];
      return (phase?.dialogueNodes?.length ?? 0) > 0;
    });
    expect(hasDialogue).toBe(true);

    // Clean up
    await gamePage.page.evaluate(() => {
      (window as any).__GAME_STORE__.getState().endObservationSession();
    });
  });

  test("loanRecommendation starts analysis mode with data points", async ({ gamePage }) => {
    await gamePage.startObservationSession("loanRecommendation");

    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      if (store.getState().activeSession?.state === "setup") {
        store.getState().beginSession();
      }
    });
    await gamePage.page.waitForTimeout(200);

    const session = await gamePage.getActiveSession();
    expect(session).not.toBeNull();
    expect(session!.mode).toBe("analysis");

    // Check for data points
    const hasDataPoints = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const s = store.getState().activeSession;
      const phase = s?.phases?.[s.currentPhaseIndex];
      return (phase?.dataPoints?.length ?? 0) > 0;
    });
    expect(hasDataPoints).toBe(true);

    // Clean up
    await gamePage.page.evaluate(() => {
      (window as any).__GAME_STORE__.getState().endObservationSession();
    });
  });

  test("loan monitoring session completes without errors", async ({ gamePage }) => {
    test.setTimeout(60_000);

    await gamePage.startObservationSession("loanMonitoring");

    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      if (store.getState().activeSession?.state === "setup") {
        store.getState().beginSession();
      }
    });
    await gamePage.page.waitForTimeout(200);

    // Advance through all phases, selecting dialogue options as needed
    for (let i = 0; i < 15; i++) {
      const current = await gamePage.getActiveSession();
      if (!current || current.state !== "active") break;

      await gamePage.page.evaluate(() => {
        const store = (window as any).__GAME_STORE__;
        const s = store.getState().activeSession;
        const phase = s?.phases?.[s.currentPhaseIndex];

        // Auto-select first dialogue option if present
        if (phase?.dialogueNodes?.length) {
          const node = phase.dialogueNodes[0];
          if (node.options?.length) {
            store.getState().selectDialogueOption(node.id, node.options[0].id);
          }
        }

        store.getState().advanceSessionPhase();
      });
      await gamePage.page.waitForTimeout(50);
    }

    // End session
    const session = await gamePage.getActiveSession();
    if (session) {
      await gamePage.page.evaluate(() => {
        (window as any).__GAME_STORE__.getState().endObservationSession();
      });
      await gamePage.page.waitForTimeout(200);
    }

    gamePage.expectNoConsoleErrors();
  });

  test("loan recommendation session completes without errors", async ({ gamePage }) => {
    test.setTimeout(60_000);

    await gamePage.startObservationSession("loanRecommendation");

    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      if (store.getState().activeSession?.state === "setup") {
        store.getState().beginSession();
      }
    });
    await gamePage.page.waitForTimeout(200);

    // Advance through phases, selecting data points as needed
    for (let i = 0; i < 15; i++) {
      const current = await gamePage.getActiveSession();
      if (!current || current.state !== "active") break;

      await gamePage.page.evaluate(() => {
        const store = (window as any).__GAME_STORE__;
        const s = store.getState().activeSession;
        const phase = s?.phases?.[s.currentPhaseIndex];

        // Auto-select first data point if present
        if (phase?.dataPoints?.length) {
          store.getState().selectDataPoint(phase.dataPoints[0].id);
        }

        store.getState().advanceSessionPhase();
      });
      await gamePage.page.waitForTimeout(50);
    }

    const session = await gamePage.getActiveSession();
    if (session) {
      await gamePage.page.evaluate(() => {
        (window as any).__GAME_STORE__.getState().endObservationSession();
      });
      await gamePage.page.waitForTimeout(200);
    }

    gamePage.expectNoConsoleErrors();
  });
});
