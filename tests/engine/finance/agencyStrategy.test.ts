import { expect, test } from "vitest";

import {
  canChangeAgencyOperatingPolicy,
  deriveAgencyStrategicPressure,
  getAgencyPolicyWeeklyModifiers,
  normalizeAgencyStrategyState,
  processAgencyOperatingPolicyWeek,
  selectAgencyOperatingPolicy,
} from "@/engine/finance/agencyStrategy";
import { migrateFinancialRecord } from "@/engine/finance/saveMigration";

test("deriveAgencyStrategicPressure surfaces runway and concentration stress", () => {
  const result = deriveAgencyStrategicPressure(
    {
      balance: 3000,
      transactions: [],
      expenses: {},
      equipmentLevel: 1,
      retainerContracts: [
        { status: "active", monthlyFee: 900, requiredReportsPerMonth: 2, reportsDeliveredThisMonth: 2 },
        { status: "active", monthlyFee: 300, requiredReportsPerMonth: 1, reportsDeliveredThisMonth: 1 },
      ],
      consultingContracts: [],
      office: { tier: "small", monthlyCost: 500, qualityBonus: 0.1, maxEmployees: 3 },
      employees: [
        { morale: 40, fatigue: 68, paySatisfaction: 42, role: "scout", quality: 12, salary: 1000 },
      ],
      analystReviews: [{ status: "available" }],
      clientRelationships: [
        { status: "active", totalRevenue: 12000 },
        { status: "active", totalRevenue: 2000 },
      ],
      pendingEmployeeEvents: [{}, {}],
      satelliteOffices: [],
    } as never,
    {
      careerPath: "independent",
      careerTier: 4,
      independentTier: 4,
      reputation: 58,
      salary: 0,
      npcScoutIds: [],
    } as never,
  );

  expect(result.runwayWeeks).not.toBeNull();
  expect(result.clientConcentration).toBeGreaterThan(0.5);
  expect(result.qualityDebt).toBeGreaterThan(0);
  expect(result.staffFragility).toBeGreaterThan(0);
});

test("preferred policy overrides the derived recommendation", () => {
  const result = deriveAgencyStrategicPressure(
    {
      balance: 20000,
      transactions: [],
      expenses: {},
      equipmentLevel: 1,
      retainerContracts: [],
      consultingContracts: [],
      office: { tier: "professional", monthlyCost: 1500, qualityBonus: 0.15, maxEmployees: 6 },
      employees: [],
      analystReviews: [],
      clientRelationships: [],
      pendingEmployeeEvents: [],
      satelliteOffices: [],
    } as never,
    {
      careerPath: "independent",
      careerTier: 5,
      independentTier: 5,
      reputation: 85,
      salary: 0,
      npcScoutIds: [],
    } as never,
    "regionalDepth",
  );

  expect(result.suggestedPolicy).toBe("regionalDepth");
  expect(result.policyEffect.policy).toBe("regionalDepth");
});

test("agency posture is a four-week commitment with distinct tradeoffs", () => {
  const finances = {
    careerPath: "independent",
    clientRelationships: [],
    employees: [],
  } as never;
  const selected = selectAgencyOperatingPolicy({
    finances,
    policy: "qualityDiscipline",
    now: { season: 1, week: 5 },
    seasonLength: 38,
    focusRegionId: "england",
  });

  expect(selected.changed).toBe(true);
  expect(selected.finances.agencyStrategyState).toMatchObject({
    policy: "qualityDiscipline",
    lockedUntil: { season: 1, week: 9 },
    focusRegionId: "england",
  });
  expect(canChangeAgencyOperatingPolicy(
    selected.finances,
    { season: 1, week: 8 },
  )).toBe(false);
  expect(canChangeAgencyOperatingPolicy(
    selected.finances,
    { season: 1, week: 9 },
  )).toBe(true);

  const quality = getAgencyPolicyWeeklyModifiers("qualityDiscipline");
  const expansion = getAgencyPolicyWeeklyModifiers("marketExpansion");
  expect(quality.employeeFatigueDelta).toBeLessThan(0);
  expect(quality.marketplaceDemandMultiplier).toBeLessThan(1);
  expect(expansion.employeeFatigueDelta).toBeGreaterThan(0);
  expect(expansion.marketplaceDemandMultiplier).toBeGreaterThan(1);
});

test("weekly posture effects are deterministic and exact once", () => {
  const base = {
    careerPath: "independent",
    clientRelationships: [{ status: "active", satisfaction: 60 }],
    employees: [{ morale: 55, fatigue: 70 }],
    agencyStrategyState: {
      policy: "qualityDiscipline",
      selectedAt: { season: 1, week: 1 },
      lockedUntil: { season: 1, week: 5 },
    },
  } as never;

  const first = processAgencyOperatingPolicyWeek(base, { season: 1, week: 2 });
  const replay = processAgencyOperatingPolicyWeek(first.finances, { season: 1, week: 2 });

  expect(first.changed).toBe(true);
  expect(first.operatingCost).toBe(90);
  expect(first.finances.clientRelationships[0]?.satisfaction).toBe(61);
  expect(first.finances.employees[0]?.morale).toBe(56);
  expect(first.finances.employees[0]?.fatigue).toBe(67);
  expect(replay.changed).toBe(false);
  expect(replay.finances).toBe(first.finances);
});

test("save migration preserves valid posture state and discards malformed values", () => {
  const scout = {
    careerTier: 3,
    careerPath: "independent",
  } as never;
  const valid = {
    policy: "regionalDepth",
    selectedAt: { season: 2, week: 4 },
    lockedUntil: { season: 2, week: 8 },
    lastAppliedAt: { season: 2, week: 5 },
    focusRegionId: "brazil",
  } as const;

  expect(normalizeAgencyStrategyState(valid)).toEqual(valid);
  const migrated = migrateFinancialRecord({
    careerPath: "club",
    agencyStrategyState: valid,
  } as never, scout);
  expect(migrated.careerPath).toBe("independent");
  expect(migrated.agencyStrategyState).toEqual(valid);
  expect(migrateFinancialRecord({
    agencyStrategyState: {
      policy: "free-money",
      selectedAt: { season: -1, week: 0 },
      lockedUntil: "next month",
    },
  } as never, scout).agencyStrategyState).toBeUndefined();
});

test("save migration maps a legacy posture ledger record into canonical policy state", () => {
  const scout = {
    careerTier: 3,
    careerPath: "independent",
  } as never;

  const migrated = migrateFinancialRecord({
    careerPath: "independent",
    transactions: [{
      week: 7,
      season: 3,
      amount: 0,
      description: "Agency strategy: Defend the runway",
      referenceId: "agency-posture:cashDefense:s3w7",
    }],
  } as never, scout);

  expect(migrated.agencyStrategyState).toEqual({
    policy: "runwayDefense",
    selectedAt: { season: 3, week: 7 },
    lockedUntil: { season: 3, week: 7 },
  });
});

test("runway defense and client diversification expose distinct mechanical differences", () => {
  const runway = getAgencyPolicyWeeklyModifiers("runwayDefense");
  const diversify = getAgencyPolicyWeeklyModifiers("clientDiversification");
  const retainers = getAgencyPolicyWeeklyModifiers("stableRetainers");
  const expansion = getAgencyPolicyWeeklyModifiers("marketExpansion");

  expect(runway.weeklyOperatingCost).toBeLessThan(retainers.weeklyOperatingCost);
  expect(runway.marketplaceDemandMultiplier).toBeLessThan(retainers.marketplaceDemandMultiplier);
  expect(diversify.marketplaceDemandMultiplier).toBeLessThan(expansion.marketplaceDemandMultiplier);
  expect(diversify.employeeFatigueDelta).toBeLessThan(expansion.employeeFatigueDelta);
});
