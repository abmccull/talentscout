import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "../fixtures";

test.describe("interactive observation pitch", () => {
  test.use({ hasTouch: true });

  test.beforeEach(async ({ gamePage }) => {
    await gamePage.page.setViewportSize({ width: 390, height: 844 });
    await gamePage.page.emulateMedia({ reducedMotion: "reduce" });
    await gamePage.goto();
    await gamePage.injectMidGameState("youth");
    await gamePage.startObservationSession("schoolMatch");
    await gamePage.page.getByRole("button", { name: /^Begin Observation$/ }).click();
    await expect(gamePage.page.getByTestId("observation-pitch")).toBeVisible();
  });

  test("mobile pitch and synchronized list allocate focus with keyboard parity", async ({ gamePage }) => {
    const page = gamePage.page;
    const sessionPlayerCount = await page.evaluate(() =>
      (window as any).__GAME_STORE__.getState().activeSession.players.length,
    );

    const pitchMarkers = page.locator(
      '[aria-label^="Interactive observation pitch at "] button[aria-label^="Track "]',
    );
    const synchronizedPlayers = page.locator(
      'ul[aria-label="Synchronized list of players on the observation pitch"] button',
    );
    await expect(
      page.getByRole("group", { name: /^Interactive observation pitch at / }),
    ).toBeVisible();
    await expect(pitchMarkers).toHaveCount(sessionPlayerCount);
    await expect(synchronizedPlayers).toHaveCount(sessionPlayerCount);
    await expect(page.locator(
      '[aria-label^="Interactive observation pitch at "] button[aria-label^="Track "][tabindex="0"]',
    )).toHaveCount(1);

    const firstPlayer = synchronizedPlayers.first();
    await firstPlayer.focus();
    await page.keyboard.press("Enter");

    const contextToggle = page.getByRole("button", {
      name: /Focus targets and lenses/i,
    });
    await expect(contextToggle).toHaveAttribute("aria-expanded", "true");
    const technicalLens = page.getByRole("button", {
      name: /^Use technical lens for /,
    }).first();
    await expect(technicalLens).toBeVisible();
    await expect(technicalLens).toBeFocused();
    await technicalLens.click();

    const focusedState = await page.evaluate(() => {
      const session = (window as any).__GAME_STORE__.getState().activeSession;
      const focused = session.players.filter((player: any) => player.isFocused);
      return {
        focusedCount: focused.length,
        playerName: focused[0]?.name,
        lens: focused[0]?.currentLens,
        available: session.focusTokens.available,
        total: session.focusTokens.total,
      };
    });
    expect(focusedState.focusedCount).toBe(1);
    expect(focusedState.lens).toBe("technical");
    expect(focusedState.available).toBe(focusedState.total - 1);
    await expect(
      page
        .getByRole("dialog", { name: "Choose your focus" })
        .getByLabel(
          `technical observation lens locked for ${focusedState.playerName}`,
        ),
    ).toBeVisible();
    const removeFocusBox = await page
      .getByRole("button", { name: `Remove focus from ${focusedState.playerName}` })
      .boundingBox();
    expect(removeFocusBox?.width).toBeGreaterThanOrEqual(44);
    expect(removeFocusBox?.height).toBeGreaterThanOrEqual(44);
    await expect(
      page.locator("#mobile-observation-context").getByRole("combobox"),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Close focus controls" }).click();
    await expect(page.getByRole("dialog", { name: "Choose your focus" })).toBeHidden();

    const layoutWidths = await page.evaluate(() => {
      const layout = document.querySelector<HTMLElement>(
        '[data-testid="active-observation-layout"]',
      );
      if (!layout) throw new Error("Active observation layout is unavailable");
      return {
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        layoutClient: layout.clientWidth,
        layoutScroll: layout.scrollWidth,
      };
    });
    expect(layoutWidths.document).toBeLessThanOrEqual(layoutWidths.viewport + 1);
    expect(layoutWidths.layoutScroll).toBeLessThanOrEqual(layoutWidths.layoutClient + 1);

    const controls = page.getByTestId("mobile-observation-controls");
    const controlsBox = await controls.boundingBox();
    expect(controlsBox).not.toBeNull();
    expect(controlsBox!.y + controlsBox!.height).toBeLessThanOrEqual(844 - 63);
    await expect(page.getByRole("button", { name: "Next phase" })).toBeVisible();

    const animations = await page
      .locator('[data-testid="observation-pitch"] .motion-safe\\:animate-pulse')
      .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).animationName));
    expect(animations.every((animationName) => animationName === "none")).toBe(true);

    const axe = await new AxeBuilder({ page }).analyze();
    expect(
      axe.violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical",
      ),
    ).toEqual([]);
    gamePage.expectNoConsoleErrors();
  });

  test("pitch markers are touch-selectable and expose the same focus sheet", async ({ gamePage }) => {
    const page = gamePage.page;
    const pitchMarker = page
      .locator('[data-testid="observation-pitch"] button[aria-label^="Track "]')
      .first();

    await pitchMarker.tap();
    await expect(pitchMarker).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: /Focus targets and lenses/i }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("dialog", { name: "Choose your focus" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Use technical lens for / }).first(),
    ).toBeFocused();

    gamePage.expectNoConsoleErrors();
  });

  test("tablet action controls align with the desktop sidebar breakpoint", async ({ gamePage }) => {
    const page = gamePage.page;

    for (const viewport of [
      { width: 768, height: 900 },
      { width: 1023, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      const controls = page.getByTestId("mobile-observation-controls");
      await expect(controls).toBeVisible();
      const box = await controls.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(239);
      expect(Math.abs(box!.y + box!.height - viewport.height)).toBeLessThanOrEqual(1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);

      const widths = await page.evaluate(() => ({
        client: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
    }

    gamePage.expectNoConsoleErrors();
  });
});

test.describe("observation choice and insight integrity", () => {
  test.use({ hasTouch: true });

  test.beforeEach(async ({ gamePage }) => {
    await gamePage.page.setViewportSize({ width: 390, height: 844 });
    await gamePage.goto();
    await gamePage.injectMidGameState("youth");
  });

  test("investigation consequence is store-backed, immutable, and restored after load", async ({ gamePage }) => {
    const page = gamePage.page;
    await gamePage.startObservationSession("followUpSession");
    await page.getByRole("button", { name: /^Begin Observation$/ }).click();

    const before = await page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const session = store.getState().activeSession;
      const phase = session.phases[session.currentPhaseIndex];
      const node = phase.dialogueNodes[0];
      const option = node.options.find((candidate: any) =>
        candidate.requiresRelationship === undefined
          || candidate.requiresRelationship <= (session.sourceRelationshipScore ?? 0),
      );
      if (!option) throw new Error("No unlocked dialogue option");
      return {
        nodeId: node.id,
        optionId: option.id,
        alternateId: node.options.find((candidate: any) => candidate.id !== option.id)?.id,
        contactId: session.sourceContactId,
        insight: session.insightPointsEarned,
        relationship: session.sourceContactId
          ? store.getState().gameState.contacts[session.sourceContactId].relationship
          : undefined,
      };
    });

    const selectedButton = page.getByTestId(`dialogue-option-${before.optionId}`);
    await selectedButton.click();
    await expect(selectedButton).toHaveAttribute("aria-pressed", "true");
    await expect(selectedButton).toBeDisabled();

    const selected = await page.evaluate(({ nodeId, optionId, alternateId }) => {
      const store = (window as any).__GAME_STORE__;
      store.getState().selectDialogueOption(nodeId, optionId);
      if (alternateId) store.getState().selectDialogueOption(nodeId, alternateId);
      const session = store.getState().activeSession;
      const phase = session.phases[session.currentPhaseIndex];
      const resolution = phase.dialogueChoiceResolutions[nodeId];
      const contact = resolution.sourceContactId
        ? store.getState().gameState.contacts[resolution.sourceContactId]
        : undefined;
      return {
        insight: session.insightPointsEarned,
        optionId: phase.selectedDialogueOptionIds[nodeId],
        relationship: contact?.relationship,
        relationshipDeltaApplied: resolution.relationshipDeltaApplied,
      };
    }, before);
    expect(selected.optionId).toBe(before.optionId);
    expect(selected.insight).toBeGreaterThanOrEqual(before.insight);
    if (before.relationship !== undefined) {
      expect(selected.relationship).toBe(before.relationship + selected.relationshipDeltaApplied);
    }

    await page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const serialized = JSON.parse(JSON.stringify(store.getState().gameState));
      store.getState().loadGame(serialized);
    });
    await expect(page.getByTestId(`dialogue-option-${before.optionId}`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId(`dialogue-option-${before.optionId}`)).toBeDisabled();
    const afterReload = await page.evaluate(({ nodeId, alternateId }) => {
      const store = (window as any).__GAME_STORE__;
      if (alternateId) store.getState().selectDialogueOption(nodeId, alternateId);
      const session = store.getState().activeSession;
      const phase = session.phases[session.currentPhaseIndex];
      return {
        insight: session.insightPointsEarned,
        optionId: phase.selectedDialogueOptionIds[nodeId],
      };
    }, before);
    expect(afterReload).toEqual({ insight: selected.insight, optionId: before.optionId });
    gamePage.expectNoConsoleErrors();
  });

  test("analysis selection remains locked across remount and serialized reload", async ({ gamePage }) => {
    const page = gamePage.page;
    await gamePage.startObservationSession("databaseQuery");
    await page.getByRole("button", { name: /^Begin Observation$/ }).click();

    const points = await page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const session = store.getState().activeSession;
      const phase = session.phases[session.currentPhaseIndex];
      return phase.dataPoints.map((point: any) => point.id);
    });
    await page.getByTestId(`analysis-data-point-${points[0]}`).click();
    const selectedInsight = await page.evaluate(() =>
      (window as any).__GAME_STORE__.getState().activeSession.insightPointsEarned,
    );

    await page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      store.setState({ currentScreen: "dashboard" });
    });
    await page.waitForTimeout(50);
    await page.evaluate(() =>
      (window as any).__GAME_STORE__.getState().setScreen("observation"),
    );
    await expect(page.getByTestId(`analysis-data-point-${points[0]}`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await page.evaluate(({ first, second }) => {
      const store = (window as any).__GAME_STORE__;
      store.getState().selectDataPoint(first);
      if (second) store.getState().selectDataPoint(second);
      const serialized = JSON.parse(JSON.stringify(store.getState().gameState));
      store.getState().loadGame(serialized);
      if (second) store.getState().selectDataPoint(second);
    }, { first: points[0], second: points[1] });
    await expect(page.getByTestId(`analysis-data-point-${points[0]}`)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator('[data-testid^="analysis-data-point-"]:not([disabled])')).toHaveCount(0);
    expect(await page.evaluate(() =>
      (window as any).__GAME_STORE__.getState().activeSession.insightPointsEarned,
    )).toBe(selectedInsight);
    gamePage.expectNoConsoleErrors();
  });

  test("insight dialog explains blocked actions and preserves keyboard context", async ({ gamePage }) => {
    const page = gamePage.page;
    await gamePage.startObservationSession("databaseQuery");
    await page.getByRole("button", { name: /^Begin Observation$/ }).click();
    await page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const gameState = store.getState().gameState;
      store.setState({
        gameState: {
          ...gameState,
          scout: {
            ...gameState.scout,
            insightState: {
              points: 4,
              capacity: 60,
              cooldownWeeksRemaining: 0,
              lifetimeUsed: 0,
              lifetimeEarned: 4,
              lastUsedWeek: 0,
              history: [],
            },
          },
        },
      });
    });

    const trigger = page
      .getByTestId("mobile-observation-controls")
      .getByRole("button", { name: "Use Insight action" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Insight Actions" });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole("button", { name: "Close insight panel" })).toBeFocused();
    const hiddenNature = page.getByTestId("insight-action-hiddenNature");
    await expect(hiddenNature).toBeDisabled();
    await expect(hiddenNature).toContainText("Not enough Insight Points. Need 25, have 4.");
    await page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: /^Close$/ })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Close insight panel" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const gameState = store.getState().gameState;
      store.setState({
        gameState: {
          ...gameState,
          scout: {
            ...gameState.scout,
            insightState: {
              ...gameState.scout.insightState,
              points: 50,
              cooldownWeeksRemaining: 2,
            },
          },
        },
      });
    });
    await trigger.click();
    await expect(page.getByTestId("insight-action-hiddenNature")).toContainText(
      "Insight is on cooldown for 2 more weeks.",
    );
    await expect(page.getByTestId("insight-action-hiddenNature")).toBeDisabled();
    await expect(dialog).toBeVisible();
    gamePage.expectNoConsoleErrors();
  });
});
