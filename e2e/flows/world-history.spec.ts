import { test, expect } from "../fixtures";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

test.describe("World archive", () => {
  test("turns authoritative season history into an accessible, explorable story", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 4,
      currentSeason: 2,
      countries: ["england", "spain"],
      scout: { careerTier: 3, primarySpecialization: "youth" },
    });

    const names = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      const clubs = Object.values(state.clubs) as any[];
      const champion = clubs[0];
      const relegated = clubs[1] ?? clubs[0];
      const league = state.leagues[champion.leagueId];
      const player = Object.values(state.players)[0] as any;
      store.getState().loadGame({
        ...state,
        currentSeason: 2,
        worldHistory: {
          version: 1,
          latestRecordedSeason: 1,
          seasons: [{
            season: 1,
            recordedAfterTotalWeeks: 38,
            leagues: [{
              leagueId: league.id,
              country: league.country,
              tier: league.tier,
              clubCount: 2,
              playedFixtures: 38,
            }],
            clubs: [
              {
                clubId: champion.id,
                leagueId: league.id,
                standing: {
                  position: 1,
                  tableSize: 20,
                  played: 38,
                  won: 27,
                  drawn: 7,
                  lost: 4,
                  goalsFor: 74,
                  goalsAgainst: 31,
                  goalDifference: 43,
                  points: 88,
                },
                leagueMovement: "stayed",
                nextLeagueId: league.id,
                reputation: champion.reputation,
                budget: champion.budget,
                scoutingPhilosophy: champion.scoutingPhilosophy,
                manager: {
                  managerId: champion.managerId,
                  managerName: "Avery Morgan",
                  scoutingPreference: "balanced",
                  reportInfluence: 0.7,
                  preferredFormation: "4-3-3",
                },
              },
              {
                clubId: relegated.id,
                leagueId: league.id,
                standing: {
                  position: 20,
                  tableSize: 20,
                  played: 38,
                  won: 5,
                  drawn: 8,
                  lost: 25,
                  goalsFor: 28,
                  goalsAgainst: 69,
                  goalDifference: -41,
                  points: 23,
                },
                leagueMovement: "relegated",
                nextLeagueId: "historic-lower-division",
                reputation: relegated.reputation,
                budget: relegated.budget,
                scoutingPhilosophy: relegated.scoutingPhilosophy,
              },
            ],
            players: [{
              playerId: player.id,
              age: player.age,
              position: player.position,
              currentAbility: player.currentAbility,
              marketValue: player.marketValue,
              registeredClubId: champion.id,
              contractClubId: champion.id,
              status: "contracted",
              movementEventIds: [],
              performance: {
                appearances: 26,
                starts: 21,
                minutesPlayed: 1_934,
                appearancesWithoutMinutes: 0,
                averageRating: 7.4,
                goals: 8,
                assists: 11,
                cleanSheets: 0,
              },
            }],
          }],
        },
      });
      return {
        champion: champion.name,
        relegated: relegated.name,
        player: `${player.firstName} ${player.lastName}`,
      };
    });

    await gamePage.navigateTo("internationalView");
    const trigger = gamePage.page.getByRole("button", { name: /World Archive/ });
    await trigger.click();

    const archive = gamePage.page.getByRole("dialog", { name: "The seasons beyond your desk" });
    await expect(archive).toBeVisible();
    await expect(archive).toBeFocused();
    await expect(archive).toContainText("Season 1");
    await expect(archive).toContainText(names.champion);
    await expect(archive).toContainText(names.relegated);
    await expect(archive).toContainText(names.player);
    await expect(archive).toContainText("Avery Morgan");
    await expect(archive).not.toContainText(/current ability/i);
    const dismissAchievement = gamePage.page.getByRole("button", {
      name: "Dismiss achievement notification",
    });
    if (await dismissAchievement.isVisible({ timeout: 500 }).catch(() => false)) {
      await dismissAchievement.click();
    }

    const evidenceDirectory = path.resolve(
      process.cwd(),
      "design-audit-evidence",
      "world-history-2026-07-12",
    );
    await mkdir(evidenceDirectory, { recursive: true });
    await gamePage.page.screenshot({
      path: path.join(evidenceDirectory, "world-archive-desktop.png"),
      fullPage: true,
    });
    const desktopAxe = await new AxeBuilder({ page: gamePage.page })
      .include("#world-history-drawer")
      .analyze();
    expect(desktopAxe.violations.filter((violation) =>
      violation.impact === "serious" || violation.impact === "critical"
    )).toEqual([]);

    const close = archive.getByRole("button", { name: "Close world archive" });
    const box = await close.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);

    await gamePage.page.keyboard.press("Shift+Tab");
    await expect(archive.getByRole("button", { name: names.player })).toBeFocused();
    await gamePage.page.keyboard.press("Tab");
    await expect(close).toBeFocused();

    await gamePage.page.keyboard.press("Escape");
    await expect(archive).toBeHidden();
    await expect(trigger).toBeFocused();

    await gamePage.page.setViewportSize({ width: 390, height: 844 });
    await gamePage.page.waitForTimeout(300);
    await trigger.click();
    await expect(archive).toBeVisible();
    await expect(archive.getByLabel("Jump to archived season")).toHaveValue("1");
    const horizontalOverflow = await gamePage.page.evaluate(() =>
      document.documentElement.scrollWidth - window.innerWidth
    );
    expect(horizontalOverflow).toBeLessThanOrEqual(1);
    await gamePage.page.screenshot({
      path: path.join(evidenceDirectory, "world-archive-mobile.png"),
      fullPage: true,
    });
    const mobileAxe = await new AxeBuilder({ page: gamePage.page })
      .include("#world-history-drawer")
      .analyze();
    expect(mobileAxe.violations.filter((violation) =>
      violation.impact === "serious" || violation.impact === "critical"
    )).toEqual([]);
    await archive.getByRole("button", { name: names.player }).click();
    await gamePage.waitForScreen("playerProfile");
    gamePage.expectNoConsoleErrors();
  });
});
