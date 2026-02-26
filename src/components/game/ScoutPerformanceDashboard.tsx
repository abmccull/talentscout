"use client";

import { useMemo } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Trophy,
  DollarSign,
  BarChart3,
  Star,
  Users,
  Award,
} from "lucide-react";
import {
  computeScoutPerformance,
  type ScoutPerformanceData,
  type SeasonQualityTrend,
} from "@/engine/core/scoutPerformance";

// =============================================================================
// HELPERS
// =============================================================================

function formatMoney(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}\u00A3${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}\u00A3${(abs / 1_000).toFixed(0)}K`;
  return `${sign}\u00A3${abs}`;
}

function qualityColor(quality: number): string {
  if (quality >= 70) return "text-emerald-400";
  if (quality >= 50) return "text-amber-400";
  if (quality > 0) return "text-red-400";
  return "text-zinc-500";
}

function qualityBg(quality: number): string {
  if (quality >= 70) return "bg-emerald-500";
  if (quality >= 50) return "bg-amber-500";
  if (quality > 0) return "bg-red-500";
  return "bg-zinc-600";
}

function percentileLabel(percentile: number): string {
  if (percentile >= 90) return "Elite";
  if (percentile >= 75) return "Excellent";
  if (percentile >= 60) return "Above Avg";
  if (percentile >= 40) return "Average";
  if (percentile >= 25) return "Below Avg";
  return "Developing";
}

function percentileColor(percentile: number): string {
  if (percentile >= 75) return "text-emerald-400";
  if (percentile >= 50) return "text-blue-400";
  if (percentile >= 25) return "text-amber-400";
  return "text-red-400";
}

function percentileBadgeVariant(
  percentile: number,
): "default" | "success" | "warning" | "secondary" {
  if (percentile >= 75) return "success";
  if (percentile >= 50) return "default";
  if (percentile >= 25) return "warning";
  return "secondary";
}

/** Render a simple ASCII-style inline sparkline bar for a season trend. */
function TrendBar({ data }: { data: SeasonQualityTrend[] }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.avgQuality), 1);

  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((d) => {
        const height = Math.max(4, (d.avgQuality / max) * 100);
        return (
          <div key={d.season} className="flex flex-col items-center gap-1 flex-1 min-w-0">
            <div
              className={`w-full rounded-t-sm transition-all ${qualityBg(d.avgQuality)}`}
              style={{ height: `${height}%` }}
              title={`Season ${d.season}: ${d.avgQuality} avg quality (${d.reportCount} reports)`}
            />
            <span className="text-[8px] text-zinc-600 truncate">S{d.season}</span>
          </div>
        );
      })}
    </div>
  );
}

function TrendIndicator({ current, previous }: { current: number; previous: number }) {
  const delta = current - previous;
  if (Math.abs(delta) < 0.5) {
    return <Minus size={12} className="text-zinc-500" aria-label="Stable" />;
  }
  if (delta > 0) {
    return <TrendingUp size={12} className="text-emerald-400" aria-label="Improving" />;
  }
  return <TrendingDown size={12} className="text-red-400" aria-label="Declining" />;
}

// =============================================================================
// STAT CARD COMPONENT
// =============================================================================

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon: React.ReactNode;
  valueClassName?: string;
}

function StatCard({ label, value, subtext, icon, valueClassName = "text-white" }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-500">{label}</p>
            <p className={`text-2xl font-bold ${valueClassName}`}>{value}</p>
            {subtext && <p className="text-[10px] text-zinc-600 mt-0.5">{subtext}</p>}
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ScoutPerformanceDashboard() {
  const { gameState } = useGameStore();

  const performanceData = useMemo<ScoutPerformanceData | null>(() => {
    if (!gameState) return null;
    return computeScoutPerformance(gameState);
  }, [gameState]);

  if (!gameState || !performanceData) return null;

  const { scout, currentSeason } = gameState;
  const data = performanceData;

  return (
    <GameLayout>
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <Activity size={24} className="text-emerald-500" aria-hidden="true" />
            <div>
              <h1 className="text-2xl font-bold">Scout Performance</h1>
              <p className="text-sm text-zinc-400">
                {scout.firstName} {scout.lastName} — Career Analytics
              </p>
            </div>
          </div>
        </div>

        {/* ────────────────────────────────────────────────────────────────────
            A. Career Overview
        ──────────────────────────────────────────────────────────────────── */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard
            label="Career Tier"
            value={`Tier ${data.careerTier}`}
            subtext={data.tierLabel}
            icon={<Award size={20} className="text-amber-400" aria-hidden="true" />}
            valueClassName="text-amber-400"
          />
          <StatCard
            label="Reputation"
            value={data.reputation}
            subtext="out of 100"
            icon={<Star size={20} className="text-emerald-500" aria-hidden="true" />}
            valueClassName="text-emerald-400"
          />
          <StatCard
            label="Seasons"
            value={data.seasonsPlayed}
            icon={<BarChart3 size={20} className="text-zinc-500" aria-hidden="true" />}
          />
          <StatCard
            label="Reports"
            value={data.totalReports}
            icon={<Target size={20} className="text-zinc-500" aria-hidden="true" />}
          />
          <StatCard
            label="Discoveries"
            value={data.totalDiscoveries}
            icon={<Trophy size={20} className="text-zinc-500" aria-hidden="true" />}
          />
          <StatCard
            label="Hit Rate"
            value={data.careerHitRate > 0 ? `${data.careerHitRate}%` : "\u2014"}
            subtext="successful recommendations"
            icon={<TrendingUp size={20} className="text-zinc-500" aria-hidden="true" />}
            valueClassName={qualityColor(data.careerHitRate)}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* ──────────────────────────────────────────────────────────────────
              LEFT COLUMN: Accuracy Analytics (B)
          ────────────────────────────────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Quality Score Summary */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Target size={14} className="text-emerald-400" aria-hidden="true" />
                  Accuracy Analytics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* All-time vs this season */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-[#27272a] p-3 text-center">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">
                      All-Time Avg
                    </p>
                    <p className={`text-2xl font-bold ${qualityColor(data.allTimeAvgQuality)}`}>
                      {data.allTimeAvgQuality > 0 ? data.allTimeAvgQuality : "\u2014"}
                    </p>
                    <p className="text-[10px] text-zinc-600">quality score</p>
                  </div>
                  <div className="rounded-md border border-[#27272a] p-3 text-center">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">
                      This Season
                    </p>
                    <div className="flex items-center justify-center gap-1">
                      <p className={`text-2xl font-bold ${qualityColor(data.thisSeasonAvgQuality)}`}>
                        {data.thisSeasonAvgQuality > 0 ? data.thisSeasonAvgQuality : "\u2014"}
                      </p>
                      {data.thisSeasonAvgQuality > 0 && data.allTimeAvgQuality > 0 && (
                        <TrendIndicator
                          current={data.thisSeasonAvgQuality}
                          previous={data.allTimeAvgQuality}
                        />
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-600">quality score</p>
                  </div>
                </div>

                {/* Accuracy by position */}
                {data.accuracyByPosition.length > 0 && (
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2">
                      By Position
                    </p>
                    <div className="space-y-2">
                      {data.accuracyByPosition.map(({ position, avgQuality, reportCount }) => (
                        <div key={position} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] w-10 justify-center">
                              {position}
                            </Badge>
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-800">
                              <div
                                className={`h-full rounded-full transition-all ${qualityBg(avgQuality)}`}
                                style={{ width: `${avgQuality}%` }}
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-semibold ${qualityColor(avgQuality)}`}>
                              {avgQuality}%
                            </span>
                            <span className="text-[9px] text-zinc-600">({reportCount})</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Accuracy by age group */}
                {data.accuracyByAgeGroup.length > 0 && (
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2">
                      By Age Group
                    </p>
                    <div className="space-y-2">
                      {data.accuracyByAgeGroup.map(({ label, avgQuality, reportCount }) => (
                        <div key={label} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-400 w-10">{label}</span>
                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-800">
                              <div
                                className={`h-full rounded-full transition-all ${qualityBg(avgQuality)}`}
                                style={{ width: `${avgQuality}%` }}
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-semibold ${qualityColor(avgQuality)}`}>
                              {avgQuality}%
                            </span>
                            <span className="text-[9px] text-zinc-600">({reportCount})</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {data.totalReports === 0 && (
                  <p className="text-xs text-zinc-500 text-center py-4">
                    Submit reports to see accuracy analytics.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Quality Trend by Season */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <TrendingUp size={14} className="text-blue-400" aria-hidden="true" />
                  Quality Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.qualityTrend.length > 0 ? (
                  <div>
                    <TrendBar data={data.qualityTrend} />
                    <div className="mt-3 space-y-1.5">
                      {data.qualityTrend.map((d) => (
                        <div
                          key={d.season}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="text-zinc-500">Season {d.season}</span>
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold ${qualityColor(d.avgQuality)}`}>
                              {d.avgQuality}
                            </span>
                            <span className="text-zinc-600">({d.reportCount} reports)</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500 text-center py-4">
                    No season data yet.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ──────────────────────────────────────────────────────────────────
              CENTER COLUMN: Discovery Stats (C) + Financial (D)
          ────────────────────────────────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Discovery Stats */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Trophy size={14} className="text-amber-400" aria-hidden="true" />
                  Discovery Stats
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-[#27272a] p-3 text-center">
                    <p className="text-[10px] text-zinc-500 mb-1">Wonderkids Found</p>
                    <p className="text-xl font-bold text-amber-400">
                      {data.discoveryStats.totalWonderkids}
                    </p>
                    <p className="text-[9px] text-zinc-600">PA {"\u2265"} 150</p>
                  </div>
                  <div className="rounded-md border border-[#27272a] p-3 text-center">
                    <p className="text-[10px] text-zinc-500 mb-1">Players Placed</p>
                    <p className="text-xl font-bold text-blue-400">
                      {data.discoveryStats.totalPlaced}
                    </p>
                    <p className="text-[9px] text-zinc-600">signed by clubs</p>
                  </div>
                </div>

                {/* Placement success rate */}
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-zinc-500">Placement Success Rate</span>
                    <span
                      className={`font-semibold ${qualityColor(data.discoveryStats.placementSuccessRate)}`}
                    >
                      {data.discoveryStats.placementSuccessRate > 0
                        ? `${data.discoveryStats.placementSuccessRate}%`
                        : "\u2014"}
                    </span>
                  </div>
                  {data.discoveryStats.placementSuccessRate > 0 && (
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className={`h-full rounded-full transition-all ${qualityBg(data.discoveryStats.placementSuccessRate)}`}
                        style={{ width: `${data.discoveryStats.placementSuccessRate}%` }}
                      />
                    </div>
                  )}
                </div>

                {/* Best discovery */}
                {data.discoveryStats.bestDiscovery && (
                  <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-1">
                      Best Discovery
                    </p>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {data.discoveryStats.bestDiscovery.playerName}
                        </p>
                        <p className="text-[10px] text-zinc-500">
                          PA: {data.discoveryStats.bestDiscovery.potentialAbility}
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => {
                          const pa = data.discoveryStats.bestDiscovery!.potentialAbility;
                          const stars = pa >= 180 ? 5 : pa >= 160 ? 4 : pa >= 140 ? 3 : pa >= 120 ? 2 : 1;
                          return (
                            <Star
                              key={i}
                              size={12}
                              aria-hidden="true"
                              className={
                                i < stars
                                  ? "text-amber-400 fill-amber-400"
                                  : "text-zinc-700"
                              }
                            />
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {data.totalDiscoveries === 0 && (
                  <p className="text-xs text-zinc-500 text-center py-2">
                    No discoveries recorded yet.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Financial Performance */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <DollarSign size={14} className="text-emerald-400" aria-hidden="true" />
                  Financial Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-md border border-[#27272a] p-2 text-center">
                    <p className="text-[10px] text-zinc-500 mb-1">Earnings</p>
                    <p className="text-sm font-bold text-emerald-400">
                      {formatMoney(data.financialPerformance.lifetimeEarnings)}
                    </p>
                  </div>
                  <div className="rounded-md border border-[#27272a] p-2 text-center">
                    <p className="text-[10px] text-zinc-500 mb-1">Expenses</p>
                    <p className="text-sm font-bold text-red-400">
                      {formatMoney(data.financialPerformance.lifetimeExpenses)}
                    </p>
                  </div>
                  <div className="rounded-md border border-[#27272a] p-2 text-center">
                    <p className="text-[10px] text-zinc-500 mb-1">Net</p>
                    <p
                      className={`text-sm font-bold ${
                        data.financialPerformance.netProfit >= 0
                          ? "text-emerald-400"
                          : "text-red-400"
                      }`}
                    >
                      {formatMoney(data.financialPerformance.netProfit)}
                    </p>
                  </div>
                </div>

                {/* ROI */}
                <div className="flex items-center justify-between rounded-md border border-[#27272a] px-3 py-2">
                  <span className="text-xs text-zinc-500">ROI</span>
                  <span
                    className={`text-sm font-bold ${
                      data.financialPerformance.roi >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {data.financialPerformance.roi > 0 ? "+" : ""}
                    {data.financialPerformance.roi}%
                  </span>
                </div>

                {/* Revenue per season */}
                {data.financialPerformance.revenuePerSeason.length > 0 && (
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold mb-2">
                      Revenue by Season
                    </p>
                    <div className="space-y-1.5">
                      {data.financialPerformance.revenuePerSeason.map((s) => (
                        <div
                          key={s.season}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="text-zinc-500">S{s.season}</span>
                          <div className="flex items-center gap-3">
                            <span className="text-emerald-400">
                              +{formatMoney(s.income)}
                            </span>
                            <span className="text-red-400">
                              -{formatMoney(s.expenses)}
                            </span>
                            <span
                              className={`font-semibold ${
                                s.net >= 0 ? "text-emerald-400" : "text-red-400"
                              }`}
                            >
                              {s.net >= 0 ? "+" : ""}
                              {formatMoney(s.net)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ──────────────────────────────────────────────────────────────────
              RIGHT COLUMN: Comparative Context (E)
          ────────────────────────────────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Industry Comparison */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Users size={14} className="text-blue-400" aria-hidden="true" />
                  Industry Comparison
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.totalReports === 0 ? (
                  <p className="text-xs text-zinc-500 text-center py-4">
                    Submit reports to see how you compare.
                  </p>
                ) : (
                  <>
                    {/* Accuracy comparison */}
                    <div className="rounded-md border border-[#27272a] p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400">Accuracy</span>
                        <Badge
                          variant={percentileBadgeVariant(data.comparativeContext.percentile)}
                          className="text-[9px]"
                        >
                          {percentileLabel(data.comparativeContext.percentile)}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] text-zinc-600">Industry Avg</p>
                          <p className="text-sm font-semibold text-zinc-400">
                            {data.comparativeContext.industryAvgAccuracy}%
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-600">You</p>
                          <p
                            className={`text-sm font-semibold ${qualityColor(data.comparativeContext.yourAccuracy)}`}
                          >
                            {data.comparativeContext.yourAccuracy > 0
                              ? `${data.comparativeContext.yourAccuracy}%`
                              : "\u2014"}
                          </p>
                        </div>
                      </div>
                      <p className={`text-[10px] ${percentileColor(data.comparativeContext.percentile)}`}>
                        You&apos;re in the top {100 - data.comparativeContext.percentile}% of scouts.
                      </p>
                    </div>

                    {/* Quality comparison */}
                    <div className="rounded-md border border-[#27272a] p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400">Report Quality</span>
                        <Badge
                          variant={percentileBadgeVariant(data.comparativeContext.qualityPercentile)}
                          className="text-[9px]"
                        >
                          {percentileLabel(data.comparativeContext.qualityPercentile)}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] text-zinc-600">Industry Avg</p>
                          <p className="text-sm font-semibold text-zinc-400">
                            {data.comparativeContext.industryAvgQuality}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-600">You</p>
                          <p
                            className={`text-sm font-semibold ${qualityColor(data.comparativeContext.yourQuality)}`}
                          >
                            {data.comparativeContext.yourQuality > 0
                              ? data.comparativeContext.yourQuality
                              : "\u2014"}
                          </p>
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800 relative">
                        {/* Industry avg marker */}
                        <div
                          className="absolute top-0 h-full w-0.5 bg-zinc-500"
                          style={{ left: `${data.comparativeContext.industryAvgQuality}%` }}
                          title="Industry Average"
                        />
                        {/* Your quality bar */}
                        <div
                          className={`h-full rounded-full transition-all ${qualityBg(data.comparativeContext.yourQuality)}`}
                          style={{ width: `${data.comparativeContext.yourQuality}%` }}
                        />
                      </div>
                    </div>

                    {/* Discovery rate comparison */}
                    <div className="rounded-md border border-[#27272a] p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400">Discovery Rate</span>
                        <Badge
                          variant={percentileBadgeVariant(data.comparativeContext.discoveryPercentile)}
                          className="text-[9px]"
                        >
                          {percentileLabel(data.comparativeContext.discoveryPercentile)}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] text-zinc-600">Industry Avg</p>
                          <p className="text-sm font-semibold text-zinc-400">
                            {Math.round(data.comparativeContext.industryAvgDiscoveryRate * 100)}%
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-600">You</p>
                          <p
                            className={`text-sm font-semibold ${percentileColor(data.comparativeContext.discoveryPercentile)}`}
                          >
                            {Math.round(data.comparativeContext.yourDiscoveryRate * 100)}%
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Overall Percentile Summary */}
            {data.totalReports > 0 && (
              <Card className="border-emerald-500/20 bg-emerald-500/5">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Award size={14} className="text-emerald-400" aria-hidden="true" />
                    Overall Standing
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center space-y-2">
                    <p className={`text-4xl font-bold ${percentileColor(data.comparativeContext.percentile)}`}>
                      Top {100 - data.comparativeContext.percentile}%
                    </p>
                    <p className="text-xs text-zinc-500">
                      Based on accuracy, report quality, and discovery rate
                    </p>
                    <div className="flex justify-center gap-1 pt-1">
                      {[
                        { label: "Accuracy", pct: data.comparativeContext.percentile },
                        { label: "Quality", pct: data.comparativeContext.qualityPercentile },
                        { label: "Discovery", pct: data.comparativeContext.discoveryPercentile },
                      ].map(({ label, pct }) => (
                        <Badge
                          key={label}
                          variant="outline"
                          className={`text-[9px] ${percentileColor(pct)}`}
                        >
                          {label}: Top {100 - pct}%
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Career milestones */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Career Milestones</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {getMilestones(data).map(({ label, achieved, detail }) => (
                    <div
                      key={label}
                      className={`flex items-center justify-between rounded-md border px-3 py-2 text-xs transition ${
                        achieved
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : "border-[#27272a] opacity-50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-2 w-2 rounded-full ${
                            achieved ? "bg-emerald-500" : "bg-zinc-700"
                          }`}
                        />
                        <span className={achieved ? "text-white" : "text-zinc-500"}>
                          {label}
                        </span>
                      </div>
                      {detail && (
                        <span className="text-zinc-500">{detail}</span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </GameLayout>
  );
}

// =============================================================================
// MILESTONE DEFINITIONS
// =============================================================================

interface Milestone {
  label: string;
  achieved: boolean;
  detail?: string;
}

function getMilestones(data: ScoutPerformanceData): Milestone[] {
  return [
    {
      label: "First Report",
      achieved: data.totalReports >= 1,
      detail: data.totalReports >= 1 ? `${data.totalReports} total` : "0/1",
    },
    {
      label: "10 Reports Filed",
      achieved: data.totalReports >= 10,
      detail: `${Math.min(data.totalReports, 10)}/10`,
    },
    {
      label: "50 Reports Filed",
      achieved: data.totalReports >= 50,
      detail: `${Math.min(data.totalReports, 50)}/50`,
    },
    {
      label: "First Discovery",
      achieved: data.totalDiscoveries >= 1,
      detail: data.totalDiscoveries >= 1 ? `${data.totalDiscoveries} found` : "0/1",
    },
    {
      label: "Wonderkid Hunter",
      achieved: data.discoveryStats.totalWonderkids >= 3,
      detail: `${Math.min(data.discoveryStats.totalWonderkids, 3)}/3 wonderkids`,
    },
    {
      label: "Quality Expert",
      achieved: data.allTimeAvgQuality >= 70,
      detail: data.allTimeAvgQuality > 0 ? `${data.allTimeAvgQuality}/70 avg` : "0/70",
    },
    {
      label: "Tier 3 Scout",
      achieved: data.careerTier >= 3,
    },
    {
      label: "Head of Scouting",
      achieved: data.careerTier >= 4,
    },
    {
      label: "Director of Football",
      achieved: data.careerTier >= 5,
    },
    {
      label: "Elite Reputation",
      achieved: data.reputation >= 80,
      detail: `${data.reputation}/80`,
    },
  ];
}
