"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AnalystReviewArtifact } from "@/engine/core/types";
import {
  formatAnalystEvidenceCategory,
  formatAnalystReviewBias,
} from "@/engine/finance";

import { formatPercent } from "./shared";

interface PreparedReportWorkCalloutProps {
  preparedWorkItem: {
    freshObservationIds: string[];
    preparationQualityPoints: number;
    preparationQualityBonus: number;
    createdSeason: number;
    createdWeek: number;
  };
  playerName: string;
}

export function PreparedReportWorkCallout({
  preparedWorkItem,
  playerName,
}: PreparedReportWorkCalloutProps) {
  return (
    <details
      className="group mb-5 rounded-xl border border-sky-400/20 bg-sky-400/[0.07] px-4 py-3"
      data-testid="prepared-report-work"
    >
      <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300">
        <span>
          {preparedWorkItem.freshObservationIds.length} prepared evidence item
          {preparedWorkItem.freshObservationIds.length === 1 ? "" : "s"}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-sky-300 group-open:hidden">
          Review
        </span>
        <span className="hidden text-[10px] uppercase tracking-wider text-sky-300 group-open:inline">
          Hide
        </span>
      </summary>
      <div
        className="mt-3 border-t border-sky-300/15 pt-3"
        aria-labelledby="prepared-report-work-heading"
      >
        <h2 id="prepared-report-work-heading" className="text-sm font-bold text-white">
          {playerName} is prepped for filing
        </h2>
        <p className="mt-2 text-xs leading-5 text-zinc-200">
          Your organized evidence adds +
          {preparedWorkItem.preparationQualityPoints} craft support and{" "}
          {formatPercent(preparedWorkItem.preparationQualityBonus)} stronger
          preparation to this report.
        </p>
        <p className="mt-2 text-[11px] leading-5 text-zinc-400">
          Prepared in S{preparedWorkItem.createdSeason} W
          {preparedWorkItem.createdWeek}. You still choose the verdict and file it
          yourself.
        </p>
      </div>
    </details>
  );
}

interface ReportWriterAlertsProps {
  observationsBlockerMessage?: string;
  freshEvidenceBlockerMessage?: string;
  previousReportRevision?: number;
  onHandleBack: () => void;
}

export function ReportWriterAlerts({
  observationsBlockerMessage,
  freshEvidenceBlockerMessage,
  previousReportRevision,
  onHandleBack,
}: ReportWriterAlertsProps) {
  return (
    <>
      {observationsBlockerMessage && (
        <div
          role="alert"
          className="mb-6 flex flex-col gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="flex items-start gap-2 text-sm leading-5 text-red-200">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{observationsBlockerMessage}</span>
          </p>
          <Button className="min-h-11 shrink-0" variant="outline" onClick={onHandleBack}>
            Plan observation
          </Button>
        </div>
      )}
      {freshEvidenceBlockerMessage && typeof previousReportRevision === "number" && (
        <div
          role="status"
          className="mb-6 rounded-lg border border-amber-400/30 bg-amber-400/10 p-4"
        >
          <p className="flex items-start gap-2 text-sm leading-5 text-amber-200">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            {freshEvidenceBlockerMessage} Rewriting the same evidence does not earn
            reputation or performance credit for revision {previousReportRevision + 1}.
          </p>
        </div>
      )}
    </>
  );
}

interface AnalystReviewBannerProps {
  analystReview: Pick<
    AnalystReviewArtifact,
    | "analystName"
    | "evidenceCategory"
    | "craftQualityBonus"
    | "critique"
    | "bias"
    | "biasDisclosure"
  >;
}

export function AnalystReviewBanner({
  analystReview,
}: AnalystReviewBannerProps) {
  return (
    <section
      aria-labelledby="analyst-review-heading"
      className="mb-6 rounded-xl border border-violet-400/30 bg-violet-400/10 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-violet-300">
            Analyst review ready
          </p>
          <h2 id="analyst-review-heading" className="mt-1 text-sm font-bold text-white">
            {analystReview.analystName} ·{" "}
            {formatAnalystEvidenceCategory(analystReview.evidenceCategory)}
          </h2>
        </div>
        <Badge variant="outline" className="border-violet-300/30 text-violet-200">
          +{analystReview.craftQualityBonus} craft · one use
        </Badge>
      </div>
      <p className="mt-3 text-sm leading-6 text-violet-50/90">
        {analystReview.critique}
      </p>
      <p className="mt-3 text-xs leading-5 text-violet-100/70">
        Method bias - {formatAnalystReviewBias(analystReview.bias)}:{" "}
        {analystReview.biasDisclosure}
      </p>
      <p className="mt-2 text-[11px] text-zinc-400">
        The visible craft band includes this review. It is consumed exactly once
        when this eligible report is filed.
      </p>
    </section>
  );
}
