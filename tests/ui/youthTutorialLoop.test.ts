import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { getGuidedMilestoneInstruction } from "@/components/game/tutorial/guidedMilestoneInstruction";
import { getYouthGuidedMilestones } from "@/components/game/tutorial/guidedSession";
import {
  createEmptyGuidedMilestones,
  getDiscoveryHookMilestoneOrder,
  useTutorialStore,
} from "@/stores/tutorialStore";

const YOUTH_SCREEN_SOURCES: Record<string, string[]> = {
  observation: [
    "src/components/game/ObservationScreen.tsx",
    "src/components/game/ReflectionScreen.tsx",
  ],
  openingDiscovery: ["src/components/game/OpeningDiscoveryScreen.tsx"],
  reportWriter: [
    "src/components/game/ReportWriter.tsx",
    "src/components/game/report-writer/ReportFinalReview.tsx",
  ],
  calendar: ["src/components/game/CalendarScreen.tsx"],
};

function sourceMentionsTutorialId(files: string[], target: string): boolean {
  return files.some((file) => {
    const contents = readFileSync(join(process.cwd(), file), "utf8");
    return contents.includes(`"${target}"`) || contents.includes(`\`${target}\``);
  });
}

beforeEach(() => {
  useTutorialStore.setState({
    dismissed: false,
    guidedSessionActive: false,
    guidedSessionForcedReplay: false,
    guidedSessionCompleted: false,
    guidedSessionKind: "discoveryHook",
    guidedMilestones: createEmptyGuidedMilestones(),
    currentGuidedTask: null,
  });
});

describe("youth day-to-day guided loop", () => {
  it("encodes Watch, discovery, first assessment, then Planner from a fresh start", () => {
    const order = getDiscoveryHookMilestoneOrder();
    expect(order).toEqual([
      "attendedMatch",
      "focusedPlayer",
      "flaggedBreakthrough",
      "completedMatch",
      "resolvedOpeningDiscovery",
      "wroteReport",
      "submittedReport",
      "advancedWeek",
    ]);

    const completeIndex = order.indexOf("completedMatch");
    const discoveryIndex = order.indexOf("resolvedOpeningDiscovery");
    const wroteIndex = order.indexOf("wroteReport");
    expect(discoveryIndex).toBe(completeIndex + 1);
    expect(wroteIndex).toBe(discoveryIndex + 1);

    useTutorialStore.getState().startGuidedSession(false, "discoveryHook");
    expect(useTutorialStore.getState().currentGuidedTask).toBe("attendedMatch");

    for (const milestone of order) {
      expect(useTutorialStore.getState().currentGuidedTask).toBe(milestone);
      useTutorialStore.getState().completeMilestone(milestone);
    }

    expect(useTutorialStore.getState().currentGuidedTask).toBeNull();
    expect(useTutorialStore.getState().guidedSessionActive).toBe(false);
  });

  it("names the live controls for each youth beat", () => {
    expect(getGuidedMilestoneInstruction({
      milestoneId: "attendedMatch",
      currentScreen: "observation",
      isYouthDiscoveryHook: true,
    })).toMatch(/Start the live session/i);
    expect(getGuidedMilestoneInstruction({
      milestoneId: "focusedPlayer",
      currentScreen: "observation",
      isYouthDiscoveryHook: true,
    })).toBe("Choose your prospect in Players in view, then choose a lens under Your attention.");
    expect(getGuidedMilestoneInstruction({
      milestoneId: "flaggedBreakthrough",
      currentScreen: "observation",
      observationPhaseIndex: 1,
      isYouthDiscoveryHook: true,
    })).toBe("Flag a moment from your lead, then choose the reaction the evidence deserves.");
    expect(getGuidedMilestoneInstruction({
      milestoneId: "completedMatch",
      currentScreen: "observation",
      observationState: "reflection",
      isYouthDiscoveryHook: true,
    })).toBe("Select Complete Reflection to lock the read and the remaining doubt.");
    expect(getGuidedMilestoneInstruction({
      milestoneId: "resolvedOpeningDiscovery",
      currentScreen: "openingDiscovery",
      isYouthDiscoveryHook: true,
    })).toMatch(/who hears the name/i);
    expect(getGuidedMilestoneInstruction({
      milestoneId: "wroteReport",
      currentScreen: "reportWriter",
      isYouthDiscoveryHook: true,
    })).toMatch(/five assessment decisions/i);
    expect(getGuidedMilestoneInstruction({
      milestoneId: "submittedReport",
      currentScreen: "reportWriter",
      isYouthDiscoveryHook: true,
    })).toBe("Select File initial assessment once the five decisions are ready.");
    expect(getGuidedMilestoneInstruction({
      milestoneId: "advancedWeek",
      currentScreen: "calendar",
      isYouthDiscoveryHook: true,
    })).toBe("Advance the week to let the plan play out.");
  });

  it("points every youth highlight at a real control and drops notebook leftover copy", () => {
    const youthCopy = getYouthGuidedMilestones()
      .map((milestone) => `${milestone.mentorText} ${milestone.mentorTextFreelance}`)
      .join("\n");
    expect(youthCopy).not.toMatch(/notebook|write the name down|File the name/i);

    for (const milestone of getYouthGuidedMilestones()) {
      const targets = typeof milestone.target === "string"
        ? [milestone.target]
        : [...milestone.target];
      const files = YOUTH_SCREEN_SOURCES[milestone.screen];
      expect(files, `${milestone.id} claims unknown screen ${milestone.screen}`).toBeDefined();
      const missing = targets.filter((target) => !sourceMentionsTutorialId(files, target));
      expect(missing, `${milestone.id} missing ${missing.join(", ")} on ${milestone.screen}`).toEqual([]);
    }
  });
});
