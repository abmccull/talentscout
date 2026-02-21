"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, Plus, X, ChevronRight, Trophy } from "lucide-react";
import type { MatchPhase } from "@/engine/core/types";
import { EVENT_REVEALED } from "@/engine/match/phases";

type FocusLens = "technical" | "physical" | "mental" | "tactical" | "general";

const LENS_LABELS: Record<FocusLens, string> = {
  technical: "Technical",
  physical: "Physical",
  mental: "Mental",
  tactical: "Tactical",
  general: "General",
};

const LENS_COLORS: Record<FocusLens, string> = {
  technical: "text-blue-400",
  physical: "text-orange-400",
  mental: "text-purple-400",
  tactical: "text-yellow-400",
  general: "text-zinc-400",
};

function qualityColor(quality: number): string {
  if (quality >= 7) return "bg-emerald-500";
  if (quality >= 4) return "bg-amber-500";
  return "bg-red-500";
}

function phaseTypeLabel(type: MatchPhase["type"]): string {
  const labels: Record<MatchPhase["type"], string> = {
    buildUp: "Build-Up",
    transition: "Transition",
    setpiece: "Set Piece",
    pressingSequence: "Pressing",
    counterAttack: "Counter",
    possession: "Possession",
  };
  return labels[type];
}

export function MatchScreen() {
  const { gameState, activeMatch, advancePhase, setFocus, endMatch, getPlayer, getClub } =
    useGameStore();
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);

  // Compute isComplete before the early returns so the useEffect below is
  // always called unconditionally (Rules of Hooks). Optional chaining makes
  // this safe even when activeMatch is null.
  const isComplete =
    activeMatch != null &&
    activeMatch.currentPhase >= activeMatch.phases.length;

  // When all phases have been advanced through, navigate to MatchSummaryScreen.
  // This handles the edge case where currentPhase overshoots phases.length
  // (e.g. rapid clicks). endMatch() is called via useEffect to avoid
  // triggering a state update during render.
  useEffect(() => {
    if (isComplete) {
      endMatch();
    }
  }, [isComplete, endMatch]);

  if (!gameState || !activeMatch) return null;

  const fixture = gameState.fixtures[activeMatch.fixtureId];
  if (!fixture) return null;

  if (isComplete) return null;

  const homeClub = getClub(fixture.homeClubId);
  const awayClub = getClub(fixture.awayClubId);
  const currentPhase = activeMatch.phases[activeMatch.currentPhase];
  const isLastPhase = activeMatch.currentPhase >= activeMatch.phases.length - 1;

  // Compute running score from past phases' goal events
  let homeGoals = 0;
  let awayGoals = 0;
  for (let i = 0; i <= activeMatch.currentPhase && i < activeMatch.phases.length; i++) {
    const phase = activeMatch.phases[i];
    for (const event of phase.events) {
      if (event.type === "goal") {
        const homePlayerIds = (homeClub?.playerIds ?? []);
        if (homePlayerIds.includes(event.playerId)) homeGoals++;
        else awayGoals++;
      }
    }
  }

  const allInvolvedPlayerIds = currentPhase
    ? [...new Set(currentPhase.involvedPlayerIds)]
    : [];
  const focusedIds = new Set(activeMatch.focusSelections.map((f) => f.playerId));

  const availableToFocus = allInvolvedPlayerIds.filter(
    (id) => !focusedIds.has(id) && activeMatch.focusSelections.length < 3
  );

  const handleAddFocus = (playerId: string) => {
    setFocus(playerId, "general");
    setShowPlayerPicker(false);
  };

  return (
    <GameLayout>
      <div className="flex h-full flex-col">
        {/* Top bar */}
        <div className="border-b border-[#27272a] bg-[#0c0c0c] px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <span className="text-lg font-bold">{homeClub?.shortName ?? "HOME"}</span>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold tabular-nums">
                  {homeGoals} – {awayGoals}
                </span>
              </div>
              <span className="text-lg font-bold">{awayClub?.shortName ?? "AWAY"}</span>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="tabular-nums">
                {currentPhase ? `${currentPhase.minute}&apos;` : "FT"}
              </Badge>
              <Badge variant="secondary">
                Phase {activeMatch.currentPhase + 1} / {activeMatch.phases.length}
              </Badge>
            </div>
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {homeClub?.name} vs {awayClub?.name}
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Main phase area */}
          <div className="flex-1 overflow-auto p-6">
            {currentPhase && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{phaseTypeLabel(currentPhase.type)}</Badge>
                  <span className="text-sm text-zinc-400">{currentPhase.minute}&apos;</span>
                </div>

                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm leading-relaxed text-zinc-300">
                      {currentPhase.description}
                    </p>
                  </CardContent>
                </Card>

                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Events
                  </h3>
                  {currentPhase.events.map((event, i) => {
                    const eventPlayer = getPlayer(event.playerId);
                    return (
                      <div
                        key={i}
                        className="flex items-start gap-3 rounded-md border border-[#27272a] bg-[#141414] p-3"
                      >
                        <span className="shrink-0 text-xs tabular-nums text-zinc-500 pt-0.5">
                          {event.minute}&apos;
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-white">
                              {eventPlayer
                                ? `${eventPlayer.firstName} ${eventPlayer.lastName}`
                                : "Unknown"}
                            </span>
                            <span className="text-xs text-zinc-500 capitalize">{event.type}</span>
                          </div>
                          <p className="text-xs text-zinc-400 leading-relaxed">
                            {event.description}
                          </p>
                          {/* Attribute pills showing what this event reveals */}
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {event.attributesRevealed.map((attr) => {
                              const isFocused = focusedIds.has(event.playerId);
                              return (
                                <span
                                  key={attr}
                                  className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                    isFocused
                                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                      : "bg-zinc-800 text-zinc-500 border border-zinc-700"
                                  }`}
                                >
                                  {attr.replace(/([A-Z])/g, " $1").trim()}
                                  {isFocused && (
                                    <span className="text-[9px] text-emerald-500">+obs</span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <div
                            className={`h-2 w-2 rounded-full ${qualityColor(event.quality)}`}
                            title={`Quality: ${event.quality}/10`}
                          />
                          <span className="text-xs text-zinc-500">{event.quality}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right sidebar: Focus panel */}
          <div className="w-72 shrink-0 border-l border-[#27272a] bg-[#0c0c0c] p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                <Eye size={14} className="mr-2 inline-block text-emerald-500" />
                Focus Players
              </h3>
              <span className="text-xs text-zinc-500">
                {activeMatch.focusSelections.length}/3
              </span>
            </div>

            <div className="space-y-2">
              {activeMatch.focusSelections.map((fs) => {
                const player = getPlayer(fs.playerId);
                return (
                  <div
                    key={fs.playerId}
                    className="rounded-md border border-[#27272a] bg-[#141414] p-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          {player ? `${player.firstName} ${player.lastName}` : "Unknown"}
                        </p>
                        <p className="text-xs text-zinc-500">{player?.position}</p>
                      </div>
                      <span className="text-xs text-zinc-500">
                        {fs.phases.length} ph
                      </span>
                    </div>
                    <select
                      value={fs.lens}
                      onChange={(e) => setFocus(fs.playerId, e.target.value as FocusLens)}
                      className={`w-full rounded bg-[#0a0a0a] border border-[#27272a] px-2 py-1 text-xs ${LENS_COLORS[fs.lens as FocusLens]} focus:outline-none focus:ring-1 focus:ring-emerald-500`}
                      aria-label={`Focus lens for ${player?.firstName ?? "player"}`}
                    >
                      {(Object.keys(LENS_LABELS) as FocusLens[]).map((lens) => (
                        <option key={lens} value={lens}>
                          {LENS_LABELS[lens]}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            {activeMatch.focusSelections.length < 3 && currentPhase && (
              <div className="mt-3">
                {showPlayerPicker ? (
                  <div className="rounded-md border border-[#27272a] bg-[#141414] p-2">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-400">Select player</span>
                      <button
                        onClick={() => setShowPlayerPicker(false)}
                        className="text-zinc-500 hover:text-white transition"
                        aria-label="Close player picker"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    {availableToFocus.length === 0 ? (
                      <p className="text-xs text-zinc-500">All involved players already focused.</p>
                    ) : (
                      <div className="space-y-1">
                        {availableToFocus.map((id) => {
                          const p = getPlayer(id);
                          return (
                            <button
                              key={id}
                              onClick={() => handleAddFocus(id)}
                              className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-[#27272a] transition"
                            >
                              <span>
                                {p ? `${p.firstName} ${p.lastName}` : id}
                              </span>
                              <span className="text-zinc-500">{p?.position}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowPlayerPicker(true)}
                  >
                    <Plus size={14} className="mr-1" />
                    Add Focus Player
                  </Button>
                )}
              </div>
            )}

            <div className="mt-6 border-t border-[#27272a] pt-4 space-y-2">
              {isLastPhase ? (
                <Button className="w-full" onClick={endMatch}>
                  <Trophy size={14} className="mr-2" />
                  End Match
                </Button>
              ) : (
                <Button className="w-full" onClick={advancePhase}>
                  <ChevronRight size={14} className="mr-2" />
                  Next Phase
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </GameLayout>
  );
}
