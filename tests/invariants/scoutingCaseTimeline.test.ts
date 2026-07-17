import { describe, expect, it } from "vitest";

import type { GameState } from "@/engine/core/types";
import { buildScoutingCaseTimeline } from "@/engine/reports/scoutingCaseTimeline";

function caseState(): GameState {
  return {
    clubs: {
      "club-a": { id: "club-a", name: "Northbridge Academy" },
      "club-b": { id: "club-b", name: "Harbour United" },
    },
    scoutingCases: {
      "case-1": {
        id: "case-1",
        playerId: "player-1",
        scoutId: "scout-1",
        openedWeek: 2,
        openedSeason: 1,
        lastUpdatedWeek: 12,
        lastUpdatedSeason: 2,
        status: "placed",
        reportIds: ["report-1"],
        listingIds: [],
        deliveryIds: ["delivery-1"],
        decisionIds: ["decision-1"],
        placementReportIds: ["placement-1"],
        reviewIds: ["review-1"],
        alumniRecordId: "alumni-1",
      },
    },
    reports: {
      "report-1": {
        id: "report-1",
        playerId: "player-1",
        scoutId: "scout-1",
        submittedWeek: 3,
        submittedSeason: 1,
        attributeAssessments: [],
        strengths: [],
        weaknesses: [],
        conviction: "strongRecommend",
        summary: "A patient development case with a clear next step.",
        estimatedValue: 100_000,
        qualityScore: 73,
        validationSnapshot: { finishing: 20 },
      },
      "unrelated-report": {
        id: "unrelated-report",
        caseId: "case-2",
        playerId: "player-2",
        scoutId: "scout-1",
        submittedWeek: 3,
        submittedSeason: 1,
        attributeAssessments: [],
        strengths: [],
        weaknesses: [],
        conviction: "note",
        summary: "This must not appear.",
        estimatedValue: 0,
        qualityScore: 10,
      },
    },
    reportDeliveries: {
      "delivery-1": {
        id: "delivery-1",
        caseId: "legacy-case-id",
        reportId: "report-1",
        clubId: "club-a",
        channel: "directPlacement",
        status: "resolved",
        deliveredWeek: 4,
        deliveredSeason: 1,
      },
    },
    clubDecisions: {
      "decision-1": {
        id: "decision-1",
        caseId: "legacy-case-id",
        deliveryId: "delivery-1",
        reportId: "report-1",
        clubId: "club-a",
        outcome: "accepted",
        decidedWeek: 5,
        decidedSeason: 1,
        reasons: ["The evidence matched the academy's development need."],
      },
    },
    recommendationReviews: {
      "review-1": {
        id: "review-1",
        caseId: "legacy-case-id",
        reportId: "report-1",
        playerId: "player-1",
        clubId: "club-a",
        checkpoint: "oneSeason",
        dueWeek: 12,
        dueSeason: 2,
        status: "complete",
        completedWeek: 12,
        completedSeason: 2,
        overallScore: 84,
        playerFacingDimensions: [{
          key: "pathwayQuality",
          label: "Pathway quality",
          status: "positive",
          evidenceLevel: "full",
          score: 81,
          summary: "Reached first-team football by age 18 with 24 appearances at 7.2.",
        }, {
          key: "revisionQuality",
          label: "Revision quality",
          status: "insufficientEvidence",
          evidenceLevel: "limited",
          summary: "No later revision was preserved before this checkpoint, so revision quality cannot be judged.",
        }],
        findings: [
          "Pathway quality: Reached first-team football by age 18 with 24 appearances at 7.2.",
          "Revision quality: No later revision was preserved before this checkpoint, so revision quality cannot be judged.",
        ],
      },
    },
    alumniRecords: [{
      id: "alumni-1",
      caseId: "case-1",
      playerId: "player-1",
      placedClubId: "club-a",
      currentClubId: "club-b",
      milestones: [{
        type: "firstTeamDebut",
        week: 8,
        season: 2,
        description: "Made a senior debut after progressing through the academy.",
        notified: true,
      }, {
        type: "transfer",
        week: 10,
        season: 2,
        description: "Transferred to Harbour United.",
        notified: true,
      }],
      careerSnapshots: [{
        season: 2,
        clubId: "club-b",
        currentAbility: 196,
        position: "CM",
        age: 18,
      }],
      placedWeek: 5,
      placedSeason: 1,
      careerUpdates: [{
        week: 9,
        season: 2,
        type: "teamOfWeek",
        description: "Earned a place in the Team of the Week.",
      }, {
        week: 10,
        season: 2,
        type: "transfer",
        description: "Moved to Harbour United.",
      }],
      currentStatus: "transferred",
      seasonStats: [],
      becameContact: false,
    }],
    playerMovementHistory: [{
      id: "movement-signing",
      playerId: "player-1",
      type: "youthSigning",
      week: 5,
      season: 1,
      toClubId: "club-a",
    }, {
      id: "movement-transfer",
      playerId: "player-1",
      type: "permanentTransfer",
      week: 10,
      season: 2,
      fromClubId: "club-a",
      toClubId: "club-b",
      fee: 1_500_000,
    }, {
      id: "movement-before-case",
      playerId: "player-1",
      type: "freeAgentSigning",
      week: 1,
      season: 1,
      toClubId: "club-b",
    }],
    reflectionJournal: {
      "reflection-1": {
        id: "reflection-1",
        sessionId: "session-1",
        activityType: "attendMatch",
        week: 2,
        season: 1,
        playerIds: ["player-1"],
        notes: ["Responded well after an early mistake."],
        hypotheses: [],
        createdAt: 1,
      },
    },
    discoveryRecords: [{
      playerId: "player-1",
      discoveredWeek: 1,
      discoveredSeason: 1,
      initialCA: 197,
      initialPA: 198,
      careerSnapshots: [],
      wasWonderkid: true,
    }],
  } as unknown as GameState;
}

describe("scouting case timeline", () => {
  it("joins the durable case spine into one chronological player-safe history", () => {
    const timeline = buildScoutingCaseTimeline(caseState(), "case-1");

    expect(timeline).not.toBeNull();
    expect(timeline?.entries.map((entry) => entry.kind)).toEqual([
      "discovery",
      "reflection",
      "report",
      "delivery",
      "decision",
      "alumni",
      "movement",
      "milestone",
      "alumni",
      "movement",
      "review",
    ]);
    expect(timeline?.entries.map((entry) => `${entry.season}:${entry.week}`)).toEqual([
      "1:1",
      "1:2",
      "1:3",
      "1:4",
      "1:5",
      "1:5",
      "1:5",
      "2:8",
      "2:9",
      "2:10",
      "2:12",
    ]);
    expect(timeline?.entries.some((entry) => entry.description.includes("must not appear"))).toBe(false);
    expect(timeline?.entries.some((entry) => entry.id === "movement:movement-before-case")).toBe(false);
    expect(timeline?.entries.filter((entry) => entry.title.includes("transfer"))).toHaveLength(1);
    const reviewEntry = timeline?.entries.find((entry) => entry.id === "review:review-1");
    expect(reviewEntry?.description).toBe("Observable review completed at 84/100.");
    expect(reviewEntry?.details).toEqual([
      "Pathway quality: Reached first-team football by age 18 with 24 appearances at 7.2.",
      "Revision quality: No later revision was preserved before this checkpoint, so revision quality cannot be judged.",
    ]);

    const serialized = JSON.stringify(timeline);
    expect(serialized).not.toContain("validationSnapshot");
    expect(serialized).not.toContain("currentAbility");
    expect(serialized).not.toContain("initialCA");
    expect(serialized).not.toContain("initialPA");
    expect(serialized).not.toContain("wasWonderkid");
  });

  it("returns null for an unknown case without inventing a replacement history", () => {
    expect(buildScoutingCaseTimeline(caseState(), "missing-case")).toBeNull();
  });
});
