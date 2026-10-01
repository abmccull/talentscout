import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/release/careerWeek.profile.ts"],
    maxWorkers: 1,
    testTimeout: 300_000,
    execArgv: ["--max-old-space-size=1440", "--max-semi-space-size=32", "--expose-gc"],
  },
});
