"use client";

import { useEffect, useRef, useState } from "react";
import { useAchievementStore } from "@/stores/achievementStore";
import { ACHIEVEMENTS } from "@/lib/achievements";

// =============================================================================
// CONSTANTS
// =============================================================================

const AUTO_DISMISS_MS = 5000;

// =============================================================================
// TYPES
// =============================================================================

interface ToastContentProps {
  achievementId: string;
  onDismiss: () => void;
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/**
 * Individual toast card. Handles its own auto-dismiss timer and slide-in
 * animation. Rendered only when there is a pending toast to show.
 */
function ToastCard({ achievementId, onDismiss }: ToastContentProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const achievement = ACHIEVEMENTS.find((a) => a.id === achievementId);

  // Trigger slide-in after mount (next tick so CSS transition fires).
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  // Auto-dismiss after AUTO_DISMISS_MS.
  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [onDismiss]);

  if (!achievement) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Achievement unlocked: ${achievement.name}`}
      style={{
        transform: visible ? "translateX(0)" : "translateX(calc(100% + 24px))",
        transition: "transform 400ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
      className="w-80 rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-2xl"
    >
      {/* Header row */}
      <div className="mb-2 flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-base"
          aria-hidden="true"
        >
          {achievement.icon}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
          Achievement Unlocked
        </span>
        <button
          onClick={onDismiss}
          aria-label="Dismiss achievement notification"
          className="ml-auto flex h-5 w-5 items-center justify-center rounded text-zinc-500 transition hover:text-zinc-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
        >
          <svg
            viewBox="0 0 16 16"
            fill="currentColor"
            className="h-3 w-3"
            aria-hidden="true"
          >
            <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </button>
      </div>

      {/* Achievement name */}
      <p className="text-sm font-bold text-white">{achievement.name}</p>

      {/* Achievement description */}
      <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
        {achievement.description}
      </p>

      {/* Progress bar (drains over AUTO_DISMISS_MS) */}
      <div
        className="mt-3 h-0.5 overflow-hidden rounded-full bg-zinc-700"
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full bg-emerald-500"
          style={{
            animation: `shrink ${AUTO_DISMISS_MS}ms linear forwards`,
          }}
        />
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * AchievementToast — fixed overlay that displays the first pending achievement
 * toast from the achievementStore. Slides in from the bottom-right corner and
 * auto-dismisses after 5 seconds.
 *
 * Renders null when there are no pending toasts.
 */
export function AchievementToast() {
  const pendingToasts = useAchievementStore((s) => s.pendingToasts);
  const dismissToast = useAchievementStore((s) => s.dismissToast);

  // Show the first pending toast only. Once dismissed, the next will appear.
  const currentId = pendingToasts[0] ?? null;

  if (!currentId) return null;

  return (
    <>
      {/* Keyframe for the progress bar drain animation */}
      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to   { width: 0%;   }
        }
      `}</style>

      {/* Fixed container — bottom-right, above most content (z-50) */}
      <div
        className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="pointer-events-auto">
          <ToastCard
            key={currentId}
            achievementId={currentId}
            onDismiss={() => dismissToast(currentId)}
          />
        </div>
      </div>
    </>
  );
}
