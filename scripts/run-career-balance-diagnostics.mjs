import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const argumentsMap = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const match = /^--(mode|out)=(.+)$/.exec(argument);
  if (!match) throw new Error(`Unsupported diagnostic argument: ${argument}`);
  return [match[1], match[2]];
}));
const mode = argumentsMap.mode ?? "smoke";
if (!["smoke", "full"].includes(mode)) throw new Error("--mode must be smoke or full");
if (!argumentsMap.out) throw new Error("--out must name a new evidence directory");
const output = resolve(argumentsMap.out);
await mkdir(output); // Never overwrite a previous run or its failures.
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const paths = [...new Set(git("ls-files", "-z", "--cached", "--others", "--exclude-standard", "--",
  "src", "tests/release", "scripts", "vitest.release-soak.config.ts", "package.json", "package-lock.json")
  .split("\0").filter(Boolean))].sort();
const sourceFiles = [];
for (const path of paths) sourceFiles.push({ path, sha256: hash(await readFile(path)) });
const seeds = [
  ...Array.from({ length: mode === "full" ? 8 : 1 }, (_, index) => ({
    cohort: "discovery", seed: `quality-balance-${mode === "smoke" ? "smoke-" : ""}discovery-v1-${String(index + 1).padStart(2, "0")}`,
  })),
  ...Array.from({ length: mode === "full" ? 4 : 1 }, (_, index) => ({
    cohort: "holdout", seed: `quality-balance-${mode === "smoke" ? "smoke-" : ""}holdout-v1-${String(index + 1).padStart(2, "0")}`,
  })),
];
const profiles = ["commercial", "cautious", "aggressive"];
const seasons = mode === "full" ? 6 : 1;
// Start the diagnostic with the unchanged defaults, regardless of a caller's
// previous soak flags, relaxed caps, outputs, candidate variables or replay mode.
const cleanChildEnvironment = Object.fromEntries(Object.entries(process.env)
  .filter(([key]) => !key.toUpperCase().startsWith("SOAK_")));
const protocol = {
  schemaVersion: 1, evidenceKind: "matched-policy-balance-diagnostic", mode,
  createdAt: new Date().toISOString(), seasons, profiles, seeds,
  source: { commitSha: git("rev-parse", "HEAD"), treeSha: git("rev-parse", "HEAD^{tree}"),
    dirty: git("status", "--porcelain", "--untracked-files=all").length > 0,
    fingerprint: hash(JSON.stringify(sourceFiles)), files: sourceFiles },
  authority: { releaseCertificationEligible: false, humanEngagementMeasured: false,
    smokeIsAcceptanceEvidence: false, policyTuningAllowedDuringRun: false },
  limitations: [
    "Policies use existing public-evidence heuristics; they are ordinary contrasting policies, not optimal strategies.",
    "Same seed and starting configuration is used for all profiles. This isolates policy differences within each seed.",
    "Holdout seeds are frozen before execution and reported separately. Once inspected, they cannot remain unseen holdouts for subsequent tuning.",
    "The one-season smoke may fail existing career progression assertions; those failures remain failures and are not relaxed.",
    "No human engagement, full release soak, provider save, or hardware performance claim follows from this diagnostic.",
  ],
};
await writeFile(resolve(output, "protocol.json"), `${JSON.stringify(protocol, null, 2)}\n`);
const runs = [];
async function currentSourceFingerprint() {
  try {
    const currentPaths = [...new Set(git("ls-files", "-z", "--cached", "--others", "--exclude-standard", "--",
      "src", "tests/release", "scripts", "vitest.release-soak.config.ts", "package.json", "package-lock.json")
      .split("\0").filter(Boolean))].sort();
    if (JSON.stringify(currentPaths) !== JSON.stringify(paths)) return "source-file-set-changed";
    const values = [];
    for (const { path } of sourceFiles) values.push({ path, sha256: hash(await readFile(path)) });
    return hash(JSON.stringify(values));
  } catch { return "source-unavailable"; }
}
let sourceChanged = false;
matrix:
for (const { cohort, seed } of seeds) {
  for (const profile of profiles) {
    if (await currentSourceFingerprint() !== protocol.source.fingerprint) {
      sourceChanged = true;
      break matrix;
    }
    const runPath = resolve(output, `${seed}--${profile}.json`);
    const startedAt = new Date().toISOString();
    const child = spawn(process.execPath, [resolve("node_modules/vitest/vitest.mjs"), "run", "--config", "vitest.release-soak.config.ts"], {
      cwd: process.cwd(), stdio: "inherit", env: { ...cleanChildEnvironment,
        SOAK_BALANCE_DIAGNOSTICS_ONLY: "true", SOAK_BALANCE_DIAGNOSTICS_OUTPUT: runPath,
        SOAK_BALANCE_SEED: seed, SOAK_BALANCE_PROFILE: profile, SOAK_BALANCE_COHORT: cohort,
        SOAK_BALANCE_SEASONS: String(seasons), SOAK_BALANCE_MODE: mode,
        SOAK_BALANCE_SOURCE_FINGERPRINT: protocol.source.fingerprint,
        SOAK_TEST_TIMEOUT_MS: String((mode === "full" ? 60 : 10) * 60 * 1000),
        SOAK_PROFILE_MATRIX_ONLY: "false", SOAK_WORKER_MODE: "false", SOAK_DIAGNOSTIC_ONLY: "false",
        SOAK_STORAGE_CHECKPOINT_DIRECTORY: "", SOAK_DIAGNOSTIC_CHECKPOINT_PATH: "",
      },
    });
    const outcome = await new Promise((resolveExit) => {
      child.once("error", (error) => resolveExit({ exitCode: null, error: String(error) }));
      child.once("exit", (exitCode, signal) => resolveExit({ exitCode, signal }));
    });
    let artifact = null;
    let artifactSha256 = null;
    let artifactError = null;
    try {
      const bytes = await readFile(runPath);
      artifact = JSON.parse(bytes.toString("utf8"));
      artifactSha256 = hash(bytes);
      if (artifact.seed !== seed || artifact.profile !== profile || artifact.cohort !== cohort ||
          artifact.sourceFingerprint !== protocol.source.fingerprint || artifact.seasons !== seasons) {
        throw new Error("Run artifact identity does not match the frozen protocol");
      }
    } catch (error) { artifactError = String(error); }
    if (await currentSourceFingerprint() !== protocol.source.fingerprint) {
      sourceChanged = true;
      artifactError = [artifactError, "Source changed during this run"].filter(Boolean).join("; ");
    }
    runs.push({ seed, cohort, profile, startedAt, completedAt: new Date().toISOString(), ...outcome,
      artifactPath: runPath, artifactSha256, artifactError, artifact });
    // Persist every completion/failure before starting the next independent process.
    await writeFile(resolve(output, "progress.json"), `${JSON.stringify({ protocol, runs }, null, 2)}\n`);
    if (sourceChanged) break matrix;
  }
}
const failures = runs.filter((run) => run.exitCode !== 0 || run.artifactError || !run.artifact?.passed);
const metricReaders = {
  finalBalance: (d) => d.finance.finalBalance,
  finalDebt: (d) => d.finance.finalDebt,
  earnedClassifiedReceipts: (d) => d.finance.earnedClassifiedReceipts,
  negativeBalanceWeeks: (d) => d.finance.negativeBalanceWeeks,
  maximumPolicyActionFreeWeeks: (d) => d.choices.maximumPolicyActionFreeWeeks,
  delayedAppliedConsequences: (d) => d.consequences.delayedApplied,
  acceptedClubResponses: (d) => d.reportOutcomes.accepted ?? 0,
  finalContactCount: (d) => d.relationships.finalCount,
  finalReputation: (d) => d.finalCareer?.reputation,
};
const distributions = ["discovery", "holdout"].flatMap((cohort) => profiles.map((profile) => {
  const group = runs.filter((run) => run.cohort === cohort && run.profile === profile);
  const completed = group.filter((run) => run.exitCode === 0 && !run.artifactError && run.artifact?.passed);
  return { cohort, profile, includedPassedRuns: completed.length,
    failedOrIncompleteSeeds: group.filter((run) => !completed.includes(run)).map((run) => run.seed),
    scope: "Distributions include only completed passing runs; failed and partial careers remain in the run receipts and must be reviewed separately.",
    metrics: Object.fromEntries(Object.entries(metricReaders).map(([name, read]) => {
      const values = completed.map((run) => ({ seed: run.seed, value: read(run.artifact.diagnostics) }))
        .filter((row) => typeof row.value === "number" && Number.isFinite(row.value))
        .sort((left, right) => left.value - right.value);
      const middle = Math.floor(values.length / 2);
      return [name, { count: values.length, minimum: values[0] ?? null, maximum: values.at(-1) ?? null,
        median: !values.length ? null : values.length % 2 ? values[middle].value
          : (values[middle - 1].value + values[middle].value) / 2, values }];
    })) };
}));
const summary = { schemaVersion: 1, evidenceKind: "matched-policy-balance-diagnostic", mode,
  protocol, completedAt: new Date().toISOString(), passed: failures.length === 0 && !sourceChanged && runs.length === seeds.length * profiles.length,
  failureCount: failures.length, sourceChanged, expectedRuns: seeds.length * profiles.length,
  missingRuns: seeds.length * profiles.length - runs.length, w07AcceptanceEstablished: false,
  missingRunIdentities: seeds.flatMap(({ seed, cohort }) => profiles
    .filter((profile) => !runs.some((run) => run.seed === seed && run.profile === profile))
    .map((profile) => ({ seed, cohort, profile }))),
  distributions,
  comparisons: seeds.map(({ cohort, seed }) => ({ cohort, seed, profiles: runs.filter((run) => run.seed === seed)
    .map((run) => ({ profile: run.profile, passed: run.artifact?.passed === true && run.exitCode === 0 && !run.artifactError,
      finance: run.artifact?.diagnostics?.finance ?? null,
      choices: run.artifact?.diagnostics?.choices ?? null,
      consequences: run.artifact?.diagnostics?.consequences ?? null,
      reportOutcomes: run.artifact?.diagnostics?.reportOutcomes ?? null,
      relationships: run.artifact?.diagnostics?.relationships ?? null,
      finalCareer: run.artifact?.diagnostics?.finalCareer ?? null })) })),
  runs: runs.map(({ artifact, ...receipt }) => ({ ...receipt, failures: artifact?.failures ?? [] })),
};
await writeFile(resolve(output, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.info(`CAREER_BALANCE_DIAGNOSTIC ${JSON.stringify({ mode, runs: runs.length, failures: failures.length, output })}`);
process.exitCode = summary.passed ? 0 : 1;
