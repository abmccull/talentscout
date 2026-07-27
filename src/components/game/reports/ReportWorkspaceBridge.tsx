"use client";

import { ArrowRight, FileCheck, GitCompareArrows, Landmark, LineChart, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type {
  ReportWorkspaceAction,
  ReportWorkspaceLane,
  ReportWorkspaceViewModel,
} from "./reportWorkspaceModel";

interface ReportWorkspaceBridgeProps {
  viewModel: ReportWorkspaceViewModel;
  onAction: (action: ReportWorkspaceAction) => void;
  onCompare: () => void;
  onClearComparison: () => void;
  onPlanScouting: () => void;
}

const TONE_CLASSES: Record<ReportWorkspaceLane["items"][number]["tone"], string> = {
  emerald: "border-emerald-400/20 bg-emerald-400/[0.06]",
  amber: "border-amber-400/20 bg-amber-400/[0.06]",
  sky: "border-sky-400/20 bg-sky-400/[0.06]",
};

const LANE_ICONS = {
  actionRequired: FileCheck,
  awaitingResponse: Landmark,
  livingConsequences: LineChart,
} as const;

const LIFECYCLE_STEPS = [
  {
    id: "file",
    title: "File",
    body: "Turn live evidence into a recommendation with an audience, risk stance, and next step.",
  },
  {
    id: "response",
    title: "Club response",
    body: "A club, client, or partner decides whether your case is strong enough to act on.",
  },
  {
    id: "consequence",
    title: "Consequence",
    body: "That decision becomes part of the player's path and your long-term credibility.",
  },
] as const;

function ActionButton({
  action,
  onAction,
}: {
  action: ReportWorkspaceAction;
  onAction: (action: ReportWorkspaceAction) => void;
}) {
  if (action.kind === "openStaffQueue") {
    return (
      <a
        href="#report-staff-queue"
        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold text-zinc-200 transition hover:border-emerald-400/30 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 motion-reduce:transition-none"
      >
        {action.label}
      </a>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-11 border-white/10 bg-black/20 text-zinc-100 hover:border-emerald-400/30 hover:bg-emerald-400/[0.08] motion-reduce:transition-none"
      onClick={() => onAction(action)}
    >
      {action.label}
    </Button>
  );
}

export function ReportWorkspaceBridge({
  viewModel,
  onAction,
  onCompare,
  onClearComparison,
  onPlanScouting,
}: ReportWorkspaceBridgeProps) {
  const featuredArtifact = viewModel.featuredArtifact;
  const hasFiledArtifact = featuredArtifact !== null;
  const hasLaneItems = viewModel.lanes.some((lane) => lane.items.length > 0);
  const showCompactLifecycle = !hasFiledArtifact && !hasLaneItems;

  return (
    <section
      className="mb-6 space-y-5"
      data-testid="reports-command-deck"
      aria-labelledby="reports-command-deck-title"
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <article className="overflow-hidden rounded-2xl border border-emerald-400/20 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.14),transparent_38%),linear-gradient(180deg,rgba(16,21,27,0.98),rgba(11,16,21,0.98))] p-5 shadow-2xl shadow-black/20">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                Current report artifact
              </p>
              <h2 id="reports-command-deck-title" className="mt-2 text-2xl font-bold text-white">
                {featuredArtifact ? featuredArtifact.playerName : "No filed artifact yet"}
              </h2>
              <p className="mt-1 text-sm text-zinc-300">
                {featuredArtifact
                  ? `${featuredArtifact.artifactLabel}. Keep the audience, risk, and next accountability step visible before you archive the report.`
                  : "Observe a player, file the first accountable recommendation, and this workspace will keep the downstream trail in one place."}
              </p>
            </div>
            {featuredArtifact && (
              <Badge variant="secondary" className="border border-emerald-400/20 bg-emerald-400/10 text-emerald-100">
                Craft {featuredArtifact.qualityScore}/100
              </Badge>
            )}
          </div>

          {featuredArtifact ? (
            <>
              <div className="mt-4 rounded-xl border border-white/10 bg-[linear-gradient(180deg,rgba(9,12,16,0.94),rgba(14,18,23,0.96))] p-4">
                <p className="text-sm leading-6 text-zinc-200">{featuredArtifact.summary}</p>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Audience</dt>
                    <dd className="mt-1 text-sm font-semibold text-white">{featuredArtifact.audience}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Target club</dt>
                    <dd className="mt-1 text-sm font-semibold text-white">{featuredArtifact.targetClub}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Need</dt>
                    <dd className="mt-1 text-sm font-semibold text-white">{featuredArtifact.need}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Primary risk</dt>
                    <dd className="mt-1 text-sm font-semibold text-white">{featuredArtifact.risk}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Confidence</dt>
                    <dd className="mt-1 text-sm font-semibold text-white">{featuredArtifact.confidence}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Recommended action</dt>
                    <dd className="mt-1 text-sm font-semibold text-white">{featuredArtifact.recommendedAction}</dd>
                  </div>
                </dl>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-zinc-300">
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                    {featuredArtifact.conviction}
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                    {featuredArtifact.evidenceCount} evidence points
                  </span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                    {featuredArtifact.unknownCount} open unknowns
                  </span>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Next follow-up</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-300">{featuredArtifact.followUp}</p>
                </div>
                <Button
                  type="button"
                  className="min-h-11 bg-emerald-400 text-zinc-950 hover:bg-emerald-300 motion-reduce:transition-none"
                  onClick={() => onAction(featuredArtifact.primaryAction)}
                >
                  {featuredArtifact.primaryAction.label}
                  <ArrowRight size={16} className="ml-2" aria-hidden="true" />
                </Button>
              </div>
            </>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-emerald-400/25 bg-[linear-gradient(180deg,rgba(8,11,15,0.94),rgba(14,18,23,0.98))] p-5">
              <p className="text-sm leading-6 text-zinc-300">
                The first professional artifact appears once a live look becomes a filed recommendation.
                Start with the question that matters, then decide when the evidence is strong enough to put your name behind it.
              </p>
              <div className="relative mt-4 overflow-hidden rounded-xl border border-white/10 bg-[repeating-linear-gradient(180deg,rgba(255,255,255,0.025)_0,rgba(255,255,255,0.025)_1px,transparent_1px,transparent_2.4rem)] p-4">
                <div className="pointer-events-none absolute inset-y-0 left-5 w-px bg-emerald-400/15" aria-hidden="true" />
                <div className="relative pl-5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
                    Opening question
                  </p>
                  <p className="mt-2 text-base font-semibold leading-6 text-white">
                    What would make this prospect worth your name?
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    Create the evidence first. Audience, role, risk, and conviction remain deliberately blank until you have something real to defend.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    <span>Audience unset</span>
                    <span>Role unset</span>
                    <span>Conviction untested</span>
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <Button
                  type="button"
                  className="min-h-11 bg-emerald-400 text-zinc-950 hover:bg-emerald-300 motion-reduce:transition-none"
                  onClick={onPlanScouting}
                >
                  Plan the first live look
                  <ArrowRight size={16} className="ml-2" aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}
        </article>

        <section
          className="rounded-2xl border border-sky-400/12 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.08),transparent_38%),linear-gradient(180deg,rgba(18,24,31,0.98),rgba(12,16,22,0.98))] p-4 sm:p-5"
          aria-labelledby="reports-comparison-tray-title"
          data-testid="reports-comparison-tray"
          data-tutorial-id={showCompactLifecycle ? "reporthistory-list" : undefined}
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300">
              <GitCompareArrows size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="reports-comparison-tray-title" className="text-base font-semibold text-white">
                {showCompactLifecycle ? "Report traffic" : "Comparison tray"}
              </h2>
              <p className="mt-1 text-sm leading-6 text-zinc-300">
                {showCompactLifecycle
                  ? "This opens as a single professional trail: file the case, watch the response, and then live with the consequence."
                  : viewModel.comparisonSummary}
              </p>
              {!showCompactLifecycle && (
                <p className="mt-3 text-xs text-zinc-500">{viewModel.archiveSummary}</p>
              )}
            </div>
          </div>
          {showCompactLifecycle ? (
            <ol className="mt-4 space-y-3" aria-label="Report lifecycle">
              {LIFECYCLE_STEPS.map((step, index) => (
                <li
                  key={step.id}
                  className="workspace-interactive flex gap-3 rounded-xl border border-white/8 bg-black/25 p-3"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] text-xs font-semibold text-emerald-200">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{step.title}</p>
                    <p className="mt-1 text-sm leading-6 text-zinc-400">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                className="min-h-11 bg-emerald-400 text-zinc-950 hover:bg-emerald-300 motion-reduce:transition-none"
                onClick={onCompare}
                disabled={!viewModel.comparisonReady}
              >
                {viewModel.comparisonCtaLabel}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-11 border-white/10 bg-black/20 text-zinc-100 hover:border-emerald-400/30 hover:bg-emerald-400/[0.08] motion-reduce:transition-none"
                onClick={onClearComparison}
              >
                Clear tray
              </Button>
            </div>
          )}
        </section>
      </div>

      {!showCompactLifecycle && (
        <section aria-labelledby="reports-accountability-lanes-title" className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert size={16} className="text-emerald-300" aria-hidden="true" />
          <h2 id="reports-accountability-lanes-title" className="text-base font-semibold text-white">
            Accountability lanes
          </h2>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          {viewModel.lanes.map((lane) => {
            const LaneIcon = LANE_ICONS[lane.id];
            const laneHasItems = lane.items.length > 0;
            return (
              <section
                key={lane.id}
                className={laneHasItems
                  ? "rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(18,24,31,0.98),rgba(12,16,22,0.98))] p-4 sm:p-5"
                  : "rounded-2xl border border-white/[0.07] bg-black/30 p-4 sm:p-5"}
                aria-labelledby={`reports-lane-${lane.id}`}
              >
                <div className="flex items-start gap-3">
                  <span className={laneHasItems ? "mt-0.5 text-emerald-300" : "mt-0.5 text-zinc-500"}>
                    <LaneIcon size={17} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 id={`reports-lane-${lane.id}`} className="text-base font-semibold text-white">
                      {lane.title}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-zinc-400">{lane.description}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-3">
                  {!laneHasItems ? (
                    <div className="rounded-xl border border-dashed border-white/[0.09] bg-black/15 p-4">
                      <p className="font-semibold text-zinc-300">{lane.emptyTitle}</p>
                      <p className="mt-1 text-sm leading-6 text-zinc-500">{lane.emptyBody}</p>
                    </div>
                  ) : (
                    lane.items.map((item) => (
                      <article
                        key={item.id}
                        className={`workspace-interactive rounded-xl border p-4 ${TONE_CLASSES[item.tone]}`}
                      >
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          {item.eyebrow}
                        </p>
                        <p className="mt-2 text-sm font-semibold text-white">{item.title}</p>
                        <p className="mt-2 text-sm leading-6 text-zinc-300">{item.body}</p>
                        <p className="mt-3 text-xs text-zinc-500">{item.meta}</p>
                        {item.action && (
                          <div className="mt-4">
                            <ActionButton action={item.action} onAction={onAction} />
                          </div>
                        )}
                      </article>
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
        </section>
      )}
    </section>
  );
}
