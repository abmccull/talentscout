import { describe, expect, it } from "vitest";
import type {
  AgencyEmployee,
  AgencyEmployeeRole,
  FinancialRecord,
  NewGameConfig,
} from "@/engine/core/types";
import type { RNG } from "@/engine/rng";
import { RNG as SeededRNG } from "@/engine/rng";
import { createScout } from "@/engine/scout/creation";
import {
  getEmployeePayEffects,
  getEmployeeSalaryBand,
  hireEmployee,
  normalizeEmployeeContractsInRecord,
  processEmployeeWeek,
  renegotiateEmployeeSalary,
} from "@/engine/finance";
import {
  initializeFinances,
  processWeeklyFinances,
} from "@/engine/finance/expenses";
import { checkEmployeeEvents } from "@/engine/finance/employeeEvents";

const CONFIG: NewGameConfig = {
  scoutFirstName: "Agency",
  scoutLastName: "Owner",
  scoutAge: 34,
  specialization: "youth",
  difficulty: "normal",
  worldSeed: "employee-economics",
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

function makeEmployee(
  overrides: Partial<AgencyEmployee> = {},
): AgencyEmployee {
  return {
    id: "emp_economics",
    name: "Jamie Market",
    role: "scout",
    quality: 12,
    salary: 1_200,
    paySatisfaction: 68,
    morale: 70,
    fatigue: 0,
    hiredWeek: 1,
    hiredSeason: 1,
    reportsGenerated: [],
    currentAssignment: {
      type: "idle",
      assignedWeek: 1,
      assignedSeason: 1,
    },
    experience: 500,
    weeklyLog: [],
    regionFocusWeeks: 0,
    ...overrides,
  };
}

function makeFinances(employee?: AgencyEmployee) {
  const scout = createScout(CONFIG, new SeededRNG("employee-economics-scout"));
  const finances = initializeFinances(scout, "independent", "normal");
  return {
    scout,
    finances: {
      ...finances,
      office: { ...finances.office, tier: "small" as const, maxEmployees: 3 },
      employees: employee ? [employee] : [],
    },
  };
}

function alwaysChanceRng(): RNG {
  return {
    chance: () => true,
    nextInt: (minimum: number) => minimum,
    next: () => 0,
    nextFloat: (minimum: number) => minimum,
    gaussian: (mean: number) => mean,
    pick: <T>(values: readonly T[]) => values[0],
    pickWeighted: <T>(values: ReadonlyArray<{ item: T }>) => values[0].item,
    shuffle: <T>(values: readonly T[]) => [...values],
  } as unknown as RNG;
}

describe("agency employee economics integrity", () => {
  it("derives ordered, bounded salary bands from visible inputs", () => {
    const roles: AgencyEmployeeRole[] = [
      "scout",
      "analyst",
      "administrator",
      "relationshipManager",
      "mentee",
    ];

    for (const role of roles) {
      let previousMarket = 0;
      for (let quality = 1; quality <= 20; quality++) {
        const employee = makeEmployee({ role, quality, experience: quality * 75 });
        const band = getEmployeeSalaryBand(employee, quality * 5);
        expect(band.minimum).toBeGreaterThan(0);
        expect(band.minimum).toBeLessThanOrEqual(band.fairMinimum);
        expect(band.fairMinimum).toBeLessThanOrEqual(band.marketRate);
        expect(band.marketRate).toBeLessThanOrEqual(band.fairMaximum);
        expect(band.fairMaximum).toBeLessThanOrEqual(band.maximum);
        expect(band.marketRate).toBeGreaterThanOrEqual(previousMarket);
        previousMarket = band.marketRate;
      }
    }
  });

  it("enforces the contract floor and ceiling for hiring and renegotiation", () => {
    const { scout, finances } = makeFinances();
    const hired = hireEmployee(
      new SeededRNG("employee-hire"),
      finances,
      "analyst",
      3,
      1,
      ["england"],
      1,
      scout.reputation,
    );
    expect(hired).not.toBeNull();
    const employee = hired!.employees[0];
    const band = getEmployeeSalaryBand(employee, scout.reputation);
    expect(employee.salary).toBe(band.marketRate);
    expect(employee.salary).toBeGreaterThanOrEqual(band.minimum);
    expect(employee.salary).toBeLessThanOrEqual(band.maximum);
    expect(hired!.transactions.at(-1)?.description).toContain("Employee hired");

    const onePound = renegotiateEmployeeSalary(
      hired!, employee.id, 1, scout.reputation, 4, 1,
    );
    const impossiblePremium = renegotiateEmployeeSalary(
      hired!, employee.id, band.maximum + 1_000, scout.reputation, 4, 1,
    );
    expect(onePound).toBe(hired);
    expect(impossiblePremium).toBe(hired);

    const floorContract = renegotiateEmployeeSalary(
      hired!, employee.id, band.minimum, scout.reputation, 4, 1,
    );
    expect(floorContract.employees[0].salary).toBe(band.minimum);
    expect(floorContract.transactions.at(-1)).toMatchObject({
      amount: 0,
      week: 4,
      season: 1,
    });
    expect(floorContract.transactions.at(-1)?.description).toContain("Salary agreement");
  });

  it("charges itemized payroll once and conserves every pound in the ledger", () => {
    const { scout, finances } = makeFinances(makeEmployee());
    const normalized = normalizeEmployeeContractsInRecord(
      finances, scout.reputation, 4, 1,
    );
    const once = processWeeklyFinances(normalized, scout, 4, 1);
    const reloaded = structuredClone(once);
    const twice = processWeeklyFinances(reloaded, scout, 4, 1);

    expect(twice).toBe(reloaded);
    expect(once.transactions.filter(
      (transaction) => transaction.referenceId === "monthly-finance:s1w4:employee:emp_economics",
    )).toHaveLength(1);
    expect(once.transactions.find(
      (transaction) => transaction.referenceId === "monthly-finance:s1w4:employee:emp_economics",
    )?.amount).toBe(-once.employees[0].salary);
    expect(once.transactions.reduce((total, transaction) => total + transaction.amount, 0))
      .toBe(once.balance);
  });

  it("keeps pay satisfaction bounded under long runs at every pay position", () => {
    const { scout, finances } = makeFinances(makeEmployee());
    const band = getEmployeeSalaryBand(finances.employees[0], scout.reputation);

    for (const salary of [band.minimum, band.marketRate, band.maximum]) {
      for (const initialSatisfaction of [-500, 0, 50, 100, 500]) {
        let record: FinancialRecord = {
          ...finances,
          employees: [makeEmployee({ salary, paySatisfaction: initialSatisfaction })],
        };
        for (let week = 1; week <= 260 && record.employees.length > 0; week++) {
          record = processEmployeeWeek(
            new SeededRNG(`satisfaction-${salary}-${initialSatisfaction}-${week}`),
            record,
            scout.reputation,
            week,
            1 + Math.floor((week - 1) / 52),
          );
          if (record.employees[0]) {
            expect(record.employees[0].paySatisfaction).toBeGreaterThanOrEqual(0);
            expect(record.employees[0].paySatisfaction).toBeLessThanOrEqual(100);
          }
        }
      }
    }
  });

  it("processes a given employee week exactly once across save/reload", () => {
    const { scout, finances } = makeFinances(makeEmployee({
      salary: 900,
      paySatisfaction: 50,
    }));
    const once = processEmployeeWeek(
      new SeededRNG("employee-week-once"), finances, scout.reputation, 9, 2,
    );
    const reloaded = structuredClone(once);
    const twice = processEmployeeWeek(
      new SeededRNG("employee-week-once"), reloaded, scout.reputation, 9, 2,
    );

    expect(twice).toBe(reloaded);
    expect(twice).toEqual(once);
    expect(twice.lastEmployeeEconomicsWeek).toEqual({ week: 9, season: 2 });
  });

  it("uses explicit dissatisfaction thresholds for quitting", () => {
    const { scout, finances } = makeFinances(makeEmployee());
    const band = getEmployeeSalaryBand(finances.employees[0], scout.reputation);
    const underpaid = {
      ...finances,
      employees: [makeEmployee({
        salary: band.minimum,
        paySatisfaction: 25,
        morale: 35,
      })],
    };
    const fair = {
      ...finances,
      employees: [makeEmployee({
        salary: band.marketRate,
        paySatisfaction: 68,
        morale: 35,
      })],
    };

    expect(processEmployeeWeek(
      alwaysChanceRng(), underpaid, scout.reputation, 8, 1,
    ).employees).toHaveLength(0);
    expect(processEmployeeWeek(
      alwaysChanceRng(), fair, scout.reputation, 8, 1,
    ).employees).toHaveLength(1);
  });

  it("makes under-market staff measurably easier to poach than premium staff", () => {
    const { scout, finances } = makeFinances(makeEmployee({ quality: 15 }));
    const band = getEmployeeSalaryBand(finances.employees[0], scout.reputation);
    const sampledProbabilities: number[] = [];
    const probe = {
      ...alwaysChanceRng(),
      chance: (probability: number) => {
        sampledProbabilities.push(probability);
        return false;
      },
    } as unknown as RNG;

    checkEmployeeEvents(
      probe,
      makeEmployee({ quality: 15, salary: band.minimum, paySatisfaction: 30 }),
      finances,
      scout,
      8,
      1,
    );
    const underpaidChance = sampledProbabilities[0];
    sampledProbabilities.length = 0;
    checkEmployeeEvents(
      probe,
      makeEmployee({ quality: 15, salary: band.maximum, paySatisfaction: 85 }),
      finances,
      scout,
      8,
      1,
    );
    const premiumChance = sampledProbabilities[0];

    expect(underpaidChance).toBeGreaterThan(premiumChance);
    expect(underpaidChance).toBeLessThanOrEqual(0.12);
    expect(premiumChance).toBeGreaterThanOrEqual(0.004);
  });

  it("migrates £1 and impossible legacy contracts deterministically across reloads", () => {
    const { scout, finances } = makeFinances(makeEmployee({
      salary: 1,
      paySatisfaction: undefined,
    }));
    const firstLoad = normalizeEmployeeContractsInRecord(
      structuredClone(finances), scout.reputation, 12, 3,
    );
    const secondLoad = normalizeEmployeeContractsInRecord(
      structuredClone(firstLoad), scout.reputation, 12, 3,
    );
    const band = getEmployeeSalaryBand(firstLoad.employees[0], scout.reputation);

    expect(firstLoad.employees[0].salary).toBe(band.minimum);
    expect(firstLoad.transactions.at(-1)?.description).toContain("Contract normalized");
    expect(secondLoad).toEqual(firstLoad);
    expect(secondLoad.transactions.filter(
      (transaction) => transaction.referenceId === "employee-contract-normalized:emp_economics",
    )).toHaveLength(1);
  });

  it("preserves a real tradeoff so no salary position dominates every axis", () => {
    const { scout, finances } = makeFinances(makeEmployee());
    const employee = finances.employees[0];
    const band = getEmployeeSalaryBand(employee, scout.reputation);
    const under = getEmployeePayEffects(
      { ...employee, salary: band.minimum, paySatisfaction: 35 }, scout.reputation,
    );
    const fair = getEmployeePayEffects(
      { ...employee, salary: band.marketRate, paySatisfaction: 68 }, scout.reputation,
    );
    const premium = getEmployeePayEffects(
      { ...employee, salary: band.maximum, paySatisfaction: 85 }, scout.reputation,
    );

    expect(band.minimum).toBeLessThan(band.marketRate);
    expect(band.marketRate).toBeLessThan(band.maximum);
    expect(under.retentionRisk).toBeGreaterThan(fair.retentionRisk);
    expect(fair.retentionRisk).toBeGreaterThan(premium.retentionRisk);
    expect(under.performanceMultiplier).toBeLessThan(fair.performanceMultiplier);
    expect(fair.performanceMultiplier).toBeLessThan(premium.performanceMultiplier);
    expect(premium.performanceMultiplier).toBeLessThanOrEqual(1.04);
  });
});
