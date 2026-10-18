import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/release/portraitCareer.profile.ts"],
    maxWorkers: 1,
    testTimeout: 120_000,
  },
});
