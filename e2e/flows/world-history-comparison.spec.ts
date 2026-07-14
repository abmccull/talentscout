import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "../fixtures";
import AxeBuilder from "@axe-core/playwright";

const evidenceDir = path.join(
  process.cwd(),
  "design-audit-evidence",
  "release-2026-07-13",
);

test.describe("World archive comparisons", () => {
  test("compares player-safe multi-season player, club, and manager evidence", async ({ gamePage }) => {
    await mkdir(evidenceDir, { recursive: true });
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 4,
      currentSeason: 3,
      countries: ["england"],
      scout: { careerTier: 3, primarySpecialization: "youth" },
    });

    const names = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      const clubs = Object.values(state.clubs) as any[];
      const players = Object.values(state.players) as any[];
      const firstClub = clubs[0];
      const secondClub = clubs.find((club) => club.id !== firstClub.id);
      const firstPlayer = players[0];
      const secondPlayer = players.find((player) => player.id !== firstPlayer.id);
      if (!firstClub || !secondClub || !firstPlayer || !secondPlayer) {
        throw new Error("Comparison fixture requires two clubs and two players");
      }
      const league = state.leagues[firstClub.leagueId];
      const seasonRecord = (season: number) => ({
        season,
        recordedAfterTotalWeeks: season * 38,
        leagues: [{
          leagueId: league.id,
          country: league.country,
          tier: league.tier,
          clubCount: 2,
          playedFixtures: 38,
        }],
        clubs: [
          {
            clubId: firstClub.id,
            leagueId: league.id,
            standing: {
              position: season === 1 ? 3 : 1,
              tableSize: 20,
              played: 38,
              won: 20 + season,
              drawn: 8,
              lost: 10 - season,
              goalsFor: 60 + season,
              goalsAgainst: 38,
              goalDifference: 22 + season,
              points: 68 + season,
            },
            leagueMovement: "stayed",
            nextLeagueId: league.id,
            reputation: firstClub.reputation,
            budget: firstClub.budget,
            scoutingPhilosophy: firstClub.scoutingPhilosophy,
            manager: {
              managerId: "manager-avery",
              managerName: "Avery Morgan",
              scoutingPreference: "balanced",
              reportInfluence: 0.95,
              preferredFormation: "4-3-3",
            },
          },
          {
            clubId: secondClub.id,
            leagueId: league.id,
            standing: {
              position: 9 + season,
              tableSize: 20,
              played: 38,
              won: 11,
              drawn: 9,
              lost: 18,
              goalsFor: 42,
              goalsAgainst: 55,
              goalDifference: -13,
              points: 42,
            },
            leagueMovement: season === 2 ? "relegated" : "stayed",
            nextLeagueId: season === 2 ? "historic-lower" : league.id,
            reputation: secondClub.reputation,
            budget: secondClub.budget,
            scoutingPhilosophy: secondClub.scoutingPhilosophy,
            manager: {
              managerId: "manager-casey",
              managerName: "Casey Singh",
              scoutingPreference: "dataDriven",
              reportInfluence: 0.7,
              preferredFormation: "4-2-3-1",
            },
          },
        ],
        players: [
          {
            playerId: firstPlayer.id,
            firstName: firstPlayer.firstName,
            lastName: firstPlayer.lastName,
            nationality: firstPlayer.nationality,
            age: firstPlayer.age - (2 - season),
            position: firstPlayer.position,
            currentAbility: firstPlayer.currentAbility - (2 - season) * 5,
            marketValue: Math.max(1, firstPlayer.marketValue - (2 - season) * 50_000),
            registeredClubId: firstClub.id,
            contractClubId: firstClub.id,
            status: "contracted",
            movementEventIds: season === 1 ? ["move-first"] : [],
            performance: {
              appearances: 18 + season * 4,
              starts: 15 + season * 3,
              minutesPlayed: 1_400 + season * 250,
              appearancesWithoutMinutes: 0,
              averageRating: 6.8 + season * 0.2,
              goals: season * 3,
              assists: season * 4,
              cleanSheets: 0,
            },
          },
          {
            playerId: secondPlayer.id,
            firstName: secondPlayer.firstName,
            lastName: secondPlayer.lastName,
            nationality: secondPlayer.nationality,
            age: secondPlayer.age - (2 - season),
            position: secondPlayer.position,
            currentAbility: secondPlayer.currentAbility,
            marketValue: secondPlayer.marketValue,
            registeredClubId: secondClub.id,
            contractClubId: secondClub.id,
            status: "contracted",
            movementEventIds: [],
            performance: {
              appearances: 15 + season,
              starts: 10 + season,
              minutesPlayed: 900 + season * 100,
              appearancesWithoutMinutes: 0,
              averageRating: 6.6 + season * 0.1,
              goals: season,
              assists: season,
              cleanSheets: 0,
            },
          },
        ],
      });
      store.getState().loadGame({
        ...state,
        currentSeason: 3,
        worldHistory: {
          version: 1,
          latestRecordedSeason: 2,
          seasons: [seasonRecord(1), seasonRecord(2)],
        },
      });
      return {
        firstPlayer: `${firstPlayer.firstName} ${firstPlayer.lastName}`,
        secondPlayer: `${secondPlayer.firstName} ${secondPlayer.lastName}`,
        firstClub: firstClub.name,
        secondClub: secondClub.name,
      };
    });

    await gamePage.navigateTo("internationalView");
    await gamePage.page.getByRole("button", { name: /World Archive/ }).click();
    const archive = gamePage.page.getByRole("dialog", { name: "The seasons beyond your desk" });
    await archive.getByRole("button", { name: "Compare careers" }).click();

    await expect(archive.getByRole("heading", { name: "Compare careers across seasons" })).toBeVisible();
    await expect(archive.getByRole("table")).toContainText(names.firstPlayer);
    await expect(archive.getByRole("table")).toContainText(names.secondPlayer);
    await expect(archive).not.toContainText(/current ability|potential ability|report influence|internal reputation/i);

    await archive.getByRole("button", { name: "Clubs" }).click();
    await expect(archive.getByRole("table")).toContainText(names.firstClub);
    await expect(archive.getByRole("table")).toContainText(names.secondClub);

    await archive.getByRole("button", { name: "Managers" }).click();
    await expect(archive.getByRole("table")).toContainText("Avery Morgan");
    await expect(archive.getByRole("table")).toContainText("Casey Singh");
    await archive.getByText("S1", { exact: true }).first().click();
    await expect(archive.getByRole("button", { name: "Open Season 1 story" }).first()).toBeVisible();

    const axe = await new AxeBuilder({ page: gamePage.page })
      .include("#world-history-drawer")
      .analyze();
    expect(axe.violations.filter((violation) =>
      violation.impact === "serious" || violation.impact === "critical"
    )).toEqual([]);
    await archive.evaluate((element) => { element.scrollTop = 0; });
    await gamePage.page.screenshot({
      path: path.join(evidenceDir, "desktop-world-history-comparison.png"),
      fullPage: true,
    });

    await gamePage.page.setViewportSize({ width: 390, height: 844 });
    await gamePage.page.waitForTimeout(200);
    await archive.evaluate((element) => { element.scrollTop = 0; });
    const overflow = await gamePage.page.evaluate(() =>
      document.documentElement.scrollWidth - window.innerWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(archive.getByLabel("First comparison subject")).toBeVisible();
    const mobileAxe = await new AxeBuilder({ page: gamePage.page })
      .include("#world-history-drawer")
      .analyze();
    expect(mobileAxe.violations.filter((violation) =>
      violation.impact === "serious" || violation.impact === "critical"
    )).toEqual([]);
    await gamePage.page.screenshot({
      path: path.join(evidenceDir, "mobile-world-history-comparison.png"),
      fullPage: true,
    });
    gamePage.expectNoConsoleErrors();
  });
});
