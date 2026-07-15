import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures";
import type { GamePage } from "../fixtures";
import { SELECTORS } from "../helpers/selectors";
import { getDefaultSkillAllocations } from "../helpers/state-injection";

async function expectNoBlockingViolations(page: Page, state: string) {
  // Screen changes use a 150 ms opacity transition. Scan the settled UI so
  // Axe measures the authored palette rather than a transient fade frame.
  await page.waitForTimeout(200);
  const result = await new AxeBuilder({ page }).analyze();
  const blocking = result.violations
    .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      targets: violation.nodes.map((node) => node.target.join(" ")),
    }));

  expect(blocking, `${state} has serious or critical accessibility violations`).toEqual([]);
}

async function prepareAcademyCase(gamePage: GamePage) {
  await gamePage.goto();
  await gamePage.injectState({
    currentWeek: 3,
    currentSeason: 1,
    scout: { primarySpecialization: "youth", reputation: 50 },
  });
  return gamePage.page.evaluate(() => {
    const store = (window as any).__GAME_STORE__;
    const state = store.getState().gameState;
    const youth = Object.values(state.unsignedYouth)[0] as any;
    const sourceBrief = Object.values(state.youthRecruitmentBriefs)[0] as any;
    if (!youth || !sourceBrief) throw new Error("Academy accessibility fixture unavailable");
    const player = youth.player;
    const observation = {
      id: `axe_academy_obs_${player.id}`,
      playerId: player.id,
      scoutId: state.scout.id,
      sourceSessionId: "axe_academy_session",
      week: state.currentWeek,
      season: state.currentSeason,
      context: "schoolMatch",
      attributeReadings: ["pace", "decisionMaking", "teamwork"].map((attribute) => ({
        attribute,
        perceivedValue: player.attributes[attribute],
        confidence: 0.78,
        observationCount: 2,
        rangeLow: Math.max(1, player.attributes[attribute] - 1),
        rangeHigh: Math.min(20, player.attributes[attribute] + 1),
      })),
      notes: ["Accessible academy case evidence."],
      flaggedMoments: [],
    };
    const brief = {
      ...sourceBrief,
      requiredPositions: [player.position],
      preferredRole: undefined,
      maxAge: Math.max(sourceBrief.maxAge, player.age),
      weeklyWageBudget: 2_000,
      competitionPressure: 72,
      initialCompetitionPressure: 72,
      status: "open",
    };
    store.getState().loadGame({
      ...state,
      unsignedYouth: {
        ...state.unsignedYouth,
        [youth.id]: {
          ...youth,
          discoveredBy: [...new Set([...youth.discoveredBy, state.scout.id])],
        },
      },
      observations: { ...state.observations, [observation.id]: observation },
      youthRecruitmentBriefs: { [brief.id]: brief },
    });
    store.getState().selectPlayer(player.id);
    store.getState().setScreen("playerProfile");
    return { playerId: player.id };
  });
}

test.describe("Youth Early Access accessibility", () => {
  test.setTimeout(120_000);

  test("mobile main menu and all four creation steps have no blocking axe violations", async ({ gamePage }) => {
    await gamePage.page.setViewportSize({ width: 390, height: 844 });
    await gamePage.goto();
    await gamePage.page.locator(SELECTORS.newGameButton).first().waitFor({ state: "visible" });

    await expectNoBlockingViolations(gamePage.page, "mobile main menu");

    await gamePage.page.locator(SELECTORS.newGameButton).first().click();
    await expect(
      gamePage.page.getByRole("heading", { name: "Your Identity" }),
    ).toBeVisible();
    await expectNoBlockingViolations(gamePage.page, "mobile identity step");

    await gamePage.page.locator("#scout-first-name").fill("Access");
    await gamePage.page.locator("#scout-last-name").fill("Scout");
    await gamePage.page.getByRole("button", { name: "Continue" }).click();
    await expect(
      gamePage.page.getByRole("heading", { name: "Customize Your Skills" }),
    ).toBeVisible();
    await expectNoBlockingViolations(gamePage.page, "mobile skills step");

    for (const [skill, points] of Object.entries(getDefaultSkillAllocations("youth"))) {
      for (let index = 0; index < points; index++) {
        await gamePage.page.getByRole("button", { name: `Increase ${skill}` }).click();
      }
    }
    await gamePage.page.getByRole("button", { name: "Continue" }).click();
    await expect(
      gamePage.page.getByRole("heading", { name: "Build Your World" }),
    ).toBeVisible();
    await expectNoBlockingViolations(gamePage.page, "mobile world step");

    await gamePage.page.getByRole("button", { name: "Continue" }).click();
    await expect(
      gamePage.page.getByRole("heading", { name: "Review & Begin" }),
    ).toBeVisible();
    await expectNoBlockingViolations(gamePage.page, "mobile review step");
  });

  test("mobile dashboard and calendar have no blocking axe violations", async ({ gamePage }) => {
    await gamePage.page.setViewportSize({ width: 390, height: 844 });
    await gamePage.goto();
    await gamePage.startNewGame({
      firstName: "Access",
      lastName: "Scout",
      specialization: "youth",
    });
    await expect(gamePage.page.getByRole("heading", { name: "Scouting Desk" })).toBeVisible();
    await gamePage.page.waitForTimeout(1_000);
    const achievementDismiss = gamePage.page.getByRole("button", {
      name: "Dismiss achievement notification",
    });
    if (await achievementDismiss.isVisible({ timeout: 500 }).catch(() => false)) {
      await achievementDismiss.click();
      await gamePage.page.waitForTimeout(250);
    }

    await expectNoBlockingViolations(gamePage.page, "mobile dashboard");

    await gamePage.page.getByRole("button", { name: "Open navigation menu" }).click();
    await gamePage.navigateTo("calendar");
    await expectNoBlockingViolations(gamePage.page, "mobile calendar");
  });

  test("planner warning dialog has a name, traps focus, closes by keyboard, and restores context", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectLateGameState("youth");
    await gamePage.injectState({
      schedule: { activities: Array(7).fill(null) },
    });
    await gamePage.setScreen("calendar");

    const advanceWeek = gamePage.page.getByRole("button", { name: "Advance Week" });
    await advanceWeek.click();
    const dialog = gamePage.page.getByRole("dialog", { name: "Unplanned Days" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Go Back" })).toBeFocused();
    await expectNoBlockingViolations(gamePage.page, "planner unplanned-days dialog");

    await gamePage.page.keyboard.press("Shift+Tab");
    await expect(dialog.getByRole("button", { name: "Advance" })).toBeFocused();
    await gamePage.page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Go Back" })).toBeFocused();
    await gamePage.page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(advanceWeek).toBeFocused();
  });

  test("the six core workspaces have no blocking axe violations on desktop or mobile", async ({ gamePage }) => {
    const workspaces = [
      ["dashboard", "Scouting Desk"],
      ["calendar", "Planner"],
      ["youthScouting", "Prospects"],
      ["reportHistory", "Reports"],
      ["internationalView", "World"],
      ["career", "Career"],
    ] as const;

    await gamePage.goto();
    await gamePage.injectLateGameState("youth");

    for (const viewport of [
      { name: "desktop", width: 1440, height: 900 },
      { name: "mobile", width: 390, height: 844 },
    ] as const) {
      await gamePage.page.setViewportSize({ width: viewport.width, height: viewport.height });

      for (const [screen, label] of workspaces) {
        await gamePage.setScreen(screen);
        await gamePage.page.waitForTimeout(250);
        await expectNoBlockingViolations(
          gamePage.page,
          `${viewport.name} ${label}`,
        );
      }
    }
  });

  test("academy dossier, professional report writer, and report detail are accessible", async ({ gamePage }) => {
    await prepareAcademyCase(gamePage);

    for (const viewport of [
      { name: "desktop", width: 1440, height: 900 },
      { name: "mobile", width: 390, height: 844 },
    ] as const) {
      await gamePage.page.setViewportSize({ width: viewport.width, height: viewport.height });
      await gamePage.setScreen("playerProfile");
      await expect(gamePage.page.getByRole("heading", { name: "Brief fit and opportunity cost" })).toBeVisible();
      await expectNoBlockingViolations(gamePage.page, `${viewport.name} academy dossier`);

      await gamePage.page.getByRole("button", { name: /^Write Report$/ }).click();
      await gamePage.waitForScreen("reportWriter");
      await expect(gamePage.page.getByRole("heading", { name: "Answer a real club need" })).toBeVisible();
      await expectNoBlockingViolations(gamePage.page, `${viewport.name} professional report writer`);
    }

    await gamePage.page.setViewportSize({ width: 1440, height: 900 });
    await gamePage.submitCurrentReportViaUI("recommend");
    await gamePage.waitForScreen("reportHistory");
    await gamePage.page.getByRole("button", { name: /View full report/ }).first().click();
    await expect(gamePage.page.getByRole("dialog", { name: /Report for/ })).toBeVisible();
    await expectNoBlockingViolations(gamePage.page, "desktop professional report detail dialog");
  });

  test("tier-five political choices are keyboard operable and have no blocking violations", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 12,
      currentSeason: 1,
      scout: {
        // Political leadership choices are part of the shipped Youth Scout
        // career ceiling. First Team Scout is a planned mode and deliberately
        // cannot be loaded in the Early Access save gate.
        primarySpecialization: "youth",
        careerTier: 5,
        careerPath: "club",
        reputation: 62,
        fatigue: 20,
      },
    });
    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      const clubId = Object.keys(state.clubs)[0];
      const manager = state.managerProfiles[clubId];
      store.getState().loadGame({
        ...state,
        scout: {
          ...state.scout,
          careerTier: 5,
          careerPath: "club",
          careerPathChosen: true,
          currentClubId: clubId,
          managerRelationship: {
            managerName: manager.managerName,
            trust: 55,
            influence: 48,
            scoutingPreference: manager.preference,
            meetingsThisSeason: 0,
          },
        },
        boardProfile: {
          personality: "ambitious",
          patience: 65,
          satisfactionLevel: 58,
          budgetMultiplier: 1,
          ultimatumIssued: false,
          recentDirectives: [],
        },
      });
      store.getState().setScreen("career");
    });

    const managerEvidence = gamePage.page.getByRole("radio", { name: /Present the evidence/i });
    const managerListen = gamePage.page.getByRole("radio", { name: /Listen & align/i });
    await managerListen.focus();
    await gamePage.page.keyboard.press("ArrowDown");
    await expect(managerEvidence).toBeChecked();

    const boardVision = gamePage.page.getByRole("radio", { name: /Pitch the vision/i });
    const boardAccountability = gamePage.page.getByRole("radio", { name: /Own the results/i });
    await boardAccountability.focus();
    await gamePage.page.keyboard.press("ArrowUp");
    await expect(boardVision).toBeChecked();

    await gamePage.page.getByRole("button", { name: /Meet Manager/ }).click();
    await expect(gamePage.page.getByTestId("manager-meeting-outcome")).toBeVisible();
    await expect(gamePage.page.getByRole("button", { name: /Meet Manager/ })).toBeDisabled();
    await gamePage.page.getByRole("button", { name: /Meet Board/ }).click();
    await expect(gamePage.page.getByTestId("board-meeting-outcome")).toBeVisible();
    await expect(gamePage.page.getByRole("button", { name: /Meet Board/ })).toBeDisabled();

    await expectNoBlockingViolations(gamePage.page, "desktop tier-five political choices");
    await gamePage.page.setViewportSize({ width: 390, height: 844 });
    await expectNoBlockingViolations(gamePage.page, "mobile tier-five political outcomes");
  });
});
