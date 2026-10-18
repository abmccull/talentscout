import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { expect, it } from "vitest";
import { simulateCareer, type SupportingCareerObserver } from "./longCareerReleaseGate.soak";
import type { AutonomousCareerChooserProfileId } from "./autonomousYouthCareerDriver";
import { collectGameSystemsHealth } from "./gameSystemsHealth";
import { createCareerBalanceDiagnostics } from "./careerBalanceDiagnostics";
import { portraitRetentionDiagnostic, portraitContinuityViolations, retainStorageCheckpoint } from "./portraitRetentionDiagnostics";
import type { PlayerPortraitState } from "@/engine/players/portraits/types";
import { writeSupportingJson, supportingOutputPath } from "../../scripts/supporting-diagnostic-io.mjs";

// Included only by vitest.supporting-diagnostics.config.ts; never by the campaign.
(process.env.SOAK_YOUTH_CONSEQUENCES_ONLY === "true" ? it.skip : it)("records supporting career diagnostics without canonical artifact publication", async () => {
  expect(process.env.SOAK_SUPPORTING_DIAGNOSTICS_ONLY).toBe("true");
  expect(process.env.SOAK_WORKER_MODE).not.toBe("true");
  const balance = process.env.SOAK_BALANCE_DIAGNOSTICS_ONLY === "true";
  const seed = process.env.SOAK_BALANCE_SEED ?? process.env.DIAGNOSTIC_SEED ?? "";
  const profile = (process.env.SOAK_BALANCE_PROFILE ?? process.env.DIAGNOSTIC_PROFILE ?? "commercial") as AutonomousCareerChooserProfileId;
  const seasons = Number(process.env.SOAK_BALANCE_SEASONS ?? process.env.DIAGNOSTIC_SEASONS);
  expect(seed).toMatch(/^[a-z0-9-]{1,64}$/);
  expect(["commercial", "cautious", "aggressive"]).toContain(profile);
  expect(Number.isSafeInteger(seasons) && seasons >= 1 && seasons <= 30).toBe(true);
  const configuredOutput = process.env.SOAK_BALANCE_DIAGNOSTICS_OUTPUT ?? process.env.DIAGNOSTIC_OUTPUT;
  expect(configuredOutput).toBeTruthy();
  const output = await supportingOutputPath(dirname(resolve(configuredOutput!)), resolve(configuredOutput!).split(/[\\/]/).at(-1)!);
  const requested = (process.env.DIAGNOSTIC_CHECKPOINTS ?? "1,5,10,20,30").split(",").map(Number);
  expect(requested.every((season) => Number.isSafeInteger(season) && season >= 1 && season <= 30)).toBe(true);
  const checkpointSeasons = new Set([0, ...requested.filter((season) => season <= seasons), seasons]);
  const snapshots = new Map<number, ReturnType<typeof collectGameSystemsHealth>>();
  const portraitDemand: Array<{ completedSeason: number } & ReturnType<typeof portraitRetentionDiagnostic>> = [];
  const retainedInputs: Awaited<ReturnType<typeof retainStorageCheckpoint>>[] = [];
  let previousPortraits: PlayerPortraitState | undefined;
  const collector = createCareerBalanceDiagnostics();
  const failures: string[] = [];
  const observer: SupportingCareerObserver = async (state, telemetry, ticks, phase) => {
    collector.observe(state, telemetry, ticks);
    if (phase === "week") return;
    const completedSeason = phase === "initial" ? 0 : state.currentSeason - 1;
    if (snapshots.has(completedSeason)) return;
    const portrait = portraitRetentionDiagnostic(state);
    expect(portrait.violations).toEqual([]);
    expect(portraitContinuityViolations(previousPortraits, state.playerPortraits)).toEqual([]);
    previousPortraits = structuredClone(state.playerPortraits);
    portraitDemand.push({ completedSeason, ...portrait });
    if (checkpointSeasons.has(completedSeason)) snapshots.set(completedSeason, collectGameSystemsHealth(state, completedSeason));
    if (!balance && [1, 10, 30].includes(completedSeason)) {
      const directory = resolve(dirname(output), "storage-inputs");
      await mkdir(directory, { recursive: true });
      retainedInputs.push(await retainStorageCheckpoint({ directory, state, completedSeason, canonicalTicks: ticks,
        candidateCommitSha: process.env.DIAGNOSTIC_SOURCE_SHA ?? "",
        candidateTreeSha: process.env.DIAGNOSTIC_SOURCE_TREE ?? "",
        sourceTreeClean: process.env.DIAGNOSTIC_SOURCE_CLEAN === "true" }));
    }
  };
  let run: Awaited<ReturnType<typeof simulateCareer>> | null = null;
  try { run = await simulateCareer(seed, seasons, profile, observer); }
  catch (error) { failures.push(error instanceof Error ? `${error.name}: ${error.message}` : String(error)); }
  const diagnostics = collector.finish();
  if (diagnostics.finance.nonFiniteTransactionIndices.length) failures.push("non-finite financial transactions observed");
  if (diagnostics.finance.duplicateTransactionReferences.length) failures.push("duplicate financial transaction references observed");
  if (diagnostics.consequences.failed.length) failures.push("failed persisted consequences observed");
  for (const season of checkpointSeasons) if (!snapshots.has(season)) failures.push(`missing checkpoint ${season}`);
  await writeSupportingJson(output, {
    schemaVersion: 1, evidenceKind: balance ? "supporting-policy-balance-run" : "supporting-game-systems-run",
    generatedAt: new Date().toISOString(), seed, profile, seasons,
    cohort: process.env.SOAK_BALANCE_COHORT ?? null, mode: process.env.SOAK_BALANCE_MODE ?? null,
    sourceFingerprint: process.env.SOAK_BALANCE_SOURCE_FINGERPRINT ?? process.env.DIAGNOSTIC_SOURCE_FINGERPRINT,
    passed: failures.length === 0, failures, run, diagnostics, snapshots: [...snapshots.values()], portraitDemand, retainedInputs,
    authority: { releaseCertificationEligible: false, providerPersistenceVerified: false, humanEngagementMeasured: false },
  });
  expect(failures, "Supporting diagnostic retains every original invariant failure").toEqual([]);
});

(process.env.SOAK_YOUTH_CONSEQUENCES_ONLY === "true" ? it : it.skip)("records the bounded youth consequence scenario as supporting evidence", async () => {
  expect(process.env.SOAK_WORKER_MODE).not.toBe("true");
  const configuredOutput = process.env.SOAK_YOUTH_CONSEQUENCES_OUTPUT;
  expect(configuredOutput).toBeTruthy();
  const output = await supportingOutputPath(dirname(resolve(configuredOutput!)), resolve(configuredOutput!).split(/[\\/]/).at(-1)!);
  const { runYouthConsequenceScenario } = await import("./youthConsequenceScenario");
  await runYouthConsequenceScenario(process.env.SOAK_YOUTH_CONSEQUENCES_SEED ?? "youth-consequences-v1-01", output);
});
