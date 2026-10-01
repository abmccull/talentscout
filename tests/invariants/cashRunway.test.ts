import { describe, expect, it } from "vitest";
import { runwayMonths, calculateCashRunway } from "@/engine/finance/cashRunway";
import { deriveCareerRolePackage } from "@/engine/career/rolePackages";

describe("career cash runway", () => {
  it("leaves incomplete financial records unknown instead of assuming zero commitments", () => {
    expect(calculateCashRunway({ balance: 2400 } as never, { careerTier: 1 } as never)).toBeUndefined();
    expect(calculateCashRunway(undefined, {} as never)).toBeUndefined();
  });
  it.each([
    [2400, 0, 300, 8, false],
    [6000, 0, 4000, 1.5, true],
    [100, 1000, 500, Infinity, false],
    [-100, 1000, 500, 0, true],
    [2000, 0, 1000, 2, false],
  ])("uses burn rather than cash alone: balance %s", (balance, income, expenses, months, pressure) => {
    const cashRunwayMonths = runwayMonths(balance, income, expenses);
    expect(cashRunwayMonths).toBe(months);
    const role = deriveCareerRolePackage({
      scout: { careerPath: "independent", careerTier: 3, primarySpecialization: "youth", reputation: 50, clubTrust: 0 },
      finances: { balance, office: { tier: "home", maxEmployees: 0 }, retainerContracts: [], employees: [], pendingEmployeeEvents: [], clientRelationships: [] },
      cashRunwayMonths,
    } as never);
    expect(role.pressures.some((item) => item.id === "runway")).toBe(pressure);
  });
});
