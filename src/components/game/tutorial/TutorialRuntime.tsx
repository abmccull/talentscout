"use client";

import { GuidedChecklist } from "@/components/game/tutorial/GuidedChecklist";
import { HintToast } from "@/components/game/tutorial/HintToast";
import { MentorOverlay } from "@/components/game/tutorial/MentorOverlay";
import { ScreenGuidePanel } from "@/components/game/tutorial/ScreenGuidePanel";
import { useTutorialStore } from "@/stores/tutorialStore";

/**
 * Owns tutorial-surface priority after a career starts, allowing the launch
 * menu to avoid downloading every guided overlay up front.
 */
export function TutorialRuntime() {
  const tutorialActive = useTutorialStore((state) => state.tutorialActive);
  const currentSequence = useTutorialStore((state) => state.currentSequence);
  const guidedSessionActive = useTutorialStore((state) => state.guidedSessionActive);
  const currentGuidedTask = useTutorialStore((state) => state.currentGuidedTask);
  const activeScreenGuide = useTutorialStore((state) => state.activeScreenGuide);
  const activeHint = useTutorialStore((state) => state.activeHint);

  const showMentorOverlay = Boolean(
    (tutorialActive && currentSequence) || (guidedSessionActive && currentGuidedTask),
  );
  const showScreenGuidePanel = !showMentorOverlay && activeScreenGuide != null;
  const showHintToast = !showMentorOverlay && !showScreenGuidePanel && activeHint != null;
  const showGuidedChecklist =
    guidedSessionActive && !showMentorOverlay && !showScreenGuidePanel && !showHintToast;

  return (
    <>
      {showMentorOverlay && <MentorOverlay />}
      {showScreenGuidePanel && <ScreenGuidePanel />}
      {showHintToast && <HintToast />}
      {showGuidedChecklist && <GuidedChecklist />}
    </>
  );
}
