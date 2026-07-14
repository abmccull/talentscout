import { describe, expect, it } from "vitest";
import type { Activity, DayResult } from "@/engine/core/types";
import {
  createWeeklyStrategyState,
  getDelegationPolicyModifier,
  getWeeklyIntentActivityModifier,
  getWeeklyIntentActivityPriority,
  normalizeWeeklyStrategyState,
  recordWeeklyStrategyOutcome,
  resolveAllDelegatedDayInteractions,
  resolveDelegatedDayInteraction,
  selectDelegationPolicy,
  selectWeeklyIntent,
} from "@/engine/core/weeklyStrategy";

function day(
  dayIndex: number,
  activity: Activity,
  playerIds: string[] = [],
): DayResult {
  return {
    dayIndex,
    dayName: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][dayIndex],
    activity,
    observations: playerIds.map((playerId) => ({
      playerId,
      playerName: playerId,
      topAttributes: "Evidence only",
    })),
    playersDiscovered: 0,
    reportsWritten: [],
    profilesGenerated: 0,
    anomaliesFound: 0,
    xpGained: {},
    fatigueChange: 1,
    narrative: "The scheduled work unfolds.",
    inboxMessages: [],
    interaction: {
      prompt: "How should the desk approach this?",
      options: [
        { id: "scan", label: "Scan", description: "Go wide" },
        { id: "focus", label: "Focus", description: "Go deep" },
        { id: "network", label: "Network", description: "Build context" },
      ],
      maxFocusPlayers: 2,
    },
  };
}

describe("weekly strategy and delegation integrity", () => {
  it("migrates missing and malformed state to bounded safe defaults", () => {
    expect(normalizeWeeklyStrategyState(undefined, 4, 2)).toEqual({
      intentId: "balancedDesk",
      delegationPolicyId: "adaptiveDesk",
      lastChangedWeek: 4,
      lastChangedSeason: 2,
      history: [],
    });

    const malformed = normalizeWeeklyStrategyState({
      intentId: "unknown",
      delegationPolicyId: "wrong",
      lastChangedWeek: Number.NaN,
      lastChangedSeason: Number.NaN,
      history: [{ id: "", delegationMemories: [] }],
    } as never, 9, 3);
    expect(malformed.intentId).toBe("balancedDesk");
    expect(malformed.delegationPolicyId).toBe("adaptiveDesk");
    expect(malformed.lastChangedWeek).toBe(9);
    expect(malformed.history).toEqual([]);
  });

  it("makes each intent change scheduler preference and real outcome tradeoffs", () => {
    const broad: Activity = { type: "grassrootsTournament", slots: 2, description: "Open event" };
    const report: Activity = { type: "writeReport", slots: 1, description: "Assigned report", briefId: "brief-1" };

    expect(getWeeklyIntentActivityPriority("discoveryBreadth", broad)).toBeGreaterThan(0);
    expect(getWeeklyIntentActivityPriority("evidenceDepth", broad)).toBeLessThan(0);
    expect(getWeeklyIntentActivityPriority("assignmentDelivery", report)).toBeGreaterThan(0);
    expect(getWeeklyIntentActivityPriority("speculativeEdge", report)).toBeLessThan(0);

    expect(getWeeklyIntentActivityModifier("discoveryBreadth", broad)).toMatchObject({
      discoveryModifier: 1,
      profileModifier: 1,
    });
    expect(getWeeklyIntentActivityModifier("discoveryBreadth", report)).toMatchObject({
      reportQualityModifier: -1,
    });
    expect(getWeeklyIntentActivityModifier("assignmentDelivery", report)).toMatchObject({
      reportQualityModifier: 1,
      relationshipModifier: 1,
    });
  });

  it("gives every delegation policy a protected value and an opposing cost", () => {
    expect(getDelegationPolicyModifier("protectCoverage")).toMatchObject({
      discoveryModifier: 1,
      reportQualityModifier: -1,
    });
    expect(getDelegationPolicyModifier("protectEvidence")).toMatchObject({
      reportQualityModifier: 1,
      discoveryModifier: -1,
    });
    expect(getDelegationPolicyModifier("protectRelationships")).toMatchObject({
      relationshipModifier: 1,
      discoveryModifier: -1,
    });
  });

  it("resolves skipped critical calls through the chosen standing order", () => {
    const original = day(0, { type: "writeReport", slots: 1, description: "Report" }, ["p1", "p2", "p3"]);
    const resolved = resolveDelegatedDayInteraction(original, "protectEvidence");

    expect(original.interaction?.selectedOptionId).toBeUndefined();
    expect(resolved.interaction).toMatchObject({
      selectedOptionId: "focus",
      resolutionMode: "delegated",
      delegationPolicyId: "protectEvidence",
      focusedPlayerId: "p1",
      focusedPlayerIds: ["p1", "p2"],
    });
    expect(resolved.narrative).toContain("Standing order delegated");
    expect(resolved.narrative).toContain("relationship work receives less care");
  });

  it("keeps sequential manual skipping equivalent to batch fast-forward", () => {
    const days = [
      day(0, { type: "schoolMatch", slots: 1, description: "School match" }, ["p1"]),
      day(1, { type: "writeReport", slots: 1, description: "Report" }, ["p2", "p3"]),
      day(2, { type: "networkMeeting", slots: 1, description: "Meeting" }),
    ];

    const sequential = days.map((entry) =>
      resolveDelegatedDayInteraction(entry, "protectRelationships"),
    );
    const batch = resolveAllDelegatedDayInteractions(days, "protectRelationships");
    expect(batch).toEqual(sequential);
    expect(batch.every((entry) => entry.interaction?.selectedOptionId === "network")).toBe(true);
  });

  it("archives intent alignment and delegated consequences once", () => {
    let strategy = createWeeklyStrategyState(5, 2);
    strategy = selectWeeklyIntent(strategy, "assignmentDelivery", 5, 2);
    strategy = selectDelegationPolicy(strategy, "protectEvidence", 5, 2);
    const days = resolveAllDelegatedDayInteractions([
      day(0, { type: "writeReport", slots: 1, description: "Brief", briefId: "brief-1" }, ["p1"]),
      day(1, { type: "grassrootsTournament", slots: 1, description: "Speculative" }, ["p2"]),
    ], strategy.delegationPolicyId);

    const recorded = recordWeeklyStrategyOutcome(strategy, 5, 2, days);
    expect(recorded.history).toHaveLength(1);
    expect(recorded.history[0]).toMatchObject({
      id: "weekly-strategy-s2-w5",
      intentId: "assignmentDelivery",
      delegationPolicyId: "protectEvidence",
      alignedActivities: 1,
      opposedActivities: 1,
    });
    expect(recorded.history[0].delegationMemories).toHaveLength(2);
    expect(recorded.history[0].delegationMemories[0].opportunityCost).not.toBe("");

    const replay = recordWeeklyStrategyOutcome(recorded, 5, 2, days);
    expect(replay).toEqual(recorded);
  });
});
