import { describe, expect, it } from "vitest";

import {
  buildConciseOpeningSummary,
  getRecommendedActionLabel,
  isConciseOpeningReportMode,
} from "@/components/game/reportWriterMode";

describe("report writer opening mode", () => {
  it("uses concise mode only for the first guided opening report", () => {
    expect(isConciseOpeningReportMode({
      isYouthScout: true,
      openingStage: "report",
      openingPlayerId: "lead",
      selectedPlayerId: "lead",
      previousReportExists: false,
      observationCount: 1,
      contextCount: 1,
    })).toBe(true);

    expect(isConciseOpeningReportMode({
      isYouthScout: true,
      openingStage: "report",
      openingPlayerId: "lead",
      selectedPlayerId: "lead",
      previousReportExists: true,
      observationCount: 1,
      contextCount: 1,
    })).toBe(false);

    expect(isConciseOpeningReportMode({
      isYouthScout: true,
      openingStage: "report",
      openingPlayerId: "lead",
      selectedPlayerId: "lead",
      previousReportExists: false,
      observationCount: 2,
      contextCount: 2,
    })).toBe(false);
  });

  it("builds the concise opening summary from the three required judgments", () => {
    expect(buildConciseOpeningSummary({
      currentRead: "He is worth protecting as a live midfield lead.",
      keyUncertainty: "The standout action has not repeated under pressure.",
      recommendedActionLabel: getRecommendedActionLabel("inviteForTrial", true),
    })).toBe(
      "Current read: He is worth protecting as a live midfield lead. "
      + "Key uncertainty: The standout action has not repeated under pressure. "
      + "Recommended next step: Test the read in another context.",
    );
  });
});
