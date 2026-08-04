"use client";

import { ArrowRight, Brain, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DashboardActionTarget } from "@/engine/dashboard/types";
import type { DashboardWorkspaceModel } from "./dashboardWorkspaceModel";

interface DashboardIntelligencePanelProps {
  model: DashboardWorkspaceModel;
  onAction: (target: DashboardActionTarget) => void;
  onDismissInsight?: (insightId: string, fingerprint?: string) => void;
}

export default function DashboardIntelligencePanel({
  model,
  onAction,
  onDismissInsight,
}: DashboardIntelligencePanelProps) {
  return (
    <section
      aria-labelledby="dashboard-intelligence-title"
      className="rounded-2xl border border-white/10 bg-[#11161c]/95 p-5 shadow-2xl shadow-black/20"
    >
      <h3 id="dashboard-intelligence-title" className="text-base font-semibold text-white">
        Career intelligence
      </h3>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {model.careerThread && (
          <article className="rounded-xl border border-violet-300/15 bg-violet-300/[0.05] p-4">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-200">
              <History size={14} aria-hidden="true" />
              Career thread
            </p>
            <h4 className="mt-2 text-base font-semibold text-white">{model.careerThread.title}</h4>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{model.careerThread.summary}</p>
            {model.careerThread.actionTarget && (
              <Button
                type="button"
                variant="outline"
                className="mt-4 min-h-11"
                onClick={() => onAction(model.careerThread!.actionTarget!)}
              >
                Open source record
                <ArrowRight size={15} className="ml-2" aria-hidden="true" />
              </Button>
            )}
          </article>
        )}
        {model.insights.map((insight) => (
          <article key={insight.id} className="rounded-xl border border-sky-300/15 bg-sky-300/[0.05] p-4">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-200">
              <Brain size={14} aria-hidden="true" />
              Pattern · {Math.round(insight.confidence * 100)}% confidence
            </p>
            <h4 className="mt-2 text-base font-semibold text-white">{insight.title}</h4>
            <p className="mt-2 text-sm leading-6 text-zinc-300">{insight.summary}</p>
            <p className="mt-2 text-xs text-zinc-400">
              Supported by {insight.evidenceIds.length} historical records.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {insight.suggestedAction && (
                <Button type="button" variant="outline" onClick={() => onAction(insight.suggestedAction!)}>
                  Inspect evidence
                </Button>
              )}
              {onDismissInsight && (
                <Button type="button" variant="ghost" onClick={() => onDismissInsight(insight.id, insight.fingerprint)}>
                  Dismiss insight
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
      {model.recentlyResolved.length > 0 && (
        <p className="mt-4 text-xs text-zinc-400">
          {model.recentlyResolved.length} recently resolved dashboard {model.recentlyResolved.length === 1 ? "item" : "items"} retained for reference.
        </p>
      )}
    </section>
  );
}
