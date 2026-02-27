"use client";

/**
 * GuidedChecklist — persistent collapsible panel (bottom-right) that tracks
 * the player's 10 first-week milestones.
 *
 * Renders only while `guidedSessionActive` is true.
 * Auto-collapses when the player is on the "match" screen.
 * Shows a brief celebration message when all milestones are completed.
 */

import { useState, useEffect } from "react";
import {
  CheckCircle2,
  Circle,
  ChevronUp,
  ChevronDown,
  ArrowRight,
} from "lucide-react";
import { useTutorialStore } from "@/stores/tutorialStore";
import { useGameStore, type GameScreen } from "@/stores/gameStore";
import {
  GUIDED_MILESTONES,
  getCompletedCount,
  getTotalCount,
} from "./guidedSession";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const NON_GAME_SCREENS = new Set(["mainMenu", "newGame", "scenarioSelect", "hallOfFame", "demoEnd"]);

export function GuidedChecklist() {
  const guidedSessionActive = useTutorialStore((s) => s.guidedSessionActive);
  const guidedMilestones = useTutorialStore((s) => s.guidedMilestones);
  const skipGuidedSession = useTutorialStore((s) => s.skipGuidedSession);

  const currentScreen = useGameStore((s) => s.currentScreen);
  const gameState = useGameStore((s) => s.gameState);
  const setScreen = useGameStore((s) => s.setScreen);

  const [isExpanded, setIsExpanded] = useState(true);
  const [showCelebration, setShowCelebration] = useState(false);

  const completedCount = getCompletedCount(guidedMilestones);
  const totalCount = getTotalCount();
  const allDone = completedCount === totalCount;

  // Auto-collapse on the match screen to keep the UI clear during play.
  useEffect(() => {
    if (currentScreen === "match") {
      setIsExpanded(false);
    }
  }, [currentScreen]);

  // Show a brief celebration when all milestones are completed.
  useEffect(() => {
    if (allDone && guidedSessionActive) {
      setShowCelebration(true);
      const id = window.setTimeout(() => {
        setShowCelebration(false);
      }, 3000);
      return () => window.clearTimeout(id);
    }
  }, [allDone, guidedSessionActive]);

  // All hooks must appear before any early return.
  if (!guidedSessionActive) return null;
  if (!gameState || NON_GAME_SCREENS.has(currentScreen)) return null;

  // ---------------------------------------------------------------------------
  // Celebration overlay (briefly shown when all 10 milestones are complete)
  // ---------------------------------------------------------------------------

  if (showCelebration) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 w-70 rounded-xl border border-emerald-700/60 bg-zinc-900 p-5 shadow-2xl"
      >
        <div className="flex items-center gap-3">
          <CheckCircle2
            className="h-7 w-7 shrink-0 text-emerald-400"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-bold text-white">First week complete!</p>
            <p className="mt-0.5 text-xs text-zinc-400">
              You know the basics. Now go find your first star.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Collapsed pill
  // ---------------------------------------------------------------------------

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        aria-label={`First Week progress: ${completedCount} of ${totalCount} complete. Click to expand.`}
        className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 shadow-lg transition hover:border-zinc-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
      >
        <span className="text-sm font-semibold text-white">
          First Week:{" "}
          <span className="text-emerald-400">
            {completedCount}/{totalCount}
          </span>
        </span>
        <ChevronUp className="h-4 w-4 text-zinc-400" aria-hidden="true" />
      </button>
    );
  }

  // ---------------------------------------------------------------------------
  // Expanded checklist panel
  // ---------------------------------------------------------------------------

  return (
    <section
      aria-label="First Week checklist"
      className="fixed bottom-4 right-4 z-50 w-[280px] rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <span className="text-sm font-bold text-white">First Week</span>
          <span className="ml-2 text-sm text-emerald-400">
            {completedCount}/{totalCount}
          </span>
        </div>
        <button
          onClick={() => setIsExpanded(false)}
          aria-label="Collapse checklist"
          className="rounded p-1 text-zinc-400 transition hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
        >
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {/* Milestone list */}
      <ul role="list" className="divide-y divide-zinc-800 px-2 py-1">
        {GUIDED_MILESTONES.map((milestone) => {
          const done = guidedMilestones[milestone.id] === true;
          const targetScreen = milestone.screen as GameScreen;

          return (
            <li
              key={milestone.id}
              className="flex items-center gap-3 px-2 py-2.5"
            >
              {/* Completion icon */}
              {done ? (
                <CheckCircle2
                  className="h-4 w-4 shrink-0 text-emerald-500"
                  aria-hidden="true"
                />
              ) : (
                <Circle
                  className="h-4 w-4 shrink-0 text-zinc-600"
                  aria-hidden="true"
                />
              )}

              {/* Title */}
              <span
                className={`flex-1 text-xs leading-snug ${
                  done ? "text-zinc-500 line-through" : "text-zinc-200"
                }`}
              >
                {milestone.title}
              </span>

              {/* Go button — only shown for incomplete milestones */}
              {!done && (
                <button
                  onClick={() => setScreen(targetScreen)}
                  aria-label={`Go to ${milestone.title}`}
                  className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs font-medium text-emerald-400 transition hover:bg-zinc-800 hover:text-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
                >
                  Go
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {/* Footer — skip link */}
      <div className="border-t border-zinc-800 px-4 py-2.5">
        <button
          onClick={skipGuidedSession}
          className="text-xs text-zinc-500 underline-offset-2 transition hover:text-zinc-300 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500"
        >
          Skip Tutorial
        </button>
      </div>
    </section>
  );
}
