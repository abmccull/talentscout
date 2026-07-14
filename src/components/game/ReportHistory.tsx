"use client";

import React, { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, X, ChevronDown, ChevronUp, DollarSign, GitCompareArrows, Gavel, Crown, AlertTriangle, TrendingUp, BookOpen } from "lucide-react";
import type {
  ClubDecision,
  ScoutReport,
  ConvictionLevel,
  RecommendationReview,
  ReportListing,
  TransferRecord,
  MarketplaceBid,
  ReflectionJournalEntry,
  YouthRecruitmentBrief,
} from "@/engine/core/types";
import {
  OUTCOME_COLORS,
  OUTCOME_REASON_COLORS,
  OUTCOME_REASON_SHORT_LABELS,
} from "@/engine/firstTeam";
import { calculateReportPrice } from "@/engine/finance";
import { StarRating, StarRatingRange } from "@/components/ui/StarRating";
import { Tooltip } from "@/components/ui/tooltip";
import { ScreenBackground } from "@/components/ui/screen-background";
import { resolvePlayerEntity } from "@/lib/playerResolution";
import { formatObservationActivityLabel } from "@/engine/observation/reflection";
import {
  buildScoutingCaseTimeline,
  type ScoutingCaseTimeline,
} from "@/engine/reports/scoutingCaseTimeline";
import { ScoutingCaseTimelineView } from "./ScoutingCaseTimeline";

const CONVICTION_LABELS: Record<ConvictionLevel, string> = {
  note: "Note",
  recommend: "Recommend",
  strongRecommend: "Strong Rec",
  tablePound: "Table Pound",
};

const CONVICTION_VARIANT: Record<
  ConvictionLevel,
  "default" | "secondary" | "success" | "warning" | "destructive" | "outline"
> = {
  note: "outline",
  recommend: "secondary",
  strongRecommend: "success",
  tablePound: "default",
};

function qualityColor(score: number): string {
  if (score >= 75) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function formatValue(n: number): string {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `£${(n / 1_000).toFixed(0)}K`;
  return `£${n}`;
}

interface ReportDetailModalProps {
  report: ScoutReport;
  playerName: string;
  transferRecord?: TransferRecord;
  brief?: YouthRecruitmentBrief;
  clubDecision?: ClubDecision;
  reviews: RecommendationReview[];
  clubName?: string;
  caseTimeline?: ScoutingCaseTimeline;
  onClose: () => void;
}

function ReportDetailModal({
  report,
  playerName,
  transferRecord,
  brief,
  clubDecision,
  reviews,
  clubName,
  caseTimeline,
  onClose,
}: ReportDetailModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Report for ${playerName}`}
    >
      <div className="w-full max-w-3xl max-h-[85vh] overflow-auto rounded-xl border border-[#27272a] bg-[#0a0a0a] shadow-2xl [&_.text-zinc-500]:text-zinc-400 [&_.text-zinc-600]:text-zinc-400">
        <div className="flex items-center justify-between border-b border-[#27272a] p-5">
          <div>
            <h2 className="text-lg font-bold">{playerName}</h2>
            <p className="text-xs text-zinc-500">
              Week {report.submittedWeek} — Season {report.submittedSeason}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-[#27272a] hover:text-white transition"
            aria-label="Close report"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Conviction & quality */}
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant={CONVICTION_VARIANT[report.conviction]}>
              {CONVICTION_LABELS[report.conviction]}
            </Badge>
            {report.perceivedCAStars != null && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-zinc-500">Current read:</span>
                <StarRating rating={report.perceivedCAStars} size="sm" />
              </div>
            )}
            {report.perceivedPARange && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-zinc-500">Upside read:</span>
                <StarRatingRange
                  low={report.perceivedPARange[0]}
                  high={report.perceivedPARange[1]}
                  size="sm"
                />
              </div>
            )}
            <span className={`text-sm font-semibold ${qualityColor(report.qualityScore)}`}>
              Craft: {report.qualityScore}/100
            </span>
            {report.postTransferRating !== undefined ? (
              <span className={`text-sm font-semibold ${qualityColor(report.postTransferRating)}`}>
                Validated accuracy: {report.postTransferRating}/100
              </span>
            ) : (
              <span className="text-xs text-zinc-500">Accuracy pending career evidence</span>
            )}
            {report.craftBreakdown && (
              <div className="w-full mt-2 space-y-1 text-[10px] text-zinc-500">
                <div className="flex justify-between"><span>Observation depth</span><span>{report.craftBreakdown.observationDepth}/25</span></div>
                <div className="flex justify-between"><span>Evidence confidence</span><span>{report.craftBreakdown.confidenceLevel}/20</span></div>
                <div className="flex justify-between"><span>Conviction calibration</span><span>{report.craftBreakdown.convictionFit}/15</span></div>
                <div className="flex justify-between"><span>Evidence-backed detail</span><span>{report.craftBreakdown.detail}/20</span></div>
                <div className="flex justify-between"><span>Scout technique</span><span>{report.craftBreakdown.scoutSkill}/20</span></div>
                {report.craftBreakdown.equipmentBonus > 0 && (
                  <div className="flex justify-between"><span>Equipment bonus</span><span>+{Math.round(report.craftBreakdown.equipmentBonus)}</span></div>
                )}
              </div>
            )}
            {report.qualityBreakdown && (
              <div className="w-full mt-2 space-y-1 text-[10px] text-zinc-500">
                <div className="font-medium text-zinc-400">Legacy report score</div>
                <div className="flex justify-between"><span>Accuracy</span><span>{Math.round(report.qualityBreakdown.accuracy)}/45</span></div>
                <div className="flex justify-between"><span>Coverage</span><span>{Math.round(report.qualityBreakdown.coverage)}/25</span></div>
                <div className="flex justify-between"><span>Conviction</span><span>{Math.round(report.qualityBreakdown.conviction)}/20</span></div>
                <div className="flex justify-between"><span>Tightness</span><span>{Math.round(report.qualityBreakdown.tightness)}/10</span></div>
                {report.qualityBreakdown.personalityBonus > 0 && (
                  <div className="flex justify-between"><span>Personality insight</span><span>+{report.qualityBreakdown.personalityBonus}</span></div>
                )}
                {report.qualityBreakdown.equipmentBonus > 0 && (
                  <div className="flex justify-between"><span>Equipment bonus</span><span>+{Math.round(report.qualityBreakdown.equipmentBonus)}</span></div>
                )}
              </div>
            )}
            {report.reputationDelta !== undefined && (
              <span className={`text-sm font-semibold ${report.reputationDelta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                Rep: {report.reputationDelta >= 0 ? "+" : ""}{report.reputationDelta}
              </span>
            )}
            {report.clubResponse && (
              <Badge variant="secondary" className="text-[10px] capitalize">
                Club: {report.clubResponse}
              </Badge>
            )}
          </div>

          {report.briefId && (
            <section className="rounded-xl border border-sky-400/20 bg-sky-400/[0.05] p-4" aria-labelledby="professional-artifact-heading">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-300">Professional artifact · Revision {report.revision ?? 1}</p>
                  <h3 id="professional-artifact-heading" className="mt-1 text-base font-bold text-white">{clubName ?? "Academy client"} recruitment recommendation</h3>
                </div>
                {brief && <Badge variant={brief.status === "fulfilled" ? "success" : brief.status === "expired" ? "destructive" : "warning"}>{brief.status}</Badge>}
              </div>
              <p className="mt-3 text-sm leading-6 text-zinc-300">{report.recruitmentNeed}</p>
              <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-lg bg-black/20 p-3"><dt className="text-zinc-500">Audience</dt><dd className="mt-1 font-semibold capitalize text-white">{report.intendedAudience?.replace(/([A-Z])/g, " $1")}</dd></div>
                <div className="rounded-lg bg-black/20 p-3"><dt className="text-zinc-500">Presentation</dt><dd className="mt-1 font-semibold capitalize text-white">{report.presentationApproach?.replace(/([A-Z])/g, " $1") ?? "Legacy neutral"}</dd></div>
                <div className="rounded-lg bg-black/20 p-3"><dt className="text-zinc-500">Projected role</dt><dd className="mt-1 font-semibold capitalize text-white">{report.projectedRole?.replace(/([A-Z])/g, " $1")}</dd></div>
                <div className="rounded-lg bg-black/20 p-3"><dt className="text-zinc-500">Next step</dt><dd className="mt-1 font-semibold capitalize text-white">{report.recommendedAction?.replace(/([A-Z])/g, " $1")}</dd></div>
                <div className="rounded-lg bg-black/20 p-3"><dt className="text-zinc-500">Price context</dt><dd className="mt-1 font-semibold text-white">£{report.estimatedWeeklyWage?.toLocaleString() ?? "—"}/wk</dd></div>
              </dl>
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {Object.entries(report.categoryVerdicts ?? {}).map(([category, verdict]) => verdict && (
                  <div key={category} className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold capitalize text-white">{category.replace(/([A-Z])/g, " $1")}</p>
                      <Badge variant={verdict.confidence === "high" ? "success" : verdict.confidence === "medium" ? "warning" : "outline"} className="text-[10px]">{verdict.confidence}</Badge>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-zinc-300">{verdict.verdict}</p>
                    <p className="mt-2 text-[11px] leading-4 text-amber-200/80">Unknown: {verdict.acknowledgedUncertainty}</p>
                    <p className="mt-2 text-[10px] text-zinc-500">{verdict.hypothesisIds.length} preserved hypothesis link{verdict.hypothesisIds.length === 1 ? "" : "s"}</p>
                  </div>
                ))}
              </div>
              {(report.riskFactors?.length ?? 0) > 0 && (
                <div className="mt-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Disclosed risks</p>
                  <div className="mt-2 flex flex-wrap gap-2">{report.riskFactors?.map((risk) => <Badge key={risk} variant="outline" className="text-[10px]">{risk}</Badge>)}</div>
                </div>
              )}
            </section>
          )}

          {clubDecision && (
            <section className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-300">Club decision</p>
                  <h3 className="mt-1 text-base font-bold capitalize text-white">{clubDecision.outcome.replace(/([A-Z])/g, " $1")}</h3>
                </div>
                {clubDecision.scoreBreakdown && <Badge variant="warning">Decision score {clubDecision.scoreBreakdown.total}/100</Badge>}
              </div>
              <ul className="mt-3 space-y-1.5 text-xs leading-5 text-zinc-300">
                {(clubDecision.reasons ?? (clubDecision.reason ? [clubDecision.reason] : [])).map((reason) => <li key={reason} className="flex gap-2"><span className="text-amber-300">•</span><span>{reason}</span></li>)}
              </ul>
              {clubDecision.scoreBreakdown && (
                <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
                  {Object.entries(clubDecision.scoreBreakdown).filter(([key]) => key !== "total").map(([key, value]) => (
                    <div key={key} className="rounded-md bg-black/20 p-2"><span className="block capitalize text-zinc-500">{key.replace(/([A-Z])/g, " $1")}</span><span className="font-semibold text-white">{value}/100</span></div>
                  ))}
                </div>
              )}
            </section>
          )}

          {caseTimeline && <ScoutingCaseTimelineView timeline={caseTimeline} />}

          {reviews.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Long-term recommendation reviews</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {reviews.map((review) => (
                  <div key={review.id} className="rounded-xl border border-violet-400/20 bg-violet-400/[0.05] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-white">{review.checkpoint === "oneSeason" ? "One-season review" : "Two-season review"}</p>
                      <Badge variant={review.status === "complete" ? "success" : "outline"}>{review.status}</Badge>
                    </div>
                    {review.status === "complete" ? (
                      <>
                        <p className="mt-3 text-2xl font-bold text-violet-200">{review.overallScore ?? "—"}<span className="text-sm text-zinc-500">/100</span></p>
                        <ul className="mt-2 space-y-1 text-[11px] leading-4 text-zinc-300">{(review.findings ?? []).slice(0, 4).map((finding) => <li key={finding}>{finding}</li>)}</ul>
                      </>
                    ) : (
                      <p className="mt-3 text-xs text-zinc-400">Due Season {review.dueSeason}, Week {review.dueWeek}. The original judgment stays open until real career evidence exists.</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Transfer Outcome */}
          {transferRecord && (transferRecord.outcome || transferRecord.outcomeReason) && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                Transfer Outcome
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                {transferRecord.outcome ? (
                  <span className={`inline-block rounded px-2 py-1 text-xs font-semibold border ${OUTCOME_COLORS[transferRecord.outcome]}`}>
                    {transferRecord.outcome.charAt(0).toUpperCase() + transferRecord.outcome.slice(1)}
                  </span>
                ) : (
                  <span className="inline-block rounded border border-zinc-500/20 bg-zinc-500/10 px-2 py-1 text-xs font-semibold text-zinc-300">
                    Outcome unresolved
                  </span>
                )}
                {transferRecord.outcomeReason && (
                  <span className={`inline-block rounded px-2 py-1 text-xs border ${OUTCOME_REASON_COLORS[transferRecord.outcomeReason]}`}>
                    {OUTCOME_REASON_SHORT_LABELS[transferRecord.outcomeReason]}
                  </span>
                )}
                {transferRecord.appearances != null && (
                  <span className="text-xs text-zinc-400">
                    {transferRecord.appearances} appearances
                  </span>
                )}
              </div>
              {(transferRecord.outcomeEvidence ?? []).length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-zinc-400">
                  {transferRecord.outcomeEvidence?.slice(0, 3).map((evidence) => (
                    <li key={evidence}>{evidence}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Summary */}
          {report.summary && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                Summary
              </h3>
              <p className="text-sm text-zinc-300 leading-relaxed">{report.summary}</p>
            </div>
          )}

          {/* Attribute assessments */}
          {report.attributeAssessments.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                Attribute Assessments
              </h3>
              <div className="space-y-1.5">
                {report.attributeAssessments.map((a, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 text-xs capitalize text-zinc-400">
                      {String(a.attribute).replace(/([A-Z])/g, " $1").trim()}
                    </span>
                    <div className="flex-1 relative h-1.5 rounded-full bg-[#27272a] overflow-hidden">
                      <div
                        className="absolute left-0 top-0 h-full rounded-full bg-emerald-500"
                        style={{ width: `${(a.estimatedValue / 20) * 100}%` }}
                      />
                    </div>
                    <span className="w-6 shrink-0 text-right text-xs font-mono font-bold text-white">
                      {a.estimatedValue}
                    </span>
                    <span className="w-12 shrink-0 text-right text-xs text-zinc-500">
                      [{a.confidenceRange[0]}–{a.confidenceRange[1]}]
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Strengths & weaknesses */}
          <div className="grid grid-cols-2 gap-4">
            {report.strengths.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                  Strengths
                </h3>
                <ul className="space-y-1">
                  {report.strengths.map((s, i) => (
                    <li key={i} className="text-xs text-emerald-400 flex items-center gap-1">
                      <span className="text-emerald-600">+</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.weaknesses.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                  Weaknesses
                </h3>
                <ul className="space-y-1">
                  {report.weaknesses.map((w, i) => (
                    <li key={i} className="text-xs text-red-400 flex items-center gap-1">
                      <span className="text-red-600">–</span> {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ListForSaleModalProps {
  reportId: string;
  playerName: string;
  onConfirm: (price: number, isExclusive: boolean) => void;
  onClose: () => void;
}

function ListForSaleModal({ reportId: _reportId, playerName, onConfirm, onClose }: ListForSaleModalProps) {
  const [priceInput, setPriceInput] = useState("");
  const [isExclusive, setIsExclusive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    const parsed = parseInt(priceInput, 10);
    if (isNaN(parsed) || parsed <= 0) {
      setError("Enter a valid price greater than 0.");
      return;
    }
    onConfirm(parsed, isExclusive);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="list-for-sale-title"
    >
      <div className="w-full max-w-sm rounded-xl border border-[#27272a] bg-[#0a0a0a] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#27272a] p-5">
          <div>
            <h2 id="list-for-sale-title" className="text-base font-bold flex items-center gap-2">
              <DollarSign size={16} className="text-emerald-400" aria-hidden="true" />
              List Report for Sale
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">{playerName}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-[#27272a] hover:text-white transition"
            aria-label="Cancel listing"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label htmlFor="listing-price" className="block text-xs font-medium text-zinc-400 mb-1.5">
              Asking price (£)
            </label>
            <input
              id="listing-price"
              type="number"
              min={1}
              value={priceInput}
              onChange={(e) => {
                setPriceInput(e.target.value);
                setError(null);
              }}
              placeholder="e.g. 500"
              className="w-full rounded-md border border-[#27272a] bg-[#141414] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              aria-describedby={error ? "price-error" : undefined}
              aria-invalid={error != null}
            />
            {error && (
              <p id="price-error" className="mt-1 text-xs text-red-400" role="alert">
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              id="listing-exclusive"
              type="checkbox"
              checked={isExclusive}
              onChange={(e) => setIsExclusive(e.target.checked)}
              className="h-4 w-4 rounded border-[#27272a] bg-[#141414] accent-emerald-500"
            />
            <label htmlFor="listing-exclusive" className="text-xs text-zinc-400 cursor-pointer">
              Exclusive listing (sold to one club only)
            </label>
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              className="flex-1"
            >
              List for Sale
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface PostSubmitListingPromptProps {
  report: ScoutReport;
  playerName: string;
  suggestedPrice: number;
  marketTemperature?: string;
  onList: (price: number, isExclusive: boolean) => void;
  onDismiss: () => void;
}

function PostSubmitListingPrompt({ report, playerName, suggestedPrice, marketTemperature, onList, onDismiss }: PostSubmitListingPromptProps) {
  const [price, setPrice] = React.useState(suggestedPrice.toString());
  const [isExclusive, setIsExclusive] = React.useState(false);
  const exclusivePrice = Math.round(suggestedPrice * 2.0);

  const displayPrice = isExclusive ? exclusivePrice : suggestedPrice;

  return (
    <Card className="border-emerald-500/30 bg-emerald-950/10 mb-6">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15">
            <DollarSign size={20} className="text-emerald-400" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-white mb-1">List your report for sale?</h3>
            <p className="text-xs text-zinc-400 mb-3">
              <span className="text-white font-medium">{playerName}</span> — {CONVICTION_LABELS[report.conviction]} · Craft {report.qualityScore}/100
            </p>
            <div className="flex flex-wrap items-end gap-3 mb-3">
              <div>
                <label htmlFor="prompt-price" className="block text-[10px] text-zinc-500 mb-1">
                  Asking price (£)
                </label>
                <input
                  id="prompt-price"
                  type="number"
                  min={1}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-28 rounded-md border border-[#27272a] bg-[#141414] px-2.5 py-1.5 text-sm text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="prompt-exclusive"
                  type="checkbox"
                  checked={isExclusive}
                  onChange={(e) => {
                    setIsExclusive(e.target.checked);
                    setPrice(e.target.checked ? exclusivePrice.toString() : suggestedPrice.toString());
                  }}
                  className="h-4 w-4 rounded border-[#27272a] bg-[#141414] accent-emerald-500"
                />
                <label htmlFor="prompt-exclusive" className="text-xs text-zinc-400 cursor-pointer">
                  Exclusive
                </label>
              </div>
              <p className="text-[10px] text-zinc-500">
                Suggested: {formatValue(displayPrice)}{marketTemperature ? ` · Market: ${marketTemperature}` : ""}
              </p>
            </div>
            <p className="text-[9px] text-zinc-600 -mt-1 mb-2">
              {isExclusive
                ? "One buyer only — higher price per sale, no competing bids."
                : "Multiple clubs can bid — lower per-sale price but total revenue often higher."}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  const parsed = parseInt(price, 10);
                  if (!isNaN(parsed) && parsed > 0) onList(parsed, isExclusive);
                }}
              >
                List Now
              </Button>
              <Button size="sm" variant="ghost" onClick={onDismiss}>
                Skip for Now
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ReportHistory() {
  const {
    gameState, selectPlayer, setScreen,
    listReportForSale, withdrawReportListing,
    acceptMarketplaceBid, declineMarketplaceBid, acceptExclusiveUpgradeBid,
    comparisonReportIds, addToComparison, removeFromComparison, clearComparison,
    pendingListingReportId, dismissPendingListing,
  } = useGameStore(useShallow((state) => ({
    gameState: state.gameState,
    selectPlayer: state.selectPlayer,
    setScreen: state.setScreen,
    listReportForSale: state.listReportForSale,
    withdrawReportListing: state.withdrawReportListing,
    acceptMarketplaceBid: state.acceptMarketplaceBid,
    declineMarketplaceBid: state.declineMarketplaceBid,
    acceptExclusiveUpgradeBid: state.acceptExclusiveUpgradeBid,
    comparisonReportIds: state.comparisonReportIds,
    addToComparison: state.addToComparison,
    removeFromComparison: state.removeFromComparison,
    clearComparison: state.clearComparison,
    pendingListingReportId: state.pendingListingReportId,
    dismissPendingListing: state.dismissPendingListing,
  })));
  const [selectedReport, setSelectedReport] = useState<ScoutReport | null>(null);
  const [listingReport, setListingReport] = useState<ScoutReport | null>(null);
  const [expandedBidsListingId, setExpandedBidsListingId] = useState<string | null>(null);
  const [expandedJournalId, setExpandedJournalId] = useState<string | null>(null);
  const [reportQuery, setReportQuery] = useState("");
  const [reportPage, setReportPage] = useState(1);

  if (!gameState) return null;

  const hasFinances = gameState.finances != null;
  const reportListings: ReportListing[] = gameState.finances?.reportListings ?? [];

  // Build a lookup: reportId -> active listing (most recent non-withdrawn/expired)
  const listingByReportId = reportListings.reduce<Record<string, ReportListing>>((acc, listing) => {
    if (listing.status === "active" || listing.status === "sold") {
      acc[listing.reportId] = listing;
    }
    return acc;
  }, {});

  const reports = Object.values(gameState.reports).sort(
    (a, b) => b.submittedWeek - a.submittedWeek || b.submittedSeason - a.submittedSeason
  );

  // Build lookup of transfer records by report ID for outcome display
  const transferByReportId = new Map<string, TransferRecord>();
  for (const tr of gameState.transferRecords ?? []) {
    transferByReportId.set(tr.reportId, tr);
  }

  const totalReports = reports.length;
  const avgQuality =
    totalReports > 0
      ? Math.round(reports.reduce((sum, r) => sum + r.qualityScore, 0) / totalReports)
      : 0;

  const convictionCounts = reports.reduce(
    (acc, r) => {
      acc[r.conviction] = (acc[r.conviction] ?? 0) + 1;
      return acc;
    },
    {} as Record<ConvictionLevel, number>
  );

  const isIndependent = gameState.scout.careerPath === "independent";
  const activeListingsCount = reportListings.filter((l) => l.status === "active").length;
  const totalPendingBids = reportListings.reduce(
    (sum, l) => sum + l.bids.filter((b) => b.status === "pending").length,
    0,
  );

  // Sort reports: pending bids first, then by submission date
  const sortedReports = [...reports].sort((a, b) => {
    const aListing = listingByReportId[a.id];
    const bListing = listingByReportId[b.id];
    const aPending = aListing?.bids.filter((bid) => bid.status === "pending").length ?? 0;
    const bPending = bListing?.bids.filter((bid) => bid.status === "pending").length ?? 0;
    if (aPending > 0 && bPending === 0) return -1;
    if (bPending > 0 && aPending === 0) return 1;
    return b.submittedWeek - a.submittedWeek || b.submittedSeason - a.submittedSeason;
  });
  const normalizedReportQuery = reportQuery.trim().toLowerCase();
  const filteredReports = normalizedReportQuery.length === 0
    ? sortedReports
    : sortedReports.filter((report) => {
        const player = resolvePlayerEntity(gameState, report.playerId)?.player;
        const playerName = player ? `${player.firstName} ${player.lastName}` : "unknown player";
        return playerName.toLowerCase().includes(normalizedReportQuery)
          || report.summary.toLowerCase().includes(normalizedReportQuery)
          || CONVICTION_LABELS[report.conviction].toLowerCase().includes(normalizedReportQuery);
      });
  const reportsPerPage = 20;
  const reportPageCount = Math.max(1, Math.ceil(filteredReports.length / reportsPerPage));
  const safeReportPage = Math.min(reportPage, reportPageCount);
  const visibleReports = filteredReports.slice(
    (safeReportPage - 1) * reportsPerPage,
    safeReportPage * reportsPerPage,
  );
  const journalEntries = Object.values(
    gameState.reflectionJournal ?? {},
  ).sort((a: ReflectionJournalEntry, b: ReflectionJournalEntry) =>
    b.season - a.season || b.week - a.week || b.createdAt - a.createdAt,
  );
  const scoutingCases = Object.values(gameState.scoutingCases ?? {});
  const casesNeedingDelivery = scoutingCases.filter(
    (scoutingCase) => scoutingCase.status === "reported" && scoutingCase.deliveryIds.length === 0,
  );
  const awaitingDecisionDeliveries = Object.values(gameState.reportDeliveries ?? {}).filter(
    (delivery) => delivery.status === "awaitingDecision",
  );
  const placedCases = scoutingCases.filter((scoutingCase) => scoutingCase.status === "placed");
  const gutFeelingById = new Map(
    gameState.gutFeelings.map((gutFeeling) => [gutFeeling.id, gutFeeling] as const),
  );

  // Post-submit listing prompt data
  const pendingReport = pendingListingReportId ? gameState.reports[pendingListingReportId] : null;
  const pendingReportPlayer = pendingReport
    ? resolvePlayerEntity(gameState, pendingReport.playerId)?.player ?? null
    : null;
  const pendingReportPrice = pendingReport && gameState.finances
    ? calculateReportPrice(pendingReport, gameState.scout, undefined, false, gameState.finances.marketTemperature)
    : 0;

  const selectedPlayerName = selectedReport
    ? (() => {
        const p = resolvePlayerEntity(gameState, selectedReport.playerId)?.player;
        return p ? `${p.firstName} ${p.lastName}` : "Unknown Player";
      })()
    : "";
  const selectedReportDelivery = selectedReport
    ? Object.values(gameState.reportDeliveries).find((delivery) =>
        delivery.reportId === selectedReport.id && delivery.channel === "directPlacement"
      )
      ?? Object.values(gameState.reportDeliveries).find((delivery) => delivery.reportId === selectedReport.id)
    : undefined;
  const selectedClubDecision = selectedReportDelivery?.decisionId
    ? gameState.clubDecisions[selectedReportDelivery.decisionId]
    : undefined;
  const selectedBrief = selectedReport?.briefId
    ? gameState.youthRecruitmentBriefs[selectedReport.briefId]
    : undefined;
  const selectedReviews = selectedReport
    ? Object.values(gameState.recommendationReviews).filter((review) => review.reportId === selectedReport.id)
    : [];
  const selectedAudienceClubName = selectedReport?.intendedClubId
    ? gameState.clubs[selectedReport.intendedClubId]?.name
    : undefined;
  const selectedCaseId = selectedReport
    ? selectedReport.caseId
      ?? scoutingCases.find((scoutingCase) => scoutingCase.reportIds.includes(selectedReport.id))?.id
    : undefined;
  const selectedCaseTimeline = selectedCaseId
    ? buildScoutingCaseTimeline(gameState, selectedCaseId) ?? undefined
    : undefined;

  const listingPlayerName = listingReport
    ? (() => {
        const p = resolvePlayerEntity(gameState, listingReport.playerId)?.player;
        return p ? `${p.firstName} ${p.lastName}` : "Unknown Player";
      })()
    : "";

  function handleConfirmListing(price: number, isExclusive: boolean) {
    if (!listingReport) return;
    listReportForSale(listingReport.id, price, isExclusive);
    setListingReport(null);
  }

  const renderTransferOutcome = (report: ScoutReport) => {
    const transferRecord = transferByReportId.get(report.id);
    if (!transferRecord) return <span className="text-zinc-600 text-xs">—</span>;
    if (!transferRecord.outcome) {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="text-zinc-500 text-xs">Unresolved</span>
          {transferRecord.outcomeReason && (
            <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] border ${OUTCOME_REASON_COLORS[transferRecord.outcomeReason]}`}>
              {OUTCOME_REASON_SHORT_LABELS[transferRecord.outcomeReason]}
            </span>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-0.5">
        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold border ${OUTCOME_COLORS[transferRecord.outcome]}`}>
          {transferRecord.outcome.charAt(0).toUpperCase() + transferRecord.outcome.slice(1)}
        </span>
        {transferRecord.outcomeReason && (
          <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] border ${OUTCOME_REASON_COLORS[transferRecord.outcomeReason]}`}>
            {OUTCOME_REASON_SHORT_LABELS[transferRecord.outcomeReason]}
          </span>
        )}
      </div>
    );
  };

  const renderDeliveryStatus = (report: ScoutReport) => {
    const deliveries = Object.values(gameState.reportDeliveries ?? {}).filter(
      (delivery) => delivery.reportId === report.id,
    );
    const directDelivery = deliveries.find((delivery) => delivery.channel === "directPlacement");
    if (directDelivery?.status === "awaitingDecision") {
      return <Badge variant="warning" className="text-[10px]">Awaiting club decision</Badge>;
    }
    if (directDelivery?.decisionId) {
      const decision = gameState.clubDecisions?.[directDelivery.decisionId];
      if (decision) {
        return (
          <Badge
            variant={decision.outcome === "accepted"
              ? "success"
              : decision.outcome === "trial" || decision.outcome === "followUpRequested"
                ? "warning"
                : "destructive"}
            className="text-[10px] capitalize"
          >
            {decision.outcome}
          </Badge>
        );
      }
    }
    const marketplaceSales = deliveries.filter((delivery) => delivery.channel === "marketplaceSale");
    if (marketplaceSales.length > 0) {
      return (
        <Badge variant="secondary" className="text-[10px]">
          Intel sold to {marketplaceSales.length} club{marketplaceSales.length === 1 ? "" : "s"}
        </Badge>
      );
    }
    const listing = listingByReportId[report.id];
    if (listing?.status === "active") {
      return <Badge variant="outline" className="text-[10px]">Listed</Badge>;
    }
    return <span className="text-xs text-zinc-300">Not delivered</span>;
  };

  const renderListingBids = (listing: ReportListing) => (
    <div className="space-y-2">
      <p className="text-xs font-medium text-zinc-400">
        Bids on this listing ({listing.bids.filter((b) => b.status === "pending").length} pending)
      </p>
      {listing.bids.map((bid: MarketplaceBid) => {
        const club = gameState.clubs[bid.clubId];
        const clubName = club?.name ?? "Unknown Club";
        const isUpgrade = bid.isExclusiveUpgrade === true;
        return (
          <div
            key={bid.id}
            className={`flex flex-col gap-2 rounded border p-3 text-xs sm:flex-row sm:items-center sm:gap-3 ${
              isUpgrade && bid.status === "pending"
                ? "border-amber-500/40 bg-amber-950/20"
                : "border-[#27272a] bg-[#141414]"
            }`}
          >
            <div className="flex items-center gap-2">
              {isUpgrade && (
                <Crown size={14} className="shrink-0 text-amber-400" aria-hidden="true" />
              )}
              <span className="font-medium text-zinc-300">
                {clubName}
                <span className="ml-1 text-[9px] text-zinc-500">({bid.needMatchScore}/110 match)</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Tooltip content={bid.bidReason ?? "Market-driven bid"} side="top">
                <span className={`cursor-help font-bold ${isUpgrade ? "text-amber-400" : "text-emerald-400"}`}>
                  £{bid.amount.toLocaleString()}
                </span>
              </Tooltip>
              {isUpgrade && bid.status === "pending" && (
                <Badge className="border-amber-500/40 bg-amber-500/20 text-[9px] text-amber-400">
                  EXCLUSIVE UPGRADE
                </Badge>
              )}
              <Badge
                variant={
                  bid.status === "pending" ? "warning"
                  : bid.status === "accepted" ? "success"
                  : bid.status === "declined" ? "destructive"
                  : "outline"
                }
                className="text-[10px]"
              >
                {bid.status}
              </Badge>
              {bid.status === "pending" && (
                <span className="text-zinc-500">expires wk {bid.expiryWeek}</span>
              )}
            </div>
            {bid.status === "pending" && (
              <div className="flex flex-wrap items-center gap-1 sm:ml-auto">
                {isUpgrade && (
                  <span className="mr-1 flex items-center gap-0.5 text-[9px] text-amber-400/70">
                    <AlertTriangle size={10} aria-hidden="true" />
                    Declines other bids
                  </span>
                )}
                <Button
                  size="sm"
                  className={`min-h-11 text-xs ${
                    isUpgrade
                      ? "bg-amber-600 hover:bg-amber-500"
                      : "bg-emerald-700 hover:bg-emerald-600"
                  }`}
                  onClick={() =>
                    isUpgrade
                      ? acceptExclusiveUpgradeBid(bid.id)
                      : acceptMarketplaceBid(bid.id)
                  }
                >
                  {isUpgrade ? "Accept Exclusive" : "Accept"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-11 text-xs text-zinc-300 hover:text-red-300"
                  onClick={() => declineMarketplaceBid(bid.id)}
                >
                  Decline
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderReportActions = (
    report: ScoutReport,
    playerName: string,
    listing: ReportListing | undefined,
  ) => (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setSelectedReport(report)}
        aria-label={`View full report for ${playerName}`}
      >
        View
      </Button>
      {hasFinances && (
        <>
          {listing?.status === "active" && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => withdrawReportListing(listing.id)}
              className="text-zinc-400 hover:text-red-400"
              aria-label={`Withdraw listing for ${playerName} report`}
            >
              Withdraw
            </Button>
          )}
          {listing?.status === "sold" && (
            <Badge variant="success" className="text-[10px]">
              Sold
            </Badge>
          )}
          {listing == null && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setListingReport(report)}
              className="text-zinc-400 hover:text-emerald-400"
              aria-label={`List report for ${playerName} for sale`}
            >
              <DollarSign size={13} aria-hidden="true" />
              List
            </Button>
          )}
          {listing?.status === "active" && (
            <Badge variant="outline" className="border-emerald-800 text-[10px] text-emerald-400">
              Listed
            </Badge>
          )}
          {listing?.status === "active" && listing.bids.filter((b) => b.status === "pending").length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setExpandedBidsListingId(
                expandedBidsListingId === listing.id ? null : listing.id,
              )}
              className="h-6 gap-1 text-xs text-amber-400 hover:text-amber-300"
              aria-expanded={expandedBidsListingId === listing.id}
            >
              <Gavel size={12} aria-hidden="true" />
              {listing.bids.filter((b) => b.status === "pending").length} bid{listing.bids.filter((b) => b.status === "pending").length > 1 ? "s" : ""}
            </Button>
          )}
        </>
      )}
    </div>
  );

  return (
    <GameLayout>
      <div className="relative min-h-full p-6 [&_.text-zinc-500]:text-zinc-400 [&_.text-zinc-600]:text-zinc-400">
        <ScreenBackground src="/images/backgrounds/reports-desk.png" opacity={0.82} />
        <div className="relative z-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-zinc-400">Filed judgments, marketplace outcomes, and your reflection journal</p>
        </div>

        {/* Market temperature banner (independent scouts only) */}
        {isIndependent && hasFinances && (() => {
          const marketTemp = gameState.finances?.marketTemperature ?? "normal";
          return (
            <div className={`mb-4 flex items-center gap-2 rounded-lg border px-4 py-2 text-xs ${
              marketTemp === "deadline" ? "border-red-500/30 bg-red-950/10 text-red-400"
              : marketTemp === "hot" ? "border-amber-500/30 bg-amber-950/10 text-amber-400"
              : marketTemp === "cold" ? "border-blue-500/30 bg-blue-950/10 text-blue-400"
              : "border-zinc-700 bg-zinc-900/50 text-zinc-400"
            }`}>
              <TrendingUp size={14} />
              <span className="font-medium">Market: {marketTemp}</span>
              <span className="text-zinc-500">
                {marketTemp === "deadline" ? "(+80% pricing)"
                 : marketTemp === "hot" ? "(+30% pricing)"
                 : marketTemp === "cold" ? "(-30% pricing)"
                 : "(baseline pricing)"}
              </span>
            </div>
          );
        })()}

        {/* Post-submit listing prompt (independent scouts only) */}
        {isIndependent && pendingReport && pendingReportPlayer && (
          <div data-tutorial-id="report-marketplace-prompt" className="mb-4">
            <PostSubmitListingPrompt
              report={pendingReport}
              playerName={`${pendingReportPlayer.firstName} ${pendingReportPlayer.lastName}`}
              suggestedPrice={pendingReportPrice}
              marketTemperature={gameState.finances?.marketTemperature}
              onList={(price, isExclusive) => {
                listReportForSale(pendingReport.id, price, isExclusive);
                dismissPendingListing();
              }}
              onDismiss={dismissPendingListing}
            />
          </div>
        )}

        {/* Stats */}
        <div className={`mb-6 grid grid-cols-2 gap-4 ${isIndependent ? "sm:grid-cols-3 lg:grid-cols-6" : "sm:grid-cols-4"}`}>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-zinc-400">Total Reports</p>
              <p className="text-2xl font-bold text-emerald-400">{totalReports}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-zinc-400">Avg Craft</p>
              <p className={`text-2xl font-bold ${qualityColor(avgQuality)}`}>{avgQuality}</p>
            </CardContent>
          </Card>
          {(["tablePound", "strongRecommend"] as ConvictionLevel[]).map((c) => (
            <Card key={c}>
              <CardContent className="p-4">
                <p className="text-xs text-zinc-400">{CONVICTION_LABELS[c]}</p>
                <p className="text-2xl font-bold">{convictionCounts[c] ?? 0}</p>
              </CardContent>
            </Card>
          ))}
          {isIndependent && (
            <>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-zinc-400">Active Listings</p>
                  <p className="text-2xl font-bold text-emerald-400">{activeListingsCount}</p>
                </CardContent>
              </Card>
              <Card className={totalPendingBids > 0 ? "border-amber-500/30" : ""}>
                <CardContent className="p-4">
                  <p className="text-xs text-zinc-400">Pending Bids</p>
                  <p className={`text-2xl font-bold ${totalPendingBids > 0 ? "text-amber-400" : "text-zinc-500"}`}>
                    {totalPendingBids}
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <Card className="mb-6 border-emerald-900/50 bg-zinc-950/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recommendation Action Queue</CardTitle>
            <p className="text-sm text-zinc-300">
              Filed opinions, club decisions, and placed-player follow-up from the same case history.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 pt-0 sm:grid-cols-3">
            <button
              type="button"
              className="min-h-11 rounded-lg border border-zinc-700 bg-zinc-900/70 p-3 text-left transition hover:border-emerald-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
              onClick={() => {
                const nextCase = casesNeedingDelivery[0];
                const report = nextCase ? gameState.reports[nextCase.reportIds.at(-1) ?? ""] : undefined;
                if (report && isIndependent) setListingReport(report);
                else if (nextCase) {
                  selectPlayer(nextCase.playerId);
                  setScreen("playerProfile");
                }
              }}
              disabled={casesNeedingDelivery.length === 0}
            >
              <span className="block text-2xl font-bold text-emerald-300">{casesNeedingDelivery.length}</span>
              <span className="text-xs text-zinc-300">Filed reports needing delivery</span>
            </button>
            <button
              type="button"
              className="min-h-11 rounded-lg border border-zinc-700 bg-zinc-900/70 p-3 text-left transition hover:border-amber-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
              onClick={() => {
                const delivery = awaitingDecisionDeliveries[0];
                const scoutingCase = delivery ? gameState.scoutingCases[delivery.caseId] : undefined;
                if (scoutingCase) {
                  selectPlayer(scoutingCase.playerId);
                  setScreen("playerProfile");
                }
              }}
              disabled={awaitingDecisionDeliveries.length === 0}
            >
              <span className="block text-2xl font-bold text-amber-300">{awaitingDecisionDeliveries.length}</span>
              <span className="text-xs text-zinc-300">Awaiting club decisions</span>
            </button>
            <button
              type="button"
              className="min-h-11 rounded-lg border border-zinc-700 bg-zinc-900/70 p-3 text-left transition hover:border-sky-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
              onClick={() => setScreen("career")}
              disabled={placedCases.length === 0}
            >
              <span className="block text-2xl font-bold text-sky-300">{placedCases.length}</span>
              <span className="text-xs text-zinc-300">Placed cases to track</span>
            </button>
          </CardContent>
        </Card>

        {/* Comparison action bar */}
        {comparisonReportIds.length > 0 && (
          <div className="mb-4 flex flex-col gap-3 rounded-lg border border-emerald-800/50 bg-emerald-950/30 p-3 sm:flex-row sm:items-center" data-tutorial-id="reporthistory-compare">
            <GitCompareArrows size={16} className="text-emerald-400 shrink-0" aria-hidden="true" />
            <span className="text-sm text-zinc-300">
              {comparisonReportIds.length} report{comparisonReportIds.length > 1 ? "s" : ""} selected for comparison
              {comparisonReportIds.length < 2 && " (select at least 2)"}
            </span>
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <Button
                size="sm"
                variant="ghost"
                onClick={clearComparison}
                className="text-zinc-400 hover:text-red-400"
              >
                Clear
              </Button>
              <Button
                size="sm"
                disabled={comparisonReportIds.length < 2}
                onClick={() => setScreen("reportComparison")}
              >
                Compare ({comparisonReportIds.length})
              </Button>
            </div>
          </div>
        )}

        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <label className="block min-w-0 sm:max-w-sm sm:flex-1">
            <span className="mb-1 block text-xs font-medium text-zinc-300">Search filed reports</span>
            <input
              type="search"
              value={reportQuery}
              onChange={(event) => {
                setReportQuery(event.target.value);
                setReportPage(1);
              }}
              placeholder="Player, summary, or conviction"
              className="min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-950/80 px-3 text-sm text-white placeholder:text-zinc-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
            />
          </label>
          <p className="text-xs text-zinc-300" role="status">
            {filteredReports.length} report{filteredReports.length === 1 ? "" : "s"}
          </p>
        </div>

        {/* Reports table */}
        <Card data-tutorial-id="reporthistory-list">
          <CardContent className="p-0">
            {filteredReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText size={32} className="mb-3 text-zinc-700" aria-hidden="true" />
                <p className="text-sm text-zinc-300">
                  {reports.length === 0 ? "No reports filed yet." : "No reports match that search."}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  {reports.length === 0
                    ? "Observe players and write your first scouting report."
                    : "Try a player name, report summary, or conviction level."}
                </p>
                {reports.length === 0 && (
                  <Button className="mt-4 min-h-11" onClick={() => setScreen("calendar")}>
                    Plan scouting work
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="space-y-3 p-3 md:hidden">
                  {visibleReports.map((report) => {
                    const player = resolvePlayerEntity(gameState, report.playerId)?.player;
                    const playerName = player
                      ? `${player.firstName} ${player.lastName}`
                      : "Unknown";
                    const listing = listingByReportId[report.id];
                    const isInComparison = comparisonReportIds.includes(report.id);
                    const comparisonFull = comparisonReportIds.length >= 3 && !isInComparison;
                    const hasPendingBids = listing?.bids.some((b) => b.status === "pending") ?? false;
                    return (
                      <div
                        key={`${report.id}-mobile`}
                        className={`rounded-lg border p-4 ${
                          isInComparison
                            ? "border-emerald-700/60 bg-emerald-950/20"
                            : hasPendingBids
                              ? "border-amber-500/30 bg-amber-950/10"
                              : "border-[#27272a] bg-[#101010]"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={isInComparison}
                            disabled={comparisonFull}
                            onChange={() => {
                              if (isInComparison) {
                                removeFromComparison(report.id);
                              } else {
                                addToComparison(report.id);
                              }
                            }}
                            className="mt-1 h-4 w-4 rounded border-[#27272a] bg-[#141414] accent-emerald-500 disabled:opacity-30"
                            aria-label={`${isInComparison ? "Remove from" : "Add to"} comparison for ${playerName}`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <button
                                onClick={() => {
                                  selectPlayer(report.playerId);
                                  setScreen("playerProfile");
                                }}
                                className="text-left font-medium text-white transition hover:text-emerald-400"
                                aria-label={`View profile for ${playerName}`}
                              >
                                {playerName}
                              </button>
                              <span className="text-xs text-zinc-500">
                                W{report.submittedWeek} S{report.submittedSeason}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Badge variant={CONVICTION_VARIANT[report.conviction]} className="text-[10px]">
                                {CONVICTION_LABELS[report.conviction]}
                              </Badge>
                              <span className={`text-xs font-semibold ${qualityColor(report.qualityScore)}`}>
                                {report.qualityScore}/100
                              </span>
                              {report.reputationDelta !== undefined ? (
                                <span className={`text-xs font-semibold ${report.reputationDelta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                  Rep {report.reputationDelta >= 0 ? "+" : ""}{report.reputationDelta}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                          <div>
                            <dt className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                              Delivery / Club Decision
                            </dt>
                            <dd className="mt-1">
                              {renderDeliveryStatus(report)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                              Player Movement
                            </dt>
                            <dd className="mt-1">{renderTransferOutcome(report)}</dd>
                          </div>
                        </dl>

                        <div className="mt-4">
                          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                            Actions
                          </p>
                          {renderReportActions(report, playerName, listing)}
                        </div>

                        {listing && expandedBidsListingId === listing.id && listing.bids.length > 0 && (
                          <div className="mt-4 border-t border-[#27272a] pt-4">
                            {renderListingBids(listing)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#27272a] text-left text-xs text-zinc-500">
                      <th className="w-10 px-2 py-3 font-medium text-center">
                        <GitCompareArrows size={13} className="inline text-zinc-500" aria-label="Compare" />
                      </th>
                      <th className="px-4 py-3 font-medium">Player</th>
                      <th className="px-4 py-3 font-medium">Conviction</th>
                      <th className="px-4 py-3 font-medium">Craft</th>
                      <th className="px-4 py-3 font-medium">Rep</th>
                      <th className="px-4 py-3 font-medium">Week</th>
                      <th className="px-4 py-3 font-medium">Delivery / Decision</th>
                      <th className="px-4 py-3 font-medium">Player Movement</th>
                      <th className="px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleReports.map((report) => {
                      const player = resolvePlayerEntity(gameState, report.playerId)?.player;
                      const playerName = player
                        ? `${player.firstName} ${player.lastName}`
                        : "Unknown";
                      const listing = listingByReportId[report.id];
                      const isInComparison = comparisonReportIds.includes(report.id);
                      const comparisonFull = comparisonReportIds.length >= 3 && !isInComparison;
                      const hasPendingBids = listing?.bids.some((b) => b.status === "pending") ?? false;
                      return (
                        <React.Fragment key={report.id}>
                        <tr
                          className={`border-b border-[#27272a] transition hover:bg-[#141414] ${
                            isInComparison ? "bg-emerald-950/20" : hasPendingBids ? "bg-amber-950/10" : ""
                          }`}
                        >
                          <td className="w-10 px-2 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={isInComparison}
                              disabled={comparisonFull}
                              onChange={() => {
                                if (isInComparison) {
                                  removeFromComparison(report.id);
                                } else {
                                  addToComparison(report.id);
                                }
                              }}
                              className="h-4 w-4 rounded border-[#27272a] bg-[#141414] accent-emerald-500 disabled:opacity-30"
                              aria-label={`${isInComparison ? "Remove from" : "Add to"} comparison for ${playerName}`}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => {
                                selectPlayer(report.playerId);
                                setScreen("playerProfile");
                              }}
                              className="font-medium text-white hover:text-emerald-400 transition text-left"
                              aria-label={`View profile for ${playerName}`}
                            >
                              {playerName}
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={CONVICTION_VARIANT[report.conviction]} className="text-[10px]">
                              {CONVICTION_LABELS[report.conviction]}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`font-semibold ${qualityColor(report.qualityScore)}`}>
                              {report.qualityScore}
                            </span>
                            <span className="text-zinc-600">/100</span>
                          </td>
                          <td className="px-4 py-3">
                            {report.reputationDelta !== undefined ? (
                              <span className={`text-xs font-semibold ${report.reputationDelta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                                {report.reputationDelta >= 0 ? "+" : ""}{report.reputationDelta}
                              </span>
                            ) : (
                              <span className="text-zinc-600 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-zinc-400">
                            W{report.submittedWeek} S{report.submittedSeason}
                          </td>
                          <td className="px-4 py-3">
                            {renderDeliveryStatus(report)}
                          </td>
                          <td className="px-4 py-3">
                            {(() => {
                              const tr = transferByReportId.get(report.id);
                              if (!tr) return <span className="text-zinc-600 text-xs">—</span>;
                              if (!tr.outcome) {
                                return (
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-zinc-500 text-xs">Unresolved</span>
                                    {tr.outcomeReason && (
                                      <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] border ${OUTCOME_REASON_COLORS[tr.outcomeReason]}`}>
                                        {OUTCOME_REASON_SHORT_LABELS[tr.outcomeReason]}
                                      </span>
                                    )}
                                  </div>
                                );
                              }
                              return (
                                <div className="flex flex-col gap-0.5">
                                  <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold border ${OUTCOME_COLORS[tr.outcome]}`}>
                                    {tr.outcome.charAt(0).toUpperCase() + tr.outcome.slice(1)}
                                  </span>
                                  {tr.outcomeReason && (
                                    <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] border ${OUTCOME_REASON_COLORS[tr.outcomeReason]}`}>
                                      {OUTCOME_REASON_SHORT_LABELS[tr.outcomeReason]}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setSelectedReport(report)}
                                aria-label={`View full report for ${playerName}`}
                              >
                                View
                              </Button>
                              {hasFinances && (
                                <>
                                  {listing?.status === "active" && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => withdrawReportListing(listing.id)}
                                      className="text-zinc-400 hover:text-red-400"
                                      aria-label={`Withdraw listing for ${playerName} report`}
                                    >
                                      Withdraw
                                    </Button>
                                  )}
                                  {listing?.status === "sold" && (
                                    <Badge variant="success" className="text-[10px]">
                                      Sold
                                    </Badge>
                                  )}
                                  {listing == null && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setListingReport(report)}
                                      className="text-zinc-400 hover:text-emerald-400"
                                      aria-label={`List report for ${playerName} for sale`}
                                    >
                                      <DollarSign size={13} aria-hidden="true" />
                                      List
                                    </Button>
                                  )}
                                  {listing?.status === "active" && (
                                    <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-800">
                                      Listed
                                    </Badge>
                                  )}
                                  {listing?.status === "active" && listing.bids.filter((b) => b.status === "pending").length > 0 && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setExpandedBidsListingId(
                                        expandedBidsListingId === listing.id ? null : listing.id,
                                      )}
                                      className="text-xs h-6 gap-1 text-amber-400 hover:text-amber-300"
                                    >
                                      <Gavel size={12} aria-hidden="true" />
                                      {listing.bids.filter((b) => b.status === "pending").length} bid{listing.bids.filter((b) => b.status === "pending").length > 1 ? "s" : ""}
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                        {listing && expandedBidsListingId === listing.id && listing.bids.length > 0 && (
                          <tr key={`${report.id}-bids`} className="bg-zinc-900/60">
                            <td colSpan={9} className="px-6 py-3">
                              <div className="space-y-2">
                                <p className="text-xs font-medium text-zinc-400 mb-2">
                                  Bids on this listing ({listing.bids.filter((b) => b.status === "pending").length} pending)
                                </p>
                                {listing.bids.map((bid: MarketplaceBid) => {
                                  const club = gameState.clubs[bid.clubId];
                                  const clubName = club?.name ?? "Unknown Club";
                                  const isUpgrade = bid.isExclusiveUpgrade === true;
                                  return (
                                    <div
                                      key={bid.id}
                                      className={`flex items-center gap-3 rounded border p-2 text-xs ${
                                        isUpgrade && bid.status === "pending"
                                          ? "border-amber-500/40 bg-amber-950/20"
                                          : "border-[#27272a] bg-[#141414]"
                                      }`}
                                    >
                                      {isUpgrade && (
                                        <Crown size={14} className="text-amber-400 shrink-0" aria-hidden="true" />
                                      )}
                                      <span className="text-zinc-300 font-medium min-w-[120px]">
                                        {clubName}
                                        <span className="text-zinc-500 text-[9px] ml-1">({bid.needMatchScore}/110 match)</span>
                                      </span>
                                      <Tooltip content={bid.bidReason ?? "Market-driven bid"} side="top">
                                        <span className={`font-bold cursor-help ${isUpgrade ? "text-amber-400" : "text-emerald-400"}`}>
                                          £{bid.amount.toLocaleString()}
                                        </span>
                                      </Tooltip>
                                      {isUpgrade && bid.status === "pending" && (
                                        <Badge className="text-[9px] bg-amber-500/20 text-amber-400 border-amber-500/40">
                                          EXCLUSIVE UPGRADE
                                        </Badge>
                                      )}
                                      <Badge
                                        variant={
                                          bid.status === "pending" ? "warning"
                                          : bid.status === "accepted" ? "success"
                                          : bid.status === "declined" ? "destructive"
                                          : "outline"
                                        }
                                        className="text-[10px]"
                                      >
                                        {bid.status}
                                      </Badge>
                                      {bid.status === "pending" && (
                                        <span className="text-zinc-500">
                                          expires wk {bid.expiryWeek}
                                        </span>
                                      )}
                                      {bid.status === "pending" && (
                                        <div className="ml-auto flex gap-1">
                                          {isUpgrade && (
                                            <span className="text-[9px] text-amber-400/70 mr-1 flex items-center gap-0.5">
                                              <AlertTriangle size={10} aria-hidden="true" />
                                              Declines other bids
                                            </span>
                                          )}
                                          <Button
                                            size="sm"
                                            className={`min-h-11 text-xs ${
                                              isUpgrade
                                                ? "bg-amber-600 hover:bg-amber-500"
                                                : "bg-emerald-700 hover:bg-emerald-600"
                                            }`}
                                            onClick={() =>
                                              isUpgrade
                                                ? acceptExclusiveUpgradeBid(bid.id)
                                                : acceptMarketplaceBid(bid.id)
                                            }
                                          >
                                            {isUpgrade ? "Accept Exclusive" : "Accept"}
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="min-h-11 text-xs text-zinc-300 hover:text-red-300"
                                            onClick={() => declineMarketplaceBid(bid.id)}
                                          >
                                            Decline
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
                </div>
                {reportPageCount > 1 && (
                  <nav
                    aria-label="Filed report pages"
                    className="flex items-center justify-between gap-3 border-t border-zinc-800 p-3"
                  >
                    <Button
                      variant="outline"
                      className="min-h-11"
                      disabled={safeReportPage === 1}
                      onClick={() => setReportPage((page) => Math.max(1, page - 1))}
                    >
                      Previous
                    </Button>
                    <span className="text-xs text-zinc-300">
                      Page {safeReportPage} of {reportPageCount}
                    </span>
                    <Button
                      variant="outline"
                      className="min-h-11"
                      disabled={safeReportPage === reportPageCount}
                      onClick={() => setReportPage((page) => Math.min(reportPageCount, page + 1))}
                    >
                      Next
                    </Button>
                  </nav>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen size={16} className="text-emerald-400" aria-hidden="true" />
              Reflection Journal
            </CardTitle>
            <p className="text-sm text-zinc-400">
              Saved post-session notes, hypotheses, and gut-feeling output from completed observations.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {journalEntries.length === 0 ? (
              <div className="rounded-lg border border-[#27272a] bg-[#0c0c0c] px-4 py-8 text-center">
                <p className="text-sm text-zinc-300">No reflection entries yet.</p>
                <p className="mt-1 text-xs text-zinc-400">
                  Finish an interactive observation session to start building your journal.
                </p>
              </div>
            ) : (
              journalEntries.map((entry) => {
                const isExpanded = expandedJournalId === entry.id;
                const gutFeeling = entry.gutFeelingId
                  ? gutFeelingById.get(entry.gutFeelingId)
                  : undefined;
                const playerLabels = entry.playerIds.map((playerId) => {
                  const player = resolvePlayerEntity(gameState, playerId)?.player;
                  return {
                    id: playerId,
                    name: player
                      ? `${player.firstName} ${player.lastName}`
                      : "Unknown Player",
                  };
                });

                return (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-[#27272a] bg-[#0c0c0c] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {formatObservationActivityLabel(entry.activityType)}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px]">
                            S{entry.season} W{entry.week}
                          </Badge>
                          {entry.gutFeelingId && (
                            <Badge variant="success" className="text-[10px]">
                              Gut Feeling
                            </Badge>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {playerLabels.map((player) => (
                            <button
                              key={`${entry.id}-${player.id}`}
                              onClick={() => {
                                selectPlayer(player.id);
                                setScreen("playerProfile");
                              }}
                              className="rounded-full border border-emerald-900/60 bg-emerald-950/20 px-2 py-0.5 text-[11px] text-emerald-300 transition hover:border-emerald-700 hover:text-emerald-200"
                            >
                              {player.name}
                            </button>
                          ))}
                        </div>
                        <p className="mt-3 text-sm leading-relaxed text-zinc-300">
                          {entry.summary ?? "No summary recorded for this reflection."}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-zinc-500">
                          <span>{entry.notes.length} note{entry.notes.length === 1 ? "" : "s"}</span>
                          <span>{entry.hypotheses.length} hypothesis{entry.hypotheses.length === 1 ? "" : "es"}</span>
                          {gutFeeling ? (
                            <span className="text-amber-400/80">
                              Gut feel: {Math.round(gutFeeling.reliability * 100)}% confidence
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setExpandedJournalId(isExpanded ? null : entry.id)
                        }
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp size={14} className="mr-1" aria-hidden="true" />
                            Hide
                          </>
                        ) : (
                          <>
                            <ChevronDown size={14} className="mr-1" aria-hidden="true" />
                            Details
                          </>
                        )}
                      </Button>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 space-y-4 border-t border-[#27272a] pt-4">
                        {entry.notes.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                              Notes
                            </p>
                            <div className="space-y-1.5">
                              {entry.notes.map((note, index) => (
                                <div
                                  key={`${entry.id}-note-${index}`}
                                  className="rounded-md bg-zinc-900/70 px-3 py-2 text-sm text-zinc-300"
                                >
                                  {note}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {entry.hypotheses.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                              Hypotheses
                            </p>
                            <div className="space-y-2">
                              {entry.hypotheses.map((hypothesis) => {
                                const hypothesisPlayer =
                                  resolvePlayerEntity(gameState, hypothesis.playerId)?.player;
                                const hypothesisPlayerName = hypothesisPlayer
                                  ? `${hypothesisPlayer.firstName} ${hypothesisPlayer.lastName}`
                                  : "Unknown Player";
                                return (
                                  <div
                                    key={hypothesis.id}
                                    className="rounded-md border border-[#27272a] bg-zinc-900/70 px-3 py-2"
                                  >
                                    <div className="flex flex-wrap items-center gap-2">
                                      <button
                                        onClick={() => {
                                          selectPlayer(hypothesis.playerId);
                                          setScreen("playerProfile");
                                        }}
                                        className="text-sm font-medium text-white transition hover:text-emerald-400"
                                      >
                                        {hypothesisPlayerName}
                                      </button>
                                      <Badge variant="outline" className="text-[10px] uppercase">
                                        {hypothesis.domain}
                                      </Badge>
                                      <Badge variant="secondary" className="text-[10px] capitalize">
                                        {hypothesis.state}
                                      </Badge>
                                    </div>
                                    <p className="mt-2 text-sm text-zinc-300">{hypothesis.text}</p>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {gutFeeling && (
                          <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                              Gut Feeling
                            </p>
                            <div className="rounded-md border border-amber-500/20 bg-amber-950/10 px-3 py-2">
                              <p className="text-sm text-amber-100">{gutFeeling.narrative}</p>
                              <p className="mt-1 text-[11px] text-amber-300/80">
                                Triggered from {gutFeeling.triggerDomain} · {Math.round(gutFeeling.reliability * 100)}% confidence
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
        </div>

      {selectedReport && (
        <ReportDetailModal
          report={selectedReport}
          playerName={selectedPlayerName}
          transferRecord={transferByReportId.get(selectedReport.id)}
          brief={selectedBrief}
          clubDecision={selectedClubDecision}
          reviews={selectedReviews}
          clubName={selectedAudienceClubName}
          caseTimeline={selectedCaseTimeline}
          onClose={() => setSelectedReport(null)}
        />
      )}

      {listingReport && (
        <ListForSaleModal
          reportId={listingReport.id}
          playerName={listingPlayerName}
          onConfirm={handleConfirmListing}
          onClose={() => setListingReport(null)}
        />
      )}
    </GameLayout>
  );
}
