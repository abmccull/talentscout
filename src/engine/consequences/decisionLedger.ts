import type {
  ConsequenceEffect,
  ConsequenceEngineState,
  ConsequenceRecord,
  DecisionOption,
  DecisionRecord,
  EntityRef,
  GameDate,
  JsonValue,
  ScheduledCallback,
} from "./types";

export const DEFAULT_SEASON_LENGTH = 38;

export interface CreateDecisionInput {
  id: string;
  source: EntityRef;
  offeredAt: GameDate;
  deadlineAt: GameDate;
  visibility: DecisionRecord["visibility"];
  stakeholders?: EntityRef[];
  options: DecisionOption[];
  defaultOptionId?: string;
  expiryEffects?: ConsequenceEffect[];
  outcomeRoll: number;
  /** Required only for calendars longer than the inferred maximum week. */
  seasonLength?: number;
  opportunitySetId?: string;
  metadata?: Record<string, JsonValue>;
}

export interface StateMutationResult {
  state: ConsequenceEngineState;
  changed: boolean;
  error?: string;
}

export interface DecisionSelectionResult extends StateMutationResult {
  consequenceIds: string[];
  callbackIds: string[];
}

export function createConsequenceEngineState(
  partial: Partial<ConsequenceEngineState> = {},
): ConsequenceEngineState {
  return {
    decisions: { ...(partial.decisions ?? {}) },
    consequences: { ...(partial.consequences ?? {}) },
    callbacks: { ...(partial.callbacks ?? {}) },
    facts: { ...(partial.facts ?? {}) },
    memories: { ...(partial.memories ?? {}) },
    obligations: { ...(partial.obligations ?? {}) },
    opportunityLocks: { ...(partial.opportunityLocks ?? {}) },
    metrics: { ...(partial.metrics ?? {}) },
    appliedEffects: { ...(partial.appliedEffects ?? {}) },
    history: [...(partial.history ?? [])],
  };
}

export function compareGameDates(
  left: GameDate,
  right: GameDate,
  _seasonLength = DEFAULT_SEASON_LENGTH,
): number {
  // GameDate is already normalized to a season and week. Lexicographic
  // comparison remains correct even when historical seasons have different
  // fixture-derived lengths; flattening both dates with one global length does
  // not.
  return left.season - right.season || left.week - right.week;
}

/**
 * Approximate elapsed weeks for decay/retention windows. Ordering should use
 * compareGameDates; this helper is only for durations where callers provide
 * the relevant calendar length.
 */
export function elapsedGameWeeks(
  later: GameDate,
  earlier: GameDate,
  seasonLength = DEFAULT_SEASON_LENGTH,
): number {
  return (later.season - earlier.season) * seasonLength
    + later.week
    - earlier.week;
}

function assertGameDate(date: GameDate, label: string): void {
  if (!Number.isInteger(date.week) || date.week < 1) {
    throw new RangeError(`${label}.week must be a positive integer`);
  }
  if (!Number.isInteger(date.season) || date.season < 1) {
    throw new RangeError(`${label}.season must be a positive integer`);
  }
}

function assertUniformRoll(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError(`${label} must be in the range [0, 1)`);
  }
}

function assertProbability(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be in the range [0, 1]`);
  }
}

export function createDecisionRecord(input: CreateDecisionInput): DecisionRecord {
  if (!input.id.trim()) throw new Error("Decision id is required");
  assertGameDate(input.offeredAt, "offeredAt");
  assertGameDate(input.deadlineAt, "deadlineAt");
  const inferredSeasonLength = input.seasonLength ?? Math.max(
    DEFAULT_SEASON_LENGTH,
    input.offeredAt.week,
    input.deadlineAt.week,
    ...input.options.flatMap((option) =>
      option.scheduledConsequences.map((template) => template.dueAt.week),
    ),
  );
  if (compareGameDates(input.deadlineAt, input.offeredAt, inferredSeasonLength) < 0) {
    throw new RangeError("Decision deadline cannot precede its offer date");
  }
  assertUniformRoll(input.outcomeRoll, "outcomeRoll");
  if (input.options.length < 2) {
    throw new Error("A decision must offer at least two options");
  }
  const optionIds = new Set<string>();
  const effectIds = new Set<string>();
  for (const option of input.options) {
    if (!option.id.trim() || optionIds.has(option.id)) {
      throw new Error(`Decision option ids must be non-empty and unique: ${option.id}`);
    }
    optionIds.add(option.id);
    for (const effect of option.immediateEffects) {
      if (!effect.id.trim()) throw new Error("Effect ids must be non-empty");
      if (effectIds.has(effect.id)) throw new Error(`Duplicate effect id: ${effect.id}`);
      effectIds.add(effect.id);
    }
    const templateIds = new Set<string>();
    for (const template of option.scheduledConsequences) {
      if (!template.id.trim() || templateIds.has(template.id)) {
        throw new Error(`Scheduled consequence ids must be unique within option ${option.id}`);
      }
      templateIds.add(template.id);
      assertGameDate(template.dueAt, `scheduled consequence ${template.id}.dueAt`);
      if (compareGameDates(template.dueAt, input.offeredAt, inferredSeasonLength) < 0) {
        throw new RangeError(`Scheduled consequence ${template.id} cannot predate its decision`);
      }
      if (template.probability !== undefined) {
        assertProbability(template.probability, `scheduled consequence ${template.id}.probability`);
      }
      if (template.outcomeRoll !== undefined) {
        assertUniformRoll(template.outcomeRoll, `scheduled consequence ${template.id}.outcomeRoll`);
      }
      for (const effect of template.effects) {
        if (!effect.id.trim()) throw new Error("Effect ids must be non-empty");
        if (effectIds.has(effect.id)) throw new Error(`Duplicate effect id: ${effect.id}`);
        effectIds.add(effect.id);
      }
    }
  }
  for (const effect of input.expiryEffects ?? []) {
    if (!effect.id.trim()) throw new Error("Effect ids must be non-empty");
    if (effectIds.has(effect.id)) throw new Error(`Duplicate effect id: ${effect.id}`);
    effectIds.add(effect.id);
  }
  if (input.defaultOptionId && !optionIds.has(input.defaultOptionId)) {
    throw new Error(`Unknown default option: ${input.defaultOptionId}`);
  }

  return {
    id: input.id,
    source: { ...input.source },
    offeredAt: { ...input.offeredAt },
    deadlineAt: { ...input.deadlineAt },
    status: "offered",
    visibility: input.visibility,
    stakeholders: (input.stakeholders ?? []).map((stakeholder) => ({ ...stakeholder })),
    options: input.options,
    defaultOptionId: input.defaultOptionId,
    expiryEffects: input.expiryEffects,
    outcomeRoll: input.outcomeRoll,
    consequenceIds: [],
    opportunitySetId: input.opportunitySetId,
    metadata: input.metadata,
  };
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${stableSerialize(record[key])}`,
  ).join(",")}}`;
}

function sameRecord(left: unknown, right: unknown): boolean {
  return stableSerialize(left) === stableSerialize(right);
}

export function registerDecision(
  state: ConsequenceEngineState,
  decision: DecisionRecord,
): StateMutationResult {
  const existing = state.decisions[decision.id];
  if (existing) {
    return sameRecord(existing, decision)
      ? { state, changed: false }
      : { state, changed: false, error: `Decision id conflict: ${decision.id}` };
  }
  if ((state.history ?? []).some((record) => record.decisionId === decision.id)) {
    return {
      state,
      changed: false,
      error: `Decision ${decision.id} has already been resolved and archived`,
    };
  }
  return {
    state: {
      ...state,
      decisions: { ...state.decisions, [decision.id]: decision },
    },
    changed: true,
  };
}

function consequenceId(decisionId: string, optionId: string, templateId: string): string {
  return `consequence:${decisionId}:${optionId}:${templateId}`;
}

function callbackId(consequenceRecordId: string): string {
  return `callback:${consequenceRecordId}`;
}

/** Derive an independent persisted roll without requiring another RNG draw. */
function deriveChildOutcomeRoll(
  decision: DecisionRecord,
  optionId: string,
  templateId: string,
): number {
  const input = `${decision.outcomeRoll.toPrecision(17)}|${decision.id}|${optionId}|${templateId}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash / 0x1_0000_0000;
}

function buildConsequence(
  decision: DecisionRecord,
  optionId: string,
  templateId: string,
  dueAt: GameDate,
  effects: ConsequenceEffect[],
  probability = 1,
  outcomeRoll = decision.outcomeRoll,
  conditions: ConsequenceRecord["conditions"] = [],
  tags: string[] = [],
): ConsequenceRecord {
  return {
    id: consequenceId(decision.id, optionId, templateId),
    decisionId: decision.id,
    optionId,
    templateId,
    dueAt: { ...dueAt },
    status: "pending",
    effects,
    conditions,
    probability,
    outcomeRoll,
    tags,
  };
}

function buildCallback(consequence: ConsequenceRecord): ScheduledCallback {
  return {
    id: callbackId(consequence.id),
    consequenceId: consequence.id,
    callbackKey: "applyConsequence",
    dueAt: { ...consequence.dueAt },
    status: "pending",
  };
}

export function scheduleConsequence(
  state: ConsequenceEngineState,
  consequence: ConsequenceRecord,
  callback: ScheduledCallback = buildCallback(consequence),
): StateMutationResult {
  const existingConsequence = state.consequences[consequence.id];
  const existingCallback = state.callbacks[callback.id];
  if (existingConsequence || existingCallback) {
    if (
      existingConsequence
      && existingCallback
      && sameRecord(existingConsequence, consequence)
      && sameRecord(existingCallback, callback)
    ) {
      return { state, changed: false };
    }
    return {
      state,
      changed: false,
      error: `Consequence or callback id conflict: ${consequence.id}`,
    };
  }
  return {
    state: {
      ...state,
      consequences: { ...state.consequences, [consequence.id]: consequence },
      callbacks: { ...state.callbacks, [callback.id]: callback },
    },
    changed: true,
  };
}

/**
 * Attach a domain-specific consequence after an option has been selected.
 * This supports adapters that can only calculate the exact effects once the
 * semantic choice is known, while preserving the original decision lineage.
 */
export function appendDecisionConsequence(
  state: ConsequenceEngineState,
  decisionId: string,
  templateId: string,
  effects: ConsequenceEffect[],
  dueAt: GameDate,
  options: {
    conditions?: ConsequenceRecord["conditions"];
    probability?: number;
    outcomeRoll?: number;
    tags?: string[];
  } = {},
): StateMutationResult {
  const decision = state.decisions[decisionId];
  if (!decision) {
    return { state, changed: false, error: `Unknown decision: ${decisionId}` };
  }
  if (!decision.selectedOptionId) {
    return { state, changed: false, error: `Decision ${decisionId} has no selected option` };
  }
  const consequence = buildConsequence(
    decision,
    decision.selectedOptionId,
    templateId,
    dueAt,
    effects,
    options.probability ?? 1,
    options.outcomeRoll ?? deriveChildOutcomeRoll(
      decision,
      decision.selectedOptionId,
      templateId,
    ),
    options.conditions ?? [],
    options.tags ?? [],
  );
  if (decision.consequenceIds.includes(consequence.id)) {
    const existing = state.consequences[consequence.id];
    const existingCallback = state.callbacks[callbackId(consequence.id)];
    const expectedCallback = buildCallback(consequence);
    return existing
      && existingCallback
      && sameRecord(existing, consequence)
      && sameRecord(existingCallback, expectedCallback)
      ? { state, changed: false }
      : {
          state,
          changed: false,
          error: `Decision ${decisionId} has conflicting or incomplete consequence ${consequence.id}`,
        };
  }
  const scheduled = scheduleConsequence(state, consequence);
  if (scheduled.error) return scheduled;
  return {
    state: {
      ...scheduled.state,
      decisions: {
        ...scheduled.state.decisions,
        [decisionId]: {
          ...decision,
          status: "selected",
          resolvedAt: undefined,
          consequenceIds: [...decision.consequenceIds, consequence.id],
        },
      },
    },
    changed: true,
  };
}

function optionConsequences(
  decision: DecisionRecord,
  option: DecisionOption,
  selectedAt: GameDate,
): ConsequenceRecord[] {
  const records: ConsequenceRecord[] = [];
  if (option.immediateEffects.length > 0) {
    records.push(buildConsequence(
      decision,
      option.id,
      "immediate",
      selectedAt,
      option.immediateEffects,
      1,
      decision.outcomeRoll,
      [],
      ["immediate"],
    ));
  }
  for (const template of option.scheduledConsequences) {
    records.push(buildConsequence(
      decision,
      option.id,
      template.id,
      template.dueAt,
      template.effects,
      template.probability ?? 1,
      template.outcomeRoll ?? deriveChildOutcomeRoll(
        decision,
        option.id,
        template.id,
      ),
      template.conditions ?? [],
      template.tags ?? [],
    ));
  }
  return records;
}

export function selectDecisionOption(
  state: ConsequenceEngineState,
  decisionId: string,
  optionId: string,
  selectedAt: GameDate,
  selectionKind: NonNullable<DecisionRecord["selectionKind"]> = "player",
  seasonLength = DEFAULT_SEASON_LENGTH,
): DecisionSelectionResult {
  const decision = state.decisions[decisionId];
  if (!decision) {
    return { state, changed: false, error: `Unknown decision: ${decisionId}`, consequenceIds: [], callbackIds: [] };
  }
  if (decision.status !== "offered") {
    const idempotent = decision.selectedOptionId === optionId;
    return {
      state,
      changed: false,
      error: idempotent ? undefined : `Decision ${decisionId} is already ${decision.status}`,
      consequenceIds: idempotent ? [...decision.consequenceIds] : [],
      callbackIds: idempotent
        ? decision.consequenceIds.map(callbackId)
        : [],
    };
  }
  if (compareGameDates(selectedAt, decision.deadlineAt, seasonLength) > 0) {
    return {
      state,
      changed: false,
      error: `Decision ${decisionId} has expired`,
      consequenceIds: [],
      callbackIds: [],
    };
  }
  const option = decision.options.find((candidate) => candidate.id === optionId);
  if (!option) {
    return { state, changed: false, error: `Unknown option ${optionId}`, consequenceIds: [], callbackIds: [] };
  }
  const newConsequences = optionConsequences(decision, option, selectedAt);
  let nextState = state;
  for (const consequence of newConsequences) {
    const scheduled = scheduleConsequence(nextState, consequence);
    if (scheduled.error) {
      return { state, changed: false, error: scheduled.error, consequenceIds: [], callbackIds: [] };
    }
    nextState = scheduled.state;
  }
  const consequenceIds = newConsequences.map((record) => record.id);
  const updatedDecision: DecisionRecord = {
    ...decision,
    status: consequenceIds.length === 0 ? "resolved" : "selected",
    selectedOptionId: option.id,
    selectedAt: { ...selectedAt },
    selectionKind,
    resolvedAt: consequenceIds.length === 0 ? { ...selectedAt } : undefined,
    consequenceIds,
  };
  nextState = {
    ...nextState,
    decisions: { ...nextState.decisions, [decisionId]: updatedDecision },
  };
  return {
    state: nextState,
    changed: true,
    consequenceIds,
    callbackIds: consequenceIds.map(callbackId),
  };
}

/**
 * Resolve overdue offers. A default option is selected exactly once; otherwise
 * expiry effects are scheduled as their own causal consequence.
 */
export function expireDueDecisions(
  state: ConsequenceEngineState,
  now: GameDate,
  seasonLength = DEFAULT_SEASON_LENGTH,
): { state: ConsequenceEngineState; expiredDecisionIds: string[]; error?: string } {
  let nextState = state;
  const expiredDecisionIds: string[] = [];
  const errors: string[] = [];
  const due = Object.values(state.decisions)
    .filter((decision) =>
      decision.status === "offered"
      && compareGameDates(now, decision.deadlineAt, seasonLength) > 0,
    )
    .sort((left, right) => compareGameDates(left.deadlineAt, right.deadlineAt, seasonLength)
      || left.id.localeCompare(right.id));

  for (const decision of due) {
    if (decision.defaultOptionId) {
      // Select at the inclusive deadline so the normal selection validation and
      // deterministic schedule are reused.
      const selected = selectDecisionOption(
        nextState,
        decision.id,
        decision.defaultOptionId,
        decision.deadlineAt,
        "default",
        seasonLength,
      );
      if (selected.error) {
        errors.push(selected.error);
        continue;
      }
      nextState = selected.state;
      expiredDecisionIds.push(decision.id);
      continue;
    }

    const effects = decision.expiryEffects ?? [];
    let consequenceIds: string[] = [];
    if (effects.length > 0) {
      const consequence = buildConsequence(
        decision,
        "expiry",
        "expiry",
        now,
        effects,
        1,
        decision.outcomeRoll,
        [],
        ["expiry"],
      );
      const scheduled = scheduleConsequence(nextState, consequence);
      if (scheduled.error) {
        errors.push(scheduled.error);
        continue;
      }
      nextState = scheduled.state;
      consequenceIds = [consequence.id];
    }
    nextState = {
      ...nextState,
      decisions: {
        ...nextState.decisions,
        [decision.id]: {
          ...decision,
          status: "expired",
          selectionKind: "default",
          expiredAt: { ...now },
          selectedAt: { ...now },
          consequenceIds,
          resolvedAt: { ...now },
        },
      },
    };
    expiredDecisionIds.push(decision.id);
  }
  return {
    state: nextState,
    expiredDecisionIds,
    error: errors.length > 0 ? errors.join("; ") : undefined,
  };
}
