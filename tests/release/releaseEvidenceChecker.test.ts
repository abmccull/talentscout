import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
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
    workerHeapLimitBytes: number;
    workerNodeArguments: string[];
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
    "dist/\nartifacts/release/candidate-package-manifest.json\nartifacts/release/release-evidence-check.json\nartifacts/release/generated/\n",
  );
  writeJson(join(cwd, "package.json"), {
    name: "talentscout-test",
    version: "1.0.0",
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
    "RELEASE_TAG_BINDING_MODE",
    "RELEASE_WORKFLOW_RUN_ID",
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
  const memorySample = {
    season: 2,
    heapUsedBytes: 1,
    rssBytes: 1,
    externalBytes: 0,
    arrayBuffersBytes: 0,
  };
  return {
    schemaVersion: 2,
    generatedAt: "2026-07-16T00:00:00.000Z",
    profile: {
      kind: "full-canonical-weekly-career",
      seedCount: 1,
      seasonCount: 1,
      maxSerializedBytes: plan.executionIdentity.maxSerializedBytes,
      v8HeapLimitBytes: plan.executionIdentity.workerHeapLimitBytes,
      collectionByteBudgets: { players: 1024 },
    },
    runs: [{
      seed: "release-soak-01",
      reachedSeason: 2,
      canonicalTicks: 38,
      calendarWeeksSpanned: 38,
      initialBytes: 1,
      finalBytes: 1,
      peakBytes: 1,
      finalToInitialRatio: 1,
      worldHistorySeasons: 1,
      worldHistoryBytes: 1,
      largestCollections: [],
      seasonGrowth: [{
        season: 2,
        serializedBytes: 1,
        growthBytes: 0,
        compactionRemovedBytes: 0,
        compactionEvents: 0,
        collectionBytes: { players: 1 },
        collectionCompactionDeltas: { players: 0 },
      }],
      compaction: {
        events: 0,
        seasonsWithReduction: 0,
        totalRemovedBytes: 0,
        collectionDeltas: { players: 0 },
      },
      memory: {
        initial: memorySample,
        final: memorySample,
        peakRuntimeHeapUsedBytes: 1,
        peakHeapUsedBytes: 1,
        peakRssBytes: 1,
        samples: [memorySample],
      },
      weeklyLatencyMs: { p50: 1, p95: 1, max: 1, mean: 1 },
      worldHealth: [{}],
      digest: "a".repeat(64),
    }],
    checkpoint: {
      protocolVersion: 1,
      executionIdentityHash: plan.executionIdentityHash,
      candidateCommitSha: plan.executionIdentity.candidateCommitSha,
      candidateTreeSha: plan.executionIdentity.candidateTreeSha,
      seedIndex: 1,
      seed: "release-soak-01",
      seasonCount: 1,
      completedAt: "2026-07-16T00:00:00.000Z",
      elapsedMs: 1,
    },
  };
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
      executionIdentity: {
        workerHeapLimitBytes: 1536 * 1024 * 1024,
        workerNodeArguments: [
          "--max-old-space-size=1440",
          "--max-semi-space-size=32",
          "--expose-gc",
        ],
      },
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
    expect(report.candidate.currentTreeSha).toMatch(/^[a-f0-9]{40}$/);
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
    expect(report.dirtyPaths).toEqual(expect.arrayContaining(["source.txt"]));
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

  it("validates an intended version tag before the post-certification binding step", () => {
    const { cwd } = fixture();
    const manifestPath = join(cwd, "artifacts", "release", "candidate-package-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.candidateTag = "v1.0.0-rc.7";
    writeJson(manifestPath, manifest);
    const statusPath = join(cwd, "docs", "release", "release-evidence-status.json");
    const status = JSON.parse(readFileSync(statusPath, "utf8"));
    status.candidate.requireVersionTag = true;
    writeJson(statusPath, status);
    run(cwd, "git", ["add", "docs/release/release-evidence-status.json"]);
    run(cwd, "git", ["commit", "-m", "require intended release tag"]);
    const updatedSha = run(cwd, "git", ["rev-parse", "HEAD"]);
    manifest.candidateCommitSha = updatedSha;
    writeJson(manifestPath, manifest);

    const unresolved = check(cwd, { RELEASE_CANDIDATE_TAG: "v1.0.0-rc.7" });
    expect(unresolved.status).toBe("Failed");
    expect(unresolved.failures).toContain("candidate tag v1.0.0-rc.7 cannot be resolved");

    const intended = check(cwd, {
      RELEASE_CANDIDATE_TAG: "v1.0.0-rc.7",
      RELEASE_TAG_BINDING_MODE: "intended",
    });
    expect(intended.status).toBe("Passed");
    expect(intended.candidate).toMatchObject({
      tag: "v1.0.0-rc.7",
      tagBindingMode: "intended",
    });
  }, RELEASE_CHECK_TIMEOUT_MS);

  it("promotes long-save policy only for clean exact-candidate 20x30 evidence", () => {
    const { cwd, commitSha } = fixture();
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
      },
    };
    writeJson(statusPath, status);
    run(cwd, "git", ["add", "docs/release/release-evidence-status.json"]);
    run(cwd, "git", ["commit", "-m", "add long save policy"]);
    const updatedSha = run(cwd, "git", ["rev-parse", "HEAD"]);
    const updatedTreeSha = run(cwd, "git", ["rev-parse", "HEAD^{tree}"]);
    const manifestPath = join(cwd, "artifacts", "release", "candidate-package-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.candidateCommitSha = updatedSha;
    writeJson(manifestPath, manifest);
    const runs = Array.from({ length: 20 }, (_, index) => ({
      seed: `release-soak-${String(index + 1).padStart(2, "0")}`,
      reachedSeason: 31,
      canonicalTicks: 1140,
      calendarWeeksSpanned: 1140,
      digest: `digest-${index + 1}`,
    }));
    const executionIdentity = {
      protocolVersion: 1,
      candidateCommitSha: updatedSha,
      candidateTreeSha: updatedTreeSha,
      seedCount: 20,
      seasonCount: 30,
      concurrency: 3,
      maxSerializedBytes: 80 * 1024 * 1024,
      profileKind: "full-canonical-weekly-career",
      processIsolation: "one-seeded-career-per-process",
      workerNodeArguments: [
        "--max-old-space-size=1440",
        "--max-semi-space-size=32",
        "--expose-gc",
      ],
      workerHeapLimitBytes: 1536 * 1024 * 1024,
      nodeVersion: process.version,
      nodeOptions: "",
      platform: process.platform,
      architecture: process.arch,
      availableParallelism: 4,
      totalMemoryBytes: 16 * 1024 * 1024 * 1024,
      cpuModel: "release-test-cpu",
    };
    mkdirSync(join(cwd, "artifacts", "release", "generated"), { recursive: true });
    writeJson(join(cwd, "artifacts", "release", "generated", "long-career.json"), {
      schemaVersion: 3,
      evidenceKind: "long-career-release-soak",
      candidateCommitSha: updatedSha,
      candidateTreeSha: updatedTreeSha,
      candidateBound: true,
      sourceTreeClean: true,
      status: "Passed",
      checkpoint: {
        protocolVersion: 1,
        executionIdentity,
        executionIdentityHash: createHash("sha256")
          .update(JSON.stringify(executionIdentity))
          .digest("hex"),
        resumeEnabled: true,
        reusedSeedCount: 0,
        executedSeedCount: 20,
        determinismReplayExecuted: true,
      },
      profile: {
        kind: "full-canonical-weekly-career",
        skippedOrdinaryWeeks: false,
        seedCount: 20,
        seasonCount: 30,
        processIsolation: "one-seeded-career-per-process",
        v8HeapLimitBytes: 1536 * 1024 * 1024,
      },
      runs,
      persistenceReplay: { seed: runs[0].seed, digest: runs[0].digest },
    });

    const passed = check(cwd);
    expect(passed.status).toBe("Passed");
    expect(passed.gateResults.find((gate: { gateId: string }) => gate.gateId === "longSave"))
      .toMatchObject({ configuredStatus: "Unverified", status: "Passed" });

    const evidencePath = join(cwd, "artifacts", "release", "generated", "long-career.json");
    const cleanEvidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    const removeCertifiedHeapEvidence = [
      (evidence: typeof cleanEvidence) => {
        delete evidence.profile.v8HeapLimitBytes;
      },
      (evidence: typeof cleanEvidence) => {
        delete evidence.checkpoint.executionIdentity.workerHeapLimitBytes;
      },
      (evidence: typeof cleanEvidence) => {
        evidence.checkpoint.executionIdentity.workerNodeArguments = ["--expose-gc"];
      },
    ];
    for (const mutate of removeCertifiedHeapEvidence) {
      const uncapped = JSON.parse(JSON.stringify(cleanEvidence));
      mutate(uncapped);
      uncapped.checkpoint.executionIdentityHash = createHash("sha256")
        .update(JSON.stringify(uncapped.checkpoint.executionIdentity))
        .digest("hex");
      writeJson(evidencePath, uncapped);
      const rejected = check(cwd);
      expect(rejected.status).toBe("Failed");
      expect(rejected.failures).toEqual(expect.arrayContaining([
        expect.stringContaining("certified 1.5 GiB heap ceiling"),
      ]));
    }
    writeJson(evidencePath, cleanEvidence);
    const stale = JSON.parse(readFileSync(evidencePath, "utf8"));
    stale.candidateCommitSha = "a".repeat(40);
    stale.profile.seedCount = 2;
    stale.runs = stale.runs.slice(0, 2);
    writeJson(evidencePath, stale);
    const failed = check(cwd);
    expect(failed.status).toBe("Failed");
    expect(failed.failures).toEqual(expect.arrayContaining([
      expect.stringContaining("does not describe the exact candidate"),
      expect.stringContaining("requires at least 20 seeds"),
    ]));
  }, RELEASE_CHECK_TIMEOUT_MS);

  it("accepts only the exact bounded long-career timing risk decision", () => {
    const { cwd, commitSha } = fixture();
    const treeSha = run(cwd, "git", ["rev-parse", "HEAD^{tree}"]);
    const manifestPath = join(cwd, "artifacts", "release", "candidate-package-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.workflowRunId = "4242";
    writeJson(manifestPath, manifest);

    const certificationDirectory = join(cwd, "artifacts", "release", "generated", "certifications");
    mkdirSync(certificationDirectory, { recursive: true });
    const coreEvidencePath = join(cwd, "artifacts", "release", "generated", "candidate-core-suites.json");
    writeJson(coreEvidencePath, {
      schemaVersion: 1,
      evidenceKind: "candidate-core-suites",
      candidateCommitSha: commitSha,
      workflowRunId: "4242",
      candidateBound: true,
      sourceTreeCleanAtStart: true,
      sourceAndConfigUnchangedAtCompletion: true,
      status: "Passed",
      commands: [{ command: "npm run test:unit", status: "Passed" }],
    });
    const sourceRunPath = join(certificationDirectory, "source-workflow-run.json");
    writeJson(sourceRunPath, {
      id: 30902995422,
      head_sha: commitSha,
      event: "workflow_dispatch",
      status: "completed",
      conclusion: "cancelled",
    });
    const successfulSeedIndices = Array.from({ length: 19 }, (_, index) => index + 2)
      .filter((seedIndex) => seedIndex !== 17);
    const sourceJobsPath = join(certificationDirectory, "source-workflow-jobs.json");
    writeJson(sourceJobsPath, {
      jobs: [
        ...["Release quality gate", "Build Windows", "Build macOS", "Build Linux"]
          .map((name) => ({ name, conclusion: "success" })),
        ...Array.from({ length: 20 }, (_, index) => index + 1).map((seedIndex) => ({
          name: `Exact candidate seed ${seedIndex} x 30 seasons`,
          conclusion: seedIndex === 1 ? "cancelled" : seedIndex === 17 ? "failure" : "success",
        })),
      ],
    });
    const sourceShardDirectory = join(certificationDirectory, "source-long-career-shards");
    mkdirSync(sourceShardDirectory, { recursive: true });
    const sourceShardPaths = successfulSeedIndices.map((seedIndex) => {
      const executionIdentity = {
        protocolVersion: 1,
        candidateCommitSha: commitSha,
        candidateTreeSha: treeSha,
        seedCount: 1,
        seedStart: seedIndex,
        seasonCount: 30,
        profileKind: "full-canonical-weekly-career",
        processIsolation: "one-seeded-career-per-process",
        workerNodeArguments: [
          "--max-old-space-size=1440",
          "--max-semi-space-size=32",
          "--expose-gc",
        ],
        workerHeapLimitBytes: 1610612736,
      };
      const shardPath = join(
        sourceShardDirectory,
        `long-career-release-summary-seed-${seedIndex}.json`,
      );
      writeJson(shardPath, {
        schemaVersion: 3,
        evidenceKind: "long-career-release-soak",
        candidateCommitSha: commitSha,
        candidateTreeSha: treeSha,
        candidateBound: true,
        sourceTreeClean: true,
        status: "Passed",
        checkpoint: {
          protocolVersion: 1,
          executionIdentity,
          executionIdentityHash: createHash("sha256")
            .update(JSON.stringify(executionIdentity))
            .digest("hex"),
          reusedSeedCount: 0,
          executedSeedCount: 1,
          determinismReplayExecuted: false,
        },
        profile: {
          kind: "full-canonical-weekly-career",
          skippedOrdinaryWeeks: false,
          seedCount: 1,
          seasonCount: 30,
          processIsolation: "one-seeded-career-per-process",
          v8HeapLimitBytes: 1610612736,
        },
        runs: [{
          seed: `release-soak-${String(seedIndex).padStart(2, "0")}`,
          reachedSeason: 31,
          canonicalTicks: 900,
          calendarWeeksSpanned: 900,
          digest: "a".repeat(64),
        }],
      });
      return shardPath;
    });
    const failedSeedPath = join(sourceShardDirectory, "seed-17-run-failure.json");
    writeJson(failedSeedPath, {
      schemaVersion: 2,
      evidenceKind: "long-career-worker-failure",
      candidateCommitSha: commitSha,
      candidateTreeSha: treeSha,
      seedIndex: 17,
      seed: "release-soak-17",
      seasonCount: 30,
      message:
        "batch CPU latency at S30 W46; wall=44278.6ms; expected 45174.415 to be less than 45000",
    });

    const generatedEvidence = {
      kind: "long-career-release-soak",
      path: "artifacts/release/generated/missing-long-career.json",
      minimumSeedCount: 20,
      minimumSeasonCount: 30,
      requireProcessIsolation: true,
      requireDeterministicReplay: true,
    };
    const releaseException = {
      kind: "long-career-timing-exception",
      path: "artifacts/release/generated/certifications/long-career-timing-exception.json",
      sourceWorkflowRunId: "30902995422",
      sourceCandidateCommitSha: commitSha,
      sourceCandidateTreeSha: treeSha,
      candidateCoreEvidencePath: "artifacts/release/generated/candidate-core-suites.json",
      maximumValidityDays: 30,
      allowedReasonCodes: ["release-owner-accepted-bounded-hosted-runner-variance"],
      requiredSeedCount: 20,
      minimumSuccessfulSeedCount: 18,
      maximumAffectedSeedCount: 2,
      maximumCpuOverrunRatio: 0.005,
      minimumReachedSeason: 30,
      sourceEvidence: {
        workflowRunPath: "artifacts/release/generated/certifications/source-workflow-run.json",
        workflowJobsPath: "artifacts/release/generated/certifications/source-workflow-jobs.json",
        successfulShardDirectory:
          "artifacts/release/generated/certifications/source-long-career-shards",
        failedSeedPath:
          "artifacts/release/generated/certifications/source-long-career-shards/seed-17-run-failure.json",
      },
      expectedAffectedSeeds: [
        {
          seedIndex: 1,
          classification: "operator-cancelled-after-risk-acceptance",
          status: "Cancelled",
        },
        {
          seedIndex: 17,
          classification: "hosted-runner-cpu-timing-variance",
          status: "Failed",
        },
      ],
      requiredControls: [
        "qualityAndPlatformBuildsPassed",
        "noCorrectnessCrashMemoryOrSaveFailure",
        "timingVarianceBelowHalfPercent",
        "wallGuardRemainedWithinLimit",
        "candidateAndSourceRunMatch",
        "ownerDirectedCancellationRecorded",
        "rollbackAndMonitoringPlanPresent",
      ],
    };
    const controlDirectory = mkdtempSync(join(tmpdir(), "talentscout-release-control-"));
    tempDirs.push(controlDirectory);
    const controlStatusPath = join(controlDirectory, "release-evidence-status.json");
    const controlStatus = {
      schemaVersion: 2,
      candidate: {
        tag: null,
        requireVersionTag: false,
        packageManifest: "artifacts/release/candidate-package-manifest.json",
        requiredPackageKinds: ["test-package"],
      },
      gates: {
        automated: { status: "Passed", evidence: ["evidence.txt"] },
        longSaveGrowthAndCompaction: {
          status: "Unverified",
          evidence: [],
          generatedEvidence,
          releaseException,
        },
      },
    };
    writeJson(controlStatusPath, controlStatus);

    const now = Date.now();
    const exceptionPath = join(certificationDirectory, "long-career-timing-exception.json");
    const validException = {
      schemaVersion: 1,
      evidenceKind: "release-gate-exception",
      exceptionKind: "long-career-timing-exception",
      gateId: "longSaveGrowthAndCompaction",
      candidateCommitSha: commitSha,
      candidateTreeSha: treeSha,
      candidateTag: null,
      candidateWorkflowRunId: "4242",
      sourceWorkflowRunId: "30902995422",
      packageManifestSha256: createHash("sha256").update(readFileSync(manifestPath)).digest("hex"),
      candidateCoreEvidenceSha256: createHash("sha256")
        .update(readFileSync(coreEvidencePath))
        .digest("hex"),
      generatedPolicySha256: createHash("sha256")
        .update(JSON.stringify(generatedEvidence))
        .digest("hex"),
      status: "Accepted",
      approvedBy: "Release Owner",
      approvalReference: "decision-2026-08-04",
      approvedAt: new Date(now - 60_000).toISOString(),
      expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
      reasonCode: "release-owner-accepted-bounded-hosted-runner-variance",
      metrics: {
        totalSeedCount: 20,
        successfulSeedCount: 18,
        affectedSeedCount: 2,
        maximumCpuOverrunRatio: (45174.415 - 45000) / 45000,
      },
      affectedSeeds: [
        {
          seedIndex: 1,
          seed: "release-soak-01",
          classification: "operator-cancelled-after-risk-acceptance",
          status: "Cancelled",
        },
        {
          seedIndex: 17,
          seed: "release-soak-17",
          classification: "hosted-runner-cpu-timing-variance",
          status: "Failed",
          reachedSeason: 30,
          reachedWeek: 46,
          cpuElapsedMs: 45174.415,
          cpuLimitMs: 45000,
          wallElapsedMs: 44278.6,
          wallLimitMs: 60000,
        },
      ],
      controls: Object.fromEntries(
        releaseException.requiredControls.map((controlId) => [controlId, { status: "Passed" }]),
      ),
      evidence: [sourceRunPath, sourceJobsPath, ...sourceShardPaths, failedSeedPath].map((path) => ({
        path: path.slice(cwd.length + 1).replaceAll("\\", "/"),
        sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
      })),
    };
    writeJson(exceptionPath, validException);

    const overrides = {
      RELEASE_EVIDENCE_STATUS: controlStatusPath,
      RELEASE_WORKFLOW_RUN_ID: "4242",
    };
    const accepted = check(cwd, overrides);
    expect(accepted.status).toBe("PassedWithAcceptedRisk");
    expect(accepted.acceptedRisks).toEqual([expect.objectContaining({
      gateId: "longSaveGrowthAndCompaction",
      kind: "long-career-timing-exception",
    })]);
    expect(accepted.gateResults.find(
      (gate: { gateId: string }) => gate.gateId === "longSaveGrowthAndCompaction",
    )).toMatchObject({
      configuredStatus: "Unverified",
      status: "Passed",
      resolution: "AcceptedRisk",
      exceptionApplied: true,
    });

    const wrongRun = structuredClone(validException);
    wrongRun.sourceWorkflowRunId = "30902995423";
    writeJson(exceptionPath, wrongRun);
    expect(check(cwd, overrides).failures).toEqual(expect.arrayContaining([
      expect.stringContaining("not bound to the approved source workflow run"),
    ]));

    const excessiveVariance = structuredClone(validException);
    excessiveVariance.affectedSeeds[1].cpuElapsedMs = 45300;
    excessiveVariance.metrics.maximumCpuOverrunRatio = (45300 - 45000) / 45000;
    writeJson(exceptionPath, excessiveVariance);
    expect(check(cwd, overrides).failures).toEqual(expect.arrayContaining([
      expect.stringContaining("exceeds the approved bounded variance"),
    ]));

    const missingControl = structuredClone(validException);
    delete missingControl.controls.rollbackAndMonitoringPlanPresent;
    writeJson(exceptionPath, missingControl);
    expect(check(cwd, overrides).failures).toEqual(expect.arrayContaining([
      expect.stringContaining("rollbackAndMonitoringPlanPresent did not pass"),
    ]));

    const missingFailureEvidence = structuredClone(validException);
    missingFailureEvidence.evidence = missingFailureEvidence.evidence.filter(
      (entry) => !entry.path.endsWith("seed-17-run-failure.json"),
    );
    writeJson(exceptionPath, missingFailureEvidence);
    expect(check(cwd, overrides).failures).toEqual(expect.arrayContaining([
      expect.stringContaining("source seed 17 failure evidence is not hash-bound"),
    ]));

    const tamperedFailure = JSON.parse(readFileSync(failedSeedPath, "utf8"));
    tamperedFailure.message =
      "batch CPU latency at S30 W46; wall=44278.6ms; expected 44000 to be less than 45000";
    writeJson(failedSeedPath, tamperedFailure);
    const tamperedFailureException = structuredClone(validException);
    const failureEntry = tamperedFailureException.evidence.find(
      (entry) => entry.path.endsWith("seed-17-run-failure.json"),
    );
    expect(failureEntry).toBeDefined();
    failureEntry!.sha256 = createHash("sha256").update(readFileSync(failedSeedPath)).digest("hex");
    writeJson(exceptionPath, tamperedFailureException);
    expect(check(cwd, overrides).failures).toEqual(expect.arrayContaining([
      expect.stringContaining("does not match the accepted timing variance"),
    ]));
    tamperedFailure.message =
      "batch CPU latency at S30 W46; wall=44278.6ms; expected 45174.415 to be less than 45000";
    writeJson(failedSeedPath, tamperedFailure);

    const invalidCoreEvidence = JSON.parse(readFileSync(coreEvidencePath, "utf8"));
    invalidCoreEvidence.sourceTreeCleanAtStart = false;
    writeJson(coreEvidencePath, invalidCoreEvidence);
    const invalidCoreException = structuredClone(validException);
    invalidCoreException.candidateCoreEvidenceSha256 = createHash("sha256")
      .update(readFileSync(coreEvidencePath))
      .digest("hex");
    writeJson(exceptionPath, invalidCoreException);
    expect(check(cwd, overrides).failures).toEqual(expect.arrayContaining([
      expect.stringContaining("invalid or non-passing candidate core evidence"),
    ]));
    invalidCoreEvidence.sourceTreeCleanAtStart = true;
    writeJson(coreEvidencePath, invalidCoreEvidence);

    const weakPolicyStatus = structuredClone(controlStatus);
    weakPolicyStatus.gates.longSaveGrowthAndCompaction.generatedEvidence.minimumSeedCount = 1;
    weakPolicyStatus.gates.longSaveGrowthAndCompaction.generatedEvidence.minimumSeasonCount = 1;
    weakPolicyStatus.gates.longSaveGrowthAndCompaction.generatedEvidence.requireProcessIsolation = false;
    weakPolicyStatus.gates.longSaveGrowthAndCompaction.generatedEvidence.requireDeterministicReplay = false;
    writeJson(controlStatusPath, weakPolicyStatus);
    const weakPolicyException = structuredClone(validException);
    weakPolicyException.generatedPolicySha256 = createHash("sha256")
      .update(JSON.stringify(weakPolicyStatus.gates.longSaveGrowthAndCompaction.generatedEvidence))
      .digest("hex");
    writeJson(exceptionPath, weakPolicyException);
    expect(check(cwd, overrides).failures).toEqual(expect.arrayContaining([
      expect.stringContaining("requires the canonical 20-seed, 30-season"),
    ]));

    writeJson(exceptionPath, validException);
    writeJson(controlStatusPath, controlStatus);
    const wrongGateStatus: { gates: Record<string, unknown> } = structuredClone(controlStatus);
    wrongGateStatus.gates.manualNvda = {
      ...(wrongGateStatus.gates.longSaveGrowthAndCompaction as object),
      generatedEvidence: {
        kind: "release-gate-attestation",
        path: "artifacts/release/generated/certifications/missing-nvda.json",
      },
    };
    delete wrongGateStatus.gates.longSaveGrowthAndCompaction;
    writeJson(controlStatusPath, wrongGateStatus);
    expect(check(cwd, overrides).failures).toEqual(expect.arrayContaining([
      expect.stringContaining("release exceptions are supported only for the long-career timing gate"),
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
        replayabilityArtifact:
          "artifacts/release/generated/replayability-release-summary.json",
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
    const replayabilityPath = join(
      cwd,
      "artifacts",
      "release",
      "generated",
      "replayability-release-summary.json",
    );
    const cleanReplayability = {
      passed: true,
      humanFacingProxies: {
        authority: {
          sourceHeadSha: candidateSha,
          sourceTreeClean: true,
          sourceDirtyEntryCount: 0,
          gitInspectionSucceeded: true,
          evidenceClass: "clean_commit_bound",
          releaseCertificationEligible: true,
        },
      },
    };
    writeJson(replayabilityPath, cleanReplayability);
    expect(check(cwd).gateResults.find(
      (gate: { gateId: string }) => gate.gateId === "automated",
    )).toMatchObject({ configuredStatus: "Unverified", status: "Passed" });

    writeJson(replayabilityPath, {
      ...cleanReplayability,
      humanFacingProxies: {
        authority: {
          ...cleanReplayability.humanFacingProxies.authority,
          sourceTreeClean: false,
          sourceDirtyEntryCount: 2,
          evidenceClass: "diagnostic_dirty_worktree",
          releaseCertificationEligible: false,
        },
      },
    });
    expect(check(cwd).failures).toEqual(expect.arrayContaining([
      expect.stringContaining("replayability artifact is diagnostic-only"),
    ]));
    writeJson(replayabilityPath, cleanReplayability);

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
    status.candidate.requiredPackageKinds = ["windows-installer"];
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
      },
    };
    writeJson(statusPath, status);
    run(cwd, "git", ["add", "docs/release/release-evidence-status.json"]);
    run(cwd, "git", ["commit", "-m", "add Windows runtime policy"]);
    const candidateSha = run(cwd, "git", ["rev-parse", "HEAD"]);
    const packageBytes = Buffer.from("signed package bytes");
    writeFileSync(join(cwd, "dist", "package.exe"), packageBytes);
    const packageHash = createHash("sha256").update(packageBytes).digest("hex");
    writeJson(join(cwd, "artifacts", "release", "candidate-package-manifest.json"), {
      schemaVersion: 2,
      generatedAt: "2026-07-13T00:00:00.000Z",
      candidateCommitSha: candidateSha,
      candidateTag: null,
      product: "talentscout-test",
      productVersion: "1.0.0",
      workflowRunId: null,
      packages: [{
        kind: "windows-installer",
        path: "dist/package.exe",
        bytes: packageBytes.length,
        sha256: packageHash,
      }],
    });
    mkdirSync(join(cwd, "artifacts", "release", "generated", "certifications"), {
      recursive: true,
    });
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
      sourceTreeClean: true,
      candidateBound: true,
      candidateManifestBinding: { passed: true, candidateCommitSha: candidateSha },
      authenticode: { Status: "Valid" },
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
        interruptedWriteAtConfirmedTransactionBoundary: { status: "Passed" },
        optionalDiagnostic: { status: "Unverified" },
      },
    });

    expect(check(cwd).gateResults.find(
      (gate: { gateId: string }) => gate.gateId === "packagedWindows",
    )).toMatchObject({ configuredStatus: "Unverified", status: "Passed" });

    const omittedControlEvidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    delete omittedControlEvidence.controls.interruptedWriteAtConfirmedTransactionBoundary;
    writeJson(evidencePath, omittedControlEvidence);
    expect(check(cwd).failures).toEqual(expect.arrayContaining([
      expect.stringContaining(
        "required control interruptedWriteAtConfirmedTransactionBoundary is missing",
      ),
    ]));

    const unverifiedControlEvidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    unverifiedControlEvidence.controls.interruptedWriteAtConfirmedTransactionBoundary = {
      status: "Unverified",
    };
    writeJson(evidencePath, unverifiedControlEvidence);
    expect(check(cwd).failures).toEqual(expect.arrayContaining([
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
    expect(check(cwd).failures).toEqual(expect.arrayContaining([
      expect.stringContaining("contradicts its passing exact installed-package journey"),
    ]));

    const failedEvidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    failedEvidence.limitations = [];
    failedEvidence.exactCandidateInstallJourney.status = "Unverified";
    failedEvidence.controls.offlineSaveQuitReopenContinue = { status: "Failed" };
    writeJson(evidencePath, failedEvidence);
    const failed = check(cwd);
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
