import { describe, expect, it } from "vitest";

import { COURSE_CATALOG } from "@/engine/career/courses";
import {
  buildCareerTimeline,
  derivePredictionCareerStats,
  deriveTransferCareerStats,
  getCareerCourseSummary,
} from "@/components/game/career/careerScreenModel";

const businessFundamentals = COURSE_CATALOG.find((course) => course.id === "business_fundamentals");

describe("career screen model helpers", () => {
  it("returns completed-course count when no enrollment is active", () => {
    expect(getCareerCourseSummary({
      completedCourseCount: 3,
      currentWeek: 8,
      currentSeason: 2,
      scheduledStudySessions: 0,
      seasonLength: 38,
    })).toBe("3 completed");
  });

  it("flags planner-required study when an enrolled course has no sessions booked", () => {
    if (!businessFundamentals) {
      throw new Error("business_fundamentals course missing from catalog");
    }

    expect(getCareerCourseSummary({
      activeCourseDurationWeeks: businessFundamentals.durationWeeks,
      activeEnrollment: {
        courseId: businessFundamentals.id,
        startWeek: 10,
        startSeason: 1,
        completionWeek: 13,
        completionSeason: 1,
        studyWeeksCompleted: 0,
        requiredStudyWeeks: 4,
      },
      completedCourseCount: 1,
      currentWeek: 10,
      currentSeason: 1,
      scheduledStudySessions: 0,
      seasonLength: 38,
    })).toBe("0/4 study weeks banked - Planner study required");
  });

  it("counts only resolved transfer outcomes toward hit-rate metrics", () => {
    const stats = deriveTransferCareerStats([
      { id: "hit", outcome: "hit" },
      { id: "decent", outcome: "decent" },
      { id: "flop", outcome: "flop" },
      { id: "pending", outcome: "pending" },
    ] as never);

    expect(stats.completedTransfers).toHaveLength(3);
    expect(stats.hitCount).toBe(1);
    expect(stats.decentCount).toBe(1);
    expect(stats.flopCount).toBe(1);
    expect(stats.hitRate).toBe(33);
  });

  it("derives prediction accuracy and preserves the latest correct streak", () => {
    const stats = derivePredictionCareerStats([
      { id: "recent-hit", resolved: true, wasCorrect: true, madeInSeason: 3, madeInWeek: 8 },
      { id: "older-hit", resolved: true, wasCorrect: true, madeInSeason: 3, madeInWeek: 6 },
      { id: "older-miss", resolved: true, wasCorrect: false, madeInSeason: 3, madeInWeek: 4 },
      { id: "pending", resolved: false, madeInSeason: 3, madeInWeek: 9 },
    ] as never);

    expect(stats.resolvedPredictions).toHaveLength(3);
    expect(stats.correctPredictions).toHaveLength(2);
    expect(stats.predictionAccuracy).toBe(67);
    expect(stats.oracleStreak).toBe(2);
    expect(stats.isOracle).toBe(false);
  });

  it("builds reverse-chronological discovery, placement, and movement timeline entries", () => {
    const timeline = buildCareerTimeline({
      discoveryRecords: [{
        playerId: "player-1",
        discoveredSeason: 1,
        discoveredWeek: 3,
        placementSeason: 1,
        placementWeek: 8,
        placementClubId: "club-1",
        placementType: "academyIntake",
      }] as never,
      discoveredPlayerIds: new Set(["player-1"]),
      gameState: {
        players: {
          "player-1": {
            id: "player-1",
            firstName: "Milo",
            lastName: "Hart",
          },
        },
        clubs: {
          "club-1": {
            id: "club-1",
            name: "Northbridge",
            shortName: "NOR",
          },
          "club-2": {
            id: "club-2",
            name: "River City",
            shortName: "RIV",
          },
        },
        retiredPlayers: {},
        playerMovementHistory: [{
          id: "move-1",
          playerId: "player-1",
          fromClubId: "club-1",
          toClubId: "club-2",
          season: 2,
          week: 4,
          type: "permanentTransfer",
          fee: 1_250_000,
        }],
      } as never,
      playerFacingDiscoveryById: new Map([
        ["player-1", { isHighUpsideProjection: true }],
      ]),
    });

    expect(timeline).toHaveLength(3);
    expect(timeline.map((entry) => entry.label)).toEqual([
      "Transfer",
      "Placement",
      "Discovery",
    ]);
    expect(timeline[0]).toMatchObject({
      title: "Milo Hart",
      description: "NOR to RIV for £1.25M.",
    });
    expect(timeline[1]).toMatchObject({
      label: "Placement",
      tone: "blue",
    });
    expect(timeline[2]).toMatchObject({
      label: "Discovery",
      tone: "amber",
    });
  });
});
