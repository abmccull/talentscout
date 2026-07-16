import type { EventChain, NarrativeEvent, StorylineState } from "@/engine/core/types";
import { createNamedRNG } from "@/engine/run";
import { elapsedGameWeeks } from "@/engine/consequences/decisionLedger";
import type { EntityRef, GameDate } from "@/engine/consequences/types";

export const STORY_DIRECTOR_V2_VERSION = 2 as const;
export const STORY_DIRECTOR_V2_MAX_ACTIVE_CHOICES = 2;
export const STORY_DIRECTOR_V2_MAX_CALLBACK_FINGERPRINTS = 1024;

export type StoryCandidateKind =
  | "standalone"
  | "chain"
  | "storyline"
  | "special"
  | "callback"
  | "worldArc";

export interface StoryCandidateV2 {
  id: string;
  templateId: string;
  kind: StoryCandidateKind;
  category: string;
  semanticSignature: string;
  baseWeight: number;
  cast: EntityRef[];
  topics: EntityRef[];
  continuation?: boolean;
  critical?: boolean;
  requiresChoice?: boolean;
  callbackFingerprint?: string;
  careerLimit?: number;
  templateCooldownWeeks?: number;
  semanticCooldownWeeks?: number;
  castWindowWeeks?: number;
  castMaxUses?: number;
  topicCooldownWeeks?: number;
  relevanceMultipliers?: readonly number[];
}

export interface StoryDirectorOccurrenceV2 {
  candidateId: string;
  templateId: string;
  kind: StoryCandidateKind;
  category: string;
  semanticSignature: string;
  occurredAt: GameDate;
  castKeys: string[];
  topicKeys: string[];
  callbackFingerprint?: string;
}

export interface StoryDirectorStateV2 {
  version: typeof STORY_DIRECTOR_V2_VERSION;
  recentTemplates: Record<string, GameDate[]>;
  recentSignatures: Record<string, GameDate[]>;
  castUsage: Record<string, GameDate[]>;
  topicUsage: Record<string, GameDate[]>;
  callbackFingerprints: string[];
  occurrenceCounts: Record<string, number>;
  recentOccurrences: StoryDirectorOccurrenceV2[];
  totalSelections: number;
}

export interface StoryCandidateScoreV2 {
  candidate: StoryCandidateV2;
  eligible: boolean;
  score: number;
  blockedReasons: string[];
  noveltyMultiplier: number;
}

export interface StorySelectionV2 {
  selected?: StoryCandidateV2;
  scored: StoryCandidateScoreV2[];
}

interface LegacyStoryCandidateInput {
  source: NarrativeEvent | EventChain | StorylineState;
  kind?: StoryCandidateKind;
  templateId?: string;
  category?: string;
  semanticSignature?: string;
  cast?: EntityRef[];
  topics?: EntityRef[];
  baseWeight?: number;
  callbackFingerprint?: string;
  continuation?: boolean;
}

function entityKey(entity: EntityRef): string {
  return `${entity.kind}:${entity.id}`;
}

function finitePositive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function safeDates(value: unknown): GameDate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Partial<GameDate>;
    if (!Number.isFinite(candidate.week) || !Number.isFinite(candidate.season)) return [];
    return [{ week: Math.max(1, Math.floor(candidate.week!)), season: Math.max(1, Math.floor(candidate.season!)) }];
  }).slice(-8);
}

function safeDateLedger(value: unknown): Record<string, GameDate[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([key, dates]) => {
    const safe = safeDates(dates);
    return key.trim() && safe.length > 0 ? [[key, safe]] : [];
  }));
}

const STORY_KINDS: ReadonlySet<string> = new Set<StoryCandidateKind>([
  "standalone",
  "chain",
  "storyline",
  "special",
  "callback",
  "worldArc",
]);

function safeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string =>
        typeof entry === "string" && entry.trim().length > 0,
      ))].sort()
    : [];
}

function safeOccurrences(value: unknown): StoryDirectorOccurrenceV2[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const candidate = entry as Partial<StoryDirectorOccurrenceV2>;
    const occurredAt = safeDates([candidate.occurredAt])[0];
    if (
      typeof candidate.candidateId !== "string"
      || typeof candidate.templateId !== "string"
      || typeof candidate.category !== "string"
      || typeof candidate.semanticSignature !== "string"
      || typeof candidate.kind !== "string"
      || !STORY_KINDS.has(candidate.kind)
      || !occurredAt
    ) return [];
    return [{
      candidateId: candidate.candidateId,
      templateId: candidate.templateId,
      kind: candidate.kind as StoryCandidateKind,
      category: candidate.category,
      semanticSignature: candidate.semanticSignature,
      occurredAt,
      castKeys: safeStringArray(candidate.castKeys),
      topicKeys: safeStringArray(candidate.topicKeys),
      ...(typeof candidate.callbackFingerprint === "string"
        ? { callbackFingerprint: candidate.callbackFingerprint }
        : {}),
    }];
  }).slice(-64);
}

export function createStoryDirectorStateV2(
  partial: Partial<StoryDirectorStateV2> = {},
): StoryDirectorStateV2 {
  const callbackFingerprints = Array.isArray(partial.callbackFingerprints)
    ? [...new Set(partial.callbackFingerprints.filter((value): value is string =>
        typeof value === "string" && value.trim().length > 0,
      ))].slice(-STORY_DIRECTOR_V2_MAX_CALLBACK_FINGERPRINTS)
    : [];
  const occurrenceCounts = Object.fromEntries(Object.entries(partial.occurrenceCounts ?? {})
    .flatMap(([key, value]) =>
      key.trim() && Number.isFinite(value) && value >= 0
        ? [[key, Math.floor(value)]]
        : [],
    ));
  return {
    version: STORY_DIRECTOR_V2_VERSION,
    recentTemplates: safeDateLedger(partial.recentTemplates),
    recentSignatures: safeDateLedger(partial.recentSignatures),
    castUsage: safeDateLedger(partial.castUsage),
    topicUsage: safeDateLedger(partial.topicUsage),
    callbackFingerprints,
    occurrenceCounts,
    recentOccurrences: safeOccurrences(partial.recentOccurrences),
    totalSelections: Number.isFinite(partial.totalSelections)
      ? Math.max(0, Math.floor(partial.totalSelections!))
      : 0,
  };
}

export function migrateStoryDirectorStateV2(raw: unknown): StoryDirectorStateV2 {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? createStoryDirectorStateV2(raw as Partial<StoryDirectorStateV2>)
    : createStoryDirectorStateV2();
}

function usesWithin(
  dates: readonly GameDate[] | undefined,
  now: GameDate,
  windowWeeks: number,
  seasonLength: number,
): number {
  return (dates ?? []).filter((date) =>
    elapsedGameWeeks(now, date, seasonLength) >= 0
    && elapsedGameWeeks(now, date, seasonLength) < windowWeeks,
  ).length;
}

function defaultTemplateCooldown(candidate: StoryCandidateV2, seasonLength: number): number {
  if (candidate.kind === "special") return seasonLength * 2;
  if (candidate.kind === "chain" || candidate.kind === "storyline") return seasonLength;
  if (candidate.kind === "callback") return 4;
  if (candidate.kind === "worldArc") return Math.ceil(seasonLength / 2);
  return 10;
}

function relevantProduct(values: readonly number[] | undefined): number {
  return (values ?? []).reduce((product, raw) => {
    const value = Number.isFinite(raw) ? raw : 1;
    return product * Math.max(0, Math.min(4, value));
  }, 1);
}

export function scoreStoryCandidatesV2(input: {
  state: StoryDirectorStateV2;
  now: GameDate;
  candidates: readonly StoryCandidateV2[];
  activeChoiceCount?: number;
  seasonLength?: number;
}): StoryCandidateScoreV2[] {
  const seasonLength = Math.max(1, Math.floor(input.seasonLength ?? 38));
  const callbackSet = new Set(input.state.callbackFingerprints);
  return [...input.candidates]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((candidate) => {
      const reasons: string[] = [];
      const continuation = candidate.continuation === true;
      if (
        !continuation
        && !candidate.critical
        && candidate.requiresChoice
        && (input.activeChoiceCount ?? 0) >= STORY_DIRECTOR_V2_MAX_ACTIVE_CHOICES
      ) reasons.push("choice-overload");
      if (candidate.callbackFingerprint && callbackSet.has(candidate.callbackFingerprint)) {
        reasons.push("callback-already-shown");
      }
      const count = input.state.occurrenceCounts[candidate.templateId] ?? 0;
      if (candidate.careerLimit !== undefined && count >= candidate.careerLimit) {
        reasons.push("career-limit");
      }
      if (!continuation) {
        const templateCooldown = Math.max(
          0,
          Math.floor(candidate.templateCooldownWeeks
            ?? defaultTemplateCooldown(candidate, seasonLength)),
        );
        if (usesWithin(input.state.recentTemplates[candidate.templateId], input.now, templateCooldown, seasonLength) > 0) {
          reasons.push("template-cooldown");
        }
        const semanticCooldown = Math.max(0, Math.floor(candidate.semanticCooldownWeeks ?? 12));
        if (usesWithin(input.state.recentSignatures[candidate.semanticSignature], input.now, semanticCooldown, seasonLength) > 0) {
          reasons.push("semantic-repeat");
        }
        const castWindow = Math.max(1, Math.floor(candidate.castWindowWeeks ?? 8));
        const castMaxUses = Math.max(1, Math.floor(candidate.castMaxUses ?? 2));
        if (candidate.cast.some((entity) =>
          usesWithin(input.state.castUsage[entityKey(entity)], input.now, castWindow, seasonLength) >= castMaxUses,
        )) reasons.push("cast-overuse");
        const topicWindow = Math.max(1, Math.floor(candidate.topicCooldownWeeks ?? 8));
        if (candidate.topics.some((entity) =>
          usesWithin(input.state.topicUsage[entityKey(entity)], input.now, topicWindow, seasonLength) > 0,
        )) reasons.push("topic-repeat");
      }
      const noveltyMultiplier = 1 / Math.sqrt(1 + count * 0.8);
      const score = reasons.length === 0
        ? finitePositive(candidate.baseWeight, 1)
          * noveltyMultiplier
          * relevantProduct(candidate.relevanceMultipliers)
        : 0;
      return {
        candidate,
        eligible: reasons.length === 0 && score > 0,
        score: Number(score.toFixed(6)),
        blockedReasons: reasons,
        noveltyMultiplier: Number(noveltyMultiplier.toFixed(6)),
      };
    });
}

/** Stable weighted selection. Candidate input order cannot change the result. */
export function selectStoryCandidateV2(input: {
  rootSeed: string;
  state: StoryDirectorStateV2;
  now: GameDate;
  candidates: readonly StoryCandidateV2[];
  activeChoiceCount?: number;
  seasonLength?: number;
}): StorySelectionV2 {
  const scored = scoreStoryCandidatesV2(input);
  const eligible = scored.filter((entry) => entry.eligible);
  const total = eligible.reduce((sum, entry) => sum + entry.score, 0);
  if (total <= 0) return { scored };
  const candidateFingerprint = eligible.map((entry) => entry.candidate.id).join("|");
  const rng = createNamedRNG(
    input.rootSeed,
    "story-director-v2-selection",
    input.now.season,
    input.now.week,
    candidateFingerprint,
  );
  let threshold = rng.next() * total;
  for (const entry of eligible) {
    threshold -= entry.score;
    if (threshold <= 0) return { selected: entry.candidate, scored };
  }
  return { selected: eligible.at(-1)?.candidate, scored };
}

function appendDate(
  ledger: Record<string, GameDate[]>,
  key: string,
  date: GameDate,
): Record<string, GameDate[]> {
  return {
    ...ledger,
    [key]: [...(ledger[key] ?? []), { ...date }].slice(-8),
  };
}

export function recordStorySelectionV2(
  state: StoryDirectorStateV2,
  candidate: StoryCandidateV2,
  occurredAt: GameDate,
): StoryDirectorStateV2 {
  const castKeys = [...new Set(candidate.cast.map(entityKey))].sort();
  const topicKeys = [...new Set(candidate.topics.map(entityKey))].sort();
  let castUsage = state.castUsage;
  let topicUsage = state.topicUsage;
  for (const key of castKeys) castUsage = appendDate(castUsage, key, occurredAt);
  for (const key of topicKeys) topicUsage = appendDate(topicUsage, key, occurredAt);
  const occurrence: StoryDirectorOccurrenceV2 = {
    candidateId: candidate.id,
    templateId: candidate.templateId,
    kind: candidate.kind,
    category: candidate.category,
    semanticSignature: candidate.semanticSignature,
    occurredAt: { ...occurredAt },
    castKeys,
    topicKeys,
    callbackFingerprint: candidate.callbackFingerprint,
  };
  return {
    ...state,
    recentTemplates: appendDate(state.recentTemplates, candidate.templateId, occurredAt),
    recentSignatures: appendDate(state.recentSignatures, candidate.semanticSignature, occurredAt),
    castUsage,
    topicUsage,
    callbackFingerprints: candidate.callbackFingerprint
      ? [...new Set([...state.callbackFingerprints, candidate.callbackFingerprint])]
          .slice(-STORY_DIRECTOR_V2_MAX_CALLBACK_FINGERPRINTS)
      : state.callbackFingerprints,
    occurrenceCounts: {
      ...state.occurrenceCounts,
      [candidate.templateId]: (state.occurrenceCounts[candidate.templateId] ?? 0) + 1,
    },
    recentOccurrences: [...state.recentOccurrences, occurrence].slice(-64),
    totalSelections: state.totalSelections + 1,
  };
}

function isNarrativeEvent(source: LegacyStoryCandidateInput["source"]): source is NarrativeEvent {
  return "type" in source && "relatedIds" in source;
}

function isEventChain(source: LegacyStoryCandidateInput["source"]): source is EventChain {
  return "templateKey" in source;
}

/** Adapter for existing standalone, chain, storyline and special content. */
export function adaptLegacyStoryCandidate(input: LegacyStoryCandidateInput): StoryCandidateV2 {
  const source = input.source;
  if (isNarrativeEvent(source)) {
    const inferredKind: StoryCandidateKind = input.kind
      ?? (source.specialEventId ? "special" : source.chainId ? "chain" : source.storylineId ? "storyline" : "standalone");
    const templateId = input.templateId ?? source.specialEventId
      ?? source.chainId
      ?? source.storylineId
      ?? source.type;
    return {
      id: source.id,
      templateId,
      kind: inferredKind,
      category: input.category ?? source.type,
      semanticSignature: input.semanticSignature ?? `${inferredKind}:${source.type}`,
      baseWeight: input.baseWeight ?? 1,
      cast: [...(input.cast ?? [])],
      topics: [...(input.topics ?? source.relatedIds.map((id) => ({ kind: "entity", id })))],
      callbackFingerprint: input.callbackFingerprint,
      continuation: input.continuation,
      requiresChoice: (source.choices?.length ?? 0) > 0,
    };
  }
  if (isEventChain(source)) {
    return {
      id: source.id,
      templateId: input.templateId ?? source.templateKey,
      kind: input.kind ?? "chain",
      category: input.category ?? "eventChain",
      semanticSignature: input.semanticSignature ?? `chain:${source.templateKey}`,
      baseWeight: input.baseWeight ?? 1,
      cast: [...(input.cast ?? [])],
      topics: [...(input.topics ?? [])],
      continuation: input.continuation ?? source.eventIds.length > 1,
      callbackFingerprint: input.callbackFingerprint,
    };
  }
  return {
    id: source.id,
    templateId: input.templateId ?? source.templateId,
    kind: input.kind ?? "storyline",
    category: input.category ?? "storyline",
    semanticSignature: input.semanticSignature ?? `storyline:${source.templateId}`,
    baseWeight: input.baseWeight ?? 1,
    cast: [...(input.cast ?? [])],
    topics: [...(input.topics ?? [])],
    continuation: input.continuation ?? source.currentStage > 0,
    callbackFingerprint: input.callbackFingerprint,
  };
}
