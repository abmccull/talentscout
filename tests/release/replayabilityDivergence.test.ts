import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  REPLAYABILITY_NIGHTLY_THRESHOLDS,
  REPLAYABILITY_RELEASE_THRESHOLDS,
  buildSemanticTrajectoryComparisonTokens,
  buildSemanticTrajectoryFingerprint,
  buildReplayabilityTelemetry,
  type ReplayabilityTelemetryArtifact,
} from "@/engine/telemetry/replayabilityDivergence";

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
const expectedThresholds = process.env.TALENTSCOUT_REPLAYABILITY_PROFILE === "nightly"
  ? REPLAYABILITY_NIGHTLY_THRESHOLDS
  : REPLAYABILITY_RELEASE_THRESHOLDS;

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
  const outputPath = process.env.TALENTSCOUT_REPLAYABILITY_ARTIFACT;
  if (outputPath) {
    const absolutePath = resolve(outputPath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
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

  it("passes the documented release thresholds", () => {
    expect(artifact.thresholds).toEqual(expectedThresholds);
    expect(artifact.failures).toEqual([]);
    expect(artifact.passed).toBe(true);
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
});
