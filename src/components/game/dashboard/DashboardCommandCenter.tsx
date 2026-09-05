"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { ArrowRight, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DashboardActionTarget, DashboardPriorityItem } from "./dashboardPriorityModel";
import type { DashboardWorkspaceModel } from "./dashboardWorkspaceModel";
import { DashboardPriorityCard } from "./DashboardPriorityCard";
const DashboardIntelligencePanel = dynamic(() => import("./DashboardIntelligencePanel"), { ssr: false });
interface DashboardCommandCenterProps {
  model: DashboardWorkspaceModel;
  onAction: (target: DashboardActionTarget) => void;
  onOpenPlanner: () => void;
  onMarkReviewed?: (item: DashboardPriorityItem) => void;
  onSnooze?: (item: DashboardPriorityItem) => void;
  onTogglePin?: (item: DashboardPriorityItem) => void;
  onDismiss?: (item: DashboardPriorityItem) => void;
  onDismissInsight?: (insightId: string, fingerprint?: string) => void;
}
export function DashboardCommandCenter({ model, onAction, onOpenPlanner, onMarkReviewed, onSnooze, onTogglePin, onDismiss, onDismissInsight }: DashboardCommandCenterProps) {
  const [showIntelligence, setShowIntelligence] = useState(false);
  const items = model.visibleItems.slice(0, 5);
  const [leading, ...remaining] = items;
  const handlers = { onAction, onMarkReviewed, onSnooze, onTogglePin, onDismiss };
  return (
    <section aria-labelledby="dashboard-command-center-title" data-testid="dashboard-command-center" className="dossier-section">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 id="dashboard-command-center-title" className="font-editorial text-2xl">This week&apos;s priorities</h2>
        <span className="text-meta text-quiet">{items.length} open {items.length === 1 ? "matter" : "matters"}</span>
      </div>
      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div data-testid="dashboard-next-action">
          {leading ? <DashboardPriorityCard item={leading} featured orderIndex={1} {...handlers} /> : (
            <div className="py-4">
              <h3 className="text-xl">Room for the next discovery.</h3>
              <p className="mt-2 max-w-xl text-sm leading-6 text-quiet">No urgent file needs your attention. Choose where to spend your next day.</p>
              <Button className="mt-4" onClick={onOpenPlanner}>Plan the next observation <ArrowRight size={16} /></Button>
            </div>
          )}
          {remaining.length > 0 && <ol className="mt-4 divide-y divide-[var(--border)]">{remaining.map((item, index) => <li key={item.id}><DashboardPriorityCard item={item} orderIndex={index + 2} {...handlers} /></li>)}</ol>}
        </div>
        <aside data-testid="dashboard-week-summary" className="border-t border-[var(--border)] pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays size={16} className="text-quiet" /> In the diary</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-quiet">Observation blocks</dt><dd className="tabular-nums">{model.weekSummary.plannedObservationCount}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-quiet">Report sessions</dt><dd className="tabular-nums">{model.weekSummary.plannedReportCount}</dd></div>
          </dl>
          <p className="mt-4 text-sm leading-6 text-quiet">{model.weekSummary.travelSummary}</p>
          {leading?.sourceSystem !== "planner" && <Button variant="ghost" className="mt-3 -ml-3" onClick={onOpenPlanner}>Review diary <ArrowRight size={15} /></Button>}
        </aside>
      </div>
      {(model.careerThread || model.insights.length > 0 || model.recentlyResolved.length > 0) && (showIntelligence ? <div className="mt-6"><DashboardIntelligencePanel model={model} onAction={onAction} onDismissInsight={onDismissInsight} /></div> : <Button variant="ghost" className="mt-5 -ml-3" onClick={() => setShowIntelligence(true)}>Career notes & recent outcomes <ArrowRight size={15} /></Button>)}
    </section>
  );
}
