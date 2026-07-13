import { describe, expect, it } from "vitest";
import {
  applyConsequenceEffects,
  appendDecisionConsequence,
  compareGameDates,
  createConsequenceEngineState,
  createDecisionRecord,
  expireDueDecisions,
  processDueConsequences,
  registerDecision,
  selectDecisionOption,
} from "@/engine/consequences";
import type {
  ConsequenceEffect,
  DecisionOption,
  EntityRef,
  GameDate,
  OpportunityLock,
} from "@/engine/consequences";

const scout: EntityRef = { kind: "scout", id: "scout-1" };
const director: EntityRef = { kind: "academyDirector", id: "director-1" };
const week1: GameDate = { season: 1, week: 1 };

function options(): DecisionOption[] {
  return [
    {
      id: "back-player",
      label: "Back the player",
      knownTradeoffs: ["Stake credibility", "Close the safer alternative"],
      immediateEffects: [
        {
          id: "effect:trust-immediate",
          type: "adjustMetric",
          metricKey: "clubTrust:club-1",
          delta: 4,
          min: 0,
          max: 100,
        },
        {
          id: "effect:promise",
          type: "createObligation",
          obligation: {
            id: "obligation:follow-up",
            debtor: scout,
            creditor: director,
            kind: "followUpEvidence",
            terms: "Return with character evidence",
            status: "active",
            createdAt: week1,
            dueAt: { season: 1, week: 4 },
            sourceDecisionId: "decision:academy",
          },
        },
      ],
      scheduledConsequences: [
        {
          id: "club-reaction",
          dueAt: { season: 1, week: 3 },
          probability: 0.75,
          outcomeRoll: 0.25,
          conditions: [
            { type: "obligationStatus", obligationId: "obligation:follow-up", status: "active" },
          ],
          effects: [
            {
              id: "effect:director-memory",
              type: "addMemory",
              memory: {
                id: "memory:director:academy",
                stakeholder: director,
                subject: scout,
                tags: ["conviction", "kept-informed"],
                valence: 20,
                intensity: 60,
                salience: 70,
                visibility: "stakeholders",
                createdAt: { season: 1, week: 3 },
                sourceDecisionId: "decision:academy",
              },
            },
          ],
        },
      ],
    },
    {
      id: "wait",
      label: "Wait for more evidence",
      knownTradeoffs: ["Preserve credibility", "Risk losing the player"],
      immediateEffects: [],
      scheduledConsequences: [],
    },
  ];
}

function registeredDecision(outcomeRoll = 0.4) {
  const decision = createDecisionRecord({
    id: "decision:academy",
    source: { kind: "academyBrief", id: "brief-1" },
    offeredAt: week1,
    deadlineAt: { season: 1, week: 2 },
    visibility: "stakeholders",
    stakeholders: [director],
    options: options(),
    defaultOptionId: "wait",
    outcomeRoll,
  });
  return registerDecision(createConsequenceEngineState(), decision).state;
}

describe("consequence foundation", () => {
  it("orders normalized game dates without assuming equal season lengths", () => {
    expect(compareGameDates(
      { season: 2, week: 1 },
      { season: 1, week: 50 },
      50,
    )).toBeGreaterThan(0);
    expect(compareGameDates(
      { season: 2, week: 38 },
      { season: 3, week: 1 },
      38,
    )).toBeLessThan(0);
  });

  it("selects once and schedules immediate and delayed consequences idempotently", () => {
    const state = registeredDecision();
    const selected = selectDecisionOption(state, "decision:academy", "back-player", week1);

    expect(selected.error).toBeUndefined();
    expect(selected.changed).toBe(true);
    expect(selected.consequenceIds).toHaveLength(2);
    expect(Object.keys(selected.state.callbacks)).toHaveLength(2);

    const retry = selectDecisionOption(
      selected.state,
      "decision:academy",
      "back-player",
      week1,
    );
    expect(retry.changed).toBe(false);
    expect(retry.error).toBeUndefined();
    expect(Object.keys(retry.state.consequences)).toHaveLength(2);

    const conflictingRetry = selectDecisionOption(
      selected.state,
      "decision:academy",
      "wait",
      week1,
    );
    expect(conflictingRetry.changed).toBe(false);
    expect(conflictingRetry.error).toContain("already selected");
  });

  it("rejects an idempotency key reused with a different consequence payload", () => {
    const selected = selectDecisionOption(
      registeredDecision(),
      "decision:academy",
      "wait",
      week1,
    ).state;
    const first = appendDecisionConsequence(
      selected,
      "decision:academy",
      "domain-outcome",
      [{
        id: "effect:domain-outcome",
        type: "adjustMetric",
        metricKey: "scout:reputation",
        delta: 3,
      }],
      week1,
    );
    expect(first.error).toBeUndefined();

    const conflict = appendDecisionConsequence(
      first.state,
      "decision:academy",
      "domain-outcome",
      [{
        id: "effect:domain-outcome",
        type: "adjustMetric",
        metricKey: "scout:reputation",
        delta: -9,
      }],
      week1,
    );
    expect(conflict.changed).toBe(false);
    expect(conflict.error).toContain("conflicting or incomplete consequence");
  });

  it("processes consequences only when due and resolves the decision after every child is terminal", () => {
    const selected = selectDecisionOption(
      registeredDecision(),
      "decision:academy",
      "back-player",
      week1,
    ).state;

    const immediate = processDueConsequences(selected, week1);
    expect(immediate.errors).toEqual([]);
    expect(immediate.appliedConsequenceIds).toHaveLength(1);
    expect(immediate.state.metrics["clubTrust:club-1"]).toBe(4);
    expect(immediate.state.obligations["obligation:follow-up"]?.status).toBe("active");
    expect(immediate.state.decisions["decision:academy"]?.status).toBe("selected");

    const tooEarly = processDueConsequences(immediate.state, { season: 1, week: 2 });
    expect(tooEarly.appliedConsequenceIds).toEqual([]);
    expect(Object.keys(tooEarly.state.memories)).toHaveLength(0);

    const delayed = processDueConsequences(tooEarly.state, { season: 1, week: 3 });
    expect(delayed.appliedConsequenceIds).toHaveLength(1);
    expect(delayed.state.memories["memory:director:academy"]?.tags).toContain("conviction");
    expect(delayed.state.decisions["decision:academy"]?.status).toBe("resolved");

    const replay = processDueConsequences(delayed.state, { season: 1, week: 3 });
    expect(replay.appliedConsequenceIds).toEqual([]);
    expect(replay.state.metrics["clubTrust:club-1"]).toBe(4);
    expect(Object.keys(replay.state.appliedEffects)).toHaveLength(3);
  });

  it("persists chance rolls so save and reload cannot reroll an outcome", () => {
    const optionSet = options();
    optionSet[0] = {
      ...optionSet[0],
      immediateEffects: [],
      scheduledConsequences: [{
        id: "leak-check",
        dueAt: week1,
        probability: 0.5,
        outcomeRoll: 0.8,
        effects: [{
          id: "effect:leak",
          type: "recordFact",
          fact: {
            id: "fact:leaked",
            kind: "informationLeaked",
            value: true,
            observedAt: week1,
            visibility: "public",
          },
        }],
      }],
    };
    const decision = createDecisionRecord({
      id: "decision:leak",
      source: { kind: "contact", id: "contact-1" },
      offeredAt: week1,
      deadlineAt: week1,
      visibility: "private",
      options: optionSet,
      outcomeRoll: 0.1,
    });
    const registered = registerDecision(createConsequenceEngineState(), decision).state;
    const selected = selectDecisionOption(registered, decision.id, "back-player", week1).state;

    const first = processDueConsequences(selected, week1);
    const reloaded = JSON.parse(JSON.stringify(selected)) as typeof selected;
    const afterReload = processDueConsequences(reloaded, week1);

    expect(first.skippedConsequenceIds).toEqual(afterReload.skippedConsequenceIds);
    expect(first.state.facts["fact:leaked"]).toBeUndefined();
    expect(afterReload.state.facts["fact:leaked"]).toBeUndefined();
  });

  it("consuming an opportunity closes every mutually exclusive alternative", () => {
    const ownClub: OpportunityLock = {
      id: "lock:own-club",
      opportunityId: "place-own-club",
      exclusiveSetId: "placement:player-1",
      owner: scout,
      status: "active",
      createdAt: week1,
    };
    const bestFit: OpportunityLock = {
      ...ownClub,
      id: "lock:best-fit",
      opportunityId: "place-best-fit",
    };
    const createEffects: ConsequenceEffect[] = [
      { id: "effect:create-own", type: "createOpportunityLock", lock: ownClub },
      { id: "effect:create-best", type: "createOpportunityLock", lock: bestFit },
    ];
    const created = applyConsequenceEffects(
      createConsequenceEngineState(),
      "consequence:create-locks",
      createEffects,
      week1,
    );
    expect(created.success).toBe(true);

    const consumed = applyConsequenceEffects(
      created.state,
      "consequence:consume-own",
      [{
        id: "effect:consume-own",
        type: "transitionOpportunityLock",
        opportunityLockId: ownClub.id,
        status: "consumed",
      }],
      week1,
    );
    expect(consumed.success).toBe(true);
    expect(consumed.state.opportunityLocks[ownClub.id]?.status).toBe("consumed");
    expect(consumed.state.opportunityLocks[bestFit.id]?.status).toBe("closed");

    const impossibleSecondReward = applyConsequenceEffects(
      consumed.state,
      "consequence:consume-best",
      [{
        id: "effect:consume-best",
        type: "transitionOpportunityLock",
        opportunityLockId: bestFit.id,
        status: "consumed",
      }],
      week1,
    );
    expect(impossibleSecondReward.success).toBe(false);
    expect(impossibleSecondReward.state).toBe(consumed.state);
  });

  it("uses an explicit default option when a decision expires", () => {
    const state = registeredDecision();
    const expired = expireDueDecisions(state, { season: 1, week: 3 });

    expect(expired.error).toBeUndefined();
    expect(expired.expiredDecisionIds).toEqual(["decision:academy"]);
    expect(expired.state.decisions["decision:academy"]?.selectedOptionId).toBe("wait");
    expect(expired.state.decisions["decision:academy"]?.selectionKind).toBe("default");
    expect(expired.state.decisions["decision:academy"]?.status).toBe("resolved");

    const replay = expireDueDecisions(expired.state, { season: 1, week: 4 });
    expect(replay.expiredDecisionIds).toEqual([]);
    expect(replay.state).toBe(expired.state);
  });

  it("applies a consequence atomically when a later effect is invalid", () => {
    const state = createConsequenceEngineState();
    const result = applyConsequenceEffects(
      state,
      "consequence:invalid",
      [
        {
          id: "effect:money",
          type: "adjustMetric",
          metricKey: "cash",
          delta: 500,
        },
        {
          id: "effect:missing-obligation",
          type: "transitionObligation",
          obligationId: "does-not-exist",
          status: "fulfilled",
        },
      ],
      week1,
    );

    expect(result.success).toBe(false);
    expect(result.state).toBe(state);
    expect(result.state.metrics.cash).toBeUndefined();
    expect(Object.keys(result.state.appliedEffects)).toHaveLength(0);
  });

  it("prevents an obligation from reaching incompatible terminal states", () => {
    const created = applyConsequenceEffects(
      createConsequenceEngineState(),
      "consequence:create-obligation",
      [{
        id: "effect:create-obligation",
        type: "createObligation",
        obligation: {
          id: "obligation:confidentiality",
          debtor: scout,
          creditor: director,
          kind: "confidentiality",
          terms: "Keep the trial private",
          status: "active",
          createdAt: week1,
          sourceDecisionId: "decision:academy",
        },
      }],
      week1,
    );
    const fulfilled = applyConsequenceEffects(
      created.state,
      "consequence:fulfill",
      [{
        id: "effect:fulfill",
        type: "transitionObligation",
        obligationId: "obligation:confidentiality",
        status: "fulfilled",
      }],
      { season: 1, week: 2 },
    );
    const breachedAfterFulfillment = applyConsequenceEffects(
      fulfilled.state,
      "consequence:breach",
      [{
        id: "effect:breach",
        type: "transitionObligation",
        obligationId: "obligation:confidentiality",
        status: "breached",
      }],
      { season: 1, week: 3 },
    );

    expect(fulfilled.state.obligations["obligation:confidentiality"]?.status).toBe("fulfilled");
    expect(breachedAfterFulfillment.success).toBe(false);
    expect(breachedAfterFulfillment.state).toBe(fulfilled.state);
  });
});
