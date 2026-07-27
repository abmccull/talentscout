import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { GameState } from "@/engine/core/types";
import { findUnpartitionedGameStateKeys } from "@/engine/core/gameStatePartitions";
import { initializeFinances } from "@/engine/finance";
import { migrateSaveState } from "@/lib/db";
import {
  compactWeeklyWorkerCommit,
  materializeWeeklyWorkerCommit,
} from "@/stores/actions/weeklyHeadlessTransaction";
import {
  createWeeklyWorkerWireState,
  materializeWeeklyWorkerWireState,
} from "@/stores/actions/weeklyWorkerSync";
import type { WeeklyWorkerInput } from "@/stores/actions/weeklyWorkerTypes";

const goldenV0Path = fileURLToPath(
  new URL("../fixtures/saves/v0-save-record.json", import.meta.url),
);

function migratedCombinedState(): GameState {
  const record = JSON.parse(readFileSync(goldenV0Path, "utf8")) as {
    state: Record<string, unknown>;
  };
  const baseline = migrateSaveState(record.state);
  const finances = initializeFinances(
    baseline.scout,
    baseline.scout.careerPath,
    baseline.difficulty,
  );

  const countryId = Object.keys(baseline.regionalKnowledge)[0] ?? "england";
  const leagueId = Object.keys(baseline.leagues)[0] ?? "legacy-league";
  const clubId = Object.keys(baseline.clubs)[0] ?? "legacy-club";
  const rivalId = Object.keys(baseline.rivalScouts)[0] ?? "legacy-rival";
  const organizationId = Object.keys(
    baseline.rivalOrganizationState.organizations,
  )[0] ?? "legacy-organization";

  return {
    ...baseline,
    accessAgreements: {
      ...(baseline.accessAgreements ?? {}),
      "access:integration": {
        id: "access:integration",
        grantor: { kind: "contact", id: "contact-integration" },
        beneficiary: { kind: "scout", id: baseline.scout.id },
        scope: "regionalIntro",
        status: "active",
        exclusive: false,
        confidential: true,
        createdAt: { season: 2, week: 7 },
        expiresAt: { season: 2, week: 10 },
        countryId,
      },
    },
    finances: {
      ...finances,
      transactions: [
        ...finances.transactions,
        {
          week: 7,
          season: 2,
          amount: 0,
          description: "Legacy weekly operating posture",
          referenceId: "agency-posture:qualityFirst:s2w7",
        },
      ],
      agencyStrategyState: {
        policy: "regionalDepth",
        selectedAt: { season: 2, week: 7 },
        lockedUntil: { season: 2, week: 11 },
        focusRegionId: countryId,
      },
    },
    rivalOrganizationState: {
      ...baseline.rivalOrganizationState,
      campaignState: {
        campaigns: {},
        history: [{
          id: "campaign-integration",
          organizationId,
          leadRivalId: rivalId,
          kind: "territoryLock",
          targetKind: "territory",
          targetLabel: countryId,
          status: "resolved",
          resolution: "success",
          createdAt: { season: 2, week: 6 },
          resolvedAt: { season: 2, week: 7 },
        }],
        processedWeekKeys: ["s2:w7"],
      },
    },
    clubPhilosophyTransitionState: {
      version: 1,
      activeSeason: 2,
      history: [{
        id: `club-philosophy:s2:${clubId}`,
        clubId,
        season: 2,
        leagueId,
        countryId,
        fromPhilosophy: "winNow",
        toPhilosophy: "marketSmart",
        worldConditionNames: [],
        reasonCodes: ["budgetPressure"],
        reasons: ["The recruitment mandate changed after a constrained season."],
      }],
    },
    regionalKnowledge: {
      ...baseline.regionalKnowledge,
      [countryId]: {
        ...baseline.regionalKnowledge[countryId],
        maintenanceState: {
          lastProcessedSeason: 2,
          lastProcessedWeek: 7,
          neglectedWeeks: 2,
        },
      },
    },
  };
}

function workerInput(gameState: GameState): WeeklyWorkerInput {
  return {
    gameState,
    weekSimulation: { currentDay: 7 } as WeeklyWorkerInput["weekSimulation"],
    currentScreen: "weekSimulation",
    isLoaded: true,
    tutorial: {
      completedSequences: [],
      visitedScreens: [],
      dismissedHints: [],
      discoveredFeatures: [],
    },
  };
}

describe("combined scouting-ecology persistence", () => {
  it("keeps every new authority through canonical, repeated save migration", () => {
    const source = migratedCombinedState();
    const clubId = Object.keys(source.clubs)[0] ?? "legacy-club";
    if (!source.clubs[clubId]) {
      source.clubs[clubId] = {
        id: clubId,
        name: "Legacy Club",
        shortName: "LEG",
        leagueId: "legacy-league",
        reputation: 48,
        budget: 1_500_000,
        scoutingPhilosophy: "academyFirst",
        managerId: "legacy-manager",
        playerIds: [],
        academyPlayerIds: [],
        youthAcademyRating: 11,
      } as GameState["clubs"][string];
    }
    source.youthRecruitmentBriefs = {
      ...source.youthRecruitmentBriefs,
      "legacy-brief": {
        id: "legacy-brief",
        clubId,
        type: "academyPlacement",
        createdWeek: 7,
        createdSeason: 2,
        expiresWeek: 14,
        expiresSeason: 2,
        requiredPositions: ["CM"],
        developmentPriority: "highCeiling",
        maxAge: 17,
        riskTolerance: "medium",
        weeklyWageBudget: 1200,
        competitionPressure: 42,
        status: "open",
      },
    };
    const historicalTransition = source.clubPhilosophyTransitionState?.history.find(
      (record) => record.clubId === clubId
        && record.season === source.youthRecruitmentBriefs["legacy-brief"].createdSeason,
    );
    if (!historicalTransition) {
      throw new Error("The persistence fixture must include dated club doctrine lineage");
    }
    source.placementReports = {
      ...source.placementReports,
      "legacy-placement": {
        id: "legacy-placement",
        reportId: "legacy-report",
        caseId: "legacy-case",
        briefId: "legacy-brief",
        unsignedYouthId: "legacy-youth",
        targetClubId: clubId,
        scoutId: source.scout.id,
        conviction: "recommend",
        clubResponse: "accepted",
        qualityScore: 74,
        week: 8,
        season: 2,
      },
    };
    source.clubDecisions = {
      ...source.clubDecisions,
      "legacy-decision": {
        id: "legacy-decision",
        caseId: "legacy-case",
        deliveryId: "legacy-delivery",
        clubId,
        outcome: "accepted",
        decidedWeek: 9,
        decidedSeason: 2,
        placementReportId: "legacy-placement",
      },
    };
    source.recommendationReviews = {
      ...source.recommendationReviews,
      "legacy-review": {
        id: "legacy-review",
        caseId: "legacy-case",
        reportId: "legacy-report",
        playerId: "legacy-player",
        clubId,
        checkpoint: "oneSeason",
        dueWeek: 8,
        dueSeason: 3,
        status: "scheduled",
      },
    };
    const first = migrateSaveState(source);
    const replay = migrateSaveState(first);

    expect(replay).toEqual(first);
    expect(first.accessAgreements?.["access:integration"]?.status).toBe("active");
    expect(first.finances?.agencyStrategyState).toMatchObject({
      policy: "regionalDepth",
      focusRegionId: expect.any(String),
    });
    expect(first.finances?.transactions.some(
      (entry) => entry.referenceId === "agency-posture:qualityFirst:s2w7",
    )).toBe(true);
    expect(first.rivalOrganizationState.campaignState.history).toEqual([
      expect.objectContaining({ id: "campaign-integration" }),
    ]);
    expect(first.clubPhilosophyTransitionState?.history).toEqual([
      expect.objectContaining({ id: expect.stringContaining("club-philosophy:s2:") }),
    ]);
    expect(first.youthRecruitmentBriefs["legacy-brief"].recruitmentSnapshot).toMatchObject({
      clubId,
      family: historicalTransition.toPhilosophy,
      capturedWeek: 7,
      capturedSeason: 2,
    });
    expect(first.placementReports["legacy-placement"].recruitmentSnapshot)
      .toEqual(first.youthRecruitmentBriefs["legacy-brief"].recruitmentSnapshot);
    expect(first.clubDecisions["legacy-decision"].recruitmentSnapshot)
      .toEqual(first.placementReports["legacy-placement"].recruitmentSnapshot);
    expect(first.recommendationReviews["legacy-review"].recruitmentSnapshot)
      .toEqual(first.placementReports["legacy-placement"].recruitmentSnapshot);
    expect(Object.values(first.regionalKnowledge)[0]?.maintenanceState).toEqual({
      lastProcessedSeason: 2,
      lastProcessedWeek: 7,
      neglectedWeeks: 2,
    });
    expect(findUnpartitionedGameStateKeys(first)).toEqual([]);
  });

  it("does not drop nested or top-level ecology state in worker sync or commit deltas", () => {
    const source = migratedCombinedState();
    const next = structuredClone(source);
    next.accessAgreements!["access:integration"].status = "consumed";
    next.finances!.agencyStrategyState!.lastAppliedAt = { season: 2, week: 8 };
    next.rivalOrganizationState.campaignState.processedWeekKeys.push("s2:w8");
    next.clubPhilosophyTransitionState!.activeSeason = 3;
    Object.values(next.regionalKnowledge)[0].maintenanceState = {
      lastProcessedSeason: 2,
      lastProcessedWeek: 8,
      neglectedWeeks: 3,
    };

    const wire = createWeeklyWorkerWireState(source, workerInput(next));
    expect(wire.kind).toBe("patch");
    expect(materializeWeeklyWorkerWireState(source, wire).gameState).toEqual(next);

    const compact = compactWeeklyWorkerCommit(source, {
      patch: { gameState: next },
      tutorialCommands: [],
    }, 1);
    expect(materializeWeeklyWorkerCommit(source, compact).patch.gameState).toEqual(next);
  });
});
