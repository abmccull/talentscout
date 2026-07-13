/**
 * Serializable primitives for the consequence engine.
 *
 * This module deliberately has no dependency on GameState or the stores. The
 * records can be embedded in a save today and projected into richer domain
 * state by adapters later without changing their causal history.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface GameDate {
  week: number;
  season: number;
}

export interface EntityRef {
  /** Open string union so feature modules can introduce new actor kinds. */
  kind: string;
  id: string;
}

export type ConsequenceVisibility = "private" | "stakeholders" | "public";

/** A persisted, queryable fact produced by a choice or its later outcome. */
export interface WorldFact {
  id: string;
  kind: string;
  subject?: EntityRef;
  value: JsonValue;
  observedAt: GameDate;
  visibility: ConsequenceVisibility;
  sourceDecisionId?: string;
  sourceConsequenceId?: string;
  expiresAt?: GameDate;
  metadata?: Record<string, JsonValue>;
}

/** An episodic memory held by one specific stakeholder. */
export interface StakeholderMemory {
  id: string;
  stakeholder: EntityRef;
  subject: EntityRef;
  tags: string[];
  /** Negative memories are below zero; positive memories are above zero. */
  valence: number;
  /** Strength of the episode from 0 to 100. */
  intensity: number;
  /** Likelihood that it influences a future decision, from 0 to 100. */
  salience: number;
  visibility: ConsequenceVisibility;
  createdAt: GameDate;
  sourceDecisionId?: string;
  sourceConsequenceId?: string;
  /** Omit for an effectively permanent memory. */
  halfLifeWeeks?: number;
  metadata?: Record<string, JsonValue>;
}

export type ObligationStatus =
  | "active"
  | "fulfilled"
  | "breached"
  | "waived"
  | "expired";

/** A promise, favour, or debt whose terminal state can be reached once. */
export interface Obligation {
  id: string;
  debtor: EntityRef;
  creditor: EntityRef;
  kind: string;
  terms: string;
  status: ObligationStatus;
  createdAt: GameDate;
  dueAt?: GameDate;
  sourceDecisionId: string;
  resolvedAt?: GameDate;
  resolutionNote?: string;
  metadata?: Record<string, JsonValue>;
}

export type OpportunityLockStatus =
  | "active"
  | "consumed"
  | "closed"
  | "released"
  | "expired";

/**
 * A durable opportunity cost. Consuming one member of an exclusive set closes
 * every other active member of that set.
 */
export interface OpportunityLock {
  id: string;
  opportunityId: string;
  exclusiveSetId: string;
  owner: EntityRef;
  status: OpportunityLockStatus;
  createdAt: GameDate;
  expiresAt?: GameDate;
  sourceDecisionId?: string;
  resolvedAt?: GameDate;
  resolutionNote?: string;
  metadata?: Record<string, JsonValue>;
}

export type ConsequenceCondition =
  | { type: "factExists"; factId: string; exists?: boolean }
  | { type: "factEquals"; factId: string; value: JsonValue }
  | { type: "metricAtLeast"; metricKey: string; value: number }
  | { type: "metricAtMost"; metricKey: string; value: number }
  | { type: "obligationStatus"; obligationId: string; status: ObligationStatus }
  | { type: "opportunityStatus"; opportunityLockId: string; status: OpportunityLockStatus };

interface EffectBase {
  /** Stable effect id; the projection applies each effect at most once. */
  id: string;
}

export type ConsequenceEffect =
  | (EffectBase & {
      type: "adjustMetric";
      metricKey: string;
      delta: number;
      min?: number;
      max?: number;
    })
  | (EffectBase & { type: "recordFact"; fact: WorldFact })
  | (EffectBase & { type: "addMemory"; memory: StakeholderMemory })
  | (EffectBase & { type: "createObligation"; obligation: Obligation })
  | (EffectBase & {
      type: "transitionObligation";
      obligationId: string;
      status: Exclude<ObligationStatus, "active">;
      note?: string;
    })
  | (EffectBase & { type: "createOpportunityLock"; lock: OpportunityLock })
  | (EffectBase & {
      type: "transitionOpportunityLock";
      opportunityLockId: string;
      status: Exclude<OpportunityLockStatus, "active">;
      note?: string;
    });

export interface ScheduledConsequenceTemplate {
  /** Stable within the decision option. */
  id: string;
  dueAt: GameDate;
  effects: ConsequenceEffect[];
  conditions?: ConsequenceCondition[];
  /** 0..1; omitted means certain. */
  probability?: number;
  /** Persisted uniform roll. Falls back to the decision roll when omitted. */
  outcomeRoll?: number;
  tags?: string[];
}

export interface DecisionOption {
  id: string;
  label: string;
  /** Player-facing summary of known costs, not hidden outcome data. */
  knownTradeoffs: string[];
  immediateEffects: ConsequenceEffect[];
  scheduledConsequences: ScheduledConsequenceTemplate[];
}

export type DecisionStatus = "offered" | "selected" | "expired" | "resolved";

export interface DecisionRecord {
  id: string;
  source: EntityRef;
  offeredAt: GameDate;
  deadlineAt: GameDate;
  status: DecisionStatus;
  visibility: ConsequenceVisibility;
  stakeholders: EntityRef[];
  options: DecisionOption[];
  /** Used when ignoring the choice is itself a designed choice. */
  defaultOptionId?: string;
  /** Applied only when an expired decision has no default option. */
  expiryEffects?: ConsequenceEffect[];
  selectedOptionId?: string;
  selectedAt?: GameDate;
  selectionKind?: "player" | "default" | "system";
  expiredAt?: GameDate;
  resolvedAt?: GameDate;
  /** Precommitted uniform roll prevents save/reload rerolls. */
  outcomeRoll: number;
  consequenceIds: string[];
  opportunitySetId?: string;
  metadata?: Record<string, JsonValue>;
}

export type ConsequenceStatus =
  | "pending"
  | "applied"
  | "skipped"
  | "failed"
  | "cancelled";

export interface ConsequenceRecord {
  id: string;
  decisionId: string;
  optionId?: string;
  templateId: string;
  dueAt: GameDate;
  status: ConsequenceStatus;
  effects: ConsequenceEffect[];
  conditions: ConsequenceCondition[];
  probability: number;
  outcomeRoll: number;
  tags: string[];
  resolvedAt?: GameDate;
  resolution?: "conditionsFailed" | "chanceFailed" | "effectsApplied" | "applicationFailed";
  failureReason?: string;
}

export type ScheduledCallbackStatus = "pending" | "processed" | "cancelled";

/** Serializable callback descriptor; execution is handled by the processor. */
export interface ScheduledCallback {
  id: string;
  consequenceId: string;
  callbackKey: "applyConsequence";
  dueAt: GameDate;
  status: ScheduledCallbackStatus;
  processedAt?: GameDate;
}

export interface AppliedEffectRecord {
  effectId: string;
  consequenceId: string;
  appliedAt: GameDate;
}

/**
 * Bounded audit summary retained after the heavyweight execution records for
 * a terminal decision have been compacted.
 */
export interface ConsequenceHistoryRecord {
  decisionId: string;
  source: EntityRef;
  offeredAt: GameDate;
  terminalAt: GameDate;
  status: Extract<DecisionStatus, "expired" | "resolved">;
  selectedOptionId?: string;
  selectionKind?: NonNullable<DecisionRecord["selectionKind"]>;
  stakeholderIds: string[];
  appliedCount: number;
  skippedCount: number;
  failedCount: number;
  cancelledCount: number;
  metadata?: Record<string, JsonValue>;
}

/**
 * Minimal normalized projection used by the pure engine. A host GameState can
 * store these maps directly or translate effects through a domain adapter.
 */
export interface ConsequenceEngineState {
  decisions: Record<string, DecisionRecord>;
  consequences: Record<string, ConsequenceRecord>;
  callbacks: Record<string, ScheduledCallback>;
  facts: Record<string, WorldFact>;
  memories: Record<string, StakeholderMemory>;
  obligations: Record<string, Obligation>;
  opportunityLocks: Record<string, OpportunityLock>;
  metrics: Record<string, number>;
  appliedEffects: Record<string, AppliedEffectRecord>;
  /** Newest bounded summaries of compacted terminal decisions. */
  history: ConsequenceHistoryRecord[];
}
