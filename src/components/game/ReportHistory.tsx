"use client";

import { useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, X, ChevronDown, ChevronUp, DollarSign, GitCompareArrows } from "lucide-react";
import type { ScoutReport, ConvictionLevel, ReportListing } from "@/engine/core/types";
import { StarRating, StarRatingRange } from "@/components/ui/StarRating";
import { ScreenBackground } from "@/components/ui/screen-background";

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

interface ReportDetailModalProps {
  report: ScoutReport;
  playerName: string;
  onClose: () => void;
}

function ReportDetailModal({ report, playerName, onClose }: ReportDetailModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Report for ${playerName}`}
    >
      <div className="w-full max-w-2xl max-h-[85vh] overflow-auto rounded-xl border border-[#27272a] bg-[#0a0a0a] shadow-2xl">
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
                <span className="text-[10px] text-zinc-500">CA:</span>
                <StarRating rating={report.perceivedCAStars} size="sm" />
              </div>
            )}
            {report.perceivedPARange && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-zinc-500">PA:</span>
                <StarRatingRange
                  low={report.perceivedPARange[0]}
                  high={report.perceivedPARange[1]}
                  size="sm"
                />
              </div>
            )}
            <span className={`text-sm font-semibold ${qualityColor(report.qualityScore)}`}>
              Quality: {report.qualityScore}/100
            </span>
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

export function ReportHistory() {
  const { gameState, selectPlayer, setScreen, listReportForSale, withdrawReportListing, comparisonReportIds, addToComparison, removeFromComparison, clearComparison } = useGameStore();
  const [selectedReport, setSelectedReport] = useState<ScoutReport | null>(null);
  const [listingReport, setListingReport] = useState<ScoutReport | null>(null);

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

  const selectedPlayerName = selectedReport
    ? (() => {
        const p = gameState.players[selectedReport.playerId];
        return p ? `${p.firstName} ${p.lastName}` : "Unknown Player";
      })()
    : "";

  const listingPlayerName = listingReport
    ? (() => {
        const p = gameState.players[listingReport.playerId];
        return p ? `${p.firstName} ${p.lastName}` : "Unknown Player";
      })()
    : "";

  function handleConfirmListing(price: number, isExclusive: boolean) {
    if (!listingReport) return;
    listReportForSale(listingReport.id, price, isExclusive);
    setListingReport(null);
  }

  return (
    <GameLayout>
      <div className="relative min-h-full p-6">
        <ScreenBackground src="/images/backgrounds/reports-desk.png" opacity={0.82} />
        <div className="relative z-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Report History</h1>
          <p className="text-sm text-zinc-400">All submitted scouting reports</p>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-zinc-500">Total Reports</p>
              <p className="text-2xl font-bold text-emerald-400">{totalReports}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-zinc-500">Avg Quality</p>
              <p className={`text-2xl font-bold ${qualityColor(avgQuality)}`}>{avgQuality}</p>
            </CardContent>
          </Card>
          {(["tablePound", "strongRecommend"] as ConvictionLevel[]).map((c) => (
            <Card key={c}>
              <CardContent className="p-4">
                <p className="text-xs text-zinc-500">{CONVICTION_LABELS[c]}</p>
                <p className="text-2xl font-bold">{convictionCounts[c] ?? 0}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Comparison action bar */}
        {comparisonReportIds.length > 0 && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-emerald-800/50 bg-emerald-950/30 p-3">
            <GitCompareArrows size={16} className="text-emerald-400 shrink-0" aria-hidden="true" />
            <span className="text-sm text-zinc-300">
              {comparisonReportIds.length} report{comparisonReportIds.length > 1 ? "s" : ""} selected for comparison
              {comparisonReportIds.length < 2 && " (select at least 2)"}
            </span>
            <div className="ml-auto flex gap-2">
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

        {/* Reports table */}
        <Card>
          <CardContent className="p-0">
            {reports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText size={32} className="mb-3 text-zinc-700" aria-hidden="true" />
                <p className="text-sm text-zinc-500">No reports filed yet.</p>
                <p className="text-xs text-zinc-600 mt-1">
                  Observe players and write your first scouting report.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#27272a] text-left text-xs text-zinc-500">
                      <th className="w-10 px-2 py-3 font-medium text-center">
                        <GitCompareArrows size={13} className="inline text-zinc-500" aria-label="Compare" />
                      </th>
                      <th className="px-4 py-3 font-medium">Player</th>
                      <th className="px-4 py-3 font-medium">Conviction</th>
                      <th className="px-4 py-3 font-medium">Quality</th>
                      <th className="px-4 py-3 font-medium">Rep</th>
                      <th className="px-4 py-3 font-medium">Week</th>
                      <th className="px-4 py-3 font-medium">Club Response</th>
                      <th className="px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((report) => {
                      const player = gameState.players[report.playerId];
                      const playerName = player
                        ? `${player.firstName} ${player.lastName}`
                        : "Unknown";
                      const listing = listingByReportId[report.id];
                      const isInComparison = comparisonReportIds.includes(report.id);
                      const comparisonFull = comparisonReportIds.length >= 3 && !isInComparison;
                      return (
                        <tr
                          key={report.id}
                          className={`border-b border-[#27272a] transition hover:bg-[#141414] ${isInComparison ? "bg-emerald-950/20" : ""}`}
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
                            {report.clubResponse ? (
                              <Badge variant="secondary" className="text-[10px] capitalize">
                                {report.clubResponse}
                              </Badge>
                            ) : (
                              <span className="text-zinc-600 text-xs">Pending</span>
                            )}
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
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
        </div>

      {selectedReport && (
        <ReportDetailModal
          report={selectedReport}
          playerName={selectedPlayerName}
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
