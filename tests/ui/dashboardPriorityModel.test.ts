import { describe, expect, it } from "vitest";

import type {
  ClubDecision,
  GameState,
  ReportWorkItem,
  ScoutReport,
  ScoutingCase,
} from "@/engine/core/types";
import { createConsequenceEngineState } from "@/engine/consequences";
import { createWeekSchedule } from "@/engine/core/calendar";
import {
  buildDashboardPriorityCandidates,
  buildDashboardWeekSummary,
} from "@/components/game/dashboard/dashboardPriorityModel";
import { createRunManifest } from "@/engine/run";

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
    consequenceState: createConsequenceEngineState(),
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

  it("surfaces a placed-pathway follow-up and routes the next move back through the planner", () => {
    const state = createBaseState();
    state.currentWeek = 7;
    state.scout = {
      ...state.scout,
      primarySpecialization: "youth",
    } as GameState["scout"];
    state.runManifest = createRunManifest({
      rootSeed: "dashboard-front-seed",
      specialization: "youth",
      difficulty: "normal",
      selectedCountries: ["england"],
      startingCountry: "england",
    });
    state.consequenceState = createConsequenceEngineState();
    state.inbox = [{
      id: "prospect-follow-up:case-front:decision-front:early-check",
      week: 3,
      season: 1,
      type: "feedback",
      title: "Early pathway check",
      body: "The first checkpoint has already been logged.",
      read: false,
      actionRequired: false,
      relatedId: "player-1",
      relatedEntityType: "player",
    } as GameState["inbox"][number]];
    state.clubs = {
      "club-1": { id: "club-1", name: "Northbridge Academy" },
    } as unknown as GameState["clubs"];
    state.scoutingCases = {
      "case-front": {
        id: "case-front",
        playerId: "player-1",
        scoutId: "scout-1",
        openedWeek: 1,
        openedSeason: 1,
        lastUpdatedWeek: 1,
        lastUpdatedSeason: 1,
        status: "placed",
        professionalContext: {
          modeId: "youth-scout",
          familyId: "pathway-choice",
          title: "The pathway choice",
          premise: "The placement must fit the player's football and support needs.",
          centralQuestion: "Is this still the right development environment?",
          stakeholderRefs: ["family", "academy"],
          judgmentDecisionIds: [],
        },
        reportIds: ["report-front"],
        listingIds: [],
        deliveryIds: ["delivery-front"],
        decisionIds: ["decision-front"],
        placementReportIds: ["placement-front"],
      } satisfies ScoutingCase,
    };
    state.reports = {
      "report-front": {
        id: "report-front",
        playerId: "player-1",
        scoutId: "scout-1",
        submittedWeek: 1,
        submittedSeason: 1,
        attributeAssessments: [],
        strengths: [],
        weaknesses: [],
        conviction: "recommend",
        summary: "Placement report",
        estimatedValue: 400_000,
        qualityScore: 74,
      } satisfies ScoutReport,
    };
    state.clubDecisions = {
      "decision-front": {
        id: "decision-front",
        caseId: "case-front",
        deliveryId: "delivery-front",
        reportId: "report-front",
        clubId: "club-1",
        outcome: "accepted",
        decidedWeek: 1,
        decidedSeason: 1,
      } satisfies ClubDecision,
    };

    const candidate = buildDashboardPriorityCandidates({ gameState: state })
      .find((item) => item.canonicalKey === "active-front:prospect-follow-up:case-front:decision-front:decision-point");
    const plannerTarget = candidate?.actionTarget as
      | { screen: "calendar"; playerId?: string; focusActivityType?: string }
      | undefined;

    expect(candidate).toMatchObject({
      sourceSystem: "scouting",
      category: "required_action",
      actionTarget: {
        screen: "calendar",
        playerId: "player-1",
      },
    });
    expect(candidate?.title).toContain("pathway");
    expect(candidate?.consequence).toContain("without your follow-up");
    expect(["followUpSession", "trainingVisit"]).toContain(plannerTarget?.focusActivityType);
  });

  it("surfaces a live relationship front before the callback lands", () => {
    const state = createBaseState();
    state.contacts = {
      reporter: {
        id: "reporter",
        name: "Mara Vale",
        type: "journalist",
        relationship: 58,
        trustLevel: 61,
        reliability: 72,
        knownPlayerIds: [],
      },
    } as never;
    state.consequenceState = createConsequenceEngineState({
      decisions: {
        "relationship-front": {
          id: "relationship-front",
          source: { kind: "relationshipConflict", id: "family-versus-journalist-privacy" },
          offeredAt: { season: 1, week: 4 },
          deadlineAt: { season: 1, week: 4 },
          status: "selected",
          selectedOptionId: "protect-family",
          selectedAt: { season: 1, week: 4 },
          selectionKind: "player",
          visibility: "stakeholders",
          stakeholders: [
            { kind: "family", id: "player-1" },
            { kind: "contact", id: "reporter" },
          ],
          options: [{
            id: "protect-family",
            label: "Protect the family and refuse",
            knownTradeoffs: ["The journalist loses an exclusive and may stop sharing early leads."],
            immediateEffects: [],
            scheduledConsequences: [],
          }],
          outcomeRoll: 0.4,
          consequenceIds: ["relationship-front:callback"],
          metadata: {
            title: "The Family and the Deadline",
            premise: "Mara Vale wants an attributable answer while the family wants privacy.",
            relatedPlayerId: "player-1",
            frontFamilyId: "family-journalist-media",
            frontStructure: "publicPrivate",
            recurrenceName: "The Embargo Triangle",
            recurrenceIndex: 1,
            ensembleId: "family-journalist-player-1",
            subjectKind: "player",
            subjectId: "player-1",
            leftStakeholderKey: "family:player-1",
            rightStakeholderKey: "contact:reporter",
            caseId: "case-social",
            quietIntervention: true,
          },
        },
      },
      consequences: {
        "relationship-front:callback": {
          id: "relationship-front:callback",
          decisionId: "relationship-front",
          optionId: "protect-family",
          templateId: "private-window-buys-access",
          dueAt: { season: 1, week: 5 },
          status: "pending",
          effects: [],
          conditions: [],
          probability: 1,
          outcomeRoll: 0.4,
          tags: ["relationshipConflict", "callback"],
        },
      },
      obligations: {
        "obligation:relationship-front:media": {
          id: "obligation:relationship-front:media",
          debtor: { kind: "scout", id: "scout-1" },
          creditor: { kind: "contact", id: "reporter" },
          kind: "mediaAccess",
          terms: "Give a clear answer before the story runs.",
          status: "active",
          createdAt: { season: 1, week: 4 },
          dueAt: { season: 1, week: 5 },
          sourceDecisionId: "relationship-front",
        },
      },
      memories: {
        "memory:relationship-front:reporter": {
          id: "memory:relationship-front:reporter",
          stakeholder: { kind: "contact", id: "reporter" },
          subject: { kind: "scout", id: "scout-1" },
          tags: ["mediaAccess", "promiseBroken", "sourceRelationship"],
          valence: -32,
          intensity: 68,
          salience: 72,
          visibility: "stakeholders",
          createdAt: { season: 1, week: 4 },
          sourceDecisionId: "relationship-front",
        },
      },
    });

    const candidate = buildDashboardPriorityCandidates({ gameState: state, maxItems: 20 })
      .find((item) => item.canonicalKey === "social-front:relationship-front");

    expect(candidate).toMatchObject({
      sourceSystem: "relationships",
      category: "required_action",
      actionTarget: {
        screen: "network",
        contactId: "reporter",
        playerId: "player-1",
      },
    });
    expect(candidate?.title).toContain("Embargo Triangle");
    expect(candidate?.consequence).toContain("S1 W5");
  });

  it("routes rival-backed social fronts into matching open rival interventions", () => {
    const state = createBaseState();
    state.players["player-3"] = {
      ...state.players["player-1"],
      id: "player-3",
      firstName: "Mika",
      lastName: "Costa",
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
    state.rivalOrganizationState.organizations = {
      "org-1": {
        id: "org-1",
        archetypeId: "academy-conglomerate",
        name: "Northstar Academy Circuit",
        agendaId: "control-youth-pathways",
        memberRivalIds: ["rival-1"],
        resources: 60,
        influence: 55,
        heat: 35,
        agendaProgress: 40,
        agendaLevel: 2,
        momentum: 2,
        foundedSeason: 1,
      },
    } as never;
    state.rivalOrganizationState.opportunities = {
      "opp-social": {
        id: "opp-social",
        organizationId: "org-1",
        kind: "open-showcase",
        title: "Open Showcase Window",
        description: "A showcase slot opened around a shared target.",
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
    state.consequenceState.decisions = {
      "relationship-rival-front": {
        id: "relationship-rival-front",
        source: { kind: "relationshipConflict", id: "relationship-rival-front" },
        offeredAt: { season: 1, week: 4 },
        deadlineAt: { season: 1, week: 4 },
        status: "selected",
        selectedOptionId: "protect",
        visibility: "stakeholders",
        stakeholders: [
          { kind: "rival", id: "rival-1" },
          { kind: "player", id: "player-3" },
        ],
        options: [{
          id: "protect",
          label: "Protect the line",
          knownTradeoffs: [],
          immediateEffects: [],
          scheduledConsequences: [],
        }, {
          id: "yield",
          label: "Yield the route",
          knownTradeoffs: [],
          immediateEffects: [],
          scheduledConsequences: [],
        }],
        consequenceIds: ["consequence:relationship-rival-front:protect:callback"],
        outcomeRoll: 0.4,
        metadata: {
          recurrenceName: "Showcase triangle",
          premise: "The rival is still pressing around Mika Costa.",
          relatedPlayerId: "player-3",
        },
      },
    };
    state.consequenceState.consequences = {
      "consequence:relationship-rival-front:protect:callback": {
        id: "consequence:relationship-rival-front:protect:callback",
        decisionId: "relationship-rival-front",
        optionId: "protect",
        templateId: "callback",
        dueAt: { season: 1, week: 5 },
        status: "pending",
        effects: [],
        conditions: [],
        probability: 1,
        outcomeRoll: 0.4,
        tags: ["relationshipConflict", "callback"],
      },
    };

    const candidate = buildDashboardPriorityCandidates({ gameState: state, maxItems: 20 })
      .find((item) => item.canonicalKey === "social-front:relationship-rival-front");

    expect(candidate).toMatchObject({
      sourceSystem: "rivals",
      actionLabel: "Exploit showcase opening",
      actionTarget: {
        screen: "rivals",
        playerId: "player-3",
        opportunityId: "opp-social",
      },
    });
  });

  it("surfaces an idle funded course as an actionable career pressure", () => {
    const state = createBaseState();
    state.scout = {
      ...state.scout,
      careerPath: "club",
      careerTier: 3,
      primarySpecialization: "youth",
    } as GameState["scout"];
    state.finances = {
      careerPath: "club",
      activeEnrollment: {
        courseId: "fa_level_1",
        startWeek: 2,
        startSeason: 1,
        completionWeek: 5,
        completionSeason: 1,
        studyWeeksCompleted: 1,
        requiredStudyWeeks: 4,
      },
      transactions: [{
        week: 2,
        season: 1,
        amount: 0,
        description: "Enrolled in FA Level 1 Scouting Badge (employer funded £500)",
        referenceId: "course-enrollment:fa_level_1:s1w2",
        category: "operatingCost",
      }],
      staffWorkProducts: [],
      retainerContracts: [],
      consultingContracts: [],
    } as unknown as GameState["finances"];

    const candidate = buildDashboardPriorityCandidates({ gameState: state, maxItems: 20 })
      .find((item) => item.canonicalKey?.startsWith("development-pressure:course:"));

    expect(candidate).toMatchObject({
      sourceSystem: "career",
      category: "required_action",
      actionLabel: "Book study in Planner",
      actionTarget: {
        screen: "calendar",
        week: 4,
        season: 1,
        focusActivityType: "study",
      },
    });
    expect(candidate?.consequence).toContain("career tier");
  });

  it("routes staff-review pressure to report history rather than agency assistants", () => {
    const state = createBaseState();
    state.scout = {
      ...state.scout,
      careerPath: "independent",
      independentTier: 3,
      primarySpecialization: "youth",
    } as GameState["scout"];
    state.finances = {
      careerPath: "independent",
      independentTier: 3,
      activeEnrollment: null,
      transactions: [],
      office: { tier: "small", monthlyCost: 500, qualityBonus: 0.1, maxEmployees: 3 },
      employees: [],
      satelliteOffices: [],
      clientRelationships: [],
      staffWorkProducts: [{
        id: "staff-product-1",
        employeeId: "employee-pressure",
        employeeName: "Taylor Analyst",
        playerId: "player-1",
        clientClubId: "club-client",
        createdWeek: 2,
        createdSeason: 1,
        status: "awaitingReview",
        qualityScore: 60,
        signals: [],
        limitation: "Staff lead only.",
        suggestedConviction: "investigate",
      }],
      retainerContracts: [],
      consultingContracts: [{
        id: "consult-pressure",
        clubId: "club-client",
        type: "youthAudit",
        fee: 7_500,
        deadline: 4,
        deadlineSeason: 1,
        status: "active",
        deliverables: [
          { type: "reports", description: "Reports", required: 2, delivered: 1 },
          { type: "analysis", description: "Analysis", required: 1, delivered: 0 },
          { type: "presentation", description: "Presentation", required: 1, delivered: 0 },
        ],
        offeredWeek: 1,
        offeredSeason: 1,
        deliveredReportIds: [],
      }],
    } as unknown as GameState["finances"];

    const candidate = buildDashboardPriorityCandidates({ gameState: state, maxItems: 20 })
      .find((item) => item.canonicalKey?.startsWith("development-pressure:staff-review:"));

    expect(candidate).toMatchObject({
      sourceSystem: "agency",
      actionLabel: "Review staff work",
      actionTarget: {
        screen: "reportHistory",
      },
    });
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

  it("routes already scheduled relationship fronts back through the real planner activity", () => {
    const state = createBaseState();
    state.contacts = {
      reporter: {
        id: "reporter",
        name: "Mara Vale",
        type: "journalist",
        relationship: 58,
        trustLevel: 61,
        reliability: 72,
        knownPlayerIds: [],
      },
    } as never;
    state.schedule.activities[0] = {
      type: "networkMeeting",
      slots: 1,
      targetId: "reporter",
      description: "Meet Mara Vale",
    };
    state.consequenceState = createConsequenceEngineState({
      decisions: {
        "relationship-front": {
          id: "relationship-front",
          source: { kind: "relationshipConflict", id: "family-versus-journalist-privacy" },
          offeredAt: { season: 1, week: 4 },
          deadlineAt: { season: 1, week: 4 },
          status: "selected",
          selectedOptionId: "protect-family",
          selectedAt: { season: 1, week: 4 },
          selectionKind: "player",
          visibility: "stakeholders",
          stakeholders: [
            { kind: "family", id: "player-1" },
            { kind: "contact", id: "reporter" },
          ],
          options: [{
            id: "protect-family",
            label: "Protect the family and refuse",
            knownTradeoffs: [],
            immediateEffects: [],
            scheduledConsequences: [],
          }],
          outcomeRoll: 0.4,
          consequenceIds: ["relationship-front:callback"],
          metadata: {
            premise: "Mara Vale wants an attributable answer while the family wants privacy.",
            relatedPlayerId: "player-1",
            recurrenceName: "The Embargo Triangle",
          },
        },
      },
      consequences: {
        "relationship-front:callback": {
          id: "relationship-front:callback",
          decisionId: "relationship-front",
          optionId: "protect-family",
          templateId: "private-window-buys-access",
          dueAt: { season: 1, week: 5 },
          status: "pending",
          effects: [],
          conditions: [],
          probability: 1,
          outcomeRoll: 0.4,
          tags: ["relationshipConflict", "callback"],
        },
      },
    });

    const candidate = buildDashboardPriorityCandidates({ gameState: state, maxItems: 20 })
      .find((item) => item.canonicalKey === "social-front:relationship-front");

    expect(candidate).toMatchObject({
      actionLabel: "Review planner",
      actionTarget: {
        screen: "calendar",
        contactId: "reporter",
        focusActivityType: "networkMeeting",
      },
    });
  });

  it("dedupes active-front inbox, offered decision, and planner front onto one decision card", () => {
    const state = createBaseState();
    state.currentWeek = 12;
    state.scout = {
      ...state.scout,
      primarySpecialization: "youth",
    } as GameState["scout"];
    state.runManifest = createRunManifest({
      rootSeed: "dashboard-active-front-dedupe-seed",
      specialization: "youth",
      difficulty: "normal",
      selectedCountries: ["england"],
      startingCountry: "england",
    });
    state.clubs = {
      "club-1": { id: "club-1", name: "Northbridge Academy" },
    } as never;
    state.players["player-1"] = {
      ...state.players["player-1"],
      recentMatchRatings: [],
      seasonRatings: [],
    } as never;
    state.alumniRecords = [{
      id: "alumni-front",
      caseId: "case-front",
      placementReportId: "placement-front",
      originatingReportId: "report-front",
      playerId: "player-1",
      placedClubId: "club-1",
      currentClubId: "club-1",
      milestones: [],
      careerSnapshots: [],
      placedWeek: 1,
      placedSeason: 1,
      careerUpdates: [{
        week: 3,
        season: 1,
        type: "released",
        description: "The academy released Milo before a senior route opened.",
      }],
      currentStatus: "released",
      seasonStats: [],
      becameContact: false,
    }] as never;
    state.scoutingCases = {
      "case-front": {
        id: "case-front",
        playerId: "player-1",
        scoutId: "scout-1",
        openedWeek: 1,
        openedSeason: 1,
        lastUpdatedWeek: 12,
        lastUpdatedSeason: 1,
        status: "placed",
        reportIds: ["report-front"],
        listingIds: [],
        deliveryIds: [],
        decisionIds: [],
        placementReportIds: ["placement-front"],
      } as never,
    };
    state.reports = {
      "report-front": {
        id: "report-front",
        playerId: "player-1",
        scoutId: "scout-1",
        submittedWeek: 1,
        submittedSeason: 1,
        attributeAssessments: [],
        strengths: [],
        weaknesses: [],
        conviction: "recommend",
        summary: "Placement report",
        estimatedValue: 400_000,
        qualityScore: 74,
      } satisfies ScoutReport,
    };
    state.consequenceState = createConsequenceEngineState({
      decisions: {
        "active-career-front:stalled-pathway:alumni-front:s1": {
          id: "active-career-front:stalled-pathway:alumni-front:s1",
          source: { kind: "narrative", id: "active-career-front:stalled-pathway:alumni-front:s1" } as never,
          offeredAt: { season: 1, week: 12 },
          deadlineAt: { season: 1, week: 13 },
          status: "offered",
          visibility: "stakeholders",
          stakeholders: [{ kind: "player", id: "player-1" }],
          options: [{
            id: "option-1",
            label: "Follow up now",
            knownTradeoffs: [],
            immediateEffects: [],
            scheduledConsequences: [],
          }],
          outcomeRoll: 0.5,
          consequenceIds: [],
        },
      },
    });
    state.inbox = [{
      id: "inbox:active-career-front:stalled-pathway:alumni-front:s1",
      week: 12,
      season: 1,
      type: "feedback",
      title: "Milo Hart: the pathway has collapsed",
      body: "The route is under pressure.",
      read: false,
      actionRequired: true,
      relatedId: "active-career-front:stalled-pathway:alumni-front:s1",
      relatedEntityType: "narrative",
    } as GameState["inbox"][number]];

    const related = buildDashboardPriorityCandidates({ gameState: state, maxItems: 20 })
      .filter((item) =>
        item.canonicalKey === "decision:active-career-front:stalled-pathway:alumni-front:s1"
        || item.aliasKeys.includes("decision:active-career-front:stalled-pathway:alumni-front:s1"),
      );

    expect(related).toHaveLength(1);
    expect(related[0]?.sourceSystem).toBe("inbox");
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
