import type { TestInfo } from "@playwright/test";
import type { GamePage } from "../fixtures";
import { expect } from "../fixtures";
import { seedStructuredEvidenceForPlayer } from "./structured-evidence";

/**
 * Isolates marketplace acceptance from the signal quality of a novice watch.
 * The school match, observations, report UI and canonical settlement stay real.
 * The explicitly labelled cue fixture supplies the buyer's supported-evidence
 * precondition; it is not evidence that this particular watch earned those cues.
 */
export async function createSubmittedSupportedYouthReportFixture(
  gamePage: GamePage,
  testInfo: TestInfo,
  options: { firstName: string; conviction: "recommend" | "strongRecommend" },
): Promise<void> {
  await gamePage.goto();
  await gamePage.injectState({
    currentWeek: 1,
    scout: {
      firstName: options.firstName,
      lastName: "Tester",
      primarySpecialization: "youth",
      careerPath: "independent",
    },
  });
  await gamePage.navigateTo("calendar");
  await gamePage.scheduleActivityByLabel("School Match", "Mon");
  const completedBefore = await gamePage.page.evaluate(() =>
    ((window as any).__GAME_STORE__.getState().gameState.completedInteractiveSessions ?? []) as string[],
  );
  await gamePage.advanceCanonicalWeek({ launchLiveSession: true, maxLiveSessions: 1 });
  await gamePage.openFirstYouthPlayerProfile();

  const observed = await gamePage.page.evaluate((completedIdsBefore) => {
    const storeState = (window as any).__GAME_STORE__.getState();
    const state = storeState.gameState;
    const playerId = storeState.selectedPlayerId as string;
    return {
      playerId,
      observationIds: Object.values(state.observations ?? {})
        .filter((observation: any) => observation.playerId === playerId)
        .map((observation: any) => observation.id as string).sort(),
      completedSessionIds: (state.completedInteractiveSessions ?? [])
        .filter((id: string) => !completedIdsBefore.includes(id)).sort() as string[],
      interactiveObservations: Object.values(state.observations ?? {})
        .filter((observation: any) => observation.sourceSessionId)
        .map((observation: any) => ({ id: observation.id as string,
          playerId: observation.playerId as string,
          sourceSessionId: observation.sourceSessionId as string,
          activityInstanceId: observation.activityInstanceId as string })),
    };
  }, completedBefore);
  expect(observed.playerId).toBeTruthy();
  expect(observed.observationIds.length).toBeGreaterThan(0);
  expect(observed.completedSessionIds).toHaveLength(1);
  expect(observed.interactiveObservations.length).toBeGreaterThan(0);
  expect(new Set(observed.interactiveObservations.map((observation) => observation.sourceSessionId)).size).toBe(1);
  expect(observed.interactiveObservations.every((observation) =>
    observed.completedSessionIds.includes(observation.activityInstanceId))).toBe(true);
  expect(observed.interactiveObservations.some((observation) =>
    observation.playerId === observed.playerId && observed.observationIds.includes(observation.id))).toBe(true);
  await seedStructuredEvidenceForPlayer(gamePage.page, observed.playerId);
  const precondition = await gamePage.page.evaluate((id) => {
    const state = (window as any).__GAME_STORE__.getState().gameState;
    const journal = state.reflectionJournal[`e2e_structured_journal_${id}`];
    return {
      playerId: id,
      observationIds: (journal?.observationIds ?? []).slice().sort(),
      cards: journal?.evidenceCards ?? [],
    };
  }, observed.playerId);
  expect(precondition.observationIds).toEqual(observed.observationIds);
  expect(precondition.cards).toHaveLength(3);
  expect(precondition.cards.every((card: any) => card.playerId === observed.playerId
    && card.clarity === "strong" && card.classification !== "noConclusion")).toBe(true);
  await testInfo.attach("marketplace-supported-report-precondition.json", {
    body: JSON.stringify({ testControl: { maxLiveSessions: 1 }, observed, precondition }, null, 2),
    contentType: "application/json",
  });

  const writeReport = gamePage.page.getByRole("button", { name: "Write the report", exact: true });
  await expect(writeReport).toBeVisible();
  await expect(writeReport).toBeEnabled();
  await writeReport.click();
  await gamePage.waitForScreen("reportWriter");
  await gamePage.submitCurrentReportViaUI(options.conviction);
  await gamePage.waitForScreen("reportHistory");
  const submitted = await gamePage.page.evaluate(() => {
    const storeState = (window as any).__GAME_STORE__.getState();
    const state = storeState.gameState;
    const report = (Object.values(state.reports) as any[]).at(-1);
    return {
      scoutPath: state.scout.careerPath,
      financePath: state.finances.careerPath,
      pendingListingReportId: storeState.pendingListingReportId,
      report,
    };
  });
  expect(submitted.report).toBeTruthy();
  expect(submitted).toMatchObject({
    scoutPath: "independent", financePath: "independent",
    pendingListingReportId: submitted.report.id,
    report: { playerId: observed.playerId },
  });
  expect(submitted.report.recommendedAction).not.toBe("monitor");
  expect(submitted.report.evidenceAssessment.claims.some(
    (claim: any) => claim.support === "supported",
  )).toBe(true);
  await testInfo.attach("marketplace-submitted-supported-report.json", {
    body: JSON.stringify(submitted, null, 2), contentType: "application/json",
  });
}
