"use client";

import { useEffect, useRef } from "react";
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

const TONE_INK: Record<CareerMoment["tone"], string> = {
  positive: "text-[var(--primary)]",
  mixed: "text-[var(--accent)]",
  negative: "text-[var(--signal-danger)]",
  tense: "text-[var(--accent)]",
  reflective: "text-[var(--signal-focus)]",
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
  const emotionalAudioCues = useSettingsStore((state) => state.emotionalAudioCues);
  const toneInk = TONE_INK[moment.tone];
  const Icon = ICONS[moment.category];
  const dateLabel = `Season ${moment.occurredAt.season}, Week ${moment.occurredAt.week}`;
  const magnitudeLabel = humanize(moment.magnitude);
  const categoryLabel = humanize(moment.category);

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
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 px-4 py-6"
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
        className="relative max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-sm border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]"
      >
        <div className="relative p-6 sm:p-9">
          <div className="flex items-start gap-3 sm:gap-5">
            <div className={`mt-1 shrink-0 ${toneInk}`}>
              <Icon size={24} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
                <span className={toneInk}>{categoryLabel}</span>
                <span aria-hidden="true">·</span>
                <span>{magnitudeLabel}</span>
                <span aria-hidden="true">·</span>
                <span>{dateLabel}</span>
              </div>
              <h2 id="career-moment-title" className="font-editorial mt-3 text-2xl leading-tight sm:text-4xl">
                {moment.title}
              </h2>
            </div>
          </div>

          <div className="mt-7 border-t border-[var(--border)] pt-6">
            <p id="career-moment-summary" className="text-base leading-7 sm:text-lg">
              {moment.summary}
            </p>
            {moment.stakeholderIds.length > 0 && (
              <p className="mt-4 text-sm leading-6 text-[var(--muted-foreground)]">
                {moment.stakeholderIds.length} professional relationship{moment.stakeholderIds.length === 1 ? " is" : "s are"} connected to this outcome. Future reactions may change.
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
              className="min-h-11 rounded-sm border border-[var(--border)] px-4 text-sm font-semibold transition hover:bg-[var(--surface-interactive)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-focus)]"
            >
              Open career archive
            </button>
            <button
              ref={continueRef}
              type="button"
              onClick={onDismiss}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-sm bg-[var(--primary)] px-5 text-sm font-semibold text-[var(--primary-foreground)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--signal-focus)]"
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
