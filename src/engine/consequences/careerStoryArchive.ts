import type {
  ConsequenceEngineState,
  DecisionRecord,
  EntityRef,
  GameDate,
  JsonValue,
} from "./types";

export const CAREER_STORY_ARCHIVE_VERSION = 1 as const;
export const DEFAULT_MAX_CAREER_STORY_ARCHIVE_RECORDS = 512;

export interface ArchivedEntityLabel {
  entity: EntityRef;
  label: string;
}

export interface ArchivedOutcomeFact {
  id: string;
  kind: string;
  value: JsonValue;
  observedAt: GameDate;
  subject?: EntityRef;
}

export interface ArchivedStakeholderReaction {
  stakeholder: EntityRef;
  tags: string[];
  valence: number;
  createdAt: GameDate;
}

export interface ArchivedObligationOutcome {
  id: string;
  debtor: EntityRef;
  creditor: EntityRef;
  terms: string;
  status: string;
  resolvedAt?: GameDate;
  resolutionNote?: string;
}

/**
 * Compact, player-safe materialization written before execution compaction.
 * It preserves the professional artifact and consequence, not hidden truth.
 */
export interface CareerStoryArchiveRecord {
  id: string;
  decisionId: string;
  title: string;
  source: EntityRef;
  offeredAt: GameDate;
  terminalAt: GameDate;
  status: "resolved" | "expired";
  selectionKind?: DecisionRecord["selectionKind"];
  selectedOptionId?: string;
  selectedOptionLabel?: string;
  knownTradeoffs: string[];
  cast: ArchivedEntityLabel[];
  playerId?: string;
  clubId?: string;
  reportId?: string;
  outcomeFacts: ArchivedOutcomeFact[];
  stakeholderReactions: ArchivedStakeholderReaction[];
  obligations: ArchivedObligationOutcome[];
  significance: number;
  presentationSeed: string;
  callbackFingerprints: string[];
}

export interface CareerStoryArchiveState {
  version: typeof CAREER_STORY_ARCHIVE_VERSION;
  records: Record<string, CareerStoryArchiveRecord>;
  order: string[];
}

export interface ArchiveMaterialCareerStoriesResult {
  archive: CareerStoryArchiveState;
  archivedDecisionIds: string[];
}

function gameDate(value: GameDate): GameDate {
  return { week: value.week, season: value.season };
}

function terminalAt(decision: DecisionRecord): GameDate {
  return gameDate(
    decision.resolvedAt
      ?? decision.expiredAt
      ?? decision.selectedAt
      ?? decision.deadlineAt,
  );
}

function metadataString(decision: DecisionRecord, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = decision.metadata?.[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return undefined;
}

function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

function entityKey(entity: EntityRef): string {
  return `${entity.kind}:${entity.id}`;
}

function resolvePlayerId(decision: DecisionRecord): string | undefined {
  if (decision.source.kind === "player") return decision.source.id;
  return metadataString(decision, "relatedPlayerId", "playerId");
}

function resolveReportId(decision: DecisionRecord): string | undefined {
  if (decision.source.kind === "report") return decision.source.id;
  return metadataString(decision, "reportId", "relatedReportId");
}

function resolveClubId(decision: DecisionRecord): string | undefined {
  if (decision.source.kind === "club") return decision.source.id;
  return metadataString(decision, "clubId", "relatedClubId");
}

function isMaterial(
  decision: DecisionRecord,
  facts: readonly ArchivedOutcomeFact[],
  reactions: readonly ArchivedStakeholderReaction[],
  obligations: readonly ArchivedObligationOutcome[],
): boolean {
  if (decision.selectedOptionId && decision.options
    .find((option) => option.id === decision.selectedOptionId)?.knownTradeoffs.length) return true;
  if (facts.length > 0 || reactions.length > 0 || obligations.length > 0) return true;
  return Boolean(
    metadataString(decision, "title", "relatedPlayerId", "playerId", "reportId", "clubId"),
  );
}

function significanceScore(input: {
  decision: DecisionRecord;
  facts: readonly ArchivedOutcomeFact[];
  reactions: readonly ArchivedStakeholderReaction[];
  obligations: readonly ArchivedObligationOutcome[];
}): number {
  const selected = input.decision.options.find(
    (option) => option.id === input.decision.selectedOptionId,
  );
  const reactionWeight = input.reactions.reduce(
    (sum, reaction) => sum + Math.min(20, Math.abs(reaction.valence) / 5),
    0,
  );
  return Math.round(Math.min(100,
    20
      + (selected?.knownTradeoffs.length ?? 0) * 5
      + input.facts.length * 8
      + input.obligations.length * 7
      + reactionWeight,
  ));
}

function snapshotCast(
  decision: DecisionRecord,
  resolveEntityName?: (entity: EntityRef) => string | undefined,
): ArchivedEntityLabel[] {
  const entities = [decision.source, ...decision.stakeholders];
  return [...new Map(entities.map((entity) => [entityKey(entity), entity])).values()]
    .map((entity) => ({
      entity: { ...entity },
      label: resolveEntityName?.(entity) ?? humanize(entity.kind),
    }));
}

function buildArchiveRecord(input: {
  state: ConsequenceEngineState;
  decision: DecisionRecord;
  rootSeed: string;
  resolveEntityName?: (entity: EntityRef) => string | undefined;
}): CareerStoryArchiveRecord | undefined {
  const { state, decision } = input;
  const facts: ArchivedOutcomeFact[] = Object.values(state.facts)
    .filter((fact) => fact.sourceDecisionId === decision.id && fact.visibility !== "private")
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((fact) => ({
      id: fact.id,
      kind: fact.kind,
      value: fact.value,
      observedAt: gameDate(fact.observedAt),
      subject: fact.subject ? { ...fact.subject } : undefined,
    }));
  const reactions: ArchivedStakeholderReaction[] = Object.values(state.memories)
    .filter((memory) => memory.sourceDecisionId === decision.id && memory.visibility !== "private")
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((memory) => ({
      stakeholder: { ...memory.stakeholder },
      tags: [...memory.tags],
      valence: memory.valence,
      createdAt: gameDate(memory.createdAt),
    }));
  const obligations: ArchivedObligationOutcome[] = Object.values(state.obligations)
    .filter((obligation) => obligation.sourceDecisionId === decision.id)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((obligation) => ({
      id: obligation.id,
      debtor: { ...obligation.debtor },
      creditor: { ...obligation.creditor },
      terms: obligation.terms,
      status: obligation.status,
      resolvedAt: obligation.resolvedAt ? gameDate(obligation.resolvedAt) : undefined,
      resolutionNote: obligation.resolutionNote,
    }));
  if (!isMaterial(decision, facts, reactions, obligations)) return undefined;
  const selected = decision.options.find((option) => option.id === decision.selectedOptionId);
  const title = metadataString(decision, "title")
    ?? selected?.label
    ?? humanize(decision.source.kind);
  return {
    id: `career-story:${decision.id}`,
    decisionId: decision.id,
    title,
    source: { ...decision.source },
    offeredAt: gameDate(decision.offeredAt),
    terminalAt: terminalAt(decision),
    status: decision.status as "resolved" | "expired",
    selectionKind: decision.selectionKind,
    selectedOptionId: decision.selectedOptionId,
    selectedOptionLabel: selected?.label,
    knownTradeoffs: [...(selected?.knownTradeoffs ?? [])],
    cast: snapshotCast(decision, input.resolveEntityName),
    playerId: resolvePlayerId(decision),
    clubId: resolveClubId(decision),
    reportId: resolveReportId(decision),
    outcomeFacts: facts,
    stakeholderReactions: reactions,
    obligations,
    significance: significanceScore({ decision, facts, reactions, obligations }),
    presentationSeed: `${input.rootSeed}:career-story-archive:v1:${decision.id}`,
    callbackFingerprints: [],
  };
}

export function createCareerStoryArchiveState(
  partial: Partial<CareerStoryArchiveState> = {},
): CareerStoryArchiveState {
  const records = { ...(partial.records ?? {}) };
  const order = [...new Set((partial.order ?? []).filter((id) => Boolean(records[id])))];
  for (const id of Object.keys(records).sort()) {
    if (!order.includes(id)) order.push(id);
  }
  return {
    version: CAREER_STORY_ARCHIVE_VERSION,
    records,
    order,
  };
}

/**
 * Capture every terminal material decision while full facts and selected-option
 * copy still exist. Call immediately before maintainConsequenceLifecycle().
 */
export function archiveMaterialCareerStories(input: {
  state: ConsequenceEngineState;
  archive?: CareerStoryArchiveState;
  rootSeed: string;
  resolveEntityName?: (entity: EntityRef) => string | undefined;
  maxRecords?: number;
}): ArchiveMaterialCareerStoriesResult {
  const current = createCareerStoryArchiveState(input.archive);
  const records = { ...current.records };
  const order = [...current.order];
  const archivedDecisionIds: string[] = [];
  const decisions = Object.values(input.state.decisions)
    .filter((decision) => decision.status === "resolved" || decision.status === "expired")
    .sort((left, right) =>
      left.offeredAt.season - right.offeredAt.season
      || left.offeredAt.week - right.offeredAt.week
      || left.id.localeCompare(right.id),
    );
  for (const decision of decisions) {
    const recordId = `career-story:${decision.id}`;
    const existing = records[recordId];
    const rebuilt = buildArchiveRecord({
      state: input.state,
      decision,
      rootSeed: input.rootSeed,
      resolveEntityName: input.resolveEntityName,
    });
    if (!rebuilt) continue;
    records[rebuilt.id] = existing
      ? { ...rebuilt, callbackFingerprints: [...existing.callbackFingerprints] }
      : rebuilt;
    if (!existing) {
      order.push(rebuilt.id);
      archivedDecisionIds.push(decision.id);
    }
  }
  const maxRecords = Math.max(0, Math.floor(
    input.maxRecords ?? DEFAULT_MAX_CAREER_STORY_ARCHIVE_RECORDS,
  ));
  const retainedOrder = maxRecords === 0 ? [] : order.slice(-maxRecords);
  const retained = new Set(retainedOrder);
  return {
    archive: {
      version: CAREER_STORY_ARCHIVE_VERSION,
      records: Object.fromEntries(Object.entries(records).filter(([id]) => retained.has(id))),
      order: retainedOrder,
    },
    archivedDecisionIds,
  };
}

/** Record one delivered milestone exactly once. */
export function registerCareerStoryCallback(
  archive: CareerStoryArchiveState,
  recordId: string,
  callbackFingerprint: string,
): CareerStoryArchiveState {
  const record = archive.records[recordId];
  if (!record || !callbackFingerprint.trim()) return archive;
  if (record.callbackFingerprints.includes(callbackFingerprint)) return archive;
  return {
    ...archive,
    records: {
      ...archive.records,
      [recordId]: {
        ...record,
        callbackFingerprints: [...record.callbackFingerprints, callbackFingerprint].slice(-32),
      },
    },
  };
}
