"use client";

import { useState, useEffect } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Award, Trophy, Loader2 } from "lucide-react";
import { getLeaderboard } from "@/lib/leaderboard";
import type { LeaderboardEntry } from "@/engine/core/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rankMedal(rank: number): string {
  if (rank === 1) return "text-amber-400";
  if (rank === 2) return "text-zinc-300";
  if (rank === 3) return "text-amber-600";
  return "text-zinc-500";
}

function formatScore(score: number): string {
  return Math.round(score).toLocaleString();
}

// ─── LeaderboardScreen ────────────────────────────────────────────────────────

export function LeaderboardScreen() {
  const { gameState, submitToLeaderboard } = useGameStore();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Must call all hooks before early return
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getLeaderboard(20)
      .then((data) => {
        if (!cancelled) {
          setEntries(data);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!gameState) return null;

  const scoutName = `${gameState.scout.firstName} ${gameState.scout.lastName}`;

  // Determine whether the scout is at end-of-season (week 38+)
  const isEndOfSeason = gameState.currentWeek >= 38;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await submitToLeaderboard();
      // Refresh entries
      const updated = await getLeaderboard(20);
      setEntries(updated);
      setSubmitSuccess(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <GameLayout>
      <div className="p-6">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Leaderboard</h1>
            <p className="text-sm text-zinc-400">Top scouts ranked by season score</p>
          </div>

          {/* Submit button */}
          {isEndOfSeason && !submitSuccess && (
            <Button
              size="sm"
              onClick={() => void handleSubmit()}
              disabled={isSubmitting}
              className="shrink-0"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="mr-2 animate-spin" aria-hidden="true" />
                  Submitting…
                </>
              ) : (
                "Submit Season Score"
              )}
            </Button>
          )}
          {submitSuccess && (
            <Badge
              variant="success"
              className="border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
            >
              Score Submitted
            </Badge>
          )}
        </div>

        {/* Score formula reference */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <p className="text-xs text-zinc-500">
              Score formula:{" "}
              <span className="font-mono text-zinc-300">
                reputation × 2 + discoveries × 5 + accuracy × 1.5
              </span>
            </p>
          </CardContent>
        </Card>

        {/* Leaderboard table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Award size={14} aria-hidden="true" />
              Top Scouts
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2
                  size={24}
                  className="animate-spin text-zinc-600"
                  aria-label="Loading leaderboard"
                />
              </div>
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Trophy size={40} className="mb-4 text-zinc-700" aria-hidden="true" />
                <p className="text-sm text-zinc-500">No leaderboard entries yet.</p>
                <p className="mt-1 text-xs text-zinc-600">
                  Complete a season and submit your score to appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#27272a] text-left text-xs text-zinc-500">
                      <th className="px-4 py-3 font-medium w-10">#</th>
                      <th className="px-4 py-3 font-medium">Scout</th>
                      <th className="px-4 py-3 font-medium text-right">Score</th>
                      <th className="px-4 py-3 font-medium text-center">Season</th>
                      <th className="px-4 py-3 font-medium text-center">Rep</th>
                      <th className="px-4 py-3 font-medium text-center">Disc.</th>
                      <th className="px-4 py-3 font-medium text-center">Accuracy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, index) => {
                      const rank = index + 1;
                      const isCurrentScout = entry.scoutName === scoutName;
                      return (
                        <tr
                          key={entry.id}
                          className={`border-b border-[#27272a] transition ${
                            isCurrentScout
                              ? "bg-emerald-500/5"
                              : "hover:bg-[#141414]"
                          }`}
                          aria-label={isCurrentScout ? `Your entry: rank ${rank}` : undefined}
                        >
                          <td className="px-4 py-3">
                            <span
                              className={`text-sm font-bold ${rankMedal(rank)}`}
                              aria-label={`Rank ${rank}`}
                            >
                              {rank}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-medium ${
                                  isCurrentScout ? "text-emerald-400" : "text-white"
                                }`}
                              >
                                {entry.scoutName}
                              </span>
                              {isCurrentScout && (
                                <Badge
                                  variant="success"
                                  className="text-[9px] border-emerald-500/50 bg-emerald-500/10 text-emerald-400 shrink-0"
                                >
                                  You
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-bold text-emerald-400">
                              {formatScore(entry.score)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-zinc-400">
                            {entry.season}
                          </td>
                          <td className="px-4 py-3 text-center text-zinc-300">
                            {Math.round(entry.reputation)}
                          </td>
                          <td className="px-4 py-3 text-center text-zinc-300">
                            {entry.totalDiscoveries}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={
                                entry.predictionAccuracy >= 70
                                  ? "text-emerald-400"
                                  : entry.predictionAccuracy >= 40
                                    ? "text-amber-400"
                                    : "text-red-400"
                              }
                            >
                              {entry.predictionAccuracy > 0
                                ? `${Math.round(entry.predictionAccuracy)}%`
                                : "—"}
                            </span>
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
    </GameLayout>
  );
}
