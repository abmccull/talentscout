import { describe, expect, it } from "vitest";

import { buildReportWriterStatus } from "@/components/game/reportWriterStatus";

describe("report writer status", () => {
  it("counts fresh-evidence blockers in final review when a revision has no new observations", () => {
    const status = buildReportWriterStatus({
      mode: "youth",
      hasObservations: true,
      hasFreshEvidence: false,
      hasSummary: true,
      youthValidationErrors: [],
    });

    expect(status.canSubmit).toBe(false);
    expect(status.totalRemaining).toBe(1);
    expect(status.countsByStep.final).toBe(1);
    expect(status.blockers).toEqual([
      expect.objectContaining({
        id: "fresh-evidence-required",
        stepId: "final",
      }),
    ]);
  });

  it("maps youth validation issues back to their owning workflow steps", () => {
    const status = buildReportWriterStatus({
      mode: "youth",
      hasObservations: true,
      hasFreshEvidence: true,
      hasSummary: false,
      youthValidationErrors: [
        "Select an open academy recruitment brief.",
        "Choose a projected tactical role.",
        "Choose a risk posture, including no material signal if appropriate.",
      ],
    });

    expect(status.canSubmit).toBe(false);
    expect(status.countsByStep.brief).toBe(1);
    expect(status.countsByStep.case).toBe(1);
    expect(status.countsByStep.risk).toBe(1);
    expect(status.countsByStep.final).toBe(0);
    expect(status.totalRemaining).toBe(3);
  });

  it("preserves the five-decision opening requirement before the first file", () => {
    const status = buildReportWriterStatus({
      mode: "opening",
      hasObservations: true,
      hasFreshEvidence: true,
      hasSummary: false,
      initialAssessmentReady: false,
      openingDecisionCount: 5,
    });

    expect(status.canSubmit).toBe(false);
    expect(status.countsByStep.assessment).toBe(5);
    expect(status.totalRemaining).toBe(5);
  });
});
