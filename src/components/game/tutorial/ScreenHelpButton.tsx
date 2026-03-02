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
export function ScreenHelpButton() {
  const openScreenGuide = useTutorialStore((s) => s.openScreenGuide);
  const currentScreen = useGameStore((s) => s.currentScreen);
  const careerPath = useGameStore((s) => s.gameState?.scout.careerPath ?? "club");

  // Only render when a guide exists for the current screen.
  const guide = getScreenGuide(currentScreen);
  if (!guide) return null;

  const mentorName = careerPath === "independent" ? "Tommy" : "Margaret";

  return (
    <button
      onClick={() => openScreenGuide(currentScreen)}
      aria-label={`Ask ${mentorName} for help`}
      title={`Ask ${mentorName}`}
      style={{ zIndex: 40 }}
      className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-zinc-700/80 px-3 py-1.5 text-xs font-medium text-zinc-300 backdrop-blur-sm transition hover:bg-zinc-600 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
    >
      <span className="text-sm" aria-hidden="true">?</span>
      <span className="hidden sm:inline">Ask {mentorName}</span>
    </button>
  );
}
