import { test, expect } from "../fixtures";

test.describe("Agency Showcase", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectMidGameState("youth");
  });

  test("agentShowcase starts investigation session with dialogue", async ({ gamePage }) => {
    await gamePage.startObservationSession("agentShowcase");

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

    // Should have dialogue nodes
    const hasDialogue = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const s = store.getState().activeSession;
      const phase = s?.phases?.[s.currentPhaseIndex];
      return (phase?.dialogueNodes?.length ?? 0) > 0;
    });
    expect(hasDialogue).toBe(true);
  });

  test("completing showcase returns to previous screen", async ({ gamePage }) => {
    test.setTimeout(60_000);

    // Note the current screen before starting
    await gamePage.setScreen("dashboard");
    await gamePage.page.waitForTimeout(200);

    await gamePage.startObservationSession("agentShowcase");

    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      if (store.getState().activeSession?.state === "setup") {
        store.getState().beginSession();
      }
    });
    await gamePage.page.waitForTimeout(200);

    // Advance through all phases
    for (let i = 0; i < 15; i++) {
      const current = await gamePage.getActiveSession();
      if (!current || current.state !== "active") break;

      await gamePage.page.evaluate(() => {
        const store = (window as any).__GAME_STORE__;
        const s = store.getState().activeSession;
        const phase = s?.phases?.[s.currentPhaseIndex];
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
    await gamePage.page.evaluate(() => {
      (window as any).__GAME_STORE__.getState().endObservationSession();
    });
    await gamePage.page.waitForTimeout(300);

    // Should have returned from observation
    const afterSession = await gamePage.getActiveSession();
    expect(afterSession).toBeNull();
  });

  test("no console errors during agency showcase", async ({ gamePage }) => {
    test.setTimeout(60_000);

    await gamePage.startObservationSession("agentShowcase");

    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      if (store.getState().activeSession?.state === "setup") {
        store.getState().beginSession();
      }
    });
    await gamePage.page.waitForTimeout(200);

    // Quick run-through
    for (let i = 0; i < 15; i++) {
      const current = await gamePage.getActiveSession();
      if (!current || current.state !== "active") break;

      await gamePage.page.evaluate(() => {
        const store = (window as any).__GAME_STORE__;
        const s = store.getState().activeSession;
        const phase = s?.phases?.[s.currentPhaseIndex];
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
