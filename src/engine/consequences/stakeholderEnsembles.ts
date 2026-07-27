import type { GameState } from "@/engine/core/types";
import {
  getMaterializedRelationshipConflictFront,
  type RelationshipFrontStructure,
} from "./authoredRelationshipConflicts";
import type { DecisionRecord, EntityRef, GameDate, JsonValue } from "./types";

export interface RecurringRelationshipFrontEnsemble {
  id: string;
  frontFamilyId: string;
  recurrenceName: string;
  frontStructures: readonly RelationshipFrontStructure[];
  definitionIds: readonly string[];
  pivot: EntityRef;
  subject?: EntityRef;
  members: readonly EntityRef[];
  activeDecisionIds: readonly string[];
  historyDecisionIds: readonly string[];
  memoryIds: readonly string[];
  obligationIds: readonly string[];
  accessAgreementIds: readonly string[];
  activeAccessAgreementIds: readonly string[];
  recurrenceCount: number;
  active: boolean;
  firstSeenAt?: GameDate;
  lastSeenAt?: GameDate;
}

export interface RelationshipFrontEnsembleCoverage {
  totalEnsembles: number;
  activeEnsembles: number;
  totalActiveDecisions: number;
  frontFamilyIds: readonly string[];
  activeFrontFamilyIds: readonly string[];
  frontStructures: readonly RelationshipFrontStructure[];
}

interface EnsembleAccumulator {
  id: string;
  frontFamilyId: string;
  recurrenceName: string;
  frontStructures: Set<RelationshipFrontStructure>;
  definitionIds: Set<string>;
  pivot: EntityRef;
  subject?: EntityRef;
  members: EntityRef[];
  activeDecisionIds: Set<string>;
  historyDecisionIds: Set<string>;
  memoryIds: Set<string>;
  obligationIds: Set<string>;
  accessAgreementIds: Set<string>;
  activeAccessAgreementIds: Set<string>;
  recurrenceCount: number;
  active: boolean;
  firstSeenAt?: GameDate;
  lastSeenAt?: GameDate;
}

function entityKey(entity: EntityRef): string {
  return `${entity.kind}:${entity.id}`;
}

function parseEntityKey(key: string): EntityRef {
  const [kind, ...rest] = key.split(":");
  return rest.length > 0
    ? { kind, id: rest.join(":") }
    : { kind: "entity", id: key };
}

function sameEntity(left: EntityRef | undefined, right: EntityRef | undefined): boolean {
  return Boolean(left) && Boolean(right) && left!.kind === right!.kind && left!.id === right!.id;
}

function latestDateOrdinal(date: GameDate | undefined): number {
  return date ? date.season * 100 + date.week : -1;
}

function minDate(left: GameDate | undefined, right: GameDate | undefined): GameDate | undefined {
  if (!left) return right ? { ...right } : undefined;
  if (!right) return { ...left };
  return latestDateOrdinal(left) <= latestDateOrdinal(right) ? { ...left } : { ...right };
}

function maxDate(left: GameDate | undefined, right: GameDate | undefined): GameDate | undefined {
  if (!left) return right ? { ...right } : undefined;
  if (!right) return { ...left };
  return latestDateOrdinal(left) >= latestDateOrdinal(right) ? { ...left } : { ...right };
}

function metadataString(metadata: Record<string, JsonValue> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function metadataNumber(metadata: Record<string, JsonValue> | undefined, key: string): number | undefined {
  const value = metadata?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function relationshipFrontMetadata(
  decision: Pick<DecisionRecord, "source" | "metadata" | "stakeholders">,
): {
  ensembleId: string;
  frontFamilyId: string;
  recurrenceName: string;
  frontStructure: RelationshipFrontStructure;
  recurrenceIndex: number;
  subject?: EntityRef;
  members: EntityRef[];
} | undefined {
  const explicit = getMaterializedRelationshipConflictFront(decision);
  if (explicit) {
    return {
      ensembleId: explicit.ensembleId,
      frontFamilyId: explicit.frontFamilyId,
      recurrenceName: explicit.recurrenceName,
      frontStructure: explicit.frontStructure,
      recurrenceIndex: explicit.recurrenceIndex,
      subject: { ...explicit.subject },
      members: [
        parseEntityKey(explicit.leftStakeholderKey),
        parseEntityKey(explicit.rightStakeholderKey),
      ],
    };
  }
  if (decision.source.kind !== "relationshipConflict") return undefined;
  const relatedPlayerId = metadataString(decision.metadata, "subjectId")
    ?? metadataString(decision.metadata, "relatedPlayerId");
  const subjectKind = metadataString(decision.metadata, "subjectKind") ?? (relatedPlayerId ? "player" : undefined);
  const members = decision.stakeholders.length >= 2
    ? decision.stakeholders.slice(0, 2).map((stakeholder) => ({ ...stakeholder }))
    : [];
  if (members.length < 2) return undefined;
  const frontFamilyId = metadataString(decision.metadata, "frontFamilyId") ?? decision.source.id;
  return {
    ensembleId: [
      "relationship-ensemble",
      frontFamilyId,
      subjectKind && relatedPlayerId ? `${subjectKind}:${relatedPlayerId}` : "subject:unknown",
      `left:${entityKey(members[0])}`,
      `right:${entityKey(members[1])}`,
    ].join(":"),
    frontFamilyId,
    recurrenceName: metadataString(decision.metadata, "recurrenceName")
      ?? metadataString(decision.metadata, "title")
      ?? decision.source.id,
    frontStructure: (metadataString(decision.metadata, "frontStructure")
      ?? "ultimatum") as RelationshipFrontStructure,
    recurrenceIndex: metadataNumber(decision.metadata, "recurrenceIndex") ?? 1,
    subject: subjectKind && relatedPlayerId ? { kind: subjectKind, id: relatedPlayerId } : undefined,
    members,
  };
}

function ensureAccumulator(
  map: Map<string, EnsembleAccumulator>,
  input: {
    id: string;
    frontFamilyId: string;
    recurrenceName: string;
    frontStructure: RelationshipFrontStructure;
    definitionId: string;
    pivot: EntityRef;
    subject?: EntityRef;
    members: EntityRef[];
  },
): EnsembleAccumulator {
  const existing = map.get(input.id);
  if (existing) {
    existing.frontStructures.add(input.frontStructure);
    existing.definitionIds.add(input.definitionId);
    existing.subject = existing.subject ?? input.subject;
    return existing;
  }
  const created: EnsembleAccumulator = {
    id: input.id,
    frontFamilyId: input.frontFamilyId,
    recurrenceName: input.recurrenceName,
    frontStructures: new Set([input.frontStructure]),
    definitionIds: new Set([input.definitionId]),
    pivot: { ...input.pivot },
    subject: input.subject ? { ...input.subject } : undefined,
    members: input.members.map((member) => ({ ...member })),
    activeDecisionIds: new Set<string>(),
    historyDecisionIds: new Set<string>(),
    memoryIds: new Set<string>(),
    obligationIds: new Set<string>(),
    accessAgreementIds: new Set<string>(),
    activeAccessAgreementIds: new Set<string>(),
    recurrenceCount: 0,
    active: false,
  };
  map.set(input.id, created);
  return created;
}

function currentDecisionIsActive(status: DecisionRecord["status"]): boolean {
  return status === "offered" || status === "selected";
}

/**
 * Stable, read-only grouping of recurring relationship fronts. The identity is
 * derived from persisted conflict metadata when present and falls back to the
 * older decision cast when loading pre-ensemble saves.
 */
export function getRecurringRelationshipFrontEnsembles(
  state: GameState,
): RecurringRelationshipFrontEnsemble[] {
  const pivot: EntityRef = { kind: "scout", id: state.scout.id };
  const ensembles = new Map<string, EnsembleAccumulator>();
  const decisionToEnsembleId = new Map<string, string>();

  for (const decision of Object.values(state.consequenceState.decisions)) {
    if (decision.source.kind !== "relationshipConflict") continue;
    const front = relationshipFrontMetadata(decision);
    if (!front) continue;
    const ensemble = ensureAccumulator(ensembles, {
      id: front.ensembleId,
      frontFamilyId: front.frontFamilyId,
      recurrenceName: front.recurrenceName,
      frontStructure: front.frontStructure,
      definitionId: decision.source.id,
      pivot,
      subject: front.subject,
      members: front.members,
    });
    decisionToEnsembleId.set(decision.id, front.ensembleId);
    ensemble.recurrenceCount = Math.max(ensemble.recurrenceCount, front.recurrenceIndex);
    if (currentDecisionIsActive(decision.status)) {
      ensemble.activeDecisionIds.add(decision.id);
      ensemble.active = true;
    } else {
      ensemble.historyDecisionIds.add(decision.id);
    }
    ensemble.firstSeenAt = minDate(ensemble.firstSeenAt, decision.offeredAt);
    ensemble.lastSeenAt = maxDate(
      ensemble.lastSeenAt,
      decision.resolvedAt ?? decision.expiredAt ?? decision.selectedAt ?? decision.offeredAt,
    );
  }

  for (const record of state.consequenceState.history) {
    if (record.source.kind !== "relationshipConflict") continue;
    const front = relationshipFrontMetadata({
      source: record.source,
      metadata: record.metadata,
      stakeholders: record.stakeholderIds.map((id) => parseEntityKey(id)),
    });
    if (!front) continue;
    const ensemble = ensureAccumulator(ensembles, {
      id: front.ensembleId,
      frontFamilyId: front.frontFamilyId,
      recurrenceName: front.recurrenceName,
      frontStructure: front.frontStructure,
      definitionId: record.source.id,
      pivot,
      subject: front.subject,
      members: front.members,
    });
    decisionToEnsembleId.set(record.decisionId, front.ensembleId);
    ensemble.recurrenceCount = Math.max(ensemble.recurrenceCount, front.recurrenceIndex);
    ensemble.historyDecisionIds.add(record.decisionId);
    ensemble.firstSeenAt = minDate(ensemble.firstSeenAt, record.offeredAt);
    ensemble.lastSeenAt = maxDate(ensemble.lastSeenAt, record.terminalAt);
  }

  for (const obligation of Object.values(state.consequenceState.obligations)) {
    const ensembleId = metadataString(obligation.metadata, "ensembleId")
      ?? decisionToEnsembleId.get(obligation.sourceDecisionId);
    if (!ensembleId) continue;
    const ensemble = ensembles.get(ensembleId);
    if (!ensemble) continue;
    ensemble.obligationIds.add(obligation.id);
    if (obligation.status === "active") ensemble.active = true;
  }

  for (const memory of Object.values(state.consequenceState.memories)) {
    const ensembleId = metadataString(memory.metadata, "ensembleId")
      ?? (memory.sourceDecisionId ? decisionToEnsembleId.get(memory.sourceDecisionId) : undefined);
    if (!ensembleId) continue;
    const ensemble = ensembles.get(ensembleId);
    if (!ensemble) continue;
    ensemble.memoryIds.add(memory.id);
  }

  for (const agreement of Object.values(state.accessAgreements ?? {})) {
    for (const ensemble of ensembles.values()) {
      if (!sameEntity(ensemble.subject, agreement.subject)) continue;
      const partyMatches = ensemble.members.some((member) =>
        sameEntity(member, agreement.grantor) || sameEntity(member, agreement.beneficiary),
      ) || sameEntity(ensemble.pivot, agreement.grantor)
        || sameEntity(ensemble.pivot, agreement.beneficiary);
      if (!partyMatches) continue;
      ensemble.accessAgreementIds.add(agreement.id);
      if (agreement.status === "active") {
        ensemble.activeAccessAgreementIds.add(agreement.id);
        ensemble.active = true;
      }
    }
  }

  return [...ensembles.values()].map((ensemble) => ({
    id: ensemble.id,
    frontFamilyId: ensemble.frontFamilyId,
    recurrenceName: ensemble.recurrenceName,
    frontStructures: [...ensemble.frontStructures].sort(),
    definitionIds: [...ensemble.definitionIds].sort(),
    pivot: { ...ensemble.pivot },
    subject: ensemble.subject ? { ...ensemble.subject } : undefined,
    members: ensemble.members
      .map((member) => ({ ...member }))
      .sort((left, right) => entityKey(left).localeCompare(entityKey(right))),
    activeDecisionIds: [...ensemble.activeDecisionIds].sort(),
    historyDecisionIds: [...ensemble.historyDecisionIds].sort(),
    memoryIds: [...ensemble.memoryIds].sort(),
    obligationIds: [...ensemble.obligationIds].sort(),
    accessAgreementIds: [...ensemble.accessAgreementIds].sort(),
    activeAccessAgreementIds: [...ensemble.activeAccessAgreementIds].sort(),
    recurrenceCount: Math.max(
      ensemble.recurrenceCount,
      ensemble.activeDecisionIds.size + ensemble.historyDecisionIds.size,
    ),
    active: ensemble.active,
    firstSeenAt: ensemble.firstSeenAt ? { ...ensemble.firstSeenAt } : undefined,
    lastSeenAt: ensemble.lastSeenAt ? { ...ensemble.lastSeenAt } : undefined,
  })).sort((left, right) =>
    Number(right.active) - Number(left.active)
    || right.recurrenceCount - left.recurrenceCount
    || latestDateOrdinal(right.lastSeenAt) - latestDateOrdinal(left.lastSeenAt)
    || left.id.localeCompare(right.id),
  );
}

export function getRelationshipFrontEnsembleCoverage(
  state: GameState,
): RelationshipFrontEnsembleCoverage {
  const ensembles = getRecurringRelationshipFrontEnsembles(state);
  const frontFamilyIds = [...new Set(ensembles.map((ensemble) => ensemble.frontFamilyId))].sort();
  const activeFrontFamilyIds = [...new Set(ensembles
    .filter((ensemble) => ensemble.active)
    .map((ensemble) => ensemble.frontFamilyId))].sort();
  const frontStructures = [...new Set(ensembles.flatMap(
    (ensemble) => ensemble.frontStructures,
  ))].sort();
  return {
    totalEnsembles: ensembles.length,
    activeEnsembles: ensembles.filter((ensemble) => ensemble.active).length,
    totalActiveDecisions: ensembles.reduce(
      (sum, ensemble) => sum + ensemble.activeDecisionIds.length,
      0,
    ),
    frontFamilyIds,
    activeFrontFamilyIds,
    frontStructures,
  };
}
