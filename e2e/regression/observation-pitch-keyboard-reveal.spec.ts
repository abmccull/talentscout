import { test, expect } from "../fixtures";
import { observationRail, expectUniquePlayerControls, readRailGeometry, readRailReveal } from "../helpers/observation-rail";

import { getVisualEvidenceProvenance } from "../helpers/releaseEvidencePath";

// Current single player-rail contract. No focus/scroll helper repairs the
// result: every navigation action below is a native key after a normal tap.
test.describe("observation pitch keyboard visibility", () => {
  test.use({ hasTouch: true });

  test("roving keys reveal the complete selected marker above fixed watch controls", async ({ gamePage, page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gamePage.goto();
    await gamePage.injectMidGameState("youth");
    const pool = await page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const players = Object.values(store.getState().gameState.players) as any[];
      const roles = [{ position: "GK", count: 6 }, { position: "CB", count: 2 },
        { position: "LW", count: 2 }, { position: "CAM", count: 2 }];
      const selected = roles.flatMap(({ position, count }) => {
        const matches = players.filter(player => player.position === position).slice(0, count);
        if (matches.length !== count) throw new Error(`Fixture lacks ${count} real ${position} players`);
        return matches;
      });
      const pool = selected.map(player => ({ playerId: player.id,
        name: `${player.firstName} ${player.lastName}`, position: player.position }));
      store.getState().startObservationSession("schoolMatch", pool, pool[0].playerId);
      return pool;
    });
    await page.getByRole("button", { name: "Begin Observation", exact: true }).click();
    const rail = observationRail(page);
    const markers = rail.locator("button[data-observation-pitch-marker]");
    const names = pool.map(player => player.name);
    await expectUniquePlayerControls(page, names);
    await expect(page.getByTestId("mobile-observation-controls")).toBeVisible();
    const readLayout = () => readRailGeometry(rail, names);
    const readDomain = () => page.evaluate(() => {
      const state = (window as any).__GAME_STORE__.getState();
      const session = state.activeSession;
      return { scoutId: state.gameState.scout.id, week: state.gameState.currentWeek,
        season: state.gameState.currentSeason, screen: state.currentScreen,
        sessionId: session.id, sessionState: session.state, phase: session.currentPhaseIndex,
        focusTokens: session.focusTokens, insight: session.insightPointsEarned,
        players: session.players.map((player: any) => ({ id: player.playerId, position: player.position,
          focused: player.isFocused, lens: player.currentLens ?? null })),
        flaggedMomentIds: session.flaggedMoments.map((flag: any) => flag.moment.id) };
    });
    const readReveal = (index: number) => readRailReveal(markers.nth(index), pool[index].name, true);

    const evidence: Array<{ key: string; reveal: Awaited<ReturnType<typeof readReveal>> }> = [];
    let finalDomain: Awaited<ReturnType<typeof readDomain>> | null = null;
    const initialDomain = await readDomain();
    const initialLayout = await readLayout();
    const requireRevealed = async (index: number, key: string) => {
      await expect(markers.nth(index)).toBeFocused();
      await expect(markers.nth(index)).toHaveAttribute("aria-pressed", "true");
      await expect(markers.nth(index)).toHaveAttribute("aria-label", new RegExp(`^Track ${pool[index].name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},`));
      await expect(rail.locator('button[aria-pressed="true"]')).toHaveCount(1);
      await expect(rail.locator('button[tabindex="0"]')).toHaveCount(1);
      await expect(page.getByRole("group", { name: `Observation lens for ${pool[index].name}`, exact: true })).toHaveCount(1);
      let observed = await readReveal(index);
      try {
        await expect.poll(async () => {
          observed = await readReveal(index);
          return observed.problems;
        }, { timeout: 3_000, message: `${key} must reveal the ring and caption for ${pool[index].name}` }).toEqual([]);
      } finally {
        evidence.push({ key, reveal: observed });
      }
      expect(observed.caption).toBe(pool[index].name);
    };

    try {
      // A real marker tap selects the first player. Native Tab leaves the
      // rail for its single inline lens control; Shift+Tab re-enters the selected player.
      await markers.first().tap();
      await expect(markers.first()).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(page.getByRole("button", { name: `Use technical lens for ${pool[0].name}`, exact: true })).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await requireRevealed(0, "Tab re-entry");

      await page.keyboard.press("End");
      await requireRevealed(pool.length - 1, "End");
      await page.keyboard.press("Home");
      await requireRevealed(0, "Home");
      // Traverse every real player across the horizontal rail. No locator action
      // scrolls each target into view or focuses it after the key press.
      for (let index = 1; index < pool.length; index++) {
        await page.keyboard.press("ArrowRight");
        await requireRevealed(index, `ArrowRight ${index}`);
      }
      await page.keyboard.press("ArrowDown");
      await requireRevealed(0, "ArrowDown wrap");
      await page.keyboard.press("ArrowLeft");
      await requireRevealed(pool.length - 1, "ArrowLeft wrap");
      await page.keyboard.press("ArrowUp");
      await requireRevealed(pool.length - 2, "ArrowUp");
      finalDomain = await readDomain();
      expect(finalDomain).toEqual(initialDomain);
      expect(await readLayout()).toEqual(initialLayout);
      gamePage.expectNoConsoleErrors();
      await page.screenshot({ path: testInfo.outputPath("pitch-keyboard-revealed-320.png") });
    } finally {
      await testInfo.attach("pitch-keyboard-reveal.json", { body: JSON.stringify({
        provenance: getVisualEvidenceProvenance(), viewport: { width: 320, height: 568 }, pool,
        evidence, initialLayout, initialDomain, finalDomain,
        consoleErrors: gamePage.getConsoleErrors(),
      }, null, 2), contentType: "application/json" });
    }
  });
});
