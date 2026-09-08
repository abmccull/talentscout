import { describe, expect, it } from "vitest";
import type { GameState } from "@/engine/core/types";
import type { AutonomousCareerTelemetry } from "./autonomousYouthCareerDriver";
import { createCareerBalanceDiagnostics } from "./careerBalanceDiagnostics";

function state() {
  return {
    currentSeason: 1, currentWeek: 1,
    scout: { reputation: 10, careerTier: 1, careerPath: "independent" },
    contacts: { contact: { id: "contact", relationship: 50 } }, rivalScouts: {},
    finances: { balance: 100, transactions: [{ week: 1, season: 1, amount: 100, description: "Opening", kind: "openingBalance" }], loans: [] },
    consequenceState: { decisions: {}, consequences: {}, callbacks: {}, facts: {}, memories: {}, obligations: {}, opportunityLocks: {}, metrics: {}, appliedEffects: {}, history: [] },
    narrativeEvents: [], clubDecisions: {},
  } as unknown as Parameters<ReturnType<typeof createCareerBalanceDiagnostics>["observe"]>[0];
}
const telemetry = (meaningfulDecisions = 0, narrativeAcknowledgements = 0) =>
  ({ meaningfulDecisions, narrativeAcknowledgements } as AutonomousCareerTelemetry);

describe("career balance diagnostic measurement", () => {
  it("separates acknowledgements from policy actions and does not double-count a final same-tick sample", () => {
    const collector = createCareerBalanceDiagnostics();
    const value = state();
    collector.observe(value, telemetry(), 0);
    value.currentWeek = 2;
    collector.observe(value, telemetry(1, 1), 1);
    collector.observe(value, telemetry(1, 1), 1);
    expect(collector.finish().choices).toMatchObject({ policyActions: 0, acknowledgements: 1,
      maximumPolicyActionFreeWeeks: 1, policyActionFreeWeeks: 1 });
    expect(collector.finish().weekly).toHaveLength(2);
  });
  it("records an actual later applied consequence once even after its live record is compacted", () => {
    const collector = createCareerBalanceDiagnostics();
    const value = state();
    value.consequenceState.decisions.decision = {
      id: "decision", source: { kind: "narrative", id: "event" }, offeredAt: { season: 1, week: 1 },
      deadlineAt: { season: 1, week: 2 }, status: "selected", visibility: "public", stakeholders: [],
      options: [{ id: "verify", label: "Verify", knownTradeoffs: ["Wait one week"], immediateEffects: [], scheduledConsequences: [] }],
      selectedOptionId: "verify", selectedAt: { season: 1, week: 1 }, selectionKind: "player", outcomeRoll: 0.5, consequenceIds: ["later"],
    };
    value.consequenceState.consequences.later = {
      id: "later", decisionId: "decision", templateId: "follow-up", dueAt: { season: 1, week: 2 },
      status: "pending", effects: [], conditions: [], probability: 1, outcomeRoll: 0.5, tags: [],
    };
    collector.observe(value, telemetry(), 0);
    value.currentWeek = 2;
    value.consequenceState.consequences.later.status = "applied";
    value.consequenceState.consequences.later.resolvedAt = { season: 1, week: 2 };
    collector.observe(value, telemetry(1), 1);
    delete value.consequenceState.consequences.later;
    value.currentWeek = 3;
    collector.observe(value, telemetry(1), 2);
    expect(collector.finish().consequences).toMatchObject({ byStatus: { applied: 1 }, delayedApplied: 1,
      unresolvedDueAtFinal: [] });
  });
  it("keeps opening money, borrowing and classified earnings separate, exposing duplicate references", () => {
    const collector = createCareerBalanceDiagnostics();
    const value = state();
    collector.observe(value, telemetry(), 0);
    value.finances!.transactions.push(
      { week: 2, season: 1, amount: 200, description: "Loan", category: "debt", referenceId: "loan" },
      { week: 2, season: 1, amount: 30, description: "Sale", category: "clientRevenue", referenceId: "sale" },
      { week: 2, season: 1, amount: 30, description: "Duplicate sale", category: "clientRevenue", referenceId: "sale" },
    );
    value.finances!.balance = 360;
    collector.observe(value, telemetry(), 1);
    expect(collector.finish().finance).toMatchObject({ initialBalance: 100, finalBalance: 360,
      grossCashInExcludingOpening: 260, earnedClassifiedReceipts: 60,
      duplicateTransactionReferences: [{ referenceId: "sale", count: 2 }] });
  });
  it("counts each narrative ID once and exposes exact wording repeated across distinct events", () => {
    const collector = createCareerBalanceDiagnostics();
    const value = state();
    const event = { id: "one", type: "exclusiveTip", title: "Scout update", description: "The same words.",
      week: 1, season: 1, relatedIds: [], acknowledged: false } as GameState["narrativeEvents"][number];
    value.narrativeEvents.push(event);
    collector.observe(value, telemetry(), 0);
    value.narrativeEvents.push({ ...event, id: "two", week: 2 });
    collector.observe(value, telemetry(), 1);
    collector.observe(value, telemetry(), 1);
    expect(collector.finish().repetition.exactRepeatedTextGroups).toHaveLength(1);
    expect(collector.finish().repetition.exactRepeatedTextGroups[0].eventIds).toEqual(["one", "two"]);
    expect(collector.finish().authority.humanEngagementMeasured).toBe(false);
  });
});
