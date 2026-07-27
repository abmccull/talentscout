import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

function argument(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function positiveInteger(name, fallback) {
  const raw = argument(name, String(fallback));
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`--${name} must be a positive integer`);
  }
  return value;
}

const sampleSize = positiveInteger("seeds", 100);
const seasons = positiveInteger("seasons", 3);
const weeks = positiveInteger("weeks", 38);
const profile = argument("profile", "release");
if (profile !== "release" && profile !== "nightly") {
  throw new RangeError("--profile must be release or nightly");
}
const legacyReleaseArtifactPath = resolve("artifacts/replayability/release-summary.json");
const artifactPath = resolve(
  argument("out", "artifacts/release/generated/replayability-release-summary.json"),
);
if (profile === "release" && artifactPath === legacyReleaseArtifactPath) {
  throw new Error(
    "Release replayability evidence is authoritative only at "
      + "artifacts/release/generated/replayability-release-summary.json",
  );
}
const vitestEntry = resolve("node_modules/vitest/vitest.mjs");
const child = spawn(
  process.execPath,
  [vitestEntry, "run", "tests/release/replayabilityDivergence.test.ts", "--reporter=dot"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      TALENTSCOUT_REPLAYABILITY_SEEDS: String(sampleSize),
      TALENTSCOUT_REPLAYABILITY_SEASONS: String(seasons),
      TALENTSCOUT_REPLAYABILITY_WEEKS: String(weeks),
      TALENTSCOUT_REPLAYABILITY_PROFILE: profile,
      TALENTSCOUT_REPLAYABILITY_ARTIFACT: artifactPath,
    },
  },
);

const exitCode = await new Promise((resolveExit, reject) => {
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (signal) reject(new Error(`Replayability telemetry stopped by ${signal}`));
    else resolveExit(code ?? 1);
  });
});

try {
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  const releaseAuthority = artifact.humanFacingProxies?.authority;
  const releaseCertificationEligible = profile !== "release"
    || releaseAuthority?.releaseCertificationEligible === true;
  const status = !artifact.passed
    ? "FAIL"
    : releaseCertificationEligible
      ? "PASS"
      : "DIAGNOSTIC";
  process.stdout.write(
    `Replayability telemetry ${status}: ${sampleSize} seeds x ${seasons} seasons. `
      + `Artifact: ${artifactPath}\n`,
  );
  if (profile === "release" && !releaseCertificationEligible) {
    process.stdout.write(
      "Release certification ineligible: replayability evidence was generated "
        + `as ${releaseAuthority?.evidenceClass ?? "diagnostic_unknown_authority"}.\n`,
    );
  }
  if (artifact.failures?.length) {
    process.stdout.write(`${artifact.failures.map((failure) => `- ${failure}`).join("\n")}\n`);
  }
  if (artifact.balanceObservations?.length) {
    process.stdout.write(
      `${artifact.balanceObservations.map((observation) => `Balance note: ${observation}`).join("\n")}\n`,
    );
  }
} catch (error) {
  if (exitCode === 0) throw error;
}

process.exitCode = exitCode;
