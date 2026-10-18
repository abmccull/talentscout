import { describe, expect, it } from "vitest";

import type { GameState, ReportWorkItem } from "@/engine/core/types";
import { createWeekSchedule } from "@/engine/core/calendar";
import {
  DASHBOARD_OWNERSHIP_CONTRACT,
  buildDashboardWorkspaceModel,
  getYouthDeskRepresentedObjectiveKey,
  selectDashboardSupportingItems,
} from "@/components/game/dashboard/dashboardWorkspaceModel";

function createState(): GameState {
  return {
    currentWeek: 6,
    currentSeason: 1,
    fixtures: {},
    scout: { id: "scout-1" },
    schedule: createWeekSchedule(6, 1),
    inbox: [],
    consequenceState: { decisions: {}, history: [] },
    reportWorkItems: {},
    reports: {},
    scoutingCases: {},
    reportDeliveries: {},
    clubDecisions: {},
    placementReports: {},
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
    players: {
      "player-1": { id: "player-1", firstName: "Milo", lastName: "Hart" },
      "player-2": { id: "player-2", firstName: "Ari", lastName: "Cole" },
      "player-3": { id: "player-3", firstName: "Luca", lastName: "Vale" },
      "player-4": { id: "player-4", firstName: "Nico", lastName: "Ramos" },
      "player-5": { id: "player-5", firstName: "Joel", lastName: "Mata" },
      "player-6": { id: "player-6", firstName: "Rui", lastName: "Silva" },
    },
    retiredPlayers: {},
    unsignedYouth: {},
    contacts: {},
  } as unknown as GameState;
}

describe("dashboardWorkspaceModel", () => {
  it("keeps spare-day planning visible beside advancing an already booked follow-up", () => {
    const state = createState();
    state.schedule.activities[0] = {
      type: "followUpSession", slots: 1, targetId: "player-1", description: "Monday follow-up",
    };
    const model = buildDashboardWorkspaceModel({ gameState: state });
    expect(model.weekSummary.unallocatedDays).toBe(6);
    const represented = getYouthDeskRepresentedObjectiveKey("advance", 1, 6);
    expect(represented).toBeUndefined();
    const supporting = selectDashboardSupportingItems(model.visibleItems, represented);
    expect(supporting.some((item) => item.objectiveKey === "planner-gap:s1:w6")).toBe(true);
    expect(state.schedule.activities[0]?.targetId).toBe("player-1");
  });

  it("suppresses the same unplanned-week allocation only for an explicit Planner action", () => {
    const model = buildDashboardWorkspaceModel({ gameState: createState() });
    const represented = getYouthDeskRepresentedObjectiveKey("planner", 1, 6);
    expect(selectDashboardSupportingItems(model.visibleItems, represented)
      .some((item) => item.objectiveKey === "planner-gap:s1:w6")).toBe(false);
    expect(model.activeItemIds).toContain("dashboard-planner-gap-s1w6");
  });

  it("carries canonical objective identity into presentation without resolving the source item", () => {
    const state = createState();
    const model = buildDashboardWorkspaceModel({ gameState: state });
    const diary = model.visibleItems.find((item) => item.sourceSystem === "planner");
    expect(diary?.objectiveKey).toBe("planner-gap:s1:w6");
    expect(model.activeItemIds).toContain(diary?.id);
  });

  it("exports the dashboard ownership contract inline", () => {
    expect(DASHBOARD_OWNERSHIP_CONTRACT.owns).toContain("Prioritize information from existing systems.");
    expect(DASHBOARD_OWNERSHIP_CONTRACT.excludes).toContain("Recalculating simulation outcomes.");
    expect(Object.isFrozen(DASHBOARD_OWNERSHIP_CONTRACT)).toBe(true);
  });

  it("limits visible priorities to five and splits attention and opportunities", () => {
    const state = createState();
    state.reportWorkItems = {
      "report-work:1": {
        id: "report-work:1",
        playerId: "player-1",
        scoutId: "scout-1",
        createdWeek: 6,
        createdSeason: 1,
        status: "ready",
        sourceActivity: "writeReport",
        preparationQualityPoints: 4,
        preparationQualityBonus: 0.1,
        freshObservationIds: ["obs-1"],
      } satisfies ReportWorkItem,
      "report-work:2": {
        id: "report-work:2",
        playerId: "player-2",
        scoutId: "scout-1",
        createdWeek: 6,
        createdSeason: 1,
        status: "ready",
        sourceActivity: "writeReport",
        preparationQualityPoints: 4,
        preparationQualityBonus: 0.1,
        freshObservationIds: ["obs-2"],
      } satisfies ReportWorkItem,
      "report-work:3": {
        id: "report-work:3",
        playerId: "player-3",
        scoutId: "scout-1",
        createdWeek: 6,
        createdSeason: 1,
        status: "ready",
        sourceActivity: "writeReport",
        preparationQualityPoints: 4,
        preparationQualityBonus: 0.1,
        freshObservationIds: ["obs-3"],
      } satisfies ReportWorkItem,
      "report-work:4": {
        id: "report-work:4",
        playerId: "player-4",
        scoutId: "scout-1",
        createdWeek: 6,
        createdSeason: 1,
        status: "ready",
        sourceActivity: "writeReport",
        preparationQualityPoints: 4,
        preparationQualityBonus: 0.1,
        freshObservationIds: ["obs-4"],
      } satisfies ReportWorkItem,
      "report-work:5": {
        id: "report-work:5",
        playerId: "player-5",
        scoutId: "scout-1",
        createdWeek: 6,
        createdSeason: 1,
        status: "ready",
        sourceActivity: "writeReport",
        preparationQualityPoints: 4,
        preparationQualityBonus: 0.1,
        freshObservationIds: ["obs-5"],
      } satisfies ReportWorkItem,
      "report-work:6": {
        id: "report-work:6",
        playerId: "player-6",
        scoutId: "scout-1",
        createdWeek: 6,
        createdSeason: 1,
        status: "ready",
        sourceActivity: "writeReport",
        preparationQualityPoints: 4,
        preparationQualityBonus: 0.1,
        freshObservationIds: ["obs-6"],
      } satisfies ReportWorkItem,
    };
    state.rivalOrganizationState.opportunities = {
      "opp-1": {
        id: "opp-1",
        organizationId: "org-1",
        kind: "open-showcase",
        title: "Showcase access",
        description: "A narrow rival opening is live.",
        status: "open",
        createdWeek: 6,
        createdSeason: 1,
        expiresWeek: 7,
        expiresSeason: 1,
        outcomeRoll: 0.1,
        successChance: 0.5,
        knownTradeoffs: [],
      },
    };

    const workspace = buildDashboardWorkspaceModel({ gameState: state });

    expect(workspace.visibleItems).toHaveLength(5);
    expect(workspace.attention.length).toBeLessThanOrEqual(3);
    expect(workspace.opportunitiesAtRisk.length).toBeLessThanOrEqual(2);
    expect(workspace.nextAction?.id).toBe(workspace.visibleItems[0]?.id);
  });
});
