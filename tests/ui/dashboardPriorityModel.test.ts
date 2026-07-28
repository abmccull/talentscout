import { describe, expect, it } from "vitest";

import type {
  ClubDecision,
  GameState,
  ReportWorkItem,
  ScoutReport,
  ScoutingCase,
} from "@/engine/core/types";
import { createWeekSchedule } from "@/engine/core/calendar";
import {
  buildDashboardPriorityCandidates,
  buildDashboardWeekSummary,
} from "@/components/game/dashboard/dashboardPriorityModel";

function createBaseState(): GameState {
  return {
    currentWeek: 4,
    currentSeason: 1,
    fixtures: {},
    scout: {
      id: "scout-1",
      discoveryCredits: [],
      travelBooking: undefined,
    },
    schedule: createWeekSchedule(4, 1),
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
    observations: {},
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
    },
    retiredPlayers: {},
    unsignedYouth: {},
    contactIntel: {},
    contacts: {},
  } as unknown as GameState;
}

describe("dashboardPriorityModel", () => {
  it("does not allow a due-now critical planner gap to be snoozed past its deadline", () => {
    const state = createBaseState();
    const plannerId = "dashboard-planner-gap-s1w4";
    state.dashboardState = {
      version: 1,
      focusedItemId: null,
      focusedThreadId: null,
      recentItemIds: [],
      itemDispositions: {
        [plannerId]: {
          itemId: plannerId,
          state: "snoozed",
          changedWeek: 4,
          changedSeason: 1,
          snoozedUntilWeek: 5,
          snoozedUntilSeason: 1,
        },
      },
      recentlyResolved: [],
      insightLedger: {},
      surfacing: { lastVisibleItemIds: [], lastVisibleInsightIds: [] },
      legacyRecordIds: [],
      careerThreads: {},
    };

    expect(buildDashboardPriorityCandidates({ gameState: state, maxItems: 20 })
      .some((candidate) => candidate.id === plannerId)).toBe(true);

    state.currentWeek = 5;
    state.schedule = createWeekSchedule(5, 1);
    expect(buildDashboardPriorityCandidates({ gameState: state, maxItems: 20 })
      .some((candidate) => candidate.id === "dashboard-planner-gap-s1w5")).toBe(true);
  });

  it("dedupes report work against its authoritative inbox action and ignores unread-only mail", () => {
    const state = createBaseState();
    state.reportWorkItems = {
      "report-work:scout-1:player-1": {
        id: "report-work:scout-1:player-1",
        playerId: "player-1",
        scoutId: "scout-1",
        createdWeek: 4,
        createdSeason: 1,
        status: "ready",
        sourceActivity: "writeReport",
        preparationQualityPoints: 4,
        preparationQualityBonus: 0.1,
        freshObservationIds: ["obs-1"],
      } satisfies ReportWorkItem,
    };
    state.inbox = [
      {
        id: "report-work-ready-player-1-s1w4",
        week: 4,
        season: 1,
        type: "feedback",
        title: "Your notes are ready: Milo Hart",
        body: "Open the player and make the judgment yourself; no recommendation has been filed yet.",
        read: false,
        actionRequired: true,
        relatedId: "player-1",
        relatedEntityType: "player",
      },
      {
        id: "unread-news",
        week: 4,
        season: 1,
        type: "news",
        title: "Plain unread mail",
        body: "This should not become a priority.",
        read: false,
        actionRequired: false,
      },
    ];

    const candidates = buildDashboardPriorityCandidates({ gameState: state });

    expect(candidates.filter((candidate) => candidate.canonicalKey === "report-work:player-1")).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      sourceSystem: "inbox",
      title: "Your notes are ready: Milo Hart",
    });
    expect(candidates.some((candidate) => candidate.title === "Plain unread mail")).toBe(false);
  });

  it("raises report follow-up urgency as the deadline approaches", () => {
    const farState = createBaseState();
    const nearState = createBaseState();

    const report = {
      id: "report-1",
      playerId: "player-2",
      scoutId: "scout-1",
      submittedWeek: 4,
      submittedSeason: 1,
      attributeAssessments: [],
      strengths: [],
      weaknesses: [],
      conviction: "recommend",
      summary: "Test report",
      estimatedValue: 500_000,
      qualityScore: 78,
    } satisfies ScoutReport;
    farState.reports = { "report-1": report };
    nearState.reports = { "report-1": report };
    farState.scoutingCases = {
      "case-1": {
        id: "case-1",
        playerId: "player-2",
        scoutId: "scout-1",
        openedWeek: 4,
        openedSeason: 1,
        lastUpdatedWeek: 4,
        lastUpdatedSeason: 1,
        status: "delivered",
        reportIds: ["report-1"],
        listingIds: [],
        deliveryIds: ["delivery-1"],
        decisionIds: ["decision-1"],
        placementReportIds: [],
      } satisfies ScoutingCase,
    };
    nearState.scoutingCases = farState.scoutingCases;

    farState.clubDecisions = {
      "decision-1": {
        id: "decision-1",
        caseId: "case-1",
        deliveryId: "delivery-1",
        reportId: "report-1",
        clubId: "club-1",
        outcome: "followUpRequested",
        decidedWeek: 4,
        decidedSeason: 1,
        followUpDueWeek: 8,
        followUpDueSeason: 1,
      } satisfies ClubDecision,
    };
    nearState.clubDecisions = {
      "decision-1": {
        ...farState.clubDecisions["decision-1"],
        followUpDueWeek: 4,
      },
    };

    const far = buildDashboardPriorityCandidates({ gameState: farState })
      .find((candidate) => candidate.canonicalKey === "report-follow-up:decision-1");
    const near = buildDashboardPriorityCandidates({ gameState: nearState })
      .find((candidate) => candidate.canonicalKey === "report-follow-up:decision-1");

    expect(far?.score).toBeLessThan(near?.score ?? 0);
    expect(near?.scoreBreakdown.some((factor) => factor.factor === "deadline_this_week")).toBe(true);
  });

  it("routes scheduled report obligations back to planner instead of presenting them as unscheduled", () => {
    const state = createBaseState();
    state.reportWorkItems = {
      "report-work:scout-1:player-1": {
        id: "report-work:scout-1:player-1",
        playerId: "player-1",
        scoutId: "scout-1",
        createdWeek: 4,
        createdSeason: 1,
        status: "ready",
        sourceActivity: "writeReport",
        preparationQualityPoints: 4,
        preparationQualityBonus: 0.1,
        freshObservationIds: ["obs-1"],
      } satisfies ReportWorkItem,
    };
    state.schedule.activities[0] = {
      type: "writeReport",
      slots: 1,
      targetId: "player-1",
      description: "Write report on Milo Hart",
    };

    const candidate = buildDashboardPriorityCandidates({ gameState: state })
      .find((item) => item.canonicalKey === "report-work:scout-1:player-1");

    expect(candidate).toMatchObject({
      actionLabel: "Review planner",
      actionTarget: { screen: "calendar", playerId: "player-1" },
    });
    expect(candidate?.scoreBreakdown.some((factor) => factor.factor === "already_scheduled")).toBe(true);
  });

  it("surfaces rival openings and contested players with authoritative routes", () => {
    const state = createBaseState();
    state.contactIntel["player-3"] = [{
      playerId: "player-3",
      attribute: "pace",
      hint: "Quick over distance",
    }] as never;
    state.rivalOrganizationState.opportunities = {
      "opp-1": {
        id: "opp-1",
        organizationId: "org-1",
        kind: "open-showcase",
        title: "Open Showcase Window",
        description: "A showcase access window is open.",
        status: "open",
        createdWeek: 4,
        createdSeason: 1,
        expiresWeek: 5,
        expiresSeason: 1,
        relatedPlayerId: "player-3",
        outcomeRoll: 0.2,
        successChance: 0.5,
        knownTradeoffs: [],
      },
    };
    state.rivalScouts = {
      "rival-1": {
        id: "rival-1",
        name: "Eva Stroud",
        clubId: "club-rival",
        specialization: "youth",
        currentTarget: "player-3",
        targetPlayerIds: ["player-3"],
        competingForPlayers: ["player-3"],
        scoutingProgress: { "player-3": 4 },
        quality: 0.9,
        aggressiveness: 0.9,
        reputation: 70,
      },
    } as never;

    const candidates = buildDashboardPriorityCandidates({ gameState: state });

    expect(candidates.some((candidate) =>
      candidate.canonicalKey === "rival-opportunity:opp-1"
      && candidate.actionTarget.screen === "rivals"
    )).toBe(true);
    expect(candidates.some((candidate) =>
      candidate.canonicalKey === "rival-market:player-3"
      && candidate.actionTarget.screen === "playerProfile"
    )).toBe(true);
  });

  it("suppresses rival player-pressure cards for hidden rival targets outside the scout sphere", () => {
    const state = createBaseState();
    state.rivalScouts = {
      "rival-visible": {
        id: "rival-visible",
        name: "Eva Stroud",
        clubId: "club-rival",
        specialization: "youth",
        currentTarget: "player-3",
        targetPlayerIds: ["player-3"],
        competingForPlayers: ["player-3"],
        scoutingProgress: { "player-3": 4 },
        quality: 0.9,
        aggressiveness: 0.9,
        reputation: 70,
      },
      "rival-hidden": {
        id: "rival-hidden",
        name: "Marco Venn",
        clubId: "club-rival-2",
        specialization: "youth",
        currentTarget: "player-2",
        targetPlayerIds: ["player-2"],
        competingForPlayers: ["player-2"],
        scoutingProgress: { "player-2": 4 },
        quality: 0.9,
        aggressiveness: 0.9,
        reputation: 70,
      },
    } as never;
    state.observations = {
      "obs-1": {
        id: "obs-1",
        playerId: "player-3",
        scoutId: "scout-1",
        week: 4,
        season: 1,
        context: "liveMatch",
        attributeReadings: [],
        notes: [],
        flaggedMoments: [],
      },
    } as never;

    const candidates = buildDashboardPriorityCandidates({ gameState: state });

    expect(candidates.some((candidate) => candidate.canonicalKey === "rival-market:player-3")).toBe(true);
    expect(candidates.some((candidate) => candidate.canonicalKey === "rival-market:player-2")).toBe(false);
  });

  it("links inbox action items to offered decisions by either decision id or source id", () => {
    const state = createBaseState();
    state.inbox = [{
      id: "message-1",
      week: 4,
      season: 1,
      type: "event",
      title: "Rival move needs a response",
      body: "This should inherit the offered decision deadline.",
      read: false,
      actionRequired: true,
      relatedId: "campaign-1",
      relatedEntityType: "narrative",
    }];
    state.consequenceState.decisions = {
      "decision-1": {
        id: "decision-1",
        source: { kind: "rivalCampaign", id: "campaign-1" },
        offeredAt: { season: 1, week: 4 },
        deadlineAt: { season: 1, week: 5 },
        status: "offered",
        visibility: "stakeholders",
        stakeholders: [],
        options: [{ id: "protect", label: "Protect", knownTradeoffs: [], immediateEffects: [], scheduledConsequences: [] }],
        outcomeRoll: 0.2,
        consequenceIds: [],
      },
    } as never;

    const candidate = buildDashboardPriorityCandidates({ gameState: state })
      .find((item) => item.id === "dashboard-inbox-message-1");

    expect(candidate).toMatchObject({
      category: "deadline",
      actionTarget: { screen: "inbox", decisionId: "decision-1", relatedId: "campaign-1" },
      deadlineWeek: 5,
    });
    expect(candidate?.consequence).toContain("S1 W5");
  });

  it("keeps only the latest case follow-up active, including overdue follow-ups", () => {
    const state = createBaseState();
    state.currentWeek = 6;
    state.reports = {
      "report-1": {
        id: "report-1",
        playerId: "player-1",
        scoutId: "scout-1",
        submittedWeek: 4,
        submittedSeason: 1,
        attributeAssessments: [],
        strengths: [],
        weaknesses: [],
        conviction: "recommend",
        summary: "Case one report",
        estimatedValue: 200_000,
        qualityScore: 70,
      },
      "report-2": {
        id: "report-2",
        playerId: "player-2",
        scoutId: "scout-1",
        submittedWeek: 4,
        submittedSeason: 1,
        attributeAssessments: [],
        strengths: [],
        weaknesses: [],
        conviction: "recommend",
        summary: "Case two report",
        estimatedValue: 300_000,
        qualityScore: 72,
      },
    } as never;
    state.scoutingCases = {
      "case-1": {
        id: "case-1",
        playerId: "player-1",
        scoutId: "scout-1",
        openedWeek: 4,
        openedSeason: 1,
        lastUpdatedWeek: 6,
        lastUpdatedSeason: 1,
        status: "reported",
        activeReportId: "report-1",
        reportIds: ["report-1"],
        listingIds: [],
        deliveryIds: ["delivery-1"],
        decisionIds: ["decision-overdue"],
        placementReportIds: [],
      },
      "case-2": {
        id: "case-2",
        playerId: "player-2",
        scoutId: "scout-1",
        openedWeek: 4,
        openedSeason: 1,
        lastUpdatedWeek: 6,
        lastUpdatedSeason: 1,
        status: "closed",
        activeReportId: "report-2",
        reportIds: ["report-2"],
        listingIds: [],
        deliveryIds: ["delivery-2"],
        decisionIds: ["decision-stale", "decision-latest"],
        placementReportIds: [],
      },
    } as never;
    state.clubDecisions = {
      "decision-overdue": {
        id: "decision-overdue",
        caseId: "case-1",
        deliveryId: "delivery-1",
        reportId: "report-1",
        clubId: "club-1",
        outcome: "followUpRequested",
        decidedWeek: 4,
        decidedSeason: 1,
        followUpDueWeek: 5,
        followUpDueSeason: 1,
      },
      "decision-stale": {
        id: "decision-stale",
        caseId: "case-2",
        deliveryId: "delivery-2",
        reportId: "report-2",
        clubId: "club-2",
        outcome: "followUpRequested",
        decidedWeek: 4,
        decidedSeason: 1,
        followUpDueWeek: 5,
        followUpDueSeason: 1,
      },
      "decision-latest": {
        id: "decision-latest",
        caseId: "case-2",
        deliveryId: "delivery-2",
        reportId: "report-2",
        clubId: "club-2",
        outcome: "rejected",
        decidedWeek: 6,
        decidedSeason: 1,
      },
    } as never;

    const candidates = buildDashboardPriorityCandidates({ gameState: state, maxItems: 10 });

    expect(candidates.some((candidate) => candidate.canonicalKey === "report-follow-up:decision-overdue")).toBe(true);
    expect(candidates.some((candidate) => candidate.canonicalKey === "report-follow-up:decision-stale")).toBe(false);
  });

  it("suppresses another scout's work, listing, delivery case, and follow-up", () => {
    const state = createBaseState();
    state.reportWorkItems = {
      "foreign-work": {
        id: "foreign-work",
        playerId: "player-1",
        scoutId: "scout-2",
        createdWeek: 4,
        createdSeason: 1,
        status: "ready",
        sourceActivity: "writeReport",
        preparationQualityPoints: 4,
        preparationQualityBonus: 0.1,
        freshObservationIds: ["obs-1"],
      } satisfies ReportWorkItem,
    };
    state.reports = {
      "foreign-report": {
        id: "foreign-report",
        playerId: "player-2",
        scoutId: "scout-2",
        submittedWeek: 4,
        submittedSeason: 1,
        attributeAssessments: [],
        strengths: [],
        weaknesses: [],
        conviction: "recommend",
        summary: "Foreign report",
        estimatedValue: 500_000,
        qualityScore: 74,
      },
    } as never;
    state.scoutingCases = {
      "foreign-case": {
        id: "foreign-case",
        playerId: "player-2",
        scoutId: "scout-2",
        openedWeek: 4,
        openedSeason: 1,
        lastUpdatedWeek: 4,
        lastUpdatedSeason: 1,
        status: "reported",
        activeReportId: "foreign-report",
        reportIds: ["foreign-report"],
        listingIds: [],
        deliveryIds: [],
        decisionIds: ["foreign-follow-up"],
        placementReportIds: [],
      } satisfies ScoutingCase,
    };
    state.clubDecisions = {
      "foreign-follow-up": {
        id: "foreign-follow-up",
        caseId: "foreign-case",
        deliveryId: "delivery-foreign",
        reportId: "foreign-report",
        clubId: "club-2",
        outcome: "followUpRequested",
        decidedWeek: 4,
        decidedSeason: 1,
        followUpDueWeek: 5,
        followUpDueSeason: 1,
      } satisfies ClubDecision,
    };

    const candidates = buildDashboardPriorityCandidates({
      gameState: state,
      pendingListingReportId: "foreign-report",
      maxItems: 10,
    });

    expect(candidates.some((candidate) => candidate.id === "dashboard-report-work-foreign-work")).toBe(false);
    expect(candidates.some((candidate) => candidate.id === "dashboard-pending-listing-foreign-report")).toBe(false);
    expect(candidates.some((candidate) => candidate.id === "dashboard-report-delivery-foreign-case")).toBe(false);
    expect(candidates.some((candidate) => candidate.id === "dashboard-report-follow-up-foreign-follow-up")).toBe(false);
  });

  it("builds a compact interpreted week summary without mutating the schedule", () => {
    const state = createBaseState();
    state.schedule.activities[0] = {
      type: "attendMatch",
      slots: 1,
      targetId: "fixture-1",
      description: "Watch match",
    };
    state.schedule.activities[1] = {
      type: "writeReport",
      slots: 1,
      targetId: "player-1",
      description: "Write report",
    };

    const before = [...state.schedule.activities];
    const summary = buildDashboardWeekSummary(state);

    expect(summary).toMatchObject({
      availableAttentionDays: 5,
      plannedObservationCount: 1,
      plannedReportCount: 1,
      actionTarget: { screen: "calendar", week: 4, season: 1 },
    });
    expect(state.schedule.activities).toEqual(before);
  });
});
