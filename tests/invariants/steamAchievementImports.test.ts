import { describe, expect, it } from "vitest";
import {
  auditSteamAchievementImports,
  renderSteamAchievementImportVdf,
} from "../../scripts/lib/steamAchievementImports.mjs";

describe("Steam achievement import scope", () => {
  it("keeps the Youth EA Steam manifest aligned with the reserved runtime IDs", () => {
    const report = auditSteamAchievementImports();

    expect(report.failures).toEqual([]);
    expect(report.counts).toEqual({
      youthEarlyAccess: 36,
      futureBuildOnly: 9,
      auditedSteamScope: 45,
      fullGameImportVdf: 45,
    });
    expect(report.codeReservedIds).toEqual(
      report.manifest.futureBuildOnlyAchievementIds,
    );
  });

  it("renders the checked-in Youth EA import file deterministically", () => {
    const report = auditSteamAchievementImports();

    expect(report.generatedYouthImportVdf).toBe(report.currentYouthImportSource);
    expect(renderSteamAchievementImportVdf(report.youthEntries)).toBe(
      report.generatedYouthImportVdf,
    );
  });

  it("flags future-build-only achievements that are still absent from the preserved full-game VDF", () => {
    const report = auditSteamAchievementImports();

    expect(report.missingReservedFromFullGame).toEqual([
      "MATCHES_25",
      "MATCHES_50",
      "MATCHES_100",
      "AGAINST_ALL_ODDS",
    ]);
  });
});
