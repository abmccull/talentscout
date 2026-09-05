import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
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

  test("single portrait strip and inline lenses allocate and release focus with keyboard parity", async ({ gamePage }) => {
    const page = gamePage.page;
    const sessionPlayerCount = await page.evaluate(() =>
      (window as any).__GAME_STORE__.getState().activeSession.players.length,
    );
    const players = page.getByRole("list", { name: "Players on the observation pitch" }).getByRole("button", { name: /^Track / });
    await expect(page.getByRole("group", { name: "Players in view", exact: true })).toBeVisible();
    await expect(players).toHaveCount(sessionPlayerCount);
    // One control per subject, with no duplicate floating pitch subjects.
    await expect(page.locator('[data-testid="observation-pitch"] button[aria-label^="Track "]')).toHaveCount(sessionPlayerCount);
    await expect(page.locator('[aria-label^="Observation pitch at "] button')).toHaveCount(0);
    await expect(page.locator('[data-observation-pitch-marker][tabindex="0"]')).toHaveCount(1);

    const firstPlayer = players.first();
    await firstPlayer.focus();
    if (sessionPlayerCount > 1) {
      await page.keyboard.press("ArrowRight");
      await expect(players.nth(1)).toBeFocused();
      await expect(players.nth(1)).toHaveAttribute("aria-pressed", "true");
      await page.keyboard.press("Home");
      await expect(firstPlayer).toBeFocused();
    }
    await page.keyboard.press("Enter");
    await expect(firstPlayer).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Tab");
    const technicalLens = page.getByRole("button", { name: /^Use technical lens for / }).first();
    await expect(technicalLens).toBeFocused();
    // Inline controls retain Escape ownership and do not create a modal.
    await page.keyboard.press("Escape");
    await expect(technicalLens).toBeFocused();
    await expect(page.getByRole("dialog", { name: "Choose your focus" })).toHaveCount(0);
    const lensBox = await technicalLens.boundingBox();
    expect(lensBox?.width).toBeGreaterThanOrEqual(44);
    expect(lensBox?.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Enter");

    const readFocus = () => page.evaluate(() => {
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
    const focusedState = await readFocus();
    expect(focusedState.focusedCount).toBe(1);
    expect(focusedState.lens).toBe("technical");
    expect(focusedState.available).toBe(focusedState.total - 1);
    const panel = page.locator('[data-tutorial-id="observation-focus-panel"]');
    await expect(panel).toContainText("Technical focus");
    await expect(firstPlayer).toHaveAttribute("aria-label", /focus active/);
    const removeFocus = page.getByRole("button", { name: `Remove focus from ${focusedState.playerName}` });
    await expect(removeFocus).toBeFocused();
    const removeFocusBox = await removeFocus.boundingBox();
    expect(removeFocusBox?.width).toBeGreaterThanOrEqual(44);
    expect(removeFocusBox?.height).toBeGreaterThanOrEqual(44);
    await expect(panel.getByRole("combobox")).toHaveCount(0);
    await page.keyboard.press("Enter");
    // Release deliberately does not refund an attention token in this half.
    await expect.poll(readFocus).toMatchObject({ focusedCount: 0, available: focusedState.available });
    if (focusedState.available > 0) {
      await expect(technicalLens).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(removeFocus).toBeFocused();
      await expect.poll(readFocus).toMatchObject({ focusedCount: 1, lens: "technical", available: focusedState.total - 2 });
    } else {
      await expect(page.getByRole("heading", { name: "Your attention", exact: true })).toBeFocused();
      await expect(panel).toContainText("No focus remaining this half");
    }

    const layoutWidths = await page.evaluate(() => {
      const layout = document.querySelector<HTMLElement>('[data-testid="active-observation-layout"]');
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
    expect(controlsBox!.y + controlsBox!.height).toBeLessThanOrEqual(844 + 1);
    await expect(controls.getByRole("button", { name: "Next phase", exact: true })).toBeVisible();

    const motion = await page.locator('[data-testid="observation-pitch"] [class*="motion-reduce:transition-none"]')
      .evaluateAll((nodes) => nodes.map((node) => ({
        animation: getComputedStyle(node).animationName,
        transition: getComputedStyle(node).transitionDuration,
        transitionProperty: getComputedStyle(node).transitionProperty,
      })));
    expect(motion.length).toBeGreaterThan(0);
    // The global reduced-motion duration must not mask transition-property:none.
    expect(motion.every((style) => style.animation === "none" && (style.transitionProperty === "none" || style.transition.split(",").every((duration) => parseFloat(duration) === 0)))).toBe(true);
    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical")).toEqual([]);
    gamePage.expectNoConsoleErrors();
  });

  test("portrait subjects are touch-selectable and update inline focus controls", async ({ gamePage }) => {
    const page = gamePage.page;
    const players = page.getByRole("list", { name: "Players on the observation pitch" }).getByRole("button", { name: /^Track / });
    const portrait = players.nth((await players.count()) > 1 ? 1 : 0);
    await portrait.tap();
    await expect(portrait).toHaveAttribute("aria-pressed", "true");
    const selectedName = (await portrait.getAttribute('aria-label'))?.match(/^Track (.+?), /)?.[1];
    expect(selectedName).toBeTruthy();
    const lens = page.getByRole("button", { name: /^Use technical lens for / });
    await expect(lens).toBeVisible();
    await expect(lens).toHaveAttribute("aria-label", `Use technical lens for ${selectedName}`);
    await lens.tap();
    await expect(page.getByRole("button", { name: /^Remove focus from / })).toBeVisible();
    await expect(portrait).toHaveAttribute("aria-label", /focus active/);
    await expect(page.getByRole("dialog", { name: "Choose your focus" })).toHaveCount(0);
    gamePage.expectNoConsoleErrors();
  });
  test("tablet action controls sit on the watch floor without overflowing", async ({ gamePage }) => {
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
      expect(box!.x).toBeGreaterThanOrEqual(0);
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

test.describe("normal-motion mobile workspace anchoring", () => {
  test.use({ hasTouch: true, reducedMotion: "no-preference" });

  test.beforeEach(async ({ gamePage }) => {
    const page = gamePage.page;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await gamePage.goto();
    // Synthetic mid-career boundary only; preferences, navigation, scrolling
    // and observation progression below use the actual rendered controls.
    await gamePage.injectMidGameState("youth");
    await page.getByRole("button", { name: "Open navigation menu", exact: true }).click();
    await gamePage.navigateTo("settings");
    await page.getByRole("tab", { name: "Accessibility", exact: true }).click();
    const reduceMotion = page.getByRole("switch", { name: "Toggle reduced motion", exact: true });
    // Persist false through the real setting action, even when false is the default.
    if (await reduceMotion.getAttribute("aria-checked") === "false") await reduceMotion.click();
    await expect(reduceMotion).toHaveAttribute("aria-checked", "true");
    await reduceMotion.click();
    await expect(reduceMotion).toHaveAttribute("aria-checked", "false");
    await expect(page.locator("html")).not.toHaveClass(/\breduced-motion\b/);
    expect(await page.evaluate(() => ({
      osReducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      gameReducedMotion: JSON.parse(localStorage.getItem("talentscout_settings") ?? "{}").reducedMotion,
    }))).toEqual({ osReducedMotion: false, gameReducedMotion: false });
  });

  async function settleScreen(screen: Locator) {
    await expect(screen).toBeVisible();
    await expect.poll(() => screen.evaluate((element) =>
      element.getAnimations().every((animation) => animation.playState === "finished"),
    )).toBe(true);
    const style = await screen.evaluate((element) => ({
      transform: getComputedStyle(element).transform,
      animationName: getComputedStyle(element).animationName,
      durationSeconds: parseFloat(getComputedStyle(element).animationDuration),
    }));
    // Do not let an inherited reduced-motion configuration hide this regression.
    expect(style.animationName).not.toBe("none");
    expect(style.durationSeconds).toBeGreaterThan(0.001);
    return style;
  }

  async function bounds(control: Locator) {
    return control.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
    });
  }

  function expectViewportAnchor(box: Awaited<ReturnType<typeof bounds>>, edge: "top" | "bottom") {
    expect.soft(box.x).toBeGreaterThanOrEqual(0);
    expect.soft(box.right).toBeLessThanOrEqual(391);
    expect.soft(box.y).toBeGreaterThanOrEqual(0);
    expect.soft(box.bottom).toBeLessThanOrEqual(845);
    expect.soft(Math.abs(edge === "top" ? box.y : box.bottom - 844)).toBeLessThanOrEqual(1);
  }

  async function scrollContent(page: Page, screen: Locator) {
    const beforeTop = await screen.evaluate((element) => element.getBoundingClientRect().top);
    await page.mouse.move(195, 360);
    await page.mouse.wheel(0, 600);
    // A real content move is required; a no-op scroll cannot establish anchoring.
    await expect.poll(() => screen.evaluate((element) => element.getBoundingClientRect().top))
      .toBeLessThan(beforeTop - 100);
    return { beforeTop, afterTop: await screen.evaluate((element) => element.getBoundingClientRect().top) };
  }

  test("normal motion keeps the Watch phase bar on screen before and after scrolling", async ({ gamePage }, testInfo) => {
    const page = gamePage.page;
    await gamePage.startObservationSession("schoolMatch");
    await page.getByRole("button", { name: /^Begin Observation$/ }).click();
    const screen = page.locator('[data-game-screen="observation"]');
    const style = await settleScreen(screen);
    const controls = page.getByTestId("mobile-observation-controls");
    const header = page.getByRole("banner");
    const nextPhase = controls.getByRole("button", { name: "Next phase", exact: true });
    await expect(nextPhase).toBeEnabled();
    const before = { controls: await bounds(controls), header: await bounds(header) };
    await testInfo.attach("watch-before-scroll", { body: await page.screenshot(), contentType: "image/png" });
    const scrolling = await scrollContent(page, screen);
    const after = { controls: await bounds(controls), header: await bounds(header) };
    await testInfo.attach("watch-after-scroll", { body: await page.screenshot(), contentType: "image/png" });
    await testInfo.attach("normal-motion-watch-geometry", {
      body: JSON.stringify({ syntheticMidCareerBoundary: true, style, scrolling, before, after }, null, 2),
      contentType: "application/json",
    });
    for (const frame of [before, after]) {
      expectViewportAnchor(frame.controls, "bottom");
      expectViewportAnchor(frame.header, "top");
    }
    expect.soft(Math.abs(after.controls.y - before.controls.y)).toBeLessThanOrEqual(1);
    // Even translateY(0) retains a containing block with animation-fill-mode:both.
    expect.soft(style.transform).toBe("none");
    const phaseBefore = (await gamePage.getActiveSession())!.currentPhaseIndex;
    await nextPhase.tap();
    await expect.poll(async () => (await gamePage.getActiveSession())!.currentPhaseIndex).toBe(phaseBefore + 1);
    gamePage.expectNoConsoleErrors();
  });

  test("normal motion keeps mobile workspace header and navigation anchored while content scrolls", async ({ gamePage }, testInfo) => {
    const page = gamePage.page;
    await gamePage.navigateTo("calendar");
    const screen = page.locator('[data-game-screen="calendar"]');
    const style = await settleScreen(screen);
    const header = page.getByRole("banner");
    const navigation = page.getByRole("navigation", { name: "Youth Scout workspace", exact: true });
    const before = { header: await bounds(header), navigation: await bounds(navigation) };
    const scrolling = await scrollContent(page, screen);
    const after = { header: await bounds(header), navigation: await bounds(navigation) };
    await testInfo.attach("workspace-after-scroll", { body: await page.screenshot(), contentType: "image/png" });
    await testInfo.attach("normal-motion-workspace-geometry", {
      body: JSON.stringify({ syntheticMidCareerBoundary: true, style, scrolling, before, after }, null, 2),
      contentType: "application/json",
    });
    for (const frame of [before, after]) {
      expectViewportAnchor(frame.header, "top");
      expectViewportAnchor(frame.navigation, "bottom");
    }
    expect.soft(style.transform).toBe("none");
    await navigation.getByRole("button", { name: "Desk", exact: true }).tap();
    await gamePage.waitForScreen("dashboard");
    await expect(page.getByRole("heading", { name: "The scouting desk", exact: true })).toBeVisible();
    gamePage.expectNoConsoleErrors();
  });
});
