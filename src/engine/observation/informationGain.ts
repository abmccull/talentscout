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
  independentSourcesByDomain: Record<AttributeDomain, number>;
}

export interface ObservationInformationGainRequest {
  observations: readonly Observation[];
  playerId: string;
  candidateContexts: readonly ObservationContext[];
  /** Optional question the scout is trying to answer. */
  targetDomains?: readonly AttributeDomain[];
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
  for (const reading of observation.attributeReadings) {
    const domain = ATTRIBUTE_DOMAINS[reading.attribute];
    if (domain) domains.add(domain);
  }
  for (const moment of observation.flaggedMoments) {
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
  const repetitionMultiplier = 1 / (1 + sameContextIndependentSources * 0.55);
  const contextIsNovel = sameContextIndependentSources === 0;
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
    + (contextIsNovel ? 15 : 0)
    + (sourceFamilyIsNovel ? 10 : 0),
  )));
  const reasons: string[] = [];
  if (contextIsNovel) reasons.push("Adds an unseen observation context.");
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

