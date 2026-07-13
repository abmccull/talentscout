import { describe, expect, it } from "vitest";

import type {
  HiddenIntel,
  NPCScoutReport,
  RecommendationReview,
  ScoutEvidenceClaim,
} from "@/engine/core/types";
import {
  calibrateEvidenceClaimFromReview,
  calibrateSourceEvidenceFromReview,
} from "@/engine/scout/sourceCalibration";

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
    expect(first.npcReports[report.id].evidenceClaims?.[0].calibration.status).toBe("supported");
    expect(first.contactIntel["player-1"][0].evidenceClaim?.calibration.status).toBe("supported");
    expect(first.contactIntel["player-2"]).toBeDefined();

    const second = calibrateSourceEvidenceFromReview({
      npcReports: first.npcReports,
      contactIntel: first.contactIntel,
      review: review(),
    });
    expect(second.calibratedClaimIds).toEqual([]);
    expect(second.npcReports).toEqual(first.npcReports);
    expect(second.contactIntel).toEqual(first.contactIntel);
  });
});
