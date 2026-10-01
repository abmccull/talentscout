import { describe, expect, it } from "vitest";

import { createDashboardState } from "@/engine/dashboard/state";
import { createWeekSchedule } from "@/engine/core/calendar";
import type { GameState, ReportWorkItem } from "@/engine/core/types";
import { buildDashboardWorkspaceModel } from "@/components/game/dashboard/dashboardWorkspaceModel";

const DASHBOARD_MODEL_P95_BUDGET_MS = 40;

function largeState(): GameState {
  const workItems: Record<string, ReportWorkItem> = {};
  const players: GameState["players"] = {};
  for (let index = 0; index < 250; index += 1) {
    const playerId = `player-${index}`;
    players[playerId] = {
      id: playerId,
      firstName: "Player",
      lastName: String(index),
    } as GameState["players"][string];
    workItems[`work-${index}`] = {
      id: `work-${index}`,
      playerId,
      scoutId: "scout-1",
      createdWeek: 6,
      createdSeason: 1,
      status: "ready",
      sourceActivity: "writeReport",
      preparationQualityPoints: 4,
      preparationQualityBonus: 0.1,
      freshObservationIds: [`obs-${index}`],
    };
  }
  return {
    currentWeek: 6,
    currentSeason: 1,
    fixtures: {},
    scout: { id: "scout-1", careerTier: 2, careerPath: "club", primarySpecialization: "youth" },
    schedule: createWeekSchedule(6, 1),
    inbox: [],
    consequenceState: { decisions: {}, history: [] },
    reportWorkItems: workItems,
    reports: {},
    scoutingCases: {},
    reportDeliveries: {},
    clubDecisions: {},
    placementReports: {},
    recommendationReviews: {},
    youthRecruitmentBriefs: {},
    narrativeEvents: [],
    rivalScouts: {},
    rivalOrganizationState: {
      organizations: {},
      activities: [],
      opportunities: {},
      campaignState: { campaigns: {}, history: [], processedWeekKeys: [] },
      currentPressure: {
        discoveryChanceMultiplier: 1,
        poachChanceMultiplier: 1,
        signingChanceMultiplier: 1,
        youthProgressBonus: 0,
      },
      processedWeekKeys: [],
    },
    players,
    retiredPlayers: {},
    unsignedYouth: {},
    contacts: {},
    alumniRecords: [],
    finances: { transactions: [] },
  } as unknown as GameState;
}

describe("dashboard model performance", () => {
  it.each([false, true])("builds a long-save command model within the 40ms p95 budget (retained preferences: %s)", (retained) => {
    const state = largeState();
    if (retained) state.dashboardState = createDashboardState({
      itemDispositions: Object.fromEntries(Array.from({ length: 256 }, (_, index) => {
        const id = `prior-item-${index}`;
        return [id, { itemId: id, state: "viewed", changedWeek: 5, changedSeason: 1 }];
      })),
    });
    buildDashboardWorkspaceModel({ gameState: state });
    const samples = Array.from({ length: 25 }, () => {
      const started = performance.now();
      buildDashboardWorkspaceModel({ gameState: state });
      return performance.now() - started;
    }).sort((left, right) => left - right);
    const p95 = samples[Math.floor(samples.length * 0.95)] ?? Number.POSITIVE_INFINITY;
    console.info("DASHBOARD_MODEL_TIMING", { retained, p50: samples[12], p95 });
    expect(p95).toBeLessThan(DASHBOARD_MODEL_P95_BUDGET_MS);
  });
});
