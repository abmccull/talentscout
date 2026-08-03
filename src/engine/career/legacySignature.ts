import type { GameState, LegacyProfile } from "../core/types";
import { stableFingerprint } from "../run/runManifest";
import {
  deriveCareerFingerprintAuthority,
  deriveCareerFingerprintProjection,
  type CareerFingerprintAuthority,
} from "./fingerprint";

export const CAREER_SIGNATURE_VERSION = 1 as const;

export type CareerSignaturePillar =
  | "guardian"
  | "calibrator"
  | "pathwayBuilder"
  | "connector"
  | "departmentSteward"
  | "territoryReader";

export type CareerSignatureStartHook =
  | "familyTrust"
  | "reviewDiscipline"
  | "alumniAccess"
  | "networkReach"
  | "staffCredibility"
  | "territoryHeadStart";

export const CAREER_SIGNATURE_EVIDENCE_VERSION = 1 as const;

export interface CareerSignaturePillarEvidence {
  pillar: CareerSignaturePillar;
  score: number;
  evidenceIds: string[];
}

/**
 * Compact, player-visible evidence authority archived with a completed career.
 * New Game+ re-derives the signature from this record instead of trusting the
 * stored title, pillar, or start-hook fields.
 */
export interface CareerSignaturePublicEvidenceArchive {
  version: typeof CAREER_SIGNATURE_EVIDENCE_VERSION;
  fingerprintId: string;
  pillarEvidence: CareerSignaturePillarEvidence[];
}

export interface CareerSignature {
  version: typeof CAREER_SIGNATURE_VERSION;
  id: string;
  title: string;
  summary: string;
  pillars: CareerSignaturePillar[];
  /** IDs from player-visible career archives, moments, reviews, alumni, or leadership. */
  evidenceIds: string[];
  startHook: CareerSignatureStartHook;
  /** Optional only so pre-signature profiles can be loaded and enriched. */
  publicEvidence?: CareerSignaturePublicEvidenceArchive;
}

export interface CareerFinalChapter {
  title: string;
  summary: string;
  evidenceIds: string[];
}

export interface CareerSignatureLegacySummary {
  sourceCareerName: string;
  signatureTitle: string;
  signatureSummary: string;
  finalChapterTitle: string;
  finalChapterSummary: string;
}

export interface CareerSignatureResult {
  signature: CareerSignature;
  finalChapter: CareerFinalChapter;
}

interface PillarDefinition {
  title: string;
  identity: string;
  startHook: CareerSignatureStartHook;
}

interface PillarScore {
  pillar: CareerSignaturePillar;
  score: number;
  evidenceIds: string[];
}

const PILLAR_ORDER: CareerSignaturePillar[] = [
  "guardian",
  "calibrator",
  "pathwayBuilder",
  "connector",
  "departmentSteward",
  "territoryReader",
];

const MAX_ARCHIVED_EVIDENCE_IDS_PER_PILLAR = 6;
const MAX_SIGNATURE_ID_LENGTH = 192;
const MAX_SIGNATURE_TEXT_LENGTH = 640;
const MAX_EVIDENCE_ID_LENGTH = 192;
const MAX_FINGERPRINT_ID_LENGTH = 192;
const MAX_PILLAR_SCORE = 1_000_000;

const PILLAR_DEFINITIONS: Record<CareerSignaturePillar, PillarDefinition> = {
  guardian: {
    title: "The Player's Advocate",
    identity: "put player welfare and sustainable support ahead of easy certainty",
    startHook: "familyTrust",
  },
  calibrator: {
    title: "The Honest Calibrator",
    identity: "kept testing convictions against the careers that followed",
    startHook: "reviewDiscipline",
  },
  pathwayBuilder: {
    title: "The Pathway Builder",
    identity: "judged opportunities by the routes they created for young players",
    startHook: "alumniAccess",
  },
  connector: {
    title: "The Trusted Connector",
    identity: "turned durable relationships into access and honest football intelligence",
    startHook: "networkReach",
  },
  departmentSteward: {
    title: "The Department Steward",
    identity: "made other scouts, delegated work, and accountable leadership part of the craft",
    startHook: "staffCredibility",
  },
  territoryReader: {
    title: "The Territory Reader",
    identity: "built judgment through repeated local knowledge instead of reputation alone",
    startHook: "territoryHeadStart",
  },
};

function addEvidence(
  scores: Record<CareerSignaturePillar, PillarScore>,
  pillar: CareerSignaturePillar,
  score: number,
  evidenceId?: string,
): void {
  scores[pillar].score += score;
  if (evidenceId && !scores[pillar].evidenceIds.includes(evidenceId)) {
    scores[pillar].evidenceIds.push(evidenceId);
  }
}

function includesAny(value: string, terms: readonly string[]): boolean {
  const normalized = value.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function compareMomentDate(
  left: { moment: { occurredAt: { season: number; week: number }; id: string } },
  right: { moment: { occurredAt: { season: number; week: number }; id: string } },
): number {
  return right.moment.occurredAt.season - left.moment.occurredAt.season
    || right.moment.occurredAt.week - left.moment.occurredAt.week
    || left.moment.id.localeCompare(right.moment.id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    return undefined;
  }
  if (value.trim().length === 0) return undefined;
  return value;
}

function stringArraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function isCareerSignaturePillar(value: unknown): value is CareerSignaturePillar {
  return typeof value === "string"
    && PILLAR_ORDER.includes(value as CareerSignaturePillar);
}

function createPublicEvidenceArchive(
  scores: Record<CareerSignaturePillar, PillarScore>,
  fingerprintId: string,
): CareerSignaturePublicEvidenceArchive {
  return {
    version: CAREER_SIGNATURE_EVIDENCE_VERSION,
    fingerprintId,
    pillarEvidence: PILLAR_ORDER.map((pillar) => ({
      pillar,
      score: Math.max(0, Math.min(MAX_PILLAR_SCORE, Math.trunc(scores[pillar].score))),
      evidenceIds: scores[pillar].evidenceIds
        .filter((id) => boundedString(id, MAX_EVIDENCE_ID_LENGTH) !== undefined)
        .filter((id, index, all) => all.indexOf(id) === index)
        .slice(0, MAX_ARCHIVED_EVIDENCE_IDS_PER_PILLAR),
    })),
  };
}

function sanitizePublicEvidenceArchive(
  value: unknown,
): CareerSignaturePublicEvidenceArchive | undefined {
  if (!isRecord(value)) return undefined;
  if (value.version !== CAREER_SIGNATURE_EVIDENCE_VERSION) return undefined;
  const fingerprintId = boundedString(value.fingerprintId, MAX_FINGERPRINT_ID_LENGTH);
  if (!fingerprintId || !/^[a-f0-9]{16}$/i.test(fingerprintId)) return undefined;
  if (
    !Array.isArray(value.pillarEvidence)
    || value.pillarEvidence.length !== PILLAR_ORDER.length
  ) {
    return undefined;
  }

  const evidenceByPillar = new Map<CareerSignaturePillar, CareerSignaturePillarEvidence>();
  for (const candidate of value.pillarEvidence) {
    if (!isRecord(candidate) || !isCareerSignaturePillar(candidate.pillar)) {
      return undefined;
    }
    if (
      !Number.isInteger(candidate.score)
      || (candidate.score as number) < 0
      || (candidate.score as number) > MAX_PILLAR_SCORE
      || !Array.isArray(candidate.evidenceIds)
      || candidate.evidenceIds.length > MAX_ARCHIVED_EVIDENCE_IDS_PER_PILLAR
      || evidenceByPillar.has(candidate.pillar)
    ) {
      return undefined;
    }
    const evidenceIds: string[] = [];
    for (const evidenceIdValue of candidate.evidenceIds) {
      const evidenceId = boundedString(evidenceIdValue, MAX_EVIDENCE_ID_LENGTH);
      if (!evidenceId || evidenceIds.includes(evidenceId)) return undefined;
      evidenceIds.push(evidenceId);
    }
    evidenceByPillar.set(candidate.pillar, {
      pillar: candidate.pillar,
      score: candidate.score as number,
      evidenceIds,
    });
  }

  if (PILLAR_ORDER.some((pillar) => !evidenceByPillar.has(pillar))) return undefined;
  return {
    version: CAREER_SIGNATURE_EVIDENCE_VERSION,
    fingerprintId,
    pillarEvidence: PILLAR_ORDER.map((pillar) => evidenceByPillar.get(pillar)!),
  };
}

function deriveSignatureFromPublicEvidence(
  publicEvidence: CareerSignaturePublicEvidenceArchive,
): CareerSignature {
  const scores = publicEvidence.pillarEvidence.map((entry) => ({
    pillar: entry.pillar,
    score: entry.score,
    evidenceIds: [...entry.evidenceIds],
  }));
  const ranked = scores.sort((left, right) =>
    right.score - left.score
    || PILLAR_ORDER.indexOf(left.pillar) - PILLAR_ORDER.indexOf(right.pillar));
  const primary = ranked[0];
  const pillars: CareerSignaturePillar[] = [primary.pillar];
  const secondary = ranked[1];
  if (secondary.score >= Math.max(2, Math.ceil(primary.score * 0.45))) {
    pillars.push(secondary.pillar);
  }

  const evidenceIds = pillars
    .flatMap((pillar) =>
      publicEvidence.pillarEvidence.find((entry) => entry.pillar === pillar)?.evidenceIds ?? [])
    .filter((id, index, all) => all.indexOf(id) === index)
    .slice(0, MAX_ARCHIVED_EVIDENCE_IDS_PER_PILLAR);
  if (evidenceIds.length === 0) {
    evidenceIds.push(`fingerprint:${publicEvidence.fingerprintId}`);
  }

  const primaryDefinition = PILLAR_DEFINITIONS[primary.pillar];
  const secondaryDefinition = pillars[1] ? PILLAR_DEFINITIONS[pillars[1]] : undefined;
  const summary = secondaryDefinition
    ? `${primaryDefinition.title} ${primaryDefinition.identity}, while also becoming a scout who ${secondaryDefinition.identity}.`
    : `${primaryDefinition.title} ${primaryDefinition.identity}.`;

  return {
    version: CAREER_SIGNATURE_VERSION,
    id: `career-signature:${stableFingerprint({
      pillars,
      evidenceIds,
      fingerprint: publicEvidence.fingerprintId,
    })}`,
    title: primaryDefinition.title,
    summary,
    pillars,
    evidenceIds,
    startHook: primaryDefinition.startHook,
    publicEvidence: {
      version: publicEvidence.version,
      fingerprintId: publicEvidence.fingerprintId,
      pillarEvidence: publicEvidence.pillarEvidence.map((entry) => ({
        pillar: entry.pillar,
        score: entry.score,
        evidenceIds: [...entry.evidenceIds],
      })),
    },
  };
}

/**
 * Validate a persisted signature and return the canonical projection derived
 * from its bounded public-evidence archive. Any mismatch fails closed.
 */
export function sanitizeCareerSignature(value: unknown): CareerSignature | undefined {
  try {
    if (!isRecord(value)) return undefined;
    const publicEvidence = sanitizePublicEvidenceArchive(value.publicEvidence);
    if (!publicEvidence) return undefined;
    const canonical = deriveSignatureFromPublicEvidence(publicEvidence);
    if (
      value.version !== CAREER_SIGNATURE_VERSION
      || value.id !== canonical.id
      || value.title !== canonical.title
      || value.summary !== canonical.summary
      || value.startHook !== canonical.startHook
      || !Array.isArray(value.pillars)
      || !value.pillars.every((pillar) => typeof pillar === "string")
      || !stringArraysEqual(value.pillars as string[], canonical.pillars)
      || !Array.isArray(value.evidenceIds)
      || !value.evidenceIds.every((id) => typeof id === "string")
      || !stringArraysEqual(value.evidenceIds as string[], canonical.evidenceIds)
      || !boundedString(value.id, MAX_SIGNATURE_ID_LENGTH)
      || !boundedString(value.title, MAX_SIGNATURE_TEXT_LENGTH)
      || !boundedString(value.summary, MAX_SIGNATURE_TEXT_LENGTH)
    ) {
      return undefined;
    }
    return canonical;
  } catch {
    return undefined;
  }
}

/** Sanitize non-mechanical closing copy before it reaches the UI. */
export function sanitizeCareerFinalChapter(value: unknown): CareerFinalChapter | undefined {
  try {
    if (!isRecord(value)) return undefined;
    const title = boundedString(value.title, MAX_SIGNATURE_TEXT_LENGTH);
    const summary = boundedString(value.summary, MAX_SIGNATURE_TEXT_LENGTH * 2);
    if (!title || !summary || !Array.isArray(value.evidenceIds) || value.evidenceIds.length > 4) {
      return undefined;
    }
    const evidenceIds: string[] = [];
    for (const candidate of value.evidenceIds) {
      const evidenceId = boundedString(candidate, MAX_EVIDENCE_ID_LENGTH);
      if (!evidenceId || evidenceIds.includes(evidenceId)) return undefined;
      evidenceIds.push(evidenceId);
    }
    return { title, summary, evidenceIds };
  } catch {
    return undefined;
  }
}

/**
 * Resolve the identity a completed youth-scout career earned from public,
 * persisted evidence. The projection never reads player CA/PA or hidden truth.
 */
export function deriveCareerSignature(state: GameState): CareerSignatureResult {
  const scores: Record<CareerSignaturePillar, PillarScore> = {
    guardian: { pillar: "guardian", score: 0, evidenceIds: [] },
    calibrator: { pillar: "calibrator", score: 0, evidenceIds: [] },
    pathwayBuilder: { pillar: "pathwayBuilder", score: 0, evidenceIds: [] },
    connector: { pillar: "connector", score: 0, evidenceIds: [] },
    departmentSteward: { pillar: "departmentSteward", score: 0, evidenceIds: [] },
    territoryReader: { pillar: "territoryReader", score: 0, evidenceIds: [] },
  };

  const archiveRecords = Object.values(state.careerStoryArchive?.records ?? {})
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const record of archiveRecords) {
    const text = [
      record.title,
      record.selectedOptionLabel,
      ...record.knownTradeoffs,
      ...record.obligations.map((obligation) => obligation.terms),
    ].filter(Boolean).join(" ");
    if (includesAny(text, ["welfare", "family", "support", "safeguard", "protect"])) {
      addEvidence(scores, "guardian", 3, record.id);
    }
    if (record.stakeholderReactions.length > 0 || record.obligations.length > 0) {
      addEvidence(scores, "connector", 1 + Math.min(2, record.stakeholderReactions.length), record.id);
    }
    if (includesAny(text, ["territory", "region", "local", "travel", "country"])) {
      addEvidence(scores, "territoryReader", 2, record.id);
    }
  }

  const completedReviews = Object.values(state.recommendationReviews ?? {})
    .filter((review) => review.status === "complete")
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const review of completedReviews) {
    addEvidence(scores, "calibrator", 2, review.id);
    if ((review.confidenceCalibration ?? 0) >= 60) {
      addEvidence(scores, "calibrator", 1, review.id);
    }
    for (const dimension of review.playerFacingDimensions ?? []) {
      if (dimension.key === "supportAdaptationFit") {
        addEvidence(scores, "guardian", dimension.status === "positive" ? 3 : 1, review.id);
      }
      if (dimension.key === "pathwayQuality" || dimension.key === "interventionFollowThrough") {
        addEvidence(scores, "pathwayBuilder", dimension.status === "positive" ? 3 : 1, review.id);
      }
      if (dimension.key === "revisionQuality") {
        addEvidence(scores, "calibrator", dimension.status === "positive" ? 2 : 1, review.id);
      }
    }
  }

  const alumni = [...(state.alumniRecords ?? [])].sort((left, right) => left.id.localeCompare(right.id));
  for (const record of alumni) {
    const pathwayWeight = 1
      + Math.min(3, record.milestones.length)
      + (record.currentStatus === "firstTeam" ? 2 : 0);
    addEvidence(scores, "pathwayBuilder", pathwayWeight, record.id);
    if (record.becameContact) addEvidence(scores, "connector", 3, record.id);
    if (record.currentStatus === "loaned" || record.currentStatus === "released") {
      addEvidence(scores, "guardian", 1, record.id);
    }
  }

  const presentedMoments = [...(state.careerMoments?.history ?? [])]
    .filter((delivery) => delivery.status === "presented")
    .sort(compareMomentDate);
  for (const { moment } of presentedMoments) {
    if (["conviction", "vindication", "failure", "comeback"].includes(moment.category)) {
      addEvidence(scores, "calibrator", moment.magnitude === "careerDefining" ? 3 : 1, moment.id);
    }
    const text = [moment.title, moment.summary, ...moment.tags].join(" ");
    if (includesAny(text, ["welfare", "family", "support", "protect", "duty"])) {
      addEvidence(scores, "guardian", 2, moment.id);
    }
    if (includesAny(text, ["pathway", "academy", "loan", "development"])) {
      addEvidence(scores, "pathwayBuilder", 2, moment.id);
    }
    if (includesAny(text, ["relationship", "trust", "contact", "rival"])) {
      addEvidence(scores, "connector", 2, moment.id);
    }
  }

  const leadership = state.leadershipPortfolio?.trackRecord;
  if (leadership) {
    const successes = leadership.ownedSuccesses + leadership.delegatedSuccesses;
    const failures = leadership.ownedFailures + leadership.delegatedFailures;
    const handled = successes + failures + leadership.deferrals + leadership.rejected + leadership.expired;
    if (handled > 0) {
      addEvidence(
        scores,
        "departmentSteward",
        2 + successes * 2 + Math.min(2, failures),
        "leadership-track-record",
      );
    }
  }

  const canUseFullFingerprint = Boolean(
    state.runManifest
    && state.rivalOrganizationState?.currentPressure
    && state.consequenceState
    && state.contacts
    && state.regionalKnowledge
    && state.countries
    && state.assistantScouts
    && state.npcScouts,
  );
  const fallbackCountries = Object.values(state.scout.countryReputations ?? {})
    .filter((country) => country.familiarity > 0)
    .sort((left, right) =>
      right.familiarity - left.familiarity || left.country.localeCompare(right.country));
  const fallbackFingerprintAuthority: CareerFingerprintAuthority = {
    careerPath: state.scout.careerPath,
    careerTier: state.scout.careerTier,
    territory: fallbackCountries.length > 0
      ? {
          posture: fallbackCountries.some((country) => country.familiarity >= 60)
            ? "specialist"
            : "selective",
          primaryCountryId: fallbackCountries[0]?.country,
          coveredCountryCount: fallbackCountries.length,
          deepCountryCount: fallbackCountries.filter((country) => country.familiarity >= 60).length,
          contestedCountryIds: [],
          staleCountryIds: [],
        }
      : undefined,
  };
  const fingerprintAuthority = canUseFullFingerprint
    ? deriveCareerFingerprintAuthority(state)
    : fallbackFingerprintAuthority;
  const fingerprint = deriveCareerFingerprintProjection(fingerprintAuthority);
  const fingerprintEvidenceId = `fingerprint:${fingerprint.fingerprintId}`;
  const territory = fingerprintAuthority.territory;
  if (territory) {
    const territoryScore = territory.coveredCountryCount
      + territory.deepCountryCount * 2
      + (territory.primaryCountryId ? 1 : 0);
    if (territoryScore > 0) {
      addEvidence(scores, "territoryReader", territoryScore, fingerprintEvidenceId);
    }
  }
  if ((fingerprintAuthority.relationships?.persistentStakeholderKinds.length ?? 0) > 0) {
    addEvidence(
      scores,
      "connector",
      fingerprintAuthority.relationships?.persistentStakeholderKinds.length ?? 0,
      fingerprintEvidenceId,
    );
  }
  if (state.scout.careerTier >= 4) {
    addEvidence(scores, "departmentSteward", state.scout.careerTier - 2, fingerprintEvidenceId);
  }

  // Every completed career has at least an operating identity. This fallback is
  // visible run identity, not invented career evidence.
  if (PILLAR_ORDER.every((pillar) => scores[pillar].score === 0)) {
    addEvidence(scores, "calibrator", 1, fingerprintEvidenceId);
  }

  const publicEvidence = createPublicEvidenceArchive(scores, fingerprint.fingerprintId);
  const signature = deriveSignatureFromPublicEvidence(publicEvidence);
  const primaryDefinition = PILLAR_DEFINITIONS[signature.pillars[0]];

  const latestDefiningMoment = presentedMoments.find(({ moment }) =>
    moment.category === "farewell" || moment.magnitude === "careerDefining");
  const finalEvidenceIds = [
    ...(latestDefiningMoment ? [latestDefiningMoment.moment.id] : []),
    ...signature.evidenceIds,
  ].filter((id, index, all) => all.indexOf(id) === index).slice(0, 4);
  const scoutName = `${state.scout.firstName} ${state.scout.lastName}`;

  return {
    signature,
    finalChapter: {
      title: latestDefiningMoment?.moment.title ?? `${scoutName}'s final chapter`,
      summary: latestDefiningMoment?.moment.summary
        ?? `${scoutName} leaves the game as ${primaryDefinition.title.toLowerCase()}: ${primaryDefinition.identity}.`,
      evidenceIds: finalEvidenceIds,
    },
  };
}

/** Resolve the newest completed career's narrative identity for New Game+ UI copy. */
export function getLatestCareerSignatureSummary(
  profile: Pick<LegacyProfile, "completedCareers"> | undefined,
): CareerSignatureLegacySummary | undefined {
  const sourceCareer = profile?.completedCareers[0];
  if (!sourceCareer) return undefined;
  const sourceCareerName = boundedString(sourceCareer.scoutName, MAX_SIGNATURE_TEXT_LENGTH);
  const signature = sanitizeCareerSignature(sourceCareer.signature);
  const finalChapter = sanitizeCareerFinalChapter(sourceCareer.finalChapter);
  if (!sourceCareerName || !signature || !finalChapter) return undefined;
  return {
    sourceCareerName,
    signatureTitle: signature.title,
    signatureSummary: signature.summary,
    finalChapterTitle: finalChapter.title,
    finalChapterSummary: finalChapter.summary,
  };
}
