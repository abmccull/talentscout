import type { GamePage } from "../fixtures";
import { test, expect } from "../fixtures";
import { seedStructuredEvidenceForPlayer } from "../helpers/structured-evidence";

async function prepareObservedYouthPlayer(gamePage: GamePage) {
  await gamePage.goto();
  await gamePage.injectState({
    currentWeek: 1,
    scout: {
      firstName: "Report",
      lastName: "Tester",
      primarySpecialization: "youth",
    },
  });
  await gamePage.navigateTo("calendar");
  await gamePage.scheduleActivityByLabel("School Match", "Mon");
  await gamePage.advanceCanonicalWeek({ launchLiveSession: true });

  const sessionOutcome = await gamePage.page.evaluate(() => {
    const store = (window as any).__GAME_STORE__;
    const state = store.getState().gameState;
    return {
      observationCount: Object.keys(state?.observations ?? {}).length,
      discoveryCount: (state?.discoveryRecords ?? []).length,
    };
  });

  expect(
    sessionOutcome.observationCount > 0 || sessionOutcome.discoveryCount > 0,
  ).toBe(true);

  await gamePage.openFirstYouthPlayerProfile();
  await gamePage.page.getByRole("button", { name: /^Write Report$/ }).click();
  await gamePage.waitForScreen("reportWriter");
}

test.describe("Report Writing", () => {
  test("a Youth report cannot begin without a classified scouting cue", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({ scout: { primarySpecialization: "youth" } });

    const playerId = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      const youth = Object.values(state.unsignedYouth ?? {})[0] as any;
      if (!youth?.player?.id) throw new Error("Evidence gate test needs an unsigned youth player");
      const id = youth.player.id;
      store.getState().loadGame({
        ...state,
        observations: {
          ...state.observations,
          evidence_gate_observation: {
            id: "evidence_gate_observation",
            playerId: id,
            scoutId: state.scout.id,
            week: state.currentWeek,
            season: state.currentSeason,
            context: "schoolMatch",
            attributeReadings: [],
            notes: [],
            flaggedMoments: [],
            abilityReading: {
              perceivedCA: 1,
              caConfidence: 0.3,
              perceivedPALow: 1,
              perceivedPAHigh: 2,
              paConfidence: 0.25,
            },
          },
        },
      });
      store.getState().selectPlayer(id);
      store.getState().setScreen("playerProfile");
      return id;
    });

    await gamePage.waitForScreen("playerProfile");
    await expect(
      gamePage.page.getByRole("button", { name: "Build report evidence first" }),
    ).toBeDisabled();
    await expect(
      gamePage.page.getByRole("heading", { name: "Return with one question to answer." }),
    ).toBeVisible();

    await gamePage.page.evaluate((id) => {
      (window as any).__GAME_STORE__.getState().startReport(id);
    }, playerId);
    await gamePage.waitForScreen("reportWriter");
    await expect(
      gamePage.page.getByRole("heading", { name: "Return with one question to answer" }),
    ).toBeVisible();
    await expect(
      gamePage.page.getByRole("button", { name: "Plan focused observation" }),
    ).toBeVisible();

    gamePage.expectNoConsoleErrors();
  });

  test("report writer exposes only valid conviction options", async ({ gamePage }) => {
    await prepareObservedYouthPlayer(gamePage);

    await gamePage.submitCurrentReportViaUI("recommend", { submit: false });

    const note = gamePage.page.getByRole("radio", { name: /^Note\b/ });
    const recommend = gamePage.page.getByRole("radio", { name: /^Recommend\b/ });
    await expect(note).toBeVisible();
    await expect(recommend).toBeVisible();
    await expect(gamePage.page.getByRole("radio", { name: /^Strong Recommend\b/ })).toBeVisible();
    await expect(gamePage.page.getByRole("radio", { name: /^Table Pound\b/ })).toBeVisible();

    await expect(note).toHaveJSProperty("tagName", "INPUT");
    await note.focus();
    await gamePage.page.keyboard.press("ArrowRight");
    await expect(recommend).toBeChecked();

    await gamePage.page.getByRole("tab", { name: /^Build the case\b/ }).click();

    const monitor = gamePage.page.getByRole("radio", { name: /^Monitor\b/ });
    const inviteForTrial = gamePage.page.getByRole("radio", { name: /^Invite for trial\b/ });
    await expect(monitor).toHaveJSProperty("tagName", "INPUT");
    await monitor.focus();
    await gamePage.page.keyboard.press("Space");
    await expect(monitor).toBeChecked();
    await gamePage.page.keyboard.press("ArrowRight");
    await expect(inviteForTrial).toBeChecked();
    await gamePage.page.getByRole("tab", { name: /^Final review\b/ }).click();
    await expect(gamePage.page.getByRole("button", { name: /^Submit Report$/ })).toBeEnabled();

    gamePage.expectNoConsoleErrors();
  });

  test("submitting a valid report writes it to report history", async ({ gamePage }) => {
    await prepareObservedYouthPlayer(gamePage);

    await gamePage.submitCurrentReportViaUI("recommend");
    await gamePage.waitForScreen("reportHistory");
    await expect(
      gamePage.page.getByRole("heading", { name: "Reports" }),
    ).toBeVisible();

    const latestReport = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const reports = Object.values(store.getState().gameState?.reports ?? {}) as any[];
      return reports.at(-1) ?? null;
    });

    expect(latestReport).not.toBeNull();
    expect(latestReport.conviction).toBe("recommend");
    expect((latestReport.attributeAssessments ?? []).length).toBeGreaterThan(0);
    expect(Array.isArray(latestReport.strengths)).toBe(true);
    expect(Array.isArray(latestReport.weaknesses)).toBe(true);
    await expect(gamePage.page.getByText("Recommend", { exact: true }).last()).toBeVisible();

    gamePage.expectNoConsoleErrors();
  });

  test("a low-evidence 14-year-old goalkeeper stays conservative and avoids invented keeper claims", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 1,
      scout: { primarySpecialization: "youth" },
    });

    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      const playerId = Object.keys(state.players)[0];
      const player = state.players[playerId];
      const readings = [
        ["positioning", 8],
        ["composure", 6],
        ["decisionMaking", 7],
        ["leadership", 4],
        ["anticipation", 8],
        ["passing", 5],
        ["vision", 4],
        ["jumping", 6],
        ["strength", 5],
        ["firstTouch", 2],
      ].map(([attribute, perceivedValue]) => ({
        attribute,
        perceivedValue,
        confidence: 0.45,
        observationCount: 1,
        rangeLow: Math.max(1, Number(perceivedValue) - 3),
        rangeHigh: Math.min(20, Number(perceivedValue) + 3),
      }));

      store.getState().loadGame({
        ...state,
        players: {
          ...state.players,
          [playerId]: {
            ...player,
            age: 14,
            position: "GK",
            marketValue: 5_000,
          },
        },
        observations: {
          ...state.observations,
          gk_ea_observation: {
            id: "gk_ea_observation",
            playerId,
            scoutId: state.scout.id,
            week: 1,
            season: 1,
            context: "schoolMatch",
            attributeReadings: readings,
            notes: ["One cautious school-match watch."],
            flaggedMoments: [],
            abilityReading: {
              perceivedCA: 1,
              caConfidence: 0.4,
              perceivedPALow: 1.5,
              perceivedPAHigh: 2,
              paConfidence: 0.35,
            },
          },
        },
      });
      store.getState().startReport(playerId);
    });

    await seedStructuredEvidenceForPlayer(gamePage.page);

    await gamePage.waitForScreen("reportWriter");
    await gamePage.page.locator("details#report-dossier > summary").click();
    await expect(gamePage.page.getByText(/does not infer unobserved shot-stopping/i)).toBeVisible();
    await gamePage.submitCurrentReportViaUI("note");

    const report = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const reports = Object.values(store.getState().gameState?.reports ?? {}) as any[];
      return reports.at(-1);
    });

    expect(report.estimatedValueRange[1]).toBeLessThanOrEqual(20_000);
    expect([...report.strengths, ...report.weaknesses].join(" ")).not.toMatch(
      /shot-stopp|handling|command of|sweeping/i,
    );

    gamePage.expectNoConsoleErrors();
  });
});
