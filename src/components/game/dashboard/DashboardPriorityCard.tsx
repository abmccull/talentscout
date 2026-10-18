"use client";
import { ArrowRight, BellOff, Eye, Pin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DashboardActionTarget, DashboardPriorityItem } from "./dashboardPriorityModel";
export interface DashboardPriorityCardProps {
  item: DashboardPriorityItem;
  featured?: boolean;
  orderIndex: number;
  onAction: (target: DashboardActionTarget) => void;
  onMarkReviewed?: (item: DashboardPriorityItem) => void;
  onSnooze?: (item: DashboardPriorityItem) => void;
  onTogglePin?: (item: DashboardPriorityItem) => void;
  onDismiss?: (item: DashboardPriorityItem) => void;
  variant?: "priority" | "opportunity";
}
const SOURCE_LABELS: Record<DashboardPriorityItem["sourceSystem"], string> = {
  inbox: "Correspondence", planner: "Your diary", reports: "Filed reports", career: "Career", agency: "Agency", relationships: "Contacts", rivals: "Rival watch", scouting: "Scouting file",
};
export function DashboardPriorityCard({ item, featured = false, orderIndex, onAction, onMarkReviewed, onSnooze, onTogglePin, onDismiss, variant = "priority" }: DashboardPriorityCardProps) {
  const isPlanning = item.id.startsWith("dashboard-planner-gap-");
  const urgent = !isPlanning && (item.severity === "critical" || item.severity === "high");
  return (
    <article data-testid={variant === "opportunity" ? "dashboard-opportunity-card" : "dashboard-priority-card"} data-dashboard-item-id={item.id} className={featured ? "border-l-2 border-[var(--primary)] pl-5 py-2" : "py-5"}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-quiet">
        <span className="tabular-nums">{String(orderIndex).padStart(2, "0")}</span><span>{SOURCE_LABELS[item.sourceSystem]}</span>
        {urgent && <span className="text-[var(--signal-warn)]">{item.severity === "critical" ? "Needs a decision" : "Time sensitive"}</span>}
        {item.deadlineWeek != null && <span>Due week {item.deadlineWeek}</span>}
      </div>
      <h3 className={featured ? "font-editorial mt-3 text-2xl leading-tight sm:text-3xl" : "mt-2 text-lg font-semibold"}>{item.title}</h3>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">{item.explanation}</p>
      {featured && item.consequence && <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--signal-moment)]">{item.consequence}</p>}
      <div className="mt-4 flex flex-wrap items-start gap-3">
        <Button variant={featured ? "default" : "outline"} onClick={() => { onMarkReviewed?.(item); onAction(item.actionTarget); }}>{item.actionLabel} <ArrowRight size={15} /></Button>
        {(onMarkReviewed || (item.snoozable && onSnooze) || (item.pinnable && onTogglePin) || (item.dismissible && onDismiss) || item.outcomeExplanation) && (
          <details className="text-sm text-quiet">
            <summary className="min-h-11 cursor-pointer px-2 py-3">File options</summary>
            {item.outcomeExplanation && <div className="max-w-lg py-3"><p className="font-semibold text-[var(--foreground)]">{item.outcomeExplanation.headline}</p><ul className="mt-2 list-disc space-y-1 pl-4 text-sm leading-6">{item.outcomeExplanation.causeLines.map((line) => <li key={line}>{line}</li>)}</ul></div>}
            <div className="flex flex-wrap gap-1">
              {onMarkReviewed && <Button variant="ghost" size="sm" onClick={() => onMarkReviewed(item)}><Eye size={14} /> Reviewed</Button>}
              {item.snoozable && onSnooze && <Button variant="ghost" size="sm" onClick={() => onSnooze(item)}><BellOff size={14} /> Next week</Button>}
              {item.pinnable && onTogglePin && <Button variant="ghost" size="sm" onClick={() => onTogglePin(item)}><Pin size={14} /> Pin</Button>}
              {item.dismissible && onDismiss && <Button variant="ghost" size="sm" onClick={() => onDismiss(item)}><X size={14} /> Dismiss</Button>}
            </div>
          </details>
        )}
      </div>
    </article>
  );
}
