"use client";

import type { ReactNode } from "react";
import { Binoculars, CalendarClock, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

type JourneyTone = "plan" | "context" | "outcome";

const TONE_STYLES: Record<
  JourneyTone,
  { marker: string; eyebrow: string; border: string; icon: typeof CalendarClock }
> = {
  plan: {
    marker: "border-blue-400/50 bg-blue-400/15 text-blue-200",
    eyebrow: "text-blue-300",
    border: "border-blue-400/20",
    icon: CalendarClock,
  },
  context: {
    marker: "border-amber-400/50 bg-amber-400/15 text-amber-200",
    eyebrow: "text-amber-300",
    border: "border-amber-400/20",
    icon: Binoculars,
  },
  outcome: {
    marker: "border-emerald-400/50 bg-emerald-400/15 text-emerald-200",
    eyebrow: "text-emerald-300",
    border: "border-emerald-400/20",
    icon: Sparkles,
  },
};

export function WeekJourney({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <ol className="space-y-4" aria-label={label}>
      {children}
    </ol>
  );
}

export function WeekJourneyBeat({
  step,
  eyebrow,
  title,
  tone,
  children,
}: {
  step: 1 | 2 | 3;
  eyebrow: string;
  title: string;
  tone: JourneyTone;
  children: ReactNode;
}) {
  const prefersReducedMotion = useReducedMotion();
  const style = TONE_STYLES[tone];
  const Icon = style.icon;

  return (
    <motion.li
      data-testid={`week-journey-beat-${step}`}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        prefersReducedMotion
          ? { duration: 0 }
          : { duration: 0.22, delay: (step - 1) * 0.06, ease: "easeOut" }
      }
      className={`relative overflow-hidden rounded-xl border ${style.border} bg-zinc-950/72 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.18)] backdrop-blur-sm sm:p-5`}
    >
      <div className="flex min-w-0 items-start gap-3 sm:gap-4">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${style.marker}`}
          aria-hidden="true"
        >
          <Icon size={17} strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className={`text-[10px] font-bold uppercase tracking-[0.16em] ${style.eyebrow}`}>
              {step}. {eyebrow}
            </span>
            <h3 className="text-base font-semibold text-white sm:text-lg">{title}</h3>
          </div>
          <div className="mt-3 min-w-0">{children}</div>
        </div>
      </div>
    </motion.li>
  );
}

export function WeekProgressMeter({
  currentDay,
  isComplete,
}: {
  currentDay: number;
  isComplete: boolean;
}) {
  const prefersReducedMotion = useReducedMotion();
  const completedDays = isComplete ? 7 : Math.max(0, Math.min(7, currentDay));
  const visibleDay = isComplete ? 7 : Math.max(1, Math.min(7, currentDay + 1));
  const percentage = isComplete ? 100 : (visibleDay / 7) * 100;

  return (
    <div className="w-full min-w-0 sm:max-w-xs">
      <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px] font-medium">
        <span className="text-zinc-300">
          {isComplete ? "Week complete" : `Day ${visibleDay} of 7`}
        </span>
        <span className="text-zinc-400">{completedDays} completed</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full border border-white/10 bg-zinc-900"
        role="progressbar"
        aria-label="Weekly journey progress"
        aria-valuemin={0}
        aria-valuemax={7}
        aria-valuenow={isComplete ? 7 : visibleDay}
        aria-valuetext={isComplete ? "All 7 days complete" : `Viewing day ${visibleDay} of 7`}
      >
        <motion.div
          data-testid="weekly-progress-fill"
          data-reduced-motion={prefersReducedMotion ? "true" : "false"}
          className="h-full rounded-full bg-gradient-to-r from-emerald-600 via-emerald-400 to-amber-300"
          initial={false}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.2, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
