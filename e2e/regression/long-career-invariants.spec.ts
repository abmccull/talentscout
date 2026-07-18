import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test, expect } from "../fixtures";

const timingOutputPath = resolve(
  process.env.LONG_CAREER_TIMING_OUTPUT
    ?? "artifacts/soak/browser-ten-season-timing.json",
);
const progressOutputPath = timingOutputPath.replace(/\.json$/i, ".progress.json");
const requestedSeasonCount = Math.max(
  1,
  Number.parseInt(process.env.LONG_CAREER_SEASON_COUNT ?? "10", 10) || 10,
);

test.describe("Long-career world invariants", () => {
  test("youth world remains coherent across ten seasons", async ({ gamePage }) => {
    test.setTimeout(900_000);
    const recordedBatchTimings: unknown[] = [];
    await mkdir(dirname(progressOutputPath), { recursive: true });
    await writeFile(progressOutputPath, "[]\n", "utf8");
    await gamePage.page.exposeFunction(
      "__recordLongCareerBatch",
      async (timing: unknown) => {
        recordedBatchTimings.push(timing);
        await writeFile(
          progressOutputPath,
          `${JSON.stringify(recordedBatchTimings, null, 2)}\n`,
          "utf8",
        );
      },
    );
    await gamePage.goto();
    await gamePage.injectState({
      currentWeek: 1,
      currentSeason: 1,
      scout: {
        careerTier: 1,
        primarySpecialization: "youth",
        careerPath: "independent",
        firstName: "Soak",
        lastName: "Scout",
        fatigue: 10,
      },
    });

    const result = await gamePage.page.evaluate(async ({ seasonCount }) => {
      const store = (window as any).__GAME_STORE__;
      const initial = store.getState().gameState;
      const initialYouth = new Map(
        Object.values(initial.unsignedYouth).map((youth: any) => [
          youth.player.id,
          {
            currentAbility: youth.player.currentAbility,
            attributes: JSON.stringify(youth.player.attributes),
          },
        ]),
      );

      const MAX_BATCHES = 100;
      const batchTimings: Array<{
        startSeason: number;
        startWeek: number;
        endSeason: number;
        endWeek: number;
        weeksAdvanced: number;
        elapsedMs: number;
        workerTelemetry: Record<string, unknown> | null;
      }> = [];
      const seasonTimingBySeason = new Map<number, {
        batches: number;
        weeksAdvanced: number;
        elapsedMs: number;
        maxBatchMs: number;
      }>();
      let batchCount = 0;

      const advanceSafely = async (requestedWeeks: number) => {
        if (batchCount >= MAX_BATCHES) {
          const stalled = store.getState().gameState;
          throw new Error(
            `Long-career soak exceeded ${MAX_BATCHES} batches at S${stalled.currentSeason} W${stalled.currentWeek}`,
          );
        }
        const before = store.getState().gameState;
        if (before.scout.fatigue >= 90) {
          // This is an intentional fixture override, not a persistence test.
          // Calling loadGame here would structured-clone and migrate the whole
          // growing career every time fatigue is reset.
          store.setState({
            gameState: {
              ...before,
              scout: { ...before.scout, fatigue: 15 },
            },
          });
        }
        const ready = store.getState().gameState;
        const started = performance.now();
        await store.getState().batchAdvance(Math.min(8, Math.max(1, requestedWeeks)));
        const elapsedMs = performance.now() - started;
        const transactionState = store.getState();
        const after = transactionState.gameState;
        if (transactionState.weeklyTransactionError) {
          const depletedClubs = Object.values(after.clubs)
            .map((club: any) => ({
              id: club.id,
              senior: (club.playerIds ?? []).length,
              academy: (club.academyPlayerIds ?? []).length,
              loanedIn: (club.loanedInPlayerIds ?? []).length,
            }))
            .filter((club: any) => club.senior + club.academy + club.loanedIn < 11)
            .slice(0, 12);
          throw new Error(
            `Weekly transaction failed at S${ready.currentSeason} W${ready.currentWeek}: ${transactionState.weeklyTransactionError}; depleted clubs: ${JSON.stringify(depletedClubs)}`,
          );
        }
        const weeksAdvanced = Math.max(
          0,
          (after.totalWeeksPlayed ?? 0) - (ready.totalWeeksPlayed ?? 0),
        );
        const madeProgress = weeksAdvanced > 0
          || after.currentSeason !== ready.currentSeason
          || after.currentWeek !== ready.currentWeek;
        if (!madeProgress) {
          throw new Error(
            `Long-career batch made no progress at S${ready.currentSeason} W${ready.currentWeek} with fatigue ${ready.scout.fatigue}`,
          );
        }

        batchCount++;
        const timing = {
          startSeason: ready.currentSeason,
          startWeek: ready.currentWeek,
          endSeason: after.currentSeason,
          endWeek: after.currentWeek,
          weeksAdvanced,
          elapsedMs: Math.round(elapsedMs * 100) / 100,
          workerTelemetry: transactionState.lastWeeklyWorkerTelemetry
            ? {
                route: transactionState.lastWeeklyWorkerTelemetry.route,
                fallbackReason: transactionState.lastWeeklyWorkerTelemetry.fallbackReason,
                computeMs: transactionState.lastWeeklyWorkerTelemetry.computeMs,
                roundTripMs: transactionState.lastWeeklyWorkerTelemetry.roundTripMs,
                responseBytes: transactionState.lastWeeklyWorkerTelemetry.responseBytes,
                changedFieldCount: transactionState.lastWeeklyWorkerTelemetry.changedFieldCount,
                changedEntryCount: transactionState.lastWeeklyWorkerTelemetry.changedEntryCount,
                phaseTimings: transactionState.lastWeeklyWorkerTelemetry.phaseTimings,
                payloadHotspots: transactionState.lastWeeklyWorkerTelemetry.payloadHotspots,
              }
            : null,
        };
        batchTimings.push(timing);
        await (window as any).__recordLongCareerBatch(timing);
        const seasonTiming = seasonTimingBySeason.get(ready.currentSeason) ?? {
          batches: 0,
          weeksAdvanced: 0,
          elapsedMs: 0,
          maxBatchMs: 0,
        };
        seasonTiming.batches++;
        seasonTiming.weeksAdvanced += weeksAdvanced;
        seasonTiming.elapsedMs += elapsedMs;
        seasonTiming.maxBatchMs = Math.max(seasonTiming.maxBatchMs, elapsedMs);
        seasonTimingBySeason.set(ready.currentSeason, seasonTiming);
        return after;
      };

      const developmentTargetWeeks = (initial.totalWeeksPlayed ?? 0) + 30;
      while ((store.getState().gameState.totalWeeksPlayed ?? 0) < developmentTargetWeeks) {
        const remaining = developmentTargetWeeks
          - (store.getState().gameState.totalWeeksPlayed ?? 0);
        await advanceSafely(Math.min(8, remaining));
      }
      const afterThirtyWeeks = store.getState().gameState;
      const developedUnsignedYouth = Object.values(afterThirtyWeeks.unsignedYouth).filter(
        (youth: any) => {
          const before = initialYouth.get(youth.player.id) as any;
          return before && (
            before.currentAbility !== youth.player.currentAbility
            || before.attributes !== JSON.stringify(youth.player.attributes)
          );
        },
      ).length;

      const targetSeason = initial.currentSeason + seasonCount;
      while (store.getState().gameState.currentSeason < targetSeason) {
        await advanceSafely(8);
      }

      const state = store.getState().gameState;
      const rosterErrors: string[] = [];
      for (const club of Object.values(state.clubs) as any[]) {
        const senior = club.playerIds ?? [];
        const academy = club.academyPlayerIds ?? [];
        if (new Set(senior).size !== senior.length) rosterErrors.push(`${club.id}:duplicate-senior`);
        if (new Set(academy).size !== academy.length) rosterErrors.push(`${club.id}:duplicate-academy`);
        for (const playerId of senior) {
          const player = state.players[playerId];
          if (!player) rosterErrors.push(`${club.id}:missing-senior:${playerId}`);
          else if (player.clubId !== club.id) rosterErrors.push(`${club.id}:wrong-senior:${playerId}`);
          if (academy.includes(playerId)) rosterErrors.push(`${club.id}:dual-roster:${playerId}`);
        }
        for (const playerId of academy) {
          const player = state.players[playerId];
          if (!player) rosterErrors.push(`${club.id}:missing-academy:${playerId}`);
          else if (player.clubId !== club.id) rosterErrors.push(`${club.id}:wrong-academy:${playerId}`);
          else if (player.age >= 18) rosterErrors.push(`${club.id}:unpromoted:${playerId}`);
        }
      }

      const unsignedYouthErrors = Object.values(state.unsignedYouth).filter((youth: any) =>
        youth.player.currentAbility > youth.player.potentialAbility
        || Object.values(youth.player.attributes).some(
          (value: any) => value < 1 || value > 20,
        ),
      ).length;

      const lifecycleErrors: string[] = [];
      const activeLoanPlayerIds = new Set<string>();
      for (const deal of state.activeLoans ?? []) {
        if (activeLoanPlayerIds.has(deal.playerId)) lifecycleErrors.push(`duplicate-active-loan:${deal.playerId}`);
        activeLoanPlayerIds.add(deal.playerId);
        const player = state.players[deal.playerId];
        if (!player) lifecycleErrors.push(`loan-missing-player:${deal.id}`);
        else {
          if (!player.onLoan) lifecycleErrors.push(`loan-flag-missing:${deal.id}`);
          if (player.clubId !== deal.loanClubId) lifecycleErrors.push(`loan-registration:${deal.id}`);
          if (player.contractClubId !== deal.parentClubId) lifecycleErrors.push(`loan-owner:${deal.id}`);
        }
        if (!state.clubs[deal.parentClubId]?.loanedOutPlayerIds?.includes(deal.playerId)) {
          lifecycleErrors.push(`loan-parent-roster:${deal.id}`);
        }
        if (!state.clubs[deal.loanClubId]?.loanedInPlayerIds?.includes(deal.playerId)) {
          lifecycleErrors.push(`loan-host-roster:${deal.id}`);
        }
      }
      const poolPlayerIds = new Set((state.freeAgentPool?.agents ?? []).map((agent: any) => agent.playerId));
      for (const [playerId, player] of Object.entries(state.players) as Array<[string, any]>) {
        const owner = player.contractClubId ?? player.loanParentClubId ?? player.clubId;
        if (!Number.isFinite(player.marketValue) || player.marketValue < 0) {
          lifecycleErrors.push(`invalid-market-value:${playerId}`);
        }
        if (!owner) {
          if (!poolPlayerIds.has(playerId)) lifecycleErrors.push(`unowned-not-in-pool:${playerId}`);
        } else if (!state.clubs[owner]) {
          lifecycleErrors.push(`missing-contract-club:${playerId}`);
        } else if (!player.onLoan && player.clubId !== owner) {
          lifecycleErrors.push(`owner-registration-mismatch:${playerId}`);
        }
      }
      for (const agent of state.freeAgentPool?.agents ?? []) {
        const player = state.players[agent.playerId];
        if (!player) lifecycleErrors.push(`pool-missing-player:${agent.playerId}`);
        else if (player.clubId || player.contractClubId) lifecycleErrors.push(`pool-dual-owner:${agent.playerId}`);
        if (agent.status !== "available" && agent.status !== "inNegotiation") {
          lifecycleErrors.push(`stale-pool-status:${agent.playerId}:${agent.status}`);
        }
      }
      if (new Set(state.retiredPlayerIds ?? []).size !== (state.retiredPlayerIds ?? []).length) {
        lifecycleErrors.push("duplicate-retired-id");
      }
      for (const playerId of state.retiredPlayerIds ?? []) {
        if (state.players[playerId]) lifecycleErrors.push(`retired-still-active:${playerId}`);
        if (!state.retiredPlayers?.[playerId]) lifecycleErrors.push(`retired-not-archived:${playerId}`);
        if (poolPlayerIds.has(playerId)) lifecycleErrors.push(`retired-in-pool:${playerId}`);
      }
      const loanHistoryIds = (state.loanHistory ?? []).map((deal: any) => deal.id);
      if (new Set(loanHistoryIds).size !== loanHistoryIds.length) {
        lifecycleErrors.push("duplicate-loan-history");
      }

      const academyCaseErrors: string[] = [];
      const briefs = Object.values(state.youthRecruitmentBriefs ?? {}) as any[];
      const openBriefs = briefs.filter((brief) => brief.status === "open");
      const globalOpportunityMultiplier = Math.max(
        0.6,
        Math.min(
          1.75,
          (state.worldConditionState?.active ?? [])
            .filter((condition: any) => condition.scope === "global")
            .reduce(
              (multiplier: number, condition: any) =>
                multiplier * condition.modifiers.opportunityMultiplier,
              1,
            ),
        ),
      );
      const maximumOpenBriefs = Math.max(
        6,
        Math.round(12 * globalOpportunityMultiplier),
      );
      if (openBriefs.length > maximumOpenBriefs) {
        academyCaseErrors.push(
          `too-many-open-briefs:${openBriefs.length}:limit-${maximumOpenBriefs}`,
        );
      }
      for (const brief of briefs) {
        if (!Number.isFinite(brief.competitionPressure) || brief.competitionPressure < 0 || brief.competitionPressure > 100) {
          academyCaseErrors.push(`invalid-brief-pressure:${brief.id}`);
        }
        if (!Array.isArray(brief.requiredPositions) || brief.requiredPositions.length === 0) {
          academyCaseErrors.push(`missing-brief-position:${brief.id}`);
        }
        if (brief.status === "fulfilled" && !brief.fulfilledByPlayerId) {
          academyCaseErrors.push(`unlinked-fulfilled-brief:${brief.id}`);
        }
      }
      const reviewIds = Object.keys(state.recommendationReviews ?? {});
      if (new Set(reviewIds).size !== reviewIds.length) academyCaseErrors.push("duplicate-review-id");
      for (const review of Object.values(state.recommendationReviews ?? {}) as any[]) {
        if (!state.scoutingCases[review.caseId]) academyCaseErrors.push(`review-missing-case:${review.id}`);
        if (!state.reports[review.reportId]) academyCaseErrors.push(`review-missing-report:${review.id}`);
        if (
          review.status === "complete"
          && review.overallScore !== undefined
          && (review.overallScore < 0 || review.overallScore > 100)
        ) academyCaseErrors.push(`invalid-review-score:${review.id}`);
      }
      for (const decision of Object.values(state.clubDecisions ?? {}) as any[]) {
        if (!state.reportDeliveries[decision.deliveryId]) academyCaseErrors.push(`decision-missing-delivery:${decision.id}`);
        if (!state.scoutingCases[decision.caseId]) academyCaseErrors.push(`decision-missing-case:${decision.id}`);
      }
      for (const youth of Object.values(state.unsignedYouth) as any[]) {
        if (youth.placed || youth.retired) {
          academyCaseErrors.push(`resolved-youth-in-active-pool:${youth.id}`);
        }
        const completedSeasons = Math.max(0, state.currentSeason - youth.generatedSeason);
        if (completedSeasons >= 4) {
          academyCaseErrors.push(
            `expired-youth-in-active-pool:${youth.id}:completed-seasons:${completedSeasons}`,
          );
        }
      }
      for (const placement of Object.values(state.placementReports ?? {}) as any[]) {
        if (state.unsignedYouth[placement.unsignedYouthId]) continue;
        const playerId = (placement.reportId && state.reports[placement.reportId]?.playerId)
          || (placement.caseId && state.scoutingCases[placement.caseId]?.playerId)
          || (state.alumniRecords ?? []).find(
            (record: any) => record.placementReportId === placement.id,
          )?.playerId
          || placement.unsignedYouthId;
        if (!state.players[playerId] && !state.retiredPlayers?.[playerId]) {
          academyCaseErrors.push(`placement-unresolvable-player:${placement.id}:${playerId}`);
        }
      }

      const consequenceErrors: string[] = [];
      const consequenceState = state.consequenceState ?? {};
      const decisions = Object.values(consequenceState.decisions ?? {}) as any[];
      const callbacks = Object.values(consequenceState.callbacks ?? {}) as any[];
      const terminalDecisionCount = decisions.filter(
        (decision) => decision.status === "resolved" || decision.status === "expired",
      ).length;
      if (terminalDecisionCount > 512) {
        consequenceErrors.push(`unbounded-terminal-decisions:${terminalDecisionCount}`);
      }
      if ((consequenceState.history ?? []).length > 512) {
        consequenceErrors.push(`unbounded-consequence-history:${consequenceState.history.length}`);
      }
      for (const callback of callbacks) {
        const due = callback.dueAt.season < state.currentSeason
          || (callback.dueAt.season === state.currentSeason && callback.dueAt.week <= state.currentWeek);
        if (callback.status === "pending" && due) {
          consequenceErrors.push(`overdue-callback:${callback.id}`);
        }
      }
      for (const obligation of Object.values(consequenceState.obligations ?? {}) as any[]) {
        if (!obligation.dueAt || obligation.status !== "active") continue;
        const overdue = obligation.dueAt.season < state.currentSeason
          || (obligation.dueAt.season === state.currentSeason && obligation.dueAt.week < state.currentWeek);
        if (overdue) consequenceErrors.push(`overdue-obligation:${obligation.id}`);
      }
      const consequenceBytes = JSON.stringify(consequenceState).length;
      if (consequenceBytes > 2_000_000) {
        consequenceErrors.push(`consequence-state-too-large:${consequenceBytes}`);
      }

      const identityErrors: string[] = [];
      const employeeIds = (state.finances?.employees ?? []).map((employee: any) => employee.id);
      const assistantIds = (state.assistantScouts ?? []).map((assistant: any) => assistant.id);
      const officeIds = (state.finances?.satelliteOffices ?? []).map((office: any) => office.id);
      if (new Set(employeeIds).size !== employeeIds.length) identityErrors.push("duplicate-employee-id");
      if (new Set(assistantIds).size !== assistantIds.length) identityErrors.push("duplicate-assistant-id");
      if (new Set(officeIds).size !== officeIds.length) identityErrors.push("duplicate-office-id");

      const directorErrors: string[] = [];
      if (state.eventDirector.tension < 0 || state.eventDirector.tension > 100) {
        directorErrors.push(`invalid-tension:${state.eventDirector.tension}`);
      }
      if (state.eventDirector.recentEventTypes.length > 8) {
        directorErrors.push(`unbounded-recent-events:${state.eventDirector.recentEventTypes.length}`);
      }
      if (state.runManifest.worldTraitIds.length !== 3) {
        directorErrors.push(`invalid-world-trait-count:${state.runManifest.worldTraitIds.length}`);
      }

      return {
        reachedSeason: state.currentSeason,
        targetSeason,
        developedUnsignedYouth,
        rosterErrors,
        unsignedYouthErrors,
        lifecycleErrors,
        academyCaseErrors,
        consequenceErrors,
        consequenceBytes,
        identityErrors,
        directorErrors,
        openBriefCount: openBriefs.length,
        maximumOpenBriefs,
        historicalBriefCount: briefs.length,
        subRegionCount: Object.keys(state.subRegions ?? {}).length,
        familiarSubRegionCount: Object.values(state.subRegions ?? {}).filter(
          (subRegion: any) => subRegion.familiarity > 0,
        ).length,
        specializationLevel: state.scout.specializationLevel,
        specializationXp: state.scout.specializationXp,
        batchCount,
        batchTimings,
        seasonTimings: [...seasonTimingBySeason.entries()]
          .sort(([left], [right]) => left - right)
          .map(([season, timing]) => ({
            season,
            batches: timing.batches,
            weeksAdvanced: timing.weeksAdvanced,
            elapsedMs: Math.round(timing.elapsedMs * 100) / 100,
            maxBatchMs: Math.round(timing.maxBatchMs * 100) / 100,
          })),
      };
    }, { seasonCount: requestedSeasonCount });

    const timingEvidence = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      profile: `browser-every-week-${requestedSeasonCount}-season`,
      reachedSeason: result.reachedSeason,
      targetSeason: result.targetSeason,
      batchCount: result.batchCount,
      openBriefCount: result.openBriefCount,
      maximumOpenBriefs: result.maximumOpenBriefs,
      seasonTimings: result.seasonTimings,
      batchTimings: result.batchTimings,
    };
    const serializedTimingEvidence = `${JSON.stringify(timingEvidence, null, 2)}\n`;
    await mkdir(dirname(timingOutputPath), { recursive: true });
    await writeFile(timingOutputPath, serializedTimingEvidence, "utf8");
    process.stdout.write(
      `[long-career-soak] ${result.batchCount} batches reached S${result.reachedSeason}; timing: ${timingOutputPath}\n`,
    );
    await test.info().attach("ten-season-soak-timings", {
      body: serializedTimingEvidence,
      contentType: "application/json",
    });

    expect(result.developedUnsignedYouth).toBeGreaterThan(0);
    expect(result.reachedSeason).toBeGreaterThanOrEqual(result.targetSeason);
    expect(result.batchCount).toBeLessThanOrEqual(100);
    expect(result.batchTimings.every((timing) => timing.weeksAdvanced > 0)).toBe(true);
    expect(result.rosterErrors).toEqual([]);
    expect(result.unsignedYouthErrors).toBe(0);
    expect(result.lifecycleErrors).toEqual([]);
    expect(result.academyCaseErrors).toEqual([]);
    expect(result.consequenceErrors).toEqual([]);
    expect(result.consequenceBytes).toBeLessThanOrEqual(2_000_000);
    expect(result.identityErrors).toEqual([]);
    expect(result.directorErrors).toEqual([]);
    expect(result.openBriefCount).toBeLessThanOrEqual(result.maximumOpenBriefs);
    expect(result.historicalBriefCount).toBeGreaterThan(0);
    expect(result.subRegionCount).toBeGreaterThan(0);
    expect(result.familiarSubRegionCount).toBeGreaterThan(0);
    expect(result.specializationLevel).toBeGreaterThan(1);
    expect(result.specializationXp).toBeGreaterThanOrEqual(0);
    gamePage.expectNoConsoleErrors();
  });
});
