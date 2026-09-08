import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

function parseOptions(args) {
  const options = new Map();
  for (const argument of args) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(argument);
    if (!match) throw new Error(`Expected --option=value, received ${argument}`);
    if (options.has(match[1])) throw new Error(`Duplicate option: ${match[1]}`);
    options.set(match[1], match[2] ?? true);
  }
  const known = new Set(["profile", "seasons", "seeds", "seed-start", "concurrency", "checkpoints", "out", "plan-only", "include-chooser-matrix"]);
  for (const key of options.keys()) if (!known.has(key)) throw new Error(`Unknown option: ${key}`);
  return options;
}

const options = parseOptions(process.argv.slice(2));
const profile = options.get("profile") ?? "smoke";
if (profile !== "smoke" && profile !== "long") throw new Error("--profile must be smoke or long");
const positive = (key, fallback) => {
  const value = options.get(key) ?? fallback;
  if (!/^\d+$/.test(String(value)) || Number(value) < 1) throw new Error(`--${key} must be a positive integer`);
  return Number(value);
};
const seasonCount = positive("seasons", profile === "smoke" ? 1 : 20);
const seedCount = positive("seeds", profile === "smoke" ? 1 : 3);
const seedStart = positive("seed-start", 1);
const concurrency = positive("concurrency", 1);
if (concurrency > Math.min(seedCount, 8)) throw new Error("Concurrency cannot exceed seed count or eight workers");
const checkpoints = [...new Set(String(options.get("checkpoints") ?? "1,5,10,20,30").split(",").map((entry) => {
  if (!/^\d+$/.test(entry) || Number(entry) < 1) throw new Error("--checkpoints must be comma-separated positive integers");
  return Number(entry);
}))].sort((a, b) => a - b);
for (const flag of ["plan-only", "include-chooser-matrix"]) {
  if (options.has(flag) && options.get(flag) !== true) throw new Error(`--${flag} is a flag without a value`);
}
const outputDirectory = resolve(String(options.get("out") ?? `artifacts/release/generated/game-systems/${profile}`));
const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const commitSha = git("rev-parse", "HEAD");
const sourcePaths = ["src", "tests", "scripts", "package.json", "package-lock.json", "tsconfig.json", "vitest.config.ts", "vitest.release-soak.config.ts"];
async function fingerprintSource() {
  const currentCommit = git("rev-parse", "HEAD");
  const currentTree = git("rev-parse", "HEAD^{tree}");
  const untracked = git("ls-files", "--others", "--exclude-standard", "--", ...sourcePaths).split("\n").filter(Boolean).sort();
  const untrackedSource = [];
  for (const path of untracked) untrackedSource.push({ path, sha256: sha256(await readFile(path)) });
  const trackedDiffSha256 = sha256(git("diff", "--binary", "HEAD", "--", ...sourcePaths));
  return {
    commitSha: currentCommit, treeSha: currentTree,
    sourceTreeClean: git("status", "--porcelain", "--untracked-files=all").length === 0,
    trackedDiffSha256, untrackedSource,
    fingerprint: sha256(JSON.stringify({ commitSha: currentCommit, treeSha: currentTree, trackedDiffSha256, untrackedSource })),
  };
}
const source = await fingerprintSource();
const plan = {
  schemaVersion: 1, evidenceKind: "game-systems-diagnostics", profile, source,
  seasonCount, seedCount, seedStart, concurrency,
  requestedCheckpoints: checkpoints,
  effectiveCheckpoints: [...new Set([0, ...checkpoints.filter((season) => season <= seasonCount), seasonCount])],
  chooserProfiles: options.has("include-chooser-matrix") ? ["commercial", "cautious", "aggressive"] : ["commercial"],
  persistence: "mocked by canonical soak; provider durability requires separate persistence/browser evidence",
  authority: "existing canonical release soak; population shapes have no additional balance thresholds",
  outputDirectory,
};
if (options.has("plan-only")) {
  console.info(JSON.stringify({ ...plan, status: "Planned", simulationsExecuted: false }, null, 2));
  process.exit(0);
}

await mkdir(outputDirectory, { recursive: true });
const startedAt = new Date().toISOString();
const runDirectory = join(outputDirectory, `run-${startedAt.replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`);
await mkdir(runDirectory, { recursive: true });
const snapshotDirectory = join(runDirectory, "football-checkpoints");
const environment = {
  ...process.env,
  SOAK_SEASONS: String(seasonCount), SOAK_SEEDS: String(seedCount), SOAK_SEED_START: String(seedStart),
  SOAK_CONCURRENCY: String(concurrency), SOAK_CANDIDATE_SHA: commitSha,
  SOAK_OUTPUT: join(runDirectory, "canonical-soak.json"),
  SOAK_WORKER_DIRECTORY: join(runDirectory, "workers"),
  SOAK_GAME_SYSTEMS_CHECKPOINTS: checkpoints.join(","),
  SOAK_GAME_SYSTEMS_DIAGNOSTICS_DIRECTORY: snapshotDirectory,
  SOAK_PROFILE_MATRIX_OUTPUT: join(runDirectory, "chooser-matrix.json"),
  SOAK_PROFILE_MATRIX_SEEDS: String(seedCount), SOAK_PROFILE_MATRIX_SEASONS: String(seasonCount),
  SOAK_PLAN_ONLY: "false", SOAK_RESUME: "false", SOAK_SKIP_DETERMINISM_REPLAY: "false",
  SOAK_PROFILE_MATRIX_ONLY: "false", SOAK_BALANCE_DIAGNOSTICS_ONLY: "false", SOAK_DIAGNOSTIC_ONLY: "false",
};
const commands = ["scripts/run-long-career-release-soak.mjs"];
if (options.has("include-chooser-matrix")) commands.push("scripts/run-release-chooser-profile-matrix.mjs");
const executions = [];
await writeFile(join(outputDirectory, "diagnostics.json"), JSON.stringify({ ...plan, runDirectory, startedAt, status: "Running" }, null, 2));
for (const command of commands) {
  const outcome = await new Promise((resolveRun) => {
    const child = spawn(process.execPath, [command], { env: environment, stdio: "inherit" });
    child.once("error", (error) => resolveRun({ command, exitCode: null, error: error.message }));
    child.once("exit", (exitCode, signal) => resolveRun({ command, exitCode, signal }));
  });
  executions.push(outcome);
  if (outcome.exitCode !== 0) break;
}
const snapshots = [];
try {
  for (const name of (await readdir(snapshotDirectory)).filter((name) => name.endsWith(".json")).sort()) {
    snapshots.push(JSON.parse(await readFile(join(snapshotDirectory, name), "utf8")));
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const completedSource = await fingerprintSource();
const sourceUnchanged = completedSource.fingerprint === source.fingerprint;
const passed = sourceUnchanged && executions.length === commands.length && executions.every((execution) => execution.exitCode === 0);
await writeFile(join(outputDirectory, "diagnostics.json"), JSON.stringify({
  ...plan, runDirectory, startedAt, completedAt: new Date().toISOString(),
  status: passed ? "Passed supporting diagnostics" : "Failed", executions, snapshots, sourceUnchanged, completedSource,
  releaseCertification: false,
}, null, 2));
console.info(`GAME_SYSTEMS_DIAGNOSTICS ${join(outputDirectory, "diagnostics.json")}`);
process.exitCode = passed ? 0 : 1;
