import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shippingOutput = resolve(repositoryRoot, "out");
const e2eOutput = resolve(repositoryRoot, "out-e2e");
const bridgeMarker = resolve(e2eOutput, ".e2e-bridge.json");

function sourceIdentity() {
  const git = (...args) => execFileSync("git", args, {
    cwd: repositoryRoot, encoding: "utf8",
  }).trim();
  return {
    candidateCommitSha: git("rev-parse", "HEAD").toLowerCase(),
    candidateTreeSha: git("rev-parse", "HEAD^{tree}").toLowerCase(),
    sourceTreeClean: git("status", "--porcelain", "--untracked-files=all") === "",
  };
}
const sourceBeforeBuild = sourceIdentity();

// Hash the compiled executable graph and its entry documents. Photographs and
// audio have separate asset integrity gates; this receipt binds storage tests
// to the exact JavaScript, worker, and navigation bytes that were built.
function compiledRuntimeFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return compiledRuntimeFiles(path);
    if (!entry.isFile() || !/\.(?:html|js|css|json|wasm|txt)$/.test(entry.name)) return [];
    const bytes = readFileSync(path);
    return [{ path: relative(e2eOutput, path).replaceAll("\\", "/"),
      bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }];
  }).sort((left, right) => left.path.localeCompare(right.path));
}


// A failed rebuild must not leave a stale instrumented artifact looking valid.
rmSync(e2eOutput, { recursive: true, force: true });

const result = spawnSync("npm", ["run", "build"], {
  cwd: repositoryRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    NEXT_PUBLIC_ENABLE_E2E_BRIDGE: "true",
  },
});

if (result.error) throw result.error;
if (result.signal) {
  process.kill(process.pid, result.signal);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status ?? 1);

function compiledBridgeExists(directory) {
  if (!existsSync(directory)) return false;
  for (const entry of readdirSync(directory)) {
    const path = resolve(directory, entry);
    if (statSync(path).isDirectory()) {
      if (compiledBridgeExists(path)) return true;
      continue;
    }
    if (path.endsWith(".js") && readFileSync(path, "utf8").includes("__GAME_STORE__")) {
      return true;
    }
  }
  return false;
}

if (!compiledBridgeExists(resolve(shippingOutput, "_next", "static", "chunks"))) {
  throw new Error(
    "The E2E build completed without the compiled game-store bridge. " +
      "Refusing to publish an artifact that would leave seeded tests on the title screen.",
  );
}

// Keep the instrumented artifact separate from the shipping export. A normal
// production build may safely replace `out/` without invalidating Playwright's
// seeded-state contract.
cpSync(shippingOutput, e2eOutput, { recursive: true });
const sourceAfterBuild = sourceIdentity();
if (sourceBeforeBuild.candidateCommitSha !== sourceAfterBuild.candidateCommitSha
  || sourceBeforeBuild.candidateTreeSha !== sourceAfterBuild.candidateTreeSha) {
  throw new Error("Source candidate changed during the instrumented build");
}
const files = compiledRuntimeFiles(e2eOutput);
writeFileSync(
  bridgeMarker,
  `${JSON.stringify({
    schemaVersion: 2, artifact: "talentscout-e2e", bridge: "__GAME_STORE__",
    ...sourceAfterBuild,
    sourceTreeClean: sourceBeforeBuild.sourceTreeClean && sourceAfterBuild.sourceTreeClean,
    manifestScope: "compiled-runtime-and-entry-documents",
    compiledRuntimeSha256: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
    files,
  }, null, 2)}\n`,
  "utf8",
);
