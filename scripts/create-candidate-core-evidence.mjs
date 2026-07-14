import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(process.cwd());
const outputPath = resolve(
  root,
  process.env.CORE_EVIDENCE_OUTPUT
    ?? "artifacts/release/generated/candidate-core-suites.json",
);
const checkpointPath = resolve(
  root,
  "artifacts/release/generated/candidate-core-start.json",
);
const phase = process.argv.includes("--complete") ? "complete" : "start";
const head = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim().toLowerCase();
const configuredSha = (
  process.env.CORE_CANDIDATE_SHA
  ?? process.env.GITHUB_SHA
  ?? head
).trim().toLowerCase();
if (configuredSha !== head || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(configuredSha)) {
  throw new Error("Core-suite candidate SHA must be the full current HEAD");
}

if (phase === "start") {
  const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  if (dirty) throw new Error("Core-suite verification must start from a clean candidate checkout");
  await mkdir(dirname(checkpointPath), { recursive: true });
  await writeFile(checkpointPath, `${JSON.stringify({
    schemaVersion: 1,
    candidateCommitSha: head,
    sourceTreeCleanAtStart: true,
    startedAt: new Date().toISOString(),
    workflowRunId: process.env.GITHUB_RUN_ID?.trim() || null,
  }, null, 2)}\n`, "utf8");
  console.info(`CANDIDATE_CORE_START ${head}`);
  process.exit(0);
}

const checkpoint = JSON.parse(await readFile(checkpointPath, "utf8"));
if (
  checkpoint.candidateCommitSha !== head
  || checkpoint.sourceTreeCleanAtStart !== true
  || checkpoint.workflowRunId !== (process.env.GITHUB_RUN_ID?.trim() || null)
) {
  throw new Error("Core-suite completion does not match its clean-start checkpoint");
}
const generatedOutputPrefixes = [
  "artifacts/architecture/",
  "artifacts/performance/",
  "artifacts/replayability/",
  "artifacts/release/asset-provenance-audit.json",
  "design-audit-evidence/",
  "playwright-report/",
  "test-results/",
];
const finalStatusLines = execFileSync(
  "git",
  ["status", "--porcelain", "--untracked-files=all"],
  { cwd: root, encoding: "utf8" },
).trim().split(/\r?\n/).filter(Boolean);
const changedPaths = finalStatusLines.flatMap((line) =>
  line.slice(3).split(" -> ").map((path) => path.replaceAll("\\", "/"))
);
const unexpectedPaths = changedPaths.filter((path) =>
  !generatedOutputPrefixes.some((prefix) =>
    prefix.endsWith("/") ? path.startsWith(prefix) : path === prefix
  )
);
if (unexpectedPaths.length > 0) {
  throw new Error(
    `Core-suite verification observed source/config mutations: ${unexpectedPaths.join(", ")}`,
  );
}
const commands = [
  "npm audit --audit-level=moderate",
  "npm run typecheck",
  "npm run lint",
  "npm run test:architecture",
  "npm run test:asset-provenance",
  "npm run test:unit",
  "npm run test:replayability",
  "npm run build:e2e",
  "npm run test:e2e:opening",
  "npm run test:e2e:performance",
  "npm run test:e2e:youth-ea",
  "npm run test:e2e:smoke",
  "npm run test:e2e:accessibility",
  "npm run build",
];
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({
  schemaVersion: 1,
  evidenceKind: "candidate-core-suites",
  generatedAt: new Date().toISOString(),
  candidateCommitSha: head,
  workflowRunId: checkpoint.workflowRunId,
  candidateBound: true,
  sourceTreeCleanAtStart: true,
  sourceAndConfigUnchangedAtCompletion: true,
  generatedOutputChanges: changedPaths,
  status: "Passed",
  commands: commands.map((command) => ({ command, status: "Passed" })),
}, null, 2)}\n`, "utf8");
console.info(`CANDIDATE_CORE_COMPLETE ${head}`);
