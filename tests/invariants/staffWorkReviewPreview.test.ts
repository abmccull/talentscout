import { describe, expect, it } from "vitest";
import type {
  ConsultingContract,
  FinancialRecord,
  RetainerContract,
  StaffScoutingWorkProduct,
} from "@/engine/core/types";
import {
  getStaffWorkReviewPreview,
  rankStaffWorkProducts,
} from "@/engine/finance/staffWorkReview";

function productFixture(
  overrides: Partial<StaffScoutingWorkProduct> = {},
): StaffScoutingWorkProduct {
  return {
    id: "staff-work:employee-1:player-1:s1w2",
    playerId: "player-1",
    employeeId: "employee-1",
    employeeName: "Taylor Analyst",
    clientClubId: "club-client",
    createdWeek: 2,
    createdSeason: 1,
    status: "awaitingReview",
    qualityScore: 60,
    signals: [],
    limitation: "Staff lead only.",
    suggestedConviction: "investigate",
    ...overrides,
  };
}

function consultingFixture(
  overrides: Partial<ConsultingContract> = {},
): ConsultingContract {
  return {
    id: "consult-1",
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
    ...overrides,
  };
}

function retainerFixture(
  overrides: Partial<RetainerContract> = {},
): RetainerContract {
  return {
    id: "retainer-1",
    clubId: "club-retainer",
    tier: 2,
    monthlyFee: 2_000,
    requiredReportsPerMonth: 3,
    reportsDeliveredThisMonth: 1,
    status: "active",
    deliveredReportIds: [],
    brief: {
      focus: "academy",
      targetPositions: ["CM"],
      ageRange: [16, 22],
      minimumReportQuality: 58,
      description: "Need midfield pathway coverage.",
    },
    nextSettlementWeek: 5,
    nextSettlementSeason: 1,
    ...overrides,
  };
}

describe("staff work review preview", () => {
  it("marks urgent consulting leads as critical and applies bounded review debt", () => {
    const finances = {
      retainerContracts: [],
      consultingContracts: [consultingFixture()],
    } as Pick<FinancialRecord, "retainerContracts" | "consultingContracts">;

    const preview = getStaffWorkReviewPreview(
      finances,
      productFixture(),
      { week: 4, season: 1 },
      38,
    );

    expect(preview).toMatchObject({
      priority: "critical",
      priorityLabel: "Critical client",
      reviewDebtPenalty: 12,
      signedOffQualityScore: 48,
      nextWeekSignedOffQualityScore: 42,
      deliveryThreshold: 50,
      deliveryRisk: "blocked",
    });
    expect(preview.priorityReason).toContain("consulting report");
    expect(preview.deadline).toEqual({ week: 4, season: 1 });
  });

  it("ranks client pressure ahead of raw quality and leaves internal work outside client thresholds", () => {
    const finances = {
      retainerContracts: [retainerFixture()],
      consultingContracts: [],
    } as Pick<FinancialRecord, "retainerContracts" | "consultingContracts">;

    const ranked = rankStaffWorkProducts(
      [
        productFixture({
          id: "internal-lead",
          clientClubId: undefined,
          qualityScore: 85,
          createdWeek: 4,
        }),
        productFixture({
          id: "retainer-lead",
          clientClubId: "club-retainer",
          qualityScore: 62,
          createdWeek: 3,
        }),
      ],
      finances,
      { week: 4, season: 1 },
      38,
    );

    expect(ranked[0]?.product.id).toBe("retainer-lead");
    expect(ranked[0]?.preview.priority).toBe("critical");
    expect(ranked[1]?.preview.priority).toBe("internal");
    expect(ranked[1]?.preview.deliveryThreshold).toBeNull();
    expect(ranked[1]?.preview.deliveryRisk).toBe("internal");
  });
});
