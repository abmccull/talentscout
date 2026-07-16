import { createNamedRNG } from "@/engine/run";
import { registerDecision, type StateMutationResult } from "./decisionLedger";
import type {
  ConsequenceEngineState,
  ConsequenceEffect,
  DecisionOption,
  DecisionRecord,
  EntityRef,
  GameDate,
  Obligation,
  ObligationStatus,
} from "./types";
import type {
  StakeholderPriority,
  StakeholderProfile,
  StakeholderProfileRegistry,
  StakeholderProfileRole,
} from "./stakeholderProfiles";

export type ConflictStakeholderOutcome = "fulfilled" | "breached" | "negotiated";

export interface AuthoredConflictOptionDefinition {
  id: string;
  label: string;
  knownTradeoffs: readonly string[];
  leftOutcome: ConflictStakeholderOutcome;
  rightOutcome: ConflictStakeholderOutcome;
  leftValence: number;
  rightValence: number;
  fatigueDelta: number;
  reputationDelta: number;
}

export interface AuthoredRelationshipConflictDefinition {
  id: string;
  title: string;
  leftRole: StakeholderProfileRole;
  rightRole: StakeholderProfileRole;
  leftPriority: StakeholderPriority;
  rightPriority: StakeholderPriority;
  subjectKind: string;
  leftRequest: string;
  rightRequest: string;
  deadlineWeeks: number;
  defaultOptionId: string;
  baseWeight: number;
  options: readonly AuthoredConflictOptionDefinition[];
}

export interface AuthoredConflictCast {
  definition: AuthoredRelationshipConflictDefinition;
  left: StakeholderProfile;
  right: StakeholderProfile;
  subject: EntityRef;
  selectionWeight: number;
}

export interface MaterializedRelationshipConflict {
  decision: DecisionRecord;
  offeredObligations: Record<string, Obligation>;
}

export interface RelationshipConflictRegistrationResult extends StateMutationResult {
  decisionId: string;
  obligationIds: string[];
}

const CONFLICT_DEFINITIONS: readonly AuthoredRelationshipConflictDefinition[] = [
  {
    id: "family-versus-journalist-privacy",
    title: "The Family and the Deadline",
    leftRole: "family",
    rightRole: "journalist",
    leftPriority: "privacy",
    rightPriority: "exclusivity",
    subjectKind: "player",
    leftRequest: "Keep the prospect and family circumstances out of public coverage.",
    rightRequest: "Give a clear, attributable answer before the publication deadline.",
    deadlineWeeks: 1,
    defaultOptionId: "protect-family",
    baseWeight: 1.15,
    options: [
      {
        id: "protect-family",
        label: "Protect the family and refuse",
        knownTradeoffs: [
          "Preserves the family's privacy and future cooperation",
          "The journalist loses an exclusive and may stop sharing early leads",
        ],
        leftOutcome: "fulfilled",
        rightOutcome: "breached",
        leftValence: 76,
        rightValence: -58,
        fatigueDelta: 1,
        reputationDelta: 0,
      },
      {
        id: "back-journalist",
        label: "Give the journalist the story",
        knownTradeoffs: [
          "Builds public authority and a valuable media relationship",
          "Breaks a specific privacy request while the prospect is vulnerable",
        ],
        leftOutcome: "breached",
        rightOutcome: "fulfilled",
        leftValence: -82,
        rightValence: 62,
        fatigueDelta: 2,
        reputationDelta: 2,
      },
      {
        id: "negotiate-embargo",
        label: "Negotiate a short embargo",
        knownTradeoffs: [
          "Gives the family preparation time without permanently closing the story",
          "Consumes scarce time and neither side receives everything requested",
        ],
        leftOutcome: "negotiated",
        rightOutcome: "negotiated",
        leftValence: 28,
        rightValence: 24,
        fatigueDelta: 5,
        reputationDelta: 1,
      },
    ],
  },
  {
    id: "employee-versus-agent-credit",
    title: "Who Owns the Discovery?",
    leftRole: "employee",
    rightRole: "agent",
    leftPriority: "credit",
    rightPriority: "discretion",
    subjectKind: "player",
    leftRequest: "Credit the employee publicly for the weeks of work behind the discovery.",
    rightRequest: "Keep the introduction private and preserve the agent's control of access.",
    deadlineWeeks: 2,
    defaultOptionId: "document-shared-credit",
    baseWeight: 1,
    options: [
      {
        id: "credit-employee",
        label: "Credit the employee publicly",
        knownTradeoffs: [
          "Rewards accountable staff work and strengthens retention",
          "The agent may restrict private introductions after being exposed",
        ],
        leftOutcome: "fulfilled",
        rightOutcome: "breached",
        leftValence: 78,
        rightValence: -55,
        fatigueDelta: 1,
        reputationDelta: 1,
      },
      {
        id: "protect-agent",
        label: "Protect the agent's introduction",
        knownTradeoffs: [
          "Preserves discreet market access",
          "Signals to employees that external gatekeepers receive the credit",
        ],
        leftOutcome: "breached",
        rightOutcome: "fulfilled",
        leftValence: -74,
        rightValence: 64,
        fatigueDelta: 1,
        reputationDelta: 0,
      },
      {
        id: "document-shared-credit",
        label: "Document shared attribution",
        knownTradeoffs: [
          "Creates an accurate private record of discovery and access",
          "Costs leadership time and denies both parties exclusive ownership",
        ],
        leftOutcome: "negotiated",
        rightOutcome: "negotiated",
        leftValence: 32,
        rightValence: 26,
        fatigueDelta: 5,
        reputationDelta: 1,
      },
    ],
  },
  {
    id: "rival-versus-agent-territory",
    title: "A Ceasefire With a Price",
    leftRole: "rival",
    rightRole: "agent",
    leftPriority: "territory",
    rightPriority: "access",
    subjectKind: "player",
    leftRequest: "Respect a narrow territorial ceasefire around the contested prospect.",
    rightRequest: "Remain in the race after the agent opened the introduction to you.",
    deadlineWeeks: 1,
    defaultOptionId: "trade-boundary",
    baseWeight: 0.9,
    options: [
      {
        id: "accept-ceasefire",
        label: "Accept the rival's ceasefire",
        knownTradeoffs: [
          "Reduces immediate rival pressure and retaliation",
          "Abandons an introduction the agent made in confidence",
        ],
        leftOutcome: "fulfilled",
        rightOutcome: "breached",
        leftValence: 55,
        rightValence: -68,
        fatigueDelta: -2,
        reputationDelta: 0,
      },
      {
        id: "stay-in-race",
        label: "Back the agent and stay in the race",
        knownTradeoffs: [
          "Honours the introduction and preserves agent access",
          "The rival treats this as a personal territorial challenge",
        ],
        leftOutcome: "breached",
        rightOutcome: "fulfilled",
        leftValence: -62,
        rightValence: 58,
        fatigueDelta: 5,
        reputationDelta: 2,
      },
      {
        id: "trade-boundary",
        label: "Trade another lead for a smaller boundary",
        knownTradeoffs: [
          "Keeps this opportunity alive while limiting the wider conflict",
          "Reveals part of your pipeline and consumes negotiation time",
        ],
        leftOutcome: "negotiated",
        rightOutcome: "negotiated",
        leftValence: 24,
        rightValence: 22,
        fatigueDelta: 4,
        reputationDelta: 1,
      },
    ],
  },
  {
    id: "manager-versus-family-readiness",
    title: "Ready Now, or Ready Properly?",
    leftRole: "manager",
    rightRole: "family",
    leftPriority: "speed",
    rightPriority: "welfare",
    subjectKind: "player",
    leftRequest: "Back an accelerated first-team pathway while the squad has an opening.",
    rightRequest: "Protect education, adaptation and a slower development plan.",
    deadlineWeeks: 2,
    defaultOptionId: "staged-pathway",
    baseWeight: 0.85,
    options: [
      {
        id: "accelerate-player",
        label: "Back the accelerated pathway",
        knownTradeoffs: [
          "Uses a rare first-team opportunity and strengthens manager trust",
          "The family must accept higher pressure and reduced preparation time",
        ],
        leftOutcome: "fulfilled",
        rightOutcome: "breached",
        leftValence: 60,
        rightValence: -65,
        fatigueDelta: 3,
        reputationDelta: 2,
      },
      {
        id: "protect-development",
        label: "Recommend the slower development plan",
        knownTradeoffs: [
          "Protects adaptation and the family's confidence",
          "The manager may fill the role with another player immediately",
        ],
        leftOutcome: "breached",
        rightOutcome: "fulfilled",
        leftValence: -48,
        rightValence: 72,
        fatigueDelta: 1,
        reputationDelta: 0,
      },
      {
        id: "staged-pathway",
        label: "Negotiate a staged pathway",
        knownTradeoffs: [
          "Creates protected milestones before full first-team exposure",
          "Requires continuous follow-up and may satisfy neither deadline fully",
        ],
        leftOutcome: "negotiated",
        rightOutcome: "negotiated",
        leftValence: 28,
        rightValence: 34,
        fatigueDelta: 6,
        reputationDelta: 1,
      },
    ],
  },
  {
    id: "director-versus-coach-budget",
    title: "One Place, Two Promises",
    leftRole: "director",
    rightRole: "coach",
    leftPriority: "financialSecurity",
    rightPriority: "development",
    subjectKind: "player",
    leftRequest: "Recommend the cheaper, saleable profile that keeps the recruitment budget intact.",
    rightRequest: "Back the slower-developing prospect whose pathway the academy has already built.",
    deadlineWeeks: 2,
    defaultOptionId: "fund-milestones",
    baseWeight: 0.95,
    options: [
      {
        id: "back-budget-profile",
        label: "Back the director's budget profile",
        knownTradeoffs: [
          "Protects the club's budget and strengthens executive confidence",
          "Undercuts a coach who invested months in a specific development plan",
        ],
        leftOutcome: "fulfilled",
        rightOutcome: "breached",
        leftValence: 62,
        rightValence: -68,
        fatigueDelta: 1,
        reputationDelta: 1,
      },
      {
        id: "back-academy-pathway",
        label: "Back the coach's development pathway",
        knownTradeoffs: [
          "Preserves a credible pathway and rewards long-term player development",
          "Uses more budget on a prospect whose return may take several seasons",
        ],
        leftOutcome: "breached",
        rightOutcome: "fulfilled",
        leftValence: -54,
        rightValence: 70,
        fatigueDelta: 2,
        reputationDelta: 1,
      },
      {
        id: "fund-milestones",
        label: "Tie funding to development milestones",
        knownTradeoffs: [
          "Preserves the pathway only while agreed progress evidence is delivered",
          "Creates recurring review work and puts your judgment behind every milestone",
        ],
        leftOutcome: "negotiated",
        rightOutcome: "negotiated",
        leftValence: 28,
        rightValence: 34,
        fatigueDelta: 6,
        reputationDelta: 1,
      },
    ],
  },
  {
    id: "organizer-versus-scout-access",
    title: "The Closed Session",
    leftRole: "organizer",
    rightRole: "scout",
    leftPriority: "access",
    rightPriority: "accuracy",
    subjectKind: "player",
    leftRequest: "Respect the local organizer's closed-session rule and rely on their introduction.",
    rightRequest: "Bring a second scout into the session so the assessment has independent scrutiny.",
    deadlineWeeks: 1,
    defaultOptionId: "private-second-look",
    baseWeight: 0.9,
    options: [
      {
        id: "honour-closed-session",
        label: "Honour the closed session",
        knownTradeoffs: [
          "Protects rare local access and the organizer's authority",
          "Leaves the assessment dependent on one observer and one gatekeeper",
        ],
        leftOutcome: "fulfilled",
        rightOutcome: "breached",
        leftValence: 64,
        rightValence: -46,
        fatigueDelta: 0,
        reputationDelta: 0,
      },
      {
        id: "bring-independent-scout",
        label: "Insist on independent scrutiny",
        knownTradeoffs: [
          "Improves evidence quality before a time-sensitive recommendation",
          "Risks losing the organizer's future invitations across the region",
        ],
        leftOutcome: "breached",
        rightOutcome: "fulfilled",
        leftValence: -72,
        rightValence: 56,
        fatigueDelta: 3,
        reputationDelta: 1,
      },
      {
        id: "private-second-look",
        label: "Arrange a private second look",
        knownTradeoffs: [
          "Adds independent evidence without opening the original session",
          "Costs travel time and may arrive after competing scouts have acted",
        ],
        leftOutcome: "negotiated",
        rightOutcome: "negotiated",
        leftValence: 26,
        rightValence: 32,
        fatigueDelta: 7,
        reputationDelta: 1,
      },
    ],
  },
  {
    id: "contact-versus-journalist-discretion",
    title: "The Lead Behind the Story",
    leftRole: "contact",
    rightRole: "journalist",
    leftPriority: "discretion",
    rightPriority: "publicity",
    subjectKind: "player",
    leftRequest: "Keep the source and the local network invisible while the prospect remains exposed.",
    rightRequest: "Confirm enough of the discovery trail to publish a credible public account.",
    deadlineWeeks: 1,
    defaultOptionId: "publish-later",
    baseWeight: 0.85,
    options: [
      {
        id: "protect-source",
        label: "Protect the source completely",
        knownTradeoffs: [
          "Preserves a discreet intelligence network and future private leads",
          "The journalist cannot substantiate the story and may seek another scout",
        ],
        leftOutcome: "fulfilled",
        rightOutcome: "breached",
        leftValence: 74,
        rightValence: -52,
        fatigueDelta: 0,
        reputationDelta: 0,
      },
      {
        id: "confirm-discovery-trail",
        label: "Confirm the discovery trail",
        knownTradeoffs: [
          "Builds visible authority around a successful discovery",
          "Exposes a contact who explicitly relied on your discretion",
        ],
        leftOutcome: "breached",
        rightOutcome: "fulfilled",
        leftValence: -80,
        rightValence: 66,
        fatigueDelta: 2,
        reputationDelta: 3,
      },
      {
        id: "publish-later",
        label: "Agree a retrospective after the window",
        knownTradeoffs: [
          "Protects the live network while reserving a later exclusive",
          "Requires continued coordination and the story may lose immediacy",
        ],
        leftOutcome: "negotiated",
        rightOutcome: "negotiated",
        leftValence: 34,
        rightValence: 24,
        fatigueDelta: 4,
        reputationDelta: 1,
      },
    ],
  },
];

function entityKey(entity: EntityRef): string {
  return `${entity.kind}:${entity.id}`;
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${stableSerialize(record[key])}`,
  ).join(",")}}`;
}

function clamp(value: number, min = -100, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function stakeholderMetricKey(profile: StakeholderProfile): string | undefined {
  if (profile.entity.kind === "contact") return `contact:${profile.entity.id}:trust`;
  if (profile.entity.kind === "employee") return `employee:${profile.entity.id}:morale`;
  if (profile.entity.kind === "rival") return `rival:${profile.entity.id}:aggressiveness`;
  return undefined;
}

function obligationStatus(outcome: ConflictStakeholderOutcome): Exclude<ObligationStatus, "active"> {
  return outcome === "fulfilled" ? "fulfilled" : outcome === "breached" ? "breached" : "waived";
}

function relationshipEffects(input: {
  decisionId: string;
  option: AuthoredConflictOptionDefinition;
  side: "left" | "right";
  profile: StakeholderProfile;
  subject: EntityRef;
  scoutId: string;
  now: GameDate;
  obligationId: string;
}): ConsequenceEffect[] {
  const outcome = input.side === "left" ? input.option.leftOutcome : input.option.rightOutcome;
  const valence = input.side === "left" ? input.option.leftValence : input.option.rightValence;
  const prefix = `${input.decisionId}:${input.option.id}:${input.side}`;
  const metricKey = stakeholderMetricKey(input.profile);
  const metricDelta = Math.round(clamp(valence / 10, -12, 12));
  return [
    {
      id: `effect:${prefix}:obligation`,
      type: "transitionObligation",
      obligationId: input.obligationId,
      status: obligationStatus(outcome),
      note: `${input.option.label}: ${outcome}`,
    },
    {
      id: `effect:${prefix}:memory`,
      type: "addMemory",
      memory: {
        id: `memory:${prefix}:${entityKey(input.profile.entity)}`,
        stakeholder: { ...input.profile.entity },
        subject: { kind: "scout", id: input.scoutId },
        tags: [
          "relationshipConflict",
          input.profile.role,
          outcome,
          input.option.id,
          ...input.profile.priorities,
        ],
        valence,
        intensity: Math.round(clamp(48 + Math.abs(valence) * 0.45, 42, 94)),
        salience: Math.round(clamp(56 + Math.abs(valence) * 0.4, 50, 96)),
        visibility: "stakeholders",
        createdAt: { ...input.now },
        sourceDecisionId: input.decisionId,
        halfLifeWeeks: 104,
        metadata: {
          conflictOptionId: input.option.id,
          subjectKind: input.subject.kind,
          subjectId: input.subject.id,
        },
      },
    },
    ...(metricKey && metricDelta !== 0
      ? [{
          id: `effect:${prefix}:metric`,
          type: "adjustMetric" as const,
          metricKey,
          delta: metricDelta,
          min: 0,
          max: 100,
        }]
      : []),
  ];
}

function optionEffects(input: {
  decisionId: string;
  option: AuthoredConflictOptionDefinition;
  left: StakeholderProfile;
  right: StakeholderProfile;
  subject: EntityRef;
  scoutId: string;
  now: GameDate;
  leftObligationId: string;
  rightObligationId: string;
}): ConsequenceEffect[] {
  const effects = [
    ...relationshipEffects({
      ...input,
      side: "left",
      profile: input.left,
      obligationId: input.leftObligationId,
    }),
    ...relationshipEffects({
      ...input,
      side: "right",
      profile: input.right,
      obligationId: input.rightObligationId,
    }),
  ];
  if (input.option.fatigueDelta !== 0) {
    effects.push({
      id: `effect:${input.decisionId}:${input.option.id}:fatigue`,
      type: "adjustMetric",
      metricKey: "scout:fatigue",
      delta: input.option.fatigueDelta,
      min: 0,
      max: 100,
    });
  }
  if (input.option.reputationDelta !== 0) {
    effects.push({
      id: `effect:${input.decisionId}:${input.option.id}:reputation`,
      type: "adjustMetric",
      metricKey: "scout:reputation",
      delta: input.option.reputationDelta,
      min: 0,
      max: 100,
    });
  }
  return effects;
}

function optionScore(option: AuthoredConflictOptionDefinition): string {
  return [
    option.leftOutcome,
    option.rightOutcome,
    option.leftValence,
    option.rightValence,
    option.fatigueDelta,
    option.reputationDelta,
  ].join(":");
}

export function validateAuthoredRelationshipConflicts(
  definitions: readonly AuthoredRelationshipConflictDefinition[] = CONFLICT_DEFINITIONS,
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const definition of definitions) {
    if (ids.has(definition.id)) errors.push(`Duplicate conflict id: ${definition.id}`);
    ids.add(definition.id);
    if (definition.leftRole === definition.rightRole && definition.leftPriority === definition.rightPriority) {
      errors.push(`${definition.id}: conflict sides are not opposed`);
    }
    if (definition.options.length < 3) errors.push(`${definition.id}: requires at least three options`);
    if (!definition.options.some((option) => option.id === definition.defaultOptionId)) {
      errors.push(`${definition.id}: missing default option ${definition.defaultOptionId}`);
    }
    const optionScores = new Set<string>();
    for (const option of definition.options) {
      if (option.knownTradeoffs.length < 2) errors.push(`${definition.id}/${option.id}: missing tradeoffs`);
      if (
        option.leftOutcome === "fulfilled"
        && option.rightOutcome === "fulfilled"
        && option.fatigueDelta <= 0
        && option.reputationDelta >= 0
      ) {
        errors.push(`${definition.id}/${option.id}: consequence-free dominant option`);
      }
      const score = optionScore(option);
      if (optionScores.has(score)) errors.push(`${definition.id}/${option.id}: equivalent option outcome`);
      optionScores.add(score);
    }
  }
  return errors;
}

export function getAuthoredRelationshipConflictDefinitions(): readonly AuthoredRelationshipConflictDefinition[] {
  return CONFLICT_DEFINITIONS;
}

/**
 * Deterministically bind a real recurring cast to an authored conflict. Profile
 * priorities raise likelihood but do not become a brittle hard gate.
 */
export function selectAuthoredRelationshipConflict(input: {
  rootSeed: string;
  now: GameDate;
  registry: StakeholderProfileRegistry;
  subject: EntityRef;
  excludedEntityKeys?: ReadonlySet<string>;
}): AuthoredConflictCast | undefined {
  const profiles = Object.values(input.registry.profiles)
    .filter((profile) => profile.active !== false);
  const candidates = CONFLICT_DEFINITIONS.flatMap((definition) => {
    if (definition.subjectKind !== input.subject.kind) return [];
    const leftProfiles = profiles.filter((profile) =>
      profile.role === definition.leftRole
      && !input.excludedEntityKeys?.has(entityKey(profile.entity)),
    );
    const rightProfiles = profiles.filter((profile) =>
      profile.role === definition.rightRole
      && !input.excludedEntityKeys?.has(entityKey(profile.entity)),
    );
    return leftProfiles.flatMap((left) => rightProfiles.flatMap((right) => {
      if (entityKey(left.entity) === entityKey(right.entity)) return [];
      const priorityMultiplier = (left.priorities.includes(definition.leftPriority) ? 1.5 : 1)
        * (right.priorities.includes(definition.rightPriority) ? 1.5 : 1);
      return [{
        definition,
        left,
        right,
        subject: { ...input.subject },
        selectionWeight: definition.baseWeight * priorityMultiplier,
      }];
    }));
  }).sort((left, right) =>
    left.definition.id.localeCompare(right.definition.id)
    || entityKey(left.left.entity).localeCompare(entityKey(right.left.entity))
    || entityKey(left.right.entity).localeCompare(entityKey(right.right.entity)),
  );
  const total = candidates.reduce((sum, candidate) => sum + candidate.selectionWeight, 0);
  if (total <= 0) return undefined;
  const rng = createNamedRNG(
    input.rootSeed,
    "authored-relationship-conflict",
    input.now.season,
    input.now.week,
    input.subject.kind,
    input.subject.id,
  );
  let threshold = rng.next() * total;
  for (const candidate of candidates) {
    threshold -= candidate.selectionWeight;
    if (threshold <= 0) return candidate;
  }
  return candidates.at(-1);
}

export function materializeAuthoredRelationshipConflict(input: {
  id: string;
  cast: AuthoredConflictCast;
  scoutId: string;
  now: GameDate;
  deadlineAt: GameDate;
  outcomeRoll: number;
}): MaterializedRelationshipConflict {
  const { definition, left, right, subject } = input.cast;
  const leftObligationId = `obligation:${input.id}:left:${entityKey(left.entity)}`;
  const rightObligationId = `obligation:${input.id}:right:${entityKey(right.entity)}`;
  const commonObligation = {
    debtor: { kind: "scout", id: input.scoutId },
    status: "active" as const,
    createdAt: { ...input.now },
    dueAt: { ...input.deadlineAt },
    sourceDecisionId: input.id,
  };
  const offeredObligations: Record<string, Obligation> = {
    [leftObligationId]: {
      ...commonObligation,
      id: leftObligationId,
      creditor: { ...left.entity },
      kind: `${definition.id}:leftRequest`,
      terms: definition.leftRequest,
      metadata: { conflict: true, stakeKey: "left", subjectId: subject.id },
    },
    [rightObligationId]: {
      ...commonObligation,
      id: rightObligationId,
      creditor: { ...right.entity },
      kind: `${definition.id}:rightRequest`,
      terms: definition.rightRequest,
      metadata: { conflict: true, stakeKey: "right", subjectId: subject.id },
    },
  };
  const options: DecisionOption[] = definition.options.map((option) => ({
    id: option.id,
    label: option.label,
    knownTradeoffs: [...option.knownTradeoffs],
    immediateEffects: optionEffects({
      decisionId: input.id,
      option,
      left,
      right,
      subject,
      scoutId: input.scoutId,
      now: input.now,
      leftObligationId,
      rightObligationId,
    }),
    scheduledConsequences: [],
  }));
  return {
    offeredObligations,
    decision: {
      id: input.id,
      source: { kind: "relationshipConflict", id: definition.id },
      offeredAt: { ...input.now },
      deadlineAt: { ...input.deadlineAt },
      status: "offered",
      visibility: "stakeholders",
      stakeholders: [{ ...left.entity }, { ...right.entity }],
      options,
      defaultOptionId: definition.defaultOptionId,
      outcomeRoll: input.outcomeRoll,
      consequenceIds: [],
      metadata: {
        title: definition.title,
        premise: `${left.name} asks you to ${definition.leftRequest.charAt(0).toLowerCase()}${definition.leftRequest.slice(1)} ${right.name} asks you to ${definition.rightRequest.charAt(0).toLowerCase()}${definition.rightRequest.slice(1)}`,
        relatedPlayerId: subject.kind === "player" ? subject.id : "",
        leftPriority: definition.leftPriority,
        rightPriority: definition.rightPriority,
        semanticSignature: `relationship:${definition.leftRole}:${definition.rightRole}:${definition.leftPriority}:${definition.rightPriority}`,
      },
    },
  };
}

/**
 * Atomically place the two opposed promises and their decision in the existing
 * consequence engine. The obligation maps are merged only after the decision
 * registry accepts the id, so a conflicting retry cannot leave orphaned debt.
 */
export function registerMaterializedRelationshipConflict(
  state: ConsequenceEngineState,
  materialized: MaterializedRelationshipConflict,
): RelationshipConflictRegistrationResult {
  const obligationIds = Object.keys(materialized.offeredObligations).sort();
  for (const obligationId of obligationIds) {
    const existing = state.obligations[obligationId];
    const offered = materialized.offeredObligations[obligationId];
    if (existing && stableSerialize(existing) !== stableSerialize(offered)) {
      return {
        state,
        changed: false,
        error: `Obligation id conflict: ${obligationId}`,
        decisionId: materialized.decision.id,
        obligationIds,
      };
    }
  }

  const registered = registerDecision(state, materialized.decision);
  if (registered.error) {
    return {
      ...registered,
      decisionId: materialized.decision.id,
      obligationIds,
    };
  }

  const missingObligations = obligationIds.filter((id) => !registered.state.obligations[id]);
  if (missingObligations.length === 0) {
    return {
      ...registered,
      decisionId: materialized.decision.id,
      obligationIds,
    };
  }
  return {
    state: {
      ...registered.state,
      obligations: {
        ...registered.state.obligations,
        ...materialized.offeredObligations,
      },
    },
    changed: true,
    decisionId: materialized.decision.id,
    obligationIds,
  };
}
