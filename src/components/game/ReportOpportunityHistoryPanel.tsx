"use client";

import { Badge } from "@/components/ui/badge";
import type {
  OpportunityHistoryStatus,
  ReportOpportunityHistorySummary,
} from "./reportHistoryOpportunityModel";

function statusVariant(
  status: OpportunityHistoryStatus,
): "success" | "warning" | "destructive" | "secondary" | "outline" {
  switch (status) {
    case "causalSigning":
      return "success";
    case "decisionAccepted":
      return "secondary";
    case "open":
      return "warning";
    case "expired":
    case "rejected":
      return "destructive";
    case "predictiveOnlyMovement":
      return "outline";
  }
}

interface ReportOpportunityHistoryPanelProps {
  summary: ReportOpportunityHistorySummary;
}

export function ReportOpportunityHistoryPanel({
  summary,
}: ReportOpportunityHistoryPanelProps) {
  if (summary.items.length === 0) return null;

  return (
    <section className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
            Recruitment opportunity history
          </p>
          <h3 className="mt-1 text-base font-bold text-white">
            Delivered recommendations and downstream accountability
          </h3>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px]">
          <Badge variant="success">{summary.convertedCount} converted</Badge>
          <Badge variant="warning">{summary.liveCount} live</Badge>
          <Badge variant="outline">{summary.missedCount} missed</Badge>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {summary.items.map((item) => (
          <article
            key={item.id}
            className={`rounded-lg border p-3 ${
              item.isSelectedRevision
                ? "border-emerald-400/30 bg-black/25"
                : "border-white/10 bg-black/15"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold text-white">{item.targetClubName}</h4>
                  <Badge variant={statusVariant(item.status)}>{item.statusLabel}</Badge>
                  <Badge variant="outline">Revision {item.reportRevision}</Badge>
                  {item.isSelectedRevision && <Badge variant="secondary">Current modal revision</Badge>}
                </div>
                <p className="mt-2 text-xs leading-5 text-zinc-300">{item.statusDetail}</p>
                {item.transferDetail && (
                  <p className="mt-1 text-[11px] leading-5 text-zinc-400">{item.transferDetail}</p>
                )}
              </div>
              <div className="text-right text-[11px] text-zinc-400">
                <div>Delivered {item.deliveredLabel}</div>
                {item.deadlineLabel && <div>Deadline {item.deadlineLabel}</div>}
              </div>
            </div>

            <dl className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-md bg-black/20 p-2">
                <dt className="text-zinc-500">Channel</dt>
                <dd className="mt-1 font-medium text-white">{item.channelLabel}</dd>
              </div>
              <div className="rounded-md bg-black/20 p-2">
                <dt className="text-zinc-500">Buyer</dt>
                <dd className="mt-1 font-medium text-white">{item.buyerClubName ?? item.targetClubName}</dd>
              </div>
              <div className="rounded-md bg-black/20 p-2">
                <dt className="text-zinc-500">Exclusivity</dt>
                <dd className="mt-1 font-medium text-white">{item.exclusivityLabel}</dd>
              </div>
              <div className="rounded-md bg-black/20 p-2">
                <dt className="text-zinc-500">Recorded outcome</dt>
                <dd className="mt-1 font-medium text-white">{item.reportOutcomeLabel}</dd>
              </div>
              <div className="rounded-md bg-black/20 p-2">
                <dt className="text-zinc-500">Credit state</dt>
                <dd className="mt-1 font-medium text-white">{item.statusLabel}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
