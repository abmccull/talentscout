"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { X, ArrowRight, BookOpen } from "lucide-react";
import { useTutorialStore } from "@/stores/tutorialStore";
import { useGameStore } from "@/stores/gameStore";
import type { GameScreen } from "@/stores/gameStore";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUTO_DISMISS_MS = 15_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns up to two uppercase initials from a name string. */
function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

// ---------------------------------------------------------------------------
// HintToast
// ---------------------------------------------------------------------------

/**
 * HintToast — fixed bottom-left contextual hint notification.
 *
 * Reads `activeHint` and `dismissHint` from tutorialStore and `setScreen`
 * from gameStore. Slides up on mount and auto-dismisses after 15 seconds.
 * Renders null when there is no active hint.
 */
export function HintToast() {
  const activeHint = useTutorialStore((s) => s.activeHint);
  const dismissHint = useTutorialStore((s) => s.dismissHint);
  const mentorName = useTutorialStore((s) => s.mentorName);
  const setScreen = useGameStore((s) => s.setScreen);

  // Slide-up animation state — starts false, set to true after first frame.
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // All hooks must be called before any early return.
  const hintId = activeHint?.id ?? null;

  const handleDismiss = useCallback(() => {
    if (hintId !== null) {
      dismissHint(hintId);
    }
  }, [hintId, dismissHint]);

  // Trigger slide-up animation on mount (or when a new hint appears).
  useEffect(() => {
    if (hintId === null) return;
    setVisible(false);
    const rafId = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(rafId);
  }, [hintId]);

  // Auto-dismiss after AUTO_DISMISS_MS.
  useEffect(() => {
    if (hintId === null) return;
    timerRef.current = setTimeout(handleDismiss, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [hintId, handleDismiss]);

  if (!activeHint) return null;

  const initials = getInitials(mentorName);

  function handleCta() {
    if (!activeHint?.cta) return;
    setScreen(activeHint.cta.screen as GameScreen);
    handleDismiss();
  }

  return (
    <div
      className="pointer-events-none fixed bottom-4 left-4 z-60 w-full max-w-[360px]"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        className="pointer-events-auto"
        style={{
          transform: visible ? "translateY(0)" : "translateY(calc(100% + 16px))",
          transition: "transform 350ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div
          role="status"
          aria-label={`Hint from ${mentorName}`}
          className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl"
        >
          {/* Header row: avatar + dismiss button */}
          <div className="mb-3 flex items-center gap-2.5">
            {/* Mentor avatar */}
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white"
              aria-hidden="true"
            >
              {initials}
            </span>

            {/* Mentor name */}
            <span className="text-xs font-semibold text-emerald-400">
              {mentorName}
            </span>

            {/* Dismiss button */}
            <button
              onClick={handleDismiss}
              aria-label="Dismiss hint"
              className="ml-auto flex h-6 w-6 items-center justify-center rounded text-zinc-500 transition-colors hover:text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          {/* Hint message */}
          <p className="text-sm leading-relaxed text-zinc-300">
            {activeHint.message}
          </p>

          {/* Action row: CTA button + Learn more link */}
          {(activeHint.cta ?? activeHint.handbookChapter) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {activeHint.cta && (
                <button
                  onClick={handleCta}
                  className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                >
                  {activeHint.cta.label}
                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </button>
              )}

              {activeHint.handbookChapter && (
                <button
                  onClick={() => {
                    setScreen("handbook");
                    handleDismiss();
                  }}
                  className="flex items-center gap-1 text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                >
                  <BookOpen className="h-3 w-3" aria-hidden="true" />
                  Learn more
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
