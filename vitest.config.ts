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
    include: [
      "tests/**/*.test.ts",
      "src/engine/career/seasonReviewContext.test.ts",
      "src/components/game/evidence/**/*.test.ts",
    ],
    coverage: { enabled: false },
  },
});
