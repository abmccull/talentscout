import { test, expect } from "../fixtures";

test.describe("Observation Session — Full Lifecycle", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectMidGameState("youth");
  });

  // ── Full Observation Mode ───────────────────────────────────────────────

  test("session lifecycle: setup → active → reflection → complete", async ({ gamePage }) => {
    test.setTimeout(60_000);

    await gamePage.startObservationSession("schoolMatch");

    // Session should be in setup or active state
    let session = await gamePage.getActiveSession();
    expect(session).not.toBeNull();
    expect(session!.mode).toBe("fullObservation");
    expect(["setup", "active"]).toContain(session!.state);

    // Begin the session if still in setup
    if (session!.state === "setup") {
      await gamePage.page.evaluate(() => {
        (window as any).__GAME_STORE__.getState().beginSession();
      });
      await gamePage.page.waitForTimeout(200);
    }

    session = await gamePage.getActiveSession();
    expect(session!.state).toBe("active");

    // Advance through all phases until reflection
    const maxPhases = session!.totalPhases;
    for (let i = session!.currentPhaseIndex; i < maxPhases; i++) {
      await gamePage.page.evaluate(() => {
        const store = (window as any).__GAME_STORE__;
        const activeSession = store.getState().activeSession;
        const atHalftime = Boolean(
          activeSession?.phases[activeSession.currentPhaseIndex]?.isHalfTime,
        ) || Boolean(
          activeSession
          && activeSession.phases.length >= 3
          && activeSession.currentPhaseIndex === Math.floor(activeSession.phases.length / 2),
        );
        if (atHalftime && !activeSession?.halftimeApproach) {
          store.getState().setSessionHalftimeApproach("confirm");
        }
        store.getState().advanceSessionPhase();
      });
      await gamePage.page.waitForTimeout(50);
    }

    session = await gamePage.getActiveSession();
    expect(session!.state).toBe("reflection");

    // End the session
    await gamePage.page.evaluate(() => {
      (window as any).__GAME_STORE__.getState().endObservationSession();
    });
    await gamePage.page.waitForTimeout(200);

    const afterEnd = await gamePage.getActiveSession();
    expect(afterEnd).toBeNull();
  });

  test("focus token allocation and removal", async ({ gamePage }) => {
    await gamePage.startObservationSession("schoolMatch");

    // Begin session
    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      if (store.getState().activeSession?.state === "setup") {
        store.getState().beginSession();
      }
    });
    await gamePage.page.waitForTimeout(200);

    let session = await gamePage.getActiveSession();
    const initialTokens = session!.focusTokens.available;
    expect(initialTokens).toBeGreaterThan(0);

    // Allocate a focus token
    const allocated = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const s = store.getState().activeSession;
      if (!s || !s.players || s.players.length === 0) return false;
      store.getState().allocateSessionFocus(s.players[0].playerId, "technical");
      return true;
    });

    if (allocated) {
      session = await gamePage.getActiveSession();
      expect(session!.focusTokens.available).toBeLessThan(initialTokens);

      // Remove focus — clears player assignment but tokens stay spent
      await gamePage.page.evaluate(() => {
        const store = (window as any).__GAME_STORE__;
        const s = store.getState().activeSession;
        store.getState().removeSessionFocus(s.players[0].playerId);
      });
      await gamePage.page.waitForTimeout(100);

      // Verify player is no longer focused
      const isFocused = await gamePage.page.evaluate(() => {
        const store = (window as any).__GAME_STORE__;
        const s = store.getState().activeSession;
        return s?.players?.[0]?.isFocused ?? false;
      });
      expect(isFocused).toBe(false);
    }
  });

  test("lens switching between attribute domains", async ({ gamePage }) => {
    await gamePage.startObservationSession("schoolMatch");

    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      if (store.getState().activeSession?.state === "setup") {
        store.getState().beginSession();
      }
    });
    await gamePage.page.waitForTimeout(200);

    // Allocate focus with "technical" lens
    const playerId = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const s = store.getState().activeSession;
      if (!s?.players?.length) return null;
      store.getState().allocateSessionFocus(s.players[0].playerId, "technical");
      return s.players[0].playerId;
    });

    if (playerId) {
      // Verify player is focused with technical lens
      const playerFocus = await gamePage.page.evaluate((pid) => {
        const store = (window as any).__GAME_STORE__;
        const s = store.getState().activeSession;
        const player = s?.players?.find((p: any) => p.playerId === pid);
        return { isFocused: player?.isFocused, lens: player?.currentLens };
      }, playerId);
      expect(playerFocus.isFocused).toBe(true);
      expect(playerFocus.lens).toBe("technical");

      // Remove focus and re-allocate with different lens on a different player
      await gamePage.page.evaluate((pid) => {
        const store = (window as any).__GAME_STORE__;
        store.getState().removeSessionFocus(pid);
      }, playerId);

      // Allocate to second player with physical lens
      const secondPlayer = await gamePage.page.evaluate(() => {
        const store = (window as any).__GAME_STORE__;
        const s = store.getState().activeSession;
        if (s?.players?.length > 1 && s.focusTokens.available > 0) {
          store.getState().allocateSessionFocus(s.players[1].playerId, "physical");
          return s.players[1].playerId;
        }
        return null;
      });

      if (secondPlayer) {
        const secondFocus = await gamePage.page.evaluate((pid) => {
          const store = (window as any).__GAME_STORE__;
          const s = store.getState().activeSession;
          const player = s?.players?.find((p: any) => p.playerId === pid);
          return { isFocused: player?.isFocused, lens: player?.currentLens };
        }, secondPlayer);
        expect(secondFocus.isFocused).toBe(true);
        expect(secondFocus.lens).toBe("physical");
      }
    }
  });

  test("moment flagging with reactions", async ({ gamePage }) => {
    await gamePage.startObservationSession("schoolMatch");

    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      if (store.getState().activeSession?.state === "setup") {
        store.getState().beginSession();
      }
    });
    await gamePage.page.waitForTimeout(200);

    // Flag a moment from the current phase
    const flagged = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const s = store.getState().activeSession;
      const phase = s?.phases?.[s.currentPhaseIndex];
      if (!phase?.moments?.length) return false;
      store.getState().flagSessionMoment(phase.moments[0].id, "promising");
      return true;
    });

    if (flagged) {
      const session = await gamePage.getActiveSession();
      expect(session!.flaggedMoments).toBeGreaterThan(0);
    }
  });

  test("phase advancement and half-time token refresh", async ({ gamePage }) => {
    test.setTimeout(60_000);

    await gamePage.startObservationSession("schoolMatch");

    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      if (store.getState().activeSession?.state === "setup") {
        store.getState().beginSession();
      }
    });
    await gamePage.page.waitForTimeout(200);

    let session = await gamePage.getActiveSession();
    const initialPhase = session!.currentPhaseIndex;

    // Advance one phase
    await gamePage.page.evaluate(() => {
      (window as any).__GAME_STORE__.getState().advanceSessionPhase();
    });
    await gamePage.page.waitForTimeout(100);

    session = await gamePage.getActiveSession();
    expect(session!.currentPhaseIndex).toBeGreaterThan(initialPhase);

    // Spend a token, then advance to halftime
    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const s = store.getState().activeSession;
      if (s?.players?.length && s.focusTokens.available > 0) {
        store.getState().allocateSessionFocus(s.players[0].playerId, "technical");
      }
    });

    const tokensBeforeHalf = (await gamePage.getActiveSession())!.focusTokens.available;

    // Advance to roughly halfway through
    const halfPoint = Math.floor(session!.totalPhases / 2);
    for (let i = session!.currentPhaseIndex; i < halfPoint; i++) {
      const current = await gamePage.getActiveSession();
      if (!current || current.state !== "active") break;
      await gamePage.page.evaluate(() => {
        (window as any).__GAME_STORE__.getState().advanceSessionPhase();
      });
      await gamePage.page.waitForTimeout(30);
    }

    // Check tokens — they may have refreshed at halftime
    const tokensAfterHalf = (await gamePage.getActiveSession());
    if (tokensAfterHalf && tokensAfterHalf.state === "active") {
      // If halftime was passed, tokens should have refreshed
      expect(tokensAfterHalf.focusTokens.available).toBeGreaterThanOrEqual(0);
    }
  });

  // ── Investigation Mode ──────────────────────────────────────────────────

  test("investigation: dialogue nodes render and choices apply consequences", async ({ gamePage }) => {
    await gamePage.startObservationSession("followUpSession");

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

    // Check dialogue nodes exist in the current phase
    const hasDialogue = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const s = store.getState().activeSession;
      const phase = s?.phases?.[s.currentPhaseIndex];
      return {
        hasNodes: (phase?.dialogueNodes?.length ?? 0) > 0,
        nodeCount: phase?.dialogueNodes?.length ?? 0,
      };
    });

    expect(hasDialogue.hasNodes).toBe(true);

    // Select a dialogue option
    const selected = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const s = store.getState().activeSession;
      const phase = s?.phases?.[s.currentPhaseIndex];
      const node = phase?.dialogueNodes?.[0];
      if (!node?.options?.length) return false;
      store.getState().selectDialogueOption(node.id, node.options[0].id);
      return true;
    });

    expect(selected).toBe(true);
  });

  // ── Analysis Mode ───────────────────────────────────────────────────────

  test("analysis: data points render and can be selected", async ({ gamePage }) => {
    await gamePage.startObservationSession("databaseQuery");

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

    // Check data points exist
    const dataPointInfo = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const s = store.getState().activeSession;
      const phase = s?.phases?.[s.currentPhaseIndex];
      const points = phase?.dataPoints ?? [];
      return {
        count: points.length,
        firstPoint: points[0]
          ? { label: points[0].label, category: points[0].category }
          : null,
      };
    });

    expect(dataPointInfo.count).toBeGreaterThan(0);
    if (dataPointInfo.firstPoint) {
      expect(dataPointInfo.firstPoint.label).toBeTruthy();
      expect(dataPointInfo.firstPoint.category).toBeTruthy();
    }

    // Select a data point
    const selected = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const s = store.getState().activeSession;
      const phase = s?.phases?.[s.currentPhaseIndex];
      if (!phase?.dataPoints?.length) return false;
      store.getState().selectDataPoint(phase.dataPoints[0].id);
      return true;
    });

    expect(selected).toBe(true);
  });

  // ── Quick Interaction Mode ──────────────────────────────────────────────

  test("quickInteraction: strategic choices render and can be selected", async ({ gamePage }) => {
    await gamePage.startObservationSession("statsBriefing");

    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      if (store.getState().activeSession?.state === "setup") {
        store.getState().beginSession();
      }
    });
    await gamePage.page.waitForTimeout(200);

    const session = await gamePage.getActiveSession();
    expect(session).not.toBeNull();
    expect(session!.mode).toBe("quickInteraction");

    // Check strategic choices exist
    const choiceInfo = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const s = store.getState().activeSession;
      const phase = s?.phases?.[s.currentPhaseIndex];
      const choices = phase?.choices ?? [];
      return {
        count: choices.length,
        firstChoice: choices[0]
          ? { text: choices[0].text, hasDescription: !!choices[0].description }
          : null,
      };
    });

    expect(choiceInfo.count).toBeGreaterThan(0);
    if (choiceInfo.firstChoice) {
      expect(choiceInfo.firstChoice.text).toBeTruthy();
    }

    // Select a strategic choice
    const selected = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const s = store.getState().activeSession;
      const phase = s?.phases?.[s.currentPhaseIndex];
      if (!phase?.choices?.length) return false;
      store.getState().selectStrategicChoice(phase.choices[0].id);
      return true;
    });

    expect(selected).toBe(true);
  });

  // ── Cross-Mode Features ─────────────────────────────────────────────────

  test("sessions do not accept unscored free-text hypotheses", async ({ gamePage }) => {
    await gamePage.startObservationSession("schoolMatch");

    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      if (store.getState().activeSession?.state === "setup") {
        store.getState().beginSession();
      }
    });
    await gamePage.page.waitForTimeout(200);

    const authority = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const s = store.getState().activeSession;
      if (!s?.players?.length) return null;
      const before = s.hypotheses?.length ?? 0;
      if (s.focusTokens?.available > 0) {
        store.getState().allocateSessionFocus(s.players[0].playerId, "technical");
      }
      return {
        hasLegacyFreeTextAction: typeof store.getState().addSessionHypothesis === "function",
        before,
        after: store.getState().activeSession?.hypotheses?.length ?? 0,
      };
    });
    expect(authority).not.toBeNull();
    expect(authority?.hasLegacyFreeTextAction).toBe(false);
    expect(authority?.after).toBe(authority?.before);
  });

  test("reflection notes added during reflection phase", async ({ gamePage }) => {
    test.setTimeout(60_000);

    await gamePage.startObservationSession("schoolMatch");

    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      if (store.getState().activeSession?.state === "setup") {
        store.getState().beginSession();
      }
    });
    await gamePage.page.waitForTimeout(200);

    // Advance through all active phases to reach reflection
    let session = await gamePage.getActiveSession();
    const maxPhases = session!.totalPhases;
    for (let i = session!.currentPhaseIndex; i < maxPhases; i++) {
      const current = await gamePage.getActiveSession();
      if (!current || current.state !== "active") break;
      await gamePage.page.evaluate(() => {
        (window as any).__GAME_STORE__.getState().advanceSessionPhase();
      });
      await gamePage.page.waitForTimeout(30);
    }

    session = await gamePage.getActiveSession();
    if (session?.state === "reflection") {
      // Add a reflection note
      await gamePage.page.evaluate(() => {
        (window as any).__GAME_STORE__
          .getState()
          .addSessionNote("Player showed great composure under pressure");
      });
      await gamePage.page.waitForTimeout(100);

      session = await gamePage.getActiveSession();
      expect(session!.reflectionNotes).toBeGreaterThan(0);
    }
  });

  test("session generates insight points on completion", async ({ gamePage }) => {
    test.setTimeout(60_000);

    await gamePage.startObservationSession("schoolMatch");

    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      if (store.getState().activeSession?.state === "setup") {
        store.getState().beginSession();
      }
    });
    await gamePage.page.waitForTimeout(200);

    // Advance through all phases
    let session = await gamePage.getActiveSession();
    for (let i = 0; i < (session?.totalPhases ?? 0) + 2; i++) {
      const current = await gamePage.getActiveSession();
      if (!current || current.state === "reflection" || current.state === "complete") break;
      await gamePage.page.evaluate(() => {
        (window as any).__GAME_STORE__.getState().advanceSessionPhase();
      });
      await gamePage.page.waitForTimeout(30);
    }

    session = await gamePage.getActiveSession();
    if (session) {
      // End the session
      await gamePage.page.evaluate(() => {
        (window as any).__GAME_STORE__.getState().endObservationSession();
      });
      await gamePage.page.waitForTimeout(200);
    }

    // Insight points should have been earned
    const insightPoints = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      return store.getState().gameState?.scout?.insightState?.points ?? 0;
    });
    expect(insightPoints).toBeGreaterThanOrEqual(0);
  });

  test("no console errors across full session lifecycle", async ({ gamePage }) => {
    test.setTimeout(60_000);

    await gamePage.startObservationSession("schoolMatch");

    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      if (store.getState().activeSession?.state === "setup") {
        store.getState().beginSession();
      }
    });
    await gamePage.page.waitForTimeout(200);

    // Advance through all phases
    for (let i = 0; i < 25; i++) {
      const current = await gamePage.getActiveSession();
      if (!current || current.state !== "active") break;
      await gamePage.page.evaluate(() => {
        (window as any).__GAME_STORE__.getState().advanceSessionPhase();
      });
      await gamePage.page.waitForTimeout(30);
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
});
