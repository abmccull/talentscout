import { describe, expect, it } from "vitest";

import type {
  AgencyEmployee,
  FinancialRecord,
  NewGameConfig,
  RetainerContract,
  Scout,
} from "@/engine/core/types";
import {
  deriveAgencyStrategicHealth,
  hireEmployee,
  upgradeOffice,
} from "@/engine/finance/agency";
import {
  canChangeAgencyOperatingPolicy,
  selectAgencyOperatingPolicy,
} from "@/engine/finance/agencyStrategy";
import {
  assessRetainerWorkAcceptance,
  getAgencyCapacity,
} from "@/engine/finance/agencyCapacity";
import { initializeFinances } from "@/engine/finance/expenses";
import { RNG } from "@/engine/rng";
import { createScout } from "@/engine/scout/creation";

const CONFIG: NewGameConfig = {
  scoutFirstName: "Agency",
  scoutLastName: "Principal",
  scoutAge: 36,
  specialization: "youth",
  difficulty: "normal",
  worldSeed: "agency-strategy-depth",
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

function agencyScout(): Scout {
  return {
    ...createScout(CONFIG, new RNG("agency-strategy-scout")),
    careerPath: "independent",
    careerPathChosen: true,
    careerTier: 3,
    independentTier: 3,
    reputation: 62,
    reportsSubmitted: 45,
  };
}

function retainer(
  id: string,
  clubId: string,
  monthlyFee = 2_000,
  requiredReportsPerMonth = 2,
): RetainerContract {
  return {
    id,
    clubId,
    tier: 3,
    monthlyFee,
    requiredReportsPerMonth,
    reportsDeliveredThisMonth: 0,
    status: "active",
  };
}

function employee(
  id: string,
  role: AgencyEmployee["role"],
  overrides: Partial<AgencyEmployee> = {},
): AgencyEmployee {
  return {
    id,
    name: `Employee ${id}`,
    role,
    quality: 75,
    salary: 900,
    paySatisfaction: 75,
    morale: 75,
    fatigue: 15,
    hiredWeek: 1,
    hiredSeason: 2,
    workProductsGenerated: [],
    experience: 100,
    weeklyLog: [],
    regionFocusWeeks: 0,
    ...overrides,
  };
}

function agencyFinances(scout: Scout): FinancialRecord {
  return {
    ...initializeFinances(scout, "independent", "normal"),
    balance: 30_000,
    careerPath: "independent",
    independentTier: 3,
    office: {
      tier: "small",
      monthlyCost: 500,
      qualityBonus: 0.1,
      maxEmployees: 3,
    },
  };
}

function withPolicy(
  finances: FinancialRecord,
  policy: Parameters<typeof selectAgencyOperatingPolicy>[0]["policy"],
  week = 8,
  season = 2,
  focusRegionId = "england",
): FinancialRecord {
  const selected = selectAgencyOperatingPolicy({
    finances,
    policy,
    now: { week, season },
    seasonLength: 38,
    focusRegionId,
  });
  expect(selected.changed).toBe(true);
  return selected.finances;
}

describe("agency strategic health", () => {
  it("uses the canonical agency policy to gate capacity and lock timing", () => {
    const scout = agencyScout();
    const finances = agencyFinances(scout);
    const balanced = getAgencyCapacity(finances, scout);

    const disciplined = withPolicy(finances, "qualityDiscipline");
    expect(disciplined.agencyStrategyState).toMatchObject({
      policy: "qualityDiscipline",
      lockedUntil: { season: 2, week: 12 },
    });
    expect(canChangeAgencyOperatingPolicy(
      disciplined,
      { season: 2, week: 11 },
    )).toBe(false);
    expect(canChangeAgencyOperatingPolicy(
      disciplined,
      { season: 2, week: 12 },
    )).toBe(true);

    const protectedCapacity = getAgencyCapacity(structuredClone(disciplined), scout);
    expect(protectedCapacity.policy).toBe("qualityDiscipline");
    expect(protectedCapacity.rawMonthlyReportCapacity).toBe(
      balanced.rawMonthlyReportCapacity,
    );
    expect(protectedCapacity.monthlyReportCapacity).toBeLessThan(
      balanced.monthlyReportCapacity,
    );

    const unchanged = selectAgencyOperatingPolicy({
      finances: disciplined,
      policy: "qualityDiscipline",
      now: { season: 2, week: 8 },
      seasonLength: 38,
      focusRegionId: "england",
    });
    expect(unchanged.changed).toBe(false);
  });

  it("distinguishes runway defense from stable retainers as different economic jobs", () => {
    const scout = agencyScout();
    const base = agencyFinances(scout);
    const defensive = withPolicy(base, "runwayDefense", 14, 2);
    const retainers = withPolicy(base, "stableRetainers", 14, 2);

    expect(upgradeOffice(defensive, "professional")).toBeNull();
    expect(hireEmployee(
      new RNG("defensive-hire"),
      defensive,
      "analyst",
      14,
      2,
    )).toBeNull();
    expect(upgradeOffice(retainers, "professional")?.office.tier).toBe("professional");
    expect(hireEmployee(
      new RNG("retainer-hire"),
      retainers,
      "analyst",
      14,
      2,
    )).not.toBeNull();
  });

  it("distinguishes client diversification from market expansion in work acceptance", () => {
    const scout = agencyScout();
    const base = {
      ...agencyFinances(scout),
      retainerContracts: [retainer("anchor", "club-a", 4_000, 2)],
    };
    const diversified = withPolicy(base, "clientDiversification", 10, 2);
    const expansion = withPolicy(base, "marketExpansion", 10, 2);

    const sameClientUnderDiversification = assessRetainerWorkAcceptance(
      diversified,
      scout,
      retainer("more-anchor", "club-a", 2_000, 1),
    );
    const sameClientUnderExpansion = assessRetainerWorkAcceptance(
      expansion,
      scout,
      retainer("more-anchor", "club-a", 2_000, 1),
    );

    expect(sameClientUnderDiversification.allowed).toBe(false);
    expect(sameClientUnderDiversification.blockers).toContain("clientConcentration");
    expect(sameClientUnderExpansion.allowed).toBe(true);
  });

  it("distinguishes a resilient diversified firm from a fragile overloaded book", () => {
    const scout = agencyScout();
    const resilient = {
      ...withPolicy(agencyFinances(scout), "balancedBook", 6, 2),
      retainerContracts: [
        retainer("one", "club-a"),
        retainer("two", "club-b"),
        retainer("three", "club-c"),
      ],
      employees: [
        employee("scout", "scout"),
        employee("analyst", "analyst"),
      ],
      clientRelationships: [
        { clubId: "club-a", satisfaction: 82 },
        { clubId: "club-b", satisfaction: 78 },
        { clubId: "club-c", satisfaction: 80 },
      ].map((relationship) => ({
        ...relationship,
        totalReportsDelivered: 10,
        totalRevenue: 10_000,
        tenureWeeks: 20,
        preferences: [],
        status: "active" as const,
        lastInteractionWeek: 8,
        lastInteractionSeason: 2,
      })),
    };
    const fragile = {
      ...withPolicy(agencyFinances(scout), "marketExpansion", 6, 2),
      balance: 150,
      office: {
        tier: "hq" as const,
        monthlyCost: 4_000,
        qualityBonus: 0.2,
        maxEmployees: 12,
      },
      retainerContracts: [
        retainer("anchor-a", "club-a", 500, 12),
        retainer("anchor-b", "club-a", 500, 12),
        retainer("anchor-c", "club-a", 500, 12),
      ],
      employees: [employee("burned-out", "scout", {
        salary: 2_500,
        morale: 18,
        paySatisfaction: 20,
        fatigue: 92,
      })],
      failedContractCount: 3,
      blacklistedClubs: ["club-x"],
    };

    const resilientHealth = deriveAgencyStrategicHealth(resilient, scout);
    const fragileHealth = deriveAgencyStrategicHealth(fragile, scout);

    expect(resilientHealth.score).toBeGreaterThan(fragileHealth.score);
    expect(resilientHealth.activeClientCount).toBe(3);
    expect(resilientHealth.seniorAgencyReady).toBe(true);
    expect(fragileHealth.status).toMatch(/fragile|critical/);
    expect(fragileHealth.seniorAgencyReady).toBe(false);
    expect(fragileHealth.failureModes).toEqual(expect.arrayContaining([
      "cashRunway",
      "clientShock",
      "deliveryFailure",
    ]));
  });

  it("makes quality discipline and market expansion carry opposite delivery risks", () => {
    const scout = agencyScout();
    const loaded = {
      ...agencyFinances(scout),
      retainerContracts: [
        retainer("one", "club-a", 2_000, 4),
        retainer("two", "club-b", 2_000, 4),
      ],
      employees: [employee("scout", "scout", { fatigue: 55 })],
    };
    const protectedBook = withPolicy(loaded, "qualityDiscipline", 12, 2);
    const growthBook = withPolicy(loaded, "marketExpansion", 12, 2);

    const protectedHealth = deriveAgencyStrategicHealth(protectedBook, scout);
    const growthHealth = deriveAgencyStrategicHealth(growthBook, scout);

    expect(protectedHealth.effectiveMonthlyCapacity).toBeLessThan(
      growthHealth.effectiveMonthlyCapacity,
    );
    expect(protectedHealth.qualityDebt).toBeLessThan(growthHealth.qualityDebt);
    expect(protectedHealth.reputationExposure).toBeLessThan(
      growthHealth.reputationExposure,
    );
  });
});
