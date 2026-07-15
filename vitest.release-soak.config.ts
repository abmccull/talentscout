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
    // A canonical 30-season career advances every ordinary week and performs
    // season-boundary save round-trips. Late-world runs can legitimately pass
    // the old 30-minute ceiling on release hardware without being stalled.
    testTimeout: 3_600_000,
    hookTimeout: 120_000,
    maxWorkers: 1,
    coverage: { enabled: false },
  },
});
