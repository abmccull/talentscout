import { beforeEach, describe, expect, it } from "vitest";

import {
  useTutorialStore,
  type GuidedMilestoneId,
} from "@/stores/tutorialStore";

const DISCOVERY_MILESTONES: GuidedMilestoneId[] = [
  "attendedMatch",
  "focusedPlayer",
  "flaggedBreakthrough",
  "completedMatch",
  "wroteReport",
  "submittedReport",
  "checkedInbox",
  "openedCalendar",
  "scheduledActivity",
  "advancedWeek",
];

beforeEach(() => {
  useTutorialStore.setState({
    dismissed: true,
    guidedSessionActive: false,
    guidedSessionForcedReplay: false,
    guidedSessionCompleted: true,
    currentGuidedTask: null,
    activeScreenGuide: null,
    pendingScreenGuide: null,
  });
});

describe("forced guided-session replay", () => {
  it("keeps the normal one-time guard for experienced players", () => {
    useTutorialStore.getState().startGuidedSession(false, "discoveryHook");

    expect(useTutorialStore.getState()).toMatchObject({
      guidedSessionActive: false,
      guidedSessionForcedReplay: false,
      guidedSessionCompleted: true,
      dismissed: true,
    });
  });

  it("replays every discovery milestone without clearing profile truth", () => {
    useTutorialStore.getState().startGuidedSession(
      false,
      "discoveryHook",
      { forceReplay: true },
    );

    expect(useTutorialStore.getState()).toMatchObject({
      guidedSessionActive: true,
      guidedSessionForcedReplay: true,
      guidedSessionCompleted: true,
      dismissed: true,
      currentGuidedTask: "attendedMatch",
    });

    for (const milestone of DISCOVERY_MILESTONES) {
      expect(useTutorialStore.getState().currentGuidedTask).toBe(milestone);
      useTutorialStore.getState().completeMilestone(milestone);
    }

    expect(useTutorialStore.getState()).toMatchObject({
      guidedSessionActive: false,
      guidedSessionForcedReplay: false,
      guidedSessionCompleted: true,
      dismissed: true,
      currentGuidedTask: null,
    });
  });

  it("allows replay overlays even after permanent dismissal", () => {
    useTutorialStore.getState().startGuidedSession(
      true,
      "discoveryHook",
      { forceReplay: true },
    );
    useTutorialStore.getState().openScreenGuide("calendar");
    useTutorialStore.getState().showHint({
      id: "replay-hint",
      message: "Replay guidance",
    });

    expect(useTutorialStore.getState().activeScreenGuide).toBe("calendar");
    expect(useTutorialStore.getState().activeHint?.id).toBe("replay-hint");

    useTutorialStore.getState().skipGuidedSession();
    expect(useTutorialStore.getState().guidedSessionForcedReplay).toBe(false);
    expect(useTutorialStore.getState().guidedSessionCompleted).toBe(true);
  });
});
