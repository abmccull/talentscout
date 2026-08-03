import { describe, expect, it } from "vitest";

import type { GameState, RecommendationReview } from "@/engine/core/types";
import { createConsequenceEngineState } from "@/engine/consequences";
import { buildDashboardCareerThreads } from "@/engine/dashboard/careerThreads";
import { generateDashboardInsights } from "@/engine/dashboard/insights";
import { buildOutcomeExplanations } from "@/engine/dashboard/outcomeExplanations";
import { createRunManifest } from "@/engine/run";

function review(id: string, score: number): RecommendationReview {
  return {
    id,
    caseId: `case-${id}`,
    reportId: `report-${id}`,
    playerId: "player-1",
    clubId: "club-1",
    checkpoint: "oneSeason",
    dueWeek: 5,
    dueSeason: 1,
    status: "complete",
    completedWeek: 6,
    completedSeason: 1,
    overallScore: score,
    findings: [`Finding for ${id}`],
    evidence: [{ source: "minutes", description: "Recorded minutes", sourceId: `minutes-${id}` }],
  };
}

function state(): GameState {
  return {
    currentWeek: 10,
    currentSeason: 1,
    fixtures: {},
    players: {
      "player-1": { id: "player-1", firstName: "João", lastName: "Mendes" },
    },
    retiredPlayers: {},
    recommendationReviews: {
      one: review("one", 35),
      two: review("two", 42),
    },
    alumniRecords: [{
      id: "alumni-1",
      playerId: "player-1",
      placedClubId: "club-1",
      currentClubId: "club-2",
      milestones: [{
        type: "internationalCallUp",
        week: 9,
        season: 1,
        description: "Called into the Portugal squad.",
        notified: true,
      }],
      careerSnapshots: [],
      placedWeek: 2,
      placedSeason: 1,
      careerUpdates: [],
      currentStatus: "transferred",
      seasonStats: [],
      becameContact: false,
    }],
    contacts: {},
    finances: { transactions: [] },
  } as unknown as GameState;
}

describe("dashboard intelligence", () => {
  it("generates deterministic insights only after two supporting records", () => {
    const gameState = state();
    const first = generateDashboardInsights(gameState);
    const second = generateDashboardInsights(gameState);
    expect(first).toEqual(second);
    expect(first[0]?.evidenceIds.length).toBeGreaterThanOrEqual(2);

    delete gameState.recommendationReviews.two;
    expect(generateDashboardInsights(gameState)).toHaveLength(0);
  });

  it("enforces a four-week cooldown while preserving the same-week insight", () => {
    const gameState = state();
    const insight = generateDashboardInsights(gameState)[0]!;
    gameState.dashboardState = {
      version: 1,
      focusedItemId: null,
      focusedThreadId: null,
      recentItemIds: [],
      itemDispositions: {},
      recentlyResolved: [],
      insightLedger: {
        [insight.id]: {
          insightId: insight.id,
          firstGeneratedWeek: 9,
          lastGeneratedWeek: 9,
          firstGeneratedSeason: 1,
          lastGeneratedSeason: 1,
          fingerprint: insight.fingerprint,
        },
      },
      surfacing: { lastVisibleItemIds: [], lastVisibleInsightIds: [insight.id] },
      legacyRecordIds: [],
      careerThreads: {},
    };
    expect(generateDashboardInsights(gameState)).toHaveLength(0);
    gameState.currentWeek = 13;
    expect(generateDashboardInsights(gameState)).toHaveLength(1);
    gameState.currentWeek = 9;
    expect(generateDashboardInsights(gameState)).toHaveLength(1);
  });

  it("uses persisted review and alumni facts for explanations and career callbacks", () => {
    const gameState = state();
    const explanations = buildOutcomeExplanations(gameState);
    expect(explanations[0]?.causeLines[0]).toContain("Finding");
    expect(explanations[0]?.evidenceIds).toContain("minutes-one");

    const threads = buildDashboardCareerThreads(gameState);
    expect(threads[0]?.title).toContain("João Mendes");
    expect(threads[0]?.whatHappened).toContain("Called into the Portugal squad.");
    expect(threads[0]?.actionTarget?.screen).toBe("alumniDashboard");
  });

  it("uses neutral copy when a completed review has no causal evidence", () => {
    const gameState = state();
    gameState.recommendationReviews = {
      neutral: {
        ...review("neutral", 50),
        findings: undefined,
        evidence: undefined,
        playerFacingDimensions: undefined,
      },
    };
    const explanation = buildOutcomeExplanations(gameState)[0];
    expect(explanation?.neutral).toBe(true);
    expect(explanation?.causeLines[0]).toContain("does not contain enough evidence");
  });

  it("projects a live pathway follow-up into the career thread before it becomes retroactive inbox history", () => {
    const gameState = state();
    gameState.currentWeek = 7;
    gameState.scout = {
      id: "scout-1",
      primarySpecialization: "youth",
    } as GameState["scout"];
    gameState.runManifest = createRunManifest({
      rootSeed: "dashboard-front-seed",
      specialization: "youth",
      difficulty: "normal",
      selectedCountries: ["england"],
      startingCountry: "england",
    });
    gameState.consequenceState = createConsequenceEngineState();
    gameState.contacts = {};
    gameState.inbox = [{
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
    gameState.reportDeliveries = {};
    gameState.clubs = {
      "club-1": { id: "club-1", name: "Northbridge Academy" },
    } as unknown as GameState["clubs"];
    gameState.reports = {
      "report-front": {
        id: "report-front",
        playerId: "player-1",
        scoutId: "scout-1",
        submittedWeek: 1,
        submittedSeason: 1,
      } as GameState["reports"][string],
    };
    gameState.scoutingCases = {
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
      } as GameState["scoutingCases"][string],
    };
    gameState.clubDecisions = {
      "decision-front": {
        id: "decision-front",
        caseId: "case-front",
        deliveryId: "delivery-front",
        reportId: "report-front",
        clubId: "club-1",
        outcome: "accepted",
        decidedWeek: 1,
        decidedSeason: 1,
      } as GameState["clubDecisions"][string],
    };

    const activeFront = buildDashboardCareerThreads(gameState)
      .find((thread) => thread.type === "active_front");

    expect(activeFront).toMatchObject({
      caseId: "case-front",
      playerId: "player-1",
      actionTarget: {
        screen: "reportHistory",
        caseId: "case-front",
      },
    });
    expect(activeFront?.title).toContain("pathway");
    expect(activeFront?.whatHappened.some((line) => line.startsWith("UNRESOLVED:"))).toBe(true);
    expect(activeFront?.careerImpact).toContain("without your follow-up");
  });

  it("projects a live relationship front into the career thread before the callback becomes history", () => {
    const gameState = state();
    gameState.scout = {
      id: "scout-1",
    } as GameState["scout"];
    gameState.contacts = {
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
    gameState.consequenceState = createConsequenceEngineState({
      decisions: {
        "relationship-front": {
          id: "relationship-front",
          source: { kind: "relationshipConflict", id: "family-versus-journalist-privacy" },
          offeredAt: { season: 1, week: 10 },
          deadlineAt: { season: 1, week: 10 },
          status: "selected",
          selectedOptionId: "protect-family",
          selectedAt: { season: 1, week: 10 },
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
          dueAt: { season: 1, week: 11 },
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
          createdAt: { season: 1, week: 10 },
          dueAt: { season: 1, week: 11 },
          sourceDecisionId: "relationship-front",
        },
      },
    });

    const thread = buildDashboardCareerThreads(gameState)
      .find((candidate) => candidate.type === "relationship_front");

    expect(thread).toMatchObject({
      decisionId: "relationship-front",
      playerId: "player-1",
      actionTarget: {
        screen: "reportHistory",
        caseId: "case-social",
      },
    });
    expect(thread?.title).toContain("Embargo Triangle");
    expect(thread?.whatHappened.some((line) => line.startsWith("LIVE FRONT:"))).toBe(true);
    expect(thread?.whatHappened.some((line) => line.startsWith("PRESSURE:"))).toBe(true);
  });
});
