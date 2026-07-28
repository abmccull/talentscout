"use client";

import {
  AlertTriangle,
  ArrowRight,
  BellOff,
  Clock3,
  Eye,
  Link2,
  Pin,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DashboardActionTarget, DashboardPriorityItem } from "./dashboardPriorityModel";

type PriorityCardVariant = "priority" | "opportunity";

export interface DashboardPriorityCardProps {
  item: DashboardPriorityItem;
  featured?: boolean;
  orderIndex: number;
  onAction: (target: DashboardActionTarget) => void;
  onMarkReviewed?: (item: DashboardPriorityItem) => void;
  onSnooze?: (item: DashboardPriorityItem) => void;
  onTogglePin?: (item: DashboardPriorityItem) => void;
  onDismiss?: (item: DashboardPriorityItem) => void;
  variant?: PriorityCardVariant;
}

const CATEGORY_LABELS: Record<DashboardPriorityItem["category"], string> = {
  required_action: "Requires attention",
  deadline: "Deadline",
  opportunity: "Opportunity at risk",
  risk: "Risk",
  career_story: "Career thread",
};

const SOURCE_LABELS: Record<DashboardPriorityItem["sourceSystem"], string> = {
  inbox: "Inbox",
  planner: "Planner",
  reports: "Reports",
  career: "Career",
  relationships: "Relationships",
  rivals: "Rivals",
  scouting: "Scouting",
};

function severityLabel(severity: DashboardPriorityItem["severity"]): string {
  switch (severity) {
    case "critical":
      return "Critical";
    case "high":
      return "High";
    case "medium":
      return "Medium";
    default:
      return "Low";
  }
}

function toneClasses(
  severity: DashboardPriorityItem["severity"],
  variant: PriorityCardVariant,
  featured: boolean,
): {
  shell: string;
  accent: string;
  halo: string;
  categoryPill: string;
  severityPill: string;
  metaIcon: string;
  action: string;
} {
  if (variant === "opportunity") {
    switch (severity) {
      case "critical":
        return {
          shell: featured
            ? "border-amber-300/35 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.17),transparent_38%),linear-gradient(135deg,rgba(18,24,20,0.98),rgba(10,14,17,0.98))]"
            : "border-amber-300/20 bg-[linear-gradient(135deg,rgba(18,24,20,0.98),rgba(10,14,17,0.98))]",
          accent: "from-amber-300 via-emerald-300/60 to-transparent",
          halo: "bg-amber-300/12",
          categoryPill: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
          severityPill: "border-amber-300/30 bg-amber-300/12 text-amber-100",
          metaIcon: "text-amber-200",
          action: "bg-emerald-700 text-white hover:bg-emerald-600",
        };
      case "high":
        return {
          shell: featured
            ? "border-emerald-300/30 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.17),transparent_38%),linear-gradient(135deg,rgba(13,23,21,0.98),rgba(10,14,17,0.98))]"
            : "border-emerald-300/20 bg-[linear-gradient(135deg,rgba(13,23,21,0.98),rgba(10,14,17,0.98))]",
          accent: "from-emerald-300 via-sky-300/50 to-transparent",
          halo: "bg-emerald-300/12",
          categoryPill: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
          severityPill: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
          metaIcon: "text-emerald-200",
          action: "bg-emerald-700 text-white hover:bg-emerald-600",
        };
      default:
        return {
          shell: featured
            ? "border-sky-300/30 bg-[radial-gradient(circle_at_top_right,rgba(125,211,252,0.14),transparent_38%),linear-gradient(135deg,rgba(12,20,25,0.98),rgba(10,14,17,0.98))]"
            : "border-sky-300/20 bg-[linear-gradient(135deg,rgba(12,20,25,0.98),rgba(10,14,17,0.98))]",
          accent: "from-sky-300 via-emerald-300/40 to-transparent",
          halo: "bg-sky-300/12",
          categoryPill: "border-sky-300/25 bg-sky-300/10 text-sky-100",
          severityPill: "border-white/15 bg-white/[0.06] text-zinc-200",
          metaIcon: "text-sky-200",
          action: "bg-emerald-700 text-white hover:bg-emerald-600",
        };
    }
  }

  switch (severity) {
    case "critical":
      return {
        shell: featured
          ? "border-red-300/30 bg-[radial-gradient(circle_at_top_right,rgba(248,113,113,0.16),transparent_38%),linear-gradient(135deg,rgba(25,14,16,0.98),rgba(10,14,17,0.98))]"
          : "border-red-300/20 bg-[linear-gradient(135deg,rgba(25,14,16,0.98),rgba(10,14,17,0.98))]",
        accent: "from-red-300 via-amber-300/55 to-transparent",
        halo: "bg-red-300/12",
        categoryPill: "border-red-300/25 bg-red-300/10 text-red-100",
        severityPill: "border-red-300/25 bg-red-300/10 text-red-100",
        metaIcon: "text-red-200",
        action: "bg-red-700 text-white hover:bg-red-600",
      };
    case "high":
      return {
        shell: featured
          ? "border-amber-300/30 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.16),transparent_38%),linear-gradient(135deg,rgba(24,18,12,0.98),rgba(10,14,17,0.98))]"
          : "border-amber-300/20 bg-[linear-gradient(135deg,rgba(24,18,12,0.98),rgba(10,14,17,0.98))]",
        accent: "from-amber-300 via-emerald-300/45 to-transparent",
        halo: "bg-amber-300/12",
        categoryPill: "border-amber-300/25 bg-amber-300/10 text-amber-100",
        severityPill: "border-amber-300/25 bg-amber-300/10 text-amber-100",
        metaIcon: "text-amber-200",
        action: "bg-emerald-700 text-white hover:bg-emerald-600",
      };
    case "medium":
      return {
        shell: featured
          ? "border-emerald-300/30 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.16),transparent_38%),linear-gradient(135deg,rgba(13,23,21,0.98),rgba(10,14,17,0.98))]"
          : "border-emerald-300/20 bg-[linear-gradient(135deg,rgba(13,23,21,0.98),rgba(10,14,17,0.98))]",
        accent: "from-emerald-300 via-sky-300/45 to-transparent",
        halo: "bg-emerald-300/10",
        categoryPill: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
        severityPill: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
        metaIcon: "text-emerald-200",
        action: "bg-emerald-700 text-white hover:bg-emerald-600",
      };
    default:
      return {
        shell: featured
          ? "border-white/15 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.08),transparent_36%),linear-gradient(135deg,rgba(17,22,28,0.98),rgba(10,14,17,0.98))]"
          : "border-white/10 bg-[linear-gradient(135deg,rgba(17,22,28,0.98),rgba(10,14,17,0.98))]",
        accent: "from-white/40 via-emerald-300/35 to-transparent",
        halo: "bg-white/8",
        categoryPill: "border-white/15 bg-white/[0.05] text-zinc-100",
        severityPill: "border-white/15 bg-white/[0.05] text-zinc-200",
        metaIcon: "text-zinc-300",
        action: "bg-emerald-700 text-white hover:bg-emerald-600",
      };
  }
}

export function DashboardPriorityCard({
  item,
  featured = false,
  orderIndex,
  onAction,
  onMarkReviewed,
  onSnooze,
  onTogglePin,
  onDismiss,
  variant = "priority",
}: DashboardPriorityCardProps) {
  const tone = toneClasses(item.severity, variant, featured);
  const hasLinkedEntities = item.relatedEntityIds.length > 0;
  const testId = variant === "opportunity"
    ? "dashboard-opportunity-card"
    : "dashboard-priority-card";

  return (
    <Card
      data-testid={testId}
      data-dashboard-item-id={item.id}
      className={cn(
        "relative overflow-hidden rounded-2xl shadow-2xl shadow-black/20",
        tone.shell,
      )}
    >
      <div className={cn("absolute inset-x-0 top-0 h-px bg-gradient-to-r", tone.accent)} />
      <div className={cn("pointer-events-none absolute -right-8 top-0 h-24 w-24 rounded-full blur-3xl", tone.halo)} />

      <div className={cn("relative p-5 sm:p-6", featured && "p-6 sm:p-7")}>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-white/10 bg-black/25 px-2 text-xs font-semibold text-zinc-100">
              {orderIndex}
            </span>
            <span className={cn("inline-flex min-h-8 items-center rounded-full border px-3 text-[11px] font-semibold uppercase tracking-[0.14em]", tone.categoryPill)}>
              {CATEGORY_LABELS[item.category]}
            </span>
            <span className={cn("inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-semibold", tone.severityPill)}>
              {severityLabel(item.severity)}
            </span>
          </div>

          {item.deadlineWeek != null && (
            <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-white/10 bg-black/25 px-3 text-xs font-medium text-zinc-200">
              <Clock3 size={14} className={tone.metaIcon} aria-hidden="true" />
              Week {item.deadlineWeek}
            </span>
          )}
        </header>

        <div className="mt-4">
          {featured && (
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
              Top priority
            </p>
          )}
          <h3 className={cn("max-w-3xl font-semibold tracking-tight text-white", featured ? "text-xl sm:text-2xl" : "text-lg sm:text-xl")}>
            {item.title}
          </h3>
        </div>

        <div className="mt-4 grid gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Why it matters
            </p>
            <p className="mt-1 text-xs leading-6 text-zinc-200 sm:text-sm">
              {item.explanation}
            </p>
          </div>

          {item.consequence && (
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                <AlertTriangle size={13} className={tone.metaIcon} aria-hidden="true" />
                If ignored
              </p>
              <p className="mt-1 text-xs leading-6 text-zinc-200 sm:text-sm">
                {item.consequence}
              </p>
            </div>
          )}

          {item.outcomeExplanation && (
            <details className="rounded-xl border border-sky-300/15 bg-sky-300/[0.05] p-3">
              <summary className="cursor-pointer text-xs font-semibold text-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
                Why this happened
              </summary>
              <p className="mt-3 text-sm font-semibold text-white">
                {item.outcomeExplanation.headline}
              </p>
              <ul className="mt-2 space-y-1 text-xs leading-5 text-zinc-300">
                {item.outcomeExplanation.causeLines.map((line) => (
                  <li key={line}>• {line}</li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-4">
          <dl className="grid gap-3 text-xs text-zinc-300 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Source
              </dt>
              <dd className="mt-1 flex items-center gap-2 text-xs text-zinc-100 sm:text-sm">
                <Sparkles size={14} className={tone.metaIcon} aria-hidden="true" />
                {SOURCE_LABELS[item.sourceSystem]}
              </dd>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Context
              </dt>
              <dd className="mt-1 flex items-center gap-2 text-xs text-zinc-100 sm:text-sm">
                <Link2 size={14} className={tone.metaIcon} aria-hidden="true" />
                {hasLinkedEntities
                  ? `${item.relatedEntityIds.length} linked ${item.relatedEntityIds.length === 1 ? "record" : "records"}`
                  : item.sourceSystem === "planner"
                    ? "Current week"
                    : "Source-backed signal"}
              </dd>
            </div>
          </dl>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-6 text-zinc-400">
              {item.deadlineWeek != null
                ? `Deadline in week ${item.deadlineWeek}.`
                : item.severity === "critical"
                  ? "Must be handled before the week can safely advance."
                : "No hard deadline is attached to this signal."}
            </p>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
              <Button
                type="button"
                className={cn("min-h-11 w-full sm:w-auto", tone.action)}
                onClick={() => {
                  onMarkReviewed?.(item);
                  onAction(item.actionTarget);
                }}
              >
                {item.actionLabel}
                <ArrowRight size={15} className="ml-2" aria-hidden="true" />
              </Button>
              {onMarkReviewed && (
                <Button type="button" variant="outline" size="sm" onClick={() => onMarkReviewed(item)}>
                  <Eye size={14} className="mr-1.5" aria-hidden="true" />
                  Reviewed
                </Button>
              )}
              {item.snoozable && onSnooze && (
                <Button type="button" variant="outline" size="sm" onClick={() => onSnooze(item)}>
                  <BellOff size={14} className="mr-1.5" aria-hidden="true" />
                  Next week
                </Button>
              )}
              {item.pinnable && onTogglePin && (
                <Button type="button" variant="outline" size="sm" onClick={() => onTogglePin(item)}>
                  <Pin size={14} className="mr-1.5" aria-hidden="true" />
                  Pin
                </Button>
              )}
              {item.dismissible && onDismiss && (
                <Button type="button" variant="ghost" size="sm" onClick={() => onDismiss(item)}>
                  <X size={14} className="mr-1.5" aria-hidden="true" />
                  Dismiss
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
