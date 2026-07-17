import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const checker = join(process.cwd(), "scripts", "check-release-evidence.mjs");
const manifestGenerator = join(
  process.cwd(),
  "scripts",
  "create-release-package-manifest.mjs",
);
const soakOrchestrator = join(
  process.cwd(),
  "scripts",
  "run-long-career-release-soak.mjs",
);
const soakLeaseRecovery = join(
  process.cwd(),
  "scripts",
  "recover-long-career-soak-lease.mjs",
);
const productionBuild = join(process.cwd(), "scripts", "build-production.mjs");
const provenanceAssertion = join(
  process.cwd(),
  "scripts",
  "assert-shipping-provenance.mjs",
);
const tempDirs: string[] = [];
// Each case creates a real Git repository and launches multiple child
// processes. Keep the timeout explicit so a busy CI host does not turn a
// correct integrity result into a nondeterministic five-second test failure.
const RELEASE_CHECK_TIMEOUT_MS = 20_000;

interface ReleaseSoakPlan {
  executionIdentityHash: string;
  executionIdentity: {
    candidateCommitSha: string;
    candidateTreeSha: string;
    maxSerializedBytes: number;
    workerTestTimeoutMs: number;
    orchestratorLockStaleMs: number;
    orchestratorLockUpdateMs: number;
    orchestratorAutomaticStaleRecovery: boolean;
    orchestratorRecoveryCommand: string;
  };
  sourceTreeClean: boolean;
  resumeEnabled: boolean;
  reusableSeedIndices: number[];
  pendingSeedIndices: number[];
  rejectedCheckpoints: Array<{ seedIndex: number; reason: string }>;
}

function run(cwd: string, command: string, args: string[]) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "talentscout-release-evidence-"));
  tempDirs.push(cwd);
  mkdirSync(join(cwd, "docs", "release"), { recursive: true });
  mkdirSync(join(cwd, "artifacts", "release"), { recursive: true });
  mkdirSync(join(cwd, "dist"), { recursive: true });
  writeFileSync(
    join(cwd, ".gitignore"),
    "dist/\nnode_modules/\nartifacts/release/candidate-package-manifest.json\nartifacts/release/release-evidence-check.json\nartifacts/release/generated/\n",
  );
  writeJson(join(cwd, "package.json"), {
    name: "talentscout-test",
    version: "1.0.0",
  });
  writeJson(join(cwd, "package-lock.json"), {
    name: "talentscout-test",
    version: "1.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: { "": { name: "talentscout-test", version: "1.0.0" } },
  });
  writeFileSync(join(cwd, "source.txt"), "candidate source\n");
  writeFileSync(join(cwd, "evidence.txt"), "verified\n");
  writeJson(join(cwd, "docs", "release", "release-evidence-status.json"), {
    schemaVersion: 2,
    candidate: {
      tag: null,
      requireVersionTag: false,
      packageManifest: "artifacts/release/candidate-package-manifest.json",
      requiredPackageKinds: ["test-package"],
    },
    gates: {
      automated: { status: "Passed", evidence: ["evidence.txt"] },
    },
  });
  run(cwd, "git", ["init"]);
  run(cwd, "git", ["config", "user.email", "release-test@example.test"]);
  run(cwd, "git", ["config", "user.name", "Release Test"]);
  run(cwd, "git", ["add", "."]);
  run(cwd, "git", ["commit", "-m", "candidate"]);
  const commitSha = run(cwd, "git", ["rev-parse", "HEAD"]);
  mkdirSync(join(cwd, "node_modules"), { recursive: true });
  writeJson(join(cwd, "node_modules", ".package-lock.json"), {
    name: "talentscout-test",
    version: "1.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: {},
  });
  const packageBytes = Buffer.from("signed package bytes");
  writeFileSync(join(cwd, "dist", "package.bin"), packageBytes);
  writeJson(join(cwd, "artifacts", "release", "candidate-package-manifest.json"), {
    schemaVersion: 2,
    generatedAt: "2026-07-13T00:00:00.000Z",
    candidateCommitSha: commitSha,
    candidateTag: null,
    product: "talentscout-test",
    productVersion: "1.0.0",
    workflowRunId: null,
    packages: [
      {
        kind: "test-package",
        path: "dist/package.bin",
        bytes: packageBytes.length,
        sha256: createHash("sha256").update(packageBytes).digest("hex"),
      },
    ],
  });
  return { cwd, commitSha };
}

function releaseNeutralEnvironment(overrides: Record<string, string> = {}) {
  const env = { ...process.env };
  // Fixture repositories model their own candidate independently of the
  // checkout that runs Vitest. GitHub exposes tag metadata to every child
  // process in tag workflows, so leave that metadata out unless a test
  // deliberately supplies it.
  for (const key of [
    "GITHUB_REF",
    "GITHUB_REF_NAME",
    "GITHUB_REF_TYPE",
    "GITHUB_RUN_ID",
    "GITHUB_SHA",
    "RELEASE_CANDIDATE_SHA",
    "RELEASE_CANDIDATE_TAG",
    "RELEASE_WORKFLOW_RUN_ID",
    "SOAK_CANDIDATE_SHA",
    "SOAK_CONCURRENCY",
    "SOAK_MAX_SERIALIZED_BYTES",
    "SOAK_OUTPUT",
    "SOAK_PLAN_ONLY",
    "SOAK_REQUIRE_CLEAN_CANDIDATE",
    "SOAK_RESUME",
    "SOAK_SEEDS",
    "SOAK_SEASONS",
    "SOAK_WORKER_DIRECTORY",
    "SOAK_WORKER_TEST_TIMEOUT_MS",
  ]) {
    delete env[key];
  }
  return { ...env, ...overrides };
}

function check(cwd: string, overrides: Record<string, string> = {}) {
  const env = releaseNeutralEnvironment(overrides);
  const result = spawnSync(process.execPath, [checker, "--report-only"], {
    cwd,
    env,
    encoding: "utf8",
  });
  expect(result.status).toBe(0);
  return JSON.parse(
    readFileSync(join(cwd, "artifacts", "release", "release-evidence-check.json"), "utf8"),
  );
}

function planReleaseSoak(
  cwd: string,
  workerDirectory: string,
  overrides: Record<string, string> = {},
): ReleaseSoakPlan {
  const result = spawnSync(process.execPath, [soakOrchestrator], {
    cwd,
    env: releaseNeutralEnvironment({
      SOAK_SEEDS: "1",
      SOAK_SEASONS: "1",
      SOAK_CONCURRENCY: "1",
      SOAK_PLAN_ONLY: "true",
      SOAK_WORKER_DIRECTORY: workerDirectory,
      ...overrides,
    }),
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
  const line = result.stdout
    .split(/\r?\n/)
    .find((entry) => entry.startsWith("SOAK_RELEASE_PLAN "));
  expect(line).toBeDefined();
  return JSON.parse(line!.slice("SOAK_RELEASE_PLAN ".length)) as ReleaseSoakPlan;
}

function validSoakWorkerCheckpoint(plan: ReleaseSoakPlan) {
  const initialMemorySample = {
    season: 1,
    week: 1,
    canonicalTick: 0,
    heapUsedBytes: 1,
    rssBytes: 1,
    externalBytes: 0,
    arrayBuffersBytes: 0,
  };
  const finalMemorySample = {
    season: 2,
    week: 1,
    canonicalTick: 46,
    heapUsedBytes: 1,
    rssBytes: 1,
    externalBytes: 0,
    arrayBuffersBytes: 0,
  };
  const runEvidence = {
    seed: "release-soak-01",
    reachedSeason: 2,
    canonicalTicks: 46,
    expectedCanonicalTicks: 46,
    calendarWeeksSpanned: 46,
    seasonLengths: [{ season: 1, weeks: 46 }],
    seasonCalendarAudits: [createSeasonCalendarAudit(1)],
    initialBytes: 1,
    finalBytes: 1,
    peakBytes: 1,
    finalToInitialRatio: 1,
    worldHistorySeasons: 1,
    worldHistoryBytes: 1,
    largestCollections: [{ key: "players", bytes: 1 }],
    seasonGrowth: [{
      season: 2,
      serializedBytes: 1,
      growthBytes: 0,
      compactionRemovedBytes: 0,
      compactionEvents: 0,
      collectionBytes: collectionRecord(1),
      collectionCompactionDeltas: collectionRecord(0),
    }],
    compaction: {
      events: 0,
      seasonsWithReduction: 0,
      totalRemovedBytes: 0,
      collectionDeltas: collectionRecord(0),
    },
    memory: {
      initial: initialMemorySample,
      final: finalMemorySample,
      peakHeapUsedBytes: 1,
      peakRssBytes: 1,
      samples: [initialMemorySample, {
        ...initialMemorySample,
        week: 15,
        canonicalTick: 14,
      }, {
        ...initialMemorySample,
        week: 31,
        canonicalTick: 30,
      }, finalMemorySample],
    },
    midseasonInvariantSamples: [
      {
        season: 1,
        week: 15,
        canonicalTick: 14,
        serializedBytes: 1,
        heapUsedBytes: 1,
        rssBytes: 1,
        nonFiniteNumbers: 0,
        referenceViolations: 0,
        retentionReferenceViolations: 0,
        economyViolations: 0,
      },
      {
        season: 1,
        week: 31,
        canonicalTick: 30,
        serializedBytes: 1,
        heapUsedBytes: 1,
        rssBytes: 1,
        nonFiniteNumbers: 0,
        referenceViolations: 0,
        retentionReferenceViolations: 0,
        economyViolations: 0,
      },
    ],
    weeklyLatencyMs: { p50: 1, p95: 1, max: 1, mean: 1 },
    worldHealth: [{
      season: 2,
      activePlayers: 500,
      unsignedYouth: 50,
      freeAgents: 25,
      activeLoans: 10,
      reports: 0,
      observations: 0,
      inboxMessages: 1,
      financialBalance: 100_000,
    }],
    digest: "a".repeat(64),
  };
  const workerEvidence = {
    schemaVersion: 3,
    generatedAt: "2026-07-16T00:00:00.000Z",
    profile: {
      kind: "passive-world-canonical-weekly-career",
      seedCount: 1,
      seasonCount: 1,
      maxSerializedBytes: plan.executionIdentity.maxSerializedBytes,
      exactCanonicalTransitionAssertions: true,
      scenarioId: "youth-england-passive-world-v1",
      actionPolicy: "passive-world-no-scout-actions",
      fatiguePolicy: "reset-at-95-to-20-for-world-longevity",
      expectedSeasonLengthWeeks: 46,
      expectedCanonicalTicksPerSeed: 46,
      scheduledLeagueClubCounts: canonicalScheduledLeagueClubCounts,
      maxMidseasonInvariantSamplesPerSeason: 2,
      maxGrowthMultiplier: 64,
      maxHeapUsedBytes: 1536 * 1024 * 1024,
      maxRssBytes: 2 * 1024 * 1024 * 1024,
      maxPostGcHeapGrowthBytes: 1024 * 1024 * 1024,
      collectionByteBudgets: canonicalSoakCollectionBudgets,
    },
    aggregate: {},
    runs: [runEvidence],
    determinismReplay: runEvidence,
  };
  const workerEvidenceSha256 = createHash("sha256")
    .update(JSON.stringify(workerEvidence))
    .digest("hex");
  return {
    ...workerEvidence,
    checkpoint: {
      protocolVersion: 3,
      executionIdentityHash: plan.executionIdentityHash,
      candidateCommitSha: plan.executionIdentity.candidateCommitSha,
      candidateTreeSha: plan.executionIdentity.candidateTreeSha,
      seedIndex: 1,
      seed: "release-soak-01",
      seasonCount: 1,
      workerEvidenceHashAlgorithm: "sha256",
      workerEvidenceSha256,
      completedAt: "2026-07-16T00:00:00.000Z",
      elapsedMs: 1,
    },
  };
}

const canonicalSoakCollectionBudgets = {
  players: 32 * 1024 * 1024,
  worldHistory: 24 * 1024 * 1024,
  fixtures: 8 * 1024 * 1024,
  matchRatings: 8 * 1024 * 1024,
  playerMovementHistory: 8 * 1024 * 1024,
  retiredPlayers: 6 * 1024 * 1024,
  retiredPlayerIds: 512 * 1024,
  unsignedYouth: 12 * 1024 * 1024,
};

const canonicalSoakCollectionKeys = Object.keys(canonicalSoakCollectionBudgets);
const canonicalScheduledLeagueClubCounts = {
  "league-championship": 24,
  "league-one": 24,
  "league-premier": 20,
  "league-two": 24,
};

function createSeasonCalendarAudit(season: number) {
  const leagues = Object.entries(canonicalScheduledLeagueClubCounts).map(([leagueId, clubCount]) => ({
    leagueId,
    clubCount,
    weekCount: (clubCount - 1) * 2,
    fixtureCount: clubCount * (clubCount - 1),
    uniquePairCount: (clubCount * (clubCount - 1)) / 2,
  }));
  return {
    season,
    seasonLengthWeeks: 46,
    fixtureCount: leagues.reduce((sum, league) => sum + league.fixtureCount, 0),
    leagues,
  };
}

function collectionRecord(value: number) {
  return Object.fromEntries(canonicalSoakCollectionKeys.map((key) => [key, value]));
}

function createCompleteLongCareerRun(seedIndex: number, seasonCount = 30) {
  const seed = `release-soak-${String(seedIndex).padStart(2, "0")}`;
  const initialBytes = 1_000_000 + seedIndex * 1_000;
  const seasonLengths = Array.from({ length: seasonCount }, (_, index) => ({
    season: index + 1,
    weeks: 46,
  }));
  const expectedCanonicalTicks = seasonLengths.reduce((sum, entry) => sum + entry.weeks, 0);
  const seasonGrowth = Array.from({ length: seasonCount }, (_, index) => ({
    season: index + 2,
    serializedBytes: initialBytes + (index + 1) * 10_000,
    growthBytes: 10_000,
    compactionRemovedBytes: 100,
    compactionEvents: 1,
    collectionBytes: collectionRecord(10_000 + index),
    collectionCompactionDeltas: collectionRecord(-10),
  }));
  const finalBytes = seasonGrowth.at(-1)!.serializedBytes;
  const initialMemory = {
    season: 1,
    week: 1,
    canonicalTick: 0,
    heapUsedBytes: 10_000_000,
    rssBytes: 20_000_000,
    externalBytes: 1_000,
    arrayBuffersBytes: 500,
  };
  const memorySamples = [initialMemory];
  const midseasonInvariantSamples = [];
  let completedTicks = 0;
  let memorySampleIndex = 0;
  for (const entry of seasonLengths) {
    for (const week of [15, 31]) {
      memorySampleIndex += 1;
      const canonicalTick = completedTicks + week - 1;
      const memorySample = {
        season: entry.season,
        week,
        canonicalTick,
        heapUsedBytes: 10_000_000 + memorySampleIndex * 1_000,
        rssBytes: 20_000_000 + memorySampleIndex * 2_000,
        externalBytes: 1_000,
        arrayBuffersBytes: 500,
      };
      memorySamples.push(memorySample);
      midseasonInvariantSamples.push({
        season: entry.season,
        week,
        canonicalTick,
        serializedBytes: initialBytes + canonicalTick * 100,
        heapUsedBytes: memorySample.heapUsedBytes,
        rssBytes: memorySample.rssBytes,
        nonFiniteNumbers: 0,
        referenceViolations: 0,
        retentionReferenceViolations: 0,
        economyViolations: 0,
      });
    }
    completedTicks += entry.weeks;
    memorySampleIndex += 1;
    memorySamples.push({
      season: entry.season + 1,
      week: 1,
      canonicalTick: completedTicks,
      heapUsedBytes: 10_000_000 + memorySampleIndex * 1_000,
      rssBytes: 20_000_000 + memorySampleIndex * 2_000,
      externalBytes: 1_000,
      arrayBuffersBytes: 500,
    });
  }
  const finalMemory = { ...memorySamples.at(-1)! };
  return {
    seed,
    reachedSeason: seasonCount + 1,
    canonicalTicks: expectedCanonicalTicks,
    expectedCanonicalTicks,
    calendarWeeksSpanned: expectedCanonicalTicks,
    seasonLengths,
    seasonCalendarAudits: Array.from(
      { length: seasonCount },
      (_, index) => createSeasonCalendarAudit(index + 1),
    ),
    initialBytes,
    finalBytes,
    peakBytes: finalBytes,
    finalToInitialRatio: Math.round((finalBytes / initialBytes) * 100) / 100,
    worldHistorySeasons: seasonCount,
    worldHistoryBytes: 400_000,
    largestCollections: [
      { key: "players", bytes: 500_000 },
      { key: "worldHistory", bytes: 400_000 },
    ],
    seasonGrowth,
    compaction: {
      events: seasonCount,
      seasonsWithReduction: seasonCount,
      totalRemovedBytes: seasonCount * 100,
      collectionDeltas: collectionRecord(seasonCount * -10),
    },
    memory: {
      initial: initialMemory,
      final: finalMemory,
      peakHeapUsedBytes: finalMemory.heapUsedBytes,
      peakRssBytes: finalMemory.rssBytes,
      samples: memorySamples,
    },
    midseasonInvariantSamples,
    weeklyLatencyMs: { p50: 1, p95: 2, max: 3, mean: 1.5 },
    worldHealth: Array.from({ length: seasonCount }, (_, index) => ({
      season: index + 2,
      activePlayers: 500,
      unsignedYouth: 50,
      freeAgents: 25,
      activeLoans: 10,
      reports: 20 + index,
      observations: 30 + index,
      inboxMessages: 10 + index,
      financialBalance: 100_000 - index * 100,
    })),
    digest: createHash("sha256").update(seed).digest("hex"),
  };
}

function createCompleteLongCareerEvidence(
  cwd: string,
  candidateCommitSha: string,
  candidateTreeSha: string,
) {
  const seedCount = 20;
  const seasonCount = 30;
  const runs = Array.from(
    { length: seedCount },
    (_, index) => createCompleteLongCareerRun(index + 1, seasonCount),
  );
  const executionIdentity = {
    protocolVersion: 3,
    candidateCommitSha,
    candidateTreeSha,
    seedCount,
    seasonCount,
    concurrency: 3,
    maxSerializedBytes: 80 * 1024 * 1024,
    workerTestTimeoutMs: 2 * 60 * 60 * 1_000,
    orchestratorLockStaleMs: Number.MAX_SAFE_INTEGER,
    orchestratorLockUpdateMs: 60_000,
    orchestratorAutomaticStaleRecovery: false,
    orchestratorRecoveryCommand: "npm run release:recover-soak-lease",
    profileKind: "passive-world-canonical-weekly-career",
    processIsolation: "one-seeded-career-per-process",
    nodeVersion: process.version,
    nodeOptions: "",
    platform: process.platform,
    architecture: process.arch,
    availableParallelism: 4,
    totalMemoryBytes: 16 * 1024 * 1024 * 1024,
    cpuModel: "release-test-cpu",
    workflowRunId: null,
    packageLockSha256: createHash("sha256")
      .update(readFileSync(join(cwd, "package-lock.json")))
      .digest("hex"),
    installedPackageLockSha256: createHash("sha256")
      .update(readFileSync(join(cwd, "node_modules", ".package-lock.json")))
      .digest("hex"),
  };
  const executionIdentityHash = createHash("sha256")
    .update(JSON.stringify(executionIdentity))
    .digest("hex");
  const workerDirectory = join(
    cwd,
    "artifacts",
    "release",
    "generated",
    "long-career-workers",
  );
  mkdirSync(workerDirectory, { recursive: true });
  const workerProfile = {
    kind: "passive-world-canonical-weekly-career",
    authoritativeTicksPerSeason: "calendar-dependent",
    skippedOrdinaryWeeks: false,
    exactCanonicalTransitionAssertions: true,
    scenarioId: "youth-england-passive-world-v1",
    actionPolicy: "passive-world-no-scout-actions",
    fatiguePolicy: "reset-at-95-to-20-for-world-longevity",
    expectedSeasonLengthWeeks: 46,
    expectedCanonicalTicksPerSeed: 1_380,
    scheduledLeagueClubCounts: canonicalScheduledLeagueClubCounts,
    maxMidseasonInvariantSamplesPerSeason: 2,
    midseasonAbsoluteSaveBudgetAssertions: true,
    collectionBudgetsEnforcedAtSeasonBoundaries: true,
    seedCount: 1,
    seasonCount,
    deterministicReplaySeed: runs[0].seed,
    maxSerializedBytes: executionIdentity.maxSerializedBytes,
    maxGrowthMultiplier: 64,
    maxHeapUsedBytes: 1536 * 1024 * 1024,
    maxRssBytes: 2 * 1024 * 1024 * 1024,
    maxPostGcHeapGrowthBytes: 1024 * 1024 * 1024,
    collectionByteBudgets: canonicalSoakCollectionBudgets,
  };
  const writeWorker = (runEvidence: ReturnType<typeof createCompleteLongCareerRun>, seedIndex: number, suffix: string) => {
    const payload = {
      schemaVersion: 3,
      generatedAt: "2026-07-16T00:00:00.000Z",
      profile: workerProfile,
      aggregate: {},
      runs: [runEvidence],
      determinismReplay: runEvidence,
    };
    const payloadSha256 = createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex");
    const worker = {
      ...payload,
      checkpoint: {
        protocolVersion: 3,
        executionIdentityHash,
        candidateCommitSha,
        candidateTreeSha,
        seedIndex,
        seed: runEvidence.seed,
        seasonCount,
        workerEvidenceHashAlgorithm: "sha256",
        workerEvidenceSha256: payloadSha256,
        completedAt: "2026-07-16T00:00:00.000Z",
        elapsedMs: 1,
      },
    };
    const filename = `seed-${String(seedIndex).padStart(2, "0")}-${suffix}.json`;
    const path = join(workerDirectory, filename);
    writeJson(path, worker);
    return {
      seedIndex,
      seed: runEvidence.seed,
      path: `artifacts/release/generated/long-career-workers/${filename}`,
      payloadSha256,
      fileSha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
    };
  };
  const workerEvidence = runs.map((runEvidence, index) => (
    writeWorker(runEvidence, index + 1, "run")
  ));
  const determinismReplay = structuredClone(runs[0]);
  const determinismReplayEvidence = writeWorker(
    determinismReplay,
    1,
    "determinism-replay",
  );
  const evidenceManifest = {
    hashAlgorithm: "sha256",
    workerHashPayload:
      "canonical JSON payload excluding the root checkpoint field plus exact worker file bytes",
    executionIdentitySha256: executionIdentityHash,
    workerEvidence,
    determinismReplayEvidence,
  };
  return {
    schemaVersion: 4,
    evidenceKind: "long-career-release-soak",
    generatedAt: "2026-07-16T00:00:00.000Z",
    candidateCommitSha,
    candidateTreeSha,
    candidateBound: true,
    sourceTreeClean: true,
    status: "Passed",
    evidenceIntegrity: {
      ...evidenceManifest,
      manifestSha256: createHash("sha256")
        .update(JSON.stringify(evidenceManifest))
        .digest("hex"),
    },
    checkpoint: {
      protocolVersion: 3,
      executionIdentity,
      executionIdentityHash,
      resumeEnabled: true,
      reusedSeedCount: 0,
      executedSeedCount: seedCount,
      determinismReplayExecuted: true,
    },
    profile: {
      kind: "passive-world-canonical-weekly-career",
      authoritativeTicksPerSeason: "calendar-dependent",
      skippedOrdinaryWeeks: false,
      exactCanonicalTransitionAssertions: true,
      scenarioId: "youth-england-passive-world-v1",
      actionPolicy: "passive-world-no-scout-actions",
      fatiguePolicy: "reset-at-95-to-20-for-world-longevity",
      expectedSeasonLengthWeeks: 46,
      expectedCanonicalTicksPerSeed: 1_380,
      workerTestTimeoutMs: executionIdentity.workerTestTimeoutMs,
      orchestratorLockStaleMs: executionIdentity.orchestratorLockStaleMs,
      orchestratorLockUpdateMs: executionIdentity.orchestratorLockUpdateMs,
      orchestratorAutomaticStaleRecovery:
        executionIdentity.orchestratorAutomaticStaleRecovery,
      orchestratorRecoveryCommand: executionIdentity.orchestratorRecoveryCommand,
      scheduledLeagueClubCounts: canonicalScheduledLeagueClubCounts,
      maxMidseasonInvariantSamplesPerSeason: 2,
      midseasonAbsoluteSaveBudgetAssertions: true,
      collectionBudgetsEnforcedAtSeasonBoundaries: true,
      seedCount,
      seasonCount,
      deterministicReplaySeed: runs[0].seed,
      maxSerializedBytes: executionIdentity.maxSerializedBytes,
      maxGrowthMultiplier: 64,
      maxHeapUsedBytes: 1536 * 1024 * 1024,
      maxRssBytes: 2 * 1024 * 1024 * 1024,
      maxPostGcHeapGrowthBytes: 1024 * 1024 * 1024,
      collectionByteBudgets: canonicalSoakCollectionBudgets,
      concurrency: executionIdentity.concurrency,
      processIsolation: executionIdentity.processIsolation,
      explicitGcAtSeasonBoundaries: true,
    },
    aggregate: {
      totalCanonicalTicks: runs.reduce((sum, run) => sum + run.canonicalTicks, 0),
      totalCalendarWeeksSpanned: runs.reduce(
        (sum, run) => sum + run.calendarWeeksSpanned,
        0,
      ),
      largestSaveBytes: Math.max(...runs.map((run) => run.peakBytes)),
      largestFinalToInitialRatio: Math.max(...runs.map((run) => run.finalToInitialRatio)),
      peakHeapUsedBytes: Math.max(...runs.map((run) => run.memory.peakHeapUsedBytes)),
      peakRssBytes: Math.max(...runs.map((run) => run.memory.peakRssBytes)),
      largestSingleSeasonGrowthBytes: 10_000,
      totalCompactionRemovedBytes: runs.reduce(
        (sum, run) => sum + run.compaction.totalRemovedBytes,
        0,
      ),
      compactionCollectionDeltas: collectionRecord(seedCount * seasonCount * -10),
      weeklyLatencyMs: { p50: 1, p95: 2, max: 3 },
    },
    runs,
    determinismReplay,
  };
}

function fixtureWithLongSavePolicy() {
  const { cwd } = fixture();
  const statusPath = join(cwd, "docs", "release", "release-evidence-status.json");
  const status = JSON.parse(readFileSync(statusPath, "utf8"));
  status.gates.longSave = {
    status: "Unverified",
    evidence: [],
    generatedEvidence: {
      kind: "long-career-release-soak",
      path: "artifacts/release/generated/long-career.json",
      minimumSeedCount: 20,
      minimumSeasonCount: 30,
      requireProcessIsolation: true,
      requireDeterministicReplay: true,
      requiredProfile: {
        seedCount: 20,
        seasonCount: 30,
        concurrency: 3,
        scenarioId: "youth-england-passive-world-v1",
        actionPolicy: "passive-world-no-scout-actions",
        fatiguePolicy: "reset-at-95-to-20-for-world-longevity",
        expectedSeasonLengthWeeks: 46,
        expectedCanonicalTicksPerSeed: 1_380,
        workerTestTimeoutMs: 2 * 60 * 60 * 1_000,
        orchestratorLockStaleMs: Number.MAX_SAFE_INTEGER,
        orchestratorLockUpdateMs: 60_000,
        orchestratorAutomaticStaleRecovery: false,
        orchestratorRecoveryCommand: "npm run release:recover-soak-lease",
        maxCanonicalWeekLatencyMs: 30_000,
        maxSerializedBytes: 80 * 1024 * 1024,
        maxGrowthMultiplier: 64,
        maxHeapUsedBytes: 1536 * 1024 * 1024,
        maxRssBytes: 2 * 1024 * 1024 * 1024,
        maxPostGcHeapGrowthBytes: 1024 * 1024 * 1024,
        scheduledLeagueClubCounts: canonicalScheduledLeagueClubCounts,
        collectionByteBudgets: canonicalSoakCollectionBudgets,
      },
    },
  };
  writeJson(statusPath, status);
  run(cwd, "git", ["add", "docs/release/release-evidence-status.json"]);
  run(cwd, "git", ["commit", "-m", "add long save policy"]);
  const candidateCommitSha = run(cwd, "git", ["rev-parse", "HEAD"]);
  const candidateTreeSha = run(cwd, "git", ["rev-parse", "HEAD^{tree}"]);
  const manifestPath = join(cwd, "artifacts", "release", "candidate-package-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.candidateCommitSha = candidateCommitSha;
  writeJson(manifestPath, manifest);
  const evidencePath = join(cwd, "artifacts", "release", "generated", "long-career.json");
  mkdirSync(join(cwd, "artifacts", "release", "generated"), { recursive: true });
  return { cwd, candidateCommitSha, candidateTreeSha, evidencePath };
}

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe("release evidence checker", () => {
  it("derives production build provenance from the full HEAD SHA", () => {
    const env = { ...process.env };
    delete env.NEXT_PUBLIC_BUILD_VERSION;
    const result = spawnSync(process.execPath, [productionBuild, "--print-provenance"], {
      cwd: process.cwd(),
      env,
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    const provenance = JSON.parse(result.stdout.trim());
    expect(provenance.candidateCommitSha).toBe(
      run(process.cwd(), "git", ["rev-parse", "HEAD"]).toLowerCase(),
    );
    expect(provenance.productVersion).toBe("1.0.0");

    const rejected = spawnSync(process.execPath, [productionBuild, "--print-provenance"], {
      cwd: process.cwd(),
      env: { ...env, NEXT_PUBLIC_BUILD_VERSION: "development" },
      encoding: "utf8",
    });
    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain("must be a full Git commit SHA");
  });

  it("rejects shipping JavaScript that omits exact save provenance", () => {
    const cwd = mkdtempSync(join(tmpdir(), "talentscout-provenance-"));
    tempDirs.push(cwd);
    const output = join(cwd, "out", "_next", "static");
    mkdirSync(output, { recursive: true });
    const sha = "a".repeat(40);
    writeFileSync(join(output, "save.js"), `const buildVersion="${sha}";`, "utf8");
    const passed = spawnSync(
      process.execPath,
      [provenanceAssertion, `--expected=${sha}`],
      { cwd, encoding: "utf8" },
    );
    expect(passed.status).toBe(0);

    writeFileSync(join(output, "save.js"), 'const buildVersion="development";', "utf8");
    const failed = spawnSync(
      process.execPath,
      [provenanceAssertion, `--expected=${sha}`],
      { cwd, encoding: "utf8" },
    );
    expect(failed.status).not.toBe(0);
    expect(failed.stderr).toContain("does not contain the exact build provenance");
  });

  it("rejects unsafe long-soak concurrency before starting worker processes", () => {
    const result = spawnSync(process.execPath, [soakOrchestrator], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SOAK_SEEDS: "2",
        SOAK_SEASONS: "1",
        SOAK_CONCURRENCY: "3",
      },
      encoding: "utf8",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "SOAK_CONCURRENCY must be positive and no greater than SOAK_SEEDS",
    );
  });

  it("rejects invalid worker timeouts before starting long-soak processes", () => {
    const result = spawnSync(process.execPath, [soakOrchestrator], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SOAK_SEEDS: "1",
        SOAK_SEASONS: "1",
        SOAK_CONCURRENCY: "1",
        SOAK_WORKER_TEST_TIMEOUT_MS: "0",
      },
      encoding: "utf8",
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("SOAK_WORKER_TEST_TIMEOUT_MS must be positive");
  });

  it("rejects a second orchestrator before it can write or start workers", () => {
    const { cwd } = fixture();
    const workerDirectory = join(
      cwd,
      "artifacts",
      "release",
      "generated",
      "long-career-workers",
    );
    mkdirSync(workerDirectory, { recursive: true });
    const generatedDirectory = join(cwd, "artifacts", "release", "generated");
    const lockPath = join(generatedDirectory, "long-career-soak-orchestrator.lock");
    const ownerPath = join(generatedDirectory, "long-career-soak-orchestrator.owner.json");
    const existingLease = {
      schemaVersion: 1,
      evidenceKind: "long-career-soak-orchestrator-lease",
      leaseId: "existing-lease",
      pid: 4242,
      startedAt: "2026-07-17T00:00:00.000Z",
      candidateCommitSha: "a".repeat(40),
    };
    mkdirSync(lockPath);
    writeJson(ownerPath, existingLease);

    const result = spawnSync(process.execPath, [soakOrchestrator], {
      cwd,
      env: releaseNeutralEnvironment({
        SOAK_SEEDS: "1",
        SOAK_SEASONS: "1",
        SOAK_CONCURRENCY: "1",
        SOAK_OUTPUT: join(cwd, "artifacts", "release", "generated", "soak.json"),
        SOAK_WORKER_DIRECTORY: workerDirectory,
        SOAK_RESUME: "false",
      }),
      encoding: "utf8",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("evidence is already leased");
    expect(result.stderr).toContain("pid=4242");
    expect(result.stdout).not.toContain("SOAK_WORKER_START");
    expect(JSON.parse(readFileSync(ownerPath, "utf8"))).toEqual(existingLease);
    expect(existsSync(lockPath)).toBe(true);
  }, RELEASE_CHECK_TIMEOUT_MS);

  it("fails closed on a fresh lock with corrupt owner metadata", () => {
    const { cwd } = fixture();
    const generatedDirectory = join(cwd, "artifacts", "release", "generated");
    const workerDirectory = join(generatedDirectory, "corrupt-owner-workers");
    const lockPath = join(generatedDirectory, "long-career-soak-orchestrator.lock");
    const ownerPath = join(generatedDirectory, "long-career-soak-orchestrator.owner.json");
    mkdirSync(generatedDirectory, { recursive: true });
    mkdirSync(lockPath);
    writeFileSync(ownerPath, "not-json", "utf8");

    const result = spawnSync(process.execPath, [soakOrchestrator], {
      cwd,
      env: releaseNeutralEnvironment({
        SOAK_SEEDS: "1",
        SOAK_SEASONS: "1",
        SOAK_CONCURRENCY: "1",
        SOAK_OUTPUT: join(generatedDirectory, "corrupt-owner-soak.json"),
        SOAK_WORKER_DIRECTORY: workerDirectory,
        SOAK_RESUME: "false",
      }),
      encoding: "utf8",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("owner metadata is unreadable");
    expect(result.stdout).not.toContain("SOAK_WORKER_START");
    expect(existsSync(lockPath)).toBe(true);
  }, RELEASE_CHECK_TIMEOUT_MS);

  it("never takes over a stale global lease automatically", () => {
    const { cwd } = fixture();
    const generatedDirectory = join(cwd, "artifacts", "release", "generated");
    const workerDirectory = join(generatedDirectory, "stale-lease-workers");
    const lockPath = join(generatedDirectory, "long-career-soak-orchestrator.lock");
    const ownerPath = join(generatedDirectory, "long-career-soak-orchestrator.owner.json");
    mkdirSync(generatedDirectory, { recursive: true });
    mkdirSync(lockPath);
    writeFileSync(ownerPath, "not-json", "utf8");
    const staleAt = new Date(Date.now() - 3 * 60 * 60 * 1_000);
    utimesSync(lockPath, staleAt, staleAt);

    const result = spawnSync(process.execPath, [soakOrchestrator], {
      cwd,
      env: releaseNeutralEnvironment({
        SOAK_SEEDS: "1",
        SOAK_SEASONS: "1",
        SOAK_CONCURRENCY: "1",
        SOAK_OUTPUT: join(generatedDirectory, "stale-lease-soak.json"),
        SOAK_WORKER_DIRECTORY: workerDirectory,
        SOAK_RESUME: "false",
      }),
      encoding: "utf8",
    });

    expect(result.status).not.toBe(0);
    expect(result.stdout).not.toContain("SOAK_WORKER_START");
    expect(result.stderr).toContain("evidence is already leased");
    expect(result.stderr).toContain("release:recover-soak-lease");
    expect(existsSync(lockPath)).toBe(true);
    expect(existsSync(ownerPath)).toBe(true);
  }, RELEASE_CHECK_TIMEOUT_MS);

  it("refuses explicit lease recovery while the recorded owner is alive", () => {
    const { cwd } = fixture();
    const generatedDirectory = join(cwd, "artifacts", "release", "generated");
    const lockPath = join(generatedDirectory, "long-career-soak-orchestrator.lock");
    const ownerPath = join(generatedDirectory, "long-career-soak-orchestrator.owner.json");
    mkdirSync(generatedDirectory, { recursive: true });
    mkdirSync(lockPath);
    writeJson(ownerPath, {
      leaseId: "live-owner",
      pid: process.pid,
      startedAt: "2026-07-17T00:00:00.000Z",
    });

    const result = spawnSync(process.execPath, [soakLeaseRecovery], {
      cwd,
      encoding: "utf8",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(`recorded orchestrator PID ${process.pid} is still alive`);
    expect(existsSync(lockPath)).toBe(true);
    expect(existsSync(ownerPath)).toBe(true);
  }, RELEASE_CHECK_TIMEOUT_MS);

  it("explicitly recovers a corrupt orphan lease after process verification", () => {
    const { cwd } = fixture();
    const generatedDirectory = join(cwd, "artifacts", "release", "generated");
    const lockPath = join(generatedDirectory, "long-career-soak-orchestrator.lock");
    const ownerPath = join(generatedDirectory, "long-career-soak-orchestrator.owner.json");
    mkdirSync(generatedDirectory, { recursive: true });
    mkdirSync(lockPath);
    writeFileSync(ownerPath, "not-json", "utf8");

    const result = spawnSync(process.execPath, [soakLeaseRecovery], {
      cwd,
      encoding: "utf8",
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("LONG_CAREER_SOAK_LEASE_RECOVERY recovered lease=unknown");
    expect(existsSync(lockPath)).toBe(false);
    expect(existsSync(ownerPath)).toBe(false);
  }, RELEASE_CHECK_TIMEOUT_MS);

  it("refuses corrupt-owner recovery when a long repo-local Vitest process is alive", async () => {
    const { cwd } = fixture();
    const generatedDirectory = join(cwd, "artifacts", "release", "generated");
    const lockPath = join(generatedDirectory, "long-career-soak-orchestrator.lock");
    const ownerPath = join(generatedDirectory, "long-career-soak-orchestrator.owner.json");
    mkdirSync(generatedDirectory, { recursive: true });
    mkdirSync(lockPath);
    writeFileSync(ownerPath, "not-json", "utf8");

    const longPadding = "x".repeat(256);
    const vitestMarker = join(cwd, "node_modules", "vitest", "dist", "workers", "forks.js");
    const blocker = spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 1_000)", longPadding, vitestMarker],
      { cwd, stdio: "ignore" },
    );
    await new Promise<void>((resolveSpawn, rejectSpawn) => {
      blocker.once("spawn", resolveSpawn);
      blocker.once("error", rejectSpawn);
    });

    try {
      const result = spawnSync(process.execPath, [soakLeaseRecovery], {
        cwd,
        encoding: "utf8",
      });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("active soak processes");
      expect(result.stderr).toContain(String(blocker.pid));
      expect(existsSync(lockPath)).toBe(true);
      expect(existsSync(ownerPath)).toBe(true);
    } finally {
      if (blocker.exitCode === null && blocker.signalCode === null) {
        blocker.kill("SIGKILL");
        await Promise.race([
          new Promise<void>((resolveClose) => blocker.once("close", () => resolveClose())),
          new Promise<void>((resolveTimeout) => setTimeout(resolveTimeout, 2_000)),
        ]);
      }
    }
  }, RELEASE_CHECK_TIMEOUT_MS);

  it("rejects release certification when environment overrides weaken the committed soak profile", () => {
    const { cwd } = fixture();
    const weakened = spawnSync(process.execPath, [soakOrchestrator], {
      cwd,
      env: releaseNeutralEnvironment({
        SOAK_SEEDS: "1",
        SOAK_SEASONS: "1",
        SOAK_CONCURRENCY: "1",
        SOAK_MAX_SERIALIZED_BYTES: String(800 * 1024 * 1024),
        SOAK_WORKER_TEST_TIMEOUT_MS: String(60 * 60 * 1_000),
        SOAK_REQUIRE_CLEAN_CANDIDATE: "true",
        SOAK_PLAN_ONLY: "true",
      }),
      encoding: "utf8",
    });
    expect(weakened.status).not.toBe(0);
    expect(weakened.stderr).toContain("requires the committed 20-seed x 30-season");

    const exact = spawnSync(process.execPath, [soakOrchestrator], {
      cwd,
      env: releaseNeutralEnvironment({
        SOAK_SEEDS: "20",
        SOAK_SEASONS: "30",
        SOAK_CONCURRENCY: "3",
        SOAK_REQUIRE_CLEAN_CANDIDATE: "true",
        SOAK_PLAN_ONLY: "true",
      }),
      encoding: "utf8",
    });
    expect(exact.status, exact.stderr).toBe(0);
    const exactPlanLine = exact.stdout
      .split(/\r?\n/)
      .find((entry) => entry.startsWith("SOAK_RELEASE_PLAN "));
    expect(exactPlanLine).toBeDefined();
    const exactPlan = JSON.parse(exactPlanLine!.slice("SOAK_RELEASE_PLAN ".length)) as ReleaseSoakPlan;
    expect(exactPlan.executionIdentity.workerTestTimeoutMs).toBe(2 * 60 * 60 * 1_000);
  }, RELEASE_CHECK_TIMEOUT_MS);

  it("resumes only complete workers bound to the exact clean candidate and profile", () => {
    const { cwd } = fixture();
    const workerDirectory = join(
      cwd,
      "artifacts",
      "release",
      "generated",
      "long-career-workers",
    );
    mkdirSync(workerDirectory, { recursive: true });

    const initial = planReleaseSoak(cwd, workerDirectory);
    expect(initial).toMatchObject({
      sourceTreeClean: true,
      resumeEnabled: true,
      reusableSeedIndices: [],
      pendingSeedIndices: [1],
    });

    const stale = validSoakWorkerCheckpoint(initial);
    stale.checkpoint.executionIdentityHash = "0".repeat(64);
    writeJson(join(workerDirectory, "seed-01-run.json"), stale);
    const rejected = planReleaseSoak(cwd, workerDirectory);
    expect(rejected.reusableSeedIndices).toEqual([]);
    expect(rejected.rejectedCheckpoints[0]?.reason).toContain(
      "belongs to another candidate, runtime, or soak profile",
    );

    writeJson(
      join(workerDirectory, "seed-01-run.json"),
      validSoakWorkerCheckpoint(initial),
    );
    const reusable = planReleaseSoak(cwd, workerDirectory);
    expect(reusable.reusableSeedIndices).toEqual([1]);
    expect(reusable.pendingSeedIndices).toEqual([]);

    const changedBudget = planReleaseSoak(cwd, workerDirectory, {
      SOAK_MAX_SERIALIZED_BYTES: String(64 * 1024 * 1024),
    });
    expect(changedBudget.reusableSeedIndices).toEqual([]);
    expect(changedBudget.rejectedCheckpoints[0]?.reason).toContain(
      "belongs to another candidate, runtime, or soak profile",
    );

    const changedTimeout = planReleaseSoak(cwd, workerDirectory, {
      SOAK_WORKER_TEST_TIMEOUT_MS: String(3 * 60 * 60 * 1_000),
    });
    expect(changedTimeout.reusableSeedIndices).toEqual([]);
    expect(changedTimeout.rejectedCheckpoints[0]?.reason).toContain(
      "belongs to another candidate, runtime, or soak profile",
    );

    writeFileSync(join(cwd, "source.txt"), "candidate source changed\n", "utf8");
    const dirty = planReleaseSoak(cwd, workerDirectory);
    expect(dirty).toMatchObject({
      sourceTreeClean: false,
      resumeEnabled: false,
      reusableSeedIndices: [],
      pendingSeedIndices: [1],
    });
  }, RELEASE_CHECK_TIMEOUT_MS);

  it("generates a candidate-bound manifest without changing tracked state", () => {
    const { cwd, commitSha } = fixture();
    const manifestPath = join(cwd, "artifacts", "release", "candidate-package-manifest.json");
    unlinkSync(manifestPath);

    const result = spawnSync(
      process.execPath,
      [manifestGenerator, "test-package=dist/package.bin"],
      { cwd, env: releaseNeutralEnvironment(), encoding: "utf8" },
    );
    expect(result.status).toBe(0);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(manifest.candidateCommitSha).toBe(commitSha);
    expect(manifest).toMatchObject({
      schemaVersion: 2,
      productVersion: "1.0.0",
      candidateTag: null,
    });
    expect(manifest.packages[0]).toMatchObject({
      kind: "test-package",
      path: "dist/package.bin",
      bytes: 20,
    });
    expect(run(cwd, "git", ["status", "--porcelain", "--untracked-files=all"])).toBe("");
  }, RELEASE_CHECK_TIMEOUT_MS);

  it("records a compatible GitHub tag in a candidate manifest", () => {
    const { cwd, commitSha } = fixture();
    run(cwd, "git", ["tag", "-a", "v1.0.0-rc.1", "-m", "candidate"]);
    const manifestPath = join(cwd, "artifacts", "release", "candidate-package-manifest.json");
    unlinkSync(manifestPath);

    const result = spawnSync(
      process.execPath,
      [manifestGenerator, "test-package=dist/package.bin"],
      {
        cwd,
        env: releaseNeutralEnvironment({
          GITHUB_REF_TYPE: "tag",
          GITHUB_REF_NAME: "v1.0.0-rc.1",
          GITHUB_RUN_ID: "12345",
        }),
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toMatchObject({
      candidateCommitSha: commitSha,
      candidateTag: "v1.0.0-rc.1",
      workflowRunId: "12345",
    });
  }, RELEASE_CHECK_TIMEOUT_MS);

  it("binds a clean candidate to HEAD and recomputes package integrity", () => {
    const { cwd, commitSha } = fixture();
    const report = check(cwd);

    expect(report.status).toBe("Passed");
    expect(report.candidate).toMatchObject({
      commitSha,
      currentHeadSha: commitSha,
      shaSource: "git HEAD",
    });
    expect(report.packageVerification.packages[0]).toMatchObject({
      status: "Passed",
      path: "dist/package.bin",
    });
  }, RELEASE_CHECK_TIMEOUT_MS);

  it("fails a dirty working tree without hiding the package result", () => {
    const { cwd } = fixture();
    writeFileSync(join(cwd, "source.txt"), "changed after package build\n");
    const report = check(cwd);

    expect(report.status).toBe("Failed");
    expect(report.dirty).toBe(true);
    expect(report.failures).toContain(
      "working tree is dirty; evidence cannot describe an exact shipping candidate",
    );
    expect(report.packageVerification.packages[0].status).toBe("Passed");
  }, RELEASE_CHECK_TIMEOUT_MS);

  it("fails when the CI candidate SHA does not match the checkout", () => {
    const { cwd } = fixture();
    const report = check(cwd, { GITHUB_SHA: "a".repeat(40) });

    expect(report.status).toBe("Failed");
    expect(report.candidate.shaSource).toBe("GITHUB_SHA");
    expect(report.failures).toEqual(
      expect.arrayContaining([expect.stringContaining("does not match HEAD")]),
    );
  }, RELEASE_CHECK_TIMEOUT_MS);

  it("fails when package bytes no longer match the candidate manifest", () => {
    const { cwd } = fixture();
    writeFileSync(join(cwd, "dist", "package.bin"), "tampered package bytes");
    const report = check(cwd);

    expect(report.status).toBe("Failed");
    expect(report.packageVerification.packages[0].status).toBe("Failed");
    expect(report.packageVerification.packages[0].failures).toEqual(
      expect.arrayContaining([
        "package byte length does not match",
        "package SHA-256 does not match",
      ]),
    );
  }, RELEASE_CHECK_TIMEOUT_MS);

  it("accepts a prerelease tag for the package version and rejects another version", () => {
    const { cwd } = fixture();
    run(cwd, "git", ["tag", "-a", "v1.0.0-rc.1", "-m", "candidate"]);
    const manifestPath = join(cwd, "artifacts", "release", "candidate-package-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.candidateTag = "v1.0.0-rc.1";
    writeJson(manifestPath, manifest);
    const statusPath = join(cwd, "docs", "release", "release-evidence-status.json");
    const status = JSON.parse(readFileSync(statusPath, "utf8"));
    status.candidate.requireVersionTag = true;
    writeJson(statusPath, status);
    run(cwd, "git", ["add", "docs/release/release-evidence-status.json"]);
    run(cwd, "git", ["commit", "-m", "require release tag"]);
    const updatedSha = run(cwd, "git", ["rev-parse", "HEAD"]);
    // Move the annotated candidate tag and generated manifest to the exact policy commit.
    run(cwd, "git", ["tag", "-f", "-a", "v1.0.0-rc.1", "-m", "candidate", updatedSha]);
    manifest.candidateCommitSha = updatedSha;
    writeJson(manifestPath, manifest);

    expect(check(cwd, { RELEASE_CANDIDATE_TAG: "v1.0.0-rc.1" }).status).toBe("Passed");
    const wrong = check(cwd, { RELEASE_CANDIDATE_TAG: "v2.0.0-rc.1" });
    expect(wrong.status).toBe("Failed");
    expect(wrong.failures).toEqual(
      expect.arrayContaining([expect.stringContaining("is not v1.0.0 or a prerelease")]),
    );
  }, RELEASE_CHECK_TIMEOUT_MS);

  it("promotes long-save policy only for clean exact-candidate 20x30 evidence", () => {
    const { cwd, candidateCommitSha, candidateTreeSha, evidencePath } =
      fixtureWithLongSavePolicy();
    writeJson(evidencePath, createCompleteLongCareerEvidence(cwd, candidateCommitSha, candidateTreeSha));

    const passed = check(cwd);
    expect(passed.status).toBe("Passed");
    expect(passed.gateResults.find((gate: { gateId: string }) => gate.gateId === "longSave"))
      .toMatchObject({ configuredStatus: "Unverified", status: "Passed" });

    const stale = JSON.parse(readFileSync(evidencePath, "utf8"));
    stale.candidateCommitSha = "a".repeat(40);
    stale.profile.seedCount = 2;
    stale.runs = stale.runs.slice(0, 2);
    writeJson(evidencePath, stale);
    const failed = check(cwd);
    expect(failed.status).toBe("Failed");
    expect(failed.failures).toEqual(expect.arrayContaining([
      expect.stringContaining("does not describe the exact candidate"),
      expect.stringContaining("requires exactly 20 canonical seeds"),
    ]));
  }, RELEASE_CHECK_TIMEOUT_MS);

  it("rejects the former minimal hand-authored long-save fixture", () => {
    const { cwd, candidateCommitSha, candidateTreeSha, evidencePath } =
      fixtureWithLongSavePolicy();
    const minimal = JSON.parse(JSON.stringify(
      createCompleteLongCareerEvidence(cwd, candidateCommitSha, candidateTreeSha),
    ));
    minimal.schemaVersion = 3;
    minimal.profile = {
      kind: "passive-world-canonical-weekly-career",
      skippedOrdinaryWeeks: false,
      seedCount: 20,
      seasonCount: 30,
      processIsolation: "one-seeded-career-per-process",
    };
    minimal.runs = Array.from({ length: 20 }, (_, index) => ({
      seed: `release-soak-${String(index + 1).padStart(2, "0")}`,
      reachedSeason: 31,
      canonicalTicks: 1140,
      calendarWeeksSpanned: 1140,
      digest: `digest-${index + 1}`,
    }));
    delete minimal.determinismReplay;
    minimal.persistenceReplay = {
      seed: minimal.runs[0].seed,
      digest: minimal.runs[0].digest,
    };
    delete minimal.aggregate;
    writeJson(evidencePath, minimal);

    const failed = check(cwd);
    expect(failed.status).toBe("Failed");
    const failureText = failed.failures.join("\n");
    expect(failureText).toContain("soak evidence schemaVersion must be 4");
    expect(failureText).toContain("soak profile is incomplete");
    expect(failureText).toContain("soak run 1 initialBytes is invalid");
    expect(failureText).toContain("soak run 1 deterministic digest");
    expect(failureText).toContain("soak aggregate evidence is missing");
    expect(failureText).toContain("soak deterministic replay is not a complete run record");
  }, RELEASE_CHECK_TIMEOUT_MS);

  it("rejects noncanonical seeds and missing per-run integrity evidence", () => {
    const { cwd, candidateCommitSha, candidateTreeSha, evidencePath } =
      fixtureWithLongSavePolicy();
    const tampered = JSON.parse(JSON.stringify(
      createCompleteLongCareerEvidence(cwd, candidateCommitSha, candidateTreeSha),
    ));
    tampered.runs[0].seed = "release-soak-20";
    tampered.runs[1].digest = "digest-2";
    delete tampered.runs[2].worldHealth;
    delete tampered.runs[3].compaction;
    delete tampered.runs[4].memory;
    tampered.runs[5].peakBytes = tampered.profile.maxSerializedBytes + 1;
    writeJson(evidencePath, tampered);

    const failed = check(cwd);
    expect(failed.status).toBe("Failed");
    expect(failed.failures).toEqual(expect.arrayContaining([
      expect.stringContaining("ordered canonical seed set"),
      expect.stringContaining("soak run 2 deterministic digest"),
      expect.stringContaining("soak run 3 is missing season-boundary world-health evidence"),
      expect.stringContaining("soak run 4 compaction evidence is invalid"),
      expect.stringContaining("soak run 5 memory evidence is incomplete"),
      expect.stringContaining("soak run 6 exceeded the serialized-save budget"),
    ]));
  }, RELEASE_CHECK_TIMEOUT_MS);

  it("rejects aggregate and deterministic-replay tampering", () => {
    const { cwd, candidateCommitSha, candidateTreeSha, evidencePath } =
      fixtureWithLongSavePolicy();
    const tampered = JSON.parse(JSON.stringify(
      createCompleteLongCareerEvidence(cwd, candidateCommitSha, candidateTreeSha),
    ));
    tampered.aggregate.totalCanonicalTicks += 1;
    tampered.aggregate.compactionCollectionDeltas.players += 1;
    tampered.determinismReplay.digest = "b".repeat(64);
    tampered.evidenceIntegrity.workerEvidence[0].payloadSha256 = "c".repeat(64);
    writeJson(evidencePath, tampered);

    const failed = check(cwd);
    expect(failed.status).toBe("Failed");
    expect(failed.failures).toEqual(expect.arrayContaining([
      expect.stringContaining("aggregate totalCanonicalTicks does not reconcile"),
      expect.stringContaining("aggregate players compaction delta does not reconcile"),
      expect.stringContaining("complete matching deterministic replay"),
      expect.stringContaining("worker-evidence hash manifest"),
    ]));
  }, RELEASE_CHECK_TIMEOUT_MS);

  it("rejects retained worker artifact tampering independently of the summary", () => {
    const { cwd, candidateCommitSha, candidateTreeSha, evidencePath } =
      fixtureWithLongSavePolicy();
    const evidence = createCompleteLongCareerEvidence(cwd, candidateCommitSha, candidateTreeSha);
    writeJson(evidencePath, evidence);
    const workerPath = join(
      cwd,
      "artifacts",
      "release",
      "generated",
      "long-career-workers",
      "seed-01-run.json",
    );
    const worker = JSON.parse(readFileSync(workerPath, "utf8"));
    worker.runs[0].digest = "f".repeat(64);
    writeJson(workerPath, worker);

    const failed = check(cwd);
    expect(failed.status).toBe("Failed");
    expect(failed.failures).toEqual(expect.arrayContaining([
      expect.stringContaining("soak worker 1 hash does not match its retained worker artifact"),
      expect.stringContaining("soak worker 1 does not reconcile with the candidate summary"),
    ]));
  }, RELEASE_CHECK_TIMEOUT_MS);

  it("rejects self-selected release budgets and shortened fixture calendars", () => {
    const { cwd, candidateCommitSha, candidateTreeSha, evidencePath } =
      fixtureWithLongSavePolicy();
    const evidence = createCompleteLongCareerEvidence(cwd, candidateCommitSha, candidateTreeSha);
    evidence.profile.maxSerializedBytes *= 10;
    evidence.profile.maxHeapUsedBytes *= 10;
    evidence.profile.collectionByteBudgets.players *= 10;
    evidence.runs[0].seasonLengths[0].weeks = 38;
    evidence.runs[0].seasonCalendarAudits[0].seasonLengthWeeks = 38;
    writeJson(evidencePath, evidence);

    const failed = check(cwd);
    expect(failed.status).toBe("Failed");
    expect(failed.failures).toEqual(expect.arrayContaining([
      expect.stringContaining("soak profile is incomplete"),
      expect.stringContaining("soak run 1 exact per-season calendar evidence"),
      expect.stringContaining("soak run 1 independently audited fixture calendar"),
    ]));
  }, RELEASE_CHECK_TIMEOUT_MS);

  it("accepts core suites only from the exact clean-start, source-unchanged candidate", () => {
    const { cwd } = fixture();
    const statusPath = join(cwd, "docs", "release", "release-evidence-status.json");
    const status = JSON.parse(readFileSync(statusPath, "utf8"));
    status.gates.automated = {
      status: "Unverified",
      evidence: [],
      generatedEvidence: {
        kind: "candidate-core-suites",
        path: "artifacts/release/generated/candidate-core-suites.json",
      },
    };
    writeJson(statusPath, status);
    run(cwd, "git", ["add", "docs/release/release-evidence-status.json"]);
    run(cwd, "git", ["commit", "-m", "require candidate core suites"]);
    const candidateSha = run(cwd, "git", ["rev-parse", "HEAD"]);
    const manifestPath = join(cwd, "artifacts", "release", "candidate-package-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.candidateCommitSha = candidateSha;
    writeJson(manifestPath, manifest);
    mkdirSync(join(cwd, "artifacts", "release", "generated"), { recursive: true });
    const evidencePath = join(
      cwd,
      "artifacts",
      "release",
      "generated",
      "candidate-core-suites.json",
    );
    writeJson(evidencePath, {
      schemaVersion: 1,
      evidenceKind: "candidate-core-suites",
      candidateCommitSha: candidateSha,
      workflowRunId: null,
      candidateBound: true,
      sourceTreeCleanAtStart: true,
      sourceAndConfigUnchangedAtCompletion: true,
      status: "Passed",
      commands: [{ command: "npm run test:unit", status: "Passed" }],
    });
    expect(check(cwd).gateResults.find(
      (gate: { gateId: string }) => gate.gateId === "automated",
    )).toMatchObject({ configuredStatus: "Unverified", status: "Passed" });

    const invalid = JSON.parse(readFileSync(evidencePath, "utf8"));
    invalid.sourceAndConfigUnchangedAtCompletion = false;
    writeJson(evidencePath, invalid);
    expect(check(cwd).failures).toEqual(
      expect.arrayContaining([expect.stringContaining("did not complete from a clean checkout")]),
    );
  }, RELEASE_CHECK_TIMEOUT_MS);

  it("promotes Windows only for the exact signed installed-package journey", () => {
    const { cwd } = fixture();
    const statusPath = join(cwd, "docs", "release", "release-evidence-status.json");
    const status = JSON.parse(readFileSync(statusPath, "utf8"));
    const schemaRelativePath = "docs/release/windows-runtime-operator-attestation.schema.json";
    writeFileSync(
      join(cwd, schemaRelativePath),
      readFileSync(
        join(process.cwd(), "docs", "release", "windows-runtime-operator-attestation.schema.json"),
      ),
    );
    status.candidate.requiredPackageKinds = ["windows-installer"];
    status.candidate.requireVersionTag = true;
    status.gates.packagedWindows = {
      status: "Unverified",
      evidence: [],
      generatedEvidence: {
        kind: "windows-packaged-runtime",
        path: "artifacts/release/generated/certifications/windows-runtime.json",
        requiredControls: [
          "packageManifestCandidateBinding",
          "installerInstalledAppOfflineSaveRestartUninstall",
          "interruptedWriteAtConfirmedTransactionBoundary",
        ],
        operatorAttestation: {
          kind: "windows-packaged-runtime-operator-attestation",
          schema: schemaRelativePath,
          certificationBundleRoot:
            "artifacts/release/generated/certifications/windows-runtime",
          attestableControls: ["interruptedWriteAtConfirmedTransactionBoundary"],
        },
      },
    };
    writeJson(statusPath, status);
    run(cwd, "git", [
      "add",
      "docs/release/release-evidence-status.json",
      schemaRelativePath,
    ]);
    run(cwd, "git", ["commit", "-m", "add Windows runtime policy"]);
    const candidateSha = run(cwd, "git", ["rev-parse", "HEAD"]);
    const candidateTreeSha = run(cwd, "git", ["rev-parse", "HEAD^{tree}"]);
    const candidateTag = "v1.0.0-rc.1";
    const workflowRunId = "12345";
    const signerCertificateSha256 = "d".repeat(64);
    run(cwd, "git", ["tag", "-a", candidateTag, "-m", "Windows candidate"]);
    const packageBytes = Buffer.from("signed package bytes");
    writeFileSync(join(cwd, "dist", "package.exe"), packageBytes);
    const packageHash = createHash("sha256").update(packageBytes).digest("hex");
    const manifestPath = join(cwd, "artifacts", "release", "candidate-package-manifest.json");
    writeJson(manifestPath, {
      schemaVersion: 2,
      generatedAt: "2026-07-13T00:00:00.000Z",
      candidateCommitSha: candidateSha,
      candidateTag,
      product: "talentscout-test",
      productVersion: "1.0.0",
      workflowRunId,
      packages: [{
        kind: "windows-installer",
        path: "dist/package.exe",
        bytes: packageBytes.length,
        sha256: packageHash,
      }],
    });
    const certificationBundleRelative =
      `artifacts/release/generated/certifications/windows-runtime/${candidateSha}`;
    const certificationBundle = join(cwd, certificationBundleRelative);
    mkdirSync(join(certificationBundle, "evidence"), {
      recursive: true,
    });
    const manualEvidenceRelative = `${certificationBundleRelative}/evidence/interrupted-write.log`;
    writeFileSync(join(cwd, manualEvidenceRelative), "interrupted write recovered exactly once\n");
    const manualEvidenceSha256 = createHash("sha256")
      .update(readFileSync(join(cwd, manualEvidenceRelative)))
      .digest("hex");
    const attestationRelative = `${certificationBundleRelative}/operator-attestation.json`;
    const manifestSha256 = createHash("sha256")
      .update(readFileSync(manifestPath))
      .digest("hex");
    const completedAt = "2026-07-16T14:00:00.000Z";
    const tester = { name: "Release Tester", role: "QA lead" };
    writeJson(join(cwd, attestationRelative), {
      schemaVersion: 1,
      evidenceKind: "windows-packaged-runtime-operator-attestation",
      status: "Passed",
      candidateCommitSha: candidateSha,
      candidateTreeSha,
      candidateTag,
      productVersion: "1.0.0",
      workflowRunId,
      signerCertificateSha256,
      packageManifestSha256: manifestSha256,
      packageHashes: { "windows-installer": packageHash },
      certificationBundlePath: certificationBundleRelative,
      tester,
      completedAt,
      environments: [{
        id: "windows-physical-1",
        hostType: "physical",
        osEdition: "Windows 11 Pro",
        osVersion: "24H2",
        architecture: "x64",
        accountType: "standard-user",
        filesystem: "NTFS",
        hardware: "minimum release profile",
        networkContext: "controlled offline and reconnect",
      }],
      evidence: [{
        id: "interrupted-write-log",
        path: manualEvidenceRelative,
        sha256: manualEvidenceSha256,
        description: "Transaction-boundary interruption and recovery log",
        type: "test-log",
        capturedAt: completedAt,
        controlIds: ["interruptedWriteAtConfirmedTransactionBoundary"],
      }],
      claims: [{
        controlId: "interruptedWriteAtConfirmedTransactionBoundary",
        status: "Passed",
        testedAt: completedAt,
        environmentIds: ["windows-physical-1"],
        evidenceIds: ["interrupted-write-log"],
      }],
    });
    const attestationSha256 = createHash("sha256")
      .update(readFileSync(join(cwd, attestationRelative)))
      .digest("hex");
    const schemaSha256 = createHash("sha256")
      .update(readFileSync(join(cwd, schemaRelativePath)))
      .digest("hex");
    const evidencePath = join(
      cwd,
      "artifacts",
      "release",
      "generated",
      "certifications",
      "windows-runtime.json",
    );
    writeJson(evidencePath, {
      schemaVersion: 1,
      sourceHead: candidateSha,
      sourceTree: candidateTreeSha,
      sourceTreeClean: true,
      sourceTreeCleanAtCompletion: true,
      sourceAndPackageUnchangedAtCompletion: true,
      candidateBound: true,
      productVersion: "1.0.0",
      workflowRunId,
      result: "certifying_pass",
      certification: {
        status: "Passed",
        requiredControlCount: 3,
        nonPassingRequiredControls: [],
        failedControls: [],
      },
      candidateManifestBinding: {
        passed: true,
        sha256: manifestSha256,
        candidateCommitSha: candidateSha,
        candidateTag,
        productVersion: "1.0.0",
        workflowRunId,
      },
      completionCandidateManifestBinding: {
        passed: true,
        sha256: manifestSha256,
        candidateCommitSha: candidateSha,
        candidateTag,
        productVersion: "1.0.0",
        workflowRunId,
      },
      authenticode: {
        installer: { Status: "Valid", SignerCertificateSha256: signerCertificateSha256 },
        unpackedExecutable: { Status: "Valid", SignerCertificateSha256: signerCertificateSha256 },
      },
      completionAuthenticode: {
        installer: { Status: "Valid", SignerCertificateSha256: signerCertificateSha256 },
        unpackedExecutable: { Status: "Valid", SignerCertificateSha256: signerCertificateSha256 },
      },
      signerBinding: {
        passed: true,
        expectedSignerCertificateSha256: signerCertificateSha256,
        observedSignerCertificateSha256: signerCertificateSha256,
        failures: [],
      },
      completionSignerBinding: {
        passed: true,
        expectedSignerCertificateSha256: signerCertificateSha256,
        observedSignerCertificateSha256: signerCertificateSha256,
        failures: [],
      },
      artifactStaging: {
        status: "Passed",
        sourceStableDuringStage: true,
        stagedCopyExact: true,
        unchangedAtCompletion: true,
        sourceInventorySha256: "e".repeat(64),
        testedInventorySha256: "e".repeat(64),
      },
      operatorAttestation: {
        status: "Accepted",
        path: attestationRelative,
        sha256: attestationSha256,
        tester,
        completedAt,
        schema: { path: schemaRelativePath, sha256: schemaSha256 },
        certificationBundlePath: certificationBundleRelative,
        claimedControls: ["interruptedWriteAtConfirmedTransactionBoundary"],
      },
      artifacts: [{
        kind: "windows-installer",
        path: "dist/package.exe",
        bytes: packageBytes.length,
        sha256: packageHash.toUpperCase(),
      }],
      exactCandidateInstallJourney: { status: "Passed", requested: true },
      controls: {
        packageManifestCandidateBinding: { status: "Passed" },
        installerInstalledAppOfflineSaveRestartUninstall: { status: "Passed" },
        interruptedWriteAtConfirmedTransactionBoundary: {
          status: "Passed",
          evidence: {
            source: "operator-attestation",
            attestationPath: attestationRelative,
            attestationSha256,
            tester,
            completedAt,
            testedAt: completedAt,
            environmentIds: ["windows-physical-1"],
            evidenceIds: ["interrupted-write-log"],
          },
        },
        optionalDiagnostic: { status: "Unverified" },
      },
    });

    const checkWindows = () => check(cwd, {
      RELEASE_CANDIDATE_TAG: candidateTag,
      RELEASE_WORKFLOW_RUN_ID: workflowRunId,
      WINDOWS_RELEASE_SIGNER_SHA256: signerCertificateSha256,
    });

    expect(check(cwd, {
      RELEASE_CANDIDATE_TAG: candidateTag,
      RELEASE_WORKFLOW_RUN_ID: workflowRunId,
    }).failures).toEqual(expect.arrayContaining([
      expect.stringContaining("WINDOWS_RELEASE_SIGNER_SHA256 is required"),
    ]));

    const passingWindowsReport = checkWindows();
    const passingWindowsGate = passingWindowsReport.gateResults.find(
      (gate: { gateId: string }) => gate.gateId === "packagedWindows",
    );
    expect(passingWindowsGate, JSON.stringify(passingWindowsGate, null, 2)).toMatchObject({
      configuredStatus: "Unverified",
      status: "Passed",
    });

    writeFileSync(join(cwd, manualEvidenceRelative), "tampered after certification\n");
    expect(checkWindows().failures).toEqual(expect.arrayContaining([
      expect.stringContaining("Windows operator attestation failed independent validation"),
    ]));
    writeFileSync(join(cwd, manualEvidenceRelative), "interrupted write recovered exactly once\n");

    const forgedCombinedEvidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    forgedCombinedEvidence.operatorAttestation.sha256 = "f".repeat(64);
    writeJson(evidencePath, forgedCombinedEvidence);
    expect(checkWindows().failures).toEqual(expect.arrayContaining([
      expect.stringContaining("operator attestation hash changed after runtime certification"),
    ]));
    forgedCombinedEvidence.operatorAttestation.sha256 = attestationSha256;
    writeJson(evidencePath, forgedCombinedEvidence);

    const omittedControlEvidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    delete omittedControlEvidence.controls.interruptedWriteAtConfirmedTransactionBoundary;
    writeJson(evidencePath, omittedControlEvidence);
    expect(checkWindows().failures).toEqual(expect.arrayContaining([
      expect.stringContaining(
        "required control interruptedWriteAtConfirmedTransactionBoundary is missing",
      ),
    ]));

    const unverifiedControlEvidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    unverifiedControlEvidence.controls.interruptedWriteAtConfirmedTransactionBoundary = {
      status: "Unverified",
    };
    writeJson(evidencePath, unverifiedControlEvidence);
    expect(checkWindows().failures).toEqual(expect.arrayContaining([
      expect.stringContaining(
        "required control interruptedWriteAtConfirmedTransactionBoundary is Unverified",
      ),
    ]));

    unverifiedControlEvidence.controls.interruptedWriteAtConfirmedTransactionBoundary = {
      status: "Passed",
    };
    writeJson(evidencePath, unverifiedControlEvidence);
    const contradictoryEvidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    contradictoryEvidence.limitations = [
      "The source tree was dirty, so this evidence is not candidate-bound.",
      "This run remains supporting unpacked-runtime evidence only.",
    ];
    writeJson(evidencePath, contradictoryEvidence);
    expect(checkWindows().failures).toEqual(expect.arrayContaining([
      expect.stringContaining("contradicts its passing exact installed-package journey"),
    ]));

    const failedEvidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    failedEvidence.limitations = [];
    failedEvidence.exactCandidateInstallJourney.status = "Unverified";
    failedEvidence.controls.offlineSaveQuitReopenContinue = { status: "Failed" };
    writeJson(evidencePath, failedEvidence);
    const failed = checkWindows();
    expect(failed.status).toBe("Failed");
    expect(failed.failures).toEqual(expect.arrayContaining([
      expect.stringContaining("exact Windows install-save-restart-load-uninstall journey did not pass"),
      expect.stringContaining("contains failed controls"),
    ]));
  }, RELEASE_CHECK_TIMEOUT_MS);

  it("accepts a separately supplied human attestation only when hashes bind exact packages and evidence", () => {
    const { cwd } = fixture();
    const statusPath = join(cwd, "docs", "release", "release-evidence-status.json");
    const status = JSON.parse(readFileSync(statusPath, "utf8"));
    status.gates.manualNvda = {
      status: "Unverified",
      evidence: [],
      generatedEvidence: {
        kind: "release-gate-attestation",
        path: "artifacts/release/generated/certifications/manual-nvda.json",
        requiredPackageKinds: ["test-package"],
        requiredControls: ["criticalJourneyCompleted", "seriousBlockersResolved"],
      },
    };
    writeJson(statusPath, status);
    run(cwd, "git", ["add", "docs/release/release-evidence-status.json"]);
    run(cwd, "git", ["commit", "-m", "add human certification policy"]);
    const candidateSha = run(cwd, "git", ["rev-parse", "HEAD"]);
    const manifestPath = join(cwd, "artifacts", "release", "candidate-package-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.candidateCommitSha = candidateSha;
    writeJson(manifestPath, manifest);
    const certificationDirectory = join(cwd, "artifacts", "release", "generated", "certifications");
    mkdirSync(certificationDirectory, { recursive: true });
    const sessionPath = join(certificationDirectory, "nvda-session.txt");
    writeFileSync(sessionPath, "NVDA journey completed with no blocker\n", "utf8");
    const sessionHash = createHash("sha256").update(readFileSync(sessionPath)).digest("hex");
    const manifestHash = createHash("sha256").update(readFileSync(manifestPath)).digest("hex");
    const attestationPath = join(certificationDirectory, "manual-nvda.json");
    writeJson(attestationPath, {
      schemaVersion: 1,
      evidenceKind: "release-gate-attestation",
      gateId: "manualNvda",
      candidateCommitSha: candidateSha,
      candidateTag: null,
      packageManifestSha256: manifestHash,
      packageHashes: { "test-package": manifest.packages[0].sha256 },
      status: "Passed",
      operator: "Accessibility Tester",
      completedAt: "2026-07-14T12:00:00.000Z",
      controls: {
        criticalJourneyCompleted: { status: "Passed" },
        seriousBlockersResolved: { status: "Passed" },
      },
      evidence: [{
        path: "artifacts/release/generated/certifications/nvda-session.txt",
        sha256: sessionHash,
      }],
    });

    expect(check(cwd).gateResults.find(
      (gate: { gateId: string }) => gate.gateId === "manualNvda",
    )).toMatchObject({ configuredStatus: "Unverified", status: "Passed" });

    const omittedControlAttestation = JSON.parse(readFileSync(attestationPath, "utf8"));
    delete omittedControlAttestation.controls.seriousBlockersResolved;
    writeJson(attestationPath, omittedControlAttestation);
    expect(check(cwd).failures).toEqual(expect.arrayContaining([
      expect.stringContaining("required control seriousBlockersResolved is missing"),
    ]));

    const unverifiedControlAttestation = JSON.parse(readFileSync(attestationPath, "utf8"));
    unverifiedControlAttestation.controls.seriousBlockersResolved = { status: "Unverified" };
    writeJson(attestationPath, unverifiedControlAttestation);
    expect(check(cwd).failures).toEqual(expect.arrayContaining([
      expect.stringContaining("required control seriousBlockersResolved is Unverified"),
    ]));

    unverifiedControlAttestation.controls.seriousBlockersResolved = { status: "Passed" };
    writeJson(attestationPath, unverifiedControlAttestation);
    writeFileSync(sessionPath, "tampered after certification\n", "utf8");
    const failed = check(cwd);
    expect(failed.status).toBe("Failed");
    expect(failed.failures).toEqual(
      expect.arrayContaining([expect.stringContaining("evidence hash does not match")]),
    );
  }, RELEASE_CHECK_TIMEOUT_MS);
});
