/**
 * Observation information-gain planner.
 *
 * This module deliberately accepts observations, not Player entities. It can
 * rank where the scout should look next without access to true attributes,
 * current ability, or potential ability.
 */

import {
  ATTRIBUTE_DOMAINS,
  type AttributeDomain,
  type Observation,
  type ObservationContext,
} from "@/engine/core/types";
import type { ObservationSituationSnapshot } from "./situations";

export type ObservationSourceFamily =
  | "live"
  | "video"
  | "training"
  | "academy"
  | "community"
  | "relationship"
  | "data";

interface ContextInformationProfile {
  family: ObservationSourceFamily;
  domains: readonly AttributeDomain[];
}

const CONTEXT_INFORMATION_PROFILES: Record<
  ObservationContext,
  ContextInformationProfile
> = {
  liveMatch: { family: "live", domains: ["technical", "physical", "mental", "tactical"] },
  videoAnalysis: { family: "video", domains: ["technical", "tactical"] },
  trainingGround: { family: "training", domains: ["technical", "physical", "mental", "tactical"] },
  youthTournament: { family: "live", domains: ["technical", "physical", "mental"] },
  academyVisit: { family: "academy", domains: ["technical", "physical", "mental", "tactical"] },
  schoolMatch: { family: "community", domains: ["technical", "physical", "mental"] },
  grassrootsTournament: { family: "community", domains: ["technical", "physical", "mental"] },
  streetFootball: { family: "community", domains: ["technical", "physical", "mental"] },
  academyTrialDay: { family: "academy", domains: ["technical", "physical", "mental", "tactical"] },
  youthFestival: { family: "live", domains: ["technical", "physical", "mental"] },
  followUpSession: { family: "training", domains: ["technical", "physical", "mental", "tactical"] },
  parentCoachMeeting: { family: "relationship", domains: ["mental", "hidden"] },
  reserveMatch: { family: "live", domains: ["technical", "physical", "mental", "tactical"] },
  oppositionAnalysis: { family: "video", domains: ["mental", "tactical"] },
  agentShowcase: { family: "live", domains: ["technical", "physical", "mental"] },
  trialMatch: { family: "live", domains: ["technical", "physical", "mental", "tactical"] },
  databaseQuery: { family: "data", domains: ["technical", "tactical"] },
  statsBriefing: { family: "data", domains: ["technical", "tactical"] },
  deepVideoAnalysis: { family: "data", domains: ["technical", "mental", "tactical"] },
};

const ALL_DOMAINS: readonly AttributeDomain[] = [
  "technical",
  "physical",
  "mental",
  "tactical",
  "hidden",
];

export interface ObservationKnowledgeSummary {
  rawObservationCount: number;
  independentSourceCount: number;
  duplicateObservationCount: number;
  uniqueContextCount: number;
  uniqueSourceFamilyCount: number;
  independentSourcesByContext: Partial<Record<ObservationContext, number>>;
  independentSourcesBySituation: Record<string, number>;
  independentSourcesByDomain: Record<AttributeDomain, number>;
}

export interface ObservationInformationGainRequest {
  observations: readonly Observation[];
  playerId: string;
  candidateContexts: readonly ObservationContext[];
  /** Optional question the scout is trying to answer. */
  targetDomains?: readonly AttributeDomain[];
  /** Optional concrete situations for context choices currently available. */
  candidateSituations?: Partial<Record<ObservationContext, ObservationSituationSnapshot>>;
}

export interface ObservationContextInformationGain {
  context: ObservationContext;
  sourceFamily: ObservationSourceFamily;
  score: number;
  gainBand: "low" | "medium" | "high";
  sameContextIndependentSources: number;
  rawSameContextObservations: number;
  repetitionMultiplier: number;
  contextIsNovel: boolean;
  situationIsNovel: boolean;
  repetitionKey: string;
  sourceFamilyIsNovel: boolean;
  domainNeed: number;
  targetAlignment: number;
  reasons: string[];
}

export function getObservationSourceFamily(
  context: ObservationContext,
): ObservationSourceFamily {
  return CONTEXT_INFORMATION_PROFILES[context].family;
}

/**
 * Resolve the real-world evidence source behind an observation. Multiple
 * player records created from one session or fixture share a key.
 */
export function getObservationIndependenceKey(observation: Observation): string {
  if (observation.sourceSessionId) return `session:${observation.sourceSessionId}`;
  if (observation.matchId) return `match:${observation.matchId}`;
  if (observation.activityInstanceId) return `activity:${observation.activityInstanceId}`;
  return `observation:${observation.id}`;
}

function domainsActuallyObserved(observation: Observation): Set<AttributeDomain> {
  const domains = new Set<AttributeDomain>();
  // Older saves and deliberately sparse historical fixtures can predate the
  // structured evidence arrays. Treat those records as observations with no
  // domain-level evidence rather than making every downstream case view fail.
  for (const reading of observation.attributeReadings ?? []) {
    const domain = ATTRIBUTE_DOMAINS[reading.attribute];
    if (domain) domains.add(domain);
  }
  for (const moment of observation.flaggedMoments ?? []) {
    const domain = ATTRIBUTE_DOMAINS[moment.attribute];
    if (domain) domains.add(domain);
  }
  return domains;
}

export function summarizeObservationKnowledge(
  observations: readonly Observation[],
  playerId: string,
): ObservationKnowledgeSummary {
  const playerObservations = observations.filter(
    (observation) => observation.playerId === playerId,
  );
  const independentKeys = new Set<string>();
  const contexts = new Set<ObservationContext>();
  const families = new Set<ObservationSourceFamily>();
  const contextSources = new Map<ObservationContext, Set<string>>();
  const situationSources = new Map<string, Set<string>>();
  const domainSources = new Map<AttributeDomain, Set<string>>(
    ALL_DOMAINS.map((domain) => [domain, new Set<string>()]),
  );

  for (const observation of playerObservations) {
    const sourceKey = getObservationIndependenceKey(observation);
    independentKeys.add(sourceKey);
    contexts.add(observation.context);
    families.add(getObservationSourceFamily(observation.context));

    const sourcesForContext = contextSources.get(observation.context) ?? new Set<string>();
    sourcesForContext.add(sourceKey);
    contextSources.set(observation.context, sourcesForContext);
    const repetitionKey = observation.situation?.repetitionKey
      ?? `context:${observation.context}`;
    const sourcesForSituation = situationSources.get(repetitionKey) ?? new Set<string>();
    sourcesForSituation.add(sourceKey);
    situationSources.set(repetitionKey, sourcesForSituation);

    for (const domain of domainsActuallyObserved(observation)) {
      domainSources.get(domain)?.add(sourceKey);
    }
  }

  return {
    rawObservationCount: playerObservations.length,
    independentSourceCount: independentKeys.size,
    duplicateObservationCount: playerObservations.length - independentKeys.size,
    uniqueContextCount: contexts.size,
    uniqueSourceFamilyCount: families.size,
    independentSourcesByContext: Object.fromEntries(
      [...contextSources].map(([context, sources]) => [context, sources.size]),
    ),
    independentSourcesBySituation: Object.fromEntries(
      [...situationSources].map(([key, sources]) => [key, sources.size]),
    ),
    independentSourcesByDomain: Object.fromEntries(
      ALL_DOMAINS.map((domain) => [domain, domainSources.get(domain)?.size ?? 0]),
    ) as Record<AttributeDomain, number>,
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundHundredth(value: number): number {
  return Math.round(value * 100) / 100;
}

function scoreContext(
  request: ObservationInformationGainRequest,
  context: ObservationContext,
  summary: ObservationKnowledgeSummary,
): ObservationContextInformationGain {
  const profile = CONTEXT_INFORMATION_PROFILES[context];
  const playerObservations = request.observations.filter(
    (observation) => observation.playerId === request.playerId,
  );
  const sameContextIndependentSources = summary.independentSourcesByContext[context] ?? 0;
  const rawSameContextObservations = playerObservations.filter(
    (observation) => observation.context === context,
  ).length;

  // Strong diminishing returns after each independent source in the same
  // context. Duplicate records from one source do not increase saturation.
  const candidateSituation = request.candidateSituations?.[context];
  const repetitionKey = candidateSituation?.repetitionKey ?? `context:${context}`;
  const sameSituationIndependentSources = summary.independentSourcesBySituation[repetitionKey] ?? 0;
  const repetitionSources = candidateSituation
    ? sameSituationIndependentSources
    : sameContextIndependentSources;
  const repetitionMultiplier = 1 / (1 + repetitionSources * 0.55);
  const contextIsNovel = sameContextIndependentSources === 0;
  const situationIsNovel = sameSituationIndependentSources === 0;
  const seenFamilies = new Set(
    playerObservations.map((observation) => getObservationSourceFamily(observation.context)),
  );
  const sourceFamilyIsNovel = !seenFamilies.has(profile.family);

  const targetDomains = request.targetDomains?.length
    ? [...new Set(request.targetDomains)]
    : [...profile.domains];
  const applicableDomains = profile.domains.filter((domain) => targetDomains.includes(domain));
  const targetAlignment = targetDomains.length > 0
    ? applicableDomains.length / targetDomains.length
    : 1;
  const domainNeed = applicableDomains.length > 0
    ? applicableDomains.reduce((sum, domain) => {
        const independentSources = summary.independentSourcesByDomain[domain] ?? 0;
        return sum + 1 / Math.sqrt(1 + independentSources);
      }, 0) / applicableDomains.length
    : 0;

  const score = Math.round(Math.max(0, Math.min(100,
    repetitionMultiplier * 25
    + domainNeed * 30
    + targetAlignment * 20
    + (contextIsNovel ? 15 : situationIsNovel && candidateSituation ? 8 : 0)
    + (sourceFamilyIsNovel ? 10 : 0),
  )));
  const reasons: string[] = [];
  if (contextIsNovel) reasons.push("Adds an unseen observation context.");
  else if (situationIsNovel && candidateSituation) {
    reasons.push("Revisits a known context under materially different football conditions.");
  }
  if (sourceFamilyIsNovel) reasons.push("Adds an independent evidence family.");
  if (sameContextIndependentSources > 0) {
    reasons.push(
      `${sameContextIndependentSources} independent prior source${sameContextIndependentSources === 1 ? "" : "s"} already cover this context.`,
    );
  }
  if (rawSameContextObservations > sameContextIndependentSources) {
    reasons.push("Duplicate records from the same source do not count as independent evidence.");
  }
  if (applicableDomains.length > 0) {
    reasons.push(`Can inform ${applicableDomains.join(", ")}.`);
  } else {
    reasons.push("Does not directly address the selected scouting question.");
  }

  return {
    context,
    sourceFamily: profile.family,
    score,
    gainBand: score >= 70 ? "high" : score >= 45 ? "medium" : "low",
    sameContextIndependentSources,
    rawSameContextObservations,
    repetitionMultiplier: roundHundredth(clamp01(repetitionMultiplier)),
    contextIsNovel,
    situationIsNovel,
    repetitionKey,
    sourceFamilyIsNovel,
    domainNeed: roundHundredth(clamp01(domainNeed)),
    targetAlignment: roundHundredth(clamp01(targetAlignment)),
    reasons,
  };
}

/** Rank candidate contexts by expected information gain, stably on ties. */
export function rankNextObservationContexts(
  request: ObservationInformationGainRequest,
): ObservationContextInformationGain[] {
  const summary = summarizeObservationKnowledge(request.observations, request.playerId);
  return request.candidateContexts
    .map((context, index) => ({ result: scoreContext(request, context, summary), index }))
    .sort((left, right) => right.result.score - left.result.score || left.index - right.index)
    .map(({ result }) => result);
}

export function getHighestValueNextContext(
  request: ObservationInformationGainRequest,
): ObservationContextInformationGain | null {
  return rankNextObservationContexts(request)[0] ?? null;
}

export type ObservationComparisonVerdict =
  | "supportsPattern"
  | "challengesPattern"
  | "inconclusive";

export interface ObservationContextChange {
  kind: "context" | "competition" | "stakes" | "tacticalFrame" | "country" | "conditions";
  from: string;
  to: string;
  explanation: string;
}

/** A player-safe comparison between two independent observation records. */
export interface FollowUpObservationComparison {
  id: string;
  playerId: string;
  firstObservationId: string;
  secondObservationId: string;
  firstDate: { week: number; season: number };
  secondDate: { week: number; season: number };
  verdict: ObservationComparisonVerdict;
  sharedAttributeCount: number;
  averageConfidence: number;
  confidenceDelta: number;
  contextChanges: ObservationContextChange[];
  contextChanged: boolean;
  independent: boolean;
  summary: string;
}

function displayValue(value: string | undefined): string {
  if (!value) return "unrecorded";
  return value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase();
}

function addContextChange(
  changes: ObservationContextChange[],
  kind: ObservationContextChange["kind"],
  from: string | undefined,
  to: string | undefined,
  explanation: string,
): void {
  if (!from || !to || from === to) return;
  changes.push({ kind, from: displayValue(from), to: displayValue(to), explanation });
}

function deriveContextChanges(
  first: Observation,
  second: Observation,
): ObservationContextChange[] {
  const changes: ObservationContextChange[] = [];
  addContextChange(
    changes,
    "context",
    first.context,
    second.context,
    "The follow-up used a different evidence source or football setting.",
  );
  addContextChange(
    changes,
    "competition",
    first.situation?.competitionLevel,
    second.situation?.competitionLevel,
    "The level of opposition changed the translation test.",
  );
  addContextChange(
    changes,
    "stakes",
    first.situation?.stakes,
    second.situation?.stakes,
    "The personal or competitive stakes changed the pressure around each action.",
  );
  addContextChange(
    changes,
    "tacticalFrame",
    first.situation?.tacticalFrame,
    second.situation?.tacticalFrame,
    "The team shape asked the player to solve a different football problem.",
  );
  addContextChange(
    changes,
    "country",
    first.situation?.countryId,
    second.situation?.countryId,
    "The regional reference point changed and should be interpreted with local knowledge.",
  );
  const firstConditions = first.situation?.repetitionKey;
  const secondConditions = second.situation?.repetitionKey;
  if (
    firstConditions
    && secondConditions
    && firstConditions !== secondConditions
    && changes.length === 0
  ) {
    changes.push({
      kind: "conditions",
      from: displayValue(firstConditions),
      to: displayValue(secondConditions),
      explanation: "Visible match conditions changed enough to make this a new comparison.",
    });
  }
  return changes;
}

function averageReadingConfidence(observation: Observation): number {
  const readings = observation.attributeReadings ?? [];
  if (readings.length === 0) return 0;
  return readings.reduce((sum, reading) => sum + reading.confidence, 0)
    / readings.length;
}

/**
 * Compare two observations without consulting player truth. Agreement means
 * the scout's independent estimates held; it never confirms future ability.
 */
export function compareObservationEvidence(
  first: Observation,
  second: Observation,
): FollowUpObservationComparison {
  if (first.playerId !== second.playerId) {
    throw new RangeError("Observation comparisons require the same player.");
  }
  const firstByAttribute = new Map(
    (first.attributeReadings ?? []).map((reading) => [reading.attribute, reading]),
  );
  const shared = (second.attributeReadings ?? []).flatMap((reading) => {
    const prior = firstByAttribute.get(reading.attribute);
    return prior ? [{ first: prior, second: reading }] : [];
  });
  const confidence = shared.length > 0
    ? shared.reduce((sum, pair) => sum + (pair.first.confidence + pair.second.confidence) / 2, 0) / shared.length
    : (averageReadingConfidence(first) + averageReadingConfidence(second)) / 2;
  const averageDifference = shared.length > 0
    ? shared.reduce(
        (sum, pair) => sum + Math.abs(pair.second.perceivedValue - pair.first.perceivedValue),
        0,
      ) / shared.length
    : Number.POSITIVE_INFINITY;
  const independent = getObservationIndependenceKey(first) !== getObservationIndependenceKey(second);
  const verdict: ObservationComparisonVerdict = !independent
    || shared.length === 0
    || confidence < 0.42
      ? "inconclusive"
      : averageDifference <= 1.75
        ? "supportsPattern"
        : averageDifference >= 3
          ? "challengesPattern"
          : "inconclusive";
  const contextChanges = deriveContextChanges(first, second);
  const firstConfidence = averageReadingConfidence(first);
  const secondConfidence = averageReadingConfidence(second);
  const summary = verdict === "supportsPattern"
    ? contextChanges.length > 0
      ? "The scout's read held across a materially different context, strengthening it as a working pattern."
      : "The follow-up broadly agreed, but the repeated context limits how much new certainty it adds."
    : verdict === "challengesPattern"
      ? "The follow-up challenged the earlier estimate; the disagreement should remain open until another independent test."
      : shared.length === 0
        ? "The two observations covered different questions, so they cannot yet be treated as confirmation or contradiction."
        : !independent
          ? "Both records came from the same source and cannot count as independent confirmation."
          : "The shared evidence is too weak or mixed to settle whether the pattern held.";

  return {
    id: `comparison:${first.id}:${second.id}`,
    playerId: first.playerId,
    firstObservationId: first.id,
    secondObservationId: second.id,
    firstDate: { week: first.week, season: first.season },
    secondDate: { week: second.week, season: second.season },
    verdict,
    sharedAttributeCount: shared.length,
    averageConfidence: roundHundredth(clamp01(confidence)),
    confidenceDelta: roundHundredth(secondConfidence - firstConfidence),
    contextChanges,
    contextChanged: contextChanges.length > 0,
    independent,
    summary,
  };
}

/** Build the latest bounded sequence of independent, chronological comparisons. */
export function buildFollowUpObservationComparisons(
  observations: readonly Observation[],
  playerId: string,
  limit = 3,
): FollowUpObservationComparison[] {
  if (limit <= 0) return [];
  const seenSources = new Set<string>();
  const independent = observations
    .filter((observation) => observation.playerId === playerId)
    .sort((left, right) =>
      left.season - right.season
      || left.week - right.week
      || left.id.localeCompare(right.id),
    )
    .filter((observation) => {
      const source = getObservationIndependenceKey(observation);
      if (seenSources.has(source)) return false;
      seenSources.add(source);
      return true;
    });
  const comparisons: FollowUpObservationComparison[] = [];
  for (let index = 1; index < independent.length; index += 1) {
    comparisons.push(compareObservationEvidence(independent[index - 1], independent[index]));
  }
  return comparisons.slice(-limit);
}
