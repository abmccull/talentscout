"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  ArrowRight,
  Award,
  BookOpen,
  CircleAlert,
  Handshake,
  HeartHandshake,
  Search,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import type { CareerMoment, CareerMomentCategory } from "@/engine/career/careerMoments";
import { careerMomentSfx } from "@/lib/audio/audioDirector";
import { useAudio } from "@/lib/audio/useAudio";
import { useSettingsStore } from "@/stores/settingsStore";

export interface CareerMomentOverlayProps {
  moment: CareerMoment;
  onDismiss: () => void;
  onOpenArchive: () => void;
}

const ICONS: Record<CareerMomentCategory, typeof Search> = {
  discovery: Search,
  conviction: ShieldAlert,
  vindication: Award,
  failure: CircleAlert,
  betrayal: Handshake,
  comeback: Sparkles,
  promotion: HeartHandshake,
  farewell: BookOpen,
};

const PALETTES: Record<CareerMoment["tone"], {
  border: string;
  glow: string;
  ink: string;
  wash: string;
}> = {
  positive: {
    border: "border-emerald-300/35",
    glow: "shadow-emerald-500/15",
    ink: "text-emerald-200",
    wash: "from-emerald-500/20 via-zinc-950/95 to-zinc-950",
  },
  mixed: {
    border: "border-amber-300/35",
    glow: "shadow-amber-500/15",
    ink: "text-amber-200",
    wash: "from-amber-500/20 via-zinc-950/95 to-zinc-950",
  },
  negative: {
    border: "border-rose-300/35",
    glow: "shadow-rose-500/15",
    ink: "text-rose-200",
    wash: "from-rose-500/20 via-zinc-950/95 to-zinc-950",
  },
  tense: {
    border: "border-orange-300/35",
    glow: "shadow-orange-500/15",
    ink: "text-orange-200",
    wash: "from-orange-500/20 via-zinc-950/95 to-zinc-950",
  },
  reflective: {
    border: "border-sky-300/35",
    glow: "shadow-sky-500/15",
    ink: "text-sky-200",
    wash: "from-sky-500/20 via-zinc-950/95 to-zinc-950",
  },
};

function humanize(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}

/** Accessible, text-authoritative delivery for a persisted career moment. */
export function CareerMomentOverlay({
  moment,
  onDismiss,
  onOpenArchive,
}: CareerMomentOverlayProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const { playSFX, volumes } = useAudio();
  const reducedMotion = useSettingsStore((state) =>
    state.reducedMotion || state.cinematicMoments === "reduced"
  );
  const emotionalAudioCues = useSettingsStore((state) => state.emotionalAudioCues);
  const palette = PALETTES[moment.tone];
  const Icon = ICONS[moment.category];
  const dateLabel = `Season ${moment.occurredAt.season}, Week ${moment.occurredAt.week}`;
  const magnitudeLabel = humanize(moment.magnitude);
  const categoryLabel = humanize(moment.category);
  const atmosphericMarks = useMemo(
    () => Array.from({ length: 7 }, (_, index) => `${moment.presentationSeed}:${index}`),
    [moment.presentationSeed],
  );

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    continueRef.current?.focus();
    const dialog = dialogRef.current;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const controls = [...dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )];
      if (controls.length === 0) {
        event.preventDefault();
        return;
      }
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (previousFocus && document.contains(previousFocus)) previousFocus.focus();
    };
  }, [onDismiss]);

  useEffect(() => {
    if (!emotionalAudioCues || volumes.muted) return;
    playSFX(careerMomentSfx(moment.cue));
  }, [emotionalAudioCues, moment.cue, playSFX, volumes.muted]);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 px-4 py-8 backdrop-blur-md"
      data-testid="career-moment-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="career-moment-title"
        aria-describedby="career-moment-summary"
        className={`relative w-full max-w-2xl overflow-hidden rounded-3xl border bg-gradient-to-br ${palette.border} ${palette.wash} shadow-2xl ${palette.glow}`}
      >
        {!reducedMotion && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            {atmosphericMarks.map((key, index) => (
              <span
                key={key}
                className="absolute h-px w-24 bg-white/10 motion-safe:animate-pulse"
                style={{
                  left: `${8 + index * 13}%`,
                  top: `${12 + (index * 19) % 74}%`,
                  transform: `rotate(${index % 2 === 0 ? -12 : 9}deg)`,
                  animationDelay: `${index * 180}ms`,
                }}
              />
            ))}
          </div>
        )}

        <div className="relative p-6 sm:p-9">
          <div className="flex items-start justify-between gap-5">
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/30 ${palette.ink}`}>
              <Icon size={28} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.17em] text-zinc-400">
                <span className={palette.ink}>{categoryLabel}</span>
                <span aria-hidden="true">·</span>
                <span>{magnitudeLabel}</span>
                <span aria-hidden="true">·</span>
                <span>{dateLabel}</span>
              </div>
              <h2 id="career-moment-title" className="mt-3 text-2xl font-black tracking-tight text-white sm:text-4xl">
                {moment.title}
              </h2>
            </div>
          </div>

          <div className="mt-7 rounded-2xl border border-white/10 bg-black/25 p-5 sm:p-6">
            <p id="career-moment-summary" className="text-base leading-7 text-zinc-200 sm:text-lg">
              {moment.summary}
            </p>
            {moment.stakeholderIds.length > 0 && (
              <p className="mt-4 text-xs leading-5 text-zinc-400">
                {moment.stakeholderIds.length} persistent stakeholder{moment.stakeholderIds.length === 1 ? " is" : "s are"} connected to this outcome. Their future reactions may change.
              </p>
            )}
          </div>

          <p className="sr-only" aria-live="polite">
            Career moment: {moment.title}. {moment.summary}
          </p>

          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onOpenArchive}
              className="min-h-11 rounded-xl border border-white/15 px-4 text-sm font-semibold text-zinc-200 transition hover:border-white/30 hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
            >
              Open career archive
            </button>
            <button
              ref={continueRef}
              type="button"
              onClick={onDismiss}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-zinc-950 transition hover:bg-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
            >
              Continue
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
