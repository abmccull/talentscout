import type { ClubDecision, ScoutReport } from "@/engine/core/types";
import { elapsedGameWeeks } from "./decisionLedger";
import { applyConsequenceEffects, type EffectApplicationResult } from "./processor";
import type {
  ConsequenceEngineState,
  EntityRef,
  GameDate,
  Obligation,
  StakeholderMemory,
} from "./types";

export type StakeholderMemoryDomain =
  | "academyReport"
  | "contactRelationship"
  | "managerMeeting"
  | "boardMeeting";

export interface StakeholderMemoryPolicyInput {
  memories: Readonly<Record<string, StakeholderMemory>> | readonly StakeholderMemory[];
  stakeholder: EntityRef;
  subject: EntityRef;
  now: GameDate;
  domain: StakeholderMemoryDomain;
  seasonLength?: number;
  obligations?: Readonly<Record<string, Obligation>> | readonly Obligation[];
}

export interface StakeholderMemoryInfluence {
  memoryId: string;
  effectiveSalience: number;
  contribution: number;
}

export interface StakeholderMemoryPolicyResult {
  /** Bounded score adjustment for a relationship-facing decision component. */
  scoreAdjustment: number;
  /** Bounded additive probability adjustment for access or information sharing. */
  probabilityAdjustment: number;
  reason?: string;
  influences: StakeholderMemoryInfluence[];
  activeObligationIds: string[];
}

const MAX_SCORE_ADJUSTMENT = 12;
const MAX_PROBABILITY_ADJUSTMENT = 0.12;

const DOMAIN_TAGS: Record<StakeholderMemoryDomain, ReadonlySet<string>> = {
  academyReport: new Set([
    "academyReport",
    "reportProcess",
    "evidenceStrong",
    "evidenceWeak",
    "calibratedConviction",
    "overstatedConviction",
    "accepted",
    "followUpRequested",
    "rejected",
  ]),
  contactRelationship: new Set([
    "betrayal",
    "confronted",
    "dishonest",
    "exclusiveAccess",
    "reciprocity",
    "confidentiality",
    "promiseKept",
    "promiseBroken",
    "trustedUnderPressure",
    "informationLeak",
    "exposedMisconduct",
    "integrityConflict",
    "mutualComplicity",
  ]),
  managerMeeting: new Set([
    "managerMeeting",
    "meetingPositive",
    "meetingNegative",
    "directiveIssued",
    "directiveReaffirmed",
    "listened",
    "evidencePresented",
    "professionalChallenge",
  ]),
  boardMeeting: new Set([
    "boardMeeting",
    "meetingPositive",
    "meetingNegative",
    "accountability",
    "costDiscipline",
    "strategicVision",
  ]),
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sameEntity(left: EntityRef, right: EntityRef): boolean {
  return left.kind === right.kind && left.id === right.id;
}

function records<T>(value: Readonly<Record<string, T>> | readonly T[] | undefined): readonly T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : Object.values(value);
}

function domainRelevance(memory: StakeholderMemory, domain: StakeholderMemoryDomain): number {
  const relevantTags = DOMAIN_TAGS[domain];
  const matches = memory.tags.filter((tag) => relevantTags.has(tag)).length;
  if (matches === 0) return 0;
  return clamp(0.72 + (matches - 1) * 0.09, 0.72, 1);
}

function effectiveSalience(
  memory: StakeholderMemory,
  now: GameDate,
  seasonLength: number,
): number {
  const ageWeeks = Math.max(0, elapsedGameWeeks(now, memory.createdAt, seasonLength));
  if (!memory.halfLifeWeeks) return memory.salience;
  return memory.salience * Math.pow(0.5, ageWeeks / memory.halfLifeWeeks);
}

function activeObligationsFor(
  input: StakeholderMemoryPolicyInput,
): Obligation[] {
  return records(input.obligations).filter((obligation) =>
    obligation.status === "active"
    && sameEntity(obligation.creditor, input.stakeholder)
    && sameEntity(obligation.debtor, input.subject)
  );
}

function policyReason(
  domain: StakeholderMemoryDomain,
  scoreAdjustment: number,
  positiveCount: number,
  negativeCount: number,
  obligationCount: number,
): string | undefined {
  if (positiveCount === 0 && negativeCount === 0 && obligationCount === 0) return undefined;
  const scoreText = `${scoreAdjustment >= 0 ? "+" : ""}${scoreAdjustment}`;
  if (positiveCount === 0 && negativeCount === 0 && obligationCount > 0) {
    return `An active promise keeps this relationship conditional until it is resolved (memory effect ${scoreText}).`;
  }
  if (positiveCount > 0 && negativeCount > 0 && Math.abs(scoreAdjustment) <= 1) {
    return `Past dealings pull both ways, so this stakeholder remains cautious (memory effect ${scoreText}).`;
  }
  const subject = domain === "academyReport"
    ? "The club"
    : domain === "contactRelationship"
      ? "This contact"
      : domain === "managerMeeting"
        ? "The manager"
        : "The board";
  if (scoreAdjustment > 0) {
    return `${subject} remembers reliable prior dealings, strengthening trust in this decision (memory effect ${scoreText}).`;
  }
  if (scoreAdjustment < 0) {
    return `${subject} remembers a prior breach or weak process, increasing caution in this decision (memory effect ${scoreText}).`;
  }
  return `${subject} remembers the history, but it does not materially change this decision (memory effect ${scoreText}).`;
}

/**
 * Deterministically projects actor-scoped episodic memories into a deliberately
 * small decision modifier. It reads only persisted episodes and obligations;
 * player ability, potential, and other hidden truth are not accepted inputs.
 */
export function evaluateStakeholderMemoryPolicy(
  input: StakeholderMemoryPolicyInput,
): StakeholderMemoryPolicyResult {
  const seasonLength = Math.max(1, Math.floor(input.seasonLength ?? 38));
  const influences = records(input.memories)
    .filter((memory) =>
      sameEntity(memory.stakeholder, input.stakeholder)
      && sameEntity(memory.subject, input.subject)
    )
    .map((memory): StakeholderMemoryInfluence | undefined => {
      const relevance = domainRelevance(memory, input.domain);
      if (relevance <= 0) return undefined;
      const salience = effectiveSalience(memory, input.now, seasonLength);
      const strength = salience / 100 * (0.35 + memory.intensity / 100 * 0.65) * relevance;
      return {
        memoryId: memory.id,
        effectiveSalience: Number(salience.toFixed(4)),
        contribution: Number((memory.valence / 100 * strength * MAX_SCORE_ADJUSTMENT).toFixed(4)),
      };
    })
    .filter((influence): influence is StakeholderMemoryInfluence => Boolean(influence))
    .sort((left, right) => left.memoryId.localeCompare(right.memoryId));

  const activeObligations = activeObligationsFor(input);
  const episodeTotal = influences.reduce((sum, influence) => sum + influence.contribution, 0);
  // An open promise creates modest caution until resolved. Its later fulfilled
  // or breached outcome is represented by an episode, avoiding double-counting.
  const obligationAdjustment = -Math.min(2, activeObligations.length);
  const scoreAdjustment = Math.round(clamp(
    episodeTotal + obligationAdjustment,
    -MAX_SCORE_ADJUSTMENT,
    MAX_SCORE_ADJUSTMENT,
  ));
  const probabilityAdjustment = Number(clamp(
    scoreAdjustment / MAX_SCORE_ADJUSTMENT * MAX_PROBABILITY_ADJUSTMENT,
    -MAX_PROBABILITY_ADJUSTMENT,
    MAX_PROBABILITY_ADJUSTMENT,
  ).toFixed(4));
  const positiveCount = influences.filter((influence) => influence.contribution > 0).length;
  const negativeCount = influences.filter((influence) => influence.contribution < 0).length;

  return {
    scoreAdjustment,
    probabilityAdjustment,
    reason: policyReason(
      input.domain,
      scoreAdjustment,
      positiveCount,
      negativeCount,
      activeObligations.length,
    ),
    influences,
    activeObligationIds: activeObligations.map((obligation) => obligation.id).sort(),
  };
}

const CONVICTION_SCORE = { note: 20, recommend: 55, strongRecommend: 78, tablePound: 94 } as const;

/** Build the club's durable memory of the report process, never player truth. */
export function createAcademyClubDecisionMemory(input: {
  decision: ClubDecision;
  report: ScoutReport;
  scoutId: string;
}): StakeholderMemory {
  const { decision, report } = input;
  const breakdown = decision.scoreBreakdown;
  const evidence = breakdown?.evidence ?? report.qualityScore ?? 50;
  const risk = breakdown?.risk ?? 50;
  const presentation = breakdown?.presentation ?? 50;
  const briefFit = breakdown?.briefFit ?? 50;
  const calibration = clamp(
    100 - Math.abs(CONVICTION_SCORE[report.conviction] - evidence),
    0,
    100,
  );
  const processScore = evidence * 0.32
    + risk * 0.2
    + presentation * 0.14
    + briefFit * 0.14
    + calibration * 0.2;
  const outcomeNudge = decision.outcome === "accepted"
    ? 6
    : decision.outcome === "followUpRequested"
      ? -1
      : -5;
  const valence = Math.round(clamp((processScore - 55) * 1.35 + outcomeNudge, -100, 100));
  const intensity = Math.round(clamp(34 + Math.abs(valence) * 0.55, 30, 88));
  const salience = Math.round(clamp(50 + Math.abs(valence) * 0.42, 45, 92));
  const calibrationTag = calibration >= 72 ? "calibratedConviction" : "overstatedConviction";
  const evidenceTag = evidence >= 68 ? "evidenceStrong" : "evidenceWeak";
  const createdAt = { season: decision.decidedSeason, week: decision.decidedWeek };

  return {
    id: `memory:club:${decision.clubId}:academy:${decision.id}`,
    stakeholder: { kind: "club", id: decision.clubId },
    subject: { kind: "scout", id: input.scoutId },
    tags: ["academyReport", "reportProcess", decision.outcome, evidenceTag, calibrationTag],
    valence,
    intensity,
    salience,
    visibility: "stakeholders",
    createdAt,
    sourceDecisionId: decision.id,
    halfLifeWeeks: 76,
    metadata: {
      reportId: report.id,
      processScore: Number(processScore.toFixed(2)),
      calibration: Number(calibration.toFixed(2)),
    },
  };
}

/** Idempotently record one memory and its applied-effect audit marker. */
export function recordStakeholderMemory(
  state: ConsequenceEngineState,
  memory: StakeholderMemory,
): EffectApplicationResult {
  return applyConsequenceEffects(
    state,
    `consequence:${memory.id}`,
    [{
      id: `effect:${memory.id}`,
      type: "addMemory",
      memory,
    }],
    memory.createdAt,
  );
}
