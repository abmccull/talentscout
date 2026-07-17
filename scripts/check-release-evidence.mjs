import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import {
  operatorAttestableWindowsRuntimeControls,
  requiredWindowsRuntimeControls,
  validateWindowsRuntimeOperatorAttestation,
  windowsRuntimeOperatorAttestationPolicy,
} from "./windows-runtime-operator-attestation.mjs";

const execFileAsync = promisify(execFile);
const root = resolve(process.cwd());
const statusPath = resolve(
  root,
  process.env.RELEASE_EVIDENCE_STATUS ?? "docs/release/release-evidence-status.json",
);
const outputPath = resolve(
  root,
  process.env.RELEASE_EVIDENCE_OUTPUT ?? "artifacts/release/release-evidence-check.json",
);
const reportOnly = process.argv.includes("--report-only");
const allowedStatuses = new Set(["Passed", "Failed", "Unverified", "N/A"]);
const hashPattern = /^[a-f0-9]{64}$/i;
const commitPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const canonicalSoakCollectionKeys = [
  "players",
  "worldHistory",
  "fixtures",
  "matchRatings",
  "playerMovementHistory",
  "retiredPlayers",
  "retiredPlayerIds",
  "unsignedYouth",
];
const maximumCanonicalSoakLatencyMs = 30_000;
const packageKindExtensions = new Map([
  ["windows-installer", ".exe"],
  ["macos-dmg", ".dmg"],
  ["macos-zip", ".zip"],
  ["linux-appimage", ".appimage"],
  ["linux-deb", ".deb"],
]);

async function git(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: root });
  return stdout.trim();
}

function isPathInsideRoot(path) {
  const fromRoot = relative(root, path);
  return (
    fromRoot !== "" &&
    fromRoot !== ".." &&
    !fromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(fromRoot)
  );
}

async function sha256(path) {
  const hash = createHash("sha256");
  await new Promise((resolveHash, rejectHash) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", rejectHash);
    stream.once("end", resolveHash);
  });
  return hash.digest("hex");
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function hashJson(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function workerEvidencePayload(result) {
  const { checkpoint: _checkpoint, ...payload } = result;
  return payload;
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

function midseasonSampleWeeks(seasonLength) {
  if (!isPositiveInteger(seasonLength) || seasonLength < 3) return [];
  return [...new Set([
    Math.max(2, Math.floor((seasonLength + 1) / 3)),
    Math.min(seasonLength - 1, Math.floor((2 * (seasonLength + 1)) / 3)),
  ])].filter((week) => week > 1 && week < seasonLength);
}

function hasExactKeys(record, expectedKeys) {
  if (!isRecord(record)) return false;
  const actualKeys = Object.keys(record).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  return actualKeys.length === sortedExpectedKeys.length
    && actualKeys.every((key, index) => key === sortedExpectedKeys[index]);
}

function isCompleteNumericRecord(record, expectedKeys, allowNegative = false) {
  return hasExactKeys(record, expectedKeys)
    && expectedKeys.every((key) => (
      isFiniteNumber(record[key]) && (allowNegative || record[key] >= 0)
    ));
}

function sameNumber(left, right) {
  return isFiniteNumber(left) && isFiniteNumber(right) && Math.abs(left - right) < 0.000_001;
}

function validateCanonicalSoakRun(run, options) {
  const {
    expectedSeed,
    label,
    profile,
    requiredProfile,
    seasonCount,
  } = options;
  const runFailures = [];
  if (!isRecord(run)) return [`${label} is not a complete run record`];

  if (run.seed !== expectedSeed) runFailures.push(`${label} seed must be ${expectedSeed}`);
  if (run.reachedSeason !== seasonCount + 1) {
    runFailures.push(`${label} did not cross the exact final season boundary`);
  }
  const seasonLengths = Array.isArray(run.seasonLengths) ? run.seasonLengths : [];
  const validSeasonLengths = seasonLengths.length === seasonCount
    && seasonLengths.every((entry, index) => (
      isRecord(entry)
      && entry.season === index + 1
      && entry.weeks === requiredProfile.expectedSeasonLengthWeeks
    ));
  const expectedCanonicalTicks = validSeasonLengths
    ? seasonLengths.reduce((sum, entry) => sum + entry.weeks, 0)
    : null;
  if (
    !validSeasonLengths
    || run.expectedCanonicalTicks !== expectedCanonicalTicks
    || run.canonicalTicks !== expectedCanonicalTicks
    || run.calendarWeeksSpanned !== expectedCanonicalTicks
  ) {
    runFailures.push(`${label} exact per-season calendar evidence is incomplete or inconsistent`);
  }
  if (expectedCanonicalTicks !== requiredProfile.expectedCanonicalTicksPerSeed) {
    runFailures.push(`${label} canonical tick total does not match the committed release scenario`);
  }
  const expectedLeagueEntries = Object.entries(requiredProfile.scheduledLeagueClubCounts ?? {});
  const expectedFixtureCount = expectedLeagueEntries.reduce(
    (sum, [, clubCount]) => sum + clubCount * (clubCount - 1),
    0,
  );
  const seasonCalendarAudits = Array.isArray(run.seasonCalendarAudits)
    ? run.seasonCalendarAudits
    : [];
  if (
    seasonCalendarAudits.length !== seasonCount
    || seasonCalendarAudits.some((audit, index) => (
      !isRecord(audit)
      || audit.season !== index + 1
      || audit.seasonLengthWeeks !== requiredProfile.expectedSeasonLengthWeeks
      || audit.fixtureCount !== expectedFixtureCount
      || !Array.isArray(audit.leagues)
      || audit.leagues.length !== expectedLeagueEntries.length
      || audit.leagues.some((league, leagueIndex) => {
        const [leagueId, clubCount] = expectedLeagueEntries[leagueIndex] ?? [];
        return !isRecord(league)
          || league.leagueId !== leagueId
          || league.clubCount !== clubCount
          || league.weekCount !== (clubCount - 1) * 2
          || league.fixtureCount !== clubCount * (clubCount - 1)
          || league.uniquePairCount !== (clubCount * (clubCount - 1)) / 2;
      })
    ))
  ) {
    runFailures.push(`${label} independently audited fixture calendar is missing or invalid`);
  }
  const expectedMidseasonSamples = [];
  const expectedMemorySamples = [{ season: 1, week: 1, canonicalTick: 0 }];
  if (validSeasonLengths) {
    let completedTicks = 0;
    for (const entry of seasonLengths) {
      const samples = midseasonSampleWeeks(entry.weeks).map((week) => ({
        season: entry.season,
        week,
        canonicalTick: completedTicks + week - 1,
      }));
      expectedMidseasonSamples.push(...samples);
      expectedMemorySamples.push(...samples);
      completedTicks += entry.weeks;
      expectedMemorySamples.push({
        season: entry.season + 1,
        week: 1,
        canonicalTick: completedTicks,
      });
    }
  }

  for (const key of ["initialBytes", "finalBytes", "peakBytes"]) {
    if (!isPositiveInteger(run[key])) runFailures.push(`${label} ${key} is invalid`);
  }
  if (
    isPositiveInteger(run.initialBytes)
    && isPositiveInteger(run.finalBytes)
    && isPositiveInteger(run.peakBytes)
  ) {
    if (run.peakBytes < Math.max(run.initialBytes, run.finalBytes)) {
      runFailures.push(`${label} peakBytes is below an observed save size`);
    }
    if (!sameNumber(run.finalToInitialRatio, round(run.finalBytes / run.initialBytes))) {
      runFailures.push(`${label} finalToInitialRatio does not match its save sizes`);
    }
    if (
      isPositiveInteger(profile.maxSerializedBytes)
      && run.peakBytes > profile.maxSerializedBytes
    ) {
      runFailures.push(`${label} exceeded the serialized-save budget`);
    }
    if (
      isFiniteNumber(profile.maxGrowthMultiplier)
      && run.finalBytes > run.initialBytes * profile.maxGrowthMultiplier
    ) {
      runFailures.push(`${label} exceeded the save-growth budget`);
    }
  } else if (!isFiniteNumber(run.finalToInitialRatio) || run.finalToInitialRatio <= 0) {
    runFailures.push(`${label} finalToInitialRatio is invalid`);
  }

  const expectedHistorySeasons = Math.min(seasonCount, 30);
  if (run.worldHistorySeasons !== expectedHistorySeasons) {
    runFailures.push(`${label} world-history season count is incomplete`);
  }
  if (!isNonNegativeInteger(run.worldHistoryBytes)) {
    runFailures.push(`${label} worldHistoryBytes is invalid`);
  } else if (
    isRecord(profile.collectionByteBudgets)
    && isFiniteNumber(profile.collectionByteBudgets.worldHistory)
    && run.worldHistoryBytes > profile.collectionByteBudgets.worldHistory
  ) {
    runFailures.push(`${label} exceeded the world-history budget`);
  }

  if (
    !Array.isArray(run.largestCollections)
    || run.largestCollections.length === 0
    || run.largestCollections.length > 12
  ) {
    runFailures.push(`${label} largest-collection evidence is missing`);
  } else {
    const collectionNames = new Set();
    let previousBytes = Number.POSITIVE_INFINITY;
    for (const collection of run.largestCollections) {
      if (
        !isRecord(collection)
        || typeof collection.key !== "string"
        || collection.key.length === 0
        || !isNonNegativeInteger(collection.bytes)
        || collection.bytes > previousBytes
        || collectionNames.has(collection.key)
      ) {
        runFailures.push(`${label} largest-collection evidence is invalid`);
        break;
      }
      collectionNames.add(collection.key);
      previousBytes = collection.bytes;
    }
  }

  const midseasonSamples = Array.isArray(run.midseasonInvariantSamples)
    ? run.midseasonInvariantSamples
    : [];
  if (
    midseasonSamples.length !== expectedMidseasonSamples.length
    || midseasonSamples.some((sample, index) => {
      const expected = expectedMidseasonSamples[index];
      return !isRecord(sample)
        || sample.season !== expected?.season
        || sample.week !== expected?.week
        || sample.canonicalTick !== expected?.canonicalTick
        || !isPositiveInteger(sample.serializedBytes)
        || sample.serializedBytes > profile.maxSerializedBytes
        || !isNonNegativeInteger(sample.heapUsedBytes)
        || !isNonNegativeInteger(sample.rssBytes)
        || sample.heapUsedBytes > profile.maxHeapUsedBytes
        || sample.rssBytes > profile.maxRssBytes
        || sample.nonFiniteNumbers !== 0
        || sample.referenceViolations !== 0
        || sample.retentionReferenceViolations !== 0
        || sample.economyViolations !== 0;
    })
  ) {
    runFailures.push(`${label} bounded midseason invariant evidence is incomplete or invalid`);
  }

  const seasonGrowth = Array.isArray(run.seasonGrowth) ? run.seasonGrowth : [];
  if (seasonGrowth.length !== seasonCount) {
    runFailures.push(`${label} is missing season-boundary growth evidence`);
  } else {
    let previousSerializedBytes = run.initialBytes;
    for (let index = 0; index < seasonGrowth.length; index += 1) {
      const sample = seasonGrowth[index];
      const expectedSeason = index + 2;
      if (
        !isRecord(sample)
        || sample.season !== expectedSeason
        || !isPositiveInteger(sample.serializedBytes)
        || !Number.isInteger(sample.growthBytes)
        || !isNonNegativeInteger(sample.compactionRemovedBytes)
        || !isNonNegativeInteger(sample.compactionEvents)
        || !isCompleteNumericRecord(sample.collectionBytes, canonicalSoakCollectionKeys)
        || !isCompleteNumericRecord(
          sample.collectionCompactionDeltas,
          canonicalSoakCollectionKeys,
          true,
        )
      ) {
        runFailures.push(`${label} season ${expectedSeason} growth evidence is invalid`);
        continue;
      }
      if (sample.growthBytes !== sample.serializedBytes - previousSerializedBytes) {
        runFailures.push(`${label} season ${expectedSeason} growth does not reconcile`);
      }
      if (
        isPositiveInteger(profile.maxSerializedBytes)
        && sample.serializedBytes > profile.maxSerializedBytes
      ) {
        runFailures.push(`${label} season ${expectedSeason} exceeded the save budget`);
      }
      if (isRecord(profile.collectionByteBudgets)) {
        for (const key of canonicalSoakCollectionKeys) {
          if (
            isFiniteNumber(profile.collectionByteBudgets[key])
            && sample.collectionBytes[key] > profile.collectionByteBudgets[key]
          ) {
            runFailures.push(`${label} season ${expectedSeason} exceeded the ${key} budget`);
          }
        }
      }
      previousSerializedBytes = sample.serializedBytes;
    }
    if (
      isPositiveInteger(run.finalBytes)
      && seasonGrowth.at(-1)?.serializedBytes !== run.finalBytes
    ) {
      runFailures.push(`${label} final save size does not match its final season sample`);
    }
  }

  const compaction = run.compaction;
  if (
    !isRecord(compaction)
    || !isNonNegativeInteger(compaction.events)
    || !isNonNegativeInteger(compaction.seasonsWithReduction)
    || compaction.seasonsWithReduction > seasonCount
    || !isNonNegativeInteger(compaction.totalRemovedBytes)
    || !isCompleteNumericRecord(compaction.collectionDeltas, canonicalSoakCollectionKeys, true)
  ) {
    runFailures.push(`${label} compaction evidence is invalid`);
  } else if (seasonGrowth.length === seasonCount) {
    const expectedEvents = seasonGrowth.reduce(
      (sum, sample) => sum + (isNonNegativeInteger(sample?.compactionEvents) ? sample.compactionEvents : 0),
      0,
    );
    const expectedRemovedBytes = seasonGrowth.reduce(
      (sum, sample) => sum + (
        isNonNegativeInteger(sample?.compactionRemovedBytes) ? sample.compactionRemovedBytes : 0
      ),
      0,
    );
    if (compaction.events !== expectedEvents || compaction.totalRemovedBytes !== expectedRemovedBytes) {
      runFailures.push(`${label} compaction totals do not reconcile with season evidence`);
    }
    for (const key of canonicalSoakCollectionKeys) {
      const expectedDelta = seasonGrowth.reduce(
        (sum, sample) => sum + (
          isFiniteNumber(sample?.collectionCompactionDeltas?.[key])
            ? sample.collectionCompactionDeltas[key]
            : 0
        ),
        0,
      );
      if (!sameNumber(compaction.collectionDeltas[key], expectedDelta)) {
        runFailures.push(`${label} ${key} compaction total does not reconcile`);
      }
    }
  }

  function validMemorySample(sample, expected) {
    return isRecord(sample)
      && sample.season === expected.season
      && sample.week === expected.week
      && sample.canonicalTick === expected.canonicalTick
      && ["heapUsedBytes", "rssBytes", "externalBytes", "arrayBuffersBytes"]
        .every((key) => isNonNegativeInteger(sample[key]));
  }
  const memory = run.memory;
  const memorySamples = Array.isArray(memory?.samples) ? memory.samples : [];
  const expectedFinalMemory = {
    season: seasonCount + 1,
    week: 1,
    canonicalTick: expectedCanonicalTicks,
  };
  if (
    !isRecord(memory)
    || !validMemorySample(memory.initial, expectedMemorySamples[0])
    || !validMemorySample(memory.final, expectedFinalMemory)
    || !isPositiveInteger(memory.peakHeapUsedBytes)
    || !isPositiveInteger(memory.peakRssBytes)
    || memorySamples.length !== expectedMemorySamples.length
    || memorySamples.some((sample, index) => !validMemorySample(sample, expectedMemorySamples[index]))
  ) {
    runFailures.push(`${label} memory evidence is incomplete or invalid`);
  } else {
    const observedHeapPeak = Math.max(
      memory.initial.heapUsedBytes,
      memory.final.heapUsedBytes,
      ...memorySamples.map((sample) => sample.heapUsedBytes),
    );
    const observedRssPeak = Math.max(
      memory.initial.rssBytes,
      memory.final.rssBytes,
      ...memorySamples.map((sample) => sample.rssBytes),
    );
    if (memory.peakHeapUsedBytes < observedHeapPeak || memory.peakRssBytes < observedRssPeak) {
      runFailures.push(`${label} memory peaks are below observed samples`);
    }
    if (
      isPositiveInteger(profile.maxHeapUsedBytes)
      && memory.peakHeapUsedBytes > profile.maxHeapUsedBytes
    ) {
      runFailures.push(`${label} exceeded the heap budget`);
    }
    if (isPositiveInteger(profile.maxRssBytes) && memory.peakRssBytes > profile.maxRssBytes) {
      runFailures.push(`${label} exceeded the RSS budget`);
    }
    if (
      isNonNegativeInteger(profile.maxPostGcHeapGrowthBytes)
      && memory.final.heapUsedBytes - memory.initial.heapUsedBytes
        > profile.maxPostGcHeapGrowthBytes
    ) {
      runFailures.push(`${label} exceeded the post-GC heap-growth budget`);
    }
  }

  const latency = run.weeklyLatencyMs;
  if (
    !isRecord(latency)
    || !["p50", "p95", "max", "mean"].every((key) => (
      isFiniteNumber(latency[key]) && latency[key] >= 0
    ))
    || latency.p50 > latency.p95
    || latency.p95 > latency.max
    || latency.mean > latency.max
    || latency.max >= requiredProfile.maxCanonicalWeekLatencyMs
  ) {
    runFailures.push(`${label} weekly-latency evidence is invalid`);
  }

  const worldHealth = Array.isArray(run.worldHealth) ? run.worldHealth : [];
  const healthCountFields = [
    "activePlayers",
    "unsignedYouth",
    "freeAgents",
    "activeLoans",
    "reports",
    "observations",
    "inboxMessages",
  ];
  if (worldHealth.length !== seasonCount) {
    runFailures.push(`${label} is missing season-boundary world-health evidence`);
  } else {
    for (let index = 0; index < worldHealth.length; index += 1) {
      const sample = worldHealth[index];
      const expectedSeason = index + 2;
      if (
        !isRecord(sample)
        || sample.season !== expectedSeason
        || !healthCountFields.every((key) => isNonNegativeInteger(sample[key]))
        || !(sample.financialBalance === null || isFiniteNumber(sample.financialBalance))
      ) {
        runFailures.push(`${label} season ${expectedSeason} world-health evidence is invalid`);
      }
    }
  }

  if (typeof run.digest !== "string" || !/^[a-f0-9]{64}$/.test(run.digest)) {
    runFailures.push(`${label} deterministic digest is not a lowercase SHA-256 value`);
  }

  return runFailures;
}

const statusDocument = JSON.parse(await readFile(statusPath, "utf8"));
const packageDocument = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const productVersion = String(packageDocument.version ?? "").trim();
const currentSha = (await git(["rev-parse", "HEAD"])).toLowerCase();
const currentTreeSha = (await git(["rev-parse", "HEAD^{tree}"])).toLowerCase();
const treeOutput = await git(["status", "--porcelain", "--untracked-files=all"]);
const dirty = treeOutput.length > 0;
const configuredSha =
  process.env.RELEASE_CANDIDATE_SHA?.trim() || process.env.GITHUB_SHA?.trim() || currentSha;
const candidateSha = configuredSha.toLowerCase();
const candidateShaSource = process.env.RELEASE_CANDIDATE_SHA?.trim()
  ? "RELEASE_CANDIDATE_SHA"
  : process.env.GITHUB_SHA?.trim()
    ? "GITHUB_SHA"
    : "git HEAD";

const failures = [];
if (statusDocument.schemaVersion !== 2) {
  failures.push(`release evidence status has unsupported schemaVersion ${String(statusDocument.schemaVersion)}`);
}
if (!commitPattern.test(candidateSha)) {
  failures.push(`${candidateShaSource} is not a full Git commit SHA`);
} else if (candidateSha !== currentSha) {
  failures.push(`${candidateShaSource} ${candidateSha} does not match HEAD ${currentSha}`);
}
if (dirty) failures.push("working tree is dirty; evidence cannot describe an exact shipping candidate");

const configuredTag =
  process.env.RELEASE_CANDIDATE_TAG?.trim() || statusDocument.candidate?.tag;
const expectedVersionTag = productVersion ? `v${productVersion}` : null;
const escapedProductVersion = productVersion.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const compatibleVersionTagPattern = productVersion
  ? new RegExp(`^v${escapedProductVersion}(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$`)
  : null;
if (statusDocument.candidate?.requireVersionTag === true) {
  if (!configuredTag) {
    failures.push("an exact release tag is required for this candidate");
  } else if (!compatibleVersionTagPattern?.test(configuredTag)) {
    failures.push(
      `candidate tag ${configuredTag} is not ${expectedVersionTag ?? "<missing>"} or a prerelease of it`,
    );
  }
}
if (configuredTag) {
  try {
    const taggedSha = (await git(["rev-parse", `${configuredTag}^{commit}`])).toLowerCase();
    if (taggedSha !== candidateSha) {
      failures.push(`candidate tag ${configuredTag} resolves to ${taggedSha}, not ${candidateSha}`);
    }
  } catch {
    failures.push(`candidate tag ${configuredTag} cannot be resolved`);
  }
}

const configuredManifest =
  process.env.RELEASE_PACKAGE_MANIFEST?.trim() || statusDocument.candidate?.packageManifest;
const configuredRequiredKinds = statusDocument.candidate?.requiredPackageKinds;
const requiredPackageKinds = Array.isArray(configuredRequiredKinds)
  ? configuredRequiredKinds.filter((kind) => typeof kind === "string" && kind.trim()).map((kind) => kind.trim())
  : [];
if (!Array.isArray(configuredRequiredKinds) || requiredPackageKinds.length !== configuredRequiredKinds.length) {
  failures.push("candidate.requiredPackageKinds must be an array of non-empty strings");
}
if (new Set(requiredPackageKinds).size !== requiredPackageKinds.length) {
  failures.push("candidate.requiredPackageKinds contains duplicates");
}
const packageResults = [];
let packageManifest = null;
let packageManifestPath = null;

if (!configuredManifest) {
  failures.push("no release package manifest is configured");
} else {
  packageManifestPath = resolve(root, configuredManifest);
  try {
    packageManifest = JSON.parse(await readFile(packageManifestPath, "utf8"));
  } catch (error) {
    failures.push(
      `release package manifest cannot be read: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

if (packageManifest) {
  if (packageManifest.schemaVersion !== 2) {
    failures.push(`release package manifest has unsupported schemaVersion ${String(packageManifest.schemaVersion)}`);
  }
  const manifestSha = String(packageManifest.candidateCommitSha ?? "").toLowerCase();
  if (manifestSha !== candidateSha) {
    failures.push(
      `release package manifest candidate ${manifestSha || "<missing>"} does not match ${candidateSha}`,
    );
  }
  if (String(packageManifest.productVersion ?? "") !== productVersion) {
    failures.push(
      `release package manifest version ${String(packageManifest.productVersion ?? "<missing>")} does not match package version ${productVersion}`,
    );
  }
  if (configuredTag && String(packageManifest.candidateTag ?? "") !== configuredTag) {
    failures.push(
      `release package manifest tag ${String(packageManifest.candidateTag ?? "<missing>")} does not match ${configuredTag}`,
    );
  }
  const requiredWorkflowRunId = process.env.RELEASE_WORKFLOW_RUN_ID?.trim();
  if (
    requiredWorkflowRunId
    && String(packageManifest.workflowRunId ?? "") !== requiredWorkflowRunId
  ) {
    failures.push(
      `release package manifest workflow run ${String(packageManifest.workflowRunId ?? "<missing>")} does not match ${requiredWorkflowRunId}`,
    );
  }
  if (!Array.isArray(packageManifest.packages) || packageManifest.packages.length === 0) {
    failures.push("release package manifest contains no packages");
  } else {
    const seenPaths = new Set();
    const presentKinds = new Set();
    for (const entry of packageManifest.packages) {
      const kind = typeof entry?.kind === "string" ? entry.kind.trim() : "";
      const packagePath = typeof entry?.path === "string" ? entry.path.trim() : "";
      const expectedHash = typeof entry?.sha256 === "string" ? entry.sha256.toLowerCase() : "";
      const expectedBytes = entry?.bytes;
      const result = {
        kind,
        path: packagePath,
        expectedSha256: expectedHash,
        actualSha256: null,
        expectedBytes: Number.isInteger(expectedBytes) ? expectedBytes : null,
        actualBytes: null,
        status: "Failed",
        failures: [],
      };
      packageResults.push(result);

      if (!kind) {
        result.failures.push("package kind is missing");
      } else if (presentKinds.has(kind)) {
        result.failures.push("package kind is duplicated in the manifest");
      } else {
        presentKinds.add(kind);
      }
      if (!packagePath) {
        result.failures.push("package path is missing");
      } else if (isAbsolute(packagePath)) {
        result.failures.push("package path must be relative to the repository root");
      } else {
        const expectedExtension = packageKindExtensions.get(kind);
        if (expectedExtension && extname(packagePath).toLowerCase() !== expectedExtension) {
          result.failures.push(`package kind ${kind} requires a ${expectedExtension} file`);
        }
      }
      if (!hashPattern.test(expectedHash)) result.failures.push("sha256 must contain 64 hexadecimal characters");
      if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0) {
        result.failures.push("bytes must be a positive integer");
      }

      const absolutePackagePath = packagePath ? resolve(root, packagePath) : root;
      if (packagePath && !isPathInsideRoot(absolutePackagePath)) {
        result.failures.push("package path escapes the repository root");
      }
      const normalizedPath = packagePath ? relative(root, absolutePackagePath).replaceAll("\\", "/") : "";
      if (normalizedPath && seenPaths.has(normalizedPath)) {
        result.failures.push("package path is duplicated in the manifest");
      }
      if (normalizedPath) seenPaths.add(normalizedPath);

      if (result.failures.length === 0) {
        try {
          const packageStat = await stat(absolutePackagePath);
          if (!packageStat.isFile()) {
            result.failures.push("package path is not a file");
          } else {
            result.actualBytes = packageStat.size;
            result.actualSha256 = await sha256(absolutePackagePath);
            if (result.actualBytes !== expectedBytes) result.failures.push("package byte length does not match");
            if (result.actualSha256 !== expectedHash) result.failures.push("package SHA-256 does not match");
          }
        } catch (error) {
          result.failures.push(
            `package cannot be read: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      if (result.failures.length === 0) result.status = "Passed";
      else failures.push(`${kind || packagePath || "package"}: ${result.failures.join(", ")}`);
    }

    for (const requiredKind of requiredPackageKinds) {
      if (!presentKinds.has(requiredKind)) {
        failures.push(`release package manifest is missing required package kind ${requiredKind}`);
      }
    }
  }
}

async function validateGeneratedGateEvidence(gateId, policy) {
  const configuredPath = typeof policy?.path === "string" ? policy.path : "";
  const result = {
    kind: typeof policy?.kind === "string" ? policy.kind : "",
    path: configuredPath.replaceAll("<candidate-sha>", candidateSha),
    status: "Unverified",
    failures: [],
  };
  const supportedKinds = new Set([
    "long-career-release-soak",
    "candidate-core-suites",
    "windows-packaged-runtime",
    "release-gate-attestation",
  ]);
  if (!supportedKinds.has(result.kind)) {
    result.failures.push(`unsupported generated evidence kind ${result.kind || "<missing>"}`);
    return result;
  }
  if (!result.path || isAbsolute(result.path)) {
    result.failures.push("generated evidence path must be repository-relative");
    return result;
  }
  const evidencePath = resolve(root, result.path);
  if (!isPathInsideRoot(evidencePath)) {
    result.failures.push("generated evidence path escapes the repository root");
    return result;
  }

  let evidence;
  try {
    evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  } catch (error) {
    result.failures.push(
      `generated evidence cannot be read: ${error instanceof Error ? error.message : String(error)}`,
    );
    return result;
  }

  function requiredControls() {
    if (!Array.isArray(policy.requiredControls) || policy.requiredControls.length === 0) {
      result.failures.push("generated evidence policy must declare requiredControls");
      return [];
    }
    const controls = policy.requiredControls
      .filter((controlId) => typeof controlId === "string" && controlId.trim())
      .map((controlId) => controlId.trim());
    if (controls.length !== policy.requiredControls.length) {
      result.failures.push("generated evidence policy has invalid requiredControls entries");
    }
    if (new Set(controls).size !== controls.length) {
      result.failures.push("generated evidence policy has duplicate requiredControls entries");
    }
    return [...new Set(controls)];
  }

  function validateRequiredControls() {
    const controls = requiredControls();
    for (const controlId of controls) {
      const control = evidence.controls?.[controlId];
      if (!control) {
        result.failures.push(`required control ${controlId} is missing`);
      } else if (control.status !== "Passed") {
        result.failures.push(
          `required control ${controlId} is ${String(control.status ?? "missing a status")}`,
        );
      }
    }
  }

  if (result.kind === "candidate-core-suites") {
    if (evidence.schemaVersion !== 1 || evidence.evidenceKind !== result.kind) {
      result.failures.push("candidate core-suite evidence schema/kind is invalid");
    }
    if (String(evidence.candidateCommitSha ?? "").toLowerCase() !== candidateSha) {
      result.failures.push("candidate core-suite evidence does not describe the exact commit");
    }
    if (
      evidence.status !== "Passed"
      || evidence.candidateBound !== true
      || evidence.sourceTreeCleanAtStart !== true
      || evidence.sourceAndConfigUnchangedAtCompletion !== true
    ) {
      result.failures.push("candidate core suites did not complete from a clean checkout");
    }
    const requiredWorkflowRunId = process.env.RELEASE_WORKFLOW_RUN_ID?.trim();
    if (requiredWorkflowRunId && String(evidence.workflowRunId ?? "") !== requiredWorkflowRunId) {
      result.failures.push("candidate core-suite evidence came from another workflow run");
    }
    const commands = Array.isArray(evidence.commands) ? evidence.commands : [];
    if (
      commands.length === 0
      || commands.some((command) => !command?.command || command.status !== "Passed")
    ) {
      result.failures.push("candidate core-suite evidence has missing or non-passing commands");
    }
    if (result.failures.length === 0) result.status = "Passed";
    return result;
  }

  if (result.kind === "windows-packaged-runtime") {
    if (evidence.schemaVersion !== 1) {
      result.failures.push("Windows runtime evidence schemaVersion must be 1");
    }
    if (String(evidence.sourceHead ?? "").toLowerCase() !== candidateSha) {
      result.failures.push("Windows runtime evidence does not describe the exact candidate commit");
    }
    if (
      String(evidence.sourceTree ?? "").toLowerCase() !== currentTreeSha
      || evidence.candidateBound !== true
      || evidence.sourceTreeClean !== true
      || evidence.sourceTreeCleanAtCompletion !== true
      || evidence.sourceAndPackageUnchangedAtCompletion !== true
      || evidence.result !== "certifying_pass"
      || evidence.certification?.status !== "Passed"
      || (evidence.certification?.nonPassingRequiredControls?.length ?? -1) !== 0
      || (evidence.certification?.failedControls?.length ?? -1) !== 0
    ) {
      result.failures.push("Windows runtime evidence is not bound to a clean candidate");
    }
    if (
      evidence.candidateManifestBinding?.passed !== true
      || evidence.completionCandidateManifestBinding?.passed !== true
    ) {
      result.failures.push("Windows runtime evidence did not pass candidate-manifest binding");
    }
    const expectedWindowsSignerSha256 = String(
      process.env.WINDOWS_RELEASE_SIGNER_SHA256 ?? "",
    ).trim().toLowerCase();
    if (!hashPattern.test(expectedWindowsSignerSha256)) {
      result.failures.push("WINDOWS_RELEASE_SIGNER_SHA256 is required for Windows certification");
    }
    if (
      evidence.authenticode?.installer?.Status !== "Valid"
      || evidence.authenticode?.unpackedExecutable?.Status !== "Valid"
      || evidence.completionAuthenticode?.installer?.Status !== "Valid"
      || evidence.completionAuthenticode?.unpackedExecutable?.Status !== "Valid"
      || evidence.signerBinding?.passed !== true
      || evidence.completionSignerBinding?.passed !== true
      || String(evidence.signerBinding?.expectedSignerCertificateSha256 ?? "").toLowerCase()
        !== expectedWindowsSignerSha256
      || String(evidence.signerBinding?.observedSignerCertificateSha256 ?? "").toLowerCase()
        !== expectedWindowsSignerSha256
      || String(evidence.completionSignerBinding?.observedSignerCertificateSha256 ?? "").toLowerCase()
        !== expectedWindowsSignerSha256
    ) {
      result.failures.push("Windows installer and executable are not bound to the approved signer");
    }
    if (
      evidence.artifactStaging?.status !== "Passed"
      || evidence.artifactStaging?.sourceStableDuringStage !== true
      || evidence.artifactStaging?.stagedCopyExact !== true
      || evidence.artifactStaging?.unchangedAtCompletion !== true
      || !hashPattern.test(String(evidence.artifactStaging?.sourceInventorySha256 ?? ""))
      || !hashPattern.test(String(evidence.artifactStaging?.testedInventorySha256 ?? ""))
      || evidence.artifactStaging?.sourceInventorySha256
        !== evidence.artifactStaging?.testedInventorySha256
    ) {
      result.failures.push("Windows staged package inventory is incomplete or changed during certification");
    }
    if (evidence.exactCandidateInstallJourney?.status !== "Passed") {
      result.failures.push("exact Windows install-save-restart-load-uninstall journey did not pass");
    }
    const contradictoryLimitations = (Array.isArray(evidence.limitations) ? evidence.limitations : [])
      .filter((limitation) => typeof limitation === "string")
      .filter((limitation) =>
        /source tree was dirty|not a pass for the installer|supporting unpacked-runtime evidence only/i
          .test(limitation)
      );
    if (
      evidence.exactCandidateInstallJourney?.status === "Passed"
      && contradictoryLimitations.length > 0
    ) {
      result.failures.push(
        "Windows runtime evidence contradicts its passing exact installed-package journey",
      );
    }
    const failedControls = Object.entries(evidence.controls ?? {})
      .filter(([, control]) => control?.status === "Failed")
      .map(([controlId]) => controlId);
    if (failedControls.length > 0) {
      result.failures.push(`Windows runtime evidence contains failed controls: ${failedControls.join(", ")}`);
    }
    validateRequiredControls();
    const manifestWindows = packageManifest?.packages?.find(
      (entry) => entry?.kind === "windows-installer",
    );
    const evidenceWindows = evidence.artifacts?.find(
      (entry) => entry?.kind === "windows-installer",
    );
    if (
      !manifestWindows
      || !evidenceWindows
      || String(evidenceWindows.sha256 ?? "").toLowerCase()
        !== String(manifestWindows.sha256 ?? "").toLowerCase()
      || evidenceWindows.bytes !== manifestWindows.bytes
    ) {
      result.failures.push("Windows runtime installer hash/length does not match the package manifest");
    }
    let packageManifestSha256 = null;
    try {
      packageManifestSha256 = packageManifestPath ? await sha256(packageManifestPath) : null;
    } catch {
      // The package-manifest validation records the actionable read failure.
    }
    if (
      evidence.productVersion !== productVersion
      || String(evidence.workflowRunId ?? "") !== String(packageManifest?.workflowRunId ?? "")
      || evidence.candidateManifestBinding?.sha256 !== packageManifestSha256
      || evidence.completionCandidateManifestBinding?.sha256 !== packageManifestSha256
      || evidence.candidateManifestBinding?.candidateTag !== configuredTag
      || evidence.completionCandidateManifestBinding?.candidateTag !== configuredTag
      || evidence.candidateManifestBinding?.productVersion !== productVersion
      || evidence.completionCandidateManifestBinding?.productVersion !== productVersion
      || String(evidence.candidateManifestBinding?.workflowRunId ?? "")
        !== String(packageManifest?.workflowRunId ?? "")
      || String(evidence.completionCandidateManifestBinding?.workflowRunId ?? "")
        !== String(packageManifest?.workflowRunId ?? "")
    ) {
      result.failures.push("Windows runtime manifest/tag/version/workflow binding is inconsistent");
    }
    try {
      const runtimeRequiredControls = requiredWindowsRuntimeControls(statusDocument);
      const operatorControls = operatorAttestableWindowsRuntimeControls(statusDocument);
      const operatorPolicy = windowsRuntimeOperatorAttestationPolicy(statusDocument);
      if (JSON.stringify(runtimeRequiredControls) !== JSON.stringify(policy.requiredControls)) {
        result.failures.push("Windows runtime required-control policy is inconsistent");
      }
      if (
        evidence.operatorAttestation?.status !== "Accepted"
        || typeof evidence.operatorAttestation?.path !== "string"
        || !hashPattern.test(String(evidence.operatorAttestation?.sha256 ?? ""))
      ) {
        result.failures.push("Windows runtime evidence has no accepted operator attestation");
      } else if (!packageManifestPath || !manifestWindows) {
        result.failures.push("Windows operator attestation cannot be checked without the package manifest");
      } else {
        const operatorValidation = await validateWindowsRuntimeOperatorAttestation({
          root,
          attestationPath: evidence.operatorAttestation.path,
          candidateCommitSha: candidateSha,
          candidateTreeSha: currentTreeSha,
          candidateTag: configuredTag ?? packageManifest?.candidateTag ?? null,
          productVersion,
          workflowRunId: packageManifest?.workflowRunId,
          signerCertificateSha256: expectedWindowsSignerSha256,
          packageManifestPath,
          packageManifestGeneratedAt: packageManifest?.generatedAt,
          installerSha256: manifestWindows.sha256,
          requiredControls: runtimeRequiredControls,
          operatorAttestableControls: operatorControls,
          schemaPath: operatorPolicy.schemaPath,
          certificationBundleRoot: operatorPolicy.certificationBundleRoot,
        });
        if (!operatorValidation.accepted) {
          result.failures.push(
            `Windows operator attestation failed independent validation: ${operatorValidation.failures.join("; ")}`,
          );
        } else if (operatorValidation.attestationSha256 !== evidence.operatorAttestation.sha256) {
          result.failures.push("Windows operator attestation hash changed after runtime certification");
        } else {
          if (
            evidence.operatorAttestation?.schema?.path !== operatorValidation.schema?.path
            || evidence.operatorAttestation?.schema?.sha256 !== operatorValidation.schema?.sha256
            || evidence.operatorAttestation?.certificationBundlePath
              !== operatorValidation.attestation.certificationBundlePath
          ) {
            result.failures.push("Windows operator schema or certification bundle binding changed");
          }
          const claims = operatorValidation.attestation.claims;
          const claimIds = claims.map((claim) => claim.controlId).sort();
          if (JSON.stringify(claimIds) !== JSON.stringify([...operatorControls].sort())) {
            result.failures.push("Windows operator attestation does not cover every manual control");
          }
          if (
            JSON.stringify([...(evidence.operatorAttestation.claimedControls ?? [])].sort())
            !== JSON.stringify(claimIds)
          ) {
            result.failures.push("Windows runtime claimed-control summary does not match its attestation");
          }
          for (const claim of claims) {
            const merged = evidence.controls?.[claim.controlId];
            if (
              merged?.status !== "Passed"
              || merged?.evidence?.source !== "operator-attestation"
              || merged?.evidence?.attestationPath !== operatorValidation.attestationPath
              || merged?.evidence?.attestationSha256 !== operatorValidation.attestationSha256
              || merged?.evidence?.testedAt !== claim.testedAt
              || JSON.stringify(merged?.evidence?.environmentIds) !== JSON.stringify(claim.environmentIds)
              || JSON.stringify(merged?.evidence?.evidenceIds) !== JSON.stringify(claim.evidenceIds)
            ) {
              result.failures.push(
                `Windows manual control ${claim.controlId} does not reconcile with its attestation`,
              );
            }
          }
        }
      }
    } catch (error) {
      result.failures.push(
        `Windows operator-attestation policy is invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (result.failures.length === 0) result.status = "Passed";
    return result;
  }

  if (result.kind === "release-gate-attestation") {
    if (evidence.schemaVersion !== 1 || evidence.evidenceKind !== result.kind) {
      result.failures.push("release gate attestation schema/kind is invalid");
    }
    if (evidence.gateId !== gateId) {
      result.failures.push(`release gate attestation names ${String(evidence.gateId)}, not ${gateId}`);
    }
    if (String(evidence.candidateCommitSha ?? "").toLowerCase() !== candidateSha) {
      result.failures.push("release gate attestation does not describe the exact candidate commit");
    }
    if (configuredTag && evidence.candidateTag !== configuredTag) {
      result.failures.push("release gate attestation does not describe the exact candidate tag");
    }
    if (evidence.status !== "Passed" || typeof evidence.operator !== "string" || !evidence.operator.trim()) {
      result.failures.push("release gate attestation is not a completed operator-signed pass");
    }
    if (!Number.isFinite(Date.parse(evidence.completedAt ?? ""))) {
      result.failures.push("release gate attestation has no valid completion timestamp");
    }
    let expectedManifestHash = null;
    if (packageManifestPath) {
      try {
        expectedManifestHash = await sha256(packageManifestPath);
      } catch {
        // The package-manifest validation above records the actionable failure.
      }
    }
    if (!expectedManifestHash || String(evidence.packageManifestSha256 ?? "").toLowerCase() !== expectedManifestHash) {
      result.failures.push("release gate attestation is not bound to the exact package manifest");
    }
    const controls = Object.entries(evidence.controls ?? {});
    if (controls.length === 0 || controls.some(([, control]) => control?.status !== "Passed")) {
      result.failures.push("release gate attestation has missing or non-passing controls");
    }
    validateRequiredControls();
    const requiredKinds = Array.isArray(policy.requiredPackageKinds)
      ? policy.requiredPackageKinds
      : [];
    for (const kind of requiredKinds) {
      const packageEntry = packageManifest?.packages?.find((entry) => entry?.kind === kind);
      if (
        !packageEntry
        || String(evidence.packageHashes?.[kind] ?? "").toLowerCase()
          !== String(packageEntry.sha256 ?? "").toLowerCase()
      ) {
        result.failures.push(`release gate attestation is not bound to package kind ${kind}`);
      }
    }
    const evidenceFiles = Array.isArray(evidence.evidence) ? evidence.evidence : [];
    if (evidenceFiles.length === 0) {
      result.failures.push("release gate attestation contains no evidence files");
    }
    for (const entry of evidenceFiles) {
      const entryPath = typeof entry?.path === "string" ? entry.path : "";
      const expectedHash = typeof entry?.sha256 === "string" ? entry.sha256.toLowerCase() : "";
      if (!entryPath || isAbsolute(entryPath) || !hashPattern.test(expectedHash)) {
        result.failures.push("release gate attestation has an invalid evidence file entry");
        continue;
      }
      const absoluteEntryPath = resolve(root, entryPath);
      if (!isPathInsideRoot(absoluteEntryPath)) {
        result.failures.push(`release gate evidence path escapes the repository: ${entryPath}`);
        continue;
      }
      try {
        if (await sha256(absoluteEntryPath) !== expectedHash) {
          result.failures.push(`release gate evidence hash does not match: ${entryPath}`);
        }
      } catch (error) {
        result.failures.push(
          `release gate evidence cannot be read: ${entryPath} (${error instanceof Error ? error.message : String(error)})`,
        );
      }
    }
    if (result.failures.length === 0) result.status = "Passed";
    return result;
  }

  if (evidence.schemaVersion !== 4) result.failures.push("soak evidence schemaVersion must be 4");
  if (evidence.evidenceKind !== result.kind) result.failures.push("soak evidence kind does not match policy");
  if (!Number.isFinite(Date.parse(evidence.generatedAt ?? ""))) {
    result.failures.push("soak evidence has no valid generation timestamp");
  }
  if (String(evidence.candidateCommitSha ?? "").toLowerCase() !== candidateSha) {
    result.failures.push("soak evidence does not describe the exact candidate commit");
  }
  if (String(evidence.candidateTreeSha ?? "").toLowerCase() !== currentTreeSha) {
    result.failures.push("soak evidence does not describe the exact candidate tree");
  }
  if (evidence.status !== "Passed" || evidence.candidateBound !== true || evidence.sourceTreeClean !== true) {
    result.failures.push("soak evidence was not produced from a clean, passing candidate");
  }

  const minimumSeedCount = Number(policy.minimumSeedCount);
  const minimumSeasonCount = Number(policy.minimumSeasonCount);
  const requiredProfile = isRecord(policy.requiredProfile) ? policy.requiredProfile : {};
  const profile = isRecord(evidence.profile) ? evidence.profile : {};
  const seedCount = profile.seedCount;
  const seasonCount = profile.seasonCount;
  const checkpoint = evidence.checkpoint;
  const executionIdentity = checkpoint?.executionIdentity;
  const requiredWorkflowRunId = process.env.RELEASE_WORKFLOW_RUN_ID?.trim() || null;
  let currentPackageLockSha256 = null;
  let installedPackageLockSha256 = null;
  try {
    [currentPackageLockSha256, installedPackageLockSha256] = await Promise.all([
      sha256(resolve(root, "package-lock.json")),
      sha256(resolve(root, "node_modules/.package-lock.json")),
    ]);
  } catch (error) {
    result.failures.push(
      `soak dependency provenance cannot be verified: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const calculatedIdentityHash = executionIdentity && typeof executionIdentity === "object"
    ? createHash("sha256").update(JSON.stringify(executionIdentity)).digest("hex")
    : null;
  if (
    checkpoint?.protocolVersion !== 3
    || checkpoint?.determinismReplayExecuted !== true
    || !hashPattern.test(String(checkpoint?.executionIdentityHash ?? ""))
    || checkpoint?.executionIdentityHash !== calculatedIdentityHash
    || executionIdentity?.protocolVersion !== 3
    || executionIdentity?.candidateCommitSha !== candidateSha
    || executionIdentity?.candidateTreeSha !== currentTreeSha
    || executionIdentity?.seedCount !== seedCount
    || executionIdentity?.seasonCount !== seasonCount
    || executionIdentity?.concurrency !== profile.concurrency
    || executionIdentity?.maxSerializedBytes !== profile.maxSerializedBytes
    || executionIdentity?.workerTestTimeoutMs !== profile.workerTestTimeoutMs
    || executionIdentity?.profileKind !== "passive-world-canonical-weekly-career"
    || executionIdentity?.processIsolation !== "one-seeded-career-per-process"
    || !isPositiveInteger(executionIdentity?.availableParallelism)
    || !isPositiveInteger(executionIdentity?.totalMemoryBytes)
    || typeof executionIdentity?.nodeVersion !== "string"
    || !/^v\d+\.\d+\.\d+/.test(executionIdentity.nodeVersion)
    || typeof executionIdentity?.nodeOptions !== "string"
    || typeof executionIdentity?.platform !== "string"
    || executionIdentity.platform.length === 0
    || typeof executionIdentity?.architecture !== "string"
    || executionIdentity.architecture.length === 0
    || typeof executionIdentity?.cpuModel !== "string"
    || executionIdentity.cpuModel.length === 0
    || !(executionIdentity?.workflowRunId === null || typeof executionIdentity.workflowRunId === "string")
    || (requiredWorkflowRunId !== null && executionIdentity?.workflowRunId !== requiredWorkflowRunId)
    || executionIdentity?.packageLockSha256 !== currentPackageLockSha256
    || executionIdentity?.installedPackageLockSha256 !== installedPackageLockSha256
  ) {
    result.failures.push("soak checkpoint identity is missing, inconsistent, or not candidate-bound");
  }
  if (
    typeof checkpoint?.resumeEnabled !== "boolean"
    || !Number.isInteger(checkpoint?.reusedSeedCount)
    || !Number.isInteger(checkpoint?.executedSeedCount)
    || checkpoint.reusedSeedCount < 0
    || checkpoint.executedSeedCount < 0
    || checkpoint.reusedSeedCount + checkpoint.executedSeedCount !== seedCount
  ) {
    result.failures.push("soak checkpoint accounting does not cover every requested seed");
  }
  if (!Number.isInteger(minimumSeedCount) || minimumSeedCount <= 0) {
    result.failures.push("generated evidence policy has an invalid minimumSeedCount");
  } else if (!Number.isInteger(seedCount) || seedCount !== minimumSeedCount) {
    result.failures.push(`soak evidence requires exactly ${minimumSeedCount} canonical seeds`);
  }
  if (!Number.isInteger(minimumSeasonCount) || minimumSeasonCount <= 0) {
    result.failures.push("generated evidence policy has an invalid minimumSeasonCount");
  } else if (!Number.isInteger(seasonCount) || seasonCount !== minimumSeasonCount) {
    result.failures.push(`soak evidence requires exactly ${minimumSeasonCount} seasons`);
  }
  if (
    policy.requireProcessIsolation === true
    && profile.processIsolation !== "one-seeded-career-per-process"
  ) {
    result.failures.push("soak evidence does not use one isolated process per seeded career");
  }
  if (
    profile.kind !== "passive-world-canonical-weekly-career"
    || profile.authoritativeTicksPerSeason !== "calendar-dependent"
    || profile.skippedOrdinaryWeeks !== false
    || profile.exactCanonicalTransitionAssertions !== true
    || profile.maxMidseasonInvariantSamplesPerSeason !== 2
    || profile.midseasonAbsoluteSaveBudgetAssertions !== true
    || profile.collectionBudgetsEnforcedAtSeasonBoundaries !== true
    || profile.explicitGcAtSeasonBoundaries !== true
    || requiredProfile.seedCount !== minimumSeedCount
    || requiredProfile.seasonCount !== minimumSeasonCount
    || profile.seedCount !== requiredProfile.seedCount
    || profile.seasonCount !== requiredProfile.seasonCount
    || profile.concurrency !== requiredProfile.concurrency
    || profile.scenarioId !== requiredProfile.scenarioId
    || profile.actionPolicy !== requiredProfile.actionPolicy
    || profile.fatiguePolicy !== requiredProfile.fatiguePolicy
    || profile.expectedSeasonLengthWeeks !== requiredProfile.expectedSeasonLengthWeeks
    || profile.expectedCanonicalTicksPerSeed !== requiredProfile.expectedCanonicalTicksPerSeed
    || profile.workerTestTimeoutMs !== requiredProfile.workerTestTimeoutMs
    || profile.maxSerializedBytes !== requiredProfile.maxSerializedBytes
    || profile.maxGrowthMultiplier !== requiredProfile.maxGrowthMultiplier
    || profile.maxHeapUsedBytes !== requiredProfile.maxHeapUsedBytes
    || profile.maxRssBytes !== requiredProfile.maxRssBytes
    || profile.maxPostGcHeapGrowthBytes !== requiredProfile.maxPostGcHeapGrowthBytes
    || JSON.stringify(profile.scheduledLeagueClubCounts)
      !== JSON.stringify(requiredProfile.scheduledLeagueClubCounts)
    || !hasExactKeys(profile.collectionByteBudgets, canonicalSoakCollectionKeys)
    || !canonicalSoakCollectionKeys.every(
      (key) => isPositiveInteger(requiredProfile.collectionByteBudgets?.[key])
        && profile.collectionByteBudgets?.[key] === requiredProfile.collectionByteBudgets[key],
    )
    || requiredProfile.maxCanonicalWeekLatencyMs !== maximumCanonicalSoakLatencyMs
  ) {
    result.failures.push("soak profile is incomplete or is not the full budgeted canonical-week profile");
  }

  const runs = Array.isArray(evidence.runs) ? evidence.runs : [];
  if (!Number.isInteger(seedCount) || runs.length !== seedCount) {
    result.failures.push("soak evidence run count does not match its profile");
  }
  const expectedSeeds = Number.isInteger(seedCount)
    ? Array.from(
      { length: seedCount },
      (_, index) => `release-soak-${String(index + 1).padStart(2, "0")}`,
    )
    : [];
  if (
    runs.length !== expectedSeeds.length
    || runs.some((run, index) => run?.seed !== expectedSeeds[index])
  ) {
    result.failures.push("soak evidence must contain the ordered canonical seed set release-soak-01 through release-soak-20");
  }
  if (profile.deterministicReplaySeed !== expectedSeeds[0]) {
    result.failures.push("soak profile does not name the first canonical seed for deterministic replay");
  }
  const evidenceIntegrity = evidence.evidenceIntegrity;
  const workerEvidence = Array.isArray(evidenceIntegrity?.workerEvidence)
    ? evidenceIntegrity.workerEvidence
    : [];
  const evidenceManifest = {
    hashAlgorithm: evidenceIntegrity?.hashAlgorithm,
    workerHashPayload: evidenceIntegrity?.workerHashPayload,
    executionIdentitySha256: evidenceIntegrity?.executionIdentitySha256,
    workerEvidence,
    determinismReplayEvidence: evidenceIntegrity?.determinismReplayEvidence,
  };
  const validWorkerManifestEntry = (entry, index, suffix) => {
    const seedIndex = suffix === "run" ? index + 1 : 1;
    const seed = expectedSeeds[seedIndex - 1];
    const expectedPath = `artifacts/release/generated/long-career-workers/seed-${String(seedIndex).padStart(2, "0")}-${suffix}.json`;
    return isRecord(entry)
      && entry.seedIndex === seedIndex
      && entry.seed === seed
      && entry.path === expectedPath
      && typeof entry.payloadSha256 === "string"
      && /^[a-f0-9]{64}$/.test(entry.payloadSha256)
      && typeof entry.fileSha256 === "string"
      && /^[a-f0-9]{64}$/.test(entry.fileSha256);
  };
  if (
    !isRecord(evidenceIntegrity)
    || evidenceIntegrity.hashAlgorithm !== "sha256"
    || evidenceIntegrity.workerHashPayload
      !== "canonical JSON payload excluding the root checkpoint field plus exact worker file bytes"
    || evidenceIntegrity.executionIdentitySha256 !== checkpoint?.executionIdentityHash
    || workerEvidence.length !== expectedSeeds.length
    || workerEvidence.some((entry, index) => !validWorkerManifestEntry(entry, index, "run"))
    || !validWorkerManifestEntry(evidenceIntegrity.determinismReplayEvidence, 0, "determinism-replay")
    || evidenceIntegrity.manifestSha256 !== hashJson(evidenceManifest)
  ) {
    result.failures.push("soak worker-evidence hash manifest is missing, malformed, or inconsistent");
  }

  const verifyWorkerArtifact = async (entry, expectedRun, index, suffix) => {
    const label = suffix === "run" ? `soak worker ${index + 1}` : "soak determinism replay worker";
    if (!validWorkerManifestEntry(entry, index, suffix)) return;
    if (isAbsolute(entry.path)) {
      result.failures.push(`${label} path must be repository-relative`);
      return;
    }
    const absolutePath = resolve(root, entry.path);
    if (!isPathInsideRoot(absolutePath)) {
      result.failures.push(`${label} path escapes the repository`);
      return;
    }
    try {
      const [realRoot, realWorkerPath] = await Promise.all([realpath(root), realpath(absolutePath)]);
      const fromRealRoot = relative(realRoot, realWorkerPath);
      if (
        !fromRealRoot
        || fromRealRoot === ".."
        || fromRealRoot.startsWith(`..${sep}`)
        || isAbsolute(fromRealRoot)
      ) {
        result.failures.push(`${label} resolves outside the repository`);
        return;
      }
      const raw = await readFile(realWorkerPath, "utf8");
      const fileSha256 = createHash("sha256").update(raw).digest("hex");
      const worker = JSON.parse(raw);
      const payloadSha256 = hashJson(workerEvidencePayload(worker));
      if (fileSha256 !== entry.fileSha256 || payloadSha256 !== entry.payloadSha256) {
        result.failures.push(`${label} hash does not match its retained worker artifact`);
      }
      if (
        worker?.schemaVersion !== 3
        || worker?.profile?.kind !== "passive-world-canonical-weekly-career"
        || worker?.profile?.seedCount !== 1
        || worker?.profile?.seasonCount !== seasonCount
        || worker?.checkpoint?.protocolVersion !== 3
        || worker?.checkpoint?.executionIdentityHash !== checkpoint?.executionIdentityHash
        || worker?.checkpoint?.candidateCommitSha !== candidateSha
        || worker?.checkpoint?.candidateTreeSha !== currentTreeSha
        || worker?.checkpoint?.seedIndex !== entry.seedIndex
        || worker?.checkpoint?.seed !== entry.seed
        || worker?.checkpoint?.seasonCount !== seasonCount
        || worker?.checkpoint?.workerEvidenceHashAlgorithm !== "sha256"
        || worker?.checkpoint?.workerEvidenceSha256 !== entry.payloadSha256
        || !Number.isFinite(Date.parse(worker?.checkpoint?.completedAt ?? ""))
        || !Array.isArray(worker?.runs)
        || worker.runs.length !== 1
        || JSON.stringify(worker.runs[0]) !== JSON.stringify(expectedRun)
      ) {
        result.failures.push(`${label} does not reconcile with the candidate summary and checkpoint`);
      }
      const failurePath = absolutePath.replace(/\.json$/, "-failure.json");
      try {
        await access(failurePath);
        result.failures.push(`${label} retains a conflicting failure artifact`);
      } catch {
        // A successful worker removes its candidate-bound failure artifact.
      }
    } catch (error) {
      result.failures.push(
        `${label} cannot be independently verified: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  await Promise.all(workerEvidence.map((entry, index) => (
    verifyWorkerArtifact(entry, runs[index], index, "run")
  )));
  await verifyWorkerArtifact(
    evidenceIntegrity?.determinismReplayEvidence,
    evidence.determinismReplay,
    0,
    "determinism-replay",
  );
  if (Number.isInteger(seasonCount)) {
    runs.forEach((run, index) => {
      result.failures.push(...validateCanonicalSoakRun(run, {
        expectedSeed: expectedSeeds[index],
        label: `soak run ${index + 1}`,
        profile,
        requiredProfile,
        seasonCount,
      }));
    });
  }

  const aggregate = evidence.aggregate;
  if (!isRecord(aggregate) || !isRecord(aggregate.weeklyLatencyMs)) {
    result.failures.push("soak aggregate evidence is missing");
  } else if (runs.length > 0 && runs.every((run) => isRecord(run))) {
    const expectedAggregate = {
      totalCanonicalTicks: runs.reduce((sum, run) => sum + run.canonicalTicks, 0),
      totalCalendarWeeksSpanned: runs.reduce((sum, run) => sum + run.calendarWeeksSpanned, 0),
      largestSaveBytes: Math.max(...runs.map((run) => run.peakBytes)),
      largestFinalToInitialRatio: Math.max(...runs.map((run) => run.finalToInitialRatio)),
      peakHeapUsedBytes: Math.max(...runs.map((run) => run.memory?.peakHeapUsedBytes)),
      peakRssBytes: Math.max(...runs.map((run) => run.memory?.peakRssBytes)),
      largestSingleSeasonGrowthBytes: Math.max(
        ...runs.flatMap((run) => (
          Array.isArray(run.seasonGrowth) ? run.seasonGrowth.map((sample) => sample?.growthBytes) : []
        )),
      ),
      totalCompactionRemovedBytes: runs.reduce(
        (sum, run) => sum + run.compaction?.totalRemovedBytes,
        0,
      ),
      weeklyLatencyMs: {
        p50: round(percentile(runs.map((run) => run.weeklyLatencyMs?.p50), 0.5)),
        p95: round(percentile(runs.map((run) => run.weeklyLatencyMs?.p95), 0.95)),
        max: round(Math.max(...runs.map((run) => run.weeklyLatencyMs?.max))),
      },
    };
    for (const [key, expectedValue] of Object.entries(expectedAggregate)) {
      if (key === "weeklyLatencyMs") continue;
      if (!sameNumber(aggregate[key], expectedValue)) {
        result.failures.push(`soak aggregate ${key} does not reconcile with its runs`);
      }
    }
    for (const [key, expectedValue] of Object.entries(expectedAggregate.weeklyLatencyMs)) {
      if (!sameNumber(aggregate.weeklyLatencyMs[key], expectedValue)) {
        result.failures.push(`soak aggregate weeklyLatencyMs.${key} does not reconcile with its runs`);
      }
    }
    if (!isCompleteNumericRecord(
      aggregate.compactionCollectionDeltas,
      canonicalSoakCollectionKeys,
      true,
    )) {
      result.failures.push("soak aggregate compaction collection evidence is invalid");
    } else {
      for (const key of canonicalSoakCollectionKeys) {
        const expectedDelta = runs.reduce(
          (sum, run) => sum + (run.compaction?.collectionDeltas?.[key] ?? Number.NaN),
          0,
        );
        if (!sameNumber(aggregate.compactionCollectionDeltas[key], expectedDelta)) {
          result.failures.push(`soak aggregate ${key} compaction delta does not reconcile`);
        }
      }
    }
  }

  if (policy.requireDeterministicReplay === true && Number.isInteger(seasonCount)) {
    const firstRun = runs[0];
    const replay = evidence.determinismReplay;
    result.failures.push(...validateCanonicalSoakRun(replay, {
      expectedSeed: expectedSeeds[0],
      label: "soak deterministic replay",
      profile,
      requiredProfile,
      seasonCount,
    }));
    const deterministicFields = [
      "seed",
      "reachedSeason",
      "canonicalTicks",
      "expectedCanonicalTicks",
      "calendarWeeksSpanned",
      "seasonLengths",
      "initialBytes",
      "finalBytes",
      "peakBytes",
      "finalToInitialRatio",
      "worldHistorySeasons",
      "worldHistoryBytes",
      "largestCollections",
      "seasonGrowth",
      "compaction",
      "midseasonInvariantSamples",
      "worldHealth",
      "digest",
    ];
    if (
      !isRecord(firstRun)
      || !isRecord(replay)
      || deterministicFields.some(
        (key) => JSON.stringify(replay[key]) !== JSON.stringify(firstRun[key]),
      )
    ) {
      result.failures.push("soak evidence does not contain a complete matching deterministic replay");
    }
  }
  if (result.failures.length === 0) result.status = "Passed";
  return result;
}

const gateResults = [];
for (const [gateId, gate] of Object.entries(statusDocument.gates ?? {})) {
  if (!allowedStatuses.has(gate.status)) {
    failures.push(`${gateId} has invalid status ${String(gate.status)}`);
  }
  const missingEvidence = [];
  for (const evidencePath of gate.evidence ?? []) {
    try {
      await access(resolve(root, evidencePath));
    } catch {
      missingEvidence.push(evidencePath);
    }
  }
  const generatedEvidence = gate.generatedEvidence
    ? await validateGeneratedGateEvidence(gateId, gate.generatedEvidence)
    : null;
  let effectiveStatus = gate.status;
  if (gate.status === "Unverified" && generatedEvidence?.status === "Passed") {
    effectiveStatus = "Passed";
  }
  if (generatedEvidence && generatedEvidence.status !== "Passed") {
    failures.push(`${gateId} generated evidence: ${generatedEvidence.failures.join(", ")}`);
  }
  const effectiveEvidenceCount =
    (gate.evidence?.length ?? 0) + (generatedEvidence?.status === "Passed" ? 1 : 0);
  if (effectiveStatus === "Passed" && effectiveEvidenceCount === 0) {
    failures.push(`${gateId} is Passed without evidence`);
  }
  if (effectiveStatus === "Passed" && missingEvidence.length > 0) {
    failures.push(`${gateId} is Passed with missing evidence: ${missingEvidence.join(", ")}`);
  }
  if (effectiveStatus !== "Passed" && effectiveStatus !== "N/A") {
    failures.push(`${gateId} remains ${effectiveStatus}`);
  }
  gateResults.push({
    gateId,
    configuredStatus: gate.status,
    status: effectiveStatus,
    evidence: gate.evidence ?? [],
    missingEvidence,
    generatedEvidence,
  });
}

const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  candidate: {
    commitSha: candidateSha,
    shaSource: candidateShaSource,
    currentHeadSha: currentSha,
    tag: configuredTag ?? null,
    packageManifest: packageManifestPath ? relative(root, packageManifestPath).replaceAll("\\", "/") : null,
  },
  dirty,
  status: failures.length === 0 ? "Passed" : "Failed",
  packageVerification: {
    requiredKinds: requiredPackageKinds,
    packages: packageResults,
  },
  gateResults,
  failures,
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.info(`RELEASE_EVIDENCE_CHECK ${JSON.stringify({ status: report.status, failures: failures.length })}`);
console.info(`Evidence: ${relative(root, outputPath)}`);
if (!reportOnly && failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
