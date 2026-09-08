import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFile, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const generated = "artifacts/release/generated";
const certifications = `${generated}/certifications`;
const aggregateName = "long-career-release-summary.json";
const receiptName = "source-soak-transport.json";
const historicalSha = "6fa7297c13ad6058a2e1c157fb9541677d0195c4";
const historicalRun = "30902995422";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const required = (condition, message) => { if (!condition) throw new Error(message); };

function historical(metadata) {
  return metadata.candidateCommitSha === historicalSha
    && String(metadata.acceptedSourceRunId) === historicalRun;
}

async function readSource(root) {
  const metadata = await json(resolve(root, generated, "accepted-candidate.json"));
  const run = await json(resolve(root, certifications, "source-workflow-run.json"));
  required(metadata.schemaVersion === 1, "Invalid accepted candidate metadata");
  for (const key of ["candidateCommitSha", "candidateTreeSha", "controlWorkflowSha"]) {
    required(/^[a-f0-9]{40}$/.test(metadata[key] ?? ""), `Invalid ${key}`);
  }
  required(/^\d+$/.test(String(metadata.acceptedSourceRunId)), "Invalid accepted source run ID");
  required(String(run.id) === String(metadata.acceptedSourceRunId), "Wrong source workflow run");
  required(run.head_sha === metadata.candidateCommitSha, "Wrong source candidate SHA");
  required(run.path === ".github/workflows/build.yml", "Source evidence must come from build.yml");
  required(run.status === "completed", "Source workflow has not completed");
  // This preserves transport only. The strict checker still requires the exact
  // existing signed exception and all of its independent evidence.
  required(run.conclusion === "success" || historical(metadata), "Source workflow did not pass");
  if (!historical(metadata)) {
    const jobs = (await json(resolve(root, certifications, "source-workflow-jobs.json"))).jobs;
    required(Array.isArray(jobs), "Source workflow jobs are missing");
    const expectedNames = ["Aggregate exact candidate 20x30 soak",
      ...Array.from({ length: 20 }, (_, i) => `Exact candidate seed ${i + 1} x 30 seasons`)];
    for (const name of expectedNames) {
      const matches = jobs.filter((job) => job.name === name);
      required(matches.length === 1 && matches[0].status === "completed" && matches[0].conclusion === "success"
        && String(matches[0].run_id) === String(metadata.acceptedSourceRunId)
        && matches[0].head_sha === metadata.candidateCommitSha,
      `Source job is missing, duplicated, failed, or mismatched: ${name}`);
    }
  }
  return metadata;
}

export async function selectSourceSoakArtifacts(root, artifactListing) {
  const metadata = await readSource(root);
  const pages = Array.isArray(artifactListing) ? artifactListing : [artifactListing];
  const artifacts = pages.flatMap((page) => page.artifacts ?? []).filter((artifact) =>
    artifact.name === "release-soak-evidence" || /^release-soak-shard-\d+$/.test(artifact.name ?? ""));
  const names = new Set();
  const ids = new Set();
  for (const artifact of artifacts) {
    required(Number.isSafeInteger(artifact.id) && artifact.id > 0, "Invalid source artifact ID");
    required(!ids.has(artifact.id) && !names.has(artifact.name), "Duplicate source soak artifact");
    required(artifact.expired === false, `Expired source artifact: ${artifact.name}`);
    required(String(artifact.workflow_run?.id) === String(metadata.acceptedSourceRunId)
      && artifact.workflow_run?.head_sha === metadata.candidateCommitSha,
    `Source artifact is bound to another run/candidate: ${artifact.name}`);
    ids.add(artifact.id);
    names.add(artifact.name);
  }
  if (!historical(metadata)) {
    const expected = ["release-soak-evidence", ...Array.from({ length: 20 }, (_, i) => `release-soak-shard-${i + 1}`)];
    required(artifacts.length === expected.length && expected.every((name) => names.has(name)),
      "Ordinary source acceptance requires the aggregate and all 20 unique shard artifacts");
  } else {
    required(artifacts.some((artifact) => /^release-soak-shard-/.test(artifact.name)),
      "Historical source shard evidence is missing");
  }
  return artifacts.sort((a, b) => a.name.localeCompare(b.name));
}

async function filesBelow(root, prefix = "") {
  const files = [];
  for (const entry of await readdir(resolve(root, prefix))) {
    const path = prefix ? `${prefix}/${entry}` : entry;
    const stats = await lstat(resolve(root, path));
    required(!stats.isSymbolicLink(), `Source evidence contains a symbolic link: ${path}`);
    if (stats.isDirectory()) files.push(...await filesBelow(root, path));
    else {
      required(stats.isFile() && path.endsWith(".json"), `Unexpected source evidence file: ${path}`);
      files.push(path);
    }
  }
  return files.sort();
}

async function compareAggregate(root, candidateRoot) {
  const metadata = await readSource(root);
  const source = await json(resolve(root, generated, aggregateName));
  const checkpoint = source.checkpoint;
  required(checkpoint?.executionIdentityHash === digest(JSON.stringify(checkpoint?.executionIdentity)),
    "Source aggregate execution identity hash does not match");
  const calculatedPath = resolve(candidateRoot, generated, "source-soak-validation.json");
  execFileSync(process.execPath, [fileURLToPath(new URL("./aggregate-release-soak-shards.mjs", import.meta.url))], {
    cwd: candidateRoot,
    env: { ...process.env, SOAK_SEEDS: "20", SOAK_SEASONS: "30",
      SOAK_SHARD_DIRECTORY: resolve(root, certifications, "source-long-career-shards"), SOAK_OUTPUT: calculatedPath },
    encoding: "utf8", stdio: "pipe",
  });
  const calculated = await json(calculatedPath);
  required(calculated.candidateCommitSha === metadata.candidateCommitSha
    && calculated.candidateTreeSha === metadata.candidateTreeSha, "Candidate checkout does not match accepted source");
  // Aggregation timestamps and host details naturally differ when replaying the
  // reducer. Every observation, budget, seed, replay and candidate field must match.
  const stable = (document) => {
    const value = structuredClone(document);
    delete value.generatedAt;
    delete value.checkpoint.executionIdentityHash;
    for (const key of ["nodeVersion", "nodeOptions", "platform", "architecture"]) {
      delete value.checkpoint.executionIdentity[key];
    }
    return value;
  };
  required(isDeepStrictEqual(stable(source), stable(calculated)),
    "Source aggregate does not match its raw shard reduction");
}

export async function stageAcceptedSourceSoak({ root, candidateRoot, downloadRoot }) {
  root = resolve(root);
  const metadata = await readSource(root);
  const listingPath = resolve(root, certifications, "source-workflow-artifacts.json");
  const artifacts = await selectSourceSoakArtifacts(root, await json(listingPath));
  const copies = [];
  const destinations = new Set();
  for (const artifact of artifacts) {
    const directory = resolve(downloadRoot, artifact.name);
    const paths = await filesBelow(directory);
    required(paths.length > 0, `Empty source artifact: ${artifact.name}`);
    if (artifact.name === "release-soak-evidence") {
      required(paths.length === 1 && paths[0].split("/").at(-1) === aggregateName, "Malformed source aggregate artifact");
    } else if (!historical(metadata)) {
      const index = Number(artifact.name.slice("release-soak-shard-".length));
      required(paths.length === 1 && paths[0].split("/").at(-1) === `long-career-release-summary-seed-${index}.json`,
        `Source shard artifact has missing, extra, or misnamed evidence: ${artifact.name}`);
      const document = await json(resolve(directory, paths[0]));
      const run = document.runs?.[0];
      required(document.runs?.length === 1 && run?.seed === `release-soak-${String(index).padStart(2, "0")}`
        && document.checkpoint?.executionIdentity?.seedStart === index
        && document.profile?.kind === "full-canonical-weekly-career" && document.profile?.skippedOrdinaryWeeks === false
        && document.profile?.maxSerializedBytes === 80 * 1024 * 1024
        && Number.isInteger(run.canonicalTicks) && run.canonicalTicks === run.calendarWeeksSpanned
        && run.canonicalTicks >= 900 && run.reachedSeason >= 31,
      `Source shard does not match its seed or canonical policy: ${artifact.name}`);
    }
    for (const path of paths) {
      const name = path.split("/").at(-1);
      const destination = artifact.name === "release-soak-evidence"
        ? `${generated}/${aggregateName}` : `${certifications}/source-long-career-shards/${name}`;
      required(!destinations.has(destination), `Duplicate source evidence filename: ${name}`);
      destinations.add(destination);
      const bytes = await readFile(resolve(directory, path));
      copies.push({ source: resolve(directory, path), path: destination, sha256: digest(bytes), bytes: bytes.length });
    }
  }
  for (const copy of copies) {
    await mkdir(dirname(resolve(root, copy.path)), { recursive: true });
    await copyFile(copy.source, resolve(root, copy.path));
  }
  if (!historical(metadata)) await compareAggregate(root, candidateRoot);
  const boundFiles = [...copies.map(({ path }) => path),
    `${certifications}/source-workflow-run.json`, `${certifications}/source-workflow-jobs.json`,
    `${certifications}/source-workflow-artifacts.json`];
  const files = await Promise.all(boundFiles.map(async (path) => {
    const bytes = await readFile(resolve(root, path));
    return { path, sha256: digest(bytes), bytes: bytes.length };
  }));
  await writeFile(resolve(root, certifications, receiptName), `${JSON.stringify({
    schemaVersion: 1, candidateCommitSha: metadata.candidateCommitSha, candidateTreeSha: metadata.candidateTreeSha,
    acceptedSourceRunId: String(metadata.acceptedSourceRunId), controlWorkflowSha: metadata.controlWorkflowSha,
    mode: historical(metadata) ? "historical-exception-evidence-only" : "ordinary-20x30", files,
  }, null, 2)}\n`);
}

export async function verifyAcceptedSourceSoak({ root, candidateRoot, controlWorkflowSha }) {
  root = resolve(root);
  const metadata = await readSource(root);
  if (controlWorkflowSha) required(metadata.controlWorkflowSha === controlWorkflowSha,
    "Source soak transport control workflow SHA does not match");
  const receipt = await json(resolve(root, certifications, receiptName));
  required(receipt.schemaVersion === 1 && receipt.candidateCommitSha === metadata.candidateCommitSha
    && receipt.candidateTreeSha === metadata.candidateTreeSha
    && receipt.acceptedSourceRunId === String(metadata.acceptedSourceRunId)
    && receipt.controlWorkflowSha === metadata.controlWorkflowSha
    && receipt.mode === (historical(metadata) ? "historical-exception-evidence-only" : "ordinary-20x30"),
  "Source soak transport binding does not match accepted candidate");
  const paths = new Set();
  for (const entry of receipt.files ?? []) {
    required(typeof entry.path === "string" && !entry.path.includes("..") && !entry.path.includes("\\")
      && (entry.path === `${generated}/${aggregateName}` || entry.path.startsWith(`${certifications}/`)),
    "Invalid source soak receipt path");
    required(!paths.has(entry.path), "Duplicate source soak receipt path");
    paths.add(entry.path);
    const bytes = await readFile(resolve(root, entry.path));
    required(bytes.length === entry.bytes && digest(bytes) === entry.sha256,
      `Source soak evidence hash/length mismatch: ${entry.path}`);
  }
  for (const path of ["source-workflow-run.json", "source-workflow-jobs.json", "source-workflow-artifacts.json"]) {
    required(paths.has(`${certifications}/${path}`), `Missing source receipt entry: ${path}`);
  }
  const actualShards = await filesBelow(resolve(root, certifications, "source-long-career-shards"));
  const shardPaths = actualShards.map((path) => `${certifications}/source-long-career-shards/${path}`);
  required(shardPaths.every((path) => paths.has(path))
    && [...paths].filter((path) => path.startsWith(`${certifications}/source-long-career-shards/`)).length === shardPaths.length,
  "Source shard inventory does not match transport receipt");
  await selectSourceSoakArtifacts(root, await json(resolve(root, certifications, "source-workflow-artifacts.json")));
  if (!historical(metadata)) {
    required(paths.has(`${generated}/${aggregateName}`), "Missing source aggregate receipt entry");
    await compareAggregate(root, candidateRoot);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, root, candidateRoot, downloadRoot] = process.argv.slice(2);
  if (mode === "select") {
    const artifacts = await selectSourceSoakArtifacts(root,
      await json(resolve(root, certifications, "source-workflow-artifacts.json")));
    console.log(artifacts.map((artifact) => `${artifact.id}\t${artifact.name}`).join("\n"));
  } else if (mode === "stage") await stageAcceptedSourceSoak({ root, candidateRoot, downloadRoot });
  else if (mode === "verify") await verifyAcceptedSourceSoak({ root, candidateRoot, controlWorkflowSha: process.env.GITHUB_SHA });
  else throw new Error("Expected select, stage, or verify mode");
}
