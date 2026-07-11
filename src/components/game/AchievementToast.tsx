"use client";

import { useEffect, useRef, useState } from "react";
import { useAchievementStore } from "@/stores/achievementStore";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { useAudio } from "@/lib/audio/useAudio";

const AUTO_DISMISS_MS = 3600;

interface ToastContentProps {
  achievementId: string;
  queuedCount: number;
  onDismiss: () => void;
}

function ToastCard({
  achievementId,
  queuedCount,
  onDismiss,
}: ToastContentProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { playSFX } = useAudio();

  const achievement = ACHIEVEMENTS.find((a) => a.id === achievementId);

  useEffect(() => {
    playSFX("achievement");
    const id = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(id);
  }, [playSFX]);

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
      aria-atomic="true"
      aria-label={`Achievement unlocked: ${achievement.name}`}
      style={{
        transform: visible ? "translateY(0)" : "translateY(-12px)",
        opacity: visible ? 1 : 0,
        transition: "transform 220ms ease-out, opacity 220ms ease-out",
      }}
      className="pointer-events-none w-[min(22rem,calc(100vw-1rem))] rounded-2xl border border-zinc-700/80 bg-zinc-950/95 p-3 shadow-2xl backdrop-blur"
    >
      <div className="mb-2 flex items-start gap-2">
        <span
          className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/15 text-base"
          aria-hidden="true"
        >
          {achievement.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Achievement
            </span>
            {queuedCount > 0 && (
              <span className="rounded-full border border-zinc-700 bg-zinc-900/80 px-2 py-0.5 text-[10px] font-medium text-zinc-300">
                +{queuedCount} more
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-sm font-bold text-white">
            {achievement.name}
          </p>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss achievement notification"
          className="pointer-events-auto -mr-2 -mt-2 flex h-10 w-10 items-center justify-center rounded-xl text-zinc-400 transition hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
        >
          <svg
            viewBox="0 0 16 16"
            fill="currentColor"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </button>
      </div>

      <p className="hidden text-xs leading-relaxed text-zinc-300 sm:block">
        {achievement.description}
      </p>

      <div
        className="mt-3 hidden h-1 overflow-hidden rounded-full bg-zinc-800 sm:block"
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

export function AchievementToast() {
  const pendingToasts = useAchievementStore((s) => s.pendingToasts);
  const dismissAllToasts = useAchievementStore((s) => s.dismissAllToasts);

  const currentId = pendingToasts[0] ?? null;

  if (!currentId) return null;

  return (
    <>
      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to   { width: 0%;   }
        }
      `}</style>

      <div
        className="pointer-events-none fixed left-1/2 top-16 z-50 flex -translate-x-1/2 flex-col items-center gap-3 px-2 sm:bottom-5 sm:left-auto sm:right-5 sm:top-auto sm:translate-x-0 sm:items-end"
        aria-live="polite"
        aria-atomic="true"
      >
        <ToastCard
          key={currentId}
          achievementId={currentId}
          queuedCount={Math.max(0, pendingToasts.length - 1)}
          onDismiss={dismissAllToasts}
        />
      </div>
    </>
  );
}
