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
    include: ["tests/release/**/*.soak.ts"],
    // The GitHub job owns the hard six-hour ceiling. Keep Vitest below that
    // boundary while allowing late-world 30-season careers to finish and emit
    // their candidate-bound evidence.
    testTimeout: Number.parseInt(
      process.env.SOAK_TEST_TIMEOUT_MS ?? String(5 * 60 * 60 * 1_000),
      10,
    ),
    hookTimeout: 120_000,
    maxWorkers: 1,
    coverage: { enabled: false },
  },
});
