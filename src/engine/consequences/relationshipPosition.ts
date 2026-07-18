import type { Contact, GameDate, GameState } from "@/engine/core/types";
import {
  buildStakeholderEcologyProfile,
  type StakeholderEcologyProfile,
} from "./stakeholderEcology";
import {
  getActiveAccessAgreementsForStakeholder,
  type AccessAgreement,
} from "./accessAgreements";
import type { EntityRef } from "./types";

export type RelationshipStance =
  | "trustedAlly"
  | "workingAlly"
  | "conditional"
  | "strained"
  | "adversarial";

export interface RelationshipPosition {
  stakeholder: EntityRef;
  stance: RelationshipStance;
  ecology: StakeholderEcologyProfile;
  activeAccess: AccessAgreement[];
  leverageScore: number;
  threatScore: number;
}

function sameEntity(left: EntityRef, right: EntityRef): boolean {
  return left.kind === right.kind && left.id === right.id;
}

function stanceForEcology(
  ecology: StakeholderEcologyProfile,
  threatScore: number,
): RelationshipStance {
  const trust = ecology.trust.effective ?? ecology.trust.base ?? 50;
  if (threatScore >= 70 || trust <= 20) return "adversarial";
  if (trust >= 75 && ecology.influence.score >= 45) return "trustedAlly";
  if (trust >= 55) return "workingAlly";
  if (trust >= 35) return "conditional";
  return "strained";
}

export function buildRelationshipPosition(input: {
  state: Pick<GameState, "consequenceState" | "accessAgreements">;
  stakeholder: EntityRef;
  now: GameDate;
  scoutId?: string;
  baseTrust?: number;
  baseInfluence?: number;
  resolveEntityName?: (entity: EntityRef) => string | undefined;
}): RelationshipPosition {
  const ecology = buildStakeholderEcologyProfile({
    state: input.state.consequenceState,
    stakeholder: input.stakeholder,
    now: input.now,
    scoutId: input.scoutId,
    baseTrust: input.baseTrust,
    baseInfluence: input.baseInfluence,
    resolveEntityName: input.resolveEntityName,
  });
  const activeAccess = getActiveAccessAgreementsForStakeholder(
    input.state.accessAgreements,
    input.stakeholder,
    input.now,
  );
  const leverageScore = Math.max(
    0,
    Math.min(100, ecology.influence.activeObligations * 15 + activeAccess.length * 20),
  );
  const threatScore = Math.max(
    0,
    Math.min(
      100,
      (ecology.trust.effective !== undefined ? 100 - ecology.trust.effective : 40)
        + (ecology.memories.filter((memory) => memory.tone === "negative").length * 12),
    ),
  );
  return {
    stakeholder: { ...input.stakeholder },
    stance: stanceForEcology(ecology, threatScore),
    ecology,
    activeAccess,
    leverageScore,
    threatScore,
  };
}

export function buildContactRelationshipPosition(input: {
  state: Pick<GameState, "consequenceState" | "accessAgreements">;
  contact: Contact;
  now: GameDate;
  scoutId?: string;
  resolveEntityName?: (entity: EntityRef) => string | undefined;
}): RelationshipPosition {
  return buildRelationshipPosition({
    state: input.state,
    stakeholder: { kind: "contact", id: input.contact.id },
    now: input.now,
    scoutId: input.scoutId,
    baseTrust: input.contact.trustLevel ?? input.contact.relationship,
    baseInfluence: Math.round((input.contact.relationship + input.contact.reliability) / 2),
    resolveEntityName: input.resolveEntityName,
  });
}

export function countSharedActiveAccess(
  agreements: readonly AccessAgreement[],
  subject: EntityRef,
): number {
  return agreements.filter((agreement) =>
    agreement.subject && sameEntity(agreement.subject, subject),
  ).length;
}
