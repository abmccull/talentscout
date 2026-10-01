import { test, expect } from "../fixtures";

// Integrate at e2e/regression/observation-pitch-hit-targets.spec.ts before the
// presentation correction. No mock, forced tap, new bridge, or fabricated player.
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
      const field = page.getByRole("group", { name: /^Interactive observation pitch at / });
      const markers = field.locator("button[data-observation-pitch-marker]");
      const roster = page.locator('ul[aria-label="Synchronized list of players on the observation pitch"] button');
      await expect(markers).toHaveCount(pool.length);
      await expect(roster).toHaveCount(pool.length);

      const readGeometry = () => field.evaluate(fieldElement => {
        const bounds = fieldElement.getBoundingClientRect();
        const markers = [...fieldElement.querySelectorAll<HTMLButtonElement>("button[data-observation-pitch-marker]")];
        return { width: bounds.width, height: bounds.height, targets: markers.map(marker => {
          const rect = marker.getBoundingClientRect();
          const caption = marker.querySelector<HTMLElement>("[data-observation-pitch-caption]")?.getBoundingClientRect();
          return { name: marker.getAttribute("aria-label"), x: rect.x - bounds.x, y: rect.y - bounds.y,
            width: rect.width, height: rect.height, caption: caption ? { x: caption.x - bounds.x,
              y: caption.y - bounds.y, width: caption.width, height: caption.height } : null };
        }) };
      });
      const violations = (geometry: Awaited<ReturnType<typeof readGeometry>>) => {
        const problems: string[] = [];
        for (let index = 0; index < geometry.targets.length; index++) {
          const target = geometry.targets[index];
          if (target.width < 44 || target.height < 44) problems.push(`small:${index}`);
          // Four pixels reserve the entire selected ring, not just its body.
          if (target.x < 4 - 0.5 || target.y < 4 - 0.5
            || target.x + target.width + 4 > geometry.width + 0.5
            || target.y + target.height + 4 > geometry.height + 0.5) problems.push(`clipped:${index}`);
          for (let otherIndex = index + 1; otherIndex < geometry.targets.length; otherIndex++) {
            const other = geometry.targets[otherIndex];
            const overlapX = Math.min(target.x + target.width + 4, other.x + other.width + 4)
              - Math.max(target.x - 4, other.x - 4);
            const overlapY = Math.min(target.y + target.height + 4, other.y + other.height + 4)
              - Math.max(target.y - 4, other.y - 4);
            if (overlapX > 0.5 && overlapY > 0.5) problems.push(`ring-overlap:${index}:${otherIndex}`);
          }
          const caption = target.caption;
          if (!caption) { problems.push(`missing-caption:${index}`); continue; }
          if (caption.x < -0.5 || caption.y < -0.5
            || caption.x + caption.width > geometry.width + 0.5
            || caption.y + caption.height > geometry.height + 0.5) problems.push(`caption-clipped:${index}`);
          for (let otherIndex = 0; otherIndex < geometry.targets.length; otherIndex++) {
            if (otherIndex === index) continue;
            const other = geometry.targets[otherIndex];
            const overlapX = Math.min(caption.x + caption.width, other.x + other.width + 4)
              - Math.max(caption.x, other.x - 4);
            const overlapY = Math.min(caption.y + caption.height, other.y + other.height + 4)
              - Math.max(caption.y, other.y - 4);
            if (overlapX > 0.5 && overlapY > 0.5) problems.push(`caption-over-target:${index}:${otherIndex}`);
            const otherCaption = other.caption;
            if (otherIndex > index && otherCaption) {
              const captionOverlapX = Math.min(caption.x + caption.width, otherCaption.x + otherCaption.width)
                - Math.max(caption.x, otherCaption.x);
              const captionOverlapY = Math.min(caption.y + caption.height, otherCaption.y + otherCaption.height)
                - Math.max(caption.y, otherCaption.y);
              if (captionOverlapX > 0.5 && captionOverlapY > 0.5) problems.push(`caption-overlap:${index}:${otherIndex}`);
            }
          }
        }
        return problems;
      };
      // Fail the original occlusion promptly, before the known tap timeout.
      await expect.poll(async () => violations(await readGeometry()), { timeout: 5_000 }).toEqual([]);
      const before = await page.evaluate(() => {
        const session = (window as any).__GAME_STORE__.getState().activeSession;
        return { id: session.id, phase: session.currentPhaseIndex, moments: session.phases.map((phase: any) => phase.moments),
          roles: session.players.map((player: any) => ({ id: player.playerId, position: player.position })),
          available: session.focusTokens.available, total: session.focusTokens.total };
      });
      for (let index = 0; index < pool.length; index++) {
        await markers.nth(index).tap();
        await expect(markers.nth(index)).toHaveAttribute("aria-pressed", "true");
        await expect(roster.nth(index)).toHaveAttribute("aria-pressed", "true");
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
      await page.getByRole("button", { name: /Focus targets and lenses/i }).click();
      await page.getByRole("button", { name: `Use technical lens for ${pool[0].name}`, exact: true }).click();
      await page.getByRole("button", { name: "Close focus controls", exact: true }).click();
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
      await testInfo.attach(`pitch-${width}-geometry.json`, { body: JSON.stringify({ pool, beforeFocus, afterFocus, before, afterTaps, focused }, null, 2),
        contentType: "application/json" });
      await page.screenshot({ path: testInfo.outputPath(`pitch-${width}.png`), fullPage: true });
    });
  }
});
