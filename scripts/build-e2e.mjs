import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shippingOutput = resolve(repositoryRoot, "out");
const e2eOutput = resolve(repositoryRoot, "out-e2e");
const bridgeMarker = resolve(e2eOutput, ".e2e-bridge.json");

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
writeFileSync(
  bridgeMarker,
  `${JSON.stringify({ artifact: "talentscout-e2e", bridge: "__GAME_STORE__" }, null, 2)}\n`,
  "utf8",
);
