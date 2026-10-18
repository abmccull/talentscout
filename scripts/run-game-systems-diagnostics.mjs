import { readSupportingJson, writeSupportingJson } from "./supporting-diagnostic-io.mjs";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
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
  if (!/^\d+$/.test(String(value)) || (!Number.isSafeInteger(Number(value)) || Number(value) < 1)) throw new Error(`--${key} must be a positive integer`);
  return Number(value);
};
const seasonCount = positive("seasons", profile === "smoke" ? 1 : 20);
const seedCount = positive("seeds", profile === "smoke" ? 1 : 3);
const seedStart = positive("seed-start", 1);
const concurrency = positive("concurrency", 1);
if (concurrency !== 1) throw new Error("Supporting diagnostics currently require --concurrency=1; the canonical c3 campaign uses its own unchanged entry point");
if (seedCount > 20 || seasonCount > 30) throw new Error("Supporting diagnostics allow at most 20 seeds and 30 seasons");
if (!Number.isSafeInteger(seedStart + seedCount - 1)) throw new Error("Seed index range is unsafe");
const checkpoints = [...new Set(String(options.get("checkpoints") ?? "1,5,10,20,30").split(",").map((entry) => {
  if (!/^\d+$/.test(entry) || (!Number.isSafeInteger(Number(entry)) || Number(entry) < 1 || Number(entry) > 30)) throw new Error("--checkpoints must be comma-separated positive integers");
  return Number(entry);
}))].sort((a, b) => a - b);
for (const flag of ["plan-only", "include-chooser-matrix"]) {
  if (options.has(flag) && options.get(flag) !== true) throw new Error(`--${flag} is a flag without a value`);
}
if (!options.get("out") || typeof options.get("out") !== "string") throw new Error("--out must name a new owned supporting directory");
const outputDirectory = resolve(options.get("out"));
const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const commitSha = git("rev-parse", "HEAD");
const sourcePaths = ["src", "tests", "scripts", "package.json", "package-lock.json", "tsconfig.json", "vitest.config.ts", "vitest.release-soak.config.ts", "vitest.supporting-diagnostics.config.ts"];
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
  persistence: "mocked; retained inputs require separate persistence/browser evidence",
  authority: "supporting diagnostics with existing invariants; no release certification or human grade",
  releaseCertification: false,
  outputDirectory,
};
if (options.has("plan-only")) {
  console.info(JSON.stringify({ ...plan, status: "Planned", simulationsExecuted: false }, null, 2));
  process.exit(0);
}

await mkdir(outputDirectory); // New owned directory; preserve every prior run and failure.
const startedAt = new Date().toISOString();
await writeSupportingJson(join(outputDirectory, "protocol.json"), { ...plan, startedAt });
const cleanEnvironment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !key.toUpperCase().startsWith("SOAK_") && !key.toUpperCase().startsWith("DIAGNOSTIC_") && key.toUpperCase() !== "NODE_OPTIONS"));
const executions = [];
let sourceUnchanged = true;
for (let index = 0; index < seedCount && sourceUnchanged; index += 1) {
  for (const chooserProfile of plan.chooserProfiles) {
    const seed = `release-soak-${String(seedStart + index).padStart(2, "0")}`;
    const runDirectory = join(outputDirectory, `${seed}--${chooserProfile}`);
    await mkdir(runDirectory);
    const output = join(runDirectory, "diagnostic.json");
    const outcome = await new Promise((resolveRun) => {
      const child = spawn(process.execPath, [resolve("node_modules/vitest/vitest.mjs"), "run", "--config", "vitest.supporting-diagnostics.config.ts"], {
        env: { ...cleanEnvironment, DIAGNOSTIC_SEED: seed, DIAGNOSTIC_PROFILE: chooserProfile,
          DIAGNOSTIC_SEASONS: String(seasonCount), DIAGNOSTIC_OUTPUT: output, DIAGNOSTIC_CHECKPOINTS: checkpoints.join(","),
          DIAGNOSTIC_SOURCE_SHA: source.commitSha, DIAGNOSTIC_SOURCE_TREE: source.treeSha,
          DIAGNOSTIC_SOURCE_CLEAN: String(source.sourceTreeClean), DIAGNOSTIC_SOURCE_FINGERPRINT: source.fingerprint },
        stdio: "inherit", shell: false,
      });
      child.once("error", (error) => resolveRun({ exitCode: null, error: error.message }));
      child.once("exit", (exitCode, signal) => resolveRun({ exitCode, signal }));
    });
    let receipt = null;
    let artifactError = null;
    try {
      const admitted = await readSupportingJson(output);
      const artifact = admitted.value;
      if (artifact.evidenceKind !== "supporting-game-systems-run" || artifact.seed !== seed || artifact.profile !== chooserProfile
        || artifact.seasons !== seasonCount || artifact.sourceFingerprint !== source.fingerprint
        || artifact.passed !== true || artifact.authority?.releaseCertificationEligible !== false
        || artifact.snapshots?.length !== plan.effectiveCheckpoints.length) throw new Error("Incomplete or mismatched supporting diagnostic");
      receipt = { path: output, sha256: admitted.sha256, passed: true, snapshots: artifact.snapshots.length, retainedInputs: artifact.retainedInputs };
    } catch (error) { artifactError = String(error); }
    sourceUnchanged = (await fingerprintSource()).fingerprint === source.fingerprint;
    executions.push({ seed, chooserProfile, ...outcome, receipt, artifactError, sourceUnchanged });
    await writeSupportingJson(join(outputDirectory, `progress-${String(executions.length).padStart(2, "0")}.json`), { executions });
    if (!sourceUnchanged) break;
  }
}
const passed = sourceUnchanged && executions.length === seedCount * plan.chooserProfiles.length
  && executions.every((execution) => execution.exitCode === 0 && execution.receipt?.passed && !execution.artifactError);
await writeSupportingJson(join(outputDirectory, "diagnostics.json"), {
  ...plan, startedAt, completedAt: new Date().toISOString(),
  status: passed ? "Passed supporting diagnostics" : "Failed", executions, sourceUnchanged,
});
console.info(`GAME_SYSTEMS_DIAGNOSTICS ${join(outputDirectory, "diagnostics.json")}`);
process.exitCode = passed ? 0 : 1;
