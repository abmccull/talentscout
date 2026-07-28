"use client";

import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ConvictionLevel } from "@/engine/core/types";

import {
  CONVICTION_KEYS,
  JUDGMENT_CATEGORIES,
  attrLabel,
  qualityScoreBorder,
  qualityScoreColor,
} from "./shared";

interface ReportFinalReviewProps {
  isYouthCase: boolean;
  isWorkflowSectionActive: (sectionId: string) => boolean;
  displayQualityScore: number;
  craftReadLabel: string;
  activeBriefClubName?: string;
  recommendedActionLabel: string;
  completedJudgmentCount: number;
  riskSignalCount: number;
  selectedNoMaterialSignal: boolean;
  effectiveSummary: string;
  youthRecommendationSupportCopy: string;
  privateScoutNoteLabel: string;
  summary: string;
  onSummaryChange: (nextValue: string) => void;
  canSubmit: boolean;
  reportStatusTotalRemaining: number;
  conviction: ConvictionLevel;
  remainingTablePounds: number;
  onConvictionChange: (conviction: ConvictionLevel) => void;
  isTablePound: boolean;
  handleBack: () => void;
  handleSubmit: () => void;
  previousReportRevision?: number;
  submitLabel: string;
  cancelLabel: string;
  blockers: string[];
  convictionLabel: (key: ConvictionLevel) => string;
}

export function ReportFinalReview({
  isYouthCase,
  isWorkflowSectionActive,
  displayQualityScore,
  craftReadLabel,
  activeBriefClubName,
  recommendedActionLabel,
  completedJudgmentCount,
  riskSignalCount,
  selectedNoMaterialSignal,
  effectiveSummary,
  youthRecommendationSupportCopy,
  privateScoutNoteLabel,
  summary,
  onSummaryChange,
  canSubmit,
  reportStatusTotalRemaining,
  conviction,
  remainingTablePounds,
  onConvictionChange,
  isTablePound,
  handleBack,
  handleSubmit,
  previousReportRevision,
  submitLabel,
  cancelLabel,
  blockers,
  convictionLabel,
}: ReportFinalReviewProps) {
  return (
    <div hidden={isYouthCase && !isWorkflowSectionActive("final")}>
      <CardLike
        displayQualityScore={displayQualityScore}
        craftReadLabel={craftReadLabel}
        isYouthCase={isYouthCase}
        activeBriefClubName={activeBriefClubName}
        recommendedActionLabel={recommendedActionLabel}
        completedJudgmentCount={completedJudgmentCount}
        riskSignalCount={riskSignalCount}
        selectedNoMaterialSignal={selectedNoMaterialSignal}
        effectiveSummary={effectiveSummary}
        youthRecommendationSupportCopy={youthRecommendationSupportCopy}
        privateScoutNoteLabel={privateScoutNoteLabel}
        summary={summary}
        onSummaryChange={onSummaryChange}
        canSubmit={canSubmit}
        reportStatusTotalRemaining={reportStatusTotalRemaining}
        conviction={conviction}
        remainingTablePounds={remainingTablePounds}
        onConvictionChange={onConvictionChange}
        isTablePound={isTablePound}
        handleBack={handleBack}
        handleSubmit={handleSubmit}
        previousReportRevision={previousReportRevision}
        submitLabel={submitLabel}
        cancelLabel={cancelLabel}
        blockers={blockers}
        convictionLabel={convictionLabel}
      />
    </div>
  );
}

function CardLike({
  displayQualityScore,
  craftReadLabel,
  isYouthCase,
  activeBriefClubName,
  recommendedActionLabel,
  completedJudgmentCount,
  riskSignalCount,
  selectedNoMaterialSignal,
  effectiveSummary,
  youthRecommendationSupportCopy,
  privateScoutNoteLabel,
  summary,
  onSummaryChange,
  canSubmit,
  reportStatusTotalRemaining,
  conviction,
  remainingTablePounds,
  onConvictionChange,
  isTablePound,
  handleBack,
  handleSubmit,
  previousReportRevision,
  submitLabel,
  cancelLabel,
  blockers,
  convictionLabel,
}: Omit<ReportFinalReviewProps, "isWorkflowSectionActive">) {
  return (
    <div
      id="report-section-file"
      data-testid="report-final-review"
      data-tutorial-id="report-conviction"
      className={`scroll-mt-28 rounded-xl border ${qualityScoreBorder(displayQualityScore)} bg-[#10151b]/98 shadow-2xl shadow-black/25 lg:sticky lg:top-20 lg:z-20`}
    >
      <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <div>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
                Final review
              </p>
              <h2 className="mt-1 text-xl font-bold text-white">
                Check the case, then file it
              </h2>
            </div>
            <Badge
              variant="outline"
              aria-label={`Craft assessment: ${craftReadLabel}`}
              className={`${qualityScoreBorder(displayQualityScore)} ${qualityScoreColor(displayQualityScore)}`}
            >
              Craft: {craftReadLabel}
            </Badge>
          </div>
          {isYouthCase && (
            <dl className="mb-4 grid gap-2 text-xs sm:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <dt className="text-zinc-400">Club brief</dt>
                <dd className="mt-1 font-semibold text-white">
                  {activeBriefClubName ?? "No club selected"}
                </dd>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <dt className="text-zinc-400">Recommended action</dt>
                <dd className="mt-1 font-semibold text-white">
                  {recommendedActionLabel}
                </dd>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <dt className="text-zinc-400">Defended judgments</dt>
                <dd className="mt-1 font-semibold text-white">
                  {completedJudgmentCount}/{JUDGMENT_CATEGORIES.length}
                </dd>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                <dt className="text-zinc-400">Risk posture</dt>
                <dd className="mt-1 font-semibold text-white">
                  {selectedNoMaterialSignal
                    ? "No specific signal claimed"
                    : `${riskSignalCount} signal${riskSignalCount === 1 ? "" : "s"} recorded`}
                </dd>
              </div>
            </dl>
          )}
          {isYouthCase ? (
            <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200">
                Filed recommendation
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-100">
                {effectiveSummary
                  || "Complete the evidence judgments above to assemble the recommendation."}
              </p>
              <p className="mt-3 text-[11px] leading-5 text-zinc-400">
                {youthRecommendationSupportCopy}
              </p>
            </div>
          ) : (
            <>
              <label htmlFor="report-summary" className="text-sm font-semibold text-zinc-200">
                {privateScoutNoteLabel}
              </label>
              <p id="report-summary-help" className="mt-1 text-xs leading-5 text-zinc-400">
                Keep any personal phrasing or nuance you want colleagues to read.
                The recommendation must still stand on the observations, strengths,
                concerns, and conviction recorded in the dossier.
              </p>
              <textarea
                id="report-summary"
                value={summary}
                onChange={(event) => onSummaryChange(event.target.value)}
                aria-describedby="report-summary-help"
                rows={5}
                placeholder="Private wording for how you want this report to read"
                className="mt-3 min-h-32 w-full resize-y rounded-xl border border-white/10 bg-black/25 p-3 text-sm leading-6 text-white outline-none transition placeholder:text-zinc-500 focus:border-emerald-400/40 focus:ring-1 focus:ring-emerald-400/40"
              />
            </>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                Conviction
              </p>
              <p className="mt-1 text-sm text-zinc-300">
                How much reputation belongs behind this call?
              </p>
            </div>
            <span className={`text-xs font-semibold ${canSubmit ? "text-emerald-300" : "text-amber-300"}`}>
              {canSubmit
                ? "Ready to file"
                : `${reportStatusTotalRemaining} issue${reportStatusTotalRemaining === 1 ? "" : "s"} to resolve`}
            </span>
          </div>
          <fieldset>
            <legend className="sr-only">Report conviction</legend>
            <div className="grid grid-cols-2 gap-2">
              {CONVICTION_KEYS.map((key) => {
                const isDisabled = key === "tablePound" && remainingTablePounds <= 0;
                return (
                  <div key={`decision-${key}`} className="relative">
                    <input
                      id={`report-conviction-${key}`}
                      className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
                      type="radio"
                      name="report-conviction"
                      value={key}
                      checked={conviction === key}
                      disabled={isDisabled}
                      onChange={() => onConvictionChange(key)}
                    />
                    <label
                      htmlFor={`report-conviction-${key}`}
                      className={`block min-h-12 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald-400 ${
                        isDisabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:border-white/20"
                      } ${
                        conviction === key
                          ? key === "tablePound"
                            ? "border-red-400/60 bg-red-400/10 text-red-200"
                            : "border-emerald-400/50 bg-emerald-400/10 text-emerald-200"
                          : "border-white/10 bg-white/[0.025] text-zinc-300"
                      }`}
                    >
                      {convictionLabel(key)}
                    </label>
                  </div>
                );
              })}
            </div>
          </fieldset>
          {isTablePound && (
            <p className="mt-3 rounded-lg border border-red-400/25 bg-red-400/10 p-3 text-xs leading-5 text-red-200">
              This stakes meaningful reputation on the outcome. Use it only when
              the evidence deserves that risk.
            </p>
          )}
          <p className="mt-2 text-[11px] text-zinc-400">
            Table-pounds remaining this season:{" "}
            <span className="font-semibold text-white">{remainingTablePounds}</span>
          </p>
          {isYouthCase && blockers.length > 0 && (
            <div role="alert" className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3">
              <p className="text-xs font-semibold text-amber-200">
                Complete the report before filing:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-100/80">
                {blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2" data-tutorial-id="report-submit">
            <Button className="min-h-11" variant="outline" onClick={handleBack}>
              {cancelLabel}
            </Button>
            <Button
              className={`min-h-11 ${isTablePound ? "bg-red-600 hover:bg-red-700" : ""}`}
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              <FileText size={14} className="mr-2" aria-hidden="true" />
              {typeof previousReportRevision === "number"
                ? `File revision ${previousReportRevision + 1}`
                : submitLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
