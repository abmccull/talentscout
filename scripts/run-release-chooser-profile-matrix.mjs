import { spawn } from "node:child_process";
import { resolve } from "node:path";

const vitestEntry = resolve("node_modules/vitest/vitest.mjs");
const outputPath = resolve(
  process.env.SOAK_PROFILE_MATRIX_OUTPUT
    ?? "artifacts/release/generated/long-career-chooser-profile-matrix.json",
);
const planOnly = process.env.SOAK_PLAN_ONLY === "true";

if (planOnly) {
  console.info("LONG_CAREER_CHOOSER_PROFILE_MATRIX_PLAN skipped=true reason=plan-only");
} else {
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      process.execPath,
      [
        "--expose-gc",
        vitestEntry,
        "run",
        "--config",
        "vitest.release-soak.config.ts",
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          SOAK_PROFILE_MATRIX_ONLY: "true",
          SOAK_PROFILE_MATRIX_OUTPUT: outputPath,
          SOAK_DIAGNOSTIC_ONLY: "false",
          SOAK_WORKER_MODE: "false",
        },
        stdio: "inherit",
      },
    );
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`Chooser profile matrix failed (${signal ?? code})`));
    });
  });

  console.info(`LONG_CAREER_CHOOSER_PROFILE_MATRIX_ARTIFACT ${outputPath}`);
}
