import { dismissCareerMomentOverlays, test, expect } from "../fixtures";
import { seedStructuredEvidenceForPlayer } from "../helpers/structured-evidence";

async function prepareYouthReportDraft(gamePage: import("../fixtures").GamePage) {
  await gamePage.goto();
  await gamePage.injectState({
    currentWeek: 1,
    currentSeason: 1,
    scout: {
      firstName: "Delay",
      lastName: "Validator",
      primarySpecialization: "youth",
      reputation: 40,
    },
  });

  const setup = await gamePage.page.evaluate(() => {
    const store = (window as any).__GAME_STORE__;
    const state = store.getState().gameState;
    const youth = Object.values(state.unsignedYouth)[0] as any;
    if (!youth) throw new Error("No unsigned youth available for report test");

    const player = youth.player;
    const playerId = player.id;
    const exact = (attribute: string) => player.attributes[attribute];
    const observation = {
      id: `obs_${playerId}_report_delay`,
      playerId,
      scoutId: state.scout.id,
      week: state.currentWeek,
      season: state.currentSeason,
      context: "schoolMatch",
      attributeReadings: [
        "pace",
        "finishing",
        "firstTouch",
        "decisionMaking",
        "offTheBall",
      ].map((attribute) => {
        const perceivedValue = exact(attribute);
        return {
          attribute,
          perceivedValue,
          confidence: 0.82,
          observationCount: 3,
          rangeLow: Math.max(1, perceivedValue - 1),
          rangeHigh: Math.min(20, perceivedValue + 1),
        };
      }),
      notes: ["Deterministic regression observation for delayed validation."],
      flaggedMoments: [],
      abilityReading: {
        perceivedCA: Math.max(0.5, Math.min(5, Math.round((player.currentAbility / 40) * 2) / 2)),
        caConfidence: 0.8,
        perceivedPALow: Math.max(0.5, Math.min(5, Math.round((player.potentialAbility / 40) * 2) / 2 - 0.5)),
        perceivedPAHigh: Math.max(0.5, Math.min(5, Math.round((player.potentialAbility / 40) * 2) / 2)),
        paConfidence: 0.75,
      },
    };

    store.getState().loadGame({
      ...state,
      observations: {
        ...state.observations,
        [observation.id]: observation,
      },
    });

    return {
      playerId,
      playerName: `${player.firstName} ${player.lastName}`,
      presentInSeniorPlayerMap: Boolean(state.players[playerId]),
    };
  });

  await seedStructuredEvidenceForPlayer(gamePage.page, setup.playerId);
  await gamePage.page.evaluate((playerId) => {
    (window as any).__GAME_STORE__.getState().startReport(playerId);
  }, setup.playerId);
  await gamePage.waitForScreen("reportWriter");
  return setup;
}

test.describe("Delayed scout report validation regression", () => {
  test("report submission shows craft immediately and later validates against career evidence for youth reports", async ({ gamePage }, testInfo) => {
    const setup = await prepareYouthReportDraft(gamePage);
    expect(setup.presentInSeniorPlayerMap).toBe(false);

    await gamePage.submitCurrentReportViaUI("recommend");
    await gamePage.waitForScreen("reportHistory");

    const submitted = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      const report = Object.values(state.reports).at(-1) as any;
      return {
        reportId: report.id,
        playerId: report.playerId,
        qualityScore: report.qualityScore,
        craftBreakdown: report.craftBreakdown ?? null,
        attributeAssessmentCount: report.attributeAssessments.length,
        postTransferRating: report.postTransferRating,
        accuracyReputationDelta: report.accuracyReputationDelta,
      };
    });

    expect(submitted.playerId).toBe(setup.playerId);
    expect(submitted.attributeAssessmentCount).toBeGreaterThan(0);
    expect(submitted.qualityScore).toBeGreaterThan(0);
    expect(submitted.craftBreakdown).toBeTruthy();
    expect(submitted.postTransferRating).toBeUndefined();
    expect(submitted.accuracyReputationDelta).toBeUndefined();

    await expect(
      gamePage.page.getByTestId("reports-command-deck")
        .getByText(new RegExp(`Craft\\s+${submitted.qualityScore}/100`)),
    ).toBeVisible();
    await expect(gamePage.page.getByText(/Validated accuracy:/)).toHaveCount(0);

    const validation = await gamePage.page.evaluate(async () => {
      const store = (window as any).__GAME_STORE__;
      const state = store.getState().gameState;
      const report = Object.values(state.reports).at(-1) as any;
      if (!report) throw new Error("No report available for delayed validation");

      const youth = Object.values(state.unsignedYouth).find(
        (entry: any) => entry.player.id === report.playerId,
      ) as any;
      if (!youth) throw new Error("Submitted report no longer maps to unsigned youth");

      const player = youth.player;
      const seasonLength = Math.max(
        38,
        ...Object.values(state.fixtures).map((fixture: any) => fixture.week ?? 0),
      );
      const validationSeason = report.submittedSeason + 2;
      const reputationBefore = 50;
      const exactAssessments = report.attributeAssessments.map((assessment: any) => {
        const exactValue = player.attributes[assessment.attribute];
        return {
          ...assessment,
          estimatedValue: exactValue,
          confidenceRange: [exactValue, exactValue],
        };
      });

      store.getState().loadGame({
        ...state,
        currentSeason: validationSeason,
        currentWeek: seasonLength,
        scout: {
          ...state.scout,
          reputation: reputationBefore,
          accuracyHistory: [],
        },
        reports: {
          ...state.reports,
          [report.id]: {
            ...report,
            clubResponse: "signed",
            postTransferRating: undefined,
            accuracyReputationDelta: undefined,
            attributeAssessments: exactAssessments,
          },
        },
        alumniRecords: [
          {
            id: `alumni_${report.playerId}`,
            playerId: report.playerId,
            placedClubId: "club_1",
            currentClubId: "club_1",
            milestones: [],
            careerSnapshots: [],
            placedWeek: 1,
            placedSeason: report.submittedSeason,
            careerUpdates: [],
            currentStatus: "academy",
            seasonStats: [],
            becameContact: false,
          },
        ],
        transferRecords: [
          {
            id: `transfer_${report.id}`,
            playerId: report.playerId,
            scoutId: state.scout.id,
            fromClubId: "club_1",
            toClubId: "club_2",
            fee: 1_000_000,
            transferWeek: 1,
            transferSeason: report.submittedSeason + 1,
            scoutConviction: report.conviction,
            reportId: report.id,
            caAtTransfer: player.currentAbility,
            currentCA: player.currentAbility,
            seasonsSinceTransfer: 2,
            accountabilityApplied: false,
          },
        ],
      });

      // Use the canonical Early Access week path. Batch advance intentionally
      // skips store-level season review/validation orchestration.
      store.getState().startWeekSimulation();
      await store.getState().fastForwardWeek();

      const after = store.getState().gameState;
      const validatedReport = after.reports[report.id];
      const latestAccuracyHistory = (after.scout.accuracyHistory ?? []).at(-1) ?? null;
      const validationMessage = after.inbox.find(
        (message: any) => message.id === `retro-${report.id}-s${validationSeason}`,
      ) ?? null;

      return {
        sourceSeason: validationSeason,
        sourceWeek: seasonLength,
        reputationBefore,
        reputationAfter: after.scout.reputation,
        currentSeason: after.currentSeason,
        currentWeek: after.currentWeek,
        playerCurrentAbility: player.currentAbility,
        playerFoundInPlayers: Boolean(after.players[report.playerId]),
        playerStillTrackedAsUnsignedYouth: Object.values(after.unsignedYouth).some(
          (entry: any) => entry.player.id === report.playerId,
        ),
        validatedReport: {
          postTransferRating: validatedReport.postTransferRating,
          accuracyReputationDelta: validatedReport.accuracyReputationDelta,
        },
        latestAccuracyHistory,
        validationMessage,
      };
    });

    expect(validation.currentWeek).toBe(1);
    expect(
      validation.validatedReport.postTransferRating,
      `Delayed validation skipped.\n${JSON.stringify(validation, null, 2)}`,
    ).toBe(100);
    expect(validation.validatedReport.accuracyReputationDelta).toBe(3);
    expect(validation.latestAccuracyHistory).toMatchObject({
      week: 1,
      season: validation.currentSeason,
      actualCA: validation.playerCurrentAbility,
    });
    expect(validation.latestAccuracyHistory.predictedCA).toBeGreaterThan(0);
    expect(validation.validationMessage).not.toBeNull();
    expect(validation.validationMessage.body).toContain("after 2 seasons");
    expect(validation.validationMessage.body).toContain("Accuracy: 100/100");
    expect(validation.validationMessage.body).toMatch(/reputation \+3/i);
    expect(validation.reputationAfter).toBeGreaterThan(validation.reputationBefore);

    // Keep the actual validation facts and source boundary in the trace.
    // This fixture has synthetic report evidence and no interactive watches.
    const presentation = await gamePage.page.evaluate(() => {
      const store = (window as any).__GAME_STORE__.getState();
      return { screen: store.currentScreen, busy: store.isAdvancingWeek,
        route: store.lastWeeklyExecutionRoute,
        summaryContinueScreen: store.lastWeekSummary?.continueScreen ?? null,
        reviewSeason: store.gameState.seasonAwardsData?.season ?? null };
    });
    await testInfo.attach("delayed-validation-facts.json", {
      body: JSON.stringify({ setup, submitted, validation, presentation }, null, 2),
      contentType: "application/json",
    });
    // The canonical rollover first presents its real Week Summary, whose
    // acknowledgement hands off to the completed-season review. Do not replace
    // either route with the requested detail before accepting that handoff.
    await dismissCareerMomentOverlays(gamePage.page);
    if (presentation.summaryContinueScreen === "seasonAwards") {
      const weekSummary = gamePage.page.getByRole("dialog", { name: "Week Summary", exact: true });
      await expect(weekSummary).toBeVisible();
      await weekSummary.getByRole("button", { name: /^(Close week summary|Continue to promotion|Continue to milestone)$/ })
        .click({ timeout: 5_000 });
      await gamePage.waitForScreen("seasonAwards");
    }
    expect(await gamePage.continueCanonicalSeasonReview(validation.sourceSeason)).toBe(true);
    // Discoveries remains an explicitly scoped supported detail entry. This
    // does not claim a sidebar or Career drilldown that the product lacks.
    await gamePage.setScreen("discoveries");
    await gamePage.waitForScreen("discoveries");
    await expect(
      gamePage.page.getByRole("heading", { name: "Career Tracker" }),
    ).toBeVisible();
    await expect(gamePage.page.getByText("Validated Calls")).toBeVisible();
    await expect(gamePage.page.getByText(/Initial CA|Current CA|Wonderkid/)).toHaveCount(0);

    gamePage.expectNoConsoleErrors();
  });
});
