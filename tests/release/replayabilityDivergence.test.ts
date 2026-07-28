import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  REPLAYABILITY_NIGHTLY_THRESHOLDS,
  REPLAYABILITY_RELEASE_THRESHOLDS,
  buildCareerOutcomeFingerprint,
  buildSemanticTrajectoryComparisonTokens,
  buildSemanticTrajectoryFingerprint,
  buildReplayabilityTelemetry,
  type ReplayabilityTelemetryArtifact,
  type ReplayabilityCareerOutcomeFingerprintInput,
  type ReplayabilityReleaseThresholds,
  type ReplayabilityRunTrace,
} from "@/engine/telemetry/replayabilityDivergence";
import {
  buildReplayabilityEvidenceAuthority,
  buildReplayabilityHumanProxies,
  type ReplayabilityHumanProxySummary,
} from "./replayabilityHumanProxies";
import { stableFingerprint } from "@/engine/run";

function positiveIntegerFromEnvironment(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
}

let artifact: ReplayabilityTelemetryArtifact;
let humanFacingProxies: ReplayabilityHumanProxySummary;
const expectedThresholds = process.env.TALENTSCOUT_REPLAYABILITY_PROFILE === "nightly"
  ? REPLAYABILITY_NIGHTLY_THRESHOLDS
  : REPLAYABILITY_RELEASE_THRESHOLDS;

function createSyntheticTrace(
  seed: string,
  overrides: Partial<ReplayabilityRunTrace> = {},
): ReplayabilityRunTrace {
  const semanticTrajectory = {
    worldTraitIds: ["golden-generation", "trusted-circuit", "boom-bust-market"],
    originId: "academy-apprentice",
    flawId: "fragile-network",
    doctrineId: "evidence-first",
    rivalArchetypeIds: ["regional-guild", "analytics-syndicate", "agent-cartel"],
    rivalActionTokens: ["regional-guild:territory-lock"],
    eventTokens: ["event:exclusiveTip", "special:career-board-vote"],
    choiceTokens: ["event:exclusiveTip:choice-0:verify-privately"],
    sampledSpecialEventIds: ["career-board-vote"],
  } satisfies ReplayabilityCareerOutcomeFingerprintInput["semanticTrajectory"];
  const seasonEventCounts = [2, 1, 1];
  const careerFingerprintId = buildCareerOutcomeFingerprint({
    semanticTrajectory,
    seasonEventCounts,
    maximumQuietWeeks: 4,
    maximumTensionCapStreak: 2,
    deadDirectorSeasons: 0,
    runawayDirectorSeasons: 0,
  });
  const compositeTrajectoryFingerprint = buildSemanticTrajectoryFingerprint(
    semanticTrajectory,
  );

  return {
    careerFingerprintId,
    careerProjectionFingerprintId: "projection-shared",
    manifestFingerprint: `manifest-${seed}`,
    worldTraitIds: [...semanticTrajectory.worldTraitIds],
    originId: semanticTrajectory.originId,
    flawId: semanticTrajectory.flawId,
    doctrineId: semanticTrajectory.doctrineId,
    rivalArchetypeIds: [...semanticTrajectory.rivalArchetypeIds],
    rivalActionTokens: [...semanticTrajectory.rivalActionTokens],
    eventTokens: [...semanticTrajectory.eventTokens],
    choiceTokens: [...semanticTrajectory.choiceTokens],
    eventTypes: [],
    directorSpecialEventIds: ["career-board-vote"],
    sampledSpecialEventIds: [...semanticTrajectory.sampledSpecialEventIds],
    choiceOpportunityCount: 2,
    rivalOpportunityCount: 1,
    rivalOpportunitiesWithExplicitTradeoffs: 1,
    seasonEventCounts: [...seasonEventCounts],
    maximumQuietWeeks: 4,
    maximumTension: 68,
    maximumTensionCapStreak: 2,
    deadDirectorSeasons: 0,
    runawayDirectorSeasons: 0,
    deadDirector: false,
    runawayDirector: false,
    compositeTrajectoryFingerprint,
    eventTrajectoryFingerprint: stableFingerprint(semanticTrajectory.eventTokens),
    specialTrajectoryFingerprint: stableFingerprint(
      semanticTrajectory.sampledSpecialEventIds,
    ),
    comparisonTokens: buildSemanticTrajectoryComparisonTokens(semanticTrajectory),
    ...overrides,
  };
}

function createRelaxedThresholds(
  overrides: Partial<ReplayabilityReleaseThresholds> = {},
): ReplayabilityReleaseThresholds {
  return {
    ...REPLAYABILITY_RELEASE_THRESHOLDS,
    minimumSampleSize: 1,
    minimumSeasons: 1,
    minimumManifestUniqueRatio: 0,
    minimumCompositeTrajectoryUniqueRatio: 0,
    minimumWorldCombinationCoverage: 0,
    minimumIdentityCatalogCoverage: 0,
    minimumRivalArchetypeCoverage: 0,
    minimumRivalSetCombinationCoverage: 0,
    minimumEventTrajectoryUniqueRatio: 0,
    minimumSpecialTrajectoryUniqueRatio: 0,
    minimumEventCatalogCoverage: 0,
    minimumAverageTrajectoryDistance: 0,
    maximumAverageTrajectoryOverlap: 1,
    maximumAdjacentEventRepeatRate: 1,
    maximumSpecialEventShortWindowRepeatRate: 1,
    maximumMechanicallyDominantEventRate: 1,
    maximumDeadDirectorStateRate: 1,
    maximumRunawayDirectorStateRate: 1,
    maximumLongTensionCapRunRate: 1,
    minimumExplicitTradeoffRate: 0,
    ...overrides,
  };
}

beforeAll(() => {
  artifact = buildReplayabilityTelemetry({
    sampleSize: positiveIntegerFromEnvironment(
      "TALENTSCOUT_REPLAYABILITY_SEEDS",
      100,
    ),
    seasons: positiveIntegerFromEnvironment(
      "TALENTSCOUT_REPLAYABILITY_SEASONS",
      3,
    ),
    weeksPerSeason: positiveIntegerFromEnvironment(
      "TALENTSCOUT_REPLAYABILITY_WEEKS",
      38,
    ),
    seedPrefix: process.env.TALENTSCOUT_REPLAYABILITY_SEED_PREFIX
      ?? "release-divergence",
  }, expectedThresholds);
  humanFacingProxies = buildReplayabilityHumanProxies(artifact.config);
  const outputPath = process.env.TALENTSCOUT_REPLAYABILITY_ARTIFACT;
  if (outputPath) {
    const absolutePath = resolve(outputPath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(
      absolutePath,
      `${JSON.stringify({
        ...artifact,
        humanFacingProxies,
      }, null, 2)}\n`,
      "utf8",
    );
  }
}, 180_000);

describe("release replayability divergence telemetry", () => {
  it("replays identical seeds exactly", () => {
    expect(artifact.metrics.sameSeedReplayEqual).toBe(true);
  });

  it("normalizes diagnostic identity out of semantic trajectory comparisons", () => {
    const semantics = {
      worldTraitIds: ["golden-generation", "scout-wars", "cautious-market"],
      originId: "academy-apprentice",
      flawId: "travel-worn",
      doctrineId: "contrarian-eye",
      rivalArchetypeIds: ["regional-guild", "analytics-syndicate"],
      rivalActionTokens: ["regional-guild:territory-lock"],
      eventTokens: ["event:exclusiveTip", "special:career-board-vote"],
      sampledSpecialEventIds: ["career-board-vote"],
    };
    const first = {
      ...semantics,
      diagnosticMetadata: {
        rootSeed: "seed-one",
        runId: "run-one",
        generatedIds: ["evt-random-one"],
        generatedNames: ["First Generated Name"],
        timestamps: ["2026-01-01T00:00:00.000Z"],
      },
    };
    const second = {
      ...semantics,
      worldTraitIds: [...semantics.worldTraitIds].reverse(),
      rivalArchetypeIds: [...semantics.rivalArchetypeIds].reverse(),
      diagnosticMetadata: {
        rootSeed: "seed-two",
        runId: "run-two",
        generatedIds: ["evt-random-two"],
        generatedNames: ["Second Generated Name"],
        timestamps: ["2030-12-31T23:59:59.000Z"],
      },
    };

    expect(buildSemanticTrajectoryFingerprint(second))
      .toBe(buildSemanticTrajectoryFingerprint(first));
    expect(buildSemanticTrajectoryComparisonTokens(second))
      .toEqual(buildSemanticTrajectoryComparisonTokens(first));
  });

  it("changes the gated career fingerprint when identical setup diverges in actual outcomes", () => {
    const identity = {
      worldTraitIds: ["golden-generation", "scout-wars", "cautious-market"],
      originId: "academy-apprentice",
      flawId: "travel-worn",
      doctrineId: "contrarian-eye",
      rivalArchetypeIds: ["regional-guild", "analytics-syndicate"],
    };
    const baseline = buildCareerOutcomeFingerprint({
      semanticTrajectory: {
        ...identity,
        rivalActionTokens: ["regional-guild:territory-lock"],
        eventTokens: ["event:exclusiveTip", "special:career-board-vote"],
        choiceTokens: ["event:exclusiveTip:choice-0:verify-privately"],
        sampledSpecialEventIds: ["career-board-vote"],
      },
      seasonEventCounts: [1, 1, 0],
      maximumQuietWeeks: 4,
      maximumTensionCapStreak: 2,
      deadDirectorSeasons: 0,
      runawayDirectorSeasons: 0,
    });
    const divergent = buildCareerOutcomeFingerprint({
      semanticTrajectory: {
        ...identity,
        rivalActionTokens: ["analytics-syndicate:leak-rumor"],
        eventTokens: ["event:exclusiveTip", "special:ownership-showdown"],
        choiceTokens: ["event:exclusiveTip:choice-1:sell-the-exclusive-listing"],
        sampledSpecialEventIds: ["ownership-showdown"],
      },
      seasonEventCounts: [0, 2, 1],
      maximumQuietWeeks: 7,
      maximumTensionCapStreak: 5,
      deadDirectorSeasons: 1,
      runawayDirectorSeasons: 0,
    });

    expect(divergent).not.toBe(baseline);
  });

  it("fails the gate when outcome fingerprints collapse despite shared setup coverage", () => {
    const traces = [
      createSyntheticTrace("00"),
      createSyntheticTrace("01", {
        manifestFingerprint: "manifest-01",
      }),
      createSyntheticTrace("02", {
        manifestFingerprint: "manifest-02",
      }),
    ];
    const traceMap = new Map(
      traces.map((trace, index) => [
        `collapsed-${index.toString().padStart(4, "0")}`,
        trace,
      ]),
    );
    const artifactWithCollapsedOutcomes = buildReplayabilityTelemetry(
      {
        sampleSize: traces.length,
        seasons: 3,
        weeksPerSeason: 38,
        seedPrefix: "collapsed",
      },
      createRelaxedThresholds({
        minimumCareerFingerprintUniqueRatio: 0.67,
      }),
      (seed) => {
        const trace = traceMap.get(seed);
        if (!trace) throw new Error(`Missing synthetic trace for ${seed}`);
        return trace;
      },
    );

    expect(artifactWithCollapsedOutcomes.passed).toBe(false);
    expect(artifactWithCollapsedOutcomes.metrics.careerProjectionUniqueRatio).toBe(0.3333);
    expect(artifactWithCollapsedOutcomes.metrics.careerFingerprintUniqueRatio).toBe(0.3333);
    expect(artifactWithCollapsedOutcomes.failures).toContain(
      "career fingerprint unique ratio 0.3333 is below 0.67",
    );
  });

  it("passes the documented release thresholds", () => {
    expect(artifact.thresholds).toEqual(expectedThresholds);
    expect(artifact.failures).toEqual([]);
    expect(artifact.passed).toBe(true);
    expect(artifact.metrics.careerFingerprintUniqueRatio)
      .toBeGreaterThanOrEqual(expectedThresholds.minimumCareerFingerprintUniqueRatio);
  });

  it("uses real catalog IDs in the machine-readable distributions", () => {
    expect(Object.keys(artifact.distributions.worldTraitCombinations).length)
      .toBeGreaterThan(1);
    expect(Object.keys(artifact.distributions.origins).length).toBeGreaterThan(1);
    expect(Object.keys(artifact.distributions.rivalArchetypes).length)
      .toBeGreaterThan(1);
    expect(Object.keys(artifact.distributions.eventTypes).length).toBeGreaterThan(1);
    expect(Object.keys(artifact.distributions.sampledSpecialEvents).length)
      .toBeGreaterThan(1);
  });

  it("finds bounded choice pressure and director state rates", () => {
    expect(artifact.metrics.choiceOpportunityCount).toBeGreaterThan(0);
    expect(artifact.metrics.rivalOpportunityCount).toBeGreaterThan(0);
    expect(artifact.metrics.deadDirectorStateRate)
      .toBeLessThanOrEqual(expectedThresholds.maximumDeadDirectorStateRate);
    expect(artifact.metrics.runawayDirectorStateRate)
      .toBeLessThanOrEqual(expectedThresholds.maximumRunawayDirectorStateRate);
  });

  it("reports production-backed authored surfaces and honestly named rival counterplay", () => {
    const proxies = humanFacingProxies;
    expect(proxies.authority.canonicalReleaseArtifact)
      .toBe("artifacts/release/generated/replayability-release-summary.json");
    expect(proxies.authority.legacyReleaseArtifactRejected).toBe(true);
    expect(proxies.quietWeekStreak.p95).toBeLessThanOrEqual(artifact.metrics.maximumQuietWeeks);
    expect(proxies.rollingEightWeekPreArbitrationChoiceOpportunityDensity.minimum).toBe(0);
    expect(proxies.rollingEightWeekPreArbitrationChoiceOpportunityDensity.p50)
      .toBeGreaterThan(0);
    expect(proxies.rollingEightWeekPreArbitrationChoiceOpportunityDensity.p95)
      .toBeGreaterThanOrEqual(
        proxies.rollingEightWeekPreArbitrationChoiceOpportunityDensity.p50,
      );
    expect(proxies.setupCareerFingerprintProjections).toMatchObject({
      status: "sampled_setup_projection",
      uniqueTitleCount: 4,
    });
    expect(proxies.setupCareerFingerprintProjections.uniqueFingerprintCount).toBeGreaterThan(60);
    expect(proxies.setupCareerFingerprintProjections.sampleTitles).toHaveLength(4);
    expect(proxies.authoredSurfaceCoverage.clubRecruitmentExpressions).toMatchObject({
      status: "production_catalog",
      expressionCount: 20,
      familyCount: 4,
    });
    expect(new Set(
      proxies.authoredSurfaceCoverage.clubRecruitmentExpressions.expressionIds,
    ).size).toBe(20);
    expect(proxies.authoredSurfaceCoverage.footballCulturePlaybooks).toMatchObject({
      status: "production_catalog",
      playbookCount: 22,
      authoredCalendarWindowCount: 54,
      countriesWithAuthoredCalendarWindows: 22,
    });
    expect(Object.values(
      proxies.authoredSurfaceCoverage.footballCulturePlaybooks
        .signaledAttributeDomainCountByCountry,
    ).every((count) => count > 0)).toBe(true);
    expect(proxies.authoredSurfaceCoverage.relationshipConflicts).toMatchObject({
      status: "production_catalog",
      blueprintCount: 13,
      frontFamilyCount: 13,
      frontStructureCount: 7,
      recurrenceNameCount: 13,
      recurringFrontVariantCount: 39,
      callbackVariantCount: 33,
      stakeholderOutcomeVariantCount: 78,
      authoredCallbackOutcomeVariantCount: 111,
    });
    expect(proxies.rivalCounterplay.status).toBe("sampled_harness");
    expect(proxies.rivalCounterplay.organizationArchetypeCoverage).toBeGreaterThan(0);
    expect(proxies.rivalCounterplay.organizationSetCoverage).toBeGreaterThan(0);
  });

  it("marks a dirty source tree as diagnostic-only release evidence", () => {
    const authority = buildReplayabilityEvidenceAuthority({
      sourceHeadSha: "a".repeat(40),
      sourceTreeClean: false,
      sourceDirtyEntryCount: 3,
      gitInspectionSucceeded: true,
    });
    expect(authority).toMatchObject({
      evidenceClass: "diagnostic_dirty_worktree",
      sourceTreeClean: false,
      sourceDirtyEntryCount: 3,
      releaseCertificationEligible: false,
    });
  });
});
