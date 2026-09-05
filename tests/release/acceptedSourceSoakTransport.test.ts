import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stageAcceptedSourceSoak, selectSourceSoakArtifacts, verifyAcceptedSourceSoak } from "../../scripts/stage-accepted-source-soak.mjs";
import { installReleaseCertification } from "../../scripts/install-release-certification.mjs";

const roots: string[] = [];
const script = (name: string) => join(process.cwd(), "scripts", name);
const generated = "artifacts/release/generated";
const cert = `${generated}/certifications`;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function write(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2));
}
function read(path: string) { return JSON.parse(readFileSync(path, "utf8")); }
function run(cwd: string, command: string, args: string[], extra: Record<string, string> = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(GITHUB_|RELEASE_|SOAK_)/.test(key)) delete env[key];
  }
  const result = spawnSync(command, args, { cwd, env: { ...env, ...extra }, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function fixture() {
  const workspaceRoot = mkdtempSync(join(tmpdir(), "talentscout-source-transport-"));
  roots.push(workspaceRoot);
  const candidateRoot = join(workspaceRoot, "candidate");
  const root = join(workspaceRoot, "bundle");
  const downloadRoot = join(workspaceRoot, "downloads");
  mkdirSync(candidateRoot);
  writeFileSync(join(candidateRoot, ".gitignore"), "artifacts/\ndist/\n");
  write(join(candidateRoot, "package.json"), { name: "transport-fixture", version: "1.0.0" });
  write(join(candidateRoot, "docs/release/release-evidence-status.json"), {
    schemaVersion: 2,
    candidate: { tag: null, requireVersionTag: false, packageManifest: "artifacts/release/candidate-package-manifest.json", requiredPackageKinds: ["test-package"] },
    gates: { longSave: { status: "Unverified", evidence: [], generatedEvidence: {
      kind: "long-career-release-soak", path: `${generated}/long-career-release-summary.json`,
      minimumSeedCount: 20, minimumSeasonCount: 30, requireProcessIsolation: true,
      requireDeterministicReplay: true, requireAcceptedSourceTransport: true,
    } } },
  });
  run(candidateRoot, "git", ["init"]);
  run(candidateRoot, "git", ["config", "user.email", "release-test@example.test"]);
  run(candidateRoot, "git", ["config", "user.name", "Release Test"]);
  run(candidateRoot, "git", ["add", "."]);
  run(candidateRoot, "git", ["commit", "-m", "immutable source fixture"]);
  const candidateCommitSha = run(candidateRoot, "git", ["rev-parse", "HEAD"]);
  const candidateTreeSha = run(candidateRoot, "git", ["rev-parse", "HEAD^{tree}"]);
  const controlWorkflowSha = "c".repeat(40);
  const acceptedSourceRunId = "41234567890";
  const metadata = { schemaVersion: 1, candidateCommitSha, candidateTreeSha, controlWorkflowSha, acceptedSourceRunId };
  write(join(root, generated, "accepted-candidate.json"), metadata);
  write(join(root, cert, "source-workflow-run.json"), {
    id: Number(acceptedSourceRunId), head_sha: candidateCommitSha, path: ".github/workflows/build.yml", status: "completed", conclusion: "success",
  });
  const jobs = ["Aggregate exact candidate 20x30 soak", ...Array.from({ length: 20 }, (_, i) => `Exact candidate seed ${i + 1} x 30 seasons`)]
    .map((name) => ({ name, run_id: Number(acceptedSourceRunId), head_sha: candidateCommitSha, status: "completed", conclusion: "success" }));
  write(join(root, cert, "source-workflow-jobs.json"), { jobs });
  const names = ["release-soak-evidence", ...Array.from({ length: 20 }, (_, i) => `release-soak-shard-${i + 1}`)];
  const listing = { artifacts: names.map((name, i) => ({ id: i + 1, name, expired: false,
    workflow_run: { id: Number(acceptedSourceRunId), head_sha: candidateCommitSha } })) };
  write(join(root, cert, "source-workflow-artifacts.json"), listing);
  for (let index = 1; index <= 20; index++) {
    const seed = `release-soak-${String(index).padStart(2, "0")}`;
    const executionIdentity = { protocolVersion: 1, candidateCommitSha, candidateTreeSha,
      seedStart: index, seedCount: 1, seasonCount: 30, concurrency: 1,
      maxSerializedBytes: 80 * 1024 * 1024, profileKind: "full-canonical-weekly-career",
      processIsolation: "one-seeded-career-per-process", workerHeapLimitBytes: 1536 * 1024 * 1024,
      workerNodeArguments: ["--max-old-space-size=1440", "--max-semi-space-size=32", "--expose-gc"] };
    const sample = { seed, reachedSeason: 31, canonicalTicks: 1140, calendarWeeksSpanned: 1140,
      digest: hash(seed), peakBytes: 1000, finalToInitialRatio: 2,
      memory: { peakRuntimeHeapUsedBytes: 2000, peakHeapUsedBytes: 1000, peakRssBytes: 3000 },
      seasonGrowth: [{ growthBytes: 10 }], compaction: { totalRemovedBytes: 20, collectionDeltas: { players: 20 } },
      weeklyLatencyMs: { p50: 1, p95: 2, max: 3 } };
    const document = { schemaVersion: 3, evidenceKind: "long-career-release-soak", status: "Passed",
      candidateCommitSha, candidateTreeSha, candidateBound: true, sourceTreeClean: true,
      checkpoint: { protocolVersion: 1, executionIdentity, executionIdentityHash: hash(JSON.stringify(executionIdentity)),
        resumeEnabled: false, reusedSeedCount: 0, executedSeedCount: 1, determinismReplayExecuted: index === 1 },
      profile: { seedCount: 1, seasonCount: 30, concurrency: 1, kind: "full-canonical-weekly-career",
        skippedOrdinaryWeeks: false, processIsolation: "one-seeded-career-per-process", v8HeapLimitBytes: 1536 * 1024 * 1024,
        maxSerializedBytes: 80 * 1024 * 1024, collectionByteBudgets: { players: 32 * 1024 * 1024 } },
      runs: [sample], persistenceReplay: index === 1 ? { seed, digest: sample.digest } : null };
    const name = `long-career-release-summary-seed-${index}.json`;
    write(join(downloadRoot, `release-soak-shard-${index}`, name), document);
    write(join(workspaceRoot, "source-shards", name), document);
  }
  run(candidateRoot, process.execPath, [script("aggregate-release-soak-shards.mjs")], {
    SOAK_SHARD_DIRECTORY: join(workspaceRoot, "source-shards"),
    SOAK_OUTPUT: join(downloadRoot, "release-soak-evidence", "long-career-release-summary.json"), SOAK_SEEDS: "20", SOAK_SEASONS: "30",
  });
  mkdirSync(join(candidateRoot, "dist"));
  writeFileSync(join(candidateRoot, "dist/package.bin"), "package");
  write(join(candidateRoot, "artifacts/release/candidate-package-manifest.json"), {
    schemaVersion: 2, candidateCommitSha, candidateTag: null, product: "transport-fixture", productVersion: "1.0.0",
    packages: [{ kind: "test-package", path: "dist/package.bin", bytes: 7, sha256: hash("package") }],
  });
  return { workspaceRoot, candidateRoot, root, downloadRoot, metadata, listing };
}

afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

describe("accepted source soak transport", () => {
  it("round trips the ordinary 20x30 source bundle through certification install and strict checking", async () => {
    const setup = fixture();
    await stageAcceptedSourceSoak(setup);
    cpSync(setup.root, setup.candidateRoot, { recursive: true });
    write(join(setup.workspaceRoot, "independent/human-session.json"), { fixture: true });
    await installReleaseCertification({ workspaceRoot: setup.workspaceRoot, sourceDirectory: "independent", destinationDirectory: `candidate/${cert}` });
    await verifyAcceptedSourceSoak({ root: setup.candidateRoot, candidateRoot: setup.candidateRoot, controlWorkflowSha: setup.metadata.controlWorkflowSha });
    run(setup.candidateRoot, process.execPath, [script("check-release-evidence.mjs")]);
    const report = read(join(setup.candidateRoot, "artifacts/release/release-evidence-check.json"));
    expect(report.status).toBe("Passed");
    expect(report.acceptedRisks).toEqual([]);
    expect(report.gateResults[0].generatedEvidence.status).toBe("Passed");
    // Tampering after installation must also fail the actual strict checker.
    const aggregatePath = join(setup.candidateRoot, generated, "long-career-release-summary.json");
    const aggregate = read(aggregatePath);
    aggregate.aggregate.totalCanonicalTicks++;
    write(aggregatePath, aggregate);
    expect(() => run(setup.candidateRoot, process.execPath, [script("check-release-evidence.mjs")])).toThrow("hash/length mismatch");
  }, 30_000);

  it("rejects missing, duplicate, expired, and wrong-run source artifacts before staging", async () => {
    const setup = fixture();
    const mutations = [
      (value: typeof setup.listing) => { value.artifacts.shift(); },
      (value: typeof setup.listing) => { value.artifacts.push(value.artifacts[1]); },
      (value: typeof setup.listing) => { value.artifacts[0].expired = true; },
      (value: typeof setup.listing) => { value.artifacts[0].workflow_run.id++; },
      (value: typeof setup.listing) => { value.artifacts[0].workflow_run.head_sha = "a".repeat(40); },
    ];
    for (const mutate of mutations) {
      const value = structuredClone(setup.listing);
      mutate(value);
      await expect(selectSourceSoakArtifacts(setup.root, value)).rejects.toThrow();
    }
  }, 30_000);

  it("rejects an aggregate inconsistent with its raw shards and preserves the original bytes", async () => {
    const setup = fixture();
    const path = join(setup.downloadRoot, "release-soak-evidence/long-career-release-summary.json");
    const aggregate = read(path);
    aggregate.runs[4].digest = hash("altered");
    write(path, aggregate);
    await expect(stageAcceptedSourceSoak(setup)).rejects.toThrow("does not match its raw shard reduction");
    expect(read(path).runs[4].digest).toBe(hash("altered"));
  }, 30_000);

  it("rejects post-bundle missing aggregate, extra shards, wrong run and changed control identity", async () => {
    const setup = fixture();
    await stageAcceptedSourceSoak(setup);
    const verify = () => verifyAcceptedSourceSoak({ ...setup, controlWorkflowSha: setup.metadata.controlWorkflowSha });
    await expect(verifyAcceptedSourceSoak({ ...setup, controlWorkflowSha: "d".repeat(40) })).rejects.toThrow("control workflow SHA");
    const path = join(setup.root, generated, "long-career-release-summary.json");
    const bytes = readFileSync(path);
    rmSync(path);
    await expect(verify()).rejects.toThrow();
    writeFileSync(path, bytes);
    const duplicate = join(setup.root, cert, "source-long-career-shards/duplicate.json");
    cpSync(join(setup.root, cert, "source-long-career-shards/long-career-release-summary-seed-1.json"), duplicate);
    await expect(verify()).rejects.toThrow("inventory does not match");
    rmSync(duplicate);
    const runPath = join(setup.root, cert, "source-workflow-run.json");
    const wrongRun = read(runPath);
    wrongRun.id++;
    write(runPath, wrongRun);
    await expect(verify()).rejects.toThrow("Wrong source workflow run");
  }, 30_000);

  it("cannot replace trusted transport records through independent certifications", async () => {
    const setup = fixture();
    for (const name of ["source-soak-transport.json", "source-workflow-artifacts.json"]) {
      write(join(setup.workspaceRoot, "independent", name), { forged: true });
      await expect(installReleaseCertification({ workspaceRoot: setup.workspaceRoot, sourceDirectory: "independent", destinationDirectory: `candidate/${cert}` })).rejects.toThrow("may not replace trusted workflow evidence");
      rmSync(join(setup.workspaceRoot, "independent", name));
    }
  }, 30_000);

  it("keeps failed-run transport restricted to the original July SHA and run pair", async () => {
    const setup = fixture();
    const metadata = { ...setup.metadata, candidateCommitSha: "6fa7297c13ad6058a2e1c157fb9541677d0195c4", acceptedSourceRunId: "30902995422" };
    write(join(setup.root, generated, "accepted-candidate.json"), metadata);
    const sourceRun = { id: Number(metadata.acceptedSourceRunId), head_sha: metadata.candidateCommitSha,
      path: ".github/workflows/build.yml", status: "completed", conclusion: "failure" };
    write(join(setup.root, cert, "source-workflow-run.json"), sourceRun);
    const listing = { artifacts: [{ id: 1, name: "release-soak-shard-17", expired: false,
      workflow_run: { id: sourceRun.id, head_sha: sourceRun.head_sha } }] };
    expect(await selectSourceSoakArtifacts(setup.root, listing)).toHaveLength(1);
    metadata.acceptedSourceRunId = "30902995423";
    sourceRun.id++;
    listing.artifacts[0].workflow_run.id++;
    write(join(setup.root, generated, "accepted-candidate.json"), metadata);
    write(join(setup.root, cert, "source-workflow-run.json"), sourceRun);
    await expect(selectSourceSoakArtifacts(setup.root, listing)).rejects.toThrow("Source workflow did not pass");
  }, 30_000);
});
