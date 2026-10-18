import { describe, expect, it } from "vitest";
import type { FinancialRecord, Player, ScoutReport } from "@/engine/core/types";
import { recordRetainerDelivery } from "@/engine/finance/retainers";

function finances(): FinancialRecord {
  return { retainerContracts: [{ id: "retainer", clubId: "club", status: "active", tier: 2,
    monthlyFee: 250, requiredReportsPerMonth: 1, reportsDeliveredThisMonth: 0, deliveredReportIds: [],
    brief: { focus: "academy", targetPositions: ["CM"], ageRange: [15, 20], minimumReportQuality: 60, description: "Youth CM" },
  }] } as unknown as FinancialRecord;
}
const player = { id: "player", age: 17, position: "CM" } as Player;

describe("retainer decision privacy boundary", () => {
  it("does not count private pass evidence toward quota or quality after reload", () => {
    const before = finances();
    const report = JSON.parse(JSON.stringify({ id: "private-report", playerId: player.id, qualityScore: 99,
      recommendedAction: "monitor", decisionReceipt: { id: "private-receipt", action: "pass" },
      evidenceAssessment: { claims: [{ support: "supported" }] },
    })) as ScoutReport;
    expect(recordRetainerDelivery(before, "club", report, player)).toBe(before);
    expect(recordRetainerDelivery(before, "club", report, player)).toBe(before);
  });

  it("retains legacy professional pass deliveries once without inventing a receipt", () => {
    const report = { id: "legacy-report", playerId: player.id, qualityScore: 90, recommendedAction: "pass" } as ScoutReport;
    const paid = recordRetainerDelivery(finances(), "club", report, player);
    expect(paid.retainerContracts[0].reportsDeliveredThisMonth).toBe(1);
    expect(paid.retainerContracts[0].deliveredReportIds).toEqual([report.id]);
    expect(recordRetainerDelivery(paid, "club", report, player).retainerContracts).toEqual(paid.retainerContracts);
    expect(report).not.toHaveProperty("decisionReceipt");
  });
});
