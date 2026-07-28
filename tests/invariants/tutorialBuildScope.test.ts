import { beforeEach, describe, expect, it } from "vitest";

import {
  isTutorialSequenceAvailableForBuild,
} from "@/stores/gameScreenScope";
import { useTutorialStore } from "@/stores/tutorialStore";

beforeEach(() => {
  useTutorialStore.setState({
    currentStep: 0,
    currentSequence: null,
    completedSequences: new Set(["ahaMoment:regional"]),
    tutorialActive: false,
    dismissed: false,
    pendingSequence: null,
    guidedSessionActive: false,
    guidedSessionForcedReplay: false,
    guidedSessionCompleted: false,
    guidedSessionKind: "firstWeek",
    guidedMilestones: {
      viewedDashboard: false,
      openedCalendar: false,
      scheduledActivity: false,
      advancedWeek: false,
      attendedMatch: false,
      focusedPlayer: false,
      flaggedBreakthrough: false,
      completedMatch: false,
      wroteReport: false,
      submittedReport: false,
      checkedInbox: false,
    },
    currentGuidedTask: "viewedDashboard",
    visitedScreens: new Set(),
    activeScreenGuide: null,
    screenGuideStep: 0,
    dismissedHints: new Set(),
    activeHint: null,
    pendingScreenGuide: null,
    discoveredFeatures: new Set(),
    mentorName: "Margaret Chen",
    mentorTitle: "Director of Recruitment",
  });
});

describe("tutorial build scope", () => {
  it("derives sequence availability from specialization and screen scope", () => {
    expect(isTutorialSequenceAvailableForBuild("onboarding:youth:club")).toBe(true);
    expect(isTutorialSequenceAvailableForBuild("careerProgression")).toBe(true);
    expect(isTutorialSequenceAvailableForBuild("firstTravel")).toBe(true);

    expect(isTutorialSequenceAvailableForBuild("onboarding:firstTeam:club")).toBe(false);
    expect(isTutorialSequenceAvailableForBuild("onboarding:regional:freelance")).toBe(false);
    expect(isTutorialSequenceAvailableForBuild("ahaMoment:data")).toBe(false);
    expect(isTutorialSequenceAvailableForBuild("firstMatch")).toBe(false);
  });

  it("suppresses unsupported sequences without dropping persisted completion ids", () => {
    const tutorial = useTutorialStore.getState();

    tutorial.startSequence("onboarding:firstTeam:club");
    expect(useTutorialStore.getState().currentSequence).toBeNull();
    expect(useTutorialStore.getState().tutorialActive).toBe(false);

    tutorial.queueSequence("ahaMoment:regional");
    expect(useTutorialStore.getState().pendingSequence).toBeNull();
    expect(useTutorialStore.getState().completedSequences.has("ahaMoment:regional")).toBe(true);

    tutorial.startSequence("careerProgression");
    expect(useTutorialStore.getState().currentSequence).toBe("careerProgression");
    expect(useTutorialStore.getState().tutorialActive).toBe(true);
  });
});
