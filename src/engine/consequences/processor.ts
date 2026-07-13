import { compareGameDates, DEFAULT_SEASON_LENGTH } from "./decisionLedger";
import type {
  AppliedEffectRecord,
  ConsequenceCondition,
  ConsequenceEffect,
  ConsequenceEngineState,
  ConsequenceRecord,
  GameDate,
  JsonValue,
  Obligation,
  OpportunityLock,
} from "./types";

export interface EffectApplicationResult {
  state: ConsequenceEngineState;
  success: boolean;
  changed: boolean;
  appliedEffectIds: string[];
  error?: string;
}

export interface DueConsequenceProcessingResult {
  state: ConsequenceEngineState;
  appliedConsequenceIds: string[];
  skippedConsequenceIds: string[];
  failedConsequenceIds: string[];
  errors: string[];
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

function sameJsonValue(left: JsonValue, right: JsonValue): boolean {
  return stableSerialize(left) === stableSerialize(right);
}

function terminalObligation(status: Obligation["status"]): boolean {
  return status !== "active";
}

function terminalOpportunity(status: OpportunityLock["status"]): boolean {
  return status !== "active";
}

function conditionSatisfied(
  state: ConsequenceEngineState,
  condition: ConsequenceCondition,
): boolean {
  switch (condition.type) {
    case "factExists":
      return Boolean(state.facts[condition.factId]) === (condition.exists ?? true);
    case "factEquals": {
      const fact = state.facts[condition.factId];
      return Boolean(fact) && sameJsonValue(fact.value, condition.value);
    }
    case "metricAtLeast":
      return (state.metrics[condition.metricKey] ?? 0) >= condition.value;
    case "metricAtMost":
      return (state.metrics[condition.metricKey] ?? 0) <= condition.value;
    case "obligationStatus":
      return state.obligations[condition.obligationId]?.status === condition.status;
    case "opportunityStatus":
      return state.opportunityLocks[condition.opportunityLockId]?.status === condition.status;
  }
}

export function areConsequenceConditionsSatisfied(
  state: ConsequenceEngineState,
  conditions: ConsequenceCondition[],
): boolean {
  return conditions.every((condition) => conditionSatisfied(state, condition));
}

function validateFinite(value: number, label: string): string | undefined {
  return Number.isFinite(value) ? undefined : `${label} must be finite`;
}

function effectConflict(
  state: ConsequenceEngineState,
  effect: ConsequenceEffect,
  consequenceId: string,
): string | undefined {
  const applied = state.appliedEffects[effect.id];
  if (applied && applied.consequenceId !== consequenceId) {
    return `Effect ${effect.id} was already applied by ${applied.consequenceId}`;
  }

  switch (effect.type) {
    case "adjustMetric": {
      const finiteError = validateFinite(effect.delta, `Effect ${effect.id} delta`)
        ?? (effect.min === undefined ? undefined : validateFinite(effect.min, `Effect ${effect.id} min`))
        ?? (effect.max === undefined ? undefined : validateFinite(effect.max, `Effect ${effect.id} max`));
      if (finiteError) return finiteError;
      if (effect.min !== undefined && effect.max !== undefined && effect.min > effect.max) {
        return `Effect ${effect.id} min cannot exceed max`;
      }
      return undefined;
    }
    case "recordFact": {
      const existing = state.facts[effect.fact.id];
      return existing && !sameRecord(existing, effect.fact)
        ? `World fact id conflict: ${effect.fact.id}`
        : undefined;
    }
    case "addMemory": {
      const memory = effect.memory;
      if (
        !Number.isFinite(memory.valence)
        || memory.valence < -100
        || memory.valence > 100
        || !Number.isFinite(memory.intensity)
        || memory.intensity < 0
        || memory.intensity > 100
        || !Number.isFinite(memory.salience)
        || memory.salience < 0
        || memory.salience > 100
        || (memory.halfLifeWeeks !== undefined
          && (!Number.isFinite(memory.halfLifeWeeks) || memory.halfLifeWeeks <= 0))
      ) return `Memory ${memory.id} has invalid valence, intensity, or salience`;
      const existing = state.memories[memory.id];
      return existing && !sameRecord(existing, memory)
        ? `Stakeholder memory id conflict: ${memory.id}`
        : undefined;
    }
    case "createObligation": {
      if (effect.obligation.status !== "active") {
        return `New obligation ${effect.obligation.id} must be active`;
      }
      const existing = state.obligations[effect.obligation.id];
      return existing && !sameRecord(existing, effect.obligation)
        ? `Obligation id conflict: ${effect.obligation.id}`
        : undefined;
    }
    case "transitionObligation": {
      const obligation = state.obligations[effect.obligationId];
      if (!obligation) return `Unknown obligation: ${effect.obligationId}`;
      if (terminalObligation(obligation.status) && obligation.status !== effect.status) {
        return `Obligation ${effect.obligationId} is already ${obligation.status}`;
      }
      return undefined;
    }
    case "createOpportunityLock": {
      if (effect.lock.status !== "active") {
        return `New opportunity lock ${effect.lock.id} must be active`;
      }
      const existing = state.opportunityLocks[effect.lock.id];
      if (existing && !sameRecord(existing, effect.lock)) {
        return `Opportunity lock id conflict: ${effect.lock.id}`;
      }
      const consumedSibling = Object.values(state.opportunityLocks).find((lock) =>
        lock.exclusiveSetId === effect.lock.exclusiveSetId
        && lock.id !== effect.lock.id
        && lock.status === "consumed",
      );
      return consumedSibling
        ? `Exclusive opportunity ${effect.lock.exclusiveSetId} was already consumed by ${consumedSibling.id}`
        : undefined;
    }
    case "transitionOpportunityLock": {
      const lock = state.opportunityLocks[effect.opportunityLockId];
      if (!lock) return `Unknown opportunity lock: ${effect.opportunityLockId}`;
      if (terminalOpportunity(lock.status) && lock.status !== effect.status) {
        return `Opportunity lock ${effect.opportunityLockId} is already ${lock.status}`;
      }
      if (effect.status === "consumed") {
        const consumedSibling = Object.values(state.opportunityLocks).find((candidate) =>
          candidate.exclusiveSetId === lock.exclusiveSetId
          && candidate.id !== lock.id
          && candidate.status === "consumed",
        );
        if (consumedSibling) {
          return `Exclusive opportunity ${lock.exclusiveSetId} was already consumed by ${consumedSibling.id}`;
        }
      }
      return undefined;
    }
  }
}

/**
 * Apply one consequence atomically. Invalid effects leave the projection
 * untouched, while already-applied effects from the same consequence are
 * treated as idempotent no-ops.
 */
export function applyConsequenceEffects(
  state: ConsequenceEngineState,
  consequenceId: string,
  effects: ConsequenceEffect[],
  appliedAt: GameDate,
): EffectApplicationResult {
  const duplicateIds = new Set<string>();
  for (const effect of effects) {
    if (duplicateIds.has(effect.id)) {
      return {
        state,
        success: false,
        changed: false,
        appliedEffectIds: [],
        error: `Duplicate effect id in consequence ${consequenceId}: ${effect.id}`,
      };
    }
    duplicateIds.add(effect.id);
  }

  // Validate sequentially against a temporary state so a create followed by a
  // transition in the same consequence is legal without risking partial writes.
  let working = state;
  const pendingApplied: Record<string, AppliedEffectRecord> = {};
  const appliedEffectIds: string[] = [];

  for (const effect of effects) {
    const existingApplied = working.appliedEffects[effect.id];
    if (existingApplied?.consequenceId === consequenceId) continue;
    const conflict = effectConflict(working, effect, consequenceId);
    if (conflict) {
      return {
        state,
        success: false,
        changed: false,
        appliedEffectIds: [],
        error: conflict,
      };
    }

    switch (effect.type) {
      case "adjustMetric": {
        const current = working.metrics[effect.metricKey] ?? 0;
        const next = Math.min(effect.max ?? Infinity, Math.max(effect.min ?? -Infinity, current + effect.delta));
        working = { ...working, metrics: { ...working.metrics, [effect.metricKey]: next } };
        break;
      }
      case "recordFact":
        working = {
          ...working,
          facts: { ...working.facts, [effect.fact.id]: effect.fact },
        };
        break;
      case "addMemory":
        working = {
          ...working,
          memories: { ...working.memories, [effect.memory.id]: effect.memory },
        };
        break;
      case "createObligation":
        working = {
          ...working,
          obligations: { ...working.obligations, [effect.obligation.id]: effect.obligation },
        };
        break;
      case "transitionObligation": {
        const obligation = working.obligations[effect.obligationId];
        working = {
          ...working,
          obligations: {
            ...working.obligations,
            [effect.obligationId]: {
              ...obligation,
              status: effect.status,
              resolvedAt: { ...appliedAt },
              resolutionNote: effect.note,
            },
          },
        };
        break;
      }
      case "createOpportunityLock":
        working = {
          ...working,
          opportunityLocks: { ...working.opportunityLocks, [effect.lock.id]: effect.lock },
        };
        break;
      case "transitionOpportunityLock": {
        const lock = working.opportunityLocks[effect.opportunityLockId];
        const updatedLocks = {
          ...working.opportunityLocks,
          [lock.id]: {
            ...lock,
            status: effect.status,
            resolvedAt: { ...appliedAt },
            resolutionNote: effect.note,
          },
        };
        if (effect.status === "consumed") {
          for (const candidate of Object.values(updatedLocks)) {
            if (
              candidate.id !== lock.id
              && candidate.exclusiveSetId === lock.exclusiveSetId
              && candidate.status === "active"
            ) {
              updatedLocks[candidate.id] = {
                ...candidate,
                status: "closed",
                resolvedAt: { ...appliedAt },
                resolutionNote: `Exclusive alternative consumed by ${lock.id}`,
              };
            }
          }
        }
        working = { ...working, opportunityLocks: updatedLocks };
        break;
      }
    }
    pendingApplied[effect.id] = {
      effectId: effect.id,
      consequenceId,
      appliedAt: { ...appliedAt },
    };
    working = {
      ...working,
      appliedEffects: { ...working.appliedEffects, [effect.id]: pendingApplied[effect.id] },
    };
    appliedEffectIds.push(effect.id);
  }

  return {
    state: working,
    success: true,
    changed: appliedEffectIds.length > 0,
    appliedEffectIds,
  };
}

function terminalConsequence(status: ConsequenceRecord["status"]): boolean {
  return status !== "pending";
}

function refreshResolvedDecisions(
  state: ConsequenceEngineState,
  now: GameDate,
): ConsequenceEngineState {
  let changed = false;
  const decisions = { ...state.decisions };
  for (const decision of Object.values(decisions)) {
    if (decision.status !== "selected" || decision.consequenceIds.length === 0) continue;
    const allTerminal = decision.consequenceIds.every((id) => {
      const consequence = state.consequences[id];
      return consequence && terminalConsequence(consequence.status);
    });
    if (!allTerminal) continue;
    decisions[decision.id] = {
      ...decision,
      status: "resolved",
      resolvedAt: { ...now },
    };
    changed = true;
  }
  return changed ? { ...state, decisions } : state;
}

/** Process every due callback in stable date/id order. Safe to call repeatedly. */
export function processDueConsequences(
  state: ConsequenceEngineState,
  now: GameDate,
  seasonLength = DEFAULT_SEASON_LENGTH,
): DueConsequenceProcessingResult {
  let nextState = state;
  const appliedConsequenceIds: string[] = [];
  const skippedConsequenceIds: string[] = [];
  const failedConsequenceIds: string[] = [];
  const errors: string[] = [];
  const dueCallbacks = Object.values(state.callbacks)
    .filter((callback) =>
      callback.status === "pending"
      && compareGameDates(callback.dueAt, now, seasonLength) <= 0,
    )
    .sort((left, right) => compareGameDates(left.dueAt, right.dueAt, seasonLength)
      || left.id.localeCompare(right.id));

  for (const callback of dueCallbacks) {
    const consequence = nextState.consequences[callback.consequenceId];
    if (!consequence) {
      errors.push(`Callback ${callback.id} references missing consequence ${callback.consequenceId}`);
      nextState = {
        ...nextState,
        callbacks: {
          ...nextState.callbacks,
          [callback.id]: { ...callback, status: "cancelled", processedAt: { ...now } },
        },
      };
      continue;
    }

    if (terminalConsequence(consequence.status)) {
      nextState = {
        ...nextState,
        callbacks: {
          ...nextState.callbacks,
          [callback.id]: { ...callback, status: "processed", processedAt: { ...now } },
        },
      };
      continue;
    }

    let updatedConsequence: ConsequenceRecord;
    if (!areConsequenceConditionsSatisfied(nextState, consequence.conditions)) {
      updatedConsequence = {
        ...consequence,
        status: "skipped",
        resolvedAt: { ...now },
        resolution: "conditionsFailed",
      };
      skippedConsequenceIds.push(consequence.id);
    } else if (consequence.outcomeRoll >= consequence.probability) {
      updatedConsequence = {
        ...consequence,
        status: "skipped",
        resolvedAt: { ...now },
        resolution: "chanceFailed",
      };
      skippedConsequenceIds.push(consequence.id);
    } else {
      const application = applyConsequenceEffects(
        nextState,
        consequence.id,
        consequence.effects,
        now,
      );
      if (application.success) {
        nextState = application.state;
        updatedConsequence = {
          ...consequence,
          status: "applied",
          resolvedAt: { ...now },
          resolution: "effectsApplied",
        };
        appliedConsequenceIds.push(consequence.id);
      } else {
        updatedConsequence = {
          ...consequence,
          status: "failed",
          resolvedAt: { ...now },
          resolution: "applicationFailed",
          failureReason: application.error,
        };
        failedConsequenceIds.push(consequence.id);
        errors.push(application.error ?? `Failed to apply ${consequence.id}`);
      }
    }

    nextState = {
      ...nextState,
      consequences: {
        ...nextState.consequences,
        [consequence.id]: updatedConsequence,
      },
      callbacks: {
        ...nextState.callbacks,
        [callback.id]: {
          ...callback,
          status: "processed",
          processedAt: { ...now },
        },
      },
    };
  }

  nextState = refreshResolvedDecisions(nextState, now);
  return {
    state: nextState,
    appliedConsequenceIds,
    skippedConsequenceIds,
    failedConsequenceIds,
    errors,
  };
}
