"use client";

import { ArrowRight, ChevronDown, GitCompareArrows } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlayerAvatar } from "../PlayerAvatar";
import type { ReportWorkspaceAction, ReportWorkspaceLane, ReportWorkspaceViewModel } from "./reportWorkspaceModel";

interface ReportWorkspaceBridgeProps {
  viewModel: ReportWorkspaceViewModel;
  comparisonCount?: number;
  onAction: (action: ReportWorkspaceAction) => void;
  onCompare: () => void;
  onClearComparison: () => void;
  onPlanScouting: () => void;
}

const LANE_LABELS: Record<ReportWorkspaceLane["id"], string> = {
  actionRequired: "Needs your decision",
  awaitingResponse: "Waiting on a club",
  livingConsequences: "Career outcomes",
};

function actionLabel(action: ReportWorkspaceAction): string {
  return action.kind === "openReport" && action.label === "Open full artifact" ? "Read report" : action.label;
}

function ActionButton({ action, onAction }: {
  action: ReportWorkspaceAction;
  onAction: (action: ReportWorkspaceAction) => void;
}) {
  if (action.kind === "openStaffQueue") {
    return <a href="#report-staff-queue"
      className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--primary)] underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300">
      {action.label}
    </a>;
  }
  return <Button type="button" variant="outline" className="min-h-11" onClick={() => onAction(action)}>
    {actionLabel(action)}
  </Button>;
}

export function ReportWorkspaceBridge({
  viewModel, comparisonCount = 0, onAction, onCompare, onClearComparison, onPlanScouting,
}: ReportWorkspaceBridgeProps) {
  const featured = viewModel.featuredArtifact;
  const activeLanes = viewModel.lanes.filter((lane) => lane.items.length > 0);
  return (
    <section className="mb-6 space-y-4" data-testid="reports-command-deck"
      data-tutorial-id={!featured ? "reporthistory-list" : undefined}
      aria-labelledby="reports-command-deck-title">
      {featured ? (
        <article className="border-y border-zinc-700/70 bg-[var(--surface)] px-4 py-5 sm:px-5">
          <div className="flex items-start gap-4">
            <PlayerAvatar playerId={featured.playerId} size={88} alt={featured.playerName} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.17em] text-[var(--primary)]">On your desk</p>
              <h2 id="reports-command-deck-title" className="mt-1 break-words font-editorial text-2xl text-zinc-100 sm:text-2xl">
                {featured.playerName}
              </h2>
              <p className="mt-1 text-sm leading-5 text-zinc-300">{featured.targetClub}</p>
              <p className="mt-2 text-xs leading-5 text-zinc-400">{featured.conviction} · Craft {featured.qualityScore}/100</p>
            </div>
          </div>
          <p className="mt-4 line-clamp-2 text-sm leading-6 text-zinc-200">{featured.summary}</p>
          <div className="mt-4 grid gap-3 border-t border-zinc-700/60 pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--primary)]">Next: {featured.recommendedAction}</p>
              <p className="mt-1 text-sm leading-5 text-zinc-400">{featured.followUp}</p>
            </div>
            <Button type="button" className="min-h-11 sm:shrink-0"
              onClick={() => onAction(featured.primaryAction)}>
              {actionLabel(featured.primaryAction)}
              <ArrowRight size={16} className="ml-2" aria-hidden="true" />
            </Button>
          </div>
          <details className="group mt-3">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs font-medium text-zinc-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 [&::-webkit-details-marker]:hidden">
              Recommendation details
              <ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <dl className="grid gap-x-5 gap-y-3 pb-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {([
                ["Audience", featured.audience], ["Recruitment need", featured.need],
                ["Risk", featured.risk], ["Confidence", featured.confidence],
                ["Evidence", `${featured.evidenceCount} saved points`],
                ["Still unknown", `${featured.unknownCount} questions`],
              ] as const).map(([label, value]) => (
                <div key={label}><dt className="text-xs text-zinc-400">{label}</dt><dd className="mt-1 leading-5 text-zinc-200">{value}</dd></div>
              ))}
            </dl>
          </details>
        </article>
      ) : (
        <article className="border-y border-zinc-800 py-6">
          <h2 id="reports-command-deck-title" className="text-xl font-semibold text-zinc-100">Your first report starts with a player.</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">Book a scouting visit, gather evidence, then put your judgment on record.</p>
          <Button type="button" className="mt-4 min-h-11" onClick={onPlanScouting}>
            Plan a scouting visit <ArrowRight size={16} className="ml-2" aria-hidden="true" />
          </Button>
        </article>
      )}

      {comparisonCount > 0 && (
        <section className="flex flex-col gap-3 border-l-2 border-[var(--primary)] bg-[var(--surface-selected)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          aria-labelledby="reports-comparison-tray-title" data-testid="reports-comparison-tray">
          <div className="min-w-0" role="status">
            <h2 id="reports-comparison-tray-title" className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <GitCompareArrows size={16} aria-hidden="true" /> {comparisonCount} report{comparisonCount === 1 ? "" : "s"} selected
            </h2>
            {comparisonCount === 1 && <p className="mt-1 text-xs text-zinc-400">Choose one more report from the archive.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="min-h-11" onClick={onCompare} disabled={!viewModel.comparisonReady}>
              {viewModel.comparisonCtaLabel}
            </Button>
            <Button type="button" variant="ghost" className="min-h-11" onClick={onClearComparison}>Clear selection</Button>
          </div>
        </section>
      )}

      {activeLanes.length > 0 && (
        <div className="divide-y divide-zinc-800 border-y border-zinc-800">
          {activeLanes.map((lane) => (
            <details key={lane.id} className="group" open={lane.id === "actionRequired"}>
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 [&::-webkit-details-marker]:hidden">
                <h3 className="text-sm font-semibold text-zinc-200">{LANE_LABELS[lane.id]} <span className="ml-2 font-normal text-zinc-400">{lane.items.length}</span></h3>
                <ChevronDown size={16} className="text-zinc-400 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="divide-y divide-zinc-800/70 pb-2">
                {lane.items.map((item) => (
                  <article key={item.id} className="grid gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[var(--primary)]">{item.eyebrow}</p>
                      <p className="mt-1 text-sm font-semibold text-zinc-100">{item.title}</p>
                      <p className="mt-1 text-sm leading-5 text-zinc-400">{item.body}</p>
                      <p className="mt-1 text-xs leading-5 text-zinc-400">{item.meta}</p>
                    </div>
                    {item.action && <ActionButton action={item.action} onAction={onAction} />}
                  </article>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
