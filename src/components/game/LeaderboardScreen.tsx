"use client";

import { useState, useEffect } from "react";
import { useGameStore } from "@/stores/gameStore";
import { useAuthStore } from "@/stores/authStore";
import { GameLayout } from "./GameLayout";
import { AuthModal } from "./AuthModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Award, Trophy, Loader2, Globe, HardDrive } from "lucide-react";
import { getLeaderboard } from "@/lib/leaderboard";
import {
  getCloudLeaderboard,
  submitCloudLeaderboardEntry,
} from "@/lib/supabaseLeaderboard";
import type { LeaderboardEntry } from "@/engine/core/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type LeaderboardTab = "local" | "global";

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
  const { isAuthenticated, userId } = useAuthStore();

  const [activeTab, setActiveTab] = useState<LeaderboardTab>("local");
  const [localEntries, setLocalEntries] = useState<LeaderboardEntry[]>([]);
  const [globalEntries, setGlobalEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoadingLocal, setIsLoadingLocal] = useState(true);
  const [isLoadingGlobal, setIsLoadingGlobal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

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

  // Load global leaderboard when the global tab is selected
  useEffect(() => {
    if (activeTab !== "global" || !isAuthenticated) return;

    let cancelled = false;
    setIsLoadingGlobal(true);
    getCloudLeaderboard(20)
      .then((data) => {
        if (!cancelled) {
          setGlobalEntries(data);
          setIsLoadingGlobal(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoadingGlobal(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, isAuthenticated]);

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

      // Also submit to cloud if authenticated
      if (isAuthenticated && userId) {
        await submitCloudLeaderboardEntry(userId, submittedEntry);
        // Refresh global entries if on that tab
        if (activeTab === "global") {
          const updatedGlobal = await getCloudLeaderboard(20);
          setGlobalEntries(updatedGlobal);
        }
      }
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
              Top scouts ranked by season score
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

        {/* ── Tab switcher ──────────────────────────────────────────────── */}
        <div
          className="mb-4 flex rounded-md border border-[#27272a] p-1"
          role="tablist"
          aria-label="Leaderboard view"
        >
          <button
            role="tab"
            aria-selected={activeTab === "local"}
            aria-controls="leaderboard-panel"
            onClick={() => setActiveTab("local")}
            className={`flex flex-1 items-center justify-center gap-2 rounded py-1.5 text-sm font-medium transition ${
              activeTab === "local"
                ? "bg-emerald-500/10 text-emerald-400"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <HardDrive size={13} aria-hidden="true" />
            Local
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "global"}
            aria-controls="leaderboard-panel"
            onClick={() => setActiveTab("global")}
            className={`flex flex-1 items-center justify-center gap-2 rounded py-1.5 text-sm font-medium transition ${
              activeTab === "global"
                ? "bg-emerald-500/10 text-emerald-400"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Globe size={13} aria-hidden="true" />
            Global
          </button>
        </div>

        {/* ── Leaderboard table ─────────────────────────────────────────── */}
        <Card id="leaderboard-panel" role="tabpanel">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Award size={14} aria-hidden="true" />
              {activeTab === "local" ? "Top Scouts — Local" : "Top Scouts — Global"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {activeTab === "local" ? (
              <LeaderboardTable
                entries={localEntries}
                isLoading={isLoadingLocal}
                currentScoutName={scoutName}
              />
            ) : isAuthenticated ? (
              <LeaderboardTable
                entries={globalEntries}
                isLoading={isLoadingGlobal}
                currentScoutName={scoutName}
              />
            ) : (
              /* Not authenticated — prompt to sign in */
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Globe
                  size={40}
                  className="mb-4 text-zinc-700"
                  aria-hidden="true"
                />
                <p className="text-sm text-zinc-400">
                  Sign in to see the global leaderboard
                </p>
                <p className="mt-1 text-xs text-zinc-600">
                  Compete with scouts from around the world.
                </p>
                <Button
                  size="sm"
                  className="mt-4"
                  onClick={() => setShowAuthModal(true)}
                >
                  Sign In
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Auth modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </GameLayout>
  );
}
