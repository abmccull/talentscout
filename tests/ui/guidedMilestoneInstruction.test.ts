import { describe, expect, it } from "vitest";

import { getGuidedMilestoneInstruction } from "@/components/game/tutorial/guidedMilestoneInstruction";

describe("guided milestone blocker copy", () => {
  it("names the exact standout classification action", () => {
    expect(getGuidedMilestoneInstruction({
      milestoneId: "flaggedBreakthrough",
      currentScreen: "observation",
      observationState: "active",
    })).toBe("Flag the standout moment, then classify it as Promising.");
  });

  it("names the exact reflection action when the session is blocked there", () => {
    expect(getGuidedMilestoneInstruction({
      milestoneId: "completedMatch",
      currentScreen: "observation",
      observationState: "reflection",
    })).toBe("Complete Reflection to lock the read and the remaining doubt.");
  });
});
