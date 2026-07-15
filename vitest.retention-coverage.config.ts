import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Save retention is deliberately isolated from the general critical gate. Its
 * public API is broad, but this suite makes its destructive boundaries
 * measurable: fixture pruning, archive compaction, causal-reference
 * preservation, and idempotence must remain covered on every change.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/invariants/saveRetention.test.ts"],
    coverage: {
      provider: "v8",
      enabled: true,
      reporter: ["text", "json-summary"],
      reportsDirectory: "artifacts/coverage/retention",
      include: ["src/engine/world/saveRetention.ts"],
      thresholds: {
        statements: 65,
        branches: 65,
        functions: 50,
        lines: 75,
      },
    },
  },
});
