import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertNoSupportingDiagnostics, supportingDiagnosticKeys } from "../../scripts/supporting-diagnostic-isolation.mjs";

describe("canonical campaign excludes supporting diagnostic instrumentation", () => {
  it("permits only absent diagnostic controls", () => { expect(() => assertNoSupportingDiagnostics({})).not.toThrow(); });
  it.each([
    "SOAK_SUPPORTING_DIAGNOSTICS_ONLY", "SOAK_BALANCE_DIAGNOSTICS_ONLY", "SOAK_YOUTH_CONSEQUENCES_ONLY",
    "SOAK_GAME_SYSTEMS_DIAGNOSTICS_DIRECTORY", "SOAK_GAME_SYSTEMS_CHECKPOINTS", "SOAK_STORAGE_CHECKPOINT_DIRECTORY",
    "SOAK_BALANCE_DIAGNOSTICS_OUTPUT", "SOAK_YOUTH_CONSEQUENCES_OUTPUT",
  ])("refuses even false/empty inherited %s before canonical spawn", (key) => {
    expect(supportingDiagnosticKeys).toContain(key);
    for (const value of ["true", "false", "", "output/path"]) {
      expect(() => assertNoSupportingDiagnostics({ [key]: value })).toThrow("ERR_RELEASE_ARTIFACT_UNSUPPORTED_MODE");
    }
  });
});

describe("supporting entry point stays outside canonical publication", () => {
  it("guards the driver before profile load or spawn and leaves canonical payload shape unchanged", () => {
    const driver = readFileSync("scripts/run-long-career-release-soak.mjs", "utf8");
    expect(driver.indexOf("assertNoSupportingDiagnostics();")).toBeLessThan(driver.indexOf("const loadedArtifactProfile"));
    const worker = readFileSync("tests/release/longCareerReleaseGate.soak.ts", "utf8");
    expect(worker).toContain("if (WORKER_MODE) assertNoSupportingDiagnostics();");
    expect(worker).toContain("Supporting observers cannot run inside a canonical campaign worker");
    expect(worker).not.toContain("storageCheckpoints,");
    expect(worker).not.toContain("gameSystemsHealth,");
    expect(worker).not.toContain("portraitDemand,");
    expect(worker).toContain("calendar.assertComplete(stabilizedFinalState, canonicalTicks)");
    expect(worker).toContain("stopObservingWeeklyTelemetry();");
  });
  it("selects supporting files through a separate configuration", () => {
    expect(readFileSync("vitest.supporting-diagnostics.config.ts", "utf8")).toContain('include: ["tests/release/supportingCareer.diagnostic.ts"]');
    expect(readFileSync("vitest.release-soak.config.ts", "utf8")).not.toContain("supportingCareer");
    const runner = readFileSync("scripts/run-game-systems-diagnostics.mjs", "utf8");
    expect(runner).not.toContain('commands = ["scripts/run-long-career-release-soak.mjs"]');
    expect(runner).toContain("releaseCertification: false");
  });
});
