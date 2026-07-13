import {
  compareGameDates,
  DEFAULT_SEASON_LENGTH,
  elapsedGameWeeks,
} from "./decisionLedger";
import type {
  ConsequenceEngineState,
  ConsequenceHistoryRecord,
  ConsequenceRecord,
  DecisionRecord,
  GameDate,
} from "./types";

export const DEFAULT_EXECUTION_RETENTION_WEEKS = 104;
export const DEFAULT_DOMAIN_RETENTION_WEEKS = 260;
export const DEFAULT_MAX_TERMINAL_DECISIONS = 512;
export const DEFAULT_MAX_HISTORY_ENTRIES = 512;
export const DEFAULT_MEMORY_SALIENCE_FLOOR = 1;

export interface ConsequenceLifecycleOptions {
  executionRetentionWeeks?: number;
  domainRetentionWeeks?: number;
  maxTerminalDecisions?: number;
  maxHistoryEntries?: number;
  memorySalienceFloor?: number;
}

export interface ConsequenceLifecycleResult {
  state: ConsequenceEngineState;
  expiredFactIds: string[];
  expiredMemoryIds: string[];
  expiredObligationIds: string[];
  expiredOpportunityLockIds: string[];
  compactedDecisionIds: string[];
  prunedObligationIds: string[];
  prunedOpportunityLockIds: string[];
}

function nonNegativeInteger(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value)
    ? fallback
    : Math.max(0, Math.floor(value));
}

function positiveFinite(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) || value <= 0
    ? fallback
    : value;
}

function hasPassed(
  now: GameDate,
  deadline: GameDate | undefined,
  seasonLength: number,
): boolean {
  return Boolean(deadline && compareGameDates(now, deadline, seasonLength) > 0);
}

function terminalDecision(decision: DecisionRecord): boolean {
  return decision.status === "resolved" || decision.status === "expired";
}

function terminalConsequence(consequence: ConsequenceRecord | undefined): boolean {
  return Boolean(consequence && consequence.status !== "pending");
}

function decisionTerminalAt(decision: DecisionRecord): GameDate {
  return decision.resolvedAt
    ?? decision.expiredAt
    ?? decision.selectedAt
    ?? decision.deadlineAt;
}

function canCompactDecision(
  state: ConsequenceEngineState,
  decision: DecisionRecord,
): boolean {
  if (!terminalDecision(decision)) return false;
  if (!decision.consequenceIds.every((id) => terminalConsequence(state.consequences[id]))) {
    return false;
  }
  const consequenceIds = new Set(decision.consequenceIds);
  return !Object.values(state.callbacks).some((callback) =>
    consequenceIds.has(callback.consequenceId) && callback.status === "pending",
  );
}

function toHistoryRecord(
  state: ConsequenceEngineState,
  decision: DecisionRecord,
): ConsequenceHistoryRecord {
  const outcomes = decision.consequenceIds
    .map((id) => state.consequences[id])
    .filter((record): record is ConsequenceRecord => Boolean(record));
  return {
    decisionId: decision.id,
    source: { ...decision.source },
    offeredAt: { ...decision.offeredAt },
    terminalAt: { ...decisionTerminalAt(decision) },
    status: decision.status as ConsequenceHistoryRecord["status"],
    selectedOptionId: decision.selectedOptionId,
    selectionKind: decision.selectionKind,
    stakeholderIds: decision.stakeholders.map((stakeholder) => stakeholder.id),
    appliedCount: outcomes.filter((record) => record.status === "applied").length,
    skippedCount: outcomes.filter((record) => record.status === "skipped").length,
    failedCount: outcomes.filter((record) => record.status === "failed").length,
    cancelledCount: outcomes.filter((record) => record.status === "cancelled").length,
    metadata: decision.metadata,
  };
}

function compactTerminalExecutions(
  state: ConsequenceEngineState,
  now: GameDate,
  seasonLength: number,
  retentionWeeks: number,
  maxTerminalDecisions: number,
  maxHistoryEntries: number,
): { state: ConsequenceEngineState; compactedDecisionIds: string[] } {
  const candidates = Object.values(state.decisions)
    .filter((decision) => canCompactDecision(state, decision))
    .sort((left, right) =>
      compareGameDates(decisionTerminalAt(right), decisionTerminalAt(left), seasonLength)
      || right.id.localeCompare(left.id),
    );
  const compacted = candidates.filter((decision, index) =>
    index >= maxTerminalDecisions
    || elapsedGameWeeks(now, decisionTerminalAt(decision), seasonLength) > retentionWeeks,
  );
  if (compacted.length === 0) return { state, compactedDecisionIds: [] };

  const compactedDecisionIds = compacted.map((decision) => decision.id).sort();
  const compactedDecisionSet = new Set(compactedDecisionIds);
  const compactedConsequenceSet = new Set(
    compacted.flatMap((decision) => decision.consequenceIds),
  );
  const decisions = Object.fromEntries(
    Object.entries(state.decisions).filter(([id]) => !compactedDecisionSet.has(id)),
  );
  const consequences = Object.fromEntries(
    Object.entries(state.consequences).filter(([id]) => !compactedConsequenceSet.has(id)),
  );
  const callbacks = Object.fromEntries(
    Object.entries(state.callbacks).filter(([, callback]) =>
      !compactedConsequenceSet.has(callback.consequenceId),
    ),
  );
  const appliedEffects = Object.fromEntries(
    Object.entries(state.appliedEffects).filter(([, record]) =>
      !compactedConsequenceSet.has(record.consequenceId),
    ),
  );

  const historyByDecision = new Map(
    (state.history ?? []).map((record) => [record.decisionId, record]),
  );
  for (const decision of compacted) {
    historyByDecision.set(decision.id, toHistoryRecord(state, decision));
  }
  const sortedHistory = [...historyByDecision.values()]
    .sort((left, right) =>
      compareGameDates(left.terminalAt, right.terminalAt, seasonLength)
      || left.decisionId.localeCompare(right.decisionId),
    );
  const history = maxHistoryEntries === 0
    ? []
    : sortedHistory.slice(-maxHistoryEntries);

  return {
    state: {
      ...state,
      decisions,
      consequences,
      callbacks,
      appliedEffects,
      history,
    },
    compactedDecisionIds,
  };
}

function protectedTerminalDomainIds(state: ConsequenceEngineState): {
  obligations: Set<string>;
  opportunityLocks: Set<string>;
} {
  const obligations = new Set<string>();
  const opportunityLocks = new Set<string>();
  for (const consequence of Object.values(state.consequences)) {
    if (consequence.status !== "pending") continue;
    for (const condition of consequence.conditions) {
      if (condition.type === "obligationStatus") obligations.add(condition.obligationId);
      if (condition.type === "opportunityStatus") {
        opportunityLocks.add(condition.opportunityLockId);
      }
    }
    for (const effect of consequence.effects) {
      if (effect.type === "transitionObligation") obligations.add(effect.obligationId);
      if (effect.type === "transitionOpportunityLock") {
        opportunityLocks.add(effect.opportunityLockId);
      }
    }
  }
  return { obligations, opportunityLocks };
}

/**
 * Advance expiry/decay lifecycle and compact old terminal execution detail.
 * Deadlines are inclusive: an item remains usable during its named week and
 * expires on the next weekly tick.
 */
export function maintainConsequenceLifecycle(
  state: ConsequenceEngineState,
  now: GameDate,
  seasonLength = DEFAULT_SEASON_LENGTH,
  options: ConsequenceLifecycleOptions = {},
): ConsequenceLifecycleResult {
  const executionRetentionWeeks = nonNegativeInteger(
    options.executionRetentionWeeks,
    DEFAULT_EXECUTION_RETENTION_WEEKS,
  );
  const domainRetentionWeeks = nonNegativeInteger(
    options.domainRetentionWeeks,
    DEFAULT_DOMAIN_RETENTION_WEEKS,
  );
  const maxTerminalDecisions = nonNegativeInteger(
    options.maxTerminalDecisions,
    DEFAULT_MAX_TERMINAL_DECISIONS,
  );
  const maxHistoryEntries = nonNegativeInteger(
    options.maxHistoryEntries,
    DEFAULT_MAX_HISTORY_ENTRIES,
  );
  const memorySalienceFloor = positiveFinite(
    options.memorySalienceFloor,
    DEFAULT_MEMORY_SALIENCE_FLOOR,
  );

  const expiredFactIds = Object.values(state.facts)
    .filter((fact) => hasPassed(now, fact.expiresAt, seasonLength))
    .map((fact) => fact.id)
    .sort();
  const expiredMemoryIds = Object.values(state.memories)
    .filter((memory) => {
      if (!memory.halfLifeWeeks || memory.halfLifeWeeks <= 0) return false;
      const ageWeeks = Math.max(0, elapsedGameWeeks(now, memory.createdAt, seasonLength));
      const effectiveSalience = memory.salience
        * Math.pow(0.5, ageWeeks / memory.halfLifeWeeks);
      return effectiveSalience <= memorySalienceFloor;
    })
    .map((memory) => memory.id)
    .sort();

  let nextState = state;
  if (expiredFactIds.length > 0) {
    const expired = new Set(expiredFactIds);
    nextState = {
      ...nextState,
      facts: Object.fromEntries(
        Object.entries(nextState.facts).filter(([id]) => !expired.has(id)),
      ),
    };
  }
  if (expiredMemoryIds.length > 0) {
    const expired = new Set(expiredMemoryIds);
    nextState = {
      ...nextState,
      memories: Object.fromEntries(
        Object.entries(nextState.memories).filter(([id]) => !expired.has(id)),
      ),
    };
  }

  const expiredObligationIds: string[] = [];
  const obligations = { ...nextState.obligations };
  for (const obligation of Object.values(obligations)) {
    if (obligation.status !== "active" || !hasPassed(now, obligation.dueAt, seasonLength)) {
      continue;
    }
    obligations[obligation.id] = {
      ...obligation,
      status: "expired",
      resolvedAt: { ...now },
      resolutionNote: obligation.resolutionNote ?? "Deadline passed without resolution",
    };
    expiredObligationIds.push(obligation.id);
  }
  if (expiredObligationIds.length > 0) {
    expiredObligationIds.sort();
    nextState = { ...nextState, obligations };
  }

  const expiredOpportunityLockIds: string[] = [];
  const opportunityLocks = { ...nextState.opportunityLocks };
  for (const lock of Object.values(opportunityLocks)) {
    if (lock.status !== "active" || !hasPassed(now, lock.expiresAt, seasonLength)) continue;
    opportunityLocks[lock.id] = {
      ...lock,
      status: "expired",
      resolvedAt: { ...now },
      resolutionNote: lock.resolutionNote ?? "Opportunity window expired",
    };
    expiredOpportunityLockIds.push(lock.id);
  }
  if (expiredOpportunityLockIds.length > 0) {
    expiredOpportunityLockIds.sort();
    nextState = { ...nextState, opportunityLocks };
  }

  const compacted = compactTerminalExecutions(
    nextState,
    now,
    seasonLength,
    executionRetentionWeeks,
    maxTerminalDecisions,
    maxHistoryEntries,
  );
  nextState = compacted.state;

  const protectedIds = protectedTerminalDomainIds(nextState);
  const prunedObligationIds = Object.values(nextState.obligations)
    .filter((obligation) =>
      obligation.status !== "active"
      && Boolean(obligation.resolvedAt)
      && elapsedGameWeeks(now, obligation.resolvedAt!, seasonLength) > domainRetentionWeeks
      && !protectedIds.obligations.has(obligation.id),
    )
    .map((obligation) => obligation.id)
    .sort();
  if (prunedObligationIds.length > 0) {
    const pruned = new Set(prunedObligationIds);
    nextState = {
      ...nextState,
      obligations: Object.fromEntries(
        Object.entries(nextState.obligations).filter(([id]) => !pruned.has(id)),
      ),
    };
  }

  const prunedOpportunityLockIds = Object.values(nextState.opportunityLocks)
    .filter((lock) =>
      lock.status !== "active"
      && Boolean(lock.resolvedAt)
      && elapsedGameWeeks(now, lock.resolvedAt!, seasonLength) > domainRetentionWeeks
      && !protectedIds.opportunityLocks.has(lock.id),
    )
    .map((lock) => lock.id)
    .sort();
  if (prunedOpportunityLockIds.length > 0) {
    const pruned = new Set(prunedOpportunityLockIds);
    nextState = {
      ...nextState,
      opportunityLocks: Object.fromEntries(
        Object.entries(nextState.opportunityLocks).filter(([id]) => !pruned.has(id)),
      ),
    };
  }

  return {
    state: nextState,
    expiredFactIds,
    expiredMemoryIds,
    expiredObligationIds,
    expiredOpportunityLockIds,
    compactedDecisionIds: compacted.compactedDecisionIds,
    prunedObligationIds,
    prunedOpportunityLockIds,
  };
}
