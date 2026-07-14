import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const currentHeadSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repositoryRoot,
  encoding: "utf8",
}).trim().toLowerCase();
const configuredBuildVersion = (
  process.env.NEXT_PUBLIC_BUILD_VERSION?.trim() || currentHeadSha
).toLowerCase();
if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(configuredBuildVersion)) {
  throw new Error("NEXT_PUBLIC_BUILD_VERSION must be a full Git commit SHA");
}
if (configuredBuildVersion !== currentHeadSha) {
  throw new Error(
    `NEXT_PUBLIC_BUILD_VERSION ${configuredBuildVersion} does not match HEAD ${currentHeadSha}`,
  );
}

const packageDocument = JSON.parse(
  await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
);
const productVersion = String(packageDocument.version ?? "").trim();
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(productVersion)) {
  throw new Error(`package.json has an invalid product version: ${productVersion || "<missing>"}`);
}

const buildEnvironment = {
  ...process.env,
  NEXT_PUBLIC_BUILD_VERSION: configuredBuildVersion,
  NEXT_PUBLIC_APP_VERSION: productVersion,
};
if (process.argv.includes("--print-provenance")) {
  console.info(JSON.stringify({
    candidateCommitSha: configuredBuildVersion,
    productVersion,
  }));
  process.exit(0);
}

function runNode(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: repositoryRoot,
    env: buildEnvironment,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

runNode(resolve(repositoryRoot, "scripts/clean-build-output.mjs"));
runNode(resolve(repositoryRoot, "node_modules/next/dist/bin/next"), ["build"]);
runNode(resolve(repositoryRoot, "scripts/assert-shipping-provenance.mjs"), [
  `--expected=${configuredBuildVersion}`,
]);
