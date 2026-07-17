import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

const workerTestTimeoutMs = Number.parseInt(
  process.env.SOAK_WORKER_TEST_TIMEOUT_MS ?? String(2 * 60 * 60 * 1_000),
  10,
);

if (!Number.isInteger(workerTestTimeoutMs) || workerTestTimeoutMs <= 0) {
  throw new Error("SOAK_WORKER_TEST_TIMEOUT_MS must be positive");
}

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/release/**/*.soak.ts"],
    // A canonical 30-season career advances every ordinary week and performs
    // season-boundary save round-trips. High-activity seeds have exceeded the
    // old 60-minute ceiling while remaining CPU-bound and memory-stable. The
    // orchestrator binds this ceiling into the candidate evidence identity;
    // CI retains a separate six-hour outer job limit.
    testTimeout: workerTestTimeoutMs,
    hookTimeout: 120_000,
    maxWorkers: 1,
    coverage: { enabled: false },
  },
});
