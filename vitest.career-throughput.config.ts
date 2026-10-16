import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const candidateRoot = dirname(fileURLToPath(import.meta.url));
const proposalRoot = process.env.THROUGHPUT_ARTIFACT_ROOT;
const sourceRootInput = process.env.THROUGHPUT_SOURCE_ROOT;
const mode = process.env.THROUGHPUT_MODE;
if (!sourceRootInput || !isAbsolute(sourceRootInput)) {
  throw new Error("THROUGHPUT_SOURCE_ROOT must name the absolute base or candidate checkout");
}
if (!proposalRoot || !isAbsolute(proposalRoot)) {
  throw new Error("THROUGHPUT_ARTIFACT_ROOT must name the absolute proposal directory");
}
if (mode !== "baseline" && mode !== "candidate") {
  throw new Error("THROUGHPUT_MODE must be baseline or candidate");
}

// Resolve test/dependencies from the candidate checkout, while only @ changes
// between immutable base and candidate sources. All configured cache is external.
// Invoke with --configLoader runner so bundling cannot use shared .vite-temp.
export default {
  root: candidateRoot,
  oxc: { jsx: { runtime: "automatic" } },
  cacheDir: resolve(proposalRoot, ".cache", mode),
  resolve: { alias: { "@": resolve(sourceRootInput, "src") } },
  test: {
    environment: "node",
    include: ["tests/release/careerThroughput.differential.proof.ts"],
    globals: false,
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 90_000,
    coverage: { enabled: false },
    server: { deps: { inline: [/talentscout/] } },
  },
};
