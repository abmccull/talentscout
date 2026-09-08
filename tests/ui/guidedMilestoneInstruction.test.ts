import { describe, expect, it } from "vitest";

import { getGuidedMilestoneInstruction } from "@/components/game/tutorial/guidedMilestoneInstruction";

describe("guided milestone blocker copy", () => {
  it("invites an honest flag from the first phase", () => {
    expect(getGuidedMilestoneInstruction({
      milestoneId: "flaggedBreakthrough",
      currentScreen: "observation",
      observationState: "active",
      observationPhaseIndex: 0,
    })).toBe("Flag a moment from your lead, then choose the reaction the evidence deserves.");
  });

  it("keeps classification neutral in later phases", () => {
    expect(getGuidedMilestoneInstruction({
      milestoneId: "flaggedBreakthrough",
      currentScreen: "observation",
      observationState: "active",
      observationPhaseIndex: 1,
    })).toBe("Flag a moment from your lead, then choose the reaction the evidence deserves.");
  });

  it("names the exact reflection action when the session is blocked there", () => {
    expect(getGuidedMilestoneInstruction({
      milestoneId: "completedMatch",
      currentScreen: "observation",
      observationState: "reflection",
    })).toBe("Select Complete Reflection to lock the read and the remaining doubt.");
  });

  it("names the mandatory half-time decision before phase advance", () => {
    expect(getGuidedMilestoneInstruction({
      milestoneId: "completedMatch",
      currentScreen: "observation",
      observationState: "active",
      observationIsHalfTime: true,
      observationHalftimeApproach: null,
    })).toBe("Choose how to watch the second half: confirm, challenge, or broaden. Focus resets at halftime, so reapply a lens before the next phase.");

    expect(getGuidedMilestoneInstruction({
      milestoneId: "completedMatch",
      currentScreen: "observation",
      observationState: "active",
      observationIsHalfTime: true,
      observationHalftimeApproach: "challenge",
    })).toBe("Focus resets at halftime. Reapply a lens to the player you want to watch, then select Next phase.");
  });

  it("names the discovery call between Watch complete and the first report", () => {
    expect(getGuidedMilestoneInstruction({
      milestoneId: "resolvedOpeningDiscovery",
      currentScreen: "openingDiscovery",
      isYouthDiscoveryHook: true,
    })).toBe("Choose who hears the name: keep it private, call a club, or ask your source to verify.");
  });

  it("names File initial assessment on the youth first-report path", () => {
    expect(getGuidedMilestoneInstruction({
      milestoneId: "submittedReport",
      currentScreen: "reportWriter",
      isYouthDiscoveryHook: true,
    })).toBe("Select File initial assessment once the five decisions are ready.");

    expect(getGuidedMilestoneInstruction({
      milestoneId: "wroteReport",
      currentScreen: "reportWriter",
      isYouthDiscoveryHook: true,
    })).toMatch(/five assessment decisions/i);
  });
});
