import type { GameState } from "@/engine/core/types";
import { addGameWeeksWithSeasonLength } from "@/engine/core/gameDate";
import { createNamedRNG } from "@/engine/run";
import { isAccessAgreementActive } from "./accessAgreements";
import { registerDecision, type StateMutationResult } from "./decisionLedger";
import type {
  ConsequenceCondition,
  ConsequenceEffect,
  ConsequenceEngineState,
  ConsequenceVisibility,
  DecisionOption,
  DecisionRecord,
  EntityRef,
  GameDate,
  JsonValue,
  Obligation,
  ObligationStatus,
  ScheduledConsequenceTemplate,
  WorldFact,
} from "./types";
import type {
  StakeholderPriority,
  StakeholderProfile,
  StakeholderProfileRegistry,
  StakeholderProfileRole,
} from "./stakeholderProfiles";

export type RelationshipFrontStructure =
  | "ultimatum"
  | "favor"
  | "confidentiality"
  | "verificationDelay"
  | "publicPrivate"
  | "delegation"
  | "bluff";

export type ConflictStakeholderOutcome = "fulfilled" | "breached" | "negotiated";
export type AuthoredConflictEffectTarget = "left" | "right" | "scout";
export type AuthoredConflictMetric =
  | "relationship"
  | "trust"
  | "loyalty"
  | "reliability"
  | "morale"
  | "aggressiveness"
  | "reputation"
  | "fatigue"
  | "clubTrust"
  | "specializationReputation"
  | "persuasion";

interface AuthoredConflictMetricEffectDefinition {
  type: "metric";
  target: AuthoredConflictEffectTarget;
  metric: AuthoredConflictMetric;
  delta: number;
  min?: number;
  max?: number;
}

interface AuthoredConflictMemoryEffectDefinition {
  type: "memory";
  stakeholder: "left" | "right";
  tags: readonly string[];
  valence: number;
  intensity?: number;
  salience?: number;
  visibility?: ConsequenceVisibility;
  metadata?: Record<string, JsonValue>;
}

interface AuthoredConflictFactEffectDefinition {
  type: "fact";
  key: string;
  kind: string;
  value: JsonValue;
  visibility?: ConsequenceVisibility;
  subject?: "subject" | "left" | "right" | "scout";
  metadata?: Record<string, JsonValue>;
}

interface AuthoredConflictObligationEffectDefinition {
  type: "obligation";
  key: string;
  creditor: "left" | "right";
  kind: string;
  terms: string;
  dueWeeks?: number;
  metadata?: Record<string, JsonValue>;
}

type AuthoredConflictFollowUpEffectDefinition =
  | AuthoredConflictMetricEffectDefinition
  | AuthoredConflictMemoryEffectDefinition
  | AuthoredConflictFactEffectDefinition
  | AuthoredConflictObligationEffectDefinition;

interface AuthoredConflictFactExistsCondition {
  type: "factExists";
  factKey: string;
  exists?: boolean;
}

export interface AuthoredConflictFollowUpDefinition {
  id: string;
  delayWeeks: number;
  probability?: number;
  tags?: readonly string[];
  conditions?: readonly AuthoredConflictFactExistsCondition[];
  effects: readonly AuthoredConflictFollowUpEffectDefinition[];
}

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
  leftTags?: readonly string[];
  rightTags?: readonly string[];
  followUps?: readonly AuthoredConflictFollowUpDefinition[];
}

export interface RelationshipConflictStateContext {
  state: GameState;
  now: GameDate;
  subject: EntityRef;
  left: StakeholderProfile;
  right: StakeholderProfile;
  activeSubjectAgreementCount: number;
  leftAgreementCount: number;
  rightAgreementCount: number;
  leftReliability?: number;
  rightReliability?: number;
  sameEnsembleCount: number;
  sameFrontFamilyCount: number;
}

export interface AuthoredRelationshipConflictDefinition {
  id: string;
  title: string;
  frontFamilyId: string;
  recurrenceName: string;
  frontStructure: RelationshipFrontStructure;
  quietEligible?: boolean;
  leftRole: StakeholderProfileRole;
  rightRole: StakeholderProfileRole;
  leftPriority: StakeholderPriority;
  rightPriority: StakeholderPriority;
  subjectKind: string;
  leftRequest: string;
  rightRequest: string;
  leftObligationKind?: string;
  rightObligationKind?: string;
  deadlineWeeks: number;
  defaultOptionId: string;
  baseWeight: number;
  stateWeight?: (context: RelationshipConflictStateContext) => number;
  options: readonly AuthoredConflictOptionDefinition[];
}

export interface AuthoredConflictCast {
  definition: AuthoredRelationshipConflictDefinition;
  left: StakeholderProfile;
  right: StakeholderProfile;
  subject: EntityRef;
  selectionWeight: number;
}

export interface RelationshipConflictFrontMetadata {
  ensembleId: string;
  frontFamilyId: string;
  frontStructure: RelationshipFrontStructure;
  recurrenceName: string;
  recurrenceIndex: number;
  subject: EntityRef;
  leftStakeholderKey: string;
  rightStakeholderKey: string;
}

export interface MaterializedRelationshipConflict {
  decision: DecisionRecord;
  offeredObligations: Record<string, Obligation>;
  front: RelationshipConflictFrontMetadata;
}

export interface RelationshipConflictRegistrationResult extends StateMutationResult {
  decisionId: string;
  obligationIds: string[];
}

function metric(
  target: AuthoredConflictEffectTarget,
  key: AuthoredConflictMetric,
  delta: number,
  min?: number,
  max?: number,
): AuthoredConflictMetricEffectDefinition {
  return { type: "metric", target, metric: key, delta, min, max };
}

function memory(
  stakeholder: "left" | "right",
  tags: readonly string[],
  valence: number,
  metadata?: Record<string, JsonValue>,
): AuthoredConflictMemoryEffectDefinition {
  return { type: "memory", stakeholder, tags, valence, metadata };
}

function fact(
  key: string,
  kind: string,
  value: JsonValue,
  subject: AuthoredConflictFactEffectDefinition["subject"] = "subject",
  metadata?: Record<string, JsonValue>,
): AuthoredConflictFactEffectDefinition {
  return { type: "fact", key, kind, value, subject, metadata };
}

function obligation(
  key: string,
  creditor: "left" | "right",
  kind: string,
  terms: string,
  dueWeeks?: number,
  metadata?: Record<string, JsonValue>,
): AuthoredConflictObligationEffectDefinition {
  return { type: "obligation", key, creditor, kind, terms, dueWeeks, metadata };
}

function recurrenceWeight(context: RelationshipConflictStateContext): number {
  return 1
    + Math.min(context.sameEnsembleCount, 2) * 0.18
    + Math.min(context.sameFrontFamilyCount, 2) * 0.08;
}

function liveAgreementWeight(
  context: RelationshipConflictStateContext,
  multiplier = 1.2,
): number {
  return context.activeSubjectAgreementCount
    + context.leftAgreementCount
    + context.rightAgreementCount
    > 0
    ? multiplier
    : 1;
}

function lowReliabilityWeight(
  reliability: number | undefined,
  threshold = 68,
  multiplier = 1.25,
): number {
  return reliability !== undefined && reliability <= threshold ? multiplier : 1;
}

const CONFLICT_DEFINITIONS: readonly AuthoredRelationshipConflictDefinition[] = [
  {
    id: "family-versus-journalist-privacy",
    title: "The Family and the Deadline",
    frontFamilyId: "family-journalist-media",
    recurrenceName: "The Embargo Triangle",
    frontStructure: "publicPrivate",
    quietEligible: true,
    leftRole: "family",
    rightRole: "journalist",
    leftPriority: "privacy",
    rightPriority: "exclusivity",
    subjectKind: "player",
    leftRequest: "Keep the prospect and family circumstances out of public coverage.",
    rightRequest: "Give a clear, attributable answer before the publication deadline.",
    leftObligationKind: "familyPrivacy",
    rightObligationKind: "mediaAccess",
    deadlineWeeks: 1,
    defaultOptionId: "protect-family",
    baseWeight: 1.15,
    stateWeight: (context) => recurrenceWeight(context) * liveAgreementWeight(context, 1.16),
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
        leftTags: ["familyPrivacy", "protectedFamily", "trustedUnderPressure"],
        rightTags: ["mediaAccess", "promiseBroken", "sourceRelationship"],
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
        leftTags: ["familyPrivacy", "exposedFamily", "promiseBroken"],
        rightTags: ["mediaAccess", "reciprocity", "exclusiveAccess"],
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
        leftTags: ["familyPrivacy", "negotiatedBoundary", "goodFaithAdvice"],
        rightTags: ["mediaAccess", "negotiatedBoundary", "reciprocity"],
      },
    ],
  },
  {
    id: "employee-versus-agent-credit",
    title: "Who Owns the Discovery?",
    frontFamilyId: "credit-chain",
    recurrenceName: "The Attribution Fight",
    frontStructure: "publicPrivate",
    leftRole: "employee",
    rightRole: "agent",
    leftPriority: "credit",
    rightPriority: "discretion",
    subjectKind: "player",
    leftRequest: "Credit the employee publicly for the weeks of work behind the discovery.",
    rightRequest: "Keep the introduction private and preserve the agent's control of access.",
    leftObligationKind: "employeeCredit",
    rightObligationKind: "sourceAttribution",
    deadlineWeeks: 2,
    defaultOptionId: "document-shared-credit",
    baseWeight: 1,
    stateWeight: (context) => recurrenceWeight(context),
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
        leftTags: ["employeeCredit", "creditedWork", "leadership"],
        rightTags: ["sourceAttribution", "creditDispute", "promiseBroken"],
        followUps: [{
          id: "record-public-credit",
          delayWeeks: 2,
          tags: ["career-surface", "leadership"],
          effects: [
            metric("scout", "persuasion", 1),
            metric("right", "loyalty", -4),
          ],
        }],
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
        leftTags: ["employeeCredit", "creditDenied", "leadership"],
        rightTags: ["sourceAttribution", "reciprocity", "promiseKept"],
        followUps: [{
          id: "quiet-network-balance",
          delayWeeks: 2,
          tags: ["career-surface", "discretion"],
          effects: [
            metric("left", "morale", -4),
            metric("right", "loyalty", 5),
          ],
        }],
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
        leftTags: ["employeeCredit", "sharedCredit", "leadership"],
        rightTags: ["sourceAttribution", "sharedCredit", "negotiatedBoundary"],
        followUps: [{
          id: "private-attribution-discipline",
          delayWeeks: 2,
          tags: ["career-surface", "documentation"],
          effects: [
            metric("scout", "persuasion", 1),
            metric("left", "morale", 2),
            metric("right", "loyalty", 2),
          ],
        }],
      },
    ],
  },
  {
    id: "rival-versus-agent-territory",
    title: "A Ceasefire With a Price",
    frontFamilyId: "territory-ceasefire",
    recurrenceName: "The Boundary War",
    frontStructure: "ultimatum",
    leftRole: "rival",
    rightRole: "agent",
    leftPriority: "territory",
    rightPriority: "access",
    subjectKind: "player",
    leftRequest: "Respect a narrow territorial ceasefire around the contested prospect.",
    rightRequest: "Remain in the race after the agent opened the introduction to you.",
    leftObligationKind: "ceasefireBoundary",
    rightObligationKind: "agentExclusivity",
    deadlineWeeks: 1,
    defaultOptionId: "trade-boundary",
    baseWeight: 0.9,
    stateWeight: (context) => recurrenceWeight(context),
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
        leftTags: ["rivalry", "ceasefire", "negotiatedBoundary"],
        rightTags: ["agentExclusivity", "promiseBroken", "abandonedLead"],
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
        leftTags: ["rivalry", "ceasefireRejected", "directCompetition"],
        rightTags: ["agentExclusivity", "trustedUnderPressure", "promiseKept"],
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
        leftTags: ["rivalry", "negotiatedBoundary", "reciprocity"],
        rightTags: ["agentExclusivity", "negotiatedBoundary", "goodFaithAdvice"],
      },
    ],
  },
  {
    id: "manager-versus-family-readiness",
    title: "Ready Now, or Ready Properly?",
    frontFamilyId: "pathway-acceleration",
    recurrenceName: "The Pathway Clock",
    frontStructure: "ultimatum",
    leftRole: "manager",
    rightRole: "family",
    leftPriority: "speed",
    rightPriority: "welfare",
    subjectKind: "player",
    leftRequest: "Back an accelerated first-team pathway while the squad has an opening.",
    rightRequest: "Protect education, adaptation and a slower development plan.",
    leftObligationKind: "fastTrackPathway",
    rightObligationKind: "playerWelfare",
    deadlineWeeks: 2,
    defaultOptionId: "staged-pathway",
    baseWeight: 0.85,
    stateWeight: (context) => recurrenceWeight(context) * (context.state.scout.currentClubId ? 1.08 : 1),
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
        leftTags: ["meetingPositive", "speed", "clubFit"],
        rightTags: ["familyPrivacy", "promiseBroken", "recklessPlayerRisk"],
        followUps: [{
          id: "pressure-on-judgment",
          delayWeeks: 3,
          tags: ["career-surface", "pathway"],
          effects: [
            metric("scout", "clubTrust", 2),
            metric("scout", "specializationReputation", -1),
          ],
        }],
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
        leftTags: ["meetingNegative", "ignoredDeadline", "professionalChallenge"],
        rightTags: ["familyPrivacy", "playerWelfare", "independentAdvice"],
        followUps: [{
          id: "family-backs-your-patience",
          delayWeeks: 3,
          tags: ["career-surface", "pathway"],
          effects: [
            metric("scout", "clubTrust", -2),
            metric("scout", "specializationReputation", 2),
          ],
        }],
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
        leftTags: ["meetingPositive", "evidencePresented", "pathway"],
        rightTags: ["familyPrivacy", "playerWelfare", "goodFaithAdvice"],
        followUps: [{
          id: "staged-pathway-review",
          delayWeeks: 4,
          tags: ["career-surface", "pathway"],
          effects: [
            metric("scout", "clubTrust", 3),
            metric("scout", "specializationReputation", 2),
          ],
        }],
      },
    ],
  },
  {
    id: "director-versus-coach-budget",
    title: "One Place, Two Promises",
    frontFamilyId: "budget-proof",
    recurrenceName: "The Milestone Dossier",
    frontStructure: "verificationDelay",
    quietEligible: true,
    leftRole: "director",
    rightRole: "coach",
    leftPriority: "financialSecurity",
    rightPriority: "development",
    subjectKind: "player",
    leftRequest: "Recommend the cheaper, saleable profile that keeps the recruitment budget intact.",
    rightRequest: "Back the slower-developing prospect whose pathway the academy has already built.",
    leftObligationKind: "budgetDiscipline",
    rightObligationKind: "developmentPathway",
    deadlineWeeks: 2,
    defaultOptionId: "fund-milestones",
    baseWeight: 0.95,
    stateWeight: (context) => recurrenceWeight(context) * (context.state.scout.currentClubId ? 1.16 : 0.95),
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
        leftTags: ["costDiscipline", "meetingPositive"],
        rightTags: ["playerWelfare", "promiseBroken", "pathway"],
        followUps: [{
          id: "budget-case-held",
          delayWeeks: 4,
          tags: ["career-surface", "budget"],
          effects: [
            metric("scout", "clubTrust", 2),
          ],
        }],
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
        leftTags: ["costDiscipline", "meetingNegative"],
        rightTags: ["playerWelfare", "pathway", "goodFaithAdvice"],
        followUps: [{
          id: "development-patience",
          delayWeeks: 4,
          tags: ["career-surface", "budget"],
          effects: [
            metric("scout", "clubTrust", -2),
            metric("scout", "specializationReputation", 2),
          ],
        }],
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
        leftTags: ["costDiscipline", "meetingPositive", "evidencePresented"],
        rightTags: ["pathway", "goodFaithAdvice", "development"],
        followUps: [{
          id: "milestone-review-held",
          delayWeeks: 5,
          tags: ["career-surface", "budget"],
          effects: [
            metric("scout", "clubTrust", 3),
            metric("scout", "specializationReputation", 1),
          ],
        }],
      },
    ],
  },
  {
    id: "organizer-versus-scout-access",
    title: "The Closed Session",
    frontFamilyId: "closed-session-proof",
    recurrenceName: "The Closed Session File",
    frontStructure: "verificationDelay",
    quietEligible: true,
    leftRole: "organizer",
    rightRole: "scout",
    leftPriority: "access",
    rightPriority: "accuracy",
    subjectKind: "player",
    leftRequest: "Respect the local organizer's closed-session rule and rely on their introduction.",
    rightRequest: "Bring a second scout into the session so the assessment has independent scrutiny.",
    leftObligationKind: "sessionAccess",
    rightObligationKind: "independentVerification",
    deadlineWeeks: 1,
    defaultOptionId: "private-second-look",
    baseWeight: 0.9,
    stateWeight: (context) => recurrenceWeight(context) * liveAgreementWeight(context, 1.22),
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
        leftTags: ["exclusiveAccess", "reciprocity", "confidentiality"],
        rightTags: ["askedForVerification", "promiseBroken", "accuracy"],
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
        leftTags: ["exclusiveAccess", "promiseBroken", "sourceRelationship"],
        rightTags: ["askedForVerification", "evidencePresented", "promiseKept"],
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
        leftTags: ["exclusiveAccess", "goodFaithAdvice", "confidentiality"],
        rightTags: ["askedForVerification", "caseVerificationRequested", "accuracy"],
        followUps: [{
          id: "second-look-validates-network",
          delayWeeks: 2,
          tags: ["career-surface", "access"],
          effects: [
            metric("left", "reliability", 6),
            metric("scout", "specializationReputation", 1),
          ],
        }],
      },
    ],
  },
  {
    id: "contact-versus-journalist-discretion",
    title: "The Lead Behind the Story",
    frontFamilyId: "source-protection",
    recurrenceName: "The Protected Lead",
    frontStructure: "confidentiality",
    quietEligible: true,
    leftRole: "contact",
    rightRole: "journalist",
    leftPriority: "discretion",
    rightPriority: "publicity",
    subjectKind: "player",
    leftRequest: "Keep the source and the local network invisible while the prospect remains exposed.",
    rightRequest: "Confirm enough of the discovery trail to publish a credible public account.",
    leftObligationKind: "confidentiality",
    rightObligationKind: "mediaAccess",
    deadlineWeeks: 1,
    defaultOptionId: "publish-later",
    baseWeight: 0.85,
    stateWeight: (context) => recurrenceWeight(context) * liveAgreementWeight(context, 1.24),
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
        leftTags: ["confidentiality", "promiseKept", "trustedUnderPressure"],
        rightTags: ["mediaAccess", "promiseBroken", "sourceRelationship"],
        followUps: [{
          id: "source-keeps-you-inside",
          delayWeeks: 2,
          tags: ["career-surface", "access"],
          effects: [
            metric("left", "loyalty", 6),
            metric("left", "reliability", 4),
          ],
        }],
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
        leftTags: ["confidentiality", "informationLeak", "promiseBroken"],
        rightTags: ["mediaAccess", "exclusiveAccess", "reciprocity"],
        followUps: [{
          id: "network-reassesses-you",
          delayWeeks: 2,
          tags: ["career-surface", "access"],
          effects: [
            metric("left", "trust", -8),
            metric("left", "loyalty", -6),
          ],
        }],
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
        leftTags: ["confidentiality", "goodFaithAdvice", "reciprocity"],
        rightTags: ["mediaAccess", "negotiatedBoundary", "exclusiveAccess"],
        followUps: [{
          id: "retrospective-lands-cleanly",
          delayWeeks: 3,
          tags: ["career-surface", "access"],
          effects: [
            metric("left", "reliability", 2),
            metric("scout", "reputation", 1),
          ],
        }],
      },
    ],
  },
  {
    id: "contact-versus-manager-proof-chain",
    title: "The Unverified Call",
    frontFamilyId: "proof-chain",
    recurrenceName: "The Proof Chain",
    frontStructure: "verificationDelay",
    quietEligible: true,
    leftRole: "contact",
    rightRole: "manager",
    leftPriority: "discretion",
    rightPriority: "accuracy",
    subjectKind: "player",
    leftRequest: "Move on a private local read before the wider market sees the player.",
    rightRequest: "Bring verified evidence before the manager attaches a pathway to the prospect.",
    leftObligationKind: "confidentiality",
    rightObligationKind: "independentVerification",
    deadlineWeeks: 1,
    defaultOptionId: "stage-quiet-verification",
    baseWeight: 0.92,
    stateWeight: (context) =>
      recurrenceWeight(context)
      * liveAgreementWeight(context, 1.12)
      * lowReliabilityWeight(context.leftReliability, 74, 1.18),
    options: [
      {
        id: "back-source-now",
        label: "Back the source now",
        knownTradeoffs: [
          "Keeps first-mover speed and honors the local contact's risk",
          "The manager is forced to trust your conviction before the evidence is complete",
        ],
        leftOutcome: "fulfilled",
        rightOutcome: "breached",
        leftValence: 62,
        rightValence: -68,
        fatigueDelta: 2,
        reputationDelta: 1,
        leftTags: ["exclusiveAccess", "trustedUnderPressure", "promiseKept"],
        rightTags: ["askedForVerification", "meetingNegative", "professionalChallenge"],
        followUps: [{
          id: "unverified-call-lingers",
          delayWeeks: 2,
          tags: ["career-surface", "verification"],
          effects: [
            metric("scout", "clubTrust", -4),
            metric("left", "reliability", -5),
          ],
        }],
      },
      {
        id: "delay-for-proof",
        label: "Delay until proof is collected",
        knownTradeoffs: [
          "Gives the manager evidence strong enough to act on",
          "Signals to the contact that private urgency does not automatically move you",
        ],
        leftOutcome: "breached",
        rightOutcome: "fulfilled",
        leftValence: -50,
        rightValence: 70,
        fatigueDelta: 3,
        reputationDelta: 0,
        leftTags: ["exclusiveAccess", "promiseBroken", "sourceRelationship"],
        rightTags: ["askedForVerification", "meetingPositive", "evidencePresented"],
        followUps: [{
          id: "proof-arrives-cleanly",
          delayWeeks: 2,
          tags: ["career-surface", "verification"],
          effects: [
            metric("left", "reliability", 8),
            metric("scout", "clubTrust", 4),
            metric("scout", "specializationReputation", 2),
          ],
        }],
      },
      {
        id: "stage-quiet-verification",
        label: "Stage a quiet verification step",
        knownTradeoffs: [
          "Keeps the source protected while still building enough proof to brief upward",
          "Costs time, travel, and a second layer of discretion management",
        ],
        leftOutcome: "negotiated",
        rightOutcome: "negotiated",
        leftValence: 26,
        rightValence: 34,
        fatigueDelta: 5,
        reputationDelta: 1,
        leftTags: ["exclusiveAccess", "confidentiality", "goodFaithAdvice"],
        rightTags: ["askedForVerification", "caseVerificationRequested", "evidencePresented"],
        followUps: [{
          id: "quiet-proof-chain-holds",
          delayWeeks: 2,
          tags: ["career-surface", "verification"],
          effects: [
            metric("left", "reliability", 4),
            metric("scout", "clubTrust", 2),
            metric("scout", "persuasion", 1),
          ],
        }],
      },
    ],
  },
  {
    id: "agent-versus-director-auction-bluff",
    title: "The Bid That Might Not Exist",
    frontFamilyId: "auction-pressure",
    recurrenceName: "The Auction Pressure Loop",
    frontStructure: "bluff",
    leftRole: "agent",
    rightRole: "director",
    leftPriority: "speed",
    rightPriority: "financialSecurity",
    subjectKind: "player",
    leftRequest: "Move now because another club is ready to close the deal.",
    rightRequest: "Do not escalate the price until the competing bid is verified.",
    leftObligationKind: "agentExclusivity",
    rightObligationKind: "budgetDiscipline",
    deadlineWeeks: 1,
    defaultOptionId: "force-written-window",
    baseWeight: 0.88,
    stateWeight: (context) =>
      recurrenceWeight(context)
      * lowReliabilityWeight(context.leftReliability, 72, 1.35)
      * (context.sameFrontFamilyCount > 0 ? 1.12 : 1),
    options: [
      {
        id: "back-agent-timeline",
        label: "Back the agent's timeline",
        knownTradeoffs: [
          "Keeps the relationship warm if the market pressure is real",
          "If the pressure was leverage theater, your club judgment takes the hit",
        ],
        leftOutcome: "fulfilled",
        rightOutcome: "breached",
        leftValence: 68,
        rightValence: -72,
        fatigueDelta: 4,
        reputationDelta: 1,
        leftTags: ["agentExclusivity", "trustedUnderPressure", "promiseKept"],
        rightTags: ["costDiscipline", "meetingNegative", "professionalChallenge"],
        followUps: [
          {
            id: "a-auction-was-real",
            delayWeeks: 2,
            probability: 0.45,
            tags: ["bluff", "verified"],
            effects: [
              fact("auction-real", "RelationshipFrontOutcome", "validated"),
              metric("left", "trust", 4),
              metric("scout", "clubTrust", 3),
              metric("scout", "specializationReputation", 1),
              memory("right", ["meetingPositive", "evidencePresented", "bluff", "verified"], 22),
            ],
          },
          {
            id: "b-auction-was-air",
            delayWeeks: 2,
            tags: ["bluff", "exposed"],
            conditions: [{ type: "factExists", factKey: "auction-real", exists: false }],
            effects: [
              metric("left", "reliability", -12),
              metric("scout", "clubTrust", -7),
              metric("scout", "persuasion", -1),
              memory("left", ["agentExclusivity", "bluffExposed", "promiseBroken"], -40),
              memory("right", ["meetingNegative", "bluffExposed", "professionalChallenge"], -52),
            ],
          },
        ],
      },
      {
        id: "call-the-bluff",
        label: "Call the bluff",
        knownTradeoffs: [
          "Protects the club from price pressure if the competing bid was leverage",
          "If the bid was genuine, the agent will treat you as the one who blinked",
        ],
        leftOutcome: "breached",
        rightOutcome: "fulfilled",
        leftValence: -70,
        rightValence: 62,
        fatigueDelta: 1,
        reputationDelta: 0,
        leftTags: ["agentExclusivity", "promiseBroken", "abandonedLead"],
        rightTags: ["costDiscipline", "meetingPositive", "goodFaithAdvice"],
        followUps: [
          {
            id: "a-bluff-called-correctly",
            delayWeeks: 2,
            probability: 0.55,
            tags: ["bluff", "verified"],
            effects: [
              fact("bluff-called", "RelationshipFrontOutcome", "contained"),
              metric("left", "reliability", -10),
              metric("scout", "clubTrust", 4),
              metric("scout", "persuasion", 1),
              memory("right", ["meetingPositive", "costDiscipline", "verified"], 24),
            ],
          },
          {
            id: "b-bid-was-live",
            delayWeeks: 2,
            tags: ["bluff", "missed-window"],
            conditions: [{ type: "factExists", factKey: "bluff-called", exists: false }],
            effects: [
              metric("left", "trust", -6),
              metric("scout", "clubTrust", -3),
              metric("scout", "specializationReputation", -1),
              memory("left", ["agentExclusivity", "abandonedLead", "promiseBroken"], -46),
            ],
          },
        ],
      },
      {
        id: "force-written-window",
        label: "Force a written window and reassess",
        knownTradeoffs: [
          "Creates a formal checkpoint instead of accepting pure pressure",
          "May irritate both sides because you refuse to move at the speed either prefers",
        ],
        leftOutcome: "negotiated",
        rightOutcome: "negotiated",
        leftValence: 30,
        rightValence: 28,
        fatigueDelta: 4,
        reputationDelta: 0,
        leftTags: ["agentExclusivity", "negotiatedBoundary", "goodFaithAdvice"],
        rightTags: ["costDiscipline", "evidencePresented", "meetingPositive"],
        followUps: [{
          id: "written-window-restores-balance",
          delayWeeks: 2,
          tags: ["career-surface", "bluff"],
          effects: [
            metric("left", "reliability", 4),
            metric("scout", "clubTrust", 2),
            metric("scout", "persuasion", 1),
          ],
        }],
      },
    ],
  },
  {
    id: "employee-versus-director-delegation",
    title: "Whose Eyes Count?",
    frontFamilyId: "delegated-verification",
    recurrenceName: "The Delegated Check",
    frontStructure: "delegation",
    leftRole: "employee",
    rightRole: "director",
    leftPriority: "autonomy",
    rightPriority: "financialSecurity",
    subjectKind: "player",
    leftRequest: "Send the employee for one more live check before you brief the director upward.",
    rightRequest: "Hold the budget line and back the current call without another trip.",
    leftObligationKind: "employeeCredit",
    rightObligationKind: "budgetDiscipline",
    deadlineWeeks: 1,
    defaultOptionId: "delegate-with-limit",
    baseWeight: 0.82,
    stateWeight: (context) =>
      recurrenceWeight(context)
      * (context.state.finances?.employees.length ? 1.18 : 0.8),
    options: [
      {
        id: "delegate-live-check",
        label: "Delegate one more live check",
        knownTradeoffs: [
          "Builds staff ownership and gives the director a stronger evidence chain",
          "Costs time, money, and temporarily shifts responsibility away from your own eyes",
        ],
        leftOutcome: "fulfilled",
        rightOutcome: "breached",
        leftValence: 66,
        rightValence: -48,
        fatigueDelta: -2,
        reputationDelta: 0,
        leftTags: ["employeeCredit", "creditedWork", "delegation"],
        rightTags: ["costDiscipline", "professionalChallenge", "delegation"],
        followUps: [{
          id: "delegation-strengthens-case",
          delayWeeks: 2,
          tags: ["career-surface", "delegation"],
          effects: [
            metric("left", "morale", 6),
            metric("scout", "clubTrust", 3),
            metric("scout", "persuasion", 1),
          ],
        }],
      },
      {
        id: "protect-budget-call",
        label: "Protect the budget and move now",
        knownTradeoffs: [
          "Shows the director you can make a call without expanding cost",
          "Tells the employee their verification instincts stop where budget pressure begins",
        ],
        leftOutcome: "breached",
        rightOutcome: "fulfilled",
        leftValence: -64,
        rightValence: 56,
        fatigueDelta: 0,
        reputationDelta: 0,
        leftTags: ["employeeCredit", "creditDenied", "leadership"],
        rightTags: ["costDiscipline", "meetingPositive", "goodFaithAdvice"],
        followUps: [{
          id: "staff-reads-the-message",
          delayWeeks: 2,
          tags: ["career-surface", "delegation"],
          effects: [
            metric("left", "morale", -5),
            metric("scout", "clubTrust", 1),
          ],
        }],
      },
      {
        id: "delegate-with-limit",
        label: "Delegate within a fixed budget window",
        knownTradeoffs: [
          "Keeps the employee involved while putting a visible ceiling on the extra spend",
          "Adds leadership work because you now own both the budget line and the delegated brief",
        ],
        leftOutcome: "negotiated",
        rightOutcome: "negotiated",
        leftValence: 28,
        rightValence: 30,
        fatigueDelta: -1,
        reputationDelta: 0,
        leftTags: ["employeeCredit", "sharedCredit", "delegation"],
        rightTags: ["costDiscipline", "delegation", "goodFaithAdvice"],
        followUps: [{
          id: "bounded-delegation-pays-off",
          delayWeeks: 2,
          tags: ["career-surface", "delegation"],
          effects: [
            metric("left", "morale", 2),
            metric("scout", "clubTrust", 2),
            metric("scout", "persuasion", 1),
          ],
        }],
      },
    ],
  },
  {
    id: "organizer-versus-rival-reciprocity",
    title: "A Favour the Region Will Remember",
    frontFamilyId: "local-peace",
    recurrenceName: "The Local Peace",
    frontStructure: "favor",
    quietEligible: true,
    leftRole: "organizer",
    rightRole: "rival",
    leftPriority: "access",
    rightPriority: "territory",
    subjectKind: "player",
    leftRequest: "Repay a local favor by cooling the chase around one protected prospect.",
    rightRequest: "Treat the region like open territory and keep applying pressure.",
    leftObligationKind: "sessionAccess",
    rightObligationKind: "ceasefireBoundary",
    deadlineWeeks: 1,
    defaultOptionId: "swap-future-favor",
    baseWeight: 0.8,
    stateWeight: (context) =>
      recurrenceWeight(context) * (context.sameEnsembleCount > 0 ? 1.18 : 1.04),
    options: [
      {
        id: "repay-local-favor",
        label: "Repay the local favor",
        knownTradeoffs: [
          "Deepens regional goodwill and future access with the organizer",
          "Hands the rival a cleaner path through one contested lane",
        ],
        leftOutcome: "fulfilled",
        rightOutcome: "breached",
        leftValence: 68,
        rightValence: -42,
        fatigueDelta: -1,
        reputationDelta: 0,
        leftTags: ["exclusiveAccess", "reciprocity", "goodFaithAdvice"],
        rightTags: ["rivalry", "promiseBroken", "territorialIntrusion"],
        followUps: [{
          id: "region-remembers-restraint",
          delayWeeks: 3,
          tags: ["career-surface", "favor"],
          effects: [
            metric("left", "trust", 6),
            metric("right", "aggressiveness", -10),
            metric("scout", "specializationReputation", 1),
          ],
        }],
      },
      {
        id: "back-open-competition",
        label: "Back open competition",
        knownTradeoffs: [
          "Signals to the rival that you do not concede space because of local politics",
          "The organizer may stop opening discreet routes once this favor is refused",
        ],
        leftOutcome: "breached",
        rightOutcome: "fulfilled",
        leftValence: -70,
        rightValence: 54,
        fatigueDelta: 2,
        reputationDelta: 1,
        leftTags: ["exclusiveAccess", "promiseBroken", "sourceRelationship"],
        rightTags: ["rivalry", "directCompetition", "trustedUnderPressure"],
        followUps: [{
          id: "gatekeepers-go-cold",
          delayWeeks: 3,
          tags: ["career-surface", "favor"],
          effects: [
            metric("left", "trust", -8),
            metric("right", "aggressiveness", 12),
            metric("scout", "reputation", 1),
          ],
        }],
      },
      {
        id: "swap-future-favor",
        label: "Trade this restraint for a future favor",
        knownTradeoffs: [
          "Turns today's restraint into a named debt the organizer owes you later",
          "Leaves the rival partially unsatisfied and creates one more promise to manage",
        ],
        leftOutcome: "negotiated",
        rightOutcome: "negotiated",
        leftValence: 32,
        rightValence: 18,
        fatigueDelta: 3,
        reputationDelta: 0,
        leftTags: ["exclusiveAccess", "reciprocity", "negotiatedBoundary"],
        rightTags: ["rivalry", "negotiatedBoundary", "ceasefire"],
        followUps: [{
          id: "future-favor-recorded",
          delayWeeks: 3,
          tags: ["career-surface", "favor"],
          effects: [
            metric("left", "trust", 4),
            metric("right", "aggressiveness", -4),
            obligation(
              "future-favor",
              "left",
              "futureFavor",
              "Repay the scouting restraint with one protected local introduction later in the season.",
              8,
              { reciprocal: true },
            ),
          ],
        }],
      },
    ],
  },
  {
    id: "agent-versus-family-confidentiality",
    title: "The Private Window",
    frontFamilyId: "private-window",
    recurrenceName: "The Private Window",
    frontStructure: "confidentiality",
    quietEligible: true,
    leftRole: "agent",
    rightRole: "family",
    leftPriority: "discretion",
    rightPriority: "welfare",
    subjectKind: "player",
    leftRequest: "Keep the live interest private until the agent can shape the negotiation window.",
    rightRequest: "Keep the family fully in control and do not let the market move faster than the player's welfare.",
    leftObligationKind: "confidentiality",
    rightObligationKind: "playerWelfare",
    deadlineWeeks: 1,
    defaultOptionId: "ring-fenced-briefing",
    baseWeight: 0.78,
    stateWeight: (context) => recurrenceWeight(context) * liveAgreementWeight(context, 1.2),
    options: [
      {
        id: "protect-agent-window",
        label: "Protect the agent's window",
        knownTradeoffs: [
          "Keeps the gatekeeper warm and can preserve future discreet access",
          "The family may read this as market management coming before the player's protection",
        ],
        leftOutcome: "fulfilled",
        rightOutcome: "breached",
        leftValence: 58,
        rightValence: -64,
        fatigueDelta: 1,
        reputationDelta: 0,
        leftTags: ["confidentiality", "promiseKept", "trustedUnderPressure"],
        rightTags: ["familyPrivacy", "promiseBroken", "playerWelfare"],
        followUps: [{
          id: "private-window-buys-access",
          delayWeeks: 2,
          tags: ["career-surface", "confidentiality"],
          effects: [
            metric("left", "trust", 5),
            metric("left", "loyalty", 4),
            metric("scout", "specializationReputation", 1),
          ],
        }],
      },
      {
        id: "protect-family-control",
        label: "Protect the family's control",
        knownTradeoffs: [
          "Keeps the family confident that your advice is not being captured by the market",
          "The agent may stop treating you as a discreet operator around live windows",
        ],
        leftOutcome: "breached",
        rightOutcome: "fulfilled",
        leftValence: -62,
        rightValence: 72,
        fatigueDelta: 1,
        reputationDelta: 0,
        leftTags: ["confidentiality", "promiseBroken", "sourceRelationship"],
        rightTags: ["familyPrivacy", "trustedUnderPressure", "playerWelfare"],
        followUps: [{
          id: "family-remembers-independence",
          delayWeeks: 2,
          tags: ["career-surface", "confidentiality"],
          effects: [
            metric("left", "trust", -6),
            metric("scout", "persuasion", 1),
          ],
        }],
      },
      {
        id: "ring-fenced-briefing",
        label: "Create a ring-fenced family briefing",
        knownTradeoffs: [
          "Keeps the family inside the process without fully breaking the agent's timing request",
          "Requires more coordination and turns you into the person accountable for every boundary",
        ],
        leftOutcome: "negotiated",
        rightOutcome: "negotiated",
        leftValence: 24,
        rightValence: 32,
        fatigueDelta: 4,
        reputationDelta: 0,
        leftTags: ["confidentiality", "goodFaithAdvice", "reciprocity"],
        rightTags: ["familyPrivacy", "goodFaithAdvice", "playerWelfare"],
        followUps: [{
          id: "briefing-holds-the-line",
          delayWeeks: 2,
          tags: ["career-surface", "confidentiality"],
          effects: [
            metric("left", "loyalty", 3),
            metric("scout", "persuasion", 1),
          ],
        }],
      },
    ],
  },
  {
    id: "journalist-versus-manager-off-record",
    title: "Off the Record Until It Isn't",
    frontFamilyId: "off-record-line",
    recurrenceName: "The Off-Record Line",
    frontStructure: "publicPrivate",
    quietEligible: true,
    leftRole: "journalist",
    rightRole: "manager",
    leftPriority: "publicity",
    rightPriority: "control",
    subjectKind: "player",
    leftRequest: "Give an on-record line now so the public story belongs to a credible source.",
    rightRequest: "Keep the situation private until the manager decides whether the pathway is real.",
    leftObligationKind: "mediaAccess",
    rightObligationKind: "confidentiality",
    deadlineWeeks: 1,
    defaultOptionId: "brief-background-only",
    baseWeight: 0.76,
    stateWeight: (context) =>
      recurrenceWeight(context) * (context.state.scout.currentClubId ? 1.16 : 0.9),
    options: [
      {
        id: "go-on-record",
        label: "Go on record now",
        knownTradeoffs: [
          "Builds visible authority and can make you look decisive in public",
          "If the pathway changes, the manager will remember that you made a private process public early",
        ],
        leftOutcome: "fulfilled",
        rightOutcome: "breached",
        leftValence: 60,
        rightValence: -70,
        fatigueDelta: 2,
        reputationDelta: 2,
        leftTags: ["mediaAccess", "exclusiveAccess", "reciprocity"],
        rightTags: ["confidentiality", "promiseBroken", "meetingNegative"],
        followUps: [{
          id: "public-line-costs-private-trust",
          delayWeeks: 2,
          tags: ["career-surface", "publicity"],
          effects: [
            metric("scout", "reputation", 2),
            metric("scout", "clubTrust", -4),
          ],
        }],
      },
      {
        id: "respect-off-record",
        label: "Respect the off-record line",
        knownTradeoffs: [
          "Builds internal trust with the manager while the call is still live",
          "The journalist may stop treating you as someone who will help move a public narrative quickly",
        ],
        leftOutcome: "breached",
        rightOutcome: "fulfilled",
        leftValence: -56,
        rightValence: 68,
        fatigueDelta: 1,
        reputationDelta: 0,
        leftTags: ["mediaAccess", "promiseBroken", "sourceRelationship"],
        rightTags: ["confidentiality", "trustedUnderPressure", "meetingPositive"],
        followUps: [{
          id: "private-discipline-earns-room",
          delayWeeks: 2,
          tags: ["career-surface", "publicity"],
          effects: [
            metric("left", "trust", -5),
            metric("scout", "clubTrust", 3),
          ],
        }],
      },
      {
        id: "brief-background-only",
        label: "Brief in background only",
        knownTradeoffs: [
          "Preserves a controlled private process while giving the journalist enough context to stay engaged",
          "Nobody receives the clean public or private win they originally asked for",
        ],
        leftOutcome: "negotiated",
        rightOutcome: "negotiated",
        leftValence: 28,
        rightValence: 26,
        fatigueDelta: 3,
        reputationDelta: 1,
        leftTags: ["mediaAccess", "negotiatedBoundary", "goodFaithAdvice"],
        rightTags: ["confidentiality", "negotiatedBoundary", "meetingPositive"],
        followUps: [{
          id: "background-line-improves-advocacy",
          delayWeeks: 2,
          tags: ["career-surface", "publicity"],
          effects: [
            metric("scout", "reputation", 1),
            metric("scout", "persuasion", 1),
          ],
        }],
      },
    ],
  },
];

function entityKey(entity: EntityRef): string {
  return `${entity.kind}:${entity.id}`;
}

function stakeholderPairKey(leftStakeholderKey: string, rightStakeholderKey: string): string {
  return [leftStakeholderKey, rightStakeholderKey].sort().join("|");
}

function sameEntity(left: EntityRef, right: EntityRef): boolean {
  return left.kind === right.kind && left.id === right.id;
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

function distinctTags(tags: readonly string[]): string[] {
  return [...new Set(tags.filter((tag) => tag.trim().length > 0))];
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

function isScoutMetric(metric: AuthoredConflictMetric): boolean {
  return metric === "reputation"
    || metric === "fatigue"
    || metric === "clubTrust"
    || metric === "specializationReputation"
    || metric === "persuasion";
}

function targetMetricKey(
  target: AuthoredConflictEffectTarget,
  metricName: AuthoredConflictMetric,
  scoutId: string,
  left: StakeholderProfile,
  right: StakeholderProfile,
): string | undefined {
  if (target === "scout") {
    if (!isScoutMetric(metricName)) return undefined;
    return `scout:${metricName}`;
  }
  const profile = target === "left" ? left : right;
  if (profile.entity.kind === "contact") {
    if (
      metricName === "relationship"
      || metricName === "trust"
      || metricName === "loyalty"
      || metricName === "reliability"
    ) return `contact:${profile.entity.id}:${metricName}`;
  }
  if (profile.entity.kind === "employee" && metricName === "morale") {
    return `employee:${profile.entity.id}:morale`;
  }
  if (profile.entity.kind === "rival" && metricName === "aggressiveness") {
    return `rival:${profile.entity.id}:aggressiveness`;
  }
  if (profile.entity.kind === "scout" && isScoutMetric(metricName)) {
    return `scout:${metricName}`;
  }
  return undefined;
}

function defaultMetricBounds(metricName: AuthoredConflictMetric): { min: number; max: number } {
  return metricName === "persuasion"
    ? { min: 1, max: 20 }
    : { min: 0, max: 100 };
}

function profileCommonMetadata(input: {
  decisionId: string;
  definition: AuthoredRelationshipConflictDefinition;
  front: RelationshipConflictFrontMetadata;
  optionId: string;
  subject: EntityRef;
  now: GameDate;
}): Record<string, JsonValue> {
  return {
    conflictDefinitionId: input.definition.id,
    frontFamilyId: input.front.frontFamilyId,
    frontStructure: input.front.frontStructure,
    recurrenceName: input.front.recurrenceName,
    recurrenceIndex: input.front.recurrenceIndex,
    ensembleId: input.front.ensembleId,
    subjectKind: input.subject.kind,
    subjectId: input.subject.id,
    playerId: input.subject.kind === "player" ? input.subject.id : "",
    optionId: input.optionId,
    decisionId: input.decisionId,
    season: input.now.season,
    week: input.now.week,
  };
}

function relationshipEffects(input: {
  decisionId: string;
  definition: AuthoredRelationshipConflictDefinition;
  front: RelationshipConflictFrontMetadata;
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
  const baseTags = distinctTags([
    "relationshipConflict",
    input.definition.frontFamilyId,
    input.definition.frontStructure,
    input.profile.role,
    outcome,
    input.option.id,
    input.front.recurrenceIndex > 1 ? "recurringFront" : "openingFront",
    ...(input.side === "left" ? input.option.leftTags ?? [] : input.option.rightTags ?? []),
    ...input.profile.priorities,
  ]);
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
        tags: baseTags,
        valence,
        intensity: Math.round(clamp(48 + Math.abs(valence) * 0.45, 42, 94)),
        salience: Math.round(clamp(56 + Math.abs(valence) * 0.4, 50, 96)),
        visibility: "stakeholders",
        createdAt: { ...input.now },
        sourceDecisionId: input.decisionId,
        halfLifeWeeks: 104,
        metadata: {
          ...profileCommonMetadata({
            decisionId: input.decisionId,
            definition: input.definition,
            front: input.front,
            optionId: input.option.id,
            subject: input.subject,
            now: input.now,
          }),
          stakeholderRole: input.profile.role,
          stakeholderKey: entityKey(input.profile.entity),
          leftStakeholderKey: input.front.leftStakeholderKey,
          rightStakeholderKey: input.front.rightStakeholderKey,
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

function buildFollowUpFactId(
  decisionId: string,
  optionId: string,
  followUpId: string,
  factKey: string,
): string {
  return `fact:${decisionId}:${optionId}:${followUpId}:${factKey}`;
}

function buildFollowUpConditions(
  definition: AuthoredConflictFollowUpDefinition,
  decisionId: string,
  optionId: string,
): ConsequenceCondition[] {
  return (definition.conditions ?? []).map((condition) => ({
    type: "factExists",
    factId: buildFollowUpFactId(decisionId, optionId, definition.id, condition.factKey),
    exists: condition.exists,
  }));
}

function resolveEffectSubject(
  subject: AuthoredConflictFactEffectDefinition["subject"],
  left: StakeholderProfile,
  right: StakeholderProfile,
  focus: EntityRef,
  scoutId: string,
): EntityRef | undefined {
  if (subject === "left") return { ...left.entity };
  if (subject === "right") return { ...right.entity };
  if (subject === "scout") return { kind: "scout", id: scoutId };
  return { ...focus };
}

function followUpEffectRecords(input: {
  decisionId: string;
  definition: AuthoredRelationshipConflictDefinition;
  front: RelationshipConflictFrontMetadata;
  option: AuthoredConflictOptionDefinition;
  followUp: AuthoredConflictFollowUpDefinition;
  left: StakeholderProfile;
  right: StakeholderProfile;
  subject: EntityRef;
  scoutId: string;
  dueAt: GameDate;
  advanceWeeks: (start: GameDate, weeks: number) => GameDate;
}): ConsequenceEffect[] {
  const baseMetadata = profileCommonMetadata({
    decisionId: input.decisionId,
    definition: input.definition,
    front: input.front,
    optionId: input.option.id,
    subject: input.subject,
    now: input.dueAt,
  });
  return input.followUp.effects.flatMap<ConsequenceEffect>((effect, index) => {
    const effectPrefix = `${input.decisionId}:${input.option.id}:${input.followUp.id}:${index}`;
    if (effect.type === "metric") {
      const metricKey = targetMetricKey(
        effect.target,
        effect.metric,
        input.scoutId,
        input.left,
        input.right,
      );
      if (!metricKey) return [];
      const bounds = defaultMetricBounds(effect.metric);
      return [{
        id: `effect:${effectPrefix}:metric`,
        type: "adjustMetric" as const,
        metricKey,
        delta: effect.delta,
        min: effect.min ?? bounds.min,
        max: effect.max ?? bounds.max,
      }];
    }
    if (effect.type === "memory") {
      const stakeholder = effect.stakeholder === "left" ? input.left : input.right;
      const valence = effect.valence;
      return [{
        id: `effect:${effectPrefix}:memory`,
        type: "addMemory" as const,
        memory: {
          id: `memory:${effectPrefix}:${entityKey(stakeholder.entity)}`,
          stakeholder: { ...stakeholder.entity },
          subject: { kind: "scout", id: input.scoutId },
          tags: distinctTags([
            "relationshipConflict",
            "relationshipFollowUp",
            input.definition.frontFamilyId,
            input.definition.frontStructure,
            ...(input.followUp.tags ?? []),
            ...effect.tags,
          ]),
          valence,
          intensity: effect.intensity
            ?? Math.round(clamp(42 + Math.abs(valence) * 0.45, 38, 92)),
          salience: effect.salience
            ?? Math.round(clamp(44 + Math.abs(valence) * 0.42, 40, 92)),
          visibility: effect.visibility ?? "stakeholders",
          createdAt: { ...input.dueAt },
          sourceDecisionId: input.decisionId,
          halfLifeWeeks: 78,
          metadata: {
            ...baseMetadata,
            stakeholderRole: stakeholder.role,
            stakeholderKey: entityKey(stakeholder.entity),
            leftStakeholderKey: input.front.leftStakeholderKey,
            rightStakeholderKey: input.front.rightStakeholderKey,
            ...(effect.metadata ?? {}),
          },
        },
      }];
    }
    if (effect.type === "fact") {
      const worldFact: WorldFact = {
        id: buildFollowUpFactId(input.decisionId, input.option.id, input.followUp.id, effect.key),
        kind: effect.kind,
        subject: resolveEffectSubject(
          effect.subject,
          input.left,
          input.right,
          input.subject,
          input.scoutId,
        ),
        value: effect.value,
        observedAt: { ...input.dueAt },
        visibility: effect.visibility ?? "private",
        sourceDecisionId: input.decisionId,
        metadata: {
          ...baseMetadata,
          ...(effect.metadata ?? {}),
        },
      };
      return [{
        id: `effect:${effectPrefix}:fact`,
        type: "recordFact" as const,
        fact: worldFact,
      }];
    }
    const creditor = effect.creditor === "left" ? input.left : input.right;
    const obligationId = `obligation:${input.decisionId}:${input.option.id}:${input.followUp.id}:${effect.key}:${entityKey(creditor.entity)}`;
    const dueAt = effect.dueWeeks !== undefined
      ? input.advanceWeeks(input.dueAt, effect.dueWeeks)
      : undefined;
    return [{
      id: `effect:${effectPrefix}:obligation`,
      type: "createObligation" as const,
      obligation: {
        id: obligationId,
        debtor: { kind: "scout", id: input.scoutId },
        creditor: { ...creditor.entity },
        kind: effect.kind,
        terms: effect.terms,
        status: "active",
        createdAt: { ...input.dueAt },
        dueAt,
        sourceDecisionId: input.decisionId,
        metadata: {
          ...baseMetadata,
          stakeholderRole: creditor.role,
          stakeholderKey: entityKey(creditor.entity),
          leftStakeholderKey: input.front.leftStakeholderKey,
          rightStakeholderKey: input.front.rightStakeholderKey,
          ...(effect.metadata ?? {}),
        },
      },
    }];
  });
}

function scheduledFollowUps(input: {
  decisionId: string;
  definition: AuthoredRelationshipConflictDefinition;
  front: RelationshipConflictFrontMetadata;
  option: AuthoredConflictOptionDefinition;
  left: StakeholderProfile;
  right: StakeholderProfile;
  subject: EntityRef;
  scoutId: string;
  deadlineAt: GameDate;
  advanceWeeks: (start: GameDate, weeks: number) => GameDate;
}): ScheduledConsequenceTemplate[] {
  return (input.option.followUps ?? []).map((followUp) => ({
    id: followUp.id,
    dueAt: input.advanceWeeks(input.deadlineAt, followUp.delayWeeks),
    probability: followUp.probability,
    conditions: buildFollowUpConditions(followUp, input.decisionId, input.option.id),
    tags: distinctTags([
      "relationshipConflict",
      input.definition.frontFamilyId,
      input.definition.frontStructure,
      ...(followUp.tags ?? []),
    ]),
    effects: followUpEffectRecords({
      ...input,
      followUp,
      dueAt: input.advanceWeeks(input.deadlineAt, followUp.delayWeeks),
    }),
  }));
}

function optionEffects(input: {
  decisionId: string;
  definition: AuthoredRelationshipConflictDefinition;
  front: RelationshipConflictFrontMetadata;
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
  return stableSerialize({
    leftOutcome: option.leftOutcome,
    rightOutcome: option.rightOutcome,
    leftValence: option.leftValence,
    rightValence: option.rightValence,
    fatigueDelta: option.fatigueDelta,
    reputationDelta: option.reputationDelta,
    leftTags: option.leftTags ?? [],
    rightTags: option.rightTags ?? [],
    followUps: option.followUps ?? [],
  });
}

export function validateAuthoredRelationshipConflicts(
  definitions: readonly AuthoredRelationshipConflictDefinition[] = CONFLICT_DEFINITIONS,
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const definition of definitions) {
    if (ids.has(definition.id)) errors.push(`Duplicate conflict id: ${definition.id}`);
    ids.add(definition.id);
    if (!definition.frontFamilyId.trim()) errors.push(`${definition.id}: missing front family id`);
    if (!definition.recurrenceName.trim()) errors.push(`${definition.id}: missing recurrence name`);
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
      const followUpIds = new Set<string>();
      for (const followUp of option.followUps ?? []) {
        if (!followUp.id.trim() || followUpIds.has(followUp.id)) {
          errors.push(`${definition.id}/${option.id}: duplicate follow-up ${followUp.id}`);
        }
        followUpIds.add(followUp.id);
        if (followUp.effects.length === 0) {
          errors.push(`${definition.id}/${option.id}/${followUp.id}: empty follow-up`);
        }
        if (
          followUp.probability !== undefined
          && (!Number.isFinite(followUp.probability) || followUp.probability < 0 || followUp.probability > 1)
        ) {
          errors.push(`${definition.id}/${option.id}/${followUp.id}: invalid probability`);
        }
      }
    }
  }
  return errors;
}

export function getAuthoredRelationshipConflictDefinitions(): readonly AuthoredRelationshipConflictDefinition[] {
  return CONFLICT_DEFINITIONS;
}

export interface AuthoredRelationshipConflictCoverage {
  blueprintIds: readonly string[];
  frontFamilyIds: readonly string[];
  frontStructures: readonly RelationshipFrontStructure[];
  recurrenceNames: readonly string[];
  recurringFrontVariantIds: readonly string[];
  callbackVariantIds: readonly string[];
  stakeholderOutcomeVariantIds: readonly string[];
  blueprintCount: number;
  frontFamilyCount: number;
  frontStructureCount: number;
  recurringFrontVariantCount: number;
  callbackVariantCount: number;
  stakeholderOutcomeVariantCount: number;
  authoredCallbackOutcomeVariantCount: number;
}

export function getRelationshipConflictBlueprintIds(): readonly string[] {
  return CONFLICT_DEFINITIONS.map((definition) => definition.id);
}

export function getRelationshipConflictFrontFamilyIds(): readonly string[] {
  return [...new Set(CONFLICT_DEFINITIONS.map((definition) => definition.frontFamilyId))].sort();
}

export function getAuthoredRelationshipConflictCoverage(): AuthoredRelationshipConflictCoverage {
  const blueprintIds = getRelationshipConflictBlueprintIds();
  const frontFamilyIds = getRelationshipConflictFrontFamilyIds();
  const frontStructures = [...new Set(CONFLICT_DEFINITIONS
    .map((definition) => definition.frontStructure))].sort();
  const recurrenceNames = [...new Set(CONFLICT_DEFINITIONS
    .map((definition) => definition.recurrenceName))].sort();
  const recurringFrontVariantIds = CONFLICT_DEFINITIONS
    .flatMap((definition) =>
      definition.options.map((option) => `${definition.id}:${option.id}`),
    )
    .sort();
  const callbackVariantIds = CONFLICT_DEFINITIONS
    .flatMap((definition) =>
      definition.options.flatMap((option) =>
        (option.followUps ?? []).map((followUp) => `${definition.id}:${option.id}:${followUp.id}`),
      ),
    )
    .sort();
  const stakeholderOutcomeVariantIds = CONFLICT_DEFINITIONS
    .flatMap((definition) =>
      definition.options.flatMap((option) => [
        `${definition.id}:${option.id}:left`,
        `${definition.id}:${option.id}:right`,
      ]),
    )
    .sort();
  return {
    blueprintIds,
    frontFamilyIds,
    frontStructures,
    recurrenceNames,
    recurringFrontVariantIds,
    callbackVariantIds,
    stakeholderOutcomeVariantIds,
    blueprintCount: blueprintIds.length,
    frontFamilyCount: frontFamilyIds.length,
    frontStructureCount: frontStructures.length,
    recurringFrontVariantCount: recurringFrontVariantIds.length,
    callbackVariantCount: callbackVariantIds.length,
    stakeholderOutcomeVariantCount: stakeholderOutcomeVariantIds.length,
    authoredCallbackOutcomeVariantCount:
      callbackVariantIds.length + stakeholderOutcomeVariantIds.length,
  };
}

function activeAgreementCountFor(
  state: Pick<GameState, "accessAgreements"> & { currentSeason: number; currentWeek: number },
  entity: EntityRef,
): number {
  const now = { season: state.currentSeason, week: state.currentWeek };
  return Object.values(state.accessAgreements ?? {})
    .filter((agreement) =>
      isAccessAgreementActive(agreement, now)
      && (sameEntity(agreement.grantor, entity) || sameEntity(agreement.beneficiary, entity)),
    ).length;
}

function activeSubjectAgreementCount(
  state: Pick<GameState, "accessAgreements"> & { currentSeason: number; currentWeek: number },
  subject: EntityRef,
): number {
  const now = { season: state.currentSeason, week: state.currentWeek };
  return Object.values(state.accessAgreements ?? {})
    .filter((agreement) =>
      isAccessAgreementActive(agreement, now)
      && sameEntity(agreement.subject ?? { kind: "", id: "" }, subject),
    ).length;
}

function contactReliability(
  state: Pick<GameState, "contacts">,
  profile: StakeholderProfile,
): number | undefined {
  if (profile.entity.kind !== "contact") return undefined;
  const contact = state.contacts[profile.entity.id];
  if (!contact) return undefined;
  return contact.reliability
    ?? contact.trustLevel
    ?? contact.relationship
    ?? 50;
}

function conflictCounts(
  state: Pick<ConsequenceEngineState, "decisions" | "history"> | undefined,
  definition: AuthoredRelationshipConflictDefinition,
  front: RelationshipConflictFrontMetadata,
): { sameEnsembleCount: number; sameFrontFamilyCount: number } {
  if (!state) return { sameEnsembleCount: 0, sameFrontFamilyCount: 0 };
  let sameEnsembleCount = 0;
  let sameFrontFamilyCount = 0;
  const entries = [
    ...Object.values(state.decisions).map((decision) => ({
      source: decision.source,
      metadata: decision.metadata,
    })),
    ...state.history.map((record) => ({
      source: record.source,
      metadata: record.metadata,
    })),
  ];
  for (const entry of entries) {
    if (entry.source.kind !== "relationshipConflict") continue;
    const ensembleId = typeof entry.metadata?.ensembleId === "string"
      ? entry.metadata.ensembleId
      : undefined;
    const frontFamilyId = typeof entry.metadata?.frontFamilyId === "string"
      ? entry.metadata.frontFamilyId
      : entry.source.id;
    const subjectId = typeof entry.metadata?.subjectId === "string"
      ? entry.metadata.subjectId
      : typeof entry.metadata?.relatedPlayerId === "string"
        ? entry.metadata.relatedPlayerId
        : undefined;
    if (subjectId !== front.subject.id) continue;
    if (ensembleId === front.ensembleId) sameEnsembleCount += 1;
    if (frontFamilyId === definition.frontFamilyId) sameFrontFamilyCount += 1;
  }
  return { sameEnsembleCount, sameFrontFamilyCount };
}

function buildFrontMetadata(
  definition: AuthoredRelationshipConflictDefinition,
  cast: Pick<AuthoredConflictCast, "left" | "right" | "subject">,
  existingState?: Pick<ConsequenceEngineState, "decisions" | "history">,
): RelationshipConflictFrontMetadata {
  const ensembleId = [
    "relationship-ensemble",
    definition.frontFamilyId,
    `${cast.subject.kind}:${cast.subject.id}`,
    `left:${entityKey(cast.left.entity)}`,
    `right:${entityKey(cast.right.entity)}`,
  ].join(":");
  const provisional: RelationshipConflictFrontMetadata = {
    ensembleId,
    frontFamilyId: definition.frontFamilyId,
    frontStructure: definition.frontStructure,
    recurrenceName: definition.recurrenceName,
    recurrenceIndex: 1,
    subject: { ...cast.subject },
    leftStakeholderKey: entityKey(cast.left.entity),
    rightStakeholderKey: entityKey(cast.right.entity),
  };
  const counts = conflictCounts(existingState, definition, provisional);
  return {
    ...provisional,
    recurrenceIndex: counts.sameEnsembleCount + 1,
  };
}

/**
 * Deterministically bind a real recurring cast to an authored conflict. Profile
 * priorities raise likelihood, while saved history and live access conditions
 * determine which front family is actually hot in the current week.
 */
export function selectAuthoredRelationshipConflict(input: {
  rootSeed: string;
  now: GameDate;
  registry: StakeholderProfileRegistry;
  subject: EntityRef;
  excludedEntityKeys?: ReadonlySet<string>;
  excludedFrontFamilyIds?: ReadonlySet<string>;
  excludedEnsembleIds?: ReadonlySet<string>;
  excludedStakeholderPairKeys?: ReadonlySet<string>;
  quietEligibleOnly?: boolean;
  state?: GameState;
}): AuthoredConflictCast | undefined {
  const profiles = Object.values(input.registry.profiles)
    .filter((profile) => profile.active !== false);
  const candidates = CONFLICT_DEFINITIONS.flatMap((definition) => {
    if (definition.subjectKind !== input.subject.kind) return [];
    if (input.quietEligibleOnly && definition.quietEligible !== true) return [];
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
      const front = buildFrontMetadata(
        definition,
        { left, right, subject: input.subject },
        input.state?.consequenceState,
      );
      const pairKey = stakeholderPairKey(front.leftStakeholderKey, front.rightStakeholderKey);
      if (input.excludedFrontFamilyIds?.has(front.frontFamilyId)) return [];
      if (input.excludedEnsembleIds?.has(front.ensembleId)) return [];
      if (input.excludedStakeholderPairKeys?.has(pairKey)) return [];
      const counts = conflictCounts(input.state?.consequenceState, definition, front);
      const context: RelationshipConflictStateContext | undefined = input.state
        ? {
            state: input.state,
            now: input.now,
            subject: { ...input.subject },
            left,
            right,
            activeSubjectAgreementCount: activeSubjectAgreementCount(input.state, input.subject),
            leftAgreementCount: activeAgreementCountFor(input.state, left.entity),
            rightAgreementCount: activeAgreementCountFor(input.state, right.entity),
            leftReliability: contactReliability(input.state, left),
            rightReliability: contactReliability(input.state, right),
            sameEnsembleCount: counts.sameEnsembleCount,
            sameFrontFamilyCount: counts.sameFrontFamilyCount,
          }
        : undefined;
      const stateMultiplier = context
        ? Math.max(0, definition.stateWeight?.(context) ?? 1)
        : 1;
      const selectionWeight = definition.baseWeight * priorityMultiplier * stateMultiplier;
      if (selectionWeight <= 0) return [];
      return [{
        definition,
        left,
        right,
        subject: { ...input.subject },
        selectionWeight,
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
  existingState?: Pick<ConsequenceEngineState, "decisions" | "history">;
  advanceWeeks?: (start: GameDate, weeks: number) => GameDate;
  decisionMetadata?: Record<string, JsonValue>;
}): MaterializedRelationshipConflict {
  const { definition, left, right, subject } = input.cast;
  const front = buildFrontMetadata(definition, input.cast, input.existingState);
  const advanceWeeks = input.advanceWeeks
    ?? ((start: GameDate, weeks: number) => addGameWeeksWithSeasonLength(start, weeks));
  const leftObligationId = `obligation:${input.id}:left:${entityKey(left.entity)}`;
  const rightObligationId = `obligation:${input.id}:right:${entityKey(right.entity)}`;
  const commonObligation = {
    debtor: { kind: "scout", id: input.scoutId },
    status: "active" as const,
    createdAt: { ...input.now },
    dueAt: { ...input.deadlineAt },
    sourceDecisionId: input.id,
  };
  const obligationMetadata = {
    conflict: true,
    frontFamilyId: front.frontFamilyId,
    frontStructure: front.frontStructure,
    recurrenceName: front.recurrenceName,
    recurrenceIndex: front.recurrenceIndex,
    ensembleId: front.ensembleId,
    subjectKind: subject.kind,
    subjectId: subject.id,
    playerId: subject.kind === "player" ? subject.id : "",
    leftStakeholderKey: front.leftStakeholderKey,
    rightStakeholderKey: front.rightStakeholderKey,
  } satisfies Record<string, JsonValue>;
  const offeredObligations: Record<string, Obligation> = {
    [leftObligationId]: {
      ...commonObligation,
      id: leftObligationId,
      creditor: { ...left.entity },
      kind: definition.leftObligationKind ?? `${definition.id}:leftRequest`,
      terms: definition.leftRequest,
      metadata: { ...obligationMetadata, stakeKey: "left" },
    },
    [rightObligationId]: {
      ...commonObligation,
      id: rightObligationId,
      creditor: { ...right.entity },
      kind: definition.rightObligationKind ?? `${definition.id}:rightRequest`,
      terms: definition.rightRequest,
      metadata: { ...obligationMetadata, stakeKey: "right" },
    },
  };
  const options: DecisionOption[] = definition.options.map((option) => ({
    id: option.id,
    label: option.label,
    knownTradeoffs: [...option.knownTradeoffs],
    immediateEffects: optionEffects({
      decisionId: input.id,
      definition,
      front,
      option,
      left,
      right,
      subject,
      scoutId: input.scoutId,
      now: input.now,
      leftObligationId,
      rightObligationId,
    }),
    scheduledConsequences: scheduledFollowUps({
      decisionId: input.id,
      definition,
      front,
      option,
      left,
      right,
      subject,
      scoutId: input.scoutId,
      deadlineAt: input.deadlineAt,
      advanceWeeks,
    }),
  }));
  return {
    front,
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
        leftRole: definition.leftRole,
        rightRole: definition.rightRole,
        frontFamilyId: front.frontFamilyId,
        frontStructure: front.frontStructure,
        recurrenceName: front.recurrenceName,
        recurrenceIndex: front.recurrenceIndex,
        ensembleId: front.ensembleId,
        subjectKind: subject.kind,
        subjectId: subject.id,
        leftStakeholderKey: front.leftStakeholderKey,
        rightStakeholderKey: front.rightStakeholderKey,
        semanticSignature: `relationship:${front.frontFamilyId}:${front.frontStructure}:${definition.leftRole}:${definition.rightRole}:${subject.kind}`,
        ...input.decisionMetadata,
      },
    },
  };
}

export function getMaterializedRelationshipConflictFront(
  decision: Pick<DecisionRecord, "metadata">,
): RelationshipConflictFrontMetadata | undefined {
  const frontStructure = decision.metadata?.frontStructure;
  const frontFamilyId = decision.metadata?.frontFamilyId;
  const recurrenceName = decision.metadata?.recurrenceName;
  const recurrenceIndex = decision.metadata?.recurrenceIndex;
  const ensembleId = decision.metadata?.ensembleId;
  const subjectKind = decision.metadata?.subjectKind;
  const subjectId = decision.metadata?.subjectId;
  const leftStakeholderKey = decision.metadata?.leftStakeholderKey;
  const rightStakeholderKey = decision.metadata?.rightStakeholderKey;
  if (
    typeof frontStructure !== "string"
    || typeof frontFamilyId !== "string"
    || typeof recurrenceName !== "string"
    || typeof recurrenceIndex !== "number"
    || typeof ensembleId !== "string"
    || typeof subjectKind !== "string"
    || typeof subjectId !== "string"
    || typeof leftStakeholderKey !== "string"
    || typeof rightStakeholderKey !== "string"
  ) return undefined;
  return {
    ensembleId,
    frontFamilyId,
    frontStructure: frontStructure as RelationshipFrontStructure,
    recurrenceName,
    recurrenceIndex,
    subject: { kind: subjectKind, id: subjectId },
    leftStakeholderKey,
    rightStakeholderKey,
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
