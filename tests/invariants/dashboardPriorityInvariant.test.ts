import { describe, expect, it, vi } from "vitest";

import { createWeekSchedule } from "@/engine/core/calendar";
import type {
  GameState,
  InboxMessage,
  NarrativeEvent,
  NewGameConfig,
  QuickScoutPriorities,
  ReportWorkItem,
} from "@/engine/core/types";
import type { DecisionRecord } from "@/engine/consequences/types";
import {
  buildDashboardPriorityCandidates,
} from "@/components/game/dashboard/dashboardPriorityModel";
import {
  buildDashboardWorkspaceModel,
} from "@/components/game/dashboard/dashboardWorkspaceModel";
import { isGameScreenAllowedForBuild } from "@/stores/gameScreenScope";

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

function createBaseState(): GameState {
  return {
    currentWeek: 6,
    currentSeason: 1,
    fixtures: {},
    scout: { id: "scout-1" },
    schedule: createWeekSchedule(6, 1),
    inbox: [],
    consequenceState: {
      decisions: {},
      history: [],
    },
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
      campaignState: {
        campaigns: {},
        history: [],
        processedWeekKeys: [],
      },
      currentPressure: {
        discoveryChanceMultiplier: 1,
        poachChanceMultiplier: 1,
        signingChanceMultiplier: 1,
        youthProgressBonus: 0,
      },
      processedWeekKeys: [],
    },
    players: Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => {
        const number = index + 1;
        return [
          `player-${number}`,
          {
            id: `player-${number}`,
            firstName: `Player`,
            lastName: `${number}`,
          },
        ];
      }),
    ),
    retiredPlayers: {},
    unsignedYouth: {},
    contacts: {},
    jobOffers: [],
    managerDirectives: [],
    seasonEvents: [],
    internationalAssignments: [],
    activeInternationalAssignment: undefined,
    activeNegotiations: [],
    freeAgentNegotiations: [],
  } as unknown as GameState;
}

function createReportWorkItem(number: number): ReportWorkItem {
  return {
    id: `report-work:scout-1:player-${number}`,
    playerId: `player-${number}`,
    scoutId: "scout-1",
    createdWeek: 6,
    createdSeason: 1,
    status: "ready",
    sourceActivity: "writeReport",
    preparationQualityPoints: 4,
    preparationQualityBonus: 0.1,
    freshObservationIds: [`observation-${number}`],
  };
}

function createInboxAction(
  input: Pick<InboxMessage, "id" | "title" | "body" | "relatedId" | "relatedEntityType">,
): InboxMessage {
  return {
    ...input,
    week: 6,
    season: 1,
    type: "feedback",
    read: false,
    actionRequired: true,
  };
}

const INVARIANT_PRIORITIES: QuickScoutPriorities = {
  targetPlayerIds: [],
  trainWeakSkills: true,
  maintainContacts: true,
  writeReports: true,
};

const INVARIANT_CONFIG: Omit<NewGameConfig, "worldSeed"> = {
  scoutFirstName: "Dashboard",
  scoutLastName: "Invariant",
  scoutAge: 24,
  specialization: "youth",
  difficulty: "normal",
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
};

function normalizeDashboardProjection(gameState: GameState) {
  return buildDashboardPriorityCandidates({
    gameState,
    maxItems: 100,
  }).map((item) => ({
    canonicalKey: item.canonicalKey,
    category: item.category,
    severity: item.severity,
    title: item.title,
    sourceSystem: item.sourceSystem,
    collector: item.collector,
    actionLabel: item.actionLabel,
    actionTarget: item.actionTarget,
    relatedEntityIds: [...item.relatedEntityIds].sort(),
    deadlineWeek: item.deadlineWeek ?? null,
    deadlineSeason: item.deadlineSeason ?? null,
    dueInWeeks: item.dueInWeeks ?? null,
    scoreBreakdown: item.scoreBreakdown.map(({ factor, score }) => ({
      factor,
      score,
    })),
  }));
}

async function runCommittedWeek(path: "manual" | "batch") {
  vi.resetModules();
  const { useGameStore } = await import("@/stores/gameStore");

  await useGameStore.getState().startNewGame({
    ...INVARIANT_CONFIG,
    worldSeed: "dashboard-priority-weekly-equivalence",
  });

  const initial = useGameStore.getState().gameState;
  expect(initial).toBeTruthy();

  if (path === "manual") {
    useGameStore.getState().autoSchedule(INVARIANT_PRIORITIES);
    useGameStore.getState().startWeekSimulation();
    expect(useGameStore.getState().weekSimulation).toBeTruthy();

    for (let day = 0; day < 7 && useGameStore.getState().weekSimulation; day += 1) {
      await useGameStore.getState().advanceDay();
    }
  } else {
    await useGameStore.getState().batchAdvance(1, INVARIANT_PRIORITIES);
  }

  const committed = useGameStore.getState().gameState;
  expect(committed).toBeTruthy();
  expect(committed?.currentSeason).toBe(initial?.currentSeason);
  expect(committed?.currentWeek).toBe((initial?.currentWeek ?? 0) + 1);

  return {
    gameState: committed!,
    projection: normalizeDashboardProjection(committed!),
  };
}

describe("dashboard priority invariants", () => {
  it("caps the command queue at five and emits only build-valid action targets", () => {
    const state = createBaseState();
    state.reportWorkItems = Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => {
        const item = createReportWorkItem(index + 1);
        return [item.id, item];
      }),
    );
    state.rivalOrganizationState.opportunities["opportunity-1"] = {
      id: "opportunity-1",
      organizationId: "organization-1",
      kind: "open-showcase",
      title: "One-week showcase access",
      description: "A rival network has left a narrow access window open.",
      status: "open",
      createdWeek: 6,
      createdSeason: 1,
      expiresWeek: 7,
      expiresSeason: 1,
      relatedPlayerId: "player-8",
      outcomeRoll: 0.25,
      successChance: 0.5,
      knownTradeoffs: [],
    };

    const workspace = buildDashboardWorkspaceModel({ gameState: state });
    const allCandidates = buildDashboardPriorityCandidates({
      gameState: state,
      maxItems: 100,
    });

    expect(workspace.visibleItems).toHaveLength(5);
    expect(workspace.attention.length).toBeLessThanOrEqual(3);
    expect(workspace.opportunitiesAtRisk.length).toBeLessThanOrEqual(2);
    expect(allCandidates.length).toBeGreaterThan(5);
    expect(allCandidates.every((item) =>
      isGameScreenAllowedForBuild(item.actionTarget.screen)
    )).toBe(true);
  });

  it("collapses duplicate Inbox, Reports, and Rivals projections to one canonical item", () => {
    const state = createBaseState();
    const reportWorkItem = createReportWorkItem(1);
    state.reportWorkItems = {
      [reportWorkItem.id]: reportWorkItem,
    };
    state.rivalOrganizationState.opportunities["opportunity-1"] = {
      id: "opportunity-1",
      organizationId: "organization-1",
      kind: "open-showcase",
      title: "One-week showcase access",
      description: "A rival network has left a narrow access window open.",
      status: "open",
      createdWeek: 6,
      createdSeason: 1,
      expiresWeek: 7,
      expiresSeason: 1,
      outcomeRoll: 0.25,
      successChance: 0.5,
      knownTradeoffs: [],
    };
    state.inbox = [
      createInboxAction({
        id: "report-work-ready-player-1-s1w6",
        title: "Prepared notes are ready",
        body: "Author the recommendation in the report workspace.",
        relatedId: "player-1",
        relatedEntityType: "player",
      }),
      createInboxAction({
        id: "rival-organization-opportunity-opportunity-1",
        title: "One-week showcase access",
        body: "Open the rival workspace before the access window closes.",
        relatedId: "opportunity-1",
        relatedEntityType: undefined,
      }),
    ];

    const candidates = buildDashboardPriorityCandidates({
      gameState: state,
      maxItems: 100,
    });
    const reportProjection = candidates.filter((item) =>
      item.relatedEntityIds.includes("player-1")
    );
    const rivalProjection = candidates.filter((item) =>
      item.relatedEntityIds.includes("opportunity-1")
    );

    expect(reportProjection).toHaveLength(1);
    expect(reportProjection[0]?.collector).toBe("inbox");
    expect(rivalProjection).toHaveLength(1);
    expect(rivalProjection[0]?.collector).toBe("inbox");
  });

  it("does not keep resolved Inbox choices actionable", () => {
    const state = createBaseState();
    const resolvedDecision: DecisionRecord = {
      id: "decision-resolved",
      source: { kind: "lateCareerDilemma", id: "narrative-resolved" },
      offeredAt: { season: 1, week: 4 },
      deadlineAt: { season: 1, week: 6 },
      status: "resolved",
      visibility: "private",
      stakeholders: [],
      options: [
        {
          id: "accept",
          label: "Accept",
          knownTradeoffs: [],
          immediateEffects: [],
          scheduledConsequences: [],
        },
      ],
      selectedOptionId: "accept",
      selectedAt: { season: 1, week: 5 },
      selectionKind: "player",
      resolvedAt: { season: 1, week: 5 },
      outcomeRoll: 0.4,
      consequenceIds: [],
    };
    const resolvedNarrative: NarrativeEvent = {
      id: "narrative-resolved",
      type: "careerCrossroads",
      week: 4,
      season: 1,
      title: "A choice already made",
      description: "This historical message must not stay in the active queue.",
      relatedIds: [],
      acknowledged: false,
      choices: [{ label: "Accept", effect: "The decision is final." }],
      selectedChoice: 0,
      resolved: true,
    };
    state.consequenceState.decisions = {
      [resolvedDecision.id]: resolvedDecision,
    };
    state.narrativeEvents = [resolvedNarrative];
    state.inbox = [
      createInboxAction({
        id: "resolved-decision-message",
        title: "A choice already made",
        body: "This is history, not a current action.",
        relatedId: resolvedNarrative.id,
        relatedEntityType: "narrative",
      }),
    ];

    const candidates = buildDashboardPriorityCandidates({
      gameState: state,
      maxItems: 100,
    });

    expect(candidates.some((item) =>
      item.relatedEntityIds.includes(resolvedDecision.id)
      || item.relatedEntityIds.includes(resolvedNarrative.id)
    )).toBe(false);
  });

  it("produces stable ordering without mutating simulation state", () => {
    const state = createBaseState();
    state.reportWorkItems = Object.fromEntries(
      Array.from({ length: 4 }, (_, index) => {
        const item = createReportWorkItem(index + 1);
        return [item.id, item];
      }),
    );
    state.inbox = [
      createInboxAction({
        id: "report-work-ready-player-2-s1w6",
        title: "Prepared notes are ready for Player 2",
        body: "Author the recommendation in the report workspace.",
        relatedId: "player-2",
        relatedEntityType: "player",
      }),
    ];
    const before = structuredClone(state);

    const first = buildDashboardPriorityCandidates({
      gameState: state,
      maxItems: 100,
    });
    const second = buildDashboardPriorityCandidates({
      gameState: state,
      maxItems: 100,
    });

    expect(second.map((item) => item.id)).toEqual(first.map((item) => item.id));
    expect(second.map((item) => item.score)).toEqual(first.map((item) => item.score));
    expect(state).toEqual(before);
  });

  it("routes a scheduled responsibility to Planner instead of calling it unscheduled", () => {
    const state = createBaseState();
    const reportWorkItem = createReportWorkItem(1);
    state.reportWorkItems = {
      [reportWorkItem.id]: reportWorkItem,
    };
    state.schedule.activities[0] = {
      type: "writeReport",
      slots: 1,
      targetId: "player-1",
      description: "Write Player 1 report",
    };

    const candidate = buildDashboardPriorityCandidates({
      gameState: state,
      maxItems: 100,
    }).find((item) => item.canonicalKey === reportWorkItem.id);
    const playerFacingCopy = [
      candidate?.title,
      candidate?.explanation,
      candidate?.consequence,
    ].filter(Boolean).join(" ");

    expect(candidate).toMatchObject({
      actionLabel: "Review planner",
      actionTarget: {
        screen: "calendar",
        playerId: "player-1",
        focusActivityType: "writeReport",
      },
    });
    expect(candidate?.scoreBreakdown).toContainEqual(expect.objectContaining({
      factor: "already_scheduled",
      score: -40,
    }));
    expect(playerFacingCopy).not.toMatch(/\bunscheduled\b|\bunallocated\b/i);
  });

  it("keeps manual and batch weekly advancement aligned after one committed week", async () => {
    const manual = await runCommittedWeek("manual");
    const batch = await runCommittedWeek("batch");

    expect(manual.projection.length).toBeGreaterThan(0);
    expect(batch.projection).toEqual(manual.projection);
  }, 90_000);
});
