import { describe, expect, it } from "vitest";
import type { FinancialRecord } from "@/engine/core/types";
import {
  buildAgencyModifierLedger,
  createDefaultInfrastructure,
  createDefaultInventory,
  getEmployeeOfficeQualityBonus,
} from "@/engine/finance";

function finances(): Pick<FinancialRecord, "office" | "satelliteOffices" | "equipment"> {
  return {
    office: {
      tier: "professional",
      monthlyCost: 1_500,
      qualityBonus: 0.15,
      maxEmployees: 6,
    },
    satelliteOffices: [{
      id: "sat-spain",
      region: "spain",
      monthlyCost: 1_000,
      qualityBonus: 0.1,
      maxEmployees: 3,
      employeeIds: ["employee-spain"],
      openedWeek: 4,
      openedSeason: 1,
    }],
    equipment: createDefaultInventory(),
  };
}

describe("agency modifier ledger", () => {
  it("unifies infrastructure, office, satellite, equipment, and career tools", () => {
    const infrastructure = {
      ...createDefaultInfrastructure(),
      dataSubscription: "premium" as const,
      travelBudget: "business" as const,
      officeEquipment: "professional" as const,
    };
    const ledger = buildAgencyModifierLedger({
      scoutingInfrastructure: infrastructure,
      finances: finances(),
      unlockedTools: ["dataSubscription", "scoutingApp", "youthDatabase", "performanceTracker"],
    });

    expect(ledger.find((entry) => entry.id === "infrastructure-data")).toMatchObject({
      status: "active",
      currentValue: "+12%",
    });
    expect(ledger.find((entry) => entry.id === "agency-office")?.formula)
      .toMatch(/reviewable leads/i);
    expect(ledger.find((entry) => entry.id === "satellite-office-sat-spain"))
      .toMatchObject({ status: "active" });
    expect(ledger.find((entry) => entry.id === "career-tool-dataSubscription-accuracyBonus"))
      .toMatchObject({ status: "active", currentValue: "+10%" });
    expect(ledger.find((entry) => entry.id === "career-tool-scoutingApp-workflowFatigueReduction"))
      .toMatchObject({ status: "conditional", currentValue: "-1 fatigue" });
    expect(ledger.find((entry) => entry.id === "career-tool-youthDatabase-youthDiscoveryBonus"))
      .toMatchObject({ currentValue: "+1 candidate per eligible search" });
    expect(ledger.find((entry) => entry.id === "career-tool-performanceTracker-trendHistoryDepth"))
      .toMatchObject({ currentValue: "4 seasons visible" });
    expect(ledger.every((entry) =>
      entry.source.length > 0
      && entry.formula.length > 0
      && entry.currentValue.length > 0
      && entry.affectedActions.length > 0)).toBe(true);
  });

  it("uses an assigned satellite office instead of headquarters for employee quality", () => {
    const record = finances();
    expect(getEmployeeOfficeQualityBonus(record, "employee-spain")).toBe(0.1);
    expect(getEmployeeOfficeQualityBonus(record, "employee-hq")).toBe(0.15);
  });
});
