import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/activeSaveProvider", () => ({
  getActiveSaveProvider: async () => ({ save: async () => undefined }),
  isSupabaseCloudSaveActive: async () => false,
}));

vi.mock("@/lib/db", () => ({
  AUTOSAVE_SLOT: 0,
  migrateSaveState: (state: unknown) => state,
  migrateFreeAgentGeography: () => undefined,
  db: {
    mods: { toArray: async () => [] },
    leaderboard: { put: async () => undefined, clear: async () => undefined },
  },
}));

describe("unsigned-youth population integrity", () => {
  it("does not manufacture country-wide prospect batches during ordinary weeks", async () => {
    const { useGameStore } = await import("@/stores/gameStore");
    await useGameStore.getState().startNewGame({
      scoutFirstName: "Pool",
      scoutLastName: "Invariant",
      scoutAge: 24,
      specialization: "youth",
      difficulty: "normal",
      worldSeed: "weekly-hot-path-diagnostic",
      selectedCountries: ["england"],
      startingCountry: "england",
      nationality: "English",
      skillAllocations: {
        technicalEye: 2,
        psychologicalRead: 2,
        playerJudgment: 2,
        potentialAssessment: 2,
      },
      originId: "academy-apprentice",
      flawId: "fragile-network",
      doctrineIds: ["evidence-first"],
    });
    const initial = useGameStore.getState().gameState!;
    const initialYouthIds = Object.keys(initial.unsignedYouth).sort();

    await useGameStore.getState().batchAdvance(8);

    const after = useGameStore.getState().gameState!;
    expect(after.currentSeason).toBe(initial.currentSeason);
    expect(after.currentWeek).toBe(9);
    expect(Object.keys(after.unsignedYouth).sort()).toEqual(initialYouthIds);
  }, 30_000);

  it("removes an aged-out prospect at rollover while preserving scout-linked history", async () => {
    const { useGameStore } = await import("@/stores/gameStore");
    const { createWeekSchedule } = await import("@/engine/core/calendar");
    const { getSeasonLength } = await import("@/engine/core/gameDate");
    await useGameStore.getState().startNewGame({
      scoutFirstName: "Archive",
      scoutLastName: "Invariant",
      scoutAge: 24,
      specialization: "youth",
      difficulty: "normal",
      worldSeed: "linked-youth-exit",
      selectedCountries: ["england"],
      startingCountry: "england",
      nationality: "English",
      skillAllocations: {
        technicalEye: 2,
        psychologicalRead: 2,
        playerJudgment: 2,
        potentialAssessment: 2,
      },
      originId: "academy-apprentice",
      flawId: "fragile-network",
      doctrineIds: ["evidence-first"],
    });
    const initial = useGameStore.getState().gameState!;
    const [youthId, youth] = Object.entries(initial.unsignedYouth)[0];
    const reportId = "report-linked-aged-out-youth";
    const finalWeek = getSeasonLength(initial.fixtures, initial.currentSeason);
    useGameStore.setState({
      gameState: {
        ...initial,
        currentWeek: finalWeek,
        scout: { ...initial.scout, fatigue: 0 },
        schedule: createWeekSchedule(finalWeek, initial.currentSeason),
        unsignedYouth: {
          ...initial.unsignedYouth,
          [youthId]: {
            ...youth,
            player: { ...youth.player, age: 18 },
            generatedSeason: initial.currentSeason,
            placed: false,
            retired: false,
          },
        },
        reports: {
          ...initial.reports,
          [reportId]: {
            id: reportId,
            playerId: youth.player.id,
            scoutId: initial.scout.id,
            submittedWeek: finalWeek,
            submittedSeason: initial.currentSeason,
            attributeAssessments: [],
            strengths: ["Worth remembering"],
            weaknesses: ["Pathway closed"],
            conviction: "note",
            summary: "A linked historical assessment.",
            estimatedValue: 0,
            qualityScore: 10,
          },
        },
      },
    });

    await useGameStore.getState().batchAdvance(1);

    const after = useGameStore.getState().gameState!;
    expect(after.currentSeason).toBe(initial.currentSeason + 1);
    expect(after.unsignedYouth[youthId]).toBeUndefined();
    expect(after.players[youth.player.id]).toBeUndefined();
    expect(after.retiredPlayers[youth.player.id]).toMatchObject({
      id: youth.player.id,
      firstName: youth.player.firstName,
      lastName: youth.player.lastName,
    });
    expect(after.retiredPlayerIds).toContain(youth.player.id);
    expect(after.reports[reportId].playerId).toBe(youth.player.id);
    expect(after.playerMovementHistory).toContainEqual(expect.objectContaining({
      playerId: youth.player.id,
      type: "footballExit",
    }));
  }, 45_000);

  it("removes an accepted placement from the opportunity pool after its signing commits", async () => {
    const { useGameStore } = await import("@/stores/gameStore");
    await useGameStore.getState().startNewGame({
      scoutFirstName: "Placement",
      scoutLastName: "Invariant",
      scoutAge: 24,
      specialization: "youth",
      difficulty: "normal",
      worldSeed: "accepted-placement-cleanup",
      selectedCountries: ["england"],
      startingCountry: "england",
      nationality: "English",
      skillAllocations: {
        technicalEye: 2,
        psychologicalRead: 2,
        playerJudgment: 2,
        potentialAssessment: 2,
      },
      originId: "academy-apprentice",
      flawId: "fragile-network",
      doctrineIds: ["evidence-first"],
    });
    const initial = useGameStore.getState().gameState!;
    const [youthId, youth] = Object.entries(initial.unsignedYouth)[0];
    const targetClub = Object.values(initial.clubs)[0];
    const reportId = "report-accepted-placement";
    const caseId = "case-accepted-placement";
    const placementId = "placement-accepted-placement";
    const deliveryId = "delivery-accepted-placement";
    useGameStore.setState({
      gameState: {
        ...initial,
        scout: { ...initial.scout, fatigue: 0 },
        reports: {
          ...initial.reports,
          [reportId]: {
            id: reportId,
            caseId,
            playerId: youth.player.id,
            scoutId: initial.scout.id,
            submittedWeek: initial.currentWeek,
            submittedSeason: initial.currentSeason,
            attributeAssessments: [],
            strengths: ["Outstanding upside"],
            weaknesses: ["Needs a pathway"],
            conviction: "tablePound",
            summary: "A decisive placement recommendation.",
            estimatedValue: 0,
            qualityScore: 100,
          },
        },
        scoutingCases: {
          ...initial.scoutingCases,
          [caseId]: {
            id: caseId,
            playerId: youth.player.id,
            scoutId: initial.scout.id,
            openedWeek: initial.currentWeek,
            openedSeason: initial.currentSeason,
            lastUpdatedWeek: initial.currentWeek,
            lastUpdatedSeason: initial.currentSeason,
            status: "delivered",
            activeReportId: reportId,
            reportIds: [reportId],
            listingIds: [],
            deliveryIds: [deliveryId],
            decisionIds: [],
            placementReportIds: [placementId],
          },
        },
        reportDeliveries: {
          ...initial.reportDeliveries,
          [deliveryId]: {
            id: deliveryId,
            caseId,
            reportId,
            clubId: targetClub.id,
            channel: "directPlacement",
            status: "awaitingDecision",
            deliveredWeek: initial.currentWeek,
            deliveredSeason: initial.currentSeason,
            placementReportId: placementId,
          },
        },
        placementReports: {
          ...initial.placementReports,
          [placementId]: {
            id: placementId,
            reportId,
            caseId,
            deliveryId,
            unsignedYouthId: youthId,
            targetClubId: targetClub.id,
            scoutId: initial.scout.id,
            conviction: "tablePound",
            clubResponse: "pending",
            qualityScore: 100,
            week: initial.currentWeek,
            season: initial.currentSeason,
            responseDueWeek: initial.currentWeek,
            responseDueSeason: initial.currentSeason,
          },
        },
      },
    });

    await useGameStore.getState().batchAdvance(1);

    const after = useGameStore.getState().gameState!;
    expect(after.placementReports[placementId].clubResponse).toBe("accepted");
    expect(after.unsignedYouth[youthId]).toBeUndefined();
    expect(after.players[youth.player.id]).toMatchObject({
      id: youth.player.id,
      clubId: targetClub.id,
      contractClubId: targetClub.id,
    });
    expect(after.playerMovementHistory).toContainEqual(expect.objectContaining({
      playerId: youth.player.id,
      type: "youthSigning",
      toClubId: targetClub.id,
    }));
    expect(after.alumniRecords).toContainEqual(expect.objectContaining({
      playerId: youth.player.id,
      placementReportId: placementId,
    }));
  }, 45_000);
});
