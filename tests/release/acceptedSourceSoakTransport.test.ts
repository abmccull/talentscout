import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { selectSourceSoakArtifacts, stageAcceptedSourceSoak, verifyAcceptedSourceSoak } from "../../scripts/stage-accepted-source-soak.mjs";

describe("obsolete shard transport cannot become canonical acceptance", () => {
  it.each([selectSourceSoakArtifacts, stageAcceptedSourceSoak, verifyAcceptedSourceSoak])("refuses its legacy API before reading or copying evidence", async (entry) => {
    await expect(entry()).rejects.toMatchObject({ code: "ERR_LEGACY_SOAK_TRANSPORT_RETIRED" });
  });
  it.each(["select", "stage", "verify"])("refuses legacy %s invocation with an actionable bounded-path replacement", (mode) => {
    const result = spawnSync(process.execPath, ["scripts/stage-accepted-source-soak.mjs", mode], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--shards for bounded diagnostic-only staging");
    expect(result.stderr).toContain("provider-bound --campaign inputs");
  });
  it("keeps production workflows and checker on the bounded candidate implementation", () => {
    for (const path of [".github/workflows/package-accepted-candidate.yml", ".github/workflows/certify-release.yml", "scripts/check-release-evidence.mjs"]) {
      expect(readFileSync(path, "utf8")).not.toContain("stage-accepted-source-soak.mjs");
    }
    expect(readFileSync(".github/workflows/package-accepted-candidate.yml", "utf8")).toContain("stage-accepted-soak-evidence.mjs");
  });
});
