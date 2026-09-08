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
  await gamePage.page.getByRole("button", { name: "Write the report", exact: true }).click();
  await gamePage.waitForScreen("reportWriter");
}

test.describe("Report Writing", () => {
  test("a restored opening case files an initial assessment even when a matching club brief is open", async ({ gamePage }) => {
    await gamePage.goto();
    await gamePage.injectState({ scout: { primarySpecialization: "youth" } });

    // This is a save-resume fixture: a completed opening watch has left one
    // classified cue, while the world still contains an open matching brief.
    const setup = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      const youth = Object.values(state.unsignedYouth)[0] as any;
      const sourceBrief = Object.values(state.youthRecruitmentBriefs)[0] as any;
      if (!youth || !sourceBrief) throw new Error("Restored opening fixture needs a youth and club brief");
      const brief = {
        ...sourceBrief,
        requiredPositions: [youth.player.position],
        maxAge: Math.max(sourceBrief.maxAge, youth.player.age),
        status: "open",
      };
      const observation = {
        id: "restored_opening_observation",
        playerId: youth.player.id,
        scoutId: state.scout.id,
        sourceSessionId: "restored_opening_session",
        week: state.currentWeek,
        season: state.currentSeason,
        context: "schoolMatch",
        attributeReadings: [],
        notes: ["A promising first look still needs another context."],
        flaggedMoments: [],
        abilityReading: {
          perceivedCA: 1,
          caConfidence: 0.3,
          perceivedPALow: 1,
          perceivedPAHigh: 2,
          paConfidence: 0.25,
        },
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
        observations: { [observation.id]: observation },
        youthRecruitmentBriefs: { [brief.id]: brief },
      });
      return { playerId: youth.player.id, youthId: youth.id, briefId: brief.id, clubId: brief.clubId };
    });
    await seedStructuredEvidenceForPlayer(gamePage.page, setup.playerId);

    await gamePage.page.evaluate(({ playerId, youthId, briefId, clubId }) => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      const restoredState = JSON.parse(JSON.stringify({
        ...state,
        activeObservationSession: undefined,
        openingCase: {
          id: "restored_opening_case",
          scoutId: state.scout.id,
          youthId,
          playerId,
          playerPoolIds: [playerId],
          sourceContactName: "Opening source",
          briefId,
          clubId,
          stage: "report",
          startedWeek: state.currentWeek,
          startedSeason: state.currentSeason,
          claimedWeek: state.currentWeek,
          claimedSeason: state.currentSeason,
          discoveryRecordCreated: true,
          selectedChoiceId: "protect",
        },
      }));
      // Let the load boundary choose the route and player; do not start the
      // writer manually, which would miss the resumed-opening regression.
      store.getState().loadGame(restoredState);
    }, setup);

    await gamePage.waitForScreen("reportWriter");
    expect(await gamePage.getGameStateValue(`youthRecruitmentBriefs.${setup.briefId}.status`)).toBe("open");
    await expect(gamePage.page.getByRole("heading", { name: "Write Scouting Report" })).toBeVisible();
    await expect(gamePage.page.getByRole("group", { name: "Saved evidence" })).toBeVisible();
    await expect(gamePage.page.getByRole("heading", { name: "Answer a real club need" })).toHaveCount(0);
    const fileAssessment = gamePage.page.getByRole("button", { name: "File initial assessment", exact: true });
    await expect(fileAssessment).toBeDisabled();
    await gamePage.submitCurrentReportViaUI("note", { submit: false });
    await expect(fileAssessment).toBeEnabled();
    await fileAssessment.click();
    await gamePage.waitForScreen("calendar");

    const report = await gamePage.page.evaluate(() => {
      const state = (window as any).__GAME_STORE__.getState().gameState;
      return Object.values(state.reports).at(-1) as any;
    });
    expect(report.playerId).toBe(setup.playerId);
    expect(report.evidenceAssessment?.kind).toBe("initial");
    expect(report.evidenceAssessment?.evidenceIds.length).toBeGreaterThan(0);
    expect(report.evidenceAssessment?.unknowns.length).toBeGreaterThan(0);
    expect(report.briefId ?? null).toBeNull();
    expect(await gamePage.getGameStateValue(`youthRecruitmentBriefs.${setup.briefId}.status`)).toBe("open");
    expect(await gamePage.getGameStateValue("openingCase.stage")).toBe("complete");
    await gamePage.page.evaluate(async () => {
      await (window as any).__GAME_STORE__.getState().flushGameplaySave();
    });
    await gamePage.page.reload();
    await gamePage.page.getByRole("button", { name: "Continue Career", exact: true }).click();
    await gamePage.waitForScreen("dashboard");
    expect(await gamePage.getGameStateValue("openingCase.stage")).toBe("complete");
    // An older checkpoint can still have stage=report after filing. Its
    // authoritative authored report must repair the route without a reward.
    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const saved = JSON.parse(JSON.stringify(store.getState().gameState));
      saved.openingCase.stage = "report";
      store.getState().loadGame(saved);
    });
    await gamePage.waitForScreen("dashboard");
    expect(await gamePage.getGameStateValue("openingCase.stage")).toBe("complete");
    gamePage.expectNoConsoleErrors();
  });

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
    await expect(gamePage.page.getByRole("button", { name: "Plan next observation", exact: true })).toBeEnabled();
    await gamePage.page.getByText("Player actions & contacts", { exact: true }).click();
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
    expect(Object.keys(latestReport.categoryVerdicts ?? {})).toEqual(
      expect.arrayContaining(["potential", "roleFit", "characterRisk"]),
    );
    expect((latestReport.evidenceAssessment?.evidenceIds ?? []).length).toBeGreaterThan(0);
    expect(Array.isArray(latestReport.strengths)).toBe(true);
    expect(Array.isArray(latestReport.weaknesses)).toBe(true);
    await expect(gamePage.page.getByText("Recommend", { exact: true }).last()).toBeVisible();

    gamePage.expectNoConsoleErrors();
  });

  test("final review counts the fresh-evidence blocker before allowing a revision", async ({ gamePage }) => {
    await prepareObservedYouthPlayer(gamePage);

    await gamePage.submitCurrentReportViaUI("recommend");
    await gamePage.waitForScreen("reportHistory");

    await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const latestReport = Object.values(store.getState().gameState?.reports ?? {}).at(-1) as any;
      if (!latestReport?.playerId) throw new Error("Expected a submitted report before reopening the writer");
      store.getState().startReport(latestReport.playerId);
    });

    await gamePage.waitForScreen("reportWriter");
    await gamePage.submitCurrentReportViaUI("recommend", { submit: false });
    await expect(
      gamePage.page.getByText(/^1 decision remaining$/),
    ).toBeVisible();
    await expect(
      gamePage.page.getByRole("status").filter({
        hasText: /Gather fresh evidence in another match, training visit, video review, or meaningful context before filing this revision\./,
      }),
    ).toBeVisible();
    await expect(
      gamePage.page.getByRole("button", { name: /^File revision 2$/ }),
    ).toBeDisabled();

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
