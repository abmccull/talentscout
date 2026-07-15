import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * A deliberately narrow coverage gate for code that can corrupt a career or
 * make the weekly simulation non-deterministic. Broad application coverage is
 * useful for trend reporting, but it is not a trustworthy release signal for
 * UI-heavy code with many intentionally deferred screens.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: [
      "tests/invariants/weeklyStrategy.test.ts",
      "tests/invariants/weeklySimulationPipeline.test.ts",
      "tests/invariants/weeklyTransactionProtocol.test.ts",
      "tests/invariants/gameStatePartitions.test.ts",
      "tests/invariants/standingsIndex.test.ts",
      "tests/persistence/saveEnvelope.test.ts",
      "tests/persistence/saveJournal.test.ts",
    ],
    coverage: {
      provider: "v8",
      enabled: true,
      reporter: ["text", "json-summary"],
      reportsDirectory: "artifacts/coverage/critical",
      include: [
      "src/engine/core/weeklyStrategy.ts",
      "src/engine/core/weeklySimulationPipeline.ts",
      "src/engine/core/weeklyTransactionProtocol.ts",
      "src/engine/core/gameStatePartitions.ts",
      "src/engine/core/standings.ts",
        "src/lib/saveEnvelope.ts",
        "src/lib/db.ts",
      ],
      thresholds: {
        statements: 80,
        branches: 60,
        functions: 80,
        lines: 80,
      },
    },
  },
});
