"use client";

import { useEffect, useRef, useState } from "react";
import { useAchievementStore } from "@/stores/achievementStore";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { useAudio } from "@/lib/audio/useAudio";
import { isAchievementAvailableForBuild } from "@/stores/gameScreenScope";

const AUTO_DISMISS_MS = 3600;

interface ToastContentProps {
  achievementIds: string[];
  onDismiss: () => void;
}

function ToastCard({
  achievementIds,
  onDismiss,
}: ToastContentProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { playSFX } = useAudio();

  const achievements = achievementIds
    .map((id) => ACHIEVEMENTS.find((achievement) => achievement.id === id))
    .filter((achievement): achievement is (typeof ACHIEVEMENTS)[number] => achievement !== undefined);
  const achievement = achievements[0];
  const visibleAchievements = achievements.slice(0, 3);
  const hiddenAchievementCount = Math.max(0, achievements.length - visibleAchievements.length);

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
      aria-label={`Achievements unlocked: ${achievements.map((item) => item.name).join(", ")}`}
      style={{
        transform: visible ? "translateY(0)" : "translateY(-12px)",
        transition: "transform 220ms ease-out",
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
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
              Achievement
            </span>
            {achievements.length > 1 && (
              <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-medium text-zinc-200">
                {achievements.length} unlocked
              </span>
            )}
          </div>
          <ul
            className="mt-1 space-y-0.5 text-sm font-bold text-white"
            aria-label="Unlocked achievements"
          >
            {visibleAchievements.map((item) => <li key={item.id}>{item.name}</li>)}
            {hiddenAchievementCount > 0 && (
              <li className="pt-0.5 text-xs font-medium text-zinc-300">
                +{hiddenAchievementCount} more recorded in Career
              </li>
            )}
          </ul>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss achievement notification"
          className="pointer-events-auto -mr-2 -mt-2 flex h-11 w-11 items-center justify-center rounded-xl text-zinc-400 transition hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
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

      {achievements.length === 1 && (
        <p className="hidden text-xs leading-relaxed text-zinc-300 sm:block">
          {achievement.description}
        </p>
      )}

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

  const availablePendingToasts = pendingToasts.filter(
    isAchievementAvailableForBuild,
  );
  const currentId = availablePendingToasts[0] ?? null;

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
        className="pointer-events-none fixed left-1/2 top-20 z-40 flex -translate-x-1/2 flex-col items-center gap-3 px-2 sm:bottom-5 sm:left-auto sm:right-5 sm:top-auto sm:translate-x-0 sm:items-end"
        aria-live="polite"
        aria-atomic="true"
      >
        <ToastCard
          key={availablePendingToasts.join("|")}
          achievementIds={availablePendingToasts}
          onDismiss={dismissAllToasts}
        />
      </div>
    </>
  );
}
