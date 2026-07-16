import { describe, expect, it } from "vitest";
import type { NewGameConfig } from "@/engine/core/types";
import {
  calculateMonthlyRunRate,
  calculateRevenueBreakdown,
} from "@/engine/finance/dashboard";
import { initializeFinances } from "@/engine/finance/expenses";
import { RNG } from "@/engine/rng";
import { createScout } from "@/engine/scout/creation";
import { monthlyEquivalentOfWeeklyAmount } from "@/engine/core/annualization";

const CONFIG: NewGameConfig = {
  scoutFirstName: "Period",
  scoutLastName: "Ledger",
  scoutAge: 30,
  specialization: "youth",
  difficulty: "normal",
  worldSeed: "financial-period-invariant",
  startingCountry: "england",
  selectedCountries: ["england"],
  skillAllocations: {
    technicalEye: 2,
    physicalAssessment: 1,
    psychologicalRead: 1,
    tacticalUnderstanding: 1,
    dataLiteracy: 1,
    playerJudgment: 1,
    potentialAssessment: 1,
  },
};

describe("financial dashboard period semantics", () => {
  it("keeps recurring monthly run rate separate from lifetime revenue", () => {
    const scout = createScout(CONFIG, new RNG("financial-period-scout"));
    const opened = initializeFinances(scout, "independent", "normal");
    const finances = {
      ...opened,
      reportSalesRevenue: 12_000,
      placementFeeRevenue: 30_000,
      retainerRevenue: 9_000,
      consultingRevenue: 4_000,
      sellOnRevenue: 2_000,
      bonusRevenue: 1_000,
      retainerContracts: [{
        id: "retainer-active",
        clubId: "club-1",
        tier: 1 as const,
        monthlyFee: 1_500,
        requiredReportsPerMonth: 2,
        reportsDeliveredThisMonth: 1,
        status: "active" as const,
      }],
      transactions: [
        ...opened.transactions,
        {
          week: 4,
          season: 1,
          amount: 2_400,
          description: "Monthly salary",
          referenceId: "monthly-finance:s1w4:scout-income",
        },
        {
          week: 8,
          season: 1,
          amount: 2_400,
          description: "Monthly salary",
          referenceId: "monthly-finance:s1w8:scout-income",
        },
      ],
    };

    const monthly = calculateMonthlyRunRate(finances, scout);
    const lifetime = calculateRevenueBreakdown(finances, scout);

    expect(monthly.incomeBreakdown).toMatchObject({
      salary: monthlyEquivalentOfWeeklyAmount(scout.salary),
      retainers: 1_500,
      reportSales: 0,
      placementFees: 0,
      consulting: 0,
      sellOn: 0,
      bonuses: 0,
    });
    expect(monthly.totalIncome).toBe(
      monthlyEquivalentOfWeeklyAmount(scout.salary) + 1_500,
    );
    expect(lifetime.salary).toBe(4_800);
    expect(lifetime.total).toBe(62_800);
  });
});
