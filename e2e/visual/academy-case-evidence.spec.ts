import { mkdir } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "../fixtures";
import type { GamePage } from "../fixtures";

const evidenceDir = path.join(process.cwd(), "design-audit-evidence", "academy-case");

async function capture(
  gamePage: GamePage,
  viewport: "desktop" | "mobile",
  name: string,
  fullPage = false,
) {
  await gamePage.page.waitForTimeout(250);
  await gamePage.page.screenshot({
    path: path.join(evidenceDir, `${viewport}-${name}${fullPage ? "-full" : ""}.png`),
    fullPage,
  });
}

async function dismissAchievements(gamePage: GamePage) {
  const dismiss = gamePage.page.getByRole("button", {
    name: "Dismiss achievement notification",
  });
  if (await dismiss.isVisible({ timeout: 250 }).catch(() => false)) {
    await dismiss.click();
    await gamePage.page.waitForTimeout(250);
  }
}

async function assertRenderedIntegrity(gamePage: GamePage, label: string) {
  const widths = await gamePage.page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("#game-main");
    const mainRect = main?.getBoundingClientRect();
    const offenders = main && mainRect
      ? Array.from(main.querySelectorAll<HTMLElement>("*"))
          .map((element) => ({
            element,
            rect: element.getBoundingClientRect(),
          }))
          .filter(({ rect }) => rect.width > 0 && rect.right > mainRect.right + 1)
          .sort((left, right) => right.rect.right - left.rect.right)
          .slice(0, 8)
          .map(({ element, rect }) => ({
            tag: element.tagName.toLowerCase(),
            id: element.id,
            classes: element.className,
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            text: element.textContent?.trim().slice(0, 80),
          }))
      : [];
    return {
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      mainClient: main?.clientWidth ?? 0,
      mainScroll: main?.scrollWidth ?? 0,
      offenders,
    };
  });
  expect(
    widths.document,
    `${label} document overflow: ${JSON.stringify(widths)}`,
  ).toBeLessThanOrEqual(widths.viewport + 1);
  if (widths.mainClient > 0) {
    expect(
      widths.mainScroll,
      `${label} game-surface overflow: ${JSON.stringify(widths)}`,
    ).toBeLessThanOrEqual(widths.mainClient + 1);
  }

  const scan = await new AxeBuilder({ page: gamePage.page }).analyze();
  const blocking = scan.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  expect(
    blocking,
    `${label} blocking Axe violations:\n${JSON.stringify(blocking, null, 2)}`,
  ).toEqual([]);
}

async function prepareAcademyCase(gamePage: GamePage) {
  await gamePage.goto();
  await gamePage.injectState({
    currentWeek: 3,
    currentSeason: 1,
    scout: {
      firstName: "Maya",
      lastName: "Reed",
      primarySpecialization: "youth",
      reputation: 55,
    },
  });

  return gamePage.page.evaluate(() => {
    const store = (window as any).__GAME_STORE__;
    const state = store.getState().gameState;
    const youth = Object.values(state.unsignedYouth)[0] as any;
    const sourceBrief = Object.values(state.youthRecruitmentBriefs)[0] as any;
    if (!youth || !sourceBrief) throw new Error("Academy visual fixture is unavailable");

    const player = youth.player;
    const contexts = ["schoolMatch", "academyTrialDay", "parentCoachMeeting"];
    const observations = Object.fromEntries(contexts.map((context, index) => {
      const id = `visual_academy_obs_${index}`;
      return [id, {
        id,
        playerId: player.id,
        scoutId: state.scout.id,
        sourceSessionId: `visual_academy_session_${index}`,
        week: state.currentWeek,
        season: state.currentSeason,
        context,
        attributeReadings: ["pace", "decisionMaking", "teamwork"].map((attribute) => ({
          attribute,
          perceivedValue: player.attributes[attribute],
          confidence: 0.82,
          observationCount: index + 1,
          rangeLow: Math.max(1, player.attributes[attribute] - 1),
          rangeHigh: Math.min(20, player.attributes[attribute] + 1),
        })),
        notes: [`Independent ${context} evidence.`],
        flaggedMoments: [],
      }];
    }));

    const brief = {
      ...sourceBrief,
      requiredPositions: [player.position],
      preferredRole: undefined,
      maxAge: Math.max(sourceBrief.maxAge, player.age),
      weeklyWageBudget: 2_000,
      riskTolerance: "medium",
      competitionPressure: 78,
      initialCompetitionPressure: 78,
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
      observations: { ...state.observations, ...observations },
      youthRecruitmentBriefs: { [brief.id]: brief },
    });

    store.getState().selectPlayer(player.id);
    return { playerId: player.id };
  });
}

test.describe("Academy case rendered evidence", () => {
  test.setTimeout(120_000);

  test("captures the connected case flow on desktop and mobile", async ({ gamePage }) => {
    await mkdir(evidenceDir, { recursive: true });
    await prepareAcademyCase(gamePage);

    const viewports = [
      { name: "desktop" as const, width: 1440, height: 900 },
      { name: "mobile" as const, width: 390, height: 844 },
    ];

    for (const viewport of viewports) {
      await gamePage.page.setViewportSize({ width: viewport.width, height: viewport.height });

      await gamePage.setScreen("dashboard");
      await expect(gamePage.page.getByRole("heading", { name: "Scouting Desk" })).toBeVisible();
      await expect(gamePage.page.getByText(/this brief weights/i).first()).toBeVisible();
      await dismissAchievements(gamePage);
      await capture(gamePage, viewport.name, "desk");
      await capture(gamePage, viewport.name, "desk", true);
      await assertRenderedIntegrity(gamePage, `${viewport.name} recruitment desk`);

      await gamePage.setScreen("playerProfile");
      await expect(gamePage.page.getByRole("heading", { name: "Brief fit and opportunity cost" })).toBeVisible();
      await capture(gamePage, viewport.name, "dossier");
      await capture(gamePage, viewport.name, "dossier", true);

      await gamePage.page.getByRole("button", { name: /^Write Report$/ }).click();
      await gamePage.waitForScreen("reportWriter");
      await expect(gamePage.page.getByRole("heading", { name: "Answer a real club need" })).toBeVisible();
      await expect(gamePage.page.getByTestId("recruitment-identity-briefing")).toBeVisible();
      await capture(gamePage, viewport.name, "report-writer");
      await capture(gamePage, viewport.name, "report-writer", true);
      await assertRenderedIntegrity(gamePage, `${viewport.name} recruitment report writer`);
    }

    await gamePage.submitCurrentReportViaUI("strongRecommend");
    await gamePage.waitForScreen("reportHistory");
    await dismissAchievements(gamePage);
    await gamePage.page.getByRole("button", { name: /View full report/ }).first().click();
    await expect(gamePage.page.getByRole("dialog", { name: /Report for/ })).toBeVisible();

    await capture(gamePage, "mobile", "report-detail");
    await gamePage.page.setViewportSize({ width: 1440, height: 900 });
    await capture(gamePage, "desktop", "report-detail");
  });
});
