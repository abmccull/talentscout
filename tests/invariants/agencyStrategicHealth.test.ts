import { describe, expect, it } from "vitest";

import type {
  AgencyEmployee,
  FinancialRecord,
  NewGameConfig,
  RetainerContract,
  Scout,
} from "@/engine/core/types";
import {
  assessAgencyStrategicPostureChange,
  deriveAgencyStrategicHealth,
  hireEmployee,
  setAgencyStrategicPosture,
  upgradeOffice,
} from "@/engine/finance/agency";
import {
  assessRetainerWorkAcceptance,
  getAgencyCapacity,
  getAgencyStrategicPosture,
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

describe("agency strategic health", () => {
  it("persists a posture in the existing ledger and changes usable capacity after save/load", () => {
    const scout = agencyScout();
    const finances = agencyFinances(scout);
    const balanced = getAgencyCapacity(finances, scout);

    const qualityFirst = setAgencyStrategicPosture(
      finances,
      scout,
      "qualityFirst",
      8,
      2,
    );
    expect(qualityFirst).not.toBeNull();
    if (!qualityFirst) return;

    expect(qualityFirst.balance).toBe(finances.balance);
    expect(qualityFirst.transactions.at(-1)).toMatchObject({
      amount: 0,
      referenceId: "agency-posture:qualityFirst:s2w8",
    });
    expect(getAgencyStrategicPosture(structuredClone(qualityFirst))).toBe("qualityFirst");
    const protectedCapacity = getAgencyCapacity(qualityFirst, scout);
    expect(protectedCapacity.rawMonthlyReportCapacity).toBe(
      balanced.rawMonthlyReportCapacity,
    );
    expect(protectedCapacity.monthlyReportCapacity).toBeLessThan(
      balanced.monthlyReportCapacity,
    );

    const replayed = setAgencyStrategicPosture(
      qualityFirst,
      scout,
      "qualityFirst",
      8,
      2,
    );
    expect(replayed).toBe(qualityFirst);

    const sameWeekSwitch = setAgencyStrategicPosture(
      qualityFirst,
      scout,
      "controlledGrowth",
      8,
      2,
    );
    expect(sameWeekSwitch).toBe(qualityFirst);
    expect(getAgencyStrategicPosture(sameWeekSwitch!)).toBe("qualityFirst");
    expect(sameWeekSwitch?.transactions.filter(
      (transaction) => transaction.referenceId?.includes(":s2w8"),
    )).toHaveLength(1);
    expect(assessAgencyStrategicPostureChange(
      qualityFirst,
      scout,
      "controlledGrowth",
      8,
      2,
    )).toMatchObject({
      allowed: false,
      lockedForWeek: true,
      selectedThisWeek: "qualityFirst",
      blocker: "weeklyChoiceLocked",
    });
    expect(assessAgencyStrategicPostureChange(
      qualityFirst,
      scout,
      "controlledGrowth",
      9,
      2,
    )).toMatchObject({
      allowed: true,
      lockedForWeek: false,
      currentPosture: "qualityFirst",
    });

    const growth = setAgencyStrategicPosture(
      qualityFirst,
      scout,
      "controlledGrowth",
      9,
      2,
    )!;
    expect(getAgencyCapacity(growth, scout).monthlyReportCapacity).toBeGreaterThan(
      balanced.monthlyReportCapacity,
    );
  });

  it("makes diversification refuse deeper dominant-client dependence while allowing a new client", () => {
    const scout = agencyScout();
    const base = {
      ...agencyFinances(scout),
      retainerContracts: [retainer("anchor", "club-a", 4_000, 2)],
    };
    const diversified = setAgencyStrategicPosture(
      base,
      scout,
      "diversifyClients",
      10,
      2,
    )!;

    const sameClient = assessRetainerWorkAcceptance(
      diversified,
      scout,
      retainer("more-anchor", "club-a", 2_000, 1),
    );
    const newClient = assessRetainerWorkAcceptance(
      diversified,
      scout,
      retainer("new-book", "club-b", 2_000, 1),
    );

    expect(sameClient.allowed).toBe(false);
    expect(sameClient.blockers).toContain("clientConcentration");
    expect(newClient.allowed).toBe(true);
    expect(newClient.projectedConcentration.activeClientCount).toBe(2);
    expect(newClient.projectedConcentration.dominantShare).toBeCloseTo(2 / 3);
  });

  it("distinguishes a resilient diversified firm from a fragile overloaded book", () => {
    const scout = agencyScout();
    const resilient = {
      ...agencyFinances(scout),
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
      ...agencyFinances(scout),
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

  it("makes quality protection and controlled growth carry opposite delivery risks", () => {
    const scout = agencyScout();
    const loaded = {
      ...agencyFinances(scout),
      retainerContracts: [
        retainer("one", "club-a", 2_000, 4),
        retainer("two", "club-b", 2_000, 4),
      ],
      employees: [employee("scout", "scout", { fatigue: 55 })],
    };
    const protectedBook = setAgencyStrategicPosture(
      loaded,
      scout,
      "qualityFirst",
      12,
      2,
    )!;
    const growthBook = setAgencyStrategicPosture(
      loaded,
      scout,
      "controlledGrowth",
      12,
      2,
    )!;

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

  it("turns cash defence into a fixed-cost constraint without adding accounting chores", () => {
    const scout = agencyScout();
    const base = agencyFinances(scout);
    const defensive = setAgencyStrategicPosture(
      base,
      scout,
      "cashDefense",
      14,
      2,
    )!;

    expect(upgradeOffice(defensive, "professional")).toBeNull();
    expect(hireEmployee(
      new RNG("defensive-hire"),
      defensive,
      "analyst",
      14,
      2,
    )).toBeNull();
    expect(upgradeOffice(defensive, "coworking")?.office.tier).toBe("coworking");

    const growth = setAgencyStrategicPosture(
      defensive,
      scout,
      "controlledGrowth",
      15,
      2,
    )!;
    expect(upgradeOffice(growth, "professional")?.office.tier).toBe("professional");
    expect(hireEmployee(
      new RNG("growth-hire"),
      growth,
      "analyst",
      15,
      2,
    )).not.toBeNull();
  });
});
