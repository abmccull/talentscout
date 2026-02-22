"use client";

import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, BarChart3 } from "lucide-react";
import {
  getOverallPerformanceRating,
  comparePerformancePeriods,
} from "@/engine/career/index";
import type { ScoutPerformanceSnapshot, ScoutSkill } from "@/engine/core/types";

// ─── Skill labels ─────────────────────────────────────────────────────────────

const SKILL_LABELS: Record<ScoutSkill, string> = {
  technicalEye: "Technical Eye",
  physicalAssessment: "Physical Assessment",
  psychologicalRead: "Psychological Read",
  tacticalUnderstanding: "Tactical Understanding",
  dataLiteracy: "Data Literacy",
  playerJudgment: "Player Judgment",
  potentialAssessment: "Potential Assessment",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ratingColor(rating: number): string {
  if (rating >= 70) return "text-emerald-400";
  if (rating >= 40) return "text-amber-400";
  return "text-red-400";
}

function ratingBg(rating: number): string {
  if (rating >= 70) return "bg-emerald-500";
  if (rating >= 40) return "bg-amber-500";
  return "bg-red-500";
}

type TrendDirection = "up" | "down" | "flat";

function trendDirection(delta: number, threshold = 0.5): TrendDirection {
  if (delta > threshold) return "up";
  if (delta < -threshold) return "down";
  return "flat";
}

interface TrendIconProps {
  direction: TrendDirection;
}

function TrendIcon({ direction }: TrendIconProps) {
  if (direction === "up") {
    return <TrendingUp size={14} className="text-emerald-400" aria-label="Improving" />;
  }
  if (direction === "down") {
    return <TrendingDown size={14} className="text-red-400" aria-label="Declining" />;
  }
  return <Minus size={14} className="text-zinc-500" aria-label="Stable" />;
}

function trendLabel(direction: TrendDirection): string {
  if (direction === "up") return "Improving";
  if (direction === "down") return "Declining";
  return "Stable";
}

function trendColor(direction: TrendDirection): string {
  if (direction === "up") return "text-emerald-400";
  if (direction === "down") return "text-red-400";
  return "text-zinc-500";
}

// ─── AnalyticsScreen ──────────────────────────────────────────────────────────

export function AnalyticsScreen() {
  const { gameState, getPerformanceHistory } = useGameStore();

  const history = getPerformanceHistory();
  const overallRating = getOverallPerformanceRating(history);

  // Split into recent (last 4) and previous (4 before that) for trend comparison
  const recent = history.slice(-4);
  const previous = history.slice(-8, -4);
  const trends = comparePerformancePeriods(recent, previous);

  const accuracyTrend = trendDirection(trends.accuracyChange);
  const qualityTrend = trendDirection(trends.qualityChange);
  const rateTrend = trendDirection(trends.rateChange, 0.01);

  // Latest snapshot for current skill levels
  const latestSnapshot: ScoutPerformanceSnapshot | null =
    history.length > 0 ? history[history.length - 1] : null;

  if (!gameState) return null;

  return (
    <GameLayout>
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Performance Analytics</h1>
          <p className="text-sm text-zinc-400">
            Season {gameState.currentSeason} — Week {gameState.currentWeek}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* ── Left column ──────────────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Overall rating */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <BarChart3 size={14} aria-hidden="true" />
                  Overall Rating
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {history.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    No data yet. Advance weeks to generate snapshots.
                  </p>
                ) : (
                  <>
                    <div className="text-center">
                      <p
                        className={`text-5xl font-bold tabular-nums ${ratingColor(overallRating)}`}
                        aria-label={`Performance rating: ${overallRating} out of 100`}
                      >
                        {overallRating}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">out of 100</p>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className={`h-full rounded-full transition-all ${ratingBg(overallRating)}`}
                        style={{ width: `${overallRating}%` }}
                      />
                    </div>
                    <p className="text-center text-xs text-zinc-500">
                      Based on last {Math.min(4, history.length)} snapshot
                      {Math.min(4, history.length) !== 1 ? "s" : ""}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Trend indicators */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Trend Indicators</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {history.length < 2 ? (
                  <p className="text-xs text-zinc-500">
                    Need at least 2 snapshots to show trends.
                  </p>
                ) : (
                  <>
                    {(
                      [
                        {
                          label: "Accuracy",
                          direction: accuracyTrend,
                          delta: trends.accuracyChange,
                          format: (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`,
                        },
                        {
                          label: "Report Quality",
                          direction: qualityTrend,
                          delta: trends.qualityChange,
                          format: (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}`,
                        },
                        {
                          label: "Discovery Rate",
                          direction: rateTrend,
                          delta: trends.rateChange * 100,
                          format: (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`,
                        },
                      ] as const
                    ).map(({ label, direction, delta, format }) => (
                      <div
                        key={label}
                        className="flex items-center justify-between rounded-md border border-[#27272a] px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <TrendIcon direction={direction} />
                          <span className="text-xs text-zinc-300">{label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold ${trendColor(direction)}`}>
                            {format(delta)}
                          </span>
                          <Badge
                            variant="secondary"
                            className={`text-[9px] ${trendColor(direction)}`}
                          >
                            {trendLabel(direction)}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Center column ─────────────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Recent snapshots */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Monthly Snapshots</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <p className="text-xs text-zinc-500">No snapshots yet.</p>
                    <p className="mt-1 text-[10px] text-zinc-600">
                      Snapshots are taken every 4 weeks.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[#27272a] text-left text-zinc-500">
                          <th className="px-3 py-2 font-medium">Period</th>
                          <th className="px-3 py-2 font-medium text-center">Accuracy</th>
                          <th className="px-3 py-2 font-medium text-center">Quality</th>
                          <th className="px-3 py-2 font-medium text-center">Reports</th>
                          <th className="px-3 py-2 font-medium text-center">Disc%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...history].reverse().slice(0, 12).map((snap, i) => (
                          <tr
                            key={i}
                            className="border-b border-[#27272a] transition hover:bg-[#141414]"
                          >
                            <td className="px-3 py-2 text-zinc-400">
                              S{snap.season} W{snap.week}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span
                                className={
                                  snap.accuracy >= 70
                                    ? "text-emerald-400 font-semibold"
                                    : snap.accuracy >= 40
                                      ? "text-amber-400"
                                      : "text-zinc-400"
                                }
                              >
                                {snap.accuracy > 0 ? `${snap.accuracy}%` : "—"}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-center text-zinc-300">
                              {snap.avgQuality > 0 ? snap.avgQuality : "—"}
                            </td>
                            <td className="px-3 py-2 text-center text-zinc-300">
                              {snap.totalReports}
                            </td>
                            <td className="px-3 py-2 text-center text-zinc-400">
                              {snap.discoveryRate > 0
                                ? `${Math.round(snap.discoveryRate * 100)}%`
                                : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Right column ──────────────────────────────────────────────── */}
          <div className="space-y-4">
            {/* Skill progression */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Skill Progression</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {latestSnapshot === null ? (
                  <p className="text-xs text-zinc-500">
                    No skill data available yet.
                  </p>
                ) : (
                  (Object.keys(SKILL_LABELS) as ScoutSkill[]).map((skill) => {
                    const currentLevel = latestSnapshot.skills[skill] ?? 0;
                    // Find earliest snapshot for this skill to show growth
                    const firstLevel =
                      history.length > 0 ? history[0].skills[skill] ?? 0 : currentLevel;
                    const gain = currentLevel - firstLevel;

                    return (
                      <div key={skill}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="text-zinc-400">
                            {SKILL_LABELS[skill]}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {gain > 0 && (
                              <span className="text-[9px] text-emerald-400">
                                +{gain}
                              </span>
                            )}
                            <span className="font-mono font-bold text-white">
                              {currentLevel}/20
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                          <div
                            className={`h-full rounded-full transition-all ${
                              currentLevel >= 15
                                ? "bg-emerald-500"
                                : currentLevel >= 10
                                  ? "bg-amber-500"
                                  : "bg-zinc-500"
                            }`}
                            style={{ width: `${(currentLevel / 20) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* Current snapshot stats */}
            {latestSnapshot && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Latest Snapshot</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(
                    [
                      ["Season / Week", `S${latestSnapshot.season} W${latestSnapshot.week}`],
                      ["Total Reports", String(latestSnapshot.totalReports)],
                      [
                        "Accuracy",
                        latestSnapshot.accuracy > 0
                          ? `${latestSnapshot.accuracy}%`
                          : "No rated reports",
                      ],
                      ["Avg Quality", String(latestSnapshot.avgQuality)],
                      [
                        "Discovery Rate",
                        latestSnapshot.discoveryRate > 0
                          ? `${Math.round(latestSnapshot.discoveryRate * 100)}%`
                          : "—",
                      ],
                      ["Reputation", String(Math.round(latestSnapshot.reputation))],
                    ] as [string, string][]
                  ).map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-xs text-zinc-500">{label}</span>
                      <span className="text-xs font-semibold text-white">{value}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </GameLayout>
  );
}
