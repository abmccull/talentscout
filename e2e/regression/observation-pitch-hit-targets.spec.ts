import { test, expect } from "../fixtures";
import { observationRail, expectUniquePlayerControls, readRailGeometry, railGeometryProblems, readRailReveal } from "../helpers/observation-rail";


// Current player-rail contract: one control per real player, normal taps,
// complete captions and stable scroll-content geometry. No forced interaction.
test.describe("observation pitch touch targets", () => {
  test.use({ hasTouch: true });

  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 },
    { width: 768, height: 900 }, { width: 1023, height: 900 },
    { width: 1280, height: 900 }, { width: 1440, height: 900 }]) {
    const { width } = viewport;
    test(`all role markers and captions remain reachable at ${width}px`, async ({ gamePage, page }, testInfo) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await gamePage.goto();
      await gamePage.injectMidGameState("youth");
      const pool = await page.evaluate(() => {
        const store = (window as any).__GAME_STORE__;
        const players = Object.values(store.getState().gameState.players) as any[];
        // Real generated players exercise repeated roles and cross-role layout.
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
      const readGeometry = () => readRailGeometry(rail, names);
      const violations = railGeometryProblems;
      await expect.poll(async () => violations(await readGeometry()), { timeout: 5_000 }).toEqual([]);
      const reveals: unknown[] = [];
      const before = await page.evaluate(() => {
        const session = (window as any).__GAME_STORE__.getState().activeSession;
        return { id: session.id, phase: session.currentPhaseIndex, moments: session.phases.map((phase: any) => phase.moments),
          roles: session.players.map((player: any) => ({ id: player.playerId, position: player.position })),
          available: session.focusTokens.available, total: session.focusTokens.total };
      });
      for (let index = 0; index < pool.length; index++) {
        await markers.nth(index).tap();
        await expect(markers.nth(index)).toHaveAttribute("aria-pressed", "true");
        await expect(rail.locator('button[aria-pressed="true"]')).toHaveCount(1);
        await expect(page.getByRole("group", { name: `Observation lens for ${pool[index].name}`, exact: true })).toHaveCount(1);
        await expect.poll(async () => (await readRailReveal(markers.nth(index), pool[index].name)).problems).toEqual([]);
        reveals.push(await readRailReveal(markers.nth(index), pool[index].name));
      }
      const afterTaps = await page.evaluate(() => {
        const session = (window as any).__GAME_STORE__.getState().activeSession;
        return { id: session.id, phase: session.currentPhaseIndex, moments: session.phases.map((phase: any) => phase.moments),
          roles: session.players.map((player: any) => ({ id: player.playerId, position: player.position })),
          available: session.focusTokens.available, total: session.focusTokens.total };
      });
      expect(afterTaps).toEqual(before);
      await markers.first().tap();
      const beforeFocus = await readGeometry();
      await page.getByRole("button", { name: `Use technical lens for ${pool[0].name}`, exact: true }).click();
      await expect(page.getByRole("button", { name: `Remove focus from ${pool[0].name}`, exact: true })).toHaveCount(1);
      const afterFocus = await readGeometry();
      expect({ ...afterFocus, targets: afterFocus.targets.map(target => ({ ...target, name: null })) })
        .toEqual({ ...beforeFocus, targets: beforeFocus.targets.map(target => ({ ...target, name: null })) });
      expect(violations(afterFocus)).toEqual([]);
      const focused = await page.evaluate(() => {
        const session = (window as any).__GAME_STORE__.getState().activeSession;
        return { players: session.players.filter((player: any) => player.isFocused).map((player: any) => ({ id: player.playerId, lens: player.currentLens })),
          available: session.focusTokens.available };
      });
      expect(focused).toEqual({ players: [{ id: pool[0].playerId, lens: "technical" }], available: before.available - 1 });
      gamePage.expectNoConsoleErrors();
      await testInfo.attach(`pitch-${width}-geometry.json`, { body: JSON.stringify({ pool, beforeFocus, afterFocus, reveals, before, afterTaps, focused }, null, 2),
        contentType: "application/json" });
      await page.screenshot({ path: testInfo.outputPath(`pitch-${width}.png`), fullPage: true });
    });
  }
});
