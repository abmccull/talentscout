import { describe, expect, it } from "vitest";

import { getGuidedMilestoneInstruction } from "@/components/game/tutorial/guidedMilestoneInstruction";

describe("guided milestone blocker copy", () => {
  it("names the phase advance required before the standout control exists", () => {
    expect(getGuidedMilestoneInstruction({
      milestoneId: "flaggedBreakthrough",
      currentScreen: "observation",
      observationState: "active",
      observationPhaseIndex: 0,
    })).toBe("Select Next phase to keep watching for the key moment.");
  });

  it("names the exact standout classification action once it is available", () => {
    expect(getGuidedMilestoneInstruction({
      milestoneId: "flaggedBreakthrough",
      currentScreen: "observation",
      observationState: "active",
      observationPhaseIndex: 1,
    })).toBe("Select Flag moment on the Standout card, then choose Promising.");
  });

  it("names the exact reflection action when the session is blocked there", () => {
    expect(getGuidedMilestoneInstruction({
      milestoneId: "completedMatch",
      currentScreen: "observation",
      observationState: "reflection",
    })).toBe("Complete Reflection to lock the read and the remaining doubt.");
  });

  it("names the mandatory half-time decision before phase advance", () => {
    expect(getGuidedMilestoneInstruction({
      milestoneId: "completedMatch",
      currentScreen: "observation",
      observationState: "active",
      observationIsHalfTime: true,
      observationHalftimeApproach: null,
    })).toBe("Choose how to watch the second half: confirm, challenge, or broaden the first read.");

    expect(getGuidedMilestoneInstruction({
      milestoneId: "completedMatch",
      currentScreen: "observation",
      observationState: "active",
      observationIsHalfTime: true,
      observationHalftimeApproach: "challenge",
    })).toBe("Select Next phase to apply your second-half plan.");
  });
});
