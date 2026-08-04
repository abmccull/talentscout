"use client";

import { useId } from "react";
import { ArrowRight, Clock3, Compass, Sparkles } from "lucide-react";
import type { CareerEra } from "@/engine/events/careerEraDirector";

interface CareerEraThreadProps {
  era?: CareerEra;
  variant: "desk" | "career";
  onOpenProspect?: (playerId: string) => void;
  onOpenWorld?: () => void;
}

const VARIANT_STYLES = {
  desk: {
    shell: "border-emerald-300/25 bg-[radial-gradient(circle_at_12%_0%,rgba(52,211,153,0.16),transparent_38%),linear-gradient(135deg,rgba(14,24,22,0.98),rgba(10,13,17,0.98))]",
    eyebrow: "text-emerald-200",
    icon: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200",
    line: "from-emerald-300/70 via-amber-300/50 to-transparent",
    action: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/15",
  },
  career: {
    shell: "border-amber-300/25 bg-[radial-gradient(circle_at_88%_0%,rgba(251,191,36,0.14),transparent_38%),linear-gradient(135deg,rgba(24,20,15,0.98),rgba(10,13,17,0.98))]",
    eyebrow: "text-amber-200",
    icon: "border-amber-300/25 bg-amber-300/10 text-amber-200",
    line: "from-amber-300/70 via-emerald-300/50 to-transparent",
    action: "border-amber-300/30 bg-amber-300/10 text-amber-100 hover:bg-amber-300/15",
  },
} as const;

function dateLabel(era: CareerEra): string {
  return era.startedAt.season === era.endsAt.season
    ? `Season ${era.startedAt.season}, weeks ${era.startedAt.week}-${era.endsAt.week}`
    : `S${era.startedAt.season} W${era.startedAt.week} to S${era.endsAt.season} W${era.endsAt.week}`;
}

export default function CareerEraThread({
  era,
  variant,
  onOpenProspect,
  onOpenWorld,
}: CareerEraThreadProps) {
  const headingId = useId();
  if (!era) return null;
  const styles = VARIANT_STYLES[variant];
  return (
    <section
      aria-labelledby={headingId}
      data-testid={`${variant}-career-era-thread`}
      className={`relative overflow-hidden rounded-2xl border p-4 shadow-2xl shadow-black/20 sm:p-5 ${styles.shell}`}
    >
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${styles.line}`} />
      <div className="flex items-start gap-3 sm:gap-4">
        <div className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${styles.icon}`}>
          {variant === "desk" ? <Compass className="h-5 w-5" aria-hidden /> : <Sparkles className="h-5 w-5" aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={`text-[10px] font-bold uppercase tracking-[0.22em] ${styles.eyebrow}`}>
              Active career thread
            </p>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-zinc-400">
              <Clock3 className="h-3.5 w-3.5" aria-hidden />
              {dateLabel(era)}
            </span>
          </div>
          <h2 id={headingId} className="mt-2 text-lg font-semibold tracking-tight text-white sm:text-xl">
            {era.title}
          </h2>
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-zinc-300">
            {era.premise}
          </p>
          <div className="mt-3 border-l-2 border-white/10 pl-3">
            <p className="text-xs font-medium leading-5 text-zinc-200">{era.deskPrompt}</p>
          </div>
          {(era.primaryProspectId || era.primaryCountryId) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {era.primaryProspectId && onOpenProspect && (
                <button
                  type="button"
                  onClick={() => onOpenProspect(era.primaryProspectId!)}
                  className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition motion-reduce:transition-none ${styles.action}`}
                >
                  Open linked case
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
              {era.primaryCountryId && onOpenWorld && (
                <button
                  type="button"
                  onClick={onOpenWorld}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.07] motion-reduce:transition-none"
                >
                  Open territory
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
