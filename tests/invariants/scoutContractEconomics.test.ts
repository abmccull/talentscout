import { describe, expect, it } from "vitest";
import type {
  FinancialRecord,
  PerformanceReview,
  ScoutEmploymentContract,
} from "@/engine/core/types";
import { enrollInCourse } from "@/engine/career/courses";
import { calculatePerformanceBonusAmount } from "@/engine/finance/clubBonuses";

function finances(balance: number): FinancialRecord {
  return {
    balance,
    completedCourses: [],
    transactions: [],
  } as unknown as FinancialRecord;
}

function review(
  outcome: PerformanceReview["outcome"],
  objectivesMet = 3,
): PerformanceReview {
  return {
    season: 2,
    reportsSubmitted: 20,
    averageQuality: 75,
    successfulRecommendations: 3,
    tablePoundsUsed: 0,
    tablePoundsSuccessful: 0,
    reputationChange: 0,
    outcome,
    contractSummary: {
      objectivesMet,
      objectivesTotal: 3,
      reportsTarget: 20,
      qualityTarget: 70,
      recommendationsTarget: 3,
    },
  };
}

const CONTRACT: Pick<
  ScoutEmploymentContract,
  "weeklySalary" | "performanceBonusRate"
> = {
  weeklySalary: 1_000,
  performanceBonusRate: 0.1,
};

describe("scout employment contract economics", () => {
  it("uses the negotiated performance rate and objective completion", () => {
    expect(calculatePerformanceBonusAmount(review("promoted"), 3, CONTRACT))
      .toBe(5_200);
    expect(calculatePerformanceBonusAmount(review("retained", 2), 3, CONTRACT))
      .toBe(2_080);
    expect(calculatePerformanceBonusAmount(review("warning"), 3, CONTRACT))
      .toBe(0);
  });

  it("applies the employer education allowance before personal cash", () => {
    const enrolled = enrollInCourse(
      finances(300),
      "youth_development_methods",
      5,
      1,
      3,
      38,
      500,
    );
    expect(enrolled.success).toBe(true);
    if (!enrolled.success) return;

    expect(enrolled.educationBudgetUsed).toBe(500);
    expect(enrolled.personalCost).toBe(300);
    expect(enrolled.finances.balance).toBe(0);
    expect(enrolled.finances.transactions.at(-1)).toMatchObject({
      amount: -300,
      referenceId: "course-enrollment:youth_development_methods:s1w5",
      category: "operatingCost",
    });
  });

  it("allows a fully employer-funded course with no personal cash", () => {
    const enrolled = enrollInCourse(
      finances(0),
      "business_fundamentals",
      8,
      1,
      2,
      38,
      400,
    );
    expect(enrolled.success).toBe(true);
    if (!enrolled.success) return;
    expect(enrolled.educationBudgetUsed).toBe(400);
    expect(enrolled.personalCost).toBe(0);
    expect(enrolled.finances.balance).toBe(0);
  });
});
