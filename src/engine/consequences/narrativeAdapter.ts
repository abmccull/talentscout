import type { GameState, NarrativeEvent } from "@/engine/core/types";
import { addGameWeeks, getSeasonLength } from "@/engine/core/gameDate";
import { createNamedRNG } from "@/engine/run";
import {
  buildSpecialEventDecisionOption,
  buildSpecialEventOfferObligations,
} from "@/engine/events/specialEventDeck";
import {
  createDecisionRecord,
  registerDecision,
  selectDecisionOption,
} from "./decisionLedger";
import { processDueConsequences } from "./processor";
import { synchronizeConsequenceMetrics } from "./projection";
import type {
  ConsequenceEngineState,
  DecisionOption,
  EntityRef,
  OpportunityLock,
  ScheduledConsequenceTemplate,
} from "./types";

function optionId(effect: string, index: number): string {
  const normalized = effect
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "option";
  return `${normalized}-${index + 1}`;
}

function relatedEntity(state: GameState, id: string): EntityRef {
  if (state.contacts[id]) return { kind: "contact", id };
  if (state.clubs[id]) return { kind: "club", id };
  if (state.players[id] || state.retiredPlayers[id]) return { kind: "player", id };
  if (state.unsignedYouth[id]) return { kind: "unsignedYouth", id };
  if (state.rivalScouts[id]) return { kind: "rivalScout", id };
  if (state.finances?.employees.some((employee) => employee.id === id)) {
    return { kind: "employee", id };
  }
  return { kind: "entity", id };
}

function ensureSpecialEventOfferObligations(
  state: GameState,
  event: NarrativeEvent,
  decisionId: string,
): GameState {
  const offered = buildSpecialEventOfferObligations(state, event, decisionId);
  const missing = Object.fromEntries(
    Object.entries(offered).filter(([id]) => !state.consequenceState.obligations[id]),
  );
  if (Object.keys(missing).length === 0) return state;
  return {
    ...state,
    consequenceState: {
      ...state.consequenceState,
      obligations: {
        ...state.consequenceState.obligations,
        ...missing,
      },
    },
  };
}

export function narrativeDecisionId(eventId: string): string {
  return `decision:narrative:${eventId}`;
}

function buildOpportunityLocks(
  state: GameState,
  decisionId: string,
  optionIds: string[],
  event: NarrativeEvent,
  expiresAt: { week: number; season: number },
): Record<string, OpportunityLock> {
  const createdAt = { week: event.week, season: event.season };
  const exclusiveSetId = `narrative:${event.id}`;
  return Object.fromEntries(optionIds.map((id) => {
    const lockId = `opportunity:${decisionId}:${id}`;
    return [lockId, {
      id: lockId,
      opportunityId: id,
      exclusiveSetId,
      owner: { kind: "scout", id: state.scout.id },
      status: "active" as const,
      createdAt,
      expiresAt,
      sourceDecisionId: decisionId,
      metadata: { narrativeEventId: event.id },
    }];
  }));
}

// Timeout behavior is a design decision, not an array-position convention.
// Every entry represents the low-commitment/status-quo response for that beat.
const TIMEOUT_DEFAULT_EFFECTS = new Set([
  "ignore",
  "decline",
  "concede",
  "burnoutPush",
  "familyStayFocused",
  "conferenceDecline",
  "mentorDecline",
  "interviewDecline",
  "restructureResist",
  "poachStayLoyal",
  "homesickLeave",
  "controversyDistance",
  "prodigyNeutral",
  "betrayalMonitor",
  "accessPass",
  "doubleDealLeverage",
  "journalistRefuse",
  "conflictWait",
  "transferWarn",
  "transferReject",
  "wonderkidProtect",
  "ultimatumAccept",
  "poachPivot",
  "injuryOptimistic",
  "betrayalTest",
  "scandalLegal",
  "falloutResults",
  "youthWait",
  "wonderkidWait",
  "agentLeverage",
  "prodigalPass",
  "boardNeutral",
  "intlHoldOff",
  "crossroadsWalkAway",
  "confidentialityKeep",
]);

export interface NarrativeDecisionPolicy {
  deadlineWeeks: number;
  defaultChoiceIndex?: number;
}

export function getNarrativeDecisionPolicy(
  event: NarrativeEvent,
): NarrativeDecisionPolicy {
  const explicitDefault = event.defaultChoiceIndex;
  const inferredDefault = event.choices?.findIndex((choice) =>
    TIMEOUT_DEFAULT_EFFECTS.has(choice.effect),
  );
  const defaultChoiceIndex = explicitDefault !== undefined
    ? explicitDefault
    : inferredDefault !== undefined && inferredDefault >= 0
      ? inferredDefault
      : undefined;
  return {
    deadlineWeeks: Math.max(
      1,
      Math.floor(event.decisionDeadlineWeeks ?? (event.storylineId || event.chainId ? 2 : 3)),
    ),
    defaultChoiceIndex,
  };
}

function turningPointConsequences(
  state: GameState,
  event: NarrativeEvent,
  decisionId: string,
  effect: string,
): ScheduledConsequenceTemplate[] {
  if (event.type !== "careerCrossroads" || effect === "crossroadsWalkAway") {
    return [];
  }
  const optionRoll = createNamedRNG(
    state.runManifest.rootSeed,
    "narrative-outcome",
    event.id,
    effect,
  ).next();
  const allIn = effect === "crossroadsAllIn";
  const succeeded = optionRoll < (allIn ? 0.55 : 0.72);
  const reputationDelta = succeeded
    ? allIn ? 12 : 5
    : allIn ? -9 : -2;
  const dueAt = addGameWeeks(
    state.fixtures,
    { week: event.week, season: event.season },
    allIn ? 6 : 5,
  );
  const resultTag = succeeded ? "crossroads-success" : "crossroads-failure";
  return [{
    id: `turning-point-${effect}`,
    dueAt,
    probability: 1,
    outcomeRoll: optionRoll,
    tags: ["turning-point", resultTag, effect],
    effects: [
      {
        id: `effect:${decisionId}:${effect}:delayed-reputation`,
        type: "adjustMetric",
        metricKey: "scout:reputation",
        delta: reputationDelta,
        min: 0,
        max: 100,
      },
      {
        id: `effect:${decisionId}:${effect}:outcome-fact`,
        type: "recordFact",
        fact: {
          id: `fact:${decisionId}:football-outcome`,
          kind: "CareerCrossroadsOutcome",
          subject: { kind: "narrativeEvent", id: event.id },
          value: {
            succeeded,
            approach: effect,
            reputationDelta,
          },
          observedAt: dueAt,
          visibility: "public",
          sourceDecisionId: decisionId,
        },
      },
    ],
  }];
}

/**
 * Register a narrative choice as a durable decision before it reaches the UI.
 * The outcome roll and bound stakeholders are persisted, so save/reload cannot
 * reroll the decision and future systems can explain who remembers it.
 */
export function ensureNarrativeDecision(
  state: GameState,
  event: NarrativeEvent,
): GameState {
  if (!event.choices || event.choices.length < 2) return state;

  const decisionId = narrativeDecisionId(event.id);
  if (state.consequenceState.decisions[decisionId]) {
    return ensureSpecialEventOfferObligations(state, event, decisionId);
  }

  const seasonLength = getSeasonLength(state.fixtures, event.season);
  const policy = getNarrativeDecisionPolicy(event);
  const deadlineAt = addGameWeeks(
    state.fixtures,
    { week: event.week, season: event.season },
    policy.deadlineWeeks,
  );
  const ids = event.choices.map((choice, index) => optionId(choice.effect, index));
  const locks = buildOpportunityLocks(state, decisionId, ids, event, deadlineAt);
  const options: DecisionOption[] = event.choices.map((choice, index) => {
    const id = ids[index];
    const lockId = `opportunity:${decisionId}:${id}`;
    const specialOption = buildSpecialEventDecisionOption(
      state,
      event,
      decisionId,
      choice.effect,
    );
    return {
      id,
      label: choice.label,
      knownTradeoffs: choice.knownTradeoffs
        ?? specialOption?.knownTradeoffs
        ?? [choice.label],
      immediateEffects: [
        {
          id: `effect:${decisionId}:${id}:consume-opportunity`,
          type: "transitionOpportunityLock",
          opportunityLockId: lockId,
          status: "consumed",
          note: `Selected through narrative event ${event.id}`,
        },
        ...(specialOption?.immediateEffects ?? []),
      ],
      scheduledConsequences: specialOption?.scheduledConsequences
        ?? turningPointConsequences(
          state,
          event,
          decisionId,
          choice.effect,
        ),
    };
  });
  const outcomeRoll = createNamedRNG(
    state.runManifest.rootSeed,
    "narrative-decision",
    event.id,
  ).next();
  const decision = createDecisionRecord({
    id: decisionId,
    source: { kind: "narrativeEvent", id: event.id },
    offeredAt: { week: event.week, season: event.season },
    deadlineAt,
    visibility: "stakeholders",
    stakeholders: event.relatedIds.map((id) => relatedEntity(state, id)),
    options,
    defaultOptionId: policy.defaultChoiceIndex === undefined
      ? undefined
      : ids[policy.defaultChoiceIndex],
    outcomeRoll,
    seasonLength,
    opportunitySetId: `narrative:${event.id}`,
    metadata: {
      narrativeType: event.type,
      title: event.title,
      deadlineWeeks: policy.deadlineWeeks,
      defaultChoiceIndex: policy.defaultChoiceIndex ?? null,
      specialEventId: event.specialEventId ?? null,
    },
  });
  const registered = registerDecision(state.consequenceState, decision);
  if (registered.error) return state;

  return ensureSpecialEventOfferObligations({
    ...state,
    consequenceState: {
      ...registered.state,
      opportunityLocks: {
        ...registered.state.opportunityLocks,
        ...locks,
      },
    },
  }, event, decisionId);
}

export interface NarrativeDecisionSelection {
  state: GameState;
  decisionId: string;
  optionId?: string;
  error?: string;
}

/** Select and immediately project a narrative decision exactly once. */
export function selectNarrativeDecision(
  state: GameState,
  event: NarrativeEvent,
  choiceIndex: number,
): NarrativeDecisionSelection {
  const prepared = ensureNarrativeDecision(state, event);
  const decisionId = narrativeDecisionId(event.id);
  const decision = prepared.consequenceState.decisions[decisionId];
  const selected = decision?.options[choiceIndex];
  if (!decision || !selected) {
    return {
      state,
      decisionId,
      error: `Narrative decision ${decisionId} has no option ${choiceIndex}`,
    };
  }

  const now = { week: prepared.currentWeek, season: prepared.currentSeason };
  const seasonLength = getSeasonLength(prepared.fixtures, prepared.currentSeason);
  const synchronized = synchronizeConsequenceMetrics(
    prepared,
    prepared.consequenceState,
  );
  const selection = selectDecisionOption(
    synchronized,
    decisionId,
    selected.id,
    now,
    "player",
    seasonLength,
  );
  if (selection.error) {
    return { state: prepared, decisionId, optionId: selected.id, error: selection.error };
  }

  const processed = processDueConsequences(selection.state, now, seasonLength);
  const factId = `fact:${decisionId}:selected`;
  const consequenceState: ConsequenceEngineState = {
    ...processed.state,
    facts: processed.state.facts[factId]
      ? processed.state.facts
      : {
          ...processed.state.facts,
          [factId]: {
            id: factId,
            kind: "NarrativeDecisionSelected",
            subject: { kind: "narrativeEvent", id: event.id },
            value: {
              choiceIndex,
              optionId: selected.id,
              narrativeType: event.type,
            },
            observedAt: now,
            visibility: decision.visibility,
            sourceDecisionId: decisionId,
          },
        },
  };

  return {
    state: { ...prepared, consequenceState },
    decisionId,
    optionId: selected.id,
    error: processed.errors[0],
  };
}
