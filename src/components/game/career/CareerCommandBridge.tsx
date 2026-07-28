"use client";

import type { ReactNode } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  Clock3,
  Milestone,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScoutAvatar } from "@/components/game/ScoutAvatar";
import type { CareerWorkspaceViewModel } from "./careerWorkspaceModel";
import type { CareerFingerprintProjection } from "@/engine/career/fingerprint";
import { WorkspaceDisclosure } from "../workspace/WorkspaceDisclosure";

interface CareerCommandBridgeProps {
  avatarId: number;
  scoutName: string;
  specializationLevel: number;
  reputation: number;
  careerTier: number;
  viewModel: CareerWorkspaceViewModel;
  fingerprint?: CareerFingerprintProjection;
  onPlanWeek: () => void;
  opportunityActionLabel?: string;
  onOpportunityAction?: () => void;
  currentThread?: ReactNode;
}

const SIGNAL_TONES: Record<CareerWorkspaceViewModel["signals"][number]["tone"], string> = {
  emerald: "border-emerald-400/20 bg-emerald-400/[0.06]",
  amber: "border-amber-400/20 bg-amber-400/[0.06]",
  sky: "border-sky-400/20 bg-sky-400/[0.06]",
  red: "border-red-400/20 bg-red-400/[0.06]",
};

const HIGHLIGHT_TONES: Record<CareerWorkspaceViewModel["highlights"][number]["tone"], string> = {
  emerald: "border-emerald-400/20 bg-emerald-400/[0.06]",
  amber: "border-amber-400/20 bg-amber-400/[0.06]",
  sky: "border-sky-400/20 bg-sky-400/[0.06]",
  violet: "border-violet-400/20 bg-violet-400/[0.06]",
  red: "border-red-400/20 bg-red-400/[0.06]",
};

const HIGHLIGHT_RING_TONES: Record<CareerWorkspaceViewModel["highlights"][number]["tone"], string> = {
  emerald: "ring-emerald-300/25",
  amber: "ring-amber-300/25",
  sky: "ring-sky-300/25",
  violet: "ring-violet-300/25",
  red: "ring-red-300/25",
};

const FINGERPRINT_TONES: Record<CareerFingerprintProjection["labels"][number]["tone"], string> = {
  emerald: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
  amber: "border-amber-300/20 bg-amber-300/10 text-amber-100",
  sky: "border-sky-300/20 bg-sky-300/10 text-sky-100",
  violet: "border-violet-300/20 bg-violet-300/10 text-violet-100",
  red: "border-red-300/20 bg-red-300/10 text-red-100",
};

export function CareerCommandBridge({
  avatarId,
  scoutName,
  specializationLevel,
  reputation,
  careerTier,
  viewModel,
  fingerprint,
  onPlanWeek,
  opportunityActionLabel,
  onOpportunityAction,
  currentThread,
}: CareerCommandBridgeProps) {
  const [securitySignal, runwaySignal, milestoneSignal] = viewModel.signals;
  const [pressureHighlight, opportunityHighlight, callbackHighlight] = viewModel.highlights;

  return (
    <section
      className="mb-5 overflow-hidden rounded-2xl border border-emerald-400/20 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.16),transparent_38%),linear-gradient(180deg,rgba(13,18,23,0.98),rgba(10,12,16,0.98))] p-4 shadow-2xl shadow-black/30 sm:p-6 lg:p-8"
      data-testid="career-command-bridge"
      aria-labelledby="career-command-bridge-title"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:gap-5">
        <div className="space-y-4">
          <div className="flex items-start gap-3 sm:gap-4">
            <ScoutAvatar avatarId={avatarId} size={64} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                  {viewModel.pathLabel}
                </p>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-zinc-300">
                  {viewModel.seasonLabel}
                </span>
              </div>
              <h1 id="career-command-bridge-title" className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {scoutName}
              </h1>
              <p
                className="mt-1 text-sm font-medium text-zinc-200"
                data-testid="career-role-title"
              >
                {viewModel.roleTitle}
              </p>
              <p className="mt-1 text-sm text-zinc-400">{viewModel.roleBase}</p>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">{viewModel.framing}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Badge variant="secondary" className="border border-emerald-400/25 bg-emerald-400/10 text-emerald-100">
                  Tier {careerTier}
                </Badge>
                <Badge variant="outline" className="border-white/10 bg-white/[0.06] text-zinc-200">
                  {Math.round(reputation)} reputation
                </Badge>
                <Badge variant="outline" className="border-amber-400/25 bg-amber-400/10 text-amber-100">
                  Youth mastery {specializationLevel}/20
                </Badge>
              </div>
            </div>
          </div>

          <div className="hidden gap-3 sm:grid sm:grid-cols-2 xl:grid-cols-3">
            {viewModel.signals.map((signal) => (
              <article key={signal.label} className={`rounded-xl border p-3.5 shadow-sm shadow-black/15 ${SIGNAL_TONES[signal.tone]}`}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                  {signal.label}
                </p>
                <p className="mt-1.5 text-sm font-semibold text-white">{signal.value}</p>
                <p className="mt-1.5 text-xs leading-5 text-zinc-300">{signal.detail}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-white/12 bg-black/35 p-4 ring-1 ring-white/6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
            Next command
          </p>
          <p className="mt-2 text-lg font-bold text-white">Plan the next week from the role you actually hold</p>
          <p className="mt-1 text-sm leading-6 text-zinc-300">
            The next itinerary should protect your seat, respect the money pressure, and move the strongest open question.
          </p>
          <dl className="mt-4 space-y-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
            <div className="flex items-start justify-between gap-3">
              <dt className="text-xs uppercase tracking-[0.14em] text-zinc-500">{securitySignal.label}</dt>
              <dd className="text-right text-sm font-semibold text-white">{securitySignal.value}</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-xs uppercase tracking-[0.14em] text-zinc-500">{runwaySignal.label}</dt>
              <dd className="text-right text-sm font-semibold text-white">{runwaySignal.value}</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-xs uppercase tracking-[0.14em] text-zinc-500">{milestoneSignal.label}</dt>
              <dd className="max-w-[65%] text-right text-sm font-semibold text-white">{milestoneSignal.value}</dd>
            </div>
          </dl>
          <Button
            className="mt-4 min-h-11 w-full bg-emerald-400 text-zinc-950 hover:bg-emerald-300 motion-reduce:transition-none"
            onClick={onPlanWeek}
          >
            Plan next week
            <ArrowRight size={16} className="ml-2" aria-hidden="true" />
          </Button>
          <p className="mt-2 text-xs text-zinc-400">
            Next action: turn this pressure into a deliberate week, not another passive review.
          </p>
        </div>
      </div>

      {fingerprint && (
        <>
          <div className="mt-4 lg:hidden">
            <WorkspaceDisclosure
              title="This career"
              eyebrow={fingerprint.title}
              description={fingerprint.summary}
              icon={<Milestone size={16} className="text-emerald-300" aria-hidden="true" />}
              summary={<span>{fingerprint.labels[2]?.value} · {fingerprint.labels[3]?.value}</span>}
              contentClassName="space-y-3"
            >
              <div className="grid gap-2">
                {fingerprint.labels.map((label) => (
                  <article key={label.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                        {label.label}
                      </p>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${FINGERPRINT_TONES[label.tone]}`}>
                        {label.value}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-zinc-400">{label.detail}</p>
                  </article>
                ))}
              </div>
            </WorkspaceDisclosure>
          </div>

          <div className="mt-4 hidden rounded-xl border border-white/12 bg-black/28 p-4 lg:block">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  This career
                </p>
                <p className="mt-1 text-base font-semibold text-white">{fingerprint.title}</p>
                <p className="mt-1 max-w-4xl text-sm leading-6 text-zinc-300">{fingerprint.summary}</p>
              </div>
              <div className="hidden shrink-0 xl:block">
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-zinc-400">
                  Distinct identity
                </span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {fingerprint.labels.map((label) => (
                <div
                  key={label.id}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    {label.label}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-white">{label.value}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="mt-4 grid gap-4 lg:mt-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <section aria-labelledby="career-bridge-highlights" className="space-y-3">
          <div className="flex items-center gap-2">
            <BriefcaseBusiness size={16} className="text-emerald-300" aria-hidden="true" />
            <h2 id="career-bridge-highlights" className="text-base font-semibold text-white">
              Command bridge
            </h2>
          </div>
          <div className="grid gap-3 lg:grid-cols-12">
            <article className={`rounded-xl border p-3.5 shadow-sm shadow-black/20 sm:p-4 lg:col-span-6 xl:col-span-5 ${HIGHLIGHT_TONES[pressureHighlight.tone]} ring-1 ${HIGHLIGHT_RING_TONES[pressureHighlight.tone]}`}>
              <div className="flex items-center gap-2">
                <Target size={15} className="text-white/80" aria-hidden="true" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-300">
                  {pressureHighlight.label}
                </p>
              </div>
              <p className="mt-2 text-sm font-semibold text-white">{pressureHighlight.title}</p>
              <p className="mt-2 text-xs leading-5 text-zinc-200 sm:text-sm sm:leading-6">{pressureHighlight.body}</p>
              <p className="mt-2 text-[11px] text-zinc-300/80 sm:mt-3 sm:text-xs">{pressureHighlight.meta}</p>
            </article>
            <div className="grid gap-3 sm:grid-cols-2 lg:col-span-6 xl:col-span-7">
              {[opportunityHighlight, callbackHighlight].map((highlight) => (
                <article key={highlight.id} className={`rounded-xl border p-3 shadow-sm shadow-black/15 sm:p-4 ${HIGHLIGHT_TONES[highlight.tone]}`}>
                  <div className="flex items-center gap-2">
                    {highlight.id === callbackHighlight.id
                      ? <Clock3 size={15} className="text-white/75" aria-hidden="true" />
                      : <Sparkles size={15} className="text-white/75" aria-hidden="true" />}
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                      {highlight.label}
                    </p>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-white">{highlight.title}</p>
                  <p className="mt-1.5 text-xs leading-5 text-zinc-300 sm:mt-2 sm:text-sm sm:leading-6">{highlight.body}</p>
                  <p className="mt-2 text-[11px] text-zinc-500 sm:mt-3 sm:text-xs">{highlight.meta}</p>
                  {highlight.id === opportunityHighlight.id
                    && opportunityActionLabel
                    && onOpportunityAction && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 min-h-10 w-full border-violet-300/25 bg-violet-300/10 text-violet-100 hover:bg-violet-300/15"
                      onClick={onOpportunityAction}
                    >
                      {opportunityActionLabel}
                      <ArrowRight size={14} className="ml-2" aria-hidden="true" />
                    </Button>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="lg:hidden">
            <WorkspaceDisclosure
              title="Career context"
              eyebrow="Recurring people and remembered calls"
              description="Open the current thread, the people shaping your seat, and the callbacks already attached to your record."
              icon={<Users size={16} className="text-emerald-300" aria-hidden="true" />}
              summary={<span>{viewModel.recurringCast.length} contacts · {viewModel.timelinePreview.length} callbacks</span>}
              open={false}
              contentClassName="space-y-4"
            >
              {currentThread}

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={15} className="text-emerald-300" aria-hidden="true" />
                  <h2 className="text-sm font-semibold text-white">Recurring cast</h2>
                </div>
                <div className="space-y-3">
                  {viewModel.recurringCast.map((item) => (
                    <article key={item.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                        {item.label}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-white">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-zinc-400">{item.detail}</p>
                    </article>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Clock3 size={15} className="text-violet-300" aria-hidden="true" />
                  <h2 className="text-sm font-semibold text-white">Living record</h2>
                </div>
                {viewModel.timelinePreview.length === 0 ? (
                  <p className="text-sm leading-6 text-zinc-400">
                    The first callback appears once a named player or formal review can be tied to your judgment.
                  </p>
                ) : (
                  <ol className="space-y-3">
                    {viewModel.timelinePreview.map((entry) => (
                      <li key={entry.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                              {entry.label}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-white">{entry.title}</p>
                          </div>
                          <span className="text-[11px] text-zinc-500">{entry.when}</span>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-zinc-400">{entry.description}</p>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </WorkspaceDisclosure>
          </div>

          <div className="hidden space-y-4 lg:block">
            {currentThread}

            <div className="rounded-xl border border-white/12 bg-black/28 p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck size={15} className="text-emerald-300" aria-hidden="true" />
                <h2 className="text-base font-semibold text-white">Recurring cast</h2>
              </div>
              <div className="mt-4 space-y-3">
                {viewModel.recurringCast.map((item) => (
                  <article key={item.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                      {item.label}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-white">{item.title}</p>
                    <p className="mt-1 text-xs leading-5 text-zinc-400">{item.detail}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-white/12 bg-black/28 p-4">
              <div className="flex items-center gap-2">
                <Clock3 size={15} className="text-violet-300" aria-hidden="true" />
                <h2 className="text-base font-semibold text-white">Living record</h2>
              </div>
              {viewModel.timelinePreview.length === 0 ? (
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  The first callback appears once a named player or formal review can be tied to your judgment.
                </p>
              ) : (
                <ol className="mt-4 space-y-3">
                  {viewModel.timelinePreview.map((entry) => (
                    <li key={entry.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                            {entry.label}
                          </p>
                          <p className="mt-1 text-sm font-semibold text-white">{entry.title}</p>
                        </div>
                        <span className="text-[11px] text-zinc-500">{entry.when}</span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-zinc-400">{entry.description}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
