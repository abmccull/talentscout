"use client";

import { useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Trophy,
  Eye,
  FileText,
  User,
  ChevronRight,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
import { ATTRIBUTE_DOMAINS } from "@/engine/core/types";
import type { AttributeDomain } from "@/engine/core/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function confidenceLabel(confidence: number): { label: string; className: string } {
  if (confidence >= 0.75) return { label: "High", className: "text-emerald-400" };
  if (confidence >= 0.45) return { label: "Medium", className: "text-amber-400" };
  return { label: "Low", className: "text-red-400" };
}

function scoreResultLabel(homeGoals: number, awayGoals: number): string {
  if (homeGoals > awayGoals) return "Home Win";
  if (awayGoals > homeGoals) return "Away Win";
  return "Draw";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const DOMAIN_ORDER: AttributeDomain[] = ["technical", "physical", "mental", "tactical"];
const DOMAIN_LABELS: Record<string, string> = {
  technical: "Technical",
  physical: "Physical",
  mental: "Mental",
  tactical: "Tactical",
};

function readingConfidenceColor(confidence: number): string {
  if (confidence >= 0.7) return "text-emerald-400";
  if (confidence >= 0.4) return "text-amber-400";
  return "text-red-400";
}

function readingBarColor(confidence: number): string {
  if (confidence >= 0.7) return "bg-emerald-500";
  if (confidence >= 0.4) return "bg-amber-500";
  return "bg-red-500";
}

export function MatchSummaryScreen() {
  const {
    gameState,
    lastMatchResult,
    getPlayer,
    getClub,
    getFixture,
    getPlayerObservations,
    selectPlayer,
    startReport,
    setScreen,
  } = useGameStore();
  const [expandedPlayers, setExpandedPlayers] = useState<Set<string>>(new Set());

  const toggleExpanded = (playerId: string) => {
    setExpandedPlayers((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  };

  // All hooks called before any early return
  const fixture = lastMatchResult ? getFixture(lastMatchResult.fixtureId) : undefined;
  const homeClub = fixture ? getClub(fixture.homeClubId) : undefined;
  const awayClub = fixture ? getClub(fixture.awayClubId) : undefined;

  if (!gameState || !lastMatchResult) return null;

  const { focusedPlayerIds, homeGoals, awayGoals, continueScreen } = lastMatchResult;

  // Build per-player summary rows using the observations that were just created
  const playerRows = focusedPlayerIds.map((playerId) => {
    const player = getPlayer(playerId);
    const playerClub = player ? getClub(player.clubId) : undefined;
    const observations = getPlayerObservations(playerId);
    const totalReadings = observations.reduce(
      (sum, o) => sum + o.attributeReadings.length,
      0,
    );
    const allReadings = observations.flatMap((o) => o.attributeReadings);
    const avgConfidence =
      allReadings.length > 0
        ? allReadings.reduce((sum, r) => sum + r.confidence, 0) / allReadings.length
        : 0;

    return {
      playerId,
      player,
      playerClub,
      totalReadings,
      avgConfidence,
      hasObservations: observations.length > 0,
    };
  });

  const handleViewProfile = (playerId: string) => {
    selectPlayer(playerId);
    setScreen("playerProfile");
  };

  const handleWriteReport = (playerId: string) => {
    startReport(playerId);
  };

  const handleContinue = () => {
    setScreen(continueScreen);
  };

  return (
    <GameLayout>
      <div className="flex h-full items-start justify-center overflow-auto p-6">
        <div className="w-full max-w-2xl space-y-4">
          {/* Header card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Trophy size={20} className="text-emerald-500" aria-hidden="true" />
                Match Complete
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Score */}
              {fixture && homeClub && awayClub ? (
                <div className="rounded-lg border border-[#27272a] bg-[#141414] p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-center flex-1">
                      <p className="text-sm font-semibold text-white">{homeClub.shortName}</p>
                      <p className="text-xs text-zinc-500 truncate max-w-[120px] mx-auto">
                        {homeClub.name}
                      </p>
                    </div>
                    <div className="text-center px-4">
                      <p className="text-3xl font-bold tabular-nums text-white">
                        {homeGoals} <span className="text-zinc-500">–</span> {awayGoals}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">
                        {scoreResultLabel(homeGoals, awayGoals)}
                      </p>
                    </div>
                    <div className="text-center flex-1">
                      <p className="text-sm font-semibold text-white">{awayClub.shortName}</p>
                      <p className="text-xs text-zinc-500 truncate max-w-[120px] mx-auto">
                        {awayClub.name}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Observation summary header */}
              <div className="flex items-center gap-2">
                <Eye size={14} className="text-emerald-500" aria-hidden="true" />
                <p className="text-sm text-zinc-400">
                  You observed{" "}
                  <span className="font-semibold text-white">{focusedPlayerIds.length}</span>{" "}
                  player{focusedPlayerIds.length !== 1 ? "s" : ""} during this match.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* No observations warning */}
          {focusedPlayerIds.length === 0 && (
            <div
              className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4"
              role="alert"
            >
              <AlertTriangle
                size={16}
                className="mt-0.5 shrink-0 text-amber-400"
                aria-hidden="true"
              />
              <p className="text-sm text-amber-300">
                No players were focused this match. Add focus players during a match to generate
                observations you can use for reports.
              </p>
            </div>
          )}

          {/* Per-player cards */}
          {playerRows.length > 0 && (
            <section aria-label="Observed players">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Observations Recorded
              </h2>
              <div className="space-y-3">
                {playerRows.map(
                  ({ playerId, player, playerClub, totalReadings, avgConfidence, hasObservations }) => {
                    const conf = confidenceLabel(avgConfidence);
                    return (
                      <Card key={playerId}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-4">
                            {/* Player info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-semibold text-white truncate">
                                  {player
                                    ? `${player.firstName} ${player.lastName}`
                                    : "Unknown Player"}
                                </p>
                                {player && (
                                  <Badge variant="outline" className="text-[10px] shrink-0">
                                    {player.position}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-zinc-500">
                                {playerClub?.name ?? "Unknown Club"}
                              </p>

                              {/* Stats row */}
                              <div className="mt-2 flex items-center gap-4">
                                <div className="flex items-center gap-1.5">
                                  <Eye
                                    size={12}
                                    className="text-zinc-500"
                                    aria-hidden="true"
                                  />
                                  <span className="text-xs text-zinc-400">
                                    <span className="font-medium text-white">
                                      {totalReadings}
                                    </span>{" "}
                                    reading{totalReadings !== 1 ? "s" : ""}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-zinc-400">
                                    Confidence:{" "}
                                    <span className={`font-medium ${conf.className}`}>
                                      {conf.label}
                                    </span>
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Action buttons */}
                            <div className="flex flex-col gap-2 shrink-0">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleViewProfile(playerId)}
                                className="flex items-center gap-1.5"
                              >
                                <User size={13} aria-hidden="true" />
                                View Profile
                              </Button>
                              {hasObservations && (
                                <Button
                                  size="sm"
                                  onClick={() => handleWriteReport(playerId)}
                                  className="flex items-center gap-1.5"
                                >
                                  <FileText size={13} aria-hidden="true" />
                                  Write Report
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Expandable attribute readings */}
                          {hasObservations && (
                            <>
                              <button
                                onClick={() => toggleExpanded(playerId)}
                                className="mt-3 flex w-full items-center gap-1 text-xs text-zinc-400 hover:text-white transition"
                              >
                                {expandedPlayers.has(playerId) ? (
                                  <ChevronDown size={12} />
                                ) : (
                                  <ChevronRight size={12} />
                                )}
                                {expandedPlayers.has(playerId)
                                  ? "Hide attribute readings"
                                  : `Show ${totalReadings} attribute reading${totalReadings !== 1 ? "s" : ""}`}
                              </button>
                              {expandedPlayers.has(playerId) && (() => {
                                const allReadings = getPlayerObservations(playerId).flatMap(
                                  (o) => o.attributeReadings,
                                );
                                // Group by domain, dedup by attribute (keep best confidence)
                                const byAttr = new Map<string, typeof allReadings[0]>();
                                for (const r of allReadings) {
                                  const existing = byAttr.get(r.attribute);
                                  if (!existing || r.confidence > existing.confidence) {
                                    byAttr.set(r.attribute, r);
                                  }
                                }
                                const byDomain = new Map<string, typeof allReadings>();
                                for (const [attr, reading] of byAttr) {
                                  const domain = ATTRIBUTE_DOMAINS[reading.attribute] ?? "unknown";
                                  if (!byDomain.has(domain)) byDomain.set(domain, []);
                                  byDomain.get(domain)!.push(reading);
                                }
                                return (
                                  <div className="mt-2 space-y-3 rounded-md border border-[#27272a] bg-[#0c0c0c] p-3">
                                    {DOMAIN_ORDER.filter((d) => byDomain.has(d)).map(
                                      (domain) => (
                                        <div key={domain}>
                                          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                                            {DOMAIN_LABELS[domain]}
                                          </p>
                                          <div className="space-y-1">
                                            {byDomain.get(domain)!.map((r) => (
                                              <div
                                                key={r.attribute}
                                                className="flex items-center gap-2"
                                              >
                                                <span className="w-28 shrink-0 text-[11px] capitalize text-zinc-400">
                                                  {String(r.attribute)
                                                    .replace(/([A-Z])/g, " $1")
                                                    .trim()}
                                                </span>
                                                <div className="flex-1 relative h-1.5 rounded-full bg-[#27272a] overflow-hidden">
                                                  <div
                                                    className={`absolute left-0 top-0 h-full rounded-full ${readingBarColor(r.confidence)}`}
                                                    style={{
                                                      width: `${(r.perceivedValue / 20) * 100}%`,
                                                    }}
                                                  />
                                                </div>
                                                <span className="w-5 shrink-0 text-right text-[11px] font-mono font-bold text-white">
                                                  {r.perceivedValue}
                                                </span>
                                                <span
                                                  className={`w-8 shrink-0 text-right text-[10px] font-medium ${readingConfidenceColor(r.confidence)}`}
                                                >
                                                  {r.confidence >= 0.7
                                                    ? "High"
                                                    : r.confidence >= 0.4
                                                      ? "Med"
                                                      : "Low"}
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      ),
                                    )}
                                  </div>
                                );
                              })()}
                            </>
                          )}
                        </CardContent>
                      </Card>
                    );
                  },
                )}
              </div>
            </section>
          )}

          {/* Continue button */}
          <Button className="w-full" size="lg" onClick={handleContinue}>
            <ChevronRight size={16} className="mr-2" aria-hidden="true" />
            Continue
          </Button>
        </div>
      </div>
    </GameLayout>
  );
}
