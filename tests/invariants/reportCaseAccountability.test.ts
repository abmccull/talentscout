import { describe, expect, it } from "vitest";

import type { GameState, Scout, ScoutReport } from "@/engine/core/types";
import {
  calculatePerformanceReview,
  updateReputation,
} from "@/engine/career/progression";
import {
  applyPulseConsequences,
  generatePerformancePulse,
} from "@/engine/career/performancePulse";
import { hasSuccessfulSigningResponseThisWeek } from "@/engine/core/gameLoop";
import { generateSeasonAwardsData } from "@/engine/core/seasonAwards";
import { EVENT_TEMPLATES } from "@/engine/events/eventTemplates";
import { checkPlacementFeeEligibility } from "@/engine/finance/placementFees";
import { getRemainingTablePounds } from "@/engine/reports/conviction";
import {
  calculateReportAccountabilityMetrics,
  groupReportRevisionsByCase,
  selectMatureReportCasesForValidation,
  selectLatestReportsByCase,
  selectLatestReportsByCaseOpenedInRange,
} from "@/engine/reports/reportAccountability";
import { validateMatureReportCasesAtSeasonEnd } from "@/stores/actions/weeklySeasonRollover";

function report(
  id: string,
  caseId: string,
  playerId: string,
  week: number,
  revision: number,
  qualityScore = 70,
): ScoutReport {
  return {
    id,
    caseId,
    playerId,
    scoutId: "scout-1",
    submittedWeek: week,
    submittedSeason: 1,
    revision,
    attributeAssessments: [],
    strengths: [],
    weaknesses: [],
    conviction: "recommend",
    summary: id,
    estimatedValue: 0,
    qualityScore,
  } as ScoutReport;
}

describe("report case accountability", () => {
  it("keeps revisions in history while counting only newly opened cases", () => {
    const original = report("case-a-r1", "case-a", "player-a", 1, 1, 50);
    const revision = {
      ...report("case-a-r2", "case-a", "player-a", 7, 2, 99),
      supersedesReportId: original.id,
    };
    const newCase = report("case-b-r1", "case-b", "player-b", 6, 1, 72);
    const reports = [original, revision, newCase];

    expect(selectLatestReportsByCase(reports).map((item) => item.id).sort()).toEqual([
      revision.id,
      newCase.id,
    ].sort());
    expect(selectLatestReportsByCaseOpenedInRange(
      reports,
      { submittedWeek: 5, submittedSeason: 1 },
      { submittedWeek: 8, submittedSeason: 1 },
    ).map((item) => item.id)).toEqual([newCase.id]);

    const grouped = groupReportRevisionsByCase(reports);
    expect(grouped.find((item) => item.caseKey === "case-a")).toMatchObject({
      latestReport: { id: revision.id },
      wasPreviouslyValidated: false,
    });
    expect(grouped.find((item) => item.caseKey === "case-a")?.revisions).toHaveLength(2);
  });

  it("does not let an old-case revision inflate a monthly performance pulse", () => {
    const scout = {
      id: "scout-1",
      fatigue: 20,
      reputation: 50,
      accuracyHistory: [],
      performancePulses: [],
    } as unknown as Scout;
    const original = report("old-r1", "old-case", "player-a", 1, 1, 45);
    const revision = report("old-r2", "old-case", "player-a", 7, 2, 99);
    const newCase = report("new-r1", "new-case", "player-b", 6, 1, 72);
    const state = {
      currentWeek: 8,
      currentSeason: 1,
      reports: {
        [original.id]: original,
        [revision.id]: revision,
        [newCase.id]: newCase,
      },
      discoveryRecords: [],
    } as unknown as GameState;

    const pulse = generatePerformancePulse(state, scout);

    expect(pulse.reportsSubmitted).toBe(1);
    expect(pulse.reportQualityAvg).toBe(72);
  });

  it("treats active professional study as neutral work rather than inactivity", () => {
    const scout = {
      id: "scout-learning",
      fatigue: 20,
      reputation: 31.564,
      accuracyHistory: [],
      performancePulses: [],
    } as unknown as Scout;
    const state = {
      currentWeek: 4,
      currentSeason: 1,
      reports: {},
      discoveryRecords: [],
      inbox: [],
      finances: {
        activeEnrollment: {
          courseId: "fa_level_1",
          startWeek: 1,
          startSeason: 1,
          completionWeek: 5,
          completionSeason: 1,
        },
      },
    } as unknown as GameState;

    const pulse = generatePerformancePulse(state, scout);
    const applied = applyPulseConsequences(scout, pulse, 4, 1);

    expect(pulse).toMatchObject({
      reportsSubmitted: 0,
      professionalDevelopment: true,
      grade: "C",
    });
    expect(applied.scout.reputation).toBe(31.564);
    expect(applied.messages[0]?.body).toContain("Professional development: active");
  });

  it("uses the active revision for transfer rewards and narrative volume gates", () => {
    const original = {
      ...report("fee-r1", "fee-case", "player-a", 1, 1),
      conviction: "tablePound" as const,
    };
    const revision = {
      ...report("fee-r2", "fee-case", "player-a", 2, 2),
      conviction: "recommend" as const,
    };
    const reports = {
      [original.id]: original,
      [revision.id]: revision,
    };

    const transfer = {
      playerId: "player-a",
      fromClubId: "club-b",
      toClubId: "club-a",
      fee: 1_000_000,
      week: 3,
      season: 1,
    };
    const eligibility = checkPlacementFeeEligibility({
      currentWeek: 3,
      currentSeason: 1,
      reports,
      reportDeliveries: {
        delivery: {
          id: "delivery",
          caseId: "fee-case",
          reportId: revision.id,
          clubId: "club-a",
          channel: "marketplaceSale",
          status: "delivered",
          deliveredWeek: 2,
          deliveredSeason: 1,
        },
      },
      playerMovementHistory: [{
        id: "movement",
        playerId: "player-a",
        type: "permanentTransfer",
        fromClubId: "club-b",
        toClubId: "club-a",
        fee: transfer.fee,
        week: transfer.week,
        season: transfer.season,
      }],
    }, transfer, "scout-1");

    expect(eligibility?.report.id).toBe(revision.id);

    const lateBlooming = EVENT_TEMPLATES.find(
      (template) => template.type === "lateBloomingSurprise",
    );
    const fiveRevisions = Object.fromEntries(
      Array.from({ length: 5 }, (_, index) => {
        const item = report(
          `same-case-r${index + 1}`,
          "same-case",
          "player-a",
          index + 1,
          index + 1,
        );
        return [item.id, item];
      }),
    );
    expect(lateBlooming?.prerequisites({ reports: fiveRevisions } as GameState)).toBe(false);
  });

  it("consumes one table-pound allowance per case and never restores it by revision", () => {
    const firstStake = {
      ...report("stake-r1", "stake-case", "player-a", 3, 1),
      conviction: "tablePound" as const,
    };
    const repeatedStake = {
      ...report("stake-r2", "stake-case", "player-a", 4, 2),
      conviction: "tablePound" as const,
    };
    const loweredRevision = {
      ...report("stake-r3", "stake-case", "player-a", 5, 3),
      conviction: "recommend" as const,
    };

    expect(getRemainingTablePounds({
      reports: [firstStake, repeatedStake, loweredRevision],
      scoutId: "scout-1",
      season: 1,
      careerTier: 1,
    })).toBe(0);
  });

  it("attributes season volume to cases opened that season, not old-case revisions", () => {
    const oldCase = report("old-season-r1", "old-season-case", "player-a", 20, 1, 40);
    const oldCaseRevision = {
      ...report("old-season-r2", "old-season-case", "player-a", 2, 2, 99),
      submittedSeason: 2,
    };
    const newCase = {
      ...report("new-season-r1", "new-season-case", "player-b", 3, 1, 72),
      submittedSeason: 2,
    };
    const scout = {
      id: "scout-1",
      careerTier: 1,
      reputation: 50,
      fatigue: 25,
      salary: 0,
      countryReputations: { england: 10 },
    } as unknown as Scout;

    const review = calculatePerformanceReview(
      scout,
      [oldCase, oldCaseRevision, newCase],
      2,
    );
    expect(review.reportsSubmitted).toBe(1);
    expect(review.averageQuality).toBe(72);

    const awards = generateSeasonAwardsData({
      reports: {
        [oldCase.id]: oldCase,
        [oldCaseRevision.id]: oldCaseRevision,
        [newCase.id]: newCase,
      },
      observations: {},
      discoveryRecords: [],
      performanceReviews: [],
      scout,
      clubs: {},
      players: {},
      fixtures: {},
      unsignedYouth: {},
      subRegions: {},
      placementReports: {},
      alumniRecords: [],
      scoutingCases: {},
    } as unknown as GameState, 2);
    expect(awards.stats.reportsSubmitted).toBe(1);
    expect(awards.stats.avgReportQuality).toBe(72);
  });

  it("requires a same-week authoritative movement before signing reputation can pay", () => {
    const signedReport = report("signed-report", "signed-case", "player-1", 5, 1);
    const response = {
      reportId: "signed-report",
      response: "signed" as const,
      feedback: "Approved",
      reputationDelta: 2,
      week: 6,
      season: 1,
    };
    const base = {
      clubResponses: [response],
      reports: { [signedReport.id]: signedReport },
      playerMovementHistory: [],
    };
    expect(hasSuccessfulSigningResponseThisWeek({
      ...base,
      currentWeek: 6,
      currentSeason: 1,
    })).toBe(false);

    const withRegisteredMovement = {
      ...base,
      playerMovementHistory: [{
        id: "movement-1",
        playerId: "player-1",
        type: "permanentTransfer" as const,
        fromClubId: "club-a",
        toClubId: "club-b",
        fee: 1_000_000,
        week: 6,
        season: 1,
      }],
    };
    expect(hasSuccessfulSigningResponseThisWeek({
      ...withRegisteredMovement,
      currentWeek: 6,
      currentSeason: 1,
    })).toBe(true);
    expect(hasSuccessfulSigningResponseThisWeek({
      ...withRegisteredMovement,
      currentWeek: 7,
      currentSeason: 1,
    })).toBe(false);
  });

  it("makes mature no-deal cases eligible for exact-once validation", () => {
    const noDeal = {
      ...report("no-deal", "no-deal-case", "player-no-deal", 4, 1, 80),
      attributeAssessments: [{
        attribute: "pace" as const,
        estimatedValue: 15,
        confidenceRange: [14, 16] as [number, number],
        domain: "physical" as const,
      }],
      validationSnapshot: { pace: 15 },
    };
    const recent = {
      ...noDeal,
      id: "recent",
      caseId: "recent-case",
      submittedSeason: 2,
    };
    const legacyWithoutEvidence = report(
      "legacy-empty",
      "legacy-empty-case",
      "player-no-deal",
      5,
      1,
    );

    expect(selectMatureReportCasesForValidation(
      [noDeal, recent, legacyWithoutEvidence],
      3,
      "scout-1",
    ).map((item) => item.caseKey)).toEqual(["no-deal-case"]);

    const player = {
      id: "player-no-deal",
      firstName: "No",
      lastName: "Deal",
      currentAbility: 100,
      attributes: { pace: 15 },
    };
    const state = {
      currentWeek: 1,
      currentSeason: 4,
      scout: {
        id: "scout-1",
        reputation: 50,
        accuracyHistory: [],
      },
      reports: { [noDeal.id]: noDeal },
      players: { [player.id]: player },
      retiredPlayers: {},
      unsignedYouth: {},
      alumniRecords: [],
      transferRecords: [],
    } as unknown as GameState;

    const validated = validateMatureReportCasesAtSeasonEnd(state, 3);
    expect(validated.state.reports[noDeal.id]).toMatchObject({
      postTransferRating: 100,
      accuracyReputationDelta: 3,
    });
    expect(validated.state.scout.reputation).toBe(53);
    expect(validated.messages).toHaveLength(1);
    expect(validated.messages[0].body).toContain("No signing or transfer was required");

    const replay = validateMatureReportCasesAtSeasonEnd(validated.state, 3);
    expect(replay.state.scout.reputation).toBe(53);
    expect(replay.messages).toEqual([]);
  });

  it("weights mature accuracy and calibrated conviction above craft volume", () => {
    const scout = {
      id: "scout-1",
      careerTier: 2,
      careerPath: "club",
      reputation: 50,
      fatigue: 20,
      salary: 1_000,
      countryReputations: { england: 10 },
    } as unknown as Scout;
    const currentCases = Array.from({ length: 10 }, (_, index) => ({
      ...report(`current-${index}`, `current-case-${index}`, `current-player-${index}`, index + 1, 1, 100),
      submittedSeason: 3,
      conviction: index === 0 ? "tablePound" as const : "recommend" as const,
      clubResponse: "signed" as const,
    }));
    const craftOnly = calculatePerformanceReview(scout, currentCases, 3);
    expect(craftOnly.outcome).toBe("retained");

    const matureCases = Array.from({ length: 5 }, (_, index) => ({
      ...report(`mature-${index}`, `mature-case-${index}`, `mature-player-${index}`, index + 1, 1, 75),
      conviction: "strongRecommend" as const,
      postTransferRating: 95,
    }));
    const accountable = calculatePerformanceReview(
      scout,
      [...currentCases, ...matureCases],
      3,
    );
    expect(accountable.outcome).toBe("promoted");

    const metrics = calculateReportAccountabilityMetrics(
      [
        { ...matureCases[0], postTransferRating: 90 },
        {
          ...matureCases[1],
          conviction: "recommend",
          postTransferRating: 70,
        },
      ],
      scout.id,
    );
    expect(metrics).toEqual({
      validatedCases: 2,
      averageAccuracy: 80,
      averageCalibration: 85,
      averageDecisionValue: 81.8,
    });
  });

  it("keeps opening credibility attainable but makes established craft secondary to truth", () => {
    const openingScout = {
      id: "scout-1",
      reputation: 10,
      reportsSubmitted: 0,
    } as unknown as Scout;

    let developingScout = openingScout;
    for (let index = 0; index < 5; index += 1) {
      developingScout = {
        ...updateReputation(developingScout, {
          type: "reportSubmitted",
          quality: 100,
        }),
        reportsSubmitted: developingScout.reportsSubmitted + 1,
      };
    }
    expect(developingScout.reputation).toBe(20);

    const established = updateReputation(developingScout, {
      type: "reportSubmitted",
      quality: 100,
    });
    expect(established.reputation).toBe(20.5);
    expect(updateReputation(established, {
      type: "reportValidated",
      accuracy: 100,
    }).reputation).toBe(23.5);
    expect(updateReputation(established, {
      type: "reportValidated",
      accuracy: 0,
    }).reputation).toBe(17.5);
  });
});
