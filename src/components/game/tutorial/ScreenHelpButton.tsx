"use client";

import { useTutorialStore } from "@/stores/tutorialStore";
import { useGameStore } from "@/stores/gameStore";
import { getScreenGuide } from "./screenGuides";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ScreenHelpButton — "Ask Margaret" / "Ask Tommy" button that opens the
 * per-screen guide with a character-driven label.
 *
 * Shows the relevant mentor based on the player's career path:
 * - Club path → Margaret Chen
 * - Independent path → Tommy Reyes
 *
 * Positioned absolutely in the top-right corner of its nearest positioned
 * ancestor. Only renders when the current screen has a defined guide.
 */
interface ScreenHelpButtonProps {
  placement?: "content" | "mobileHeader";
}

export function ScreenHelpButton({ placement = "content" }: ScreenHelpButtonProps) {
  const openScreenGuide = useTutorialStore((s) => s.openScreenGuide);
  const tutorialActive = useTutorialStore((s) => s.tutorialActive);
  const currentSequence = useTutorialStore((s) => s.currentSequence);
  const guidedSessionActive = useTutorialStore((s) => s.guidedSessionActive);
  const activeScreenGuide = useTutorialStore((s) => s.activeScreenGuide);
  const activeHint = useTutorialStore((s) => s.activeHint);
  const currentScreen = useGameStore((s) => s.currentScreen);
  const careerPath = useGameStore((s) => s.gameState?.scout.careerPath ?? "club");

  // Only render when a guide exists for the current screen.
  const guide = getScreenGuide(currentScreen);
  if (!guide) return null;
  const inObservationReportContext = new Set(["observation", "reportWriter", "reportHistory"]).has(currentScreen);
  const guidanceSurfaceActive = (tutorialActive && currentSequence)
    || guidedSessionActive
    || activeScreenGuide != null
    || activeHint != null;
  if (inObservationReportContext && guidanceSurfaceActive) return null;

  const mentorName = careerPath === "independent" ? "Tommy" : "Margaret";
  const isMobileHeader = placement === "mobileHeader";

  return (
    <button
      onClick={() => openScreenGuide(currentScreen)}
      aria-label={`Ask ${mentorName} for help`}
      title={`Ask ${mentorName}`}
      className={isMobileHeader
        ? "flex h-11 w-11 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 md:hidden"
        : "absolute right-3 top-3 z-40 hidden min-h-11 items-center gap-1.5 rounded-full bg-zinc-700/90 px-4 text-xs font-medium text-zinc-200 backdrop-blur-sm transition hover:bg-zinc-600 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 md:flex"}
    >
      <span className="text-base font-semibold" aria-hidden="true">?</span>
      {!isMobileHeader && <span>Ask {mentorName}</span>}
    </button>
  );
}
