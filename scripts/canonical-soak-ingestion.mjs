import { createHash } from "node:crypto";
import { validateReleaseCalendarReceipt } from "./release-calendar-receipt.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const digestPattern = /^[a-f0-9]{64}$/;
const workerArguments = ["--max-old-space-size=1440", "--max-semi-space-size=32", "--expose-gc"];
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const requireValue = (condition, message) => { if (!condition) throw new Error(`Canonical soak ingestion: ${message}`); };
const timestamp = (value) => typeof value === "string" && Number.isFinite(Date.parse(value)) ? Date.parse(value) : NaN;

export function validateCanonicalSource(run, jobs, context) {
  requireValue(run.path === ".github/workflows/canonical-release-soak.yml" && run.event === "workflow_dispatch", "source is not the explicit canonical workflow");
  requireValue(positive(run.run_attempt), "source run attempt is missing");
  requireValue(positive(run.repository?.id) && run.head_repository?.id === run.repository.id
    && run.head_repository?.full_name === context.expectedRepository, "fork or unbound source repository");
  requireValue(Number.isFinite(timestamp(run.run_started_at)) && timestamp(run.updated_at) >= timestamp(run.run_started_at), "source run time interval is invalid");
  requireValue(jobs.total_count === 1 && Array.isArray(jobs.jobs) && jobs.jobs.length === 1, "source receipt must contain the one actual canonical job without truncation or duplicates");
  const job = jobs.jobs[0];
  requireValue(job.name === "Canonical fresh 20x30/c3 with seed-one replay"
    && String(job.run_id) === context.sourceRunId && job.head_sha === context.candidateSha
    && job.run_attempt === run.run_attempt && job.status === "completed" && job.conclusion === "success", "canonical source job identity, attempt, or completion differs");
  requireValue(positive(job.id) && positive(job.runner_id) && typeof job.runner_name === "string" && job.runner_name.trim(), "actual source job/runner identity is missing");
  const labels = Array.isArray(job.labels) ? job.labels.map((label) => String(label).toLowerCase()) : [];
  requireValue(["self-hosted", "linux", "x64", "talentscout-release-soak"].every((label) => labels.includes(label)), "source job did not use the explicitly configured canonical runner capability");
  requireValue(/^[1-9][0-9]*$/.test(context.artifactId)
    && /^sha256:[a-f0-9]{64}$/.test(context.artifactDigest)
    && digestPattern.test(context.campaignSha256), "provider artifact/digest or campaign-byte binding is missing");
  requireValue(timestamp(context.artifactCreatedAt) >= timestamp(run.run_started_at)
    && timestamp(context.artifactCreatedAt) <= timestamp(run.updated_at), "source artifact does not belong to the current run-attempt interval");
  return { runAttempt: run.run_attempt, jobId: job.id };
}

export function validateCanonicalCampaign(summary, context) {
  const required = context.profile.campaign.requiredCertification;
  const budgets = context.profile.unchangedGameBudgets;
  const identity = summary?.checkpoint?.executionIdentity;
  const checkpoint = summary?.checkpoint;
  const profile = summary?.profile;
  requireValue(context.profilePurpose === "canonical", "diagnostic artifact admission cannot certify a canonical campaign");
  requireValue(summary.schemaVersion === 3 && summary.evidenceKind === "long-career-release-soak"
    && summary.status === "Passed" && summary.candidateBound === true && summary.sourceTreeClean === true
    && summary.candidateCommitSha === context.candidateSha && summary.candidateTreeSha === context.candidateTree,
  "campaign must be passing, clean and bound to the exact candidate");
  requireValue(!Object.hasOwn(summary, "acceptedSourceWorkflow"), "input already has an acceptance envelope; original source receipt required");
  const generatedAt = timestamp(summary.generatedAt);
  const artifactCreatedAt = timestamp(context.artifactCreatedAt);
  // GitHub's whole-second UTC receipt denotes [t, t + 1000ms). Explicit
  // fractional timestamps stay exact; this is precision, not clock-skew grace.
  const wholeSecondArtifact = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(context.artifactCreatedAt);
  requireValue(generatedAt >= timestamp(context.runStartedAt)
    && (wholeSecondArtifact ? generatedAt < artifactCreatedAt + 1000 : generatedAt <= artifactCreatedAt),
  "campaign generation falls outside its actual source attempt");
  requireValue(checkpoint?.protocolVersion === 1 && checkpoint.resumeEnabled === false
    && checkpoint.reusedSeedCount === 0 && checkpoint.executedSeedCount === required.primarySeeds
    && checkpoint.determinismReplayExecuted === true && !Object.hasOwn(checkpoint, "shardAccounting"),
  "canonical campaign requires fresh execution of all twenty seeds and fresh replay without resume/reuse");
  requireValue(identity && identity.protocolVersion === 1 && !Object.hasOwn(identity, "executionMode")
    && identity.candidateCommitSha === context.candidateSha && identity.candidateTreeSha === context.candidateTree
    && identity.seedCount === required.primarySeeds && identity.seedStart === required.freshReplaySeed
    && identity.seasonCount === required.seasons && identity.concurrency === required.concurrency
    && identity.maxSerializedBytes === budgets.saveBytes && identity.maxOutputBytes === context.profile.relay.defaultMaxOutputBytes
    && identity.profileKind === "full-canonical-weekly-career"
    && identity.processIsolation === "one-seeded-career-per-process"
    && identity.workerHeapLimitBytes === budgets.actualV8AndRetainedHeapBytes
    && same(identity.workerNodeArguments, workerArguments), "canonical execution identity or unchanged resource budget differs");
  requireValue(identity.artifactProfileId === context.profile.profileId
    && identity.artifactProfileSha256 === context.profileSha256 && identity.artifactProfilePurpose === "canonical"
    && checkpoint.executionIdentityHash === hash(JSON.stringify(identity)), "canonical profile or execution identity hash differs");
  requireValue(/^v22\.(?:1[2-9]|[2-9][0-9]|[1-9][0-9]{2,})\.[0-9]+$/.test(identity.nodeVersion)
    && identity.nodeOptions === "" && identity.platform === "linux" && identity.architecture === "x64"
    && positive(identity.availableParallelism) && positive(identity.totalMemoryBytes)
    && typeof identity.cpuModel === "string" && identity.cpuModel.trim(), "canonical source runtime/hardware identity is missing or differs from its workflow");
  requireValue(profile?.kind === "full-canonical-weekly-career" && profile.skippedOrdinaryWeeks === false
    && profile.seedCount === required.primarySeeds && profile.seasonCount === required.seasons
    && profile.concurrency === required.concurrency && profile.processIsolation === identity.processIsolation
    && profile.explicitGcAtSeasonBoundaries === true && profile.deterministicReplaySeed === "release-soak-01"
    && same(profile.chooserProfilesExercised, ["commercial"])
    && profile.maxSerializedBytes === budgets.saveBytes && profile.maxGrowthMultiplier === budgets.growthMultiplier
    && profile.maxHeapUsedBytes === budgets.actualV8AndRetainedHeapBytes && profile.v8HeapLimitBytes === budgets.actualV8AndRetainedHeapBytes
    && profile.maxRssBytes === budgets.rssBytes && profile.maxPostGcHeapGrowthBytes === budgets.postGcHeapGrowthBytes,
  "canonical campaign profile changed the timeline, chooser, isolation or resource budgets");
  requireValue(Array.isArray(summary.runs) && summary.runs.length === required.primarySeeds, "exactly twenty source careers required");
  function validateRun(run, seed) {
    requireValue(run?.seed === seed && digestPattern.test(String(run.digest ?? "")), "ordered source seed or digest is invalid");
    const calendarFailures = validateReleaseCalendarReceipt(run, required.seasons);
    requireValue(calendarFailures.length === 0, `calendar admission failed: ${calendarFailures.join("; ")}`);
    for (const [value, limit, label] of [
      [run.peakBytes, budgets.saveBytes, "save"],
      [run.finalToInitialRatio, budgets.growthMultiplier, "save growth"],
      [run.memory?.peakRuntimeHeapUsedBytes, budgets.actualV8AndRetainedHeapBytes, "runtime heap"],
      [run.memory?.peakHeapUsedBytes, budgets.actualV8AndRetainedHeapBytes, "retained heap"],
      [run.memory?.peakRssBytes, budgets.rssBytes, "RSS"],
    ]) requireValue(Number.isFinite(value) && value >= 0 && value <= limit, `${seed} ${label} exceeds or omits its original limit`);
  }
  for (let index = 0; index < required.primarySeeds; index += 1) validateRun(summary.runs[index], `release-soak-${String(index + 1).padStart(2, "0")}`);
  validateRun(summary.persistenceReplay, "release-soak-01");
  requireValue(summary.persistenceReplay.digest === summary.runs[0].digest, "fresh seed-one replay digest differs");
  requireValue(summary.aggregate?.totalCanonicalTicks === required.primarySeeds * required.seasons * context.profile.campaign.weeksPerSeason
    && summary.aggregate?.totalCalendarWeeksSpanned === summary.aggregate.totalCanonicalTicks, "aggregate canonical tick accounting differs");
}
