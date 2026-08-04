import { describe, expect, it } from "vitest";
import {
  auditSteamAchievementImports,
  renderSteamAchievementImportVdf,
} from "../../scripts/lib/steamAchievementImports.mjs";

describe("Steam achievement import scope", () => {
  it("keeps the audited Steam scope aligned with the reserved runtime IDs", () => {
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

  it("renders both checked-in Steam import files deterministically", () => {
    const report = auditSteamAchievementImports();

    expect(report.generatedFullGameImportVdf).toBe(
      report.currentFullGameImportSource,
    );
    expect(report.generatedYouthImportVdf).toBe(report.currentYouthImportSource);
    expect(renderSteamAchievementImportVdf(report.fullGameEntries)).toBe(
      report.generatedFullGameImportVdf,
    );
    expect(renderSteamAchievementImportVdf(report.youthEntries)).toBe(
      report.generatedYouthImportVdf,
    );
  });

  it("keeps both Steam import files free of missing, extra, or duplicate API names", () => {
    const report = auditSteamAchievementImports();

    expect(report.fullGameImportAudit).toMatchObject({
      expectedCount: 45,
      currentCount: 45,
      missing: [],
      extra: [],
      duplicates: [],
    });
    expect(report.youthImportAudit).toMatchObject({
      expectedCount: 36,
      currentCount: 36,
      missing: [],
      extra: [],
      duplicates: [],
    });
  });
});
