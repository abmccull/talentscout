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
    testTimeout: 1_800_000,
    hookTimeout: 120_000,
    maxWorkers: 1,
    coverage: { enabled: false },
  },
});
