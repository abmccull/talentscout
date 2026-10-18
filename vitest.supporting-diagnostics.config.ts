import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/release/supportingCareer.diagnostic.ts"],
    env: { SOAK_SUPPORTING_DIAGNOSTICS_ONLY: "true" },
    // Per-career timeout is unchanged. The separate self-hosted canonical
    // campaign job owns the longer whole-campaign lifetime.
    testTimeout: Number.parseInt(
      process.env.SOAK_TEST_TIMEOUT_MS ?? String(5 * 60 * 60 * 1_000),
      10,
    ),
    hookTimeout: 120_000,
    maxWorkers: 1,
    // Vitest launches the test file in an isolated worker and intentionally
    // filters most parent execArgv values. Put the certified ceiling and GC
    // hook on that actual worker, not only on the orchestration process.
    execArgv: [
      "--max-old-space-size=1440",
      "--max-semi-space-size=32",
      "--expose-gc",
    ],
    coverage: { enabled: false },
  },
});
