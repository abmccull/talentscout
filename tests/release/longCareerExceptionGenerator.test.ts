import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, describe, expect, it } from "vitest";

const scriptPath = resolve(process.cwd(), "scripts", "create-long-career-timing-exception.mjs");
const tempDirectories: string[] = [];

function writeJson(path: string, value: unknown) {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function git(cwd: string, args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), "talentscout-exception-generator-"));
  tempDirectories.push(cwd);
  writeFileSync(join(cwd, ".gitignore"), "artifacts/\n", "utf8");
  writeJson(join(cwd, "package.json"), { name: "talentscout", version: "1.0.0" });
  git(cwd, ["init"]);
  git(cwd, ["config", "user.email", "release-test@example.invalid"]);
  git(cwd, ["config", "user.name", "Release Test"]);
  git(cwd, ["add", ".gitignore", "package.json"]);
  git(cwd, ["commit", "-m", "fixture"]);
  const candidateCommitSha = git(cwd, ["rev-parse", "HEAD"]);
  const candidateTreeSha = git(cwd, ["rev-parse", "HEAD^{tree}"]);

  const certificationDirectory = join(
    cwd,
    "artifacts",
    "release",
    "generated",
    "certifications",
  );
  const shardDirectory = join(certificationDirectory, "source-long-career-shards");
  mkdirSync(shardDirectory, { recursive: true });
  writeJson(join(certificationDirectory, "source-workflow-run.json"), {
    id: 30902995422,
    head_sha: candidateCommitSha,
    event: "workflow_dispatch",
    status: "completed",
    conclusion: "cancelled",
  });
  writeJson(join(certificationDirectory, "source-workflow-jobs.json"), { jobs: [] });
  for (let seedIndex = 2; seedIndex <= 20; seedIndex += 1) {
    if (seedIndex === 17) continue;
    writeJson(
      join(shardDirectory, `long-career-release-summary-seed-${seedIndex}.json`),
      { seedIndex },
    );
  }
  const failedSeedPath = join(shardDirectory, "seed-17-run-failure.json");
  writeJson(failedSeedPath, {
    schemaVersion: 2,
    evidenceKind: "long-career-worker-failure",
    candidateCommitSha,
    candidateTreeSha,
    seedIndex: 17,
    seed: "release-soak-17",
    seasonCount: 30,
    message: "timing at S30 W46; wall=44278.6ms; expected 45174.415 to be less than 45000",
  });

  const manifestPath = join(cwd, "artifacts", "release", "candidate-package-manifest.json");
  writeJson(manifestPath, {
    schemaVersion: 2,
    candidateCommitSha,
    candidateTag: "v1.0.0-rc.2",
    workflowRunId: "4242",
    packages: [{ kind: "test", path: "artifacts/release/packages/test.bin" }],
  });
  const coreEvidencePath = join(
    cwd,
    "artifacts",
    "release",
    "generated",
    "candidate-core-suites.json",
  );
  writeJson(coreEvidencePath, {
    schemaVersion: 1,
    evidenceKind: "candidate-core-suites",
    candidateCommitSha,
    workflowRunId: "4242",
    candidateBound: true,
    sourceTreeCleanAtStart: true,
    sourceAndConfigUnchangedAtCompletion: true,
    status: "Passed",
    commands: [{ command: "npm run test:unit", status: "Passed" }],
  });

  const generatedEvidence = {
    kind: "long-career-release-soak",
    path: "artifacts/release/generated/long-career-release-summary.json",
    minimumSeedCount: 20,
    minimumSeasonCount: 30,
    requireProcessIsolation: true,
    requireDeterministicReplay: true,
  };
  const releaseException = {
    kind: "long-career-timing-exception",
    path: "artifacts/release/generated/certifications/long-career-timing-exception.json",
    sourceWorkflowRunId: "30902995422",
    sourceCandidateCommitSha: candidateCommitSha,
    sourceCandidateTreeSha: candidateTreeSha,
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
  const statusPath = join(cwd, "artifacts", "release", "control-status.json");
  writeJson(statusPath, {
    gates: { longSaveGrowthAndCompaction: { generatedEvidence, releaseException } },
  });

  return {
    cwd,
    statusPath,
    manifestPath,
    coreEvidencePath,
    failedSeedPath,
    generatedEvidence,
  };
}

function generate(paths: ReturnType<typeof fixture>) {
  execFileSync(process.execPath, [scriptPath], {
    cwd: paths.cwd,
    env: {
      ...process.env,
      RELEASE_EVIDENCE_STATUS: paths.statusPath,
      RELEASE_WORKFLOW_RUN_ID: "4242",
      RELEASE_CANDIDATE_TAG: "v1.0.0-rc.2",
      RELEASE_EXCEPTION_APPROVED_BY: "release-owner",
      RELEASE_EXCEPTION_APPROVAL_REFERENCE: "decision-test-1",
      RELEASE_EXCEPTION_APPROVED_AT: "2026-08-04T16:00:00.000Z",
      RELEASE_EXCEPTION_VALIDITY_DAYS: "30",
    },
    stdio: "pipe",
  });
  return JSON.parse(readFileSync(
    join(
      paths.cwd,
      "artifacts",
      "release",
      "generated",
      "certifications",
      "long-career-timing-exception.json",
    ),
    "utf8",
  ));
}

afterAll(() => {
  for (const directory of tempDirectories) rmSync(directory, { recursive: true, force: true });
});

describe("long-career timing exception generator", () => {
  it("binds the approved decision to candidate, package, core, policy, and all raw source evidence", () => {
    const paths = fixture();
    const exception = generate(paths);

    expect(exception).toMatchObject({
      candidateTag: "v1.0.0-rc.2",
      candidateWorkflowRunId: "4242",
      sourceWorkflowRunId: "30902995422",
      status: "Accepted",
      approvedBy: "release-owner",
      metrics: {
        totalSeedCount: 20,
        successfulSeedCount: 18,
        affectedSeedCount: 2,
      },
    });
    expect(exception.evidence).toHaveLength(21);
    expect(exception.generatedPolicySha256).toBe(
      createHash("sha256").update(JSON.stringify(paths.generatedEvidence)).digest("hex"),
    );
    expect(exception.packageManifestSha256).toBe(
      createHash("sha256").update(readFileSync(paths.manifestPath)).digest("hex"),
    );
    expect(exception.candidateCoreEvidenceSha256).toBe(
      createHash("sha256").update(readFileSync(paths.coreEvidencePath)).digest("hex"),
    );
  });

  it("rejects source timing outside the approved half-percent bound", () => {
    const paths = fixture();
    const failure = JSON.parse(readFileSync(paths.failedSeedPath, "utf8"));
    failure.message = "timing at S30 W46; wall=44278.6ms; expected 45300 to be less than 45000";
    writeJson(paths.failedSeedPath, failure);

    expect(() => generate(paths)).toThrow(/exceed the approved bound/);
  });
});
