import type {
  EventChain,
  GameState,
  NarrativeEvent,
  NarrativeEventType,
  RivalScout,
} from "@/engine/core/types";
import {
  EVENT_TEMPLATES,
  SCOUTING_SPECIAL_EVENT_DECK,
  createEventDirectorState,
  directWeeklyNarrativeEvent,
  resolveChainChoice,
  selectScoutingSpecialEvent,
} from "@/engine/events";
import { RNG } from "@/engine/rng";
import {
  RIVAL_ORGANIZATION_DEFINITIONS,
  getRivalOrganizationContentDefinitionIds,
  initializeRivalOrganizations,
  processRivalOrganizationWeek,
} from "@/engine/rivals";
import {
  SCOUT_DOCTRINES,
  SCOUT_FLAWS,
  SCOUT_ORIGINS,
  WORLD_TRAITS,
  createNamedRNG,
  createRunManifest,
  deriveWorldTraitIds,
  getScoutIdentityContentDefinitionIds,
  getWorldTraitContentDefinitionIds,
  stableFingerprint,
} from "@/engine/run";
import { getRunContentDefinitionIds } from "@/engine/content/registry";
import { getWorldConditionContentDefinitionIds } from "@/engine/world";

const TELEMETRY_VERSION = 2 as const;
const ACTIVE_RIVAL_ORGANIZATION_COUNT = 3;

export interface ReplayabilityTelemetryConfig {
  sampleSize: number;
  seasons: number;
  weeksPerSeason: number;
  seedPrefix: string;
}

export interface ReplayabilityReleaseThresholds {
  minimumSampleSize: number;
  minimumSeasons: number;
  minimumManifestUniqueRatio: number;
  minimumCompositeTrajectoryUniqueRatio: number;
  minimumWorldCombinationCoverage: number;
  minimumIdentityCatalogCoverage: number;
  minimumRivalArchetypeCoverage: number;
  minimumRivalSetCombinationCoverage: number;
  minimumEventTrajectoryUniqueRatio: number;
  minimumSpecialTrajectoryUniqueRatio: number;
  minimumEventCatalogCoverage: number;
  minimumAverageTrajectoryDistance: number;
  maximumAverageTrajectoryOverlap: number;
  maximumAdjacentEventRepeatRate: number;
  maximumSpecialEventShortWindowRepeatRate: number;
  maximumMechanicallyDominantEventRate: number;
  maximumDeadDirectorStateRate: number;
  maximumRunawayDirectorStateRate: number;
  maximumLongTensionCapRunRate: number;
  minimumExplicitTradeoffRate: number;
}

export const REPLAYABILITY_RELEASE_THRESHOLDS: ReplayabilityReleaseThresholds = {
  minimumSampleSize: 100,
  minimumSeasons: 3,
  minimumManifestUniqueRatio: 1,
  minimumCompositeTrajectoryUniqueRatio: 0.9,
  minimumWorldCombinationCoverage: 0.875,
  minimumIdentityCatalogCoverage: 1,
  minimumRivalArchetypeCoverage: 1,
  minimumRivalSetCombinationCoverage: 0.65,
  minimumEventTrajectoryUniqueRatio: 0.85,
  minimumSpecialTrajectoryUniqueRatio: 0.55,
  minimumEventCatalogCoverage: 0.7,
  minimumAverageTrajectoryDistance: 0.5,
  maximumAverageTrajectoryOverlap: 0.5,
  maximumAdjacentEventRepeatRate: 0.08,
  maximumSpecialEventShortWindowRepeatRate: 0.05,
  maximumMechanicallyDominantEventRate: 0.2,
  maximumDeadDirectorStateRate: 0,
  maximumRunawayDirectorStateRate: 0,
  maximumLongTensionCapRunRate: 0.05,
  minimumExplicitTradeoffRate: 1,
};

export const REPLAYABILITY_NIGHTLY_THRESHOLDS: ReplayabilityReleaseThresholds = {
  ...REPLAYABILITY_RELEASE_THRESHOLDS,
  minimumSampleSize: 1_000,
  minimumSeasons: 10,
  // Long samples expose rare states more honestly as season-state rates. These
  // caps allow at most 25 dead and 10 runaway states per 10,000 seasons.
  maximumDeadDirectorStateRate: 0.0025,
  maximumRunawayDirectorStateRate: 0.001,
};

export interface ReplayabilitySemanticTrajectory {
  worldTraitIds: readonly string[];
  originId: string;
  flawId: string;
  doctrineId: string;
  rivalArchetypeIds: readonly string[];
  rivalActionTokens: readonly string[];
  eventTokens: readonly string[];
  sampledSpecialEventIds: readonly string[];
  /** Diagnostic identity is accepted for callers but deliberately excluded. */
  diagnosticMetadata?: {
    rootSeed?: string;
    runId?: string;
    generatedIds?: readonly string[];
    generatedNames?: readonly string[];
    timestamps?: readonly string[];
  };
}

function semanticTrajectoryProjection(input: ReplayabilitySemanticTrajectory) {
  return {
    worldTraitIds: [...input.worldTraitIds].sort(),
    originId: input.originId,
    flawId: input.flawId,
    doctrineId: input.doctrineId,
    rivalArchetypeIds: [...input.rivalArchetypeIds].sort(),
    rivalActionTokens: [...input.rivalActionTokens],
    eventTokens: [...input.eventTokens],
    sampledSpecialEventIds: [...input.sampledSpecialEventIds],
  };
}

/** Fingerprint only player-meaningful configuration and ordered outcomes. */
export function buildSemanticTrajectoryFingerprint(
  input: ReplayabilitySemanticTrajectory,
): string {
  return stableFingerprint(semanticTrajectoryProjection(input));
}

/** Pairwise-distance tokens use the same ID-free semantic projection. */
export function buildSemanticTrajectoryComparisonTokens(
  input: ReplayabilitySemanticTrajectory,
): string[] {
  const projected = semanticTrajectoryProjection(input);
  return [
    ...projected.worldTraitIds.map((id) => `trait:${id}`),
    `origin:${projected.originId}`,
    `flaw:${projected.flawId}`,
    `doctrine:${projected.doctrineId}`,
    ...projected.rivalArchetypeIds.map((id) => `rival-archetype:${id}`),
    ...projected.eventTokens.map((token, index) => `event-${index}:${token}`),
    ...projected.rivalActionTokens.map((token, index) =>
      `rival-action-${index}:${token}`,
    ),
    ...projected.sampledSpecialEventIds.map((id, index) =>
      `special-${index}:${id}`,
    ),
  ];
}

interface RunTrace {
  manifestFingerprint: string;
  worldTraitIds: string[];
  originId: string;
  flawId: string;
  doctrineId: string;
  rivalArchetypeIds: string[];
  rivalActionTokens: string[];
  eventTokens: string[];
  eventTypes: NarrativeEventType[];
  directorSpecialEventIds: string[];
  sampledSpecialEventIds: string[];
  choiceOpportunityCount: number;
  rivalOpportunityCount: number;
  rivalOpportunitiesWithExplicitTradeoffs: number;
  seasonEventCounts: number[];
  maximumQuietWeeks: number;
  maximumTension: number;
  maximumTensionCapStreak: number;
  deadDirectorSeasons: number;
  runawayDirectorSeasons: number;
  deadDirector: boolean;
  runawayDirector: boolean;
  compositeTrajectoryFingerprint: string;
  eventTrajectoryFingerprint: string;
  specialTrajectoryFingerprint: string;
  comparisonTokens: string[];
}

export interface ReplayabilityTelemetryMetrics {
  sameSeedReplayEqual: boolean;
  manifestUniqueRatio: number;
  compositeTrajectoryUniqueRatio: number;
  worldCombinationCoverage: number;
  originCatalogCoverage: number;
  flawCatalogCoverage: number;
  doctrineCatalogCoverage: number;
  rivalArchetypeCoverage: number;
  rivalSetCombinationCoverage: number;
  eventTrajectoryUniqueRatio: number;
  specialTrajectoryUniqueRatio: number;
  eventCatalogCoverage: number;
  averageTrajectoryDistance: number;
  averageTrajectoryOverlap: number;
  averageEventTypeSetOverlap: number;
  /** Broad taxonomy reuse, including intentional consecutive chain stages. */
  adjacentEventTypeRepeatRate: number;
  /** Semantic beat reuse; chain stage is part of the identity. */
  adjacentEventRepeatRate: number;
  specialEventShortWindowRepeatRate: number;
  specialEventLifetimeRepeatRate: number;
  mechanicallyDominantEventRate: number;
  deadDirectorRunRate: number;
  runawayDirectorRunRate: number;
  deadDirectorStateRate: number;
  runawayDirectorStateRate: number;
  explicitTradeoffRate: number;
  choiceOpportunityCount: number;
  rivalOpportunityCount: number;
  eventCountRange: { minimum: number; maximum: number };
  maximumQuietWeeks: number;
  maximumTensionCapStreak: number;
  longTensionCapRunRate: number;
}

export interface ReplayabilityTelemetryDistributions {
  worldTraitCombinations: Record<string, number>;
  origins: Record<string, number>;
  flaws: Record<string, number>;
  doctrines: Record<string, number>;
  rivalOrganizationSets: Record<string, number>;
  rivalArchetypes: Record<string, number>;
  eventTypes: Record<string, number>;
  directorSpecialEvents: Record<string, number>;
  sampledSpecialEvents: Record<string, number>;
}

export interface ReplayabilityTelemetryArtifact {
  schemaVersion: typeof TELEMETRY_VERSION;
  config: ReplayabilityTelemetryConfig;
  thresholds: ReplayabilityReleaseThresholds;
  metrics: ReplayabilityTelemetryMetrics;
  distributions: ReplayabilityTelemetryDistributions;
  failures: string[];
  balanceObservations: string[];
  passed: boolean;
  sampleFingerprints: string[];
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive integer`);
  }
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10_000) / 10_000;
}

/**
 * Semantic event identity for trajectory and repeat analysis. Multi-week
 * chains intentionally reuse a broad event type while moving through distinct
 * warning, decision, and payoff stages; counting those stages as identical
 * would measure taxonomy reuse rather than repeated gameplay.
 */
function narrativeReplayToken(event: NarrativeEvent): string {
  if (event.specialEventId) return `special:${event.specialEventId}`;
  if (event.chainId && event.chainStep !== undefined) {
    return `chain:${event.type}:step-${event.chainStep}`;
  }
  return `event:${event.type}`;
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.round(
    (values.reduce((sum, value) => sum + value, 0) / values.length) * 10_000,
  ) / 10_000;
}

function combinations(total: number, selected: number): number {
  if (selected < 0 || selected > total) return 0;
  let result = 1;
  for (let index = 1; index <= selected; index++) {
    result = result * (total - selected + index) / index;
  }
  return Math.round(result);
}

function histogram(values: readonly string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  ));
}

function setOverlap(leftValues: readonly string[], rightValues: readonly string[]): number {
  const left = new Set(leftValues);
  const right = new Set(rightValues);
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 1;
  let intersection = 0;
  for (const value of left) {
    if (right.has(value)) intersection += 1;
  }
  return intersection / union.size;
}

function pairwiseAverage(
  traces: readonly RunTrace[],
  selector: (trace: RunTrace) => readonly string[],
): number {
  const MAX_PAIRWISE_SAMPLES = 10_000;
  const sets = traces.map((trace) => [...new Set(selector(trace))]);
  const totalPairs = traces.length * (traces.length - 1) / 2;
  const stride = Math.max(1, Math.floor(totalPairs / MAX_PAIRWISE_SAMPLES));
  const overlaps: number[] = [];
  let ordinal = 0;
  outer:
  for (let left = 0; left < traces.length; left++) {
    for (let right = left + 1; right < traces.length; right++) {
      if (ordinal % stride === 0) {
        overlaps.push(setOverlap(sets[left], sets[right]));
        if (overlaps.length >= MAX_PAIRWISE_SAMPLES) break outer;
      }
      ordinal += 1;
    }
  }
  return average(overlaps);
}

function rival(id: string, index: number): RivalScout {
  return {
    id,
    name: `Telemetry Rival ${index + 1}`,
    quality: 2 + (index % 4),
    specialization: index % 2 === 0 ? "youth" : "regional",
    clubId: `club-${index + 2}`,
    targetPlayerIds: [`player-${(index % 5) + 1}`],
    reputation: 40 + index,
    personality: index % 2 === 0 ? "aggressive" : "connected",
    isNemesis: index === 0,
    competingForPlayers: [],
    currentTarget: `player-${(index % 5) + 1}`,
    scoutingProgress: {},
    aggressiveness: 0.6,
    budgetTier: "medium",
    winsAgainstPlayer: 0,
    lossesToPlayer: 0,
  };
}

const TELEMETRY_RIVALS: Record<string, RivalScout> = Object.fromEntries(
  Array.from({ length: 5 }, (_, index) => {
    const entry = rival(`rival-${index + 1}`, index);
    return [entry.id, entry];
  }),
);

function buildDirectorState(
  seed: string,
  runManifest: ReturnType<typeof createRunManifest>,
): GameState {
  const players = Object.fromEntries(Array.from({ length: 5 }, (_, index) => {
    const id = `player-${index + 1}`;
    return [id, {
      id,
      firstName: "Telemetry",
      lastName: `Prospect ${index + 1}`,
      age: 17 + index,
    }];
  }));
  const reports = Object.fromEntries(Array.from({ length: 5 }, (_, index) => {
    const id = `report-${index + 1}`;
    return [id, {
      id,
      playerId: `player-${index + 1}`,
      scoutId: "scout-telemetry",
      submittedWeek: 1,
      submittedSeason: 1,
      conviction: index === 0 ? "tablePound" : "recommend",
    }];
  }));
  return {
    seed,
    runManifest,
    currentWeek: 1,
    currentSeason: 1,
    fixtures: {},
    scout: {
      id: "scout-telemetry",
      firstName: "Release",
      lastName: "Harness",
      primarySpecialization: "youth",
      currentClubId: "club-1",
      careerTier: 5,
      careerPath: "club",
      reputation: 80,
      fatigue: 85,
      clubTrust: 65,
      specializationReputation: 70,
      homeCountry: "england",
      countryReputations: {
        england: { familiarity: 80 },
        france: { familiarity: 40 },
      },
    },
    reports,
    observations: {
      "observation-1": {
        id: "observation-1",
        playerId: "player-1",
        scoutId: "scout-telemetry",
      },
    },
    watchlist: ["player-1"],
    players,
    retiredPlayers: {},
    unsignedYouth: {
      "youth-1": {
        id: "youth-1",
        player: players["player-1"],
        country: "england",
        discoveredBy: ["scout-telemetry"],
        placed: false,
        retired: false,
        visibility: 60,
        buzzLevel: 45,
      },
    },
    contacts: {
      "contact-agent": {
        id: "contact-agent",
        name: "Alex Agent",
        type: "agent",
        relationship: 78,
        trustLevel: 70,
      },
      "contact-coach": {
        id: "contact-coach",
        name: "Casey Coach",
        type: "coach",
        relationship: 74,
        trustLevel: 72,
      },
      "contact-journalist": {
        id: "contact-journalist",
        name: "Jordan Press",
        type: "journalist",
        relationship: 68,
        trustLevel: 60,
      },
    },
    contactIntel: {},
    clubs: {
      "club-1": { id: "club-1", name: "Telemetry Athletic" },
      "club-2": { id: "club-2", name: "Divergence United" },
    },
    managerProfiles: {
      "club-1": {
        clubId: "club-1",
        managerName: "Morgan Manager",
        preference: "balanced",
        reportInfluence: 0.6,
        preferredFormation: "4-3-3",
      },
    },
    countries: [{ id: "england" }, { id: "france" }],
    rivalScouts: TELEMETRY_RIVALS,
    alumniRecords: [{ playerId: "player-1" }],
    narrativeEvents: [],
    activeStorylines: [],
    eventChains: [],
    eventDirector: createEventDirectorState(),
  } as unknown as GameState;
}

function applyChainResult(
  chains: readonly EventChain[],
  result: ReturnType<typeof directWeeklyNarrativeEvent>,
): EventChain[] {
  let next = [...chains];
  if (result.advancedChain) {
    next = next.map((chain) =>
      chain.id === result.advancedChain?.chain.id
        ? result.advancedChain.chain
        : chain,
    );
  }
  if (result.newChain) next.push(result.newChain.chain);
  return next;
}

function resolveTelemetryChoice(
  seed: string,
  event: NarrativeEvent,
  chains: readonly EventChain[],
): { event: NarrativeEvent; chains: EventChain[] } {
  if (!event.choices?.length) {
    return { event: { ...event, acknowledged: true }, chains: [...chains] };
  }
  const choiceIndex = createNamedRNG(
    seed,
    "replayability-telemetry-choice",
    event.season,
    event.week,
    event.id,
  ).nextInt(0, event.choices.length - 1);
  const selected = {
    ...event,
    acknowledged: true,
    selectedChoice: choiceIndex,
    resolved: true,
  };
  if (!event.chainId) return { event: selected, chains: [...chains] };
  return {
    event: selected,
    chains: chains.map((chain) =>
      chain.id === event.chainId
        ? resolveChainChoice(chain, event.id, choiceIndex)
        : chain,
    ),
  };
}

function sampleSpecialEventSequence(
  seed: string,
  state: GameState,
  seasons: number,
): string[] {
  const recentSpecialEventIds: string[] = [];
  const specialEventCounts: Record<string, number> = {};
  const sequence: string[] = [];
  for (let season = 1; season <= seasons; season++) {
    const event = selectScoutingSpecialEvent(
      createNamedRNG(seed, "replayability-telemetry-special-event", season),
      { ...state, currentSeason: season, currentWeek: 12 },
      { recentSpecialEventIds, specialEventCounts },
    );
    if (!event?.specialEventId) continue;
    sequence.push(event.specialEventId);
    recentSpecialEventIds.push(event.specialEventId);
    if (recentSpecialEventIds.length > 6) recentSpecialEventIds.shift();
    specialEventCounts[event.specialEventId] =
      (specialEventCounts[event.specialEventId] ?? 0) + 1;
  }
  return sequence;
}

function simulateRun(seed: string, config: ReplayabilityTelemetryConfig): RunTrace {
  const worldTraitIds = deriveWorldTraitIds(seed, "youth");
  const setupRng = createNamedRNG(seed, "replayability-telemetry-run-setup");
  const originId = setupRng.pick(SCOUT_ORIGINS).id;
  const flawId = setupRng.pick(SCOUT_FLAWS).id;
  const doctrineId = setupRng.pick(SCOUT_DOCTRINES).id;
  const runManifest = createRunManifest({
    rootSeed: seed,
    specialization: "youth",
    difficulty: "normal",
    selectedCountries: ["england", "france"],
    startingCountry: "england",
    worldTraitIds,
    originId,
    flawId,
    doctrineIds: [doctrineId],
    contentDefinitionIds: [
      ...getRunContentDefinitionIds("youth-scout"),
      ...getWorldTraitContentDefinitionIds(),
      ...getWorldConditionContentDefinitionIds(),
      ...getScoutIdentityContentDefinitionIds(),
      ...getRivalOrganizationContentDefinitionIds(),
      "narrative-catalog:youth-ea.3",
      "storyline-catalog:storylines.1",
      "consequence-engine:consequences.1",
      ...SCOUTING_SPECIAL_EVENT_DECK.map((definition) =>
        `scouting-special-event:${definition.id}`,
      ),
    ],
  });
  let state = buildDirectorState(seed, runManifest);
  let rivalState = initializeRivalOrganizations(seed, TELEMETRY_RIVALS).state;
  const rivalArchetypeIds = Object.values(rivalState.organizations)
    .map((organization) => organization.archetypeId)
    .sort();
  const rivalActionTokens: string[] = [];
  const eventTokens: string[] = [];
  const eventTypes: NarrativeEventType[] = [];
  const directorSpecialEventIds: string[] = [];
  const seasonEventCounts = Array.from({ length: config.seasons }, () => 0);
  const seasonMaximumQuietWeeks = Array.from({ length: config.seasons }, () => 0);
  const seasonMaximumTensionCapStreak = Array.from(
    { length: config.seasons },
    () => 0,
  );
  let choiceOpportunityCount = 0;
  let rivalOpportunityCount = 0;
  let rivalOpportunitiesWithExplicitTradeoffs = 0;
  let maximumQuietWeeks = 0;
  let maximumTension = 0;
  let maximumTensionCapStreak = 0;
  let tensionCapStreak = 0;
  let invalidDirectorState = false;

  for (let season = 1; season <= config.seasons; season++) {
    for (let week = 1; week <= config.weeksPerSeason; week++) {
      state = { ...state, currentSeason: season, currentWeek: week };
      const weekly = directWeeklyNarrativeEvent(
        new RNG(`${seed}-events-${week}-${season}`),
        state,
      );
      let chains = applyChainResult(state.eventChains ?? [], weekly);
      const nextEvents = [...state.narrativeEvents];
      if (weekly.event) {
        const resolved = resolveTelemetryChoice(seed, weekly.event, chains);
        chains = resolved.chains;
        nextEvents.push(resolved.event);
        eventTypes.push(weekly.event.type);
        eventTokens.push(narrativeReplayToken(weekly.event));
        seasonEventCounts[season - 1] += 1;
        if (weekly.event.choices?.length) choiceOpportunityCount += 1;
        if (weekly.event.specialEventId) {
          directorSpecialEventIds.push(weekly.event.specialEventId);
        }
      }
      state = {
        ...state,
        narrativeEvents: nextEvents,
        eventChains: chains,
        eventDirector: weekly.director,
      };
      maximumQuietWeeks = Math.max(maximumQuietWeeks, weekly.director.quietWeeks);
      seasonMaximumQuietWeeks[season - 1] = Math.max(
        seasonMaximumQuietWeeks[season - 1],
        weekly.director.quietWeeks,
      );
      maximumTension = Math.max(maximumTension, weekly.director.tension);
      tensionCapStreak = weekly.director.tension >= 100 ? tensionCapStreak + 1 : 0;
      maximumTensionCapStreak = Math.max(maximumTensionCapStreak, tensionCapStreak);
      seasonMaximumTensionCapStreak[season - 1] = Math.max(
        seasonMaximumTensionCapStreak[season - 1],
        tensionCapStreak,
      );
      invalidDirectorState ||= !Number.isFinite(weekly.director.tension)
        || weekly.director.tension < 0
        || weekly.director.tension > 100
        || weekly.director.quietWeeks < 0;

      const rivalWeek = processRivalOrganizationWeek(rivalState, {
        rootSeed: seed,
        season,
        week,
        seasonLength: config.weeksPerSeason,
        rivalScouts: TELEMETRY_RIVALS,
      });
      rivalState = rivalWeek.state;
      if (rivalWeek.activity) {
        const organization = rivalState.organizations[rivalWeek.activity.organizationId];
        rivalActionTokens.push(
          `${organization?.archetypeId ?? "unknown"}:${rivalWeek.activity.action}`,
        );
      }
      if (rivalWeek.opportunity) {
        rivalOpportunityCount += 1;
        choiceOpportunityCount += 1;
        if (rivalWeek.opportunity.knownTradeoffs.length >= 2) {
          rivalOpportunitiesWithExplicitTradeoffs += 1;
        }
      }
    }
  }

  const deadDirectorSeasons = seasonEventCounts.filter((count, index) =>
    count === 0
      || seasonMaximumQuietWeeks[index] > Math.ceil(config.weeksPerSeason / 2),
  ).length;
  const runawayDirectorSeasons = seasonEventCounts.filter((count, index) =>
    invalidDirectorState
      || ratio(count, config.weeksPerSeason) > 0.45
      || seasonMaximumTensionCapStreak[index] > Math.ceil(config.weeksPerSeason / 2),
  ).length;
  const deadDirector = deadDirectorSeasons > 0;
  const runawayDirector = runawayDirectorSeasons > 0;
  const sampledSpecialEventIds = sampleSpecialEventSequence(
    seed,
    state,
    config.seasons,
  );
  const eventTrajectoryFingerprint = stableFingerprint(eventTokens);
  const specialTrajectoryFingerprint = stableFingerprint(sampledSpecialEventIds);
  const semanticTrajectory: ReplayabilitySemanticTrajectory = {
    worldTraitIds,
    originId,
    flawId,
    doctrineId,
    rivalArchetypeIds,
    rivalActionTokens,
    eventTokens,
    sampledSpecialEventIds,
  };
  const compositeTrajectoryFingerprint = buildSemanticTrajectoryFingerprint(
    semanticTrajectory,
  );
  const comparisonTokens = buildSemanticTrajectoryComparisonTokens(
    semanticTrajectory,
  );

  return {
    manifestFingerprint: runManifest.fingerprint,
    worldTraitIds,
    originId,
    flawId,
    doctrineId,
    rivalArchetypeIds,
    rivalActionTokens,
    eventTokens,
    eventTypes,
    directorSpecialEventIds,
    sampledSpecialEventIds,
    choiceOpportunityCount,
    rivalOpportunityCount,
    rivalOpportunitiesWithExplicitTradeoffs,
    seasonEventCounts,
    maximumQuietWeeks,
    maximumTension,
    maximumTensionCapStreak,
    deadDirectorSeasons,
    runawayDirectorSeasons,
    deadDirector,
    runawayDirector,
    compositeTrajectoryFingerprint,
    eventTrajectoryFingerprint,
    specialTrajectoryFingerprint,
    comparisonTokens,
  };
}

function isMechanicallyDominantEvent(
  definition: (typeof SCOUTING_SPECIAL_EVENT_DECK)[number],
): boolean {
  return definition.options.some((candidate, candidateIndex) =>
    definition.options.some((other, otherIndex) => {
      if (candidateIndex === otherIndex) return false;
      if (candidate.delayed.metric !== other.delayed.metric) return false;
      const noWorse = candidate.delayed.successChance >= other.delayed.successChance
        && candidate.delayed.successDelta >= other.delayed.successDelta
        && candidate.delayed.failureDelta >= other.delayed.failureDelta;
      const strictlyBetter = candidate.delayed.successChance > other.delayed.successChance
        || candidate.delayed.successDelta > other.delayed.successDelta
        || candidate.delayed.failureDelta > other.delayed.failureDelta;
      return noWorse && strictlyBetter;
    }),
  );
}

function thresholdFailures(
  config: ReplayabilityTelemetryConfig,
  metrics: ReplayabilityTelemetryMetrics,
  thresholds: ReplayabilityReleaseThresholds,
): string[] {
  const failures: string[] = [];
  const minimum = (
    label: string,
    value: number,
    required: number,
  ) => {
    if (value < required) failures.push(`${label} ${value} is below ${required}`);
  };
  const maximum = (
    label: string,
    value: number,
    allowed: number,
  ) => {
    if (value > allowed) failures.push(`${label} ${value} exceeds ${allowed}`);
  };
  minimum("sample size", config.sampleSize, thresholds.minimumSampleSize);
  minimum("seasons", config.seasons, thresholds.minimumSeasons);
  if (!metrics.sameSeedReplayEqual) failures.push("same-seed replay diverged");
  minimum("manifest unique ratio", metrics.manifestUniqueRatio, thresholds.minimumManifestUniqueRatio);
  minimum("composite trajectory unique ratio", metrics.compositeTrajectoryUniqueRatio, thresholds.minimumCompositeTrajectoryUniqueRatio);
  minimum("world combination coverage", metrics.worldCombinationCoverage, thresholds.minimumWorldCombinationCoverage);
  minimum("origin catalog coverage", metrics.originCatalogCoverage, thresholds.minimumIdentityCatalogCoverage);
  minimum("flaw catalog coverage", metrics.flawCatalogCoverage, thresholds.minimumIdentityCatalogCoverage);
  minimum("doctrine catalog coverage", metrics.doctrineCatalogCoverage, thresholds.minimumIdentityCatalogCoverage);
  minimum("rival archetype coverage", metrics.rivalArchetypeCoverage, thresholds.minimumRivalArchetypeCoverage);
  minimum("rival set combination coverage", metrics.rivalSetCombinationCoverage, thresholds.minimumRivalSetCombinationCoverage);
  minimum("event trajectory unique ratio", metrics.eventTrajectoryUniqueRatio, thresholds.minimumEventTrajectoryUniqueRatio);
  minimum("special trajectory unique ratio", metrics.specialTrajectoryUniqueRatio, thresholds.minimumSpecialTrajectoryUniqueRatio);
  minimum("event catalog coverage", metrics.eventCatalogCoverage, thresholds.minimumEventCatalogCoverage);
  minimum("average trajectory distance", metrics.averageTrajectoryDistance, thresholds.minimumAverageTrajectoryDistance);
  maximum("average trajectory overlap", metrics.averageTrajectoryOverlap, thresholds.maximumAverageTrajectoryOverlap);
  maximum("adjacent event repeat rate", metrics.adjacentEventRepeatRate, thresholds.maximumAdjacentEventRepeatRate);
  maximum("special event short-window repeat rate", metrics.specialEventShortWindowRepeatRate, thresholds.maximumSpecialEventShortWindowRepeatRate);
  maximum("mechanically dominant event rate", metrics.mechanicallyDominantEventRate, thresholds.maximumMechanicallyDominantEventRate);
  maximum("dead director state rate", metrics.deadDirectorStateRate, thresholds.maximumDeadDirectorStateRate);
  maximum("runaway director state rate", metrics.runawayDirectorStateRate, thresholds.maximumRunawayDirectorStateRate);
  maximum("long maximum-tension run rate", metrics.longTensionCapRunRate, thresholds.maximumLongTensionCapRunRate);
  minimum("explicit tradeoff rate", metrics.explicitTradeoffRate, thresholds.minimumExplicitTradeoffRate);
  return failures;
}

export function buildReplayabilityTelemetry(
  partial: Partial<ReplayabilityTelemetryConfig> = {},
  thresholds = REPLAYABILITY_RELEASE_THRESHOLDS,
): ReplayabilityTelemetryArtifact {
  const config: ReplayabilityTelemetryConfig = {
    sampleSize: partial.sampleSize ?? 100,
    seasons: partial.seasons ?? 3,
    weeksPerSeason: partial.weeksPerSeason ?? 38,
    seedPrefix: partial.seedPrefix ?? "release-divergence",
  };
  assertPositiveInteger(config.sampleSize, "sampleSize");
  assertPositiveInteger(config.seasons, "seasons");
  assertPositiveInteger(config.weeksPerSeason, "weeksPerSeason");
  if (config.seedPrefix.trim().length === 0) {
    throw new RangeError("seedPrefix must not be empty");
  }

  const traces = Array.from({ length: config.sampleSize }, (_, index) =>
    simulateRun(`${config.seedPrefix}-${index.toString().padStart(4, "0")}`, config),
  );
  const replayIndices = Array.from(
    new Set([0, Math.floor(config.sampleSize / 2), config.sampleSize - 1]),
  );
  const sameSeedReplayEqual = replayIndices.every((index) => {
    const seed = `${config.seedPrefix}-${index.toString().padStart(4, "0")}`;
    return stableFingerprint(simulateRun(seed, config)) === stableFingerprint(traces[index]);
  });
  const worldCombinationKeys = traces.map((trace) => trace.worldTraitIds.join("+"));
  const originIds = traces.map((trace) => trace.originId);
  const flawIds = traces.map((trace) => trace.flawId);
  const doctrineIds = traces.map((trace) => trace.doctrineId);
  const rivalSetKeys = traces.map((trace) => trace.rivalArchetypeIds.join("+"));
  const rivalArchetypes = traces.flatMap((trace) => trace.rivalArchetypeIds);
  const eventTypes = traces.flatMap((trace) => trace.eventTypes);
  const directorSpecialEvents = traces.flatMap((trace) => trace.directorSpecialEventIds);
  const sampledSpecialEvents = traces.flatMap((trace) => trace.sampledSpecialEventIds);
  const totalEventTransitions = traces.reduce(
    (sum, trace) => sum + Math.max(0, trace.eventTokens.length - 1),
    0,
  );
  const repeatedEventTransitions = traces.reduce((sum, trace) =>
    sum + trace.eventTokens.slice(1).filter(
      (token, index) => token === trace.eventTokens[index],
    ).length,
  0);
  const totalEventTypeTransitions = traces.reduce(
    (sum, trace) => sum + Math.max(0, trace.eventTypes.length - 1),
    0,
  );
  const repeatedEventTypeTransitions = traces.reduce((sum, trace) =>
    sum + trace.eventTypes.slice(1).filter(
      (type, index) => type === trace.eventTypes[index],
    ).length,
  0);
  const totalSpecialEvents = traces.reduce(
    (sum, trace) => sum + trace.sampledSpecialEventIds.length,
    0,
  );
  const repeatedLifetimeSpecialEvents = traces.reduce((sum, trace) =>
    sum + trace.sampledSpecialEventIds.length
      - new Set(trace.sampledSpecialEventIds).size,
  0);
  const repeatedShortWindowSpecialEvents = traces.reduce((sum, trace) =>
    sum + trace.sampledSpecialEventIds.filter((id, index, sequence) =>
      sequence.slice(Math.max(0, index - 4), index).includes(id),
    ).length,
  0);
  const dominantEvents = SCOUTING_SPECIAL_EVENT_DECK.filter(
    isMechanicallyDominantEvent,
  ).length;
  const worldCombinationTotal = WORLD_TRAITS
    .reduce<Record<string, number>>((counts, trait) => {
      counts[trait.dimension] = (counts[trait.dimension] ?? 0) + 1;
      return counts;
    }, {});
  const theoreticalWorldCombinations = Object.values(worldCombinationTotal)
    .reduce((product, count) => product * count, 1);
  const theoreticalRivalSets = combinations(
    RIVAL_ORGANIZATION_DEFINITIONS.length,
    ACTIVE_RIVAL_ORGANIZATION_COUNT,
  );
  const averageTrajectoryOverlap = pairwiseAverage(
    traces,
    (trace) => trace.comparisonTokens,
  );
  const eventCounts = traces.map((trace) => trace.eventTokens.length);
  const choiceOpportunityCount = traces.reduce(
    (sum, trace) => sum + trace.choiceOpportunityCount,
    0,
  );
  const rivalOpportunityCount = traces.reduce(
    (sum, trace) => sum + trace.rivalOpportunityCount,
    0,
  );
  const explicitTradeoffCount = traces.reduce(
    (sum, trace) => sum + trace.rivalOpportunitiesWithExplicitTradeoffs,
    0,
  );
  const eligibleEventTypes = new Set(EVENT_TEMPLATES.map((template) => template.type));
  const observedEventTypes = new Set(eventTypes);

  const metrics: ReplayabilityTelemetryMetrics = {
    sameSeedReplayEqual,
    manifestUniqueRatio: ratio(
      new Set(traces.map((trace) => trace.manifestFingerprint)).size,
      config.sampleSize,
    ),
    compositeTrajectoryUniqueRatio: ratio(
      new Set(traces.map((trace) => trace.compositeTrajectoryFingerprint)).size,
      config.sampleSize,
    ),
    worldCombinationCoverage: ratio(
      new Set(worldCombinationKeys).size,
      Math.min(config.sampleSize, theoreticalWorldCombinations),
    ),
    originCatalogCoverage: ratio(new Set(originIds).size, SCOUT_ORIGINS.length),
    flawCatalogCoverage: ratio(new Set(flawIds).size, SCOUT_FLAWS.length),
    doctrineCatalogCoverage: ratio(new Set(doctrineIds).size, SCOUT_DOCTRINES.length),
    rivalArchetypeCoverage: ratio(
      new Set(rivalArchetypes).size,
      RIVAL_ORGANIZATION_DEFINITIONS.length,
    ),
    rivalSetCombinationCoverage: ratio(
      new Set(rivalSetKeys).size,
      Math.min(config.sampleSize, theoreticalRivalSets),
    ),
    eventTrajectoryUniqueRatio: ratio(
      new Set(traces.map((trace) => trace.eventTrajectoryFingerprint)).size,
      config.sampleSize,
    ),
    specialTrajectoryUniqueRatio: ratio(
      new Set(traces.map((trace) => trace.specialTrajectoryFingerprint)).size,
      config.sampleSize,
    ),
    eventCatalogCoverage: ratio(
      [...observedEventTypes].filter((type) => eligibleEventTypes.has(type)).length,
      eligibleEventTypes.size,
    ),
    averageTrajectoryDistance: Math.round((1 - averageTrajectoryOverlap) * 10_000) / 10_000,
    averageTrajectoryOverlap,
    averageEventTypeSetOverlap: pairwiseAverage(traces, (trace) => trace.eventTypes),
    adjacentEventTypeRepeatRate: ratio(
      repeatedEventTypeTransitions,
      totalEventTypeTransitions,
    ),
    adjacentEventRepeatRate: ratio(repeatedEventTransitions, totalEventTransitions),
    specialEventShortWindowRepeatRate: ratio(
      repeatedShortWindowSpecialEvents,
      totalSpecialEvents,
    ),
    specialEventLifetimeRepeatRate: ratio(
      repeatedLifetimeSpecialEvents,
      totalSpecialEvents,
    ),
    mechanicallyDominantEventRate: ratio(
      dominantEvents,
      SCOUTING_SPECIAL_EVENT_DECK.length,
    ),
    deadDirectorRunRate: ratio(
      traces.filter((trace) => trace.deadDirector).length,
      config.sampleSize,
    ),
    runawayDirectorRunRate: ratio(
      traces.filter((trace) => trace.runawayDirector).length,
      config.sampleSize,
    ),
    deadDirectorStateRate: ratio(
      traces.reduce((sum, trace) => sum + trace.deadDirectorSeasons, 0),
      config.sampleSize * config.seasons,
    ),
    runawayDirectorStateRate: ratio(
      traces.reduce((sum, trace) => sum + trace.runawayDirectorSeasons, 0),
      config.sampleSize * config.seasons,
    ),
    explicitTradeoffRate: ratio(explicitTradeoffCount, rivalOpportunityCount),
    choiceOpportunityCount,
    rivalOpportunityCount,
    eventCountRange: {
      minimum: Math.min(...eventCounts),
      maximum: Math.max(...eventCounts),
    },
    maximumQuietWeeks: Math.max(...traces.map((trace) => trace.maximumQuietWeeks)),
    maximumTensionCapStreak: Math.max(
      ...traces.map((trace) => trace.maximumTensionCapStreak),
    ),
    longTensionCapRunRate: ratio(
      traces.filter((trace) => trace.maximumTensionCapStreak > 8).length,
      config.sampleSize,
    ),
  };
  const failures = thresholdFailures(config, metrics, thresholds);
  const balanceObservations: string[] = [];
  if (metrics.longTensionCapRunRate > 0) {
    balanceObservations.push(
      `${metrics.longTensionCapRunRate} of sampled runs remained at maximum `
        + "event-director tension for more than eight consecutive weeks",
    );
  }
  if (metrics.adjacentEventRepeatRate > 0.15) {
    balanceObservations.push(
      `Adjacent narrative beats repeated at a ${metrics.adjacentEventRepeatRate} rate`,
    );
  }
  if (metrics.adjacentEventTypeRepeatRate > 0.15) {
    balanceObservations.push(
      `Broad event categories repeated at a ${metrics.adjacentEventTypeRepeatRate} rate; `
        + "this includes distinct stages of the same multi-week chain",
    );
  }
  if (metrics.specialEventLifetimeRepeatRate > 0) {
    balanceObservations.push(
      `Lifetime special-event reuse reached ${metrics.specialEventLifetimeRepeatRate}; `
        + `four-event-window reuse was ${metrics.specialEventShortWindowRepeatRate}`,
    );
  }
  if (metrics.deadDirectorRunRate > 0 || metrics.runawayDirectorRunRate > 0) {
    balanceObservations.push(
      `${metrics.deadDirectorRunRate} of careers encountered a dead director season `
        + `and ${metrics.runawayDirectorRunRate} encountered a runaway season`,
    );
  }
  return {
    schemaVersion: TELEMETRY_VERSION,
    config,
    thresholds,
    metrics,
    distributions: {
      worldTraitCombinations: histogram(worldCombinationKeys),
      origins: histogram(originIds),
      flaws: histogram(flawIds),
      doctrines: histogram(doctrineIds),
      rivalOrganizationSets: histogram(rivalSetKeys),
      rivalArchetypes: histogram(rivalArchetypes),
      eventTypes: histogram(eventTypes),
      directorSpecialEvents: histogram(directorSpecialEvents),
      sampledSpecialEvents: histogram(sampledSpecialEvents),
    },
    failures,
    balanceObservations,
    passed: failures.length === 0,
    sampleFingerprints: traces.slice(0, 5).map(
      (trace) => trace.compositeTrajectoryFingerprint,
    ),
  };
}
