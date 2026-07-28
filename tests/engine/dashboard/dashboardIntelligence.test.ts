import { describe, expect, it } from "vitest";

import type { GameState, RecommendationReview } from "@/engine/core/types";
import { buildDashboardCareerThreads } from "@/engine/dashboard/careerThreads";
import { generateDashboardInsights } from "@/engine/dashboard/insights";
import { buildOutcomeExplanations } from "@/engine/dashboard/outcomeExplanations";

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
});
