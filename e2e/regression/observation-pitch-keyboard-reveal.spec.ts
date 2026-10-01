import { test, expect } from "../fixtures";
import { getVisualEvidenceProvenance } from "../helpers/releaseEvidencePath";

// Integrate separately at e2e/regression/observation-pitch-keyboard-reveal.spec.ts.
// Existing geometry tests remain unchanged. No focus/scroll helper repairs the
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
    const field = page.getByRole("group", { name: /^Interactive observation pitch at / });
    const markers = field.locator("button[data-observation-pitch-marker]");
    const roster = page.locator('ul[aria-label="Synchronized list of players on the observation pitch"] button');
    const focusToggle = page.getByRole("button", { name: /Focus targets and lenses/i });
    await expect(markers).toHaveCount(pool.length);
    await expect(roster).toHaveCount(pool.length);
    await expect(page.getByTestId("mobile-observation-controls")).toBeVisible();

    const readLayout = () => field.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height,
        targets: [...element.querySelectorAll<HTMLButtonElement>("button[data-observation-pitch-marker]")].map(marker => {
          const rect = marker.getBoundingClientRect();
          const caption = marker.querySelector<HTMLElement>("[data-observation-pitch-caption]")?.getBoundingClientRect();
          const round = (value: number) => Number(value.toFixed(2));
          return { x: round(rect.x - bounds.x), y: round(rect.y - bounds.y), width: rect.width, height: rect.height,
            caption: caption ? { x: round(caption.x - bounds.x), y: round(caption.y - bounds.y),
              width: caption.width, height: caption.height } : null };
        }) };
    });
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
    const readReveal = (index: number) => page.evaluate(index => {
      const field = document.querySelector<HTMLElement>('[role="group"][aria-label^="Interactive observation pitch at "]');
      const marker = field?.querySelectorAll<HTMLButtonElement>("button[data-observation-pitch-marker]")[index];
      const caption = marker?.querySelector<HTMLElement>("[data-observation-pitch-caption]");
      const controls = document.querySelector<HTMLElement>('[data-testid="mobile-observation-controls"]');
      const header = document.querySelector<HTMLElement>("header");
      if (!marker || !caption || !controls || !header) throw new Error("Required watch visibility region is missing");
      const rect = marker.getBoundingClientRect();
      const name = caption.getBoundingClientRect();
      const footer = controls.getBoundingClientRect();
      const banner = header.getBoundingClientRect();
      const top = Math.min(rect.top - 4, name.top);
      const bottom = Math.max(rect.bottom + 4, name.bottom);
      const left = Math.min(rect.left - 4, name.left);
      const right = Math.max(rect.right + 4, name.right);
      const visibleTop = Math.max(0, banner.bottom);
      const visibleBottom = Math.min(window.innerHeight, footer.top);
      const centerHit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      const problems: string[] = [];
      if (document.activeElement !== marker) problems.push("keyboard-focus-is-elsewhere");
      if (top < visibleTop + 4 - 0.5) problems.push("ring-or-caption-hidden-under-header");
      if (bottom > visibleBottom - 4 + 0.5) problems.push("ring-or-caption-hidden-under-footer");
      if (left < 4 - 0.5 || right > window.innerWidth - 4 + 0.5) problems.push("ring-or-caption-outside-viewport-width");
      if (!centerHit || !marker.contains(centerHit)) problems.push("focused-target-center-is-occluded");
      return { index, ariaLabel: marker.getAttribute("aria-label"), caption: caption.textContent?.trim(),
        pressed: marker.getAttribute("aria-pressed"), top, bottom, left, right, visibleTop, visibleBottom,
        body: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        scrollY: window.scrollY, centerHit: centerHit?.tagName ?? null, problems };
    }, index);

    const evidence: Array<{ key: string; reveal: Awaited<ReturnType<typeof readReveal>> }> = [];
    let finalDomain: Awaited<ReturnType<typeof readDomain>> | null = null;
    const initialDomain = await readDomain();
    const initialLayout = await readLayout();
    const requireRevealed = async (index: number, key: string) => {
      await expect(markers.nth(index)).toBeFocused();
      await expect(markers.nth(index)).toHaveAttribute("aria-pressed", "true");
      await expect(markers.nth(index)).toHaveAttribute("aria-label", new RegExp(`^Track ${pool[index].name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},`));
      await expect(roster.nth(index)).toHaveAttribute("aria-pressed", "true");
      await expect(focusToggle).toContainText(`${pool[index].name} selected`);
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
      // roving group for the roster; Shift+Tab must re-enter its selected marker.
      await markers.first().tap();
      await expect(markers.first()).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(roster.first()).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await requireRevealed(0, "Tab re-entry");

      await page.keyboard.press("End");
      await requireRevealed(pool.length - 1, "End");
      await page.keyboard.press("Home");
      await requireRevealed(0, "Home");
      // Traverse every real player, including lower rows. No locator action
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
