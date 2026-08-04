import { describe, expect, it } from "vitest";

import type {
  HiddenIntel,
  NPCScoutReport,
  RecommendationReview,
  ScoutEvidenceClaim,
} from "@/engine/core/types";
import {
  calibrateEvidenceClaimFromReview,
  calibrateSourceEvidenceFromReviews,
  calibrateSourceEvidenceFromReview,
} from "@/engine/scout/sourceCalibration";

function legacyCalibrateSourceEvidenceFromReviews(
  input: {
    npcReports: Record<string, NPCScoutReport>;
    contactIntel: Record<string, HiddenIntel[]>;
    reviews: readonly RecommendationReview[];
  },
) {
  const calibratedClaimIds: string[] = [];
  const calibratedClaimIdsByReviewId: Record<string, string[]> = {};

  const reviewsByPlayer = input.reviews.reduce<Map<string, RecommendationReview[]>>((map, currentReview) => {
    const existing = map.get(currentReview.playerId);
    if (existing) {
      existing.push(currentReview);
    } else {
      map.set(currentReview.playerId, [currentReview]);
    }
    return map;
  }, new Map());

  const npcReports = Object.fromEntries(
    Object.entries(input.npcReports).map(([id, report]) => {
      const reviews = reviewsByPlayer.get(report.playerId);
      if (!reviews?.length || !report.evidenceClaims?.length) {
        return [id, report];
      }
      const evidenceClaims = report.evidenceClaims.map((currentClaim) => {
        let claimResult = currentClaim;
        let reviewId: string | undefined;
        for (const currentReview of reviews) {
          const nextClaim = calibrateEvidenceClaimFromReview(claimResult, currentReview);
          if (nextClaim !== claimResult) {
            claimResult = nextClaim;
            reviewId = currentReview.id;
            break;
          }
          claimResult = nextClaim;
        }
        if (claimResult !== currentClaim) {
          calibratedClaimIds.push(currentClaim.id);
          if (reviewId) {
            calibratedClaimIdsByReviewId[reviewId] ??= [];
            calibratedClaimIdsByReviewId[reviewId].push(currentClaim.id);
          }
        }
        return claimResult;
      });
      return [id, evidenceClaims.some((currentClaim, index) => currentClaim !== report.evidenceClaims![index])
        ? { ...report, evidenceClaims }
        : report];
    }),
  );

  const contactIntel = Object.fromEntries(
    Object.entries(input.contactIntel).map(([playerId, entries]) => {
      const reviews = reviewsByPlayer.get(playerId);
      if (!reviews?.length) return [playerId, entries];
      const calibratedEntries = entries.map((entry) => {
        if (!entry.evidenceClaim) return entry;

        let claimResult = entry.evidenceClaim;
        let reviewId: string | undefined;
        for (const currentReview of reviews) {
          const nextClaim = calibrateEvidenceClaimFromReview(claimResult, currentReview);
          if (nextClaim !== claimResult) {
            claimResult = nextClaim;
            reviewId = currentReview.id;
            break;
          }
          claimResult = nextClaim;
        }
        if (claimResult === entry.evidenceClaim) return entry;

        calibratedClaimIds.push(entry.evidenceClaim.id);
        if (reviewId) {
          calibratedClaimIdsByReviewId[reviewId] ??= [];
          calibratedClaimIdsByReviewId[reviewId].push(entry.evidenceClaim.id);
        }
        return { ...entry, evidenceClaim: claimResult };
      });
      return [playerId, calibratedEntries.some((entry, index) => entry !== entries[index])
        ? calibratedEntries
        : entries];
    }),
  );

  return {
    npcReports,
    contactIntel,
    calibratedClaimIds: [...new Set(calibratedClaimIds)],
    calibratedClaimIdsByReviewId: Object.fromEntries(
      Object.entries(calibratedClaimIdsByReviewId).map(([reviewId, claimIds]) => [
        reviewId,
        [...new Set(claimIds)],
      ]),
    ),
  };
}

function claim(
  overrides: Partial<ScoutEvidenceClaim> = {},
): ScoutEvidenceClaim {
  return {
    id: "claim-readiness",
    playerId: "player-1",
    sourceId: "report-1",
    sourceName: "Morgan Vale",
    sourceKind: "npcScout",
    category: "readiness",
    direction: "positive",
    range: { scale: "qualitative", label: "strong" },
    confidence: 0.78,
    statement: "The player is ready to contribute.",
    explanation: "Immediate-impact lens with an aggressive threshold.",
    recordedWeek: 8,
    recordedSeason: 1,
    perspective: {
      actorId: "npc-1",
      actorKind: "npcScout",
      lens: "immediateImpact",
      riskTolerance: "bold",
      reliabilityBand: "established",
      biases: [],
    },
    calibration: {
      status: "uncalibrated",
      note: "No observable outcome yet.",
    },
    ...overrides,
  };
}

function review(overrides: Partial<RecommendationReview> = {}): RecommendationReview {
  return {
    id: "review-1",
    caseId: "case-1",
    reportId: "player-report-1",
    playerId: "player-1",
    clubId: "club-1",
    checkpoint: "oneSeason",
    dueWeek: 8,
    dueSeason: 2,
    status: "complete",
    completedWeek: 8,
    completedSeason: 2,
    overallScore: 82,
    clubFitScore: 76,
    ...overrides,
  };
}

describe("source evidence calibration", () => {
  it("supports or challenges readiness and role-fit claims from observable scores", () => {
    const supported = calibrateEvidenceClaimFromReview(claim(), review());
    expect(supported.calibration).toMatchObject({
      status: "supported",
      reviewedWeek: 8,
      reviewedSeason: 2,
    });
    expect(supported.calibration.note).toContain("82/100");

    const challenged = calibrateEvidenceClaimFromReview(
      claim({ id: "claim-role", category: "roleFit", direction: "negative" }),
      review(),
    );
    expect(challenged.calibration.status).toBe("challenged");
    expect(challenged.calibration.note).toContain("76/100");
  });

  it("calibrates durability only from persisted injury evidence", () => {
    const injuryReview = review() as RecommendationReview & {
      evidenceLevel: "full";
      outcomeEvidence: {
        weeksMissed: number;
        injuryCount: number;
      };
    };
    injuryReview.evidenceLevel = "full";
    injuryReview.outcomeEvidence = { weeksMissed: 9, injuryCount: 2 };

    const calibrated = calibrateEvidenceClaimFromReview(
      claim({
        id: "claim-durability",
        category: "injuryProneness",
        direction: "negative",
      }),
      injuryReview,
    );
    expect(calibrated.calibration.status).toBe("supported");
    expect(calibrated.calibration.note).toContain("9 recovery weeks");
  });

  it("calibrates adaptability only from persisted support/adaptation review feedback", () => {
    const adaptable = review({
      playerFacingDimensions: [{
        key: "supportAdaptationFit",
        label: "Support/adaptation fit",
        status: "positive",
        evidenceLevel: "partial",
        score: 78,
        summary: "The destination club supported adaptation with a working senior loan route.",
      }],
    });

    const calibrated = calibrateEvidenceClaimFromReview(
      claim({
        id: "claim-adaptability",
        category: "adaptability",
        direction: "positive",
      }),
      adaptable,
    );
    expect(calibrated.calibration.status).toBe("supported");
    expect(calibrated.calibration.note).toContain("78/100");
  });

  it("leaves character, potential, and insufficient injury evidence uncalibrated", () => {
    const potential = claim({ category: "potential" });
    expect(calibrateEvidenceClaimFromReview(potential, review())).toBe(potential);

    const limited = review() as RecommendationReview & {
      evidenceLevel: "limited";
      outcomeEvidence: { weeksMissed: number; injuryCount: number };
    };
    limited.evidenceLevel = "limited";
    limited.outcomeEvidence = { weeksMissed: 0, injuryCount: 0 };
    const durability = claim({ category: "durability" });
    expect(calibrateEvidenceClaimFromReview(durability, limited)).toBe(durability);
  });

  it("never uses a future claim and never rewrites an existing calibration", () => {
    const future = claim({ recordedSeason: 3, recordedWeek: 1 });
    expect(calibrateEvidenceClaimFromReview(future, review())).toBe(future);

    const alreadyCalibrated = claim({
      calibration: { status: "challenged", note: "Earlier checkpoint." },
    });
    expect(calibrateEvidenceClaimFromReview(alreadyCalibrated, review())).toBe(alreadyCalibrated);
  });

  it("updates matching NPC and contact claims exactly once without touching other players", () => {
    const readinessClaim = claim();
    const report: NPCScoutReport = {
      id: "report-1",
      npcScoutId: "npc-1",
      playerId: "player-1",
      week: 8,
      season: 1,
      quality: 78,
      summary: "Ready now.",
      recommendation: "pursue",
      reviewed: true,
      evidenceClaims: [readinessClaim],
    };
    const intel: HiddenIntel = {
      playerId: "player-1",
      attribute: "injuryProneness",
      hint: "Availability has been dependable.",
      reliability: 0.7,
      evidenceClaim: claim({
        id: "claim-contact-readiness",
        sourceId: "contact-1",
        sourceKind: "contact",
      }),
    };

    const first = calibrateSourceEvidenceFromReview({
      npcReports: { [report.id]: report },
      contactIntel: {
        "player-1": [intel],
        "player-2": [{ ...intel, playerId: "player-2", evidenceClaim: undefined }],
      },
      review: review(),
    });
    expect(first.calibratedClaimIds.sort()).toEqual([
      "claim-contact-readiness",
      "claim-readiness",
    ]);
    expect(first.calibratedClaimIdsByReviewId).toEqual({
      "review-1": ["claim-readiness", "claim-contact-readiness"],
    });
    expect(first.npcReports[report.id].evidenceClaims?.[0].calibration.status).toBe("supported");
    expect(first.contactIntel["player-1"][0].evidenceClaim?.calibration.status).toBe("supported");
    expect(first.contactIntel["player-2"]).toBeDefined();

    const second = calibrateSourceEvidenceFromReview({
      npcReports: first.npcReports,
      contactIntel: first.contactIntel,
      review: review(),
    });
    expect(second.calibratedClaimIds).toEqual([]);
    expect(second.calibratedClaimIdsByReviewId).toEqual({});
    expect(second.npcReports).toEqual(first.npcReports);
    expect(second.contactIntel).toEqual(first.contactIntel);
  });

  it("matches repeated single-review calibration when applying ordered reviews in batch", () => {
    const playerOneReportClaim = claim();
    const playerOneContactClaim = claim({
      id: "claim-contact-player-1",
      sourceId: "contact-1",
      sourceKind: "contact",
    });
    const playerTwoReportClaim = claim({
      id: "claim-player-2",
      playerId: "player-2",
      sourceId: "report-2",
    });
    const playerTwoContactClaim = claim({
      id: "claim-contact-player-2",
      playerId: "player-2",
      sourceId: "contact-2",
      sourceKind: "contact",
      category: "adaptability",
      direction: "negative",
    });
    const baseNpcReports: Record<string, NPCScoutReport> = {
      "report-1": {
        id: "report-1",
        npcScoutId: "npc-1",
        playerId: "player-1",
        week: 8,
        season: 1,
        quality: 78,
        summary: "Ready now.",
        recommendation: "pursue",
        reviewed: true,
        evidenceClaims: [playerOneReportClaim],
      },
      "report-2": {
        id: "report-2",
        npcScoutId: "npc-2",
        playerId: "player-2",
        week: 9,
        season: 1,
        quality: 74,
        summary: "Should adapt quickly.",
        recommendation: "monitor",
        reviewed: true,
        evidenceClaims: [playerTwoReportClaim],
      },
    };
    const baseContactIntel: Record<string, HiddenIntel[]> = {
      "player-1": [{
        playerId: "player-1",
        attribute: "injuryProneness",
        hint: "Availability has been dependable.",
        reliability: 0.7,
        evidenceClaim: playerOneContactClaim,
      }],
      "player-2": [{
        playerId: "player-2",
        attribute: "professionalism",
        hint: "The move has been rocky.",
        reliability: 0.67,
        evidenceClaim: playerTwoContactClaim,
      }],
    };
    const reviews = [
      review(),
      review({
        id: "review-2",
        playerId: "player-2",
        reportId: "player-report-2",
        overallScore: 52,
        playerFacingDimensions: [{
          key: "supportAdaptationFit",
          label: "Support/adaptation fit",
          status: "negative",
          evidenceLevel: "full",
          score: 34,
          summary: "The destination club left the player isolated.",
        }],
      }),
    ] as const;

    let sequential = {
      npcReports: baseNpcReports,
      contactIntel: baseContactIntel,
      calibratedClaimIds: [] as string[],
      calibratedClaimIdsByReviewId: {} as Record<string, string[]>,
    };
    for (const currentReview of reviews) {
      const result = calibrateSourceEvidenceFromReview({
        npcReports: sequential.npcReports,
        contactIntel: sequential.contactIntel,
        review: currentReview,
      });
      sequential = {
        npcReports: result.npcReports,
        contactIntel: result.contactIntel,
        calibratedClaimIds: [...sequential.calibratedClaimIds, ...result.calibratedClaimIds],
        calibratedClaimIdsByReviewId: Object.fromEntries(
          [...Object.entries(sequential.calibratedClaimIdsByReviewId), ...Object.entries(result.calibratedClaimIdsByReviewId)]
            .reduce<Map<string, string[]>>((map, [reviewId, claimIds]) => {
              map.set(reviewId, [...(map.get(reviewId) ?? []), ...claimIds]);
              return map;
            }, new Map())
            .entries(),
        ),
      };
    }

    const batched = calibrateSourceEvidenceFromReviews({
      npcReports: baseNpcReports,
      contactIntel: baseContactIntel,
      reviews,
    });

    expect(batched.npcReports).toEqual(sequential.npcReports);
    expect(batched.contactIntel).toEqual(sequential.contactIntel);
    expect(batched.calibratedClaimIds.sort()).toEqual(
      [...new Set(sequential.calibratedClaimIds)].sort(),
    );
    expect(batched.calibratedClaimIdsByReviewId).toEqual(sequential.calibratedClaimIdsByReviewId);
  });

  it("keeps the first valid checkpoint immutable in ordered batch calibration", () => {
    const readinessClaim = claim({
      direction: "mixed",
    });
    const baseNpcReports: Record<string, NPCScoutReport> = {
      "report-1": {
        id: "report-1",
        npcScoutId: "npc-1",
        playerId: "player-1",
        week: 8,
        season: 1,
        quality: 78,
        summary: "Borderline ready.",
        recommendation: "monitor",
        reviewed: true,
        evidenceClaims: [readinessClaim],
      },
    };
    const firstCheckpoint = review({
      id: "review-1",
      overallScore: 58,
      completedWeek: 8,
      completedSeason: 2,
    });
    const laterCheckpoint = review({
      id: "review-2",
      checkpoint: "twoSeasons",
      dueSeason: 3,
      completedWeek: 8,
      completedSeason: 3,
      overallScore: 82,
    });

    const batched = calibrateSourceEvidenceFromReviews({
      npcReports: baseNpcReports,
      contactIntel: {},
      reviews: [firstCheckpoint, laterCheckpoint],
    });

    expect(batched.npcReports["report-1"].evidenceClaims?.[0].calibration).toMatchObject({
      status: "supported",
      reviewedWeek: 8,
      reviewedSeason: 2,
    });
    expect(batched.npcReports["report-1"].evidenceClaims?.[0].calibration.note).toContain("one-season");
    expect(batched.calibratedClaimIds).toEqual(["claim-readiness"]);
    expect(batched.calibratedClaimIdsByReviewId).toEqual({
      "review-1": ["claim-readiness"],
    });
  });

  it("preserves top-level references when no claims are calibrated", () => {
    const baseNpcReports: Record<string, NPCScoutReport> = {
      "report-1": {
        id: "report-1",
        npcScoutId: "npc-1",
        playerId: "player-1",
        week: 8,
        season: 1,
        quality: 78,
        summary: "Long-term upside only.",
        recommendation: "monitor",
        reviewed: true,
        evidenceClaims: [claim({ category: "potential" })],
      },
    };
    const baseContactIntel: Record<string, HiddenIntel[]> = {
      "player-1": [{
        playerId: "player-1",
        attribute: "professionalism",
        hint: "Interesting habits, no hard proof yet.",
        reliability: 0.67,
        evidenceClaim: claim({
          id: "claim-contact-potential",
          category: "potential",
          sourceId: "contact-1",
          sourceKind: "contact",
        }),
      }],
    };

    const result = calibrateSourceEvidenceFromReviews({
      npcReports: baseNpcReports,
      contactIntel: baseContactIntel,
      reviews: [review()],
    });

    expect(result.calibratedClaimIds).toEqual([]);
    expect(result.calibratedClaimIdsByReviewId).toEqual({});
    expect(result.npcReports).toBe(baseNpcReports);
    expect(result.contactIntel).toBe(baseContactIntel);
  });

  it("clones only the changed branches during batch calibration", () => {
    const changedClaim = claim();
    const unchangedClaim = claim({
      id: "claim-unchanged",
      playerId: "player-2",
      sourceId: "report-2",
      category: "potential",
    });
    const changedReport: NPCScoutReport = {
      id: "report-1",
      npcScoutId: "npc-1",
      playerId: "player-1",
      week: 8,
      season: 1,
      quality: 78,
      summary: "Ready now.",
      recommendation: "pursue",
      reviewed: true,
      evidenceClaims: [changedClaim],
    };
    const unchangedReport: NPCScoutReport = {
      id: "report-2",
      npcScoutId: "npc-2",
      playerId: "player-2",
      week: 9,
      season: 1,
      quality: 74,
      summary: "Still a projection.",
      recommendation: "monitor",
      reviewed: true,
      evidenceClaims: [unchangedClaim],
    };
    const changedIntel: HiddenIntel = {
      playerId: "player-1",
      attribute: "injuryProneness",
      hint: "Availability has been dependable.",
      reliability: 0.7,
      evidenceClaim: claim({
        id: "claim-contact-readiness",
        sourceId: "contact-1",
        sourceKind: "contact",
      }),
    };
    const unchangedIntel: HiddenIntel = {
      playerId: "player-2",
      attribute: "professionalism",
      hint: "Still reading the room.",
      reliability: 0.61,
      evidenceClaim: claim({
        id: "claim-contact-unchanged",
        playerId: "player-2",
        category: "potential",
        sourceId: "contact-2",
        sourceKind: "contact",
      }),
    };
    const baseNpcReports = {
      "report-1": changedReport,
      "report-2": unchangedReport,
    };
    const baseContactIntel = {
      "player-1": [changedIntel],
      "player-2": [unchangedIntel],
    };

    const result = calibrateSourceEvidenceFromReviews({
      npcReports: baseNpcReports,
      contactIntel: baseContactIntel,
      reviews: [review()],
    });

    expect(result.npcReports).not.toBe(baseNpcReports);
    expect(result.contactIntel).not.toBe(baseContactIntel);
    expect(result.npcReports["report-1"]).not.toBe(changedReport);
    expect(result.npcReports["report-2"]).toBe(unchangedReport);
    expect(result.npcReports["report-1"].evidenceClaims).not.toBe(changedReport.evidenceClaims);
    expect(result.npcReports["report-2"].evidenceClaims).toBe(unchangedReport.evidenceClaims);
    expect(result.contactIntel["player-1"]).not.toBe(baseContactIntel["player-1"]);
    expect(result.contactIntel["player-2"]).toBe(baseContactIntel["player-2"]);
    expect(result.contactIntel["player-1"][0]).not.toBe(changedIntel);
    expect(result.contactIntel["player-2"][0]).toBe(unchangedIntel);
  });

  it("matches the legacy eager batch output across multiple ordered reviews", () => {
    const baseNpcReports: Record<string, NPCScoutReport> = {
      "report-1": {
        id: "report-1",
        npcScoutId: "npc-1",
        playerId: "player-1",
        week: 8,
        season: 1,
        quality: 78,
        summary: "Ready now.",
        recommendation: "pursue",
        reviewed: true,
        evidenceClaims: [
          claim(),
          claim({
            id: "claim-rolefit",
            category: "roleFit",
            direction: "negative",
          }),
        ],
      },
      "report-2": {
        id: "report-2",
        npcScoutId: "npc-2",
        playerId: "player-2",
        week: 9,
        season: 1,
        quality: 74,
        summary: "Should adapt quickly.",
        recommendation: "monitor",
        reviewed: true,
        evidenceClaims: [claim({
          id: "claim-player-2",
          playerId: "player-2",
          sourceId: "report-2",
          category: "adaptability",
          direction: "negative",
        })],
      },
    };
    const baseContactIntel: Record<string, HiddenIntel[]> = {
      "player-1": [{
        playerId: "player-1",
        attribute: "injuryProneness",
        hint: "Availability has been dependable.",
        reliability: 0.7,
        evidenceClaim: claim({
          id: "claim-contact-player-1",
          sourceId: "contact-1",
          sourceKind: "contact",
        }),
      }],
      "player-2": [{
        playerId: "player-2",
        attribute: "professionalism",
        hint: "The move has been rocky.",
        reliability: 0.67,
        evidenceClaim: claim({
          id: "claim-contact-player-2",
          playerId: "player-2",
          sourceId: "contact-2",
          sourceKind: "contact",
          category: "adaptability",
          direction: "negative",
        }),
      }],
    };
    const reviews = [
      review(),
      review({
        id: "review-2",
        playerId: "player-2",
        reportId: "player-report-2",
        overallScore: 52,
        playerFacingDimensions: [{
          key: "supportAdaptationFit",
          label: "Support/adaptation fit",
          status: "negative",
          evidenceLevel: "full",
          score: 34,
          summary: "The destination club left the player isolated.",
        }],
      }),
      review({
        id: "review-3",
        playerId: "player-1",
        checkpoint: "twoSeasons",
        dueSeason: 3,
        completedWeek: 8,
        completedSeason: 3,
        overallScore: 91,
      }),
    ] as const;

    const result = calibrateSourceEvidenceFromReviews({
      npcReports: baseNpcReports,
      contactIntel: baseContactIntel,
      reviews,
    });
    const legacy = legacyCalibrateSourceEvidenceFromReviews({
      npcReports: baseNpcReports,
      contactIntel: baseContactIntel,
      reviews,
    });

    expect(result).toEqual(legacy);
  });
});
