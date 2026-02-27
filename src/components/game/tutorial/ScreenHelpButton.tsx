"use client";

import { useTutorialStore } from "@/stores/tutorialStore";
import { useGameStore } from "@/stores/gameStore";
import { getScreenGuide } from "./screenGuides";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ScreenHelpButton — small "?" button that opens the per-screen guide.
 *
 * Positioned absolutely in the top-right corner of its nearest positioned
 * ancestor. Only renders when the current screen has a defined guide.
 *
 * Place this component inside a container that has `position: relative`
 * (or equivalent Tailwind `relative` class).
 */
export function ScreenHelpButton() {
  const openScreenGuide = useTutorialStore((s) => s.openScreenGuide);
  const currentScreen = useGameStore((s) => s.currentScreen);

  // Only render when a guide exists for the current screen.
  const guide = getScreenGuide(currentScreen);
  if (!guide) return null;

  return (
    <button
      onClick={() => openScreenGuide(currentScreen)}
      aria-label="Open screen guide"
      title="Screen guide"
      style={{ zIndex: 40 }}
      className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-zinc-700 text-sm font-bold text-zinc-300 transition hover:bg-zinc-600 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
    >
      ?
    </button>
  );
}
