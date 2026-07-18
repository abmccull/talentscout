import { describe, expect, it } from "vitest";

import {
  canOpenReportWorkflowStep,
  isConciseOpeningReportMode,
  resolveReportWorkflow,
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

  it("keeps the writer on the next unresolved decision and counts remaining choices", () => {
    const steps = [
      { id: "brief", complete: true, decisionsRemaining: 0 },
      { id: "case", complete: false, decisionsRemaining: 2 },
      { id: "risk", complete: false, decisionsRemaining: 1 },
      { id: "final", complete: false, decisionsRemaining: 0 },
    ];

    expect(resolveReportWorkflow(steps)).toEqual({
      activeStepId: "case",
      completedRequiredSteps: 1,
      decisionsRemaining: 3,
      nextRequiredStepId: "case",
      requiredSteps: 4,
    });
  });

  it("allows completed review but rejects skipping an unfinished future step", () => {
    const steps = [
      { id: "brief", complete: true },
      { id: "case", complete: false },
      { id: "risk", complete: false },
      { id: "dossier", complete: true, required: false },
    ];

    expect(resolveReportWorkflow(steps, "brief").activeStepId).toBe("brief");
    expect(resolveReportWorkflow(steps, "dossier").activeStepId).toBe("dossier");
    expect(resolveReportWorkflow(steps, "risk").activeStepId).toBe("case");
    expect(canOpenReportWorkflowStep(steps[0], "case")).toBe(true);
    expect(canOpenReportWorkflowStep(steps[2], "case")).toBe(false);
  });

  it("advances to final review once all report decisions are ready", () => {
    const steps = [
      { id: "brief", complete: true },
      { id: "case", complete: true },
      { id: "risk", complete: true },
      { id: "final", complete: true },
    ];

    expect(resolveReportWorkflow(steps)).toMatchObject({
      activeStepId: "final",
      completedRequiredSteps: 4,
      decisionsRemaining: 0,
      nextRequiredStepId: null,
    });
  });
});
