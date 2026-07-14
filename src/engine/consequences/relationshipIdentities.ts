import type { GameState } from "@/engine/core/types";
import type { EntityRef, Obligation, StakeholderMemory } from "./types";

export type RecurringRelationshipRole =
  | "family"
  | "journalist"
  | "employee"
  | "agent"
  | "rival";

export interface RecurringRelationshipIdentity {
  entity: EntityRef;
  role: RecurringRelationshipRole;
  name: string;
  affiliation?: string;
  baseTrust?: number;
  memoryIds: string[];
  activeObligationIds: string[];
  unresolvedConflictIds: string[];
}

export interface RelationshipConflictGroup {
  decisionId: string;
  obligationIds: string[];
  stakeholderRefs: EntityRef[];
  dueAt?: { week: number; season: number };
}

function entityKey(entity: EntityRef): string {
  return `${entity.kind}:${entity.id}`;
}

function sameEntity(left: EntityRef, right: EntityRef): boolean {
  return left.kind === right.kind && left.id === right.id;
}

function playerForFamily(state: GameState, id: string) {
  return state.players[id]
    ?? state.retiredPlayers[id]
    ?? Object.values(state.unsignedYouth).find((candidate) => candidate.player.id === id)?.player;
}

function familyName(state: GameState, id: string): string {
  const player = playerForFamily(state, id);
  return player?.lastName ? `The ${player.lastName} family` : "A prospect's family";
}

function latestDateOrdinal(date: { week: number; season: number }): number {
  return date.season * 100 + date.week;
}

function memoryIdsFor(
  memories: readonly StakeholderMemory[],
  entity: EntityRef,
): string[] {
  return memories
    .filter((memory) => sameEntity(memory.stakeholder, entity))
    .sort((left, right) =>
      latestDateOrdinal(right.createdAt) - latestDateOrdinal(left.createdAt)
      || right.salience - left.salience
      || left.id.localeCompare(right.id),
    )
    .map((memory) => memory.id);
}

function obligationsFor(
  obligations: readonly Obligation[],
  entity: EntityRef,
): Obligation[] {
  return obligations.filter((obligation) =>
    obligation.status === "active"
    && (sameEntity(obligation.creditor, entity) || sameEntity(obligation.debtor, entity)),
  );
}

/**
 * Active requests born from one decision are a real conflict when at least two
 * distinct people are owed incompatible or negotiated responses.
 */
export function getActiveRelationshipConflictGroups(
  state: Pick<GameState, "consequenceState">,
): RelationshipConflictGroup[] {
  const groups = new Map<string, Obligation[]>();
  for (const obligation of Object.values(state.consequenceState.obligations)) {
    if (obligation.status !== "active" || obligation.metadata?.conflict !== true) continue;
    const existing = groups.get(obligation.sourceDecisionId) ?? [];
    existing.push(obligation);
    groups.set(obligation.sourceDecisionId, existing);
  }

  return [...groups.entries()].flatMap(([decisionId, obligations]) => {
    const stakeholderRefs = [...new Map(
      obligations.map((obligation) => [entityKey(obligation.creditor), obligation.creditor]),
    ).values()];
    if (stakeholderRefs.length < 2) return [];
    const dueAt = obligations
      .flatMap((obligation) => obligation.dueAt ? [obligation.dueAt] : [])
      .sort((left, right) => latestDateOrdinal(left) - latestDateOrdinal(right))[0];
    return [{
      decisionId,
      obligationIds: obligations.map((obligation) => obligation.id).sort(),
      stakeholderRefs,
      dueAt,
    }];
  }).sort((left, right) =>
    latestDateOrdinal(left.dueAt ?? { week: 99, season: 9999 })
    - latestDateOrdinal(right.dueAt ?? { week: 99, season: 9999 })
    || left.decisionId.localeCompare(right.decisionId),
  );
}

/**
 * Stable, player-safe cast registry backed by save entities rather than
 * one-off generated labels. Each person carries their ledger history forward.
 */
export function getRecurringRelationshipIdentities(
  state: GameState,
): RecurringRelationshipIdentity[] {
  const memories = Object.values(state.consequenceState.memories);
  const obligations = Object.values(state.consequenceState.obligations);
  const conflicts = getActiveRelationshipConflictGroups(state);
  const identities = new Map<string, Omit<RecurringRelationshipIdentity,
    "memoryIds" | "activeObligationIds" | "unresolvedConflictIds">>();

  for (const contact of Object.values(state.contacts)) {
    const role: RecurringRelationshipRole | undefined = contact.type === "journalist"
      ? "journalist"
      : contact.type === "agent" || contact.type === "youthAgent"
        ? "agent"
        : undefined;
    if (!role) continue;
    const entity = { kind: "contact", id: contact.id };
    identities.set(entityKey(entity), {
      entity,
      role,
      name: contact.name,
      affiliation: contact.organization,
      baseTrust: contact.trustLevel ?? contact.relationship,
    });
  }

  for (const employee of state.finances?.employees ?? []) {
    const entity = { kind: "employee", id: employee.id };
    identities.set(entityKey(entity), {
      entity,
      role: "employee",
      name: employee.name,
      affiliation: "Your agency",
      baseTrust: employee.morale,
    });
  }

  for (const rival of Object.values(state.rivalScouts)) {
    const entity = { kind: "rival", id: rival.id };
    identities.set(entityKey(entity), {
      entity,
      role: "rival",
      name: rival.name,
      affiliation: state.clubs[rival.clubId]?.name,
      baseTrust: Math.round(Math.max(0, Math.min(100,
        60 - rival.aggressiveness * 35 + rival.lossesToPlayer * 3 - rival.winsAgainstPlayer * 4,
      ))),
    });
  }

  const familyIds = new Set<string>();
  for (const memory of memories) {
    if (memory.stakeholder.kind === "family") familyIds.add(memory.stakeholder.id);
  }
  for (const obligation of obligations) {
    if (obligation.creditor.kind === "family") familyIds.add(obligation.creditor.id);
    if (obligation.debtor.kind === "family") familyIds.add(obligation.debtor.id);
  }
  for (const id of familyIds) {
    const entity = { kind: "family", id };
    identities.set(entityKey(entity), {
      entity,
      role: "family",
      name: familyName(state, id),
      affiliation: playerForFamily(state, id)
        ? `Family of ${playerForFamily(state, id)?.firstName} ${playerForFamily(state, id)?.lastName}`
        : undefined,
    });
  }

  return [...identities.values()].map((identity) => {
    const active = obligationsFor(obligations, identity.entity);
    const conflictIds = conflicts
      .filter((conflict) => conflict.stakeholderRefs.some((stakeholder) =>
        sameEntity(stakeholder, identity.entity),
      ))
      .map((conflict) => conflict.decisionId);
    return {
      ...identity,
      memoryIds: memoryIdsFor(memories, identity.entity),
      activeObligationIds: active.map((obligation) => obligation.id).sort(),
      unresolvedConflictIds: conflictIds,
    };
  }).sort((left, right) =>
    right.unresolvedConflictIds.length - left.unresolvedConflictIds.length
    || right.activeObligationIds.length - left.activeObligationIds.length
    || right.memoryIds.length - left.memoryIds.length
    || left.name.localeCompare(right.name),
  );
}
