import { describe, expect, it } from "vitest";

import type { GameState, Scout, ScoutReport } from "@/engine/core/types";
import { calculatePerformanceReview } from "@/engine/career/progression";
import { generatePerformancePulse } from "@/engine/career/performancePulse";
import { hasSuccessfulSigningResponseThisWeek } from "@/engine/core/gameLoop";
import { generateSeasonAwardsData } from "@/engine/core/seasonAwards";
import { EVENT_TEMPLATES } from "@/engine/events/eventTemplates";
import { checkPlacementFeeEligibility } from "@/engine/finance/placementFees";
import { getRemainingTablePounds } from "@/engine/reports/conviction";
import {
  groupReportRevisionsByCase,
  selectLatestReportsByCase,
  selectLatestReportsByCaseOpenedInRange,
} from "@/engine/reports/reportAccountability";

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
});
