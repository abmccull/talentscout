import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";
import type { GamePage } from "../fixtures";

async function beginQuickInteraction(gamePage: GamePage) {
  await gamePage.startObservationSession("statsBriefing");
  const begin = gamePage.page.getByRole("button", { name: /^Begin Observation$/ });
  await begin.click();
  await expect(gamePage.page.getByRole("group", { name: "Strategic choices" })).toBeVisible();
}

async function expectNoBlockingAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations
    .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target.join(" ")),
    }));
  expect(blocking).toEqual([]);
}

test.describe("Quick Interaction integrity", () => {
  test.beforeEach(async ({ gamePage }) => {
    await gamePage.page.setViewportSize({ width: 1440, height: 900 });
    await gamePage.goto();
    await gamePage.injectMidGameState("youth");
  });

  test("a real choice locks once, gates advancement, and determines the follow-up", async ({ gamePage }) => {
    await beginQuickInteraction(gamePage);

    const nextPhase = gamePage.page.getByRole("button", { name: /^Next Phase$/ });
    await expect(gamePage.page.getByText("A choice is required before the session can advance.")).toBeVisible();
    await expect(gamePage.page.getByTestId("strategic-choice-impact")).toHaveCount(3);

    await nextPhase.click();
    expect((await gamePage.getActiveSession())?.currentPhaseIndex).toBe(0);

    const marketChoice = gamePage.page.getByRole("button", {
      name: /^Scan for emerging market trends/,
    });
    await expect(marketChoice).toContainText("+3 insight");
    await expect(marketChoice).toContainText("+1 fatigue");
    await expect(marketChoice).toContainText("+2 session quality");

    const before = await gamePage.page.evaluate(() => {
      const session = (window as any).__GAME_STORE__.getState().activeSession;
      return {
        phase: session.currentPhaseIndex,
        choiceIds: session.phases[0].choices.map((choice: any) => choice.id),
        insight: session.insightPointsEarned,
      };
    });

    await marketChoice.click();
    await expect(marketChoice).toBeDisabled();
    await expect(marketChoice).toHaveAttribute("aria-pressed", "true");
    await expect(gamePage.page.getByText(/Scan for emerging market trends locked/)).toBeVisible();

    const locked = await gamePage.page.evaluate(() => {
      const session = (window as any).__GAME_STORE__.getState().activeSession;
      const phase = session.phases[0];
      return {
        selectedChoiceId: phase.selectedChoiceId,
        resolution: phase.choiceResolution,
        insight: session.insightPointsEarned,
        followUpChoices: session.phases[1].choices.map((choice: any) => choice.text),
      };
    });
    expect(locked.selectedChoiceId).toBe(before.choiceIds[1]);
    expect(locked.resolution).toMatchObject({
      choiceId: before.choiceIds[1],
      outcomeType: "technique",
      insightPointsAwarded: 3,
      fatigueDelta: 1,
      qualityModifier: 2,
    });
    expect(locked.insight).toBe(before.insight + 3);

    const replayed = await gamePage.page.evaluate(
      ({ selectedId, alternateId }) => {
        const store = (window as any).__GAME_STORE__;
        store.getState().selectStrategicChoice(selectedId);
        store.getState().selectStrategicChoice(alternateId);
        const session = store.getState().activeSession;
        return {
          selectedChoiceId: session.phases[0].selectedChoiceId,
          insight: session.insightPointsEarned,
          followUpChoices: session.phases[1].choices.map((choice: any) => choice.text),
        };
      },
      { selectedId: before.choiceIds[1], alternateId: before.choiceIds[0] },
    );
    expect(replayed.selectedChoiceId).toBe(locked.selectedChoiceId);
    expect(replayed.insight).toBe(locked.insight);
    expect(replayed.followUpChoices).toEqual(locked.followUpChoices);

    await nextPhase.click();
    expect((await gamePage.getActiveSession())?.currentPhaseIndex).toBe(1);
    await expect(gamePage.page.getByText(/identified a pattern in the wider data/i)).toBeVisible();
    await nextPhase.click();
    expect((await gamePage.getActiveSession())?.currentPhaseIndex).toBe(1);
    await expectNoBlockingAxeViolations(gamePage.page);
    gamePage.expectNoConsoleErrors();
  });

  test("abort and save-load never bank staged rewards; completion banks once", async ({ gamePage }) => {
    const baseline = await gamePage.page.evaluate(() => {
      const scout = (window as any).__GAME_STORE__.getState().gameState.scout;
      return {
        fatigue: scout.fatigue,
        lifetimeEarned: scout.insightState?.lifetimeEarned ?? 0,
        completions: (window as any).__GAME_STORE__.getState().gameState.completedInteractiveSessions.length,
        journalEntries: Object.keys((window as any).__GAME_STORE__.getState().gameState.reflectionJournal ?? {}).length,
        gutFeelings: ((window as any).__GAME_STORE__.getState().gameState.gutFeelings ?? []).length,
      };
    });

    await beginQuickInteraction(gamePage);
    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const session = store.getState().activeSession;
      store.getState().selectStrategicChoice(session.phases[0].choices[0].id);
      const saved = store.getState().saveGame();
      if (!saved) throw new Error("Expected a save snapshot");
      store.getState().loadGame(saved);
    });

    const afterReload = await gamePage.page.evaluate(() => {
      const state = (window as any).__GAME_STORE__.getState();
      return {
        activeSession: state.activeSession,
        fatigue: state.gameState.scout.fatigue,
        lifetimeEarned: state.gameState.scout.insightState?.lifetimeEarned ?? 0,
        completions: state.gameState.completedInteractiveSessions.length,
        journalEntries: Object.keys(state.gameState.reflectionJournal ?? {}).length,
        gutFeelings: (state.gameState.gutFeelings ?? []).length,
      };
    });
    expect(afterReload.activeSession).toMatchObject({
      mode: "quickInteraction",
      state: "active",
      currentPhaseIndex: 0,
    });
    expect(afterReload.activeSession.phases[0].selectedChoiceId).toBeTruthy();
    expect(afterReload).toMatchObject(baseline);

    const afterRestoredAbort = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      store.getState().endObservationSession();
      const state = store.getState();
      return {
        activeSession: state.activeSession,
        fatigue: state.gameState.scout.fatigue,
        lifetimeEarned: state.gameState.scout.insightState?.lifetimeEarned ?? 0,
        completions: state.gameState.completedInteractiveSessions.length,
        journalEntries: Object.keys(state.gameState.reflectionJournal ?? {}).length,
        gutFeelings: (state.gameState.gutFeelings ?? []).length,
      };
    });
    expect(afterRestoredAbort.activeSession).toBeNull();
    expect(afterRestoredAbort).toMatchObject(baseline);

    await gamePage.startObservationSession("statsBriefing");
    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      store.getState().beginSession();
      const session = store.getState().activeSession;
      store.getState().selectStrategicChoice(session.phases[0].choices[0].id);
      store.getState().endObservationSession();
    });

    const afterAbort = await gamePage.page.evaluate(() => {
      const state = (window as any).__GAME_STORE__.getState();
      return {
        activeSession: state.activeSession,
        fatigue: state.gameState.scout.fatigue,
        lifetimeEarned: state.gameState.scout.insightState?.lifetimeEarned ?? 0,
        completions: state.gameState.completedInteractiveSessions.length,
        journalEntries: Object.keys(state.gameState.reflectionJournal ?? {}).length,
        gutFeelings: (state.gameState.gutFeelings ?? []).length,
      };
    });
    expect(afterAbort.activeSession).toBeNull();
    expect(afterAbort).toMatchObject(baseline);

    await gamePage.startObservationSession("statsBriefing");
    const completed = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      store.getState().beginSession();
      for (let guard = 0; guard < 5; guard++) {
        const session = store.getState().activeSession;
        if (!session || session.state !== "active") break;
        const phase = session.phases[session.currentPhaseIndex];
        store.getState().selectStrategicChoice(phase.choices[0].id);
        store.getState().advanceSessionPhase();
      }
      const session = store.getState().activeSession;
      if (session?.state !== "reflection") throw new Error("Expected reflection");
      const stagedInsight = session.insightPointsEarned;
      const reflectionInsight = store.getState().lastReflectionResult?.insightPointsFromReflection ?? 0;
      const stagedFatigue = session.phases.reduce(
        (sum: number, phase: any) => sum + (phase.choiceResolution?.fatigueDelta ?? 0),
        0,
      );
      store.getState().endObservationSession();
      const state = store.getState();
      return {
        stagedInsight,
        reflectionInsight,
        stagedFatigue,
        fatigue: state.gameState.scout.fatigue,
        lifetimeEarned: state.gameState.scout.insightState?.lifetimeEarned ?? 0,
        completions: state.gameState.completedInteractiveSessions.length,
      };
    });

    expect(completed.lifetimeEarned).toBe(
      baseline.lifetimeEarned + completed.stagedInsight + completed.reflectionInsight,
    );
    expect(completed.fatigue).toBe(Math.min(100, baseline.fatigue + completed.stagedFatigue));
    expect(completed.completions).toBe(baseline.completions + 1);

    await gamePage.startObservationSession("statsBriefing");
    expect(await gamePage.getActiveSession()).toBeNull();
    gamePage.expectNoConsoleErrors();
  });
});
