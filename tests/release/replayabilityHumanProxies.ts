import { execFileSync } from "node:child_process";
import { deriveCareerFingerprintProjection } from "@/engine/career/fingerprint";
import type {
  EventChain,
  GameState,
  NarrativeEvent,
  RivalScout,
} from "@/engine/core/types";
import { getAuthoredRelationshipConflictCoverage } from "@/engine/consequences";
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
import {
  getFootballCulturePlaybookCoverage,
  listExplicitFootballCulturePlaybooks,
} from "@/engine/world/footballCulturePlaybooks";
import { listClubRecruitmentExpressions } from "@/engine/world/recruitmentIdentity";

const ACTIVE_RIVAL_ORGANIZATION_COUNT = 3;

interface ProxyTrace {
  maximumQuietWeeks: number;
  preArbitrationChoiceOpportunityWeeks: boolean[];
  setupCareerFingerprintProjectionId: string;
  setupCareerFingerprintProjectionTitle: string;
  rivalArchetypeIds: string[];
  rivalSetKey: string;
  rivalActionTokens: string[];
}

export interface ReplayabilityHumanProxySummary {
  authority: {
    canonicalReleaseArtifact: string;
    legacyReleaseArtifactRejected: boolean;
    sourceHeadSha: string | null;
    sourceTreeClean: boolean;
    sourceDirtyEntryCount: number | null;
    gitInspectionSucceeded: boolean;
    evidenceClass:
      | "clean_commit_bound"
      | "diagnostic_dirty_worktree"
      | "diagnostic_git_unavailable";
    releaseCertificationEligible: boolean;
  };
  quietWeekStreak: {
    p95: number;
    maximum: number;
  };
  rollingEightWeekPreArbitrationChoiceOpportunityDensity: {
    minimum: number;
    p50: number;
    p95: number;
  };
  setupCareerFingerprintProjections: {
    status: "sampled_setup_projection";
    uniqueFingerprintCount: number;
    uniqueTitleCount: number;
    sampleTitles: string[];
  };
  authoredSurfaceCoverage: {
    clubRecruitmentExpressions: {
      status: "production_catalog";
      expressionCount: number;
      familyCount: number;
      expressionIds: string[];
      families: string[];
    };
    footballCulturePlaybooks: {
      status: "production_catalog";
      playbookCount: number;
      countryIds: string[];
      authoredCalendarWindowCount: number;
      countriesWithAuthoredCalendarWindows: number;
      authoredCalendarWindowsByCountry: Record<string, number>;
      signaledAttributeDomainCountByCountry: Record<string, number>;
    };
    relationshipConflicts: {
      status: "production_catalog";
      blueprintCount: number;
      frontFamilyCount: number;
      frontStructureCount: number;
      recurrenceNameCount: number;
      recurringFrontVariantCount: number;
      callbackVariantCount: number;
      stakeholderOutcomeVariantCount: number;
      authoredCallbackOutcomeVariantCount: number;
      blueprintIds: string[];
      frontFamilyIds: string[];
      frontStructures: string[];
      recurrenceNames: string[];
      recurringFrontVariantIds: string[];
      callbackVariantIds: string[];
      stakeholderOutcomeVariantIds: string[];
    };
  };
  rivalCounterplay: {
    status: "sampled_harness";
    organizationArchetypeCoverage: number;
    uniqueActionSignatures: number;
    uniqueOrganizationSets: number;
    theoreticalOrganizationSets: number;
    organizationSetCoverage: number;
  };
}

export interface ReplayabilitySourceTreeInspection {
  sourceHeadSha: string | null;
  sourceTreeClean: boolean;
  sourceDirtyEntryCount: number | null;
  gitInspectionSucceeded: boolean;
}

function inspectReplayabilitySourceTree(): ReplayabilitySourceTreeInspection {
  try {
    const sourceHeadSha = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim().toLowerCase();
    const porcelain = execFileSync(
      "git",
      ["status", "--porcelain", "--untracked-files=all"],
      { encoding: "utf8" },
    );
    const sourceDirtyEntryCount = porcelain
      .split(/\r?\n/)
      .filter((entry) => entry.length > 0)
      .length;
    return {
      sourceHeadSha,
      sourceTreeClean: sourceDirtyEntryCount === 0,
      sourceDirtyEntryCount,
      gitInspectionSucceeded: true,
    };
  } catch {
    return {
      sourceHeadSha: null,
      sourceTreeClean: false,
      sourceDirtyEntryCount: null,
      gitInspectionSucceeded: false,
    };
  }
}

export function buildReplayabilityEvidenceAuthority(
  inspection: ReplayabilitySourceTreeInspection = inspectReplayabilitySourceTree(),
): ReplayabilityHumanProxySummary["authority"] {
  const releaseCertificationEligible = inspection.gitInspectionSucceeded
    && inspection.sourceHeadSha !== null
    && inspection.sourceTreeClean
    && inspection.sourceDirtyEntryCount === 0;
  return {
    canonicalReleaseArtifact: "artifacts/release/generated/replayability-release-summary.json",
    legacyReleaseArtifactRejected: true,
    ...inspection,
    evidenceClass: releaseCertificationEligible
      ? "clean_commit_bound"
      : inspection.gitInspectionSucceeded
        ? "diagnostic_dirty_worktree"
        : "diagnostic_git_unavailable",
    releaseCertificationEligible,
  };
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10_000) / 10_000;
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function averageWindowDensity(flags: readonly boolean[], size: number): number[] {
  if (flags.length < size) {
    return [ratio(flags.filter(Boolean).length, Math.max(1, flags.length))];
  }
  const densities: number[] = [];
  for (let start = 0; start <= flags.length - size; start += 1) {
    const window = flags.slice(start, start + size);
    densities.push(ratio(window.filter(Boolean).length, size));
  }
  return densities;
}

function combinations(total: number, selected: number): number {
  if (selected < 0 || selected > total) return 0;
  let result = 1;
  for (let index = 1; index <= selected; index += 1) {
    result = result * (total - selected + index) / index;
  }
  return Math.round(result);
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
    reports: {},
    observations: {},
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
    contacts: {},
    contactIntel: {},
    clubs: {
      "club-1": { id: "club-1", name: "Telemetry Athletic" },
      "club-2": { id: "club-2", name: "Divergence United" },
    },
    managerProfiles: {},
    countries: [{ id: "england" }, { id: "france" }],
    rivalScouts: TELEMETRY_RIVALS,
    alumniRecords: [],
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
  for (let season = 1; season <= seasons; season += 1) {
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

function simulateProxyTrace(
  seed: string,
  config: { seasons: number; weeksPerSeason: number },
): ProxyTrace {
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
        `scouting-special-event:${definition.id}`),
    ],
  });
  const setupCareerFingerprintProjection = deriveCareerFingerprintProjection({
    careerPath: "club",
    careerTier: 5,
    originId,
    doctrineIds: [doctrineId],
    worldTraitIds,
    relationships: {
      activeObligationCount: 0,
      persistentStakeholderKinds: [],
    },
  });
  let state = buildDirectorState(seed, runManifest);
  let rivalState = initializeRivalOrganizations(seed, TELEMETRY_RIVALS).state;
  const rivalArchetypeIds = Object.values(rivalState.organizations)
    .map((organization) => organization.archetypeId)
    .sort();
  const rivalSetKey = rivalArchetypeIds.join("+");
  const rivalActionTokens: string[] = [];
  const preArbitrationChoiceOpportunityWeeks: boolean[] = [];
  let maximumQuietWeeks = 0;

  for (let season = 1; season <= config.seasons; season += 1) {
    for (let week = 1; week <= config.weeksPerSeason; week += 1) {
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
      }
      state = {
        ...state,
        narrativeEvents: nextEvents,
        eventChains: chains,
        eventDirector: weekly.director,
      };
      maximumQuietWeeks = Math.max(maximumQuietWeeks, weekly.director.quietWeeks);

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
      preArbitrationChoiceOpportunityWeeks.push(
        Boolean(weekly.event?.choices?.length || rivalWeek.opportunity),
      );
    }
  }

  sampleSpecialEventSequence(seed, state, config.seasons);

  return {
    maximumQuietWeeks,
    preArbitrationChoiceOpportunityWeeks,
    setupCareerFingerprintProjectionId: setupCareerFingerprintProjection.fingerprintId,
    setupCareerFingerprintProjectionTitle: setupCareerFingerprintProjection.title,
    rivalArchetypeIds,
    rivalSetKey,
    rivalActionTokens,
  };
}

export function buildReplayabilityHumanProxies(config: {
  sampleSize: number;
  seasons: number;
  weeksPerSeason: number;
  seedPrefix: string;
}): ReplayabilityHumanProxySummary {
  const traces = Array.from({ length: config.sampleSize }, (_, index) =>
    simulateProxyTrace(`${config.seedPrefix}-${index.toString().padStart(4, "0")}`, config),
  );
  const quietWeeks = traces.map((trace) => trace.maximumQuietWeeks);
  const rollingDensities = traces.flatMap((trace) =>
    averageWindowDensity(trace.preArbitrationChoiceOpportunityWeeks, 8),
  );
  const uniqueSetupCareerFingerprintProjections = new Set(
    traces.map((trace) => trace.setupCareerFingerprintProjectionId),
  );
  const uniqueSetupCareerProjectionTitles = [...new Set(
    traces.map((trace) => trace.setupCareerFingerprintProjectionTitle),
  )].sort();
  const uniqueRivalSets = new Set(traces.map((trace) => trace.rivalSetKey));
  const uniqueActionSignatures = new Set(traces.flatMap((trace) => trace.rivalActionTokens));
  const uniqueArchetypes = new Set(traces.flatMap((trace) => trace.rivalArchetypeIds));
  const theoreticalOrganizationSets = combinations(
    RIVAL_ORGANIZATION_DEFINITIONS.length,
    ACTIVE_RIVAL_ORGANIZATION_COUNT,
  );
  const clubRecruitmentExpressions = listClubRecruitmentExpressions();
  const expressionIds = clubRecruitmentExpressions
    .map((expression) => expression.id)
    .sort();
  const expressionFamilies = [...new Set(
    clubRecruitmentExpressions.map((expression) => expression.family),
  )].sort();
  const footballCulturePlaybooks = listExplicitFootballCulturePlaybooks()
    .slice()
    .sort((left, right) => left.countryId.localeCompare(right.countryId));
  const footballCultureCountryIds = footballCulturePlaybooks
    .map((playbook) => playbook.countryId);
  const authoredCalendarWindowsByCountry = Object.fromEntries(
    footballCulturePlaybooks.map((playbook) => [
      playbook.countryId,
      playbook.calendarWindows.length,
    ]),
  );
  const playbookCoverage = getFootballCulturePlaybookCoverage();
  const signaledAttributeDomainCountByCountry = Object.fromEntries(
    footballCultureCountryIds.map((countryId) => [
      countryId,
      playbookCoverage[countryId] ?? 0,
    ]),
  );
  const relationshipConflictCoverage = getAuthoredRelationshipConflictCoverage();

  return {
    authority: buildReplayabilityEvidenceAuthority(),
    quietWeekStreak: {
      p95: percentile(quietWeeks, 0.95),
      maximum: Math.max(...quietWeeks),
    },
    rollingEightWeekPreArbitrationChoiceOpportunityDensity: {
      minimum: Math.min(...rollingDensities),
      p50: percentile(rollingDensities, 0.5),
      p95: percentile(rollingDensities, 0.95),
    },
    setupCareerFingerprintProjections: {
      status: "sampled_setup_projection",
      uniqueFingerprintCount: uniqueSetupCareerFingerprintProjections.size,
      uniqueTitleCount: uniqueSetupCareerProjectionTitles.length,
      sampleTitles: uniqueSetupCareerProjectionTitles.slice(0, 8),
    },
    authoredSurfaceCoverage: {
      clubRecruitmentExpressions: {
        status: "production_catalog",
        expressionCount: clubRecruitmentExpressions.length,
        familyCount: expressionFamilies.length,
        expressionIds,
        families: expressionFamilies,
      },
      footballCulturePlaybooks: {
        status: "production_catalog",
        playbookCount: footballCulturePlaybooks.length,
        countryIds: footballCultureCountryIds,
        authoredCalendarWindowCount: footballCulturePlaybooks.reduce(
          (total, playbook) => total + playbook.calendarWindows.length,
          0,
        ),
        countriesWithAuthoredCalendarWindows: footballCulturePlaybooks.filter(
          (playbook) => playbook.calendarWindows.length > 0,
        ).length,
        authoredCalendarWindowsByCountry,
        signaledAttributeDomainCountByCountry,
      },
      relationshipConflicts: {
        status: "production_catalog",
        blueprintCount: relationshipConflictCoverage.blueprintCount,
        frontFamilyCount: relationshipConflictCoverage.frontFamilyCount,
        frontStructureCount: relationshipConflictCoverage.frontStructureCount,
        recurrenceNameCount: relationshipConflictCoverage.recurrenceNames.length,
        recurringFrontVariantCount:
          relationshipConflictCoverage.recurringFrontVariantCount,
        callbackVariantCount: relationshipConflictCoverage.callbackVariantCount,
        stakeholderOutcomeVariantCount:
          relationshipConflictCoverage.stakeholderOutcomeVariantCount,
        authoredCallbackOutcomeVariantCount:
          relationshipConflictCoverage.authoredCallbackOutcomeVariantCount,
        blueprintIds: [...relationshipConflictCoverage.blueprintIds],
        frontFamilyIds: [...relationshipConflictCoverage.frontFamilyIds],
        frontStructures: [...relationshipConflictCoverage.frontStructures],
        recurrenceNames: [...relationshipConflictCoverage.recurrenceNames],
        recurringFrontVariantIds: [
          ...relationshipConflictCoverage.recurringFrontVariantIds,
        ],
        callbackVariantIds: [...relationshipConflictCoverage.callbackVariantIds],
        stakeholderOutcomeVariantIds: [
          ...relationshipConflictCoverage.stakeholderOutcomeVariantIds,
        ],
      },
    },
    rivalCounterplay: {
      status: "sampled_harness",
      organizationArchetypeCoverage: ratio(
        uniqueArchetypes.size,
        RIVAL_ORGANIZATION_DEFINITIONS.length,
      ),
      uniqueActionSignatures: uniqueActionSignatures.size,
      uniqueOrganizationSets: uniqueRivalSets.size,
      theoreticalOrganizationSets,
      organizationSetCoverage: ratio(
        uniqueRivalSets.size,
        Math.min(config.sampleSize, theoreticalOrganizationSets),
      ),
    },
  };
}
