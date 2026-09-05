import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const controlRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const git = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };

export function localValidationPlan(candidateRoot) {
  candidateRoot = resolve(candidateRoot);
  const metadata = JSON.parse(readFileSync(resolve(candidateRoot, "artifacts/release/generated/accepted-candidate.json"), "utf8"));
  const controlSha = git(controlRoot, ["rev-parse", "HEAD"]);
  requireValue(metadata.schemaVersion === 1 && metadata.verificationOnly !== true, "Local strict validation needs an accepted shipping candidate bundle");
  requireValue(metadata.controlWorkflowSha === controlSha, "Local validation control revision does not match the accepted bundle");
  requireValue(!git(controlRoot, ["status", "--porcelain", "--untracked-files=all"]), "Local validation control checkout must be clean");
  requireValue(metadata.candidateCommitSha === git(candidateRoot, ["rev-parse", "HEAD"])
    && metadata.candidateTreeSha === git(candidateRoot, ["rev-parse", "HEAD^{tree}"]), "Local validation candidate commit/tree does not match the accepted bundle");
  requireValue(/^\d+$/.test(String(metadata.packageWorkflowRunId ?? "")), "Local validation package workflow run is invalid");
  requireValue(/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(metadata.candidateTag ?? ""), "Local validation intended candidate tag is invalid");
  // Fixed programs and arguments: no npm hooks, shell, workflow dispatch,
  // tag binding, artifact upload, package build, or promotion entry point.
  return {
    cwd: candidateRoot,
    commands: [[resolve(controlRoot, "scripts/check-release-evidence.mjs")]],
    env: {
      ...process.env,
      GITHUB_SHA: controlSha,
      RELEASE_CANDIDATE_SHA: metadata.candidateCommitSha,
      RELEASE_CANDIDATE_TREE_SHA: metadata.candidateTreeSha,
      RELEASE_CANDIDATE_TAG: metadata.candidateTag,
      RELEASE_WORKFLOW_RUN_ID: String(metadata.packageWorkflowRunId),
      RELEASE_EVIDENCE_STATUS: resolve(controlRoot, "docs/release/release-evidence-status.json"),
      RELEASE_PACKAGE_MANIFEST: "artifacts/release/candidate-package-manifest.json",
      RELEASE_EVIDENCE_OUTPUT: "artifacts/release/release-evidence-check.json",
      RELEASE_TAG_BINDING_MODE: "intended",
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    requireValue(args.length === 1 && args[0].startsWith("--candidate-root=") && args[0].slice(17), "Usage: node scripts/validate-release-candidate.mjs --candidate-root=<prepared candidate checkout>");
    const plan = localValidationPlan(args[0].slice("--candidate-root=".length));
    for (const args of plan.commands) {
      const result = spawnSync(process.execPath, args, { cwd: plan.cwd, env: plan.env, stdio: "inherit", shell: false });
      if (result.error) throw result.error;
      if (result.status !== 0) { process.exitCode = result.status ?? 1; break; }
    }
    console.info("LOCAL_CANDIDATE_VALIDATION_ONLY: no tag, upload, or publication; promotion remains a separate operation.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
