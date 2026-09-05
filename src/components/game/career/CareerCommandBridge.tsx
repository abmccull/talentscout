"use client";

import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScoutAvatar } from "@/components/game/ScoutAvatar";
import type { CareerWorkspaceViewModel } from "./careerWorkspaceModel";
import type { CareerFingerprintProjection } from "@/engine/career/fingerprint";

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

function signalColor(tone: string): string {
  if (tone === "red") return "text-red-200";
  if (tone === "amber") return "text-amber-200";
  return "text-zinc-200";
}

export function CareerCommandBridge({
  avatarId, scoutName, specializationLevel, reputation, careerTier, viewModel,
  fingerprint, onPlanWeek, opportunityActionLabel, onOpportunityAction, currentThread,
}: CareerCommandBridgeProps) {
  const [pressureHighlight, opportunityHighlight, callbackHighlight] = viewModel.highlights;

  return (
    <section className="mb-5 bg-[var(--surface)] p-4 sm:p-6" data-testid="career-command-bridge" aria-labelledby="career-command-bridge-title">
      <header className="flex items-start gap-4">
        <ScoutAvatar avatarId={avatarId} size={64} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-zinc-400">{viewModel.pathLabel.replace(/command bridge/i, "career")} · {viewModel.seasonLabel}</p>
          <h1 id="career-command-bridge-title" className="mt-1 font-editorial text-3xl text-white sm:text-4xl">{scoutName}</h1>
          <p className="mt-2 text-sm font-medium text-zinc-200" data-testid="career-role-title">{viewModel.roleTitle}</p>
          <p className="mt-1 text-sm text-zinc-400">{viewModel.roleBase}</p>
          <p className="mt-2 text-xs leading-5 text-zinc-400">Tier {careerTier} · {Math.round(reputation)} reputation · Youth mastery {specializationLevel}/20</p>
        </div>
      </header>

      <dl className="mt-5 divide-y divide-[var(--border)] border-y border-[var(--border)] sm:grid sm:grid-cols-3 sm:gap-5 sm:divide-y-0">
        {viewModel.signals.map((signal) => (
          <div key={signal.label} className="flex items-baseline justify-between gap-4 py-3 sm:block">
            <dt className="shrink-0 text-xs text-zinc-400">{signal.label}</dt>
            <dd className={`max-w-[70%] text-right text-sm font-medium sm:mt-1 sm:max-w-none sm:text-left ${signalColor(signal.tone)}`}>{signal.value}</dd>
          </div>
        ))}
      </dl>

      <section className="py-5" aria-labelledby="career-current-pressure">
        <h2 id="career-current-pressure" className="font-editorial text-2xl text-white">{pressureHighlight.title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">{pressureHighlight.body}</p>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">{pressureHighlight.meta}</p>
        <Button className="mt-4 min-h-11 w-full sm:w-auto" onClick={onPlanWeek}>
          Plan next week <ArrowRight size={16} aria-hidden="true" />
        </Button>
      </section>

      <div className="border-t border-[var(--border)] pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-zinc-400">{opportunityHighlight.label}</p>
            <h2 className="mt-1 text-base font-semibold text-white">{opportunityHighlight.title}</h2>
          </div>
          {opportunityActionLabel && onOpportunityAction && (
            <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={onOpportunityAction}>
              {opportunityActionLabel} <ArrowRight size={14} aria-hidden="true" />
            </Button>
          )}
        </div>
        <details className="mt-1">
          <summary className="min-h-11 cursor-pointer py-2 text-sm text-zinc-400">What this opportunity involves</summary>
          <p className="max-w-3xl text-sm leading-6 text-zinc-300">{opportunityHighlight.body}</p>
          <p className="mt-2 text-sm leading-6 text-zinc-400">{opportunityHighlight.meta}</p>
        </details>
      </div>

      <details className="mt-3 border-t border-[var(--border)] pt-3">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-zinc-300">Current career thread and people</summary>
        <div className="mt-3 space-y-5">
          {currentThread}
          <section aria-labelledby="career-recurring-cast">
            <h2 id="career-recurring-cast" className="font-editorial text-xl text-white">People shaping your career</h2>
            <dl className="mt-3 divide-y divide-[var(--border)]">
              {viewModel.recurringCast.map((item) => (
                <div key={item.id} className="py-3">
                  <dt className="text-xs text-zinc-400">{item.label}</dt>
                  <dd className="mt-1 text-sm font-semibold text-zinc-200">{item.title}</dd>
                  <dd className="mt-1 text-sm leading-6 text-zinc-400">{item.detail}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </details>

      <details className="mt-3 border-t border-[var(--border)] pt-3">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-zinc-300">Your record · {viewModel.timelinePreview.length} remembered {viewModel.timelinePreview.length === 1 ? "moment" : "moments"}</summary>
        <p className="mt-3 text-base font-semibold text-white">{callbackHighlight.title}</p>
        <p className="mt-1 text-sm leading-6 text-zinc-300">{callbackHighlight.body}</p>
        <p className="mt-1 text-xs leading-5 text-zinc-400">{callbackHighlight.meta}</p>
        {viewModel.timelinePreview.length > 0 && (
          <ol className="mt-4 divide-y divide-[var(--border)]">
            {viewModel.timelinePreview.map((entry) => (
              <li key={entry.id} className="py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-xs text-zinc-400">{entry.label}</p>
                  <span className="text-xs text-zinc-400">{entry.when}</span>
                </div>
                <h3 className="mt-1 text-sm font-semibold text-zinc-200">{entry.title}</h3>
                <p className="mt-1 text-sm leading-6 text-zinc-400">{entry.description}</p>
              </li>
            ))}
          </ol>
        )}
      </details>

      <details className="mt-3 border-t border-[var(--border)] pt-3">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-zinc-300">Career identity and role context</summary>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">{viewModel.framing}</p>
        <dl className="mt-3 divide-y divide-[var(--border)]">
          {viewModel.signals.map((signal) => (
            <div key={signal.label} className="py-3">
              <dt className="text-sm font-medium text-zinc-200">{signal.label}</dt>
              <dd className="mt-1 text-sm leading-6 text-zinc-400">{signal.detail}</dd>
            </div>
          ))}
        </dl>
        {fingerprint && (
          <section className="mt-5" aria-labelledby="career-fingerprint-title">
            <h2 id="career-fingerprint-title" className="font-editorial text-xl text-white">{fingerprint.title}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{fingerprint.summary}</p>
            <dl className="mt-3 divide-y divide-[var(--border)]">
              {fingerprint.labels.map((label) => (
                <div key={label.id} className="py-3">
                  <dt className="text-xs text-zinc-400">{label.label}</dt>
                  <dd className={`mt-1 text-sm font-medium ${signalColor(label.tone)}`}>{label.value}</dd>
                  <dd className="mt-1 text-sm leading-6 text-zinc-400">{label.detail}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </details>
    </section>
  );
}
