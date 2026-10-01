import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rmdir, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, resolve, sep } from "node:path";

const options = new Map();
const accepted = new Set(["candidate-dir", "run", "jobs", "shards", "out", "source-run-id"]);
for (const argument of process.argv.slice(2)) {
  const match = /^--([^=]+)=(.+)$/.exec(argument);
  if (!match || !accepted.has(match[1]) || options.has(match[1])) throw new Error(`Invalid staging option: ${argument}`);
  options.set(match[1], match[2]);
}
for (const name of accepted) if (!options.has(name)) throw new Error(`Missing staging option: ${name}`);
const candidate = resolve(options.get("candidate-dir"));
const runPath = resolve(options.get("run"));
const jobsPath = resolve(options.get("jobs"));
const shards = resolve(options.get("shards"));
const output = resolve(options.get("out"));
const sourceRunId = options.get("source-run-id");
if (!/^[1-9][0-9]*$/.test(sourceRunId)) throw new Error("Source run id must be numeric");
const git = (...args) => execFileSync("git", args, { cwd: candidate, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const candidateSha = git("rev-parse", "HEAD").toLowerCase();
const candidateTree = git("rev-parse", "HEAD^{tree}").toLowerCase();
if (git("status", "--porcelain", "--untracked-files=all")) throw new Error("Accepted soak staging requires a clean candidate");
const runBytes = await readFile(runPath);
const jobsBytes = await readFile(jobsPath);
const run = JSON.parse(runBytes.toString("utf8"));
const jobReceipt = JSON.parse(jobsBytes.toString("utf8"));
const expectedRepository = process.env.GITHUB_REPOSITORY || "abmccull/talentscout";
if (run.repository?.full_name !== expectedRepository) throw new Error("Source run repository does not match the release repository");
if (String(run.id) !== sourceRunId) throw new Error("Source run id does not match the accepted run identity");
if (run.head_sha !== candidateSha) throw new Error("Source run head SHA does not match the candidate");
if (run.status !== "completed") throw new Error("Source run status must be completed");
if (run.conclusion !== "success") throw new Error("Source run must have a successful conclusion");
if (!Array.isArray(jobReceipt.jobs) || jobReceipt.total_count > jobReceipt.jobs.length) {
  throw new Error("Source job receipt is missing jobs or is truncated");
}
const requiredJobs = ["Release quality gate",
  ...Array.from({ length: 20 }, (_, index) => `Exact candidate seed ${index + 1} x 30 seasons`),
  "Aggregate exact candidate 20x30 soak"];
for (const name of requiredJobs) {
  const jobs = jobReceipt.jobs.filter(job => job.name === name);
  if (jobs.length !== 1) throw new Error(`Source receipt needs exactly one required job: ${name}`);
  const job = jobs[0];
  if (String(job.run_id) !== sourceRunId) throw new Error(`Source job run identity does not match: ${name}`);
  if (job.head_sha !== candidateSha) throw new Error(`Source job head SHA does not match candidate: ${name}`);
  if (job.status !== "completed" || job.conclusion !== "success") throw new Error(`Source job must complete successfully: ${name}`);
}

// Aggregate to a temporary sibling. Invalid receipts/shards cannot replace a
// previously accepted canonical artifact, and the original receipts stay raw.
const parent = dirname(output);
await mkdir(parent, { recursive: true });
const temporary = await mkdtemp(resolve(parent, ".accepted-soak-"));
if (!temporary.startsWith(parent + sep) || !basename(temporary).startsWith(".accepted-soak-")) {
  throw new Error("Invalid staging temporary directory");
}
const staged = resolve(temporary, "long-career-release-summary.json");
try {
  const result = spawnSync(process.execPath, [resolve(candidate, "scripts/aggregate-release-soak-shards.mjs")], {
    cwd: candidate, encoding: "utf8", env: { ...process.env,
      SOAK_SEEDS: "20", SOAK_SEASONS: "30", SOAK_SHARD_DIRECTORY: shards, SOAK_OUTPUT: staged },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Accepted source shard aggregation failed:\n${result.stderr || result.stdout}`);
  const summary = JSON.parse(await readFile(staged, "utf8"));
  if (summary.candidateCommitSha !== candidateSha || summary.candidateTreeSha !== candidateTree
    || summary.status !== "Passed" || summary.profile?.seedCount !== 20 || summary.profile?.seasonCount !== 30
    || summary.runs?.length !== 20 || summary.checkpoint?.determinismReplayExecuted !== true) {
    throw new Error("Staged aggregate did not satisfy the exact candidate 20x30 replay contract");
  }
  const hash = bytes => createHash("sha256").update(bytes).digest("hex");
  summary.acceptedSourceWorkflow = { runId: sourceRunId, repository: expectedRepository,
    candidateCommitSha: candidateSha, runReceiptSha256: hash(runBytes), jobsReceiptSha256: hash(jobsBytes) };
  await writeFile(staged, JSON.stringify(summary, null, 2) + "\n", "utf8");
  await rename(staged, output);
  console.info(`Staged exact accepted-source 20x30 evidence for ${candidateSha}`);
} finally {
  await unlink(staged).catch(error => { if (error.code !== "ENOENT") throw error; });
  await rmdir(temporary);
}
