import { describe, expect, it } from "vitest";
import type { GameState } from "@/engine/core/types";
import {
  createConsequenceEngineState,
  createDecisionRecord,
  maintainConsequenceLifecycle,
  processDueConsequences,
  projectConsequenceMetrics,
  registerDecision,
  selectDecisionOption,
  synchronizeConsequenceMetrics,
} from "@/engine/consequences";

const week1 = { season: 1, week: 1 };
const week2 = { season: 1, week: 2 };

function projectionGameState(): GameState {
  return {
    currentWeek: 2,
    currentSeason: 1,
    scout: {
      id: "scout-1",
      reputation: 50,
      fatigue: 12,
      clubTrust: 40,
      specializationReputation: 30,
    },
    contacts: {
      "contact-1": {
        id: "contact-1",
        name: "Alex Source",
        type: "academyCoach",
        organization: "Riverside Academy",
        relationship: 60,
        reliability: 70,
        knownPlayerIds: [],
        trustLevel: 70,
        loyalty: 55,
        dormant: false,
      },
    },
    consequenceState: createConsequenceEngineState(),
  } as unknown as GameState;
}

describe("consequence metric projection and lifecycle", () => {
  it("preserves fractional reputation when the consequence ledger projects no change", () => {
    const base = projectionGameState();
    const gameState = {
      ...base,
      scout: { ...base.scout, reputation: 31.564 },
      consequenceState: createConsequenceEngineState({
        metrics: { "scout:reputation": 30 },
      }),
    };

    const synchronized = synchronizeConsequenceMetrics(
      gameState,
      gameState.consequenceState,
    );
    const projected = projectConsequenceMetrics(gameState, synchronized);

    expect(synchronized.metrics["scout:reputation"]).toBe(31.564);
    expect(projected.scout.reputation).toBe(31.564);
  });

  it("rebases and projects delayed scout/contact effects exactly once", () => {
    const decision = createDecisionRecord({
      id: "decision:delayed-projection",
      source: { kind: "contact", id: "contact-1" },
      offeredAt: week1,
      deadlineAt: week1,
      visibility: "stakeholders",
      outcomeRoll: 0.2,
      options: [
        {
          id: "take-risk",
          label: "Take the risk",
          knownTradeoffs: ["The source expects discretion"],
          immediateEffects: [],
          scheduledConsequences: [{
            id: "source-reaction",
            dueAt: week2,
            effects: [
              {
                id: "effect:delayed-reputation",
                type: "adjustMetric",
                metricKey: "scout:reputation",
                delta: 7,
                min: 0,
                max: 100,
              },
              {
                id: "effect:delayed-relationship",
                type: "adjustMetric",
                metricKey: "contact:contact-1:relationship",
                delta: -45,
                min: 0,
                max: 100,
              },
              {
                id: "effect:delayed-trust",
                type: "adjustMetric",
                metricKey: "contact:contact-1:trust",
                delta: -10,
                min: 0,
                max: 100,
              },
            ],
          }],
        },
        {
          id: "decline",
          label: "Decline",
          knownTradeoffs: [],
          immediateEffects: [],
          scheduledConsequences: [],
        },
      ],
    });
    const registered = registerDecision(createConsequenceEngineState(), decision).state;
    const selected = selectDecisionOption(
      registered,
      decision.id,
      "take-risk",
      week1,
    ).state;
    const gameState = projectionGameState();

    // No adapter seeded these values when the decision was offered. Weekly
    // processing discovers the pending references and rebases them now.
    const synchronized = synchronizeConsequenceMetrics(gameState, selected);
    expect(synchronized.metrics).toMatchObject({
      "scout:reputation": 50,
      "contact:contact-1:relationship": 60,
      "contact:contact-1:trust": 70,
    });

    const processed = processDueConsequences(synchronized, week2);
    const projected = projectConsequenceMetrics(gameState, processed.state);
    expect(projected.scout.reputation).toBe(57);
    expect(projected.contacts["contact-1"]).toMatchObject({
      relationship: 15,
      trustLevel: 60,
      dormant: true,
    });

    const replayReady = synchronizeConsequenceMetrics(
      projected,
      projected.consequenceState,
    );
    const replayed = processDueConsequences(replayReady, week2);
    const replayedProjection = projectConsequenceMetrics(projected, replayed.state);
    expect(replayed.appliedConsequenceIds).toEqual([]);
    expect(replayedProjection.scout.reputation).toBe(57);
    expect(replayedProjection.contacts["contact-1"]?.relationship).toBe(15);
  });

  it("expires ephemeral records after their inclusive deadline and is idempotent", () => {
    const state = createConsequenceEngineState({
      facts: {
        "fact:temporary": {
          id: "fact:temporary",
          kind: "TemporaryAccess",
          value: true,
          observedAt: week1,
          visibility: "private",
          expiresAt: week1,
        },
      },
      memories: {
        "memory:fading": {
          id: "memory:fading",
          stakeholder: { kind: "contact", id: "contact-1" },
          subject: { kind: "scout", id: "scout-1" },
          tags: ["minor-favour"],
          valence: 5,
          intensity: 10,
          salience: 2,
          visibility: "stakeholders",
          createdAt: week1,
          halfLifeWeeks: 1,
        },
      },
      obligations: {
        "obligation:reply": {
          id: "obligation:reply",
          debtor: { kind: "scout", id: "scout-1" },
          creditor: { kind: "contact", id: "contact-1" },
          kind: "reply",
          terms: "Respond before the window closes",
          status: "active",
          createdAt: week1,
          dueAt: week1,
          sourceDecisionId: "decision:access",
        },
      },
      opportunityLocks: {
        "lock:trial": {
          id: "lock:trial",
          opportunityId: "private-trial",
          exclusiveSetId: "trial:player-1",
          owner: { kind: "scout", id: "scout-1" },
          status: "active",
          createdAt: week1,
          expiresAt: week1,
        },
      },
    });

    const onDeadline = maintainConsequenceLifecycle(state, week1);
    expect(onDeadline.state).toBe(state);

    const expired = maintainConsequenceLifecycle(state, week2);
    expect(expired.expiredFactIds).toEqual(["fact:temporary"]);
    expect(expired.expiredMemoryIds).toEqual(["memory:fading"]);
    expect(expired.expiredObligationIds).toEqual(["obligation:reply"]);
    expect(expired.expiredOpportunityLockIds).toEqual(["lock:trial"]);
    expect(expired.state.facts["fact:temporary"]).toBeUndefined();
    expect(expired.state.memories["memory:fading"]).toBeUndefined();
    expect(expired.state.obligations["obligation:reply"]?.status).toBe("expired");
    expect(expired.state.opportunityLocks["lock:trial"]?.status).toBe("expired");

    const replayed = maintainConsequenceLifecycle(expired.state, week2);
    expect(replayed.state).toBe(expired.state);
    expect(replayed.expiredFactIds).toEqual([]);
    expect(replayed.expiredMemoryIds).toEqual([]);
    expect(replayed.expiredObligationIds).toEqual([]);
    expect(replayed.expiredOpportunityLockIds).toEqual([]);
  });

  it("bounds terminal execution detail while retaining recent causal summaries", () => {
    let state = createConsequenceEngineState();
    for (let week = 1; week <= 8; week += 1) {
      const date = { season: 1, week };
      const decision = createDecisionRecord({
        id: `decision:${week}`,
        source: { kind: "testEvent", id: `event:${week}` },
        offeredAt: date,
        deadlineAt: date,
        visibility: "private",
        outcomeRoll: 0.1,
        options: [
          {
            id: "act",
            label: "Act",
            knownTradeoffs: [],
            immediateEffects: [{
              id: `effect:${week}`,
              type: "adjustMetric",
              metricKey: "test:score",
              delta: 1,
            }],
            scheduledConsequences: [],
          },
          {
            id: "pass",
            label: "Pass",
            knownTradeoffs: [],
            immediateEffects: [],
            scheduledConsequences: [],
          },
        ],
      });
      state = registerDecision(state, decision).state;
      state = selectDecisionOption(state, decision.id, "act", date).state;
      state = processDueConsequences(state, date).state;
    }

    expect(Object.keys(state.decisions)).toHaveLength(8);
    expect(Object.keys(state.consequences)).toHaveLength(8);
    expect(Object.keys(state.callbacks)).toHaveLength(8);
    expect(Object.keys(state.appliedEffects)).toHaveLength(8);

    const compacted = maintainConsequenceLifecycle(
      state,
      { season: 1, week: 10 },
      38,
      {
        executionRetentionWeeks: 100,
        maxTerminalDecisions: 2,
        maxHistoryEntries: 4,
      },
    );

    expect(Object.keys(compacted.state.decisions).sort()).toEqual([
      "decision:7",
      "decision:8",
    ]);
    expect(Object.keys(compacted.state.consequences)).toHaveLength(2);
    expect(Object.keys(compacted.state.callbacks)).toHaveLength(2);
    expect(Object.keys(compacted.state.appliedEffects)).toHaveLength(2);
    expect(compacted.state.history.map((record) => record.decisionId)).toEqual([
      "decision:3",
      "decision:4",
      "decision:5",
      "decision:6",
    ]);
    expect(compacted.state.metrics["test:score"]).toBe(8);

    const archivedRegistration = registerDecision(
      compacted.state,
      createDecisionRecord({
        id: "decision:6",
        source: { kind: "testEvent", id: "event:6" },
        offeredAt: { season: 1, week: 6 },
        deadlineAt: { season: 1, week: 6 },
        visibility: "private",
        outcomeRoll: 0.1,
        options: [
          {
            id: "act",
            label: "Act",
            knownTradeoffs: [],
            immediateEffects: [],
            scheduledConsequences: [],
          },
          {
            id: "pass",
            label: "Pass",
            knownTradeoffs: [],
            immediateEffects: [],
            scheduledConsequences: [],
          },
        ],
      }),
    );
    expect(archivedRegistration.error).toContain("already been resolved and archived");

    const replayed = maintainConsequenceLifecycle(
      compacted.state,
      { season: 1, week: 10 },
      38,
      {
        executionRetentionWeeks: 100,
        maxTerminalDecisions: 2,
        maxHistoryEntries: 4,
      },
    );
    expect(replayed.state).toBe(compacted.state);
    expect(replayed.compactedDecisionIds).toEqual([]);
  });
});
