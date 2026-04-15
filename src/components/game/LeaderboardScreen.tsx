"use client";

import { useState, useEffect } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Award, Trophy, Loader2, Globe, HardDrive } from "lucide-react";
import { getLeaderboard } from "@/lib/leaderboard";
import type { LeaderboardEntry } from "@/engine/core/types";
import { BETA_GLOBAL_LEADERBOARD_MESSAGE } from "@/config/beta";

// ─── Types ────────────────────────────────────────────────────────────────────

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rankMedal(rank: number): string {
  if (rank === 1) return "text-amber-400";
  if (rank === 2) return "text-zinc-300";
  if (rank === 3) return "text-amber-600";
  return "text-zinc-500";
}

function formatScore(score: number): string {
  return Math.round(score).toLocaleString();
}

// ─── LeaderboardTable ─────────────────────────────────────────────────────────

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  isLoading: boolean;
  currentScoutName: string;
}

function LeaderboardTable({
  entries,
  isLoading,
  currentScoutName,
}: LeaderboardTableProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2
          size={24}
          className="animate-spin text-zinc-600"
          aria-label="Loading leaderboard"
        />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Trophy size={40} className="mb-4 text-zinc-700" aria-hidden="true" />
        <p className="text-sm text-zinc-500">No leaderboard entries yet.</p>
        <p className="mt-1 text-xs text-zinc-600">
          Complete a season and submit your score to appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#27272a] text-left text-xs text-zinc-500">
            <th className="w-10 px-4 py-3 font-medium">#</th>
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
            const isCurrentScout = entry.scoutName === currentScoutName;
            return (
              <tr
                key={entry.id}
                className={`border-b border-[#27272a] transition ${
                  isCurrentScout ? "bg-emerald-500/5" : "hover:bg-[#141414]"
                }`}
                aria-label={
                  isCurrentScout ? `Your entry: rank ${rank}` : undefined
                }
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
                        className="shrink-0 border-emerald-500/50 bg-emerald-500/10 text-[9px] text-emerald-400"
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
  );
}

// ─── LeaderboardScreen ────────────────────────────────────────────────────────

export function LeaderboardScreen() {
  const { gameState, submitToLeaderboard } = useGameStore();

  const [localEntries, setLocalEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoadingLocal, setIsLoadingLocal] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load local leaderboard on mount — must be before early return
  useEffect(() => {
    let cancelled = false;
    setIsLoadingLocal(true);
    getLeaderboard(20)
      .then((data) => {
        if (!cancelled) {
          setLocalEntries(data);
          setIsLoadingLocal(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoadingLocal(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!gameState) return null;

  const scoutName = `${gameState.scout.firstName} ${gameState.scout.lastName}`;
  const isEndOfSeason = gameState.currentWeek >= 38;

  // ── Submit handler ────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const submittedEntry = await submitToLeaderboard();
      if (!submittedEntry) {
        throw new Error("No active game state to submit");
      }

      // Refresh local entries
      const updatedLocal = await getLeaderboard(20);
      setLocalEntries(updatedLocal);
      setSubmitSuccess(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to submit score");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <GameLayout>
      <div className="p-6">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Leaderboard</h1>
            <p className="text-sm text-zinc-400">
              Top scouts ranked by season score on this device
            </p>
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
                  <Loader2
                    size={14}
                    className="mr-2 animate-spin"
                    aria-hidden="true"
                  />
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
          {submitError && (
            <p className="text-sm text-red-400">{submitError}</p>
          )}
        </div>

        <div className="mb-4 rounded-md border border-amber-500/20 bg-amber-500/10 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-300">
            <Globe size={14} aria-hidden="true" />
            Global leaderboard disabled for beta
          </p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">
            {BETA_GLOBAL_LEADERBOARD_MESSAGE}
          </p>
        </div>

        {/* ── Leaderboard table ─────────────────────────────────────────── */}
        <Card id="leaderboard-panel" role="tabpanel">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Award size={14} aria-hidden="true" />
              <HardDrive size={13} aria-hidden="true" />
              Top Scouts — Local
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <LeaderboardTable
              entries={localEntries}
              isLoading={isLoadingLocal}
              currentScoutName={scoutName}
            />
          </CardContent>
        </Card>
      </div>
    </GameLayout>
  );
}
