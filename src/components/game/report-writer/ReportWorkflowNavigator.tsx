"use client";

import { CheckCircle2, Circle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { canOpenReportWorkflowStep } from "@/components/game/reportWriterMode";

import type { SectionNavigatorItem } from "./shared";

interface ReportWorkflowNavigatorProps {
  decisionsRemaining: number;
  completedSectionCount: number;
  requiredSectionCount: number;
  previousReportRevision?: number;
  nextSectionTask?: SectionNavigatorItem;
  activeSectionId: string | null;
  sectionNavigatorItems: SectionNavigatorItem[];
  nextRequiredStepId: string | null;
  onOpenSection: (item: SectionNavigatorItem) => void;
}

export function ReportWorkflowNavigator({
  decisionsRemaining,
  completedSectionCount,
  requiredSectionCount,
  previousReportRevision,
  nextSectionTask,
  activeSectionId,
  sectionNavigatorItems,
  nextRequiredStepId,
  onOpenSection,
}: ReportWorkflowNavigatorProps) {
  return (
    <section className="sticky top-2 z-30 mb-4" aria-label="Report progress">
      <div className="rounded-2xl border border-white/10 bg-[#0d1216]/95 p-3 shadow-2xl shadow-black/45 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
              Report progress
            </p>
            <Badge
              variant="outline"
              className={
                decisionsRemaining === 0
                  ? "border-emerald-400/30 text-emerald-100"
                  : "border-amber-400/30 text-amber-100"
              }
            >
              {decisionsRemaining} decision{decisionsRemaining === 1 ? "" : "s"}{" "}
              remaining
            </Badge>
            <span className="text-xs text-zinc-400">
              {completedSectionCount}/{requiredSectionCount} ready
            </span>
            {typeof previousReportRevision === "number" && (
              <span className="text-xs text-zinc-400">
                Revision {previousReportRevision + 1}
              </span>
            )}
          </div>
          {nextSectionTask && activeSectionId !== nextSectionTask.id && (
            <button
              type="button"
              onClick={() => onOpenSection(nextSectionTask)}
              className="min-h-10 rounded-lg border border-emerald-400/35 bg-emerald-400/10 px-3 text-xs font-semibold text-emerald-100 transition hover:border-emerald-300/50 hover:bg-emerald-400/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
            >
              Continue: {nextSectionTask.label}
            </button>
          )}
        </div>

        <div
          className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5"
          role="tablist"
          aria-label="Report steps"
        >
          {sectionNavigatorItems.map((item) => {
            const Icon = item.complete ? CheckCircle2 : Circle;
            const canOpen = canOpenReportWorkflowStep(item, nextRequiredStepId);
            const active = item.id === activeSectionId;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                onClick={() => onOpenSection(item)}
                disabled={!canOpen}
                aria-selected={active}
                aria-current={active ? "step" : undefined}
                aria-label={`${item.label}. ${item.detail}`}
                className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border px-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 sm:gap-2 sm:px-3 ${
                  active
                    ? "border-emerald-300/55 bg-emerald-400/12 text-emerald-50"
                    : item.complete
                      ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200"
                      : "border-white/10 bg-white/[0.025] text-zinc-300 hover:border-white/20"
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <Icon size={14} aria-hidden="true" />
                <span className="sm:hidden">
                  {item.id === "case"
                    ? "Case"
                    : item.id === "final"
                      ? "Review"
                      : item.label}
                </span>
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            );
          })}
        </div>
        {sectionNavigatorItems.find((item) => item.id === activeSectionId) && (
          <p className="mt-2 text-[11px] leading-4 text-zinc-400" aria-live="polite">
            {sectionNavigatorItems.find((item) => item.id === activeSectionId)?.detail}
          </p>
        )}
      </div>
    </section>
  );
}
