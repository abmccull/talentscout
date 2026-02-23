"use client";

import { useEffect, useState, useRef } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, Plus, X, ChevronRight, Trophy, ChevronDown, BarChart3 } from "lucide-react";
import { Tooltip } from "@/components/ui/tooltip";
import { PitchCanvas } from "./match/PitchCanvas";
import { Commentary } from "./match/Commentary";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { useAudio } from "@/lib/audio/useAudio";
import { useTranslations } from "next-intl";

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

type FocusLens = "technical" | "physical" | "mental" | "tactical" | "general";

const LENS_KEYS: FocusLens[] = ["technical", "physical", "mental", "tactical", "general"];

const LENS_COLORS: Record<FocusLens, string> = {
  technical: "text-blue-400",
  physical:  "text-orange-400",
  mental:    "text-purple-400",
  tactical:  "text-yellow-400",
  general:   "text-zinc-400",
};

// ---------------------------------------------------------------------------
// MatchScreen
// ---------------------------------------------------------------------------

export function MatchScreen() {
  const {
    gameState,
    activeMatch,
    advancePhase,
    setFocus,
    endMatch,
    getPlayer,
    getClub,
  } = useGameStore();

  const { playSFX } = useAudio();
  const t = useTranslations("match");
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);
  // Track which player was clicked on the canvas (used to open focus picker)
  const [canvasClickedPlayerId, setCanvasClickedPlayerId] = useState<string | null>(null);
  // Collapsed state for the phase description on small screens
  const [descExpanded, setDescExpanded] = useState(true);
  // Track previous goal count to detect new goals
  const prevGoalCountRef = useRef(0);
  // Track previous shot count to detect shots (for crowd-miss SFX)
  const prevShotCountRef = useRef(0);
  // Play whistle on match start (once)
  const whistlePlayed = useRef(false);
  // Match stats bar collapsed state
  const [showStats, setShowStats] = useState(false);

  // Compute isComplete before any early return (Rules of Hooks — optional chaining
  // makes this safe when activeMatch is null).
  const isComplete =
    activeMatch != null &&
    activeMatch.currentPhase >= activeMatch.phases.length;

  // Expand description whenever phase changes
  useEffect(() => {
    setDescExpanded(true);
  }, [activeMatch?.currentPhase]);

  // Play kick-off whistle once when the match screen mounts
  useEffect(() => {
    if (activeMatch && !whistlePlayed.current) {
      whistlePlayed.current = true;
      playSFX("whistle");
    }
  }, [activeMatch, playSFX]);

  // Navigate to MatchSummaryScreen when all phases are done.
  useEffect(() => {
    if (isComplete) {
      playSFX("season-end-whistle");
      endMatch();
    }
  }, [isComplete, endMatch, playSFX]);

  // ── Guard clauses (all hooks called above) ──────────────────────────────

  if (!gameState || !activeMatch) return null;

  const fixture = gameState.fixtures[activeMatch.fixtureId];
  if (!fixture) return null;

  if (isComplete) return null;

  // ── Derived data ────────────────────────────────────────────────────────

  const homeClub = getClub(fixture.homeClubId);
  const awayClub = getClub(fixture.awayClubId);
  const currentPhase = activeMatch.phases[activeMatch.currentPhase];
  const isLastPhase = activeMatch.currentPhase >= activeMatch.phases.length - 1;

  // Running score from all phases up to and including current
  let homeGoals = 0;
  let awayGoals = 0;
  for (let i = 0; i <= activeMatch.currentPhase && i < activeMatch.phases.length; i++) {
    const phase = activeMatch.phases[i];
    for (const event of phase.events) {
      if (event.type === "goal") {
        const homePlayerIds = homeClub?.playerIds ?? [];
        if (homePlayerIds.includes(event.playerId)) homeGoals++;
        else awayGoals++;
      }
    }
  }

  // Detect new goals and play crowd reaction SFX
  const totalGoals = homeGoals + awayGoals;
  if (totalGoals > prevGoalCountRef.current) {
    prevGoalCountRef.current = totalGoals;
    playSFX("crowd-goal");
  } else {
    prevGoalCountRef.current = totalGoals;
  }

  // Detect shots that didn't result in goals → play crowd-miss
  let totalShots = 0;
  for (let i = 0; i <= activeMatch.currentPhase && i < activeMatch.phases.length; i++) {
    for (const ev of activeMatch.phases[i].events) {
      if (ev.type === "shot") totalShots++;
    }
  }
  if (totalShots > prevShotCountRef.current) {
    prevShotCountRef.current = totalShots;
    playSFX("crowd-miss");
  } else {
    prevShotCountRef.current = totalShots;
  }

  const allInvolvedPlayerIds = currentPhase
    ? [...new Set(currentPhase.involvedPlayerIds)]
    : [];
  const focusedIds = new Set(activeMatch.focusSelections.map((f) => f.playerId));

  const availableToFocus = allInvolvedPlayerIds.filter(
    (id) => !focusedIds.has(id) && activeMatch.focusSelections.length < 3,
  );

  const handleAddFocus = (playerId: string) => {
    setFocus(playerId, "general");
    playSFX("camera-shutter");
    setShowPlayerPicker(false);
    setCanvasClickedPlayerId(null);
  };

  // When a player dot is clicked on the canvas, treat it like opening the
  // focus picker pre-selected to that player — if they are available to focus.
  const handleCanvasPlayerClick = (playerId: string) => {
    if (activeMatch.focusSelections.length >= 3) return;
    if (focusedIds.has(playerId)) return; // already focused
    if (!currentPhase?.involvedPlayerIds.includes(playerId)) return;
    setCanvasClickedPlayerId(playerId);
    setShowPlayerPicker(true);
  };

  // Build pitch player lists from club roster data
  const homePlayers = (homeClub?.playerIds ?? []).flatMap((id) => {
    const p = getPlayer(id);
    if (!p) return [];
    return [{ id: p.id, name: `${p.firstName} ${p.lastName}`, position: p.position }];
  });

  const awayPlayers = (awayClub?.playerIds ?? []).flatMap((id) => {
    const p = getPlayer(id);
    if (!p) return [];
    return [{ id: p.id, name: `${p.firstName} ${p.lastName}`, position: p.position }];
  });

  // Build player/club maps for Commentary component
  const playerMap: Record<string, { firstName: string; lastName: string; clubId: string }> = {};
  const clubMap: Record<string, { name: string }> = {};

  for (const id of [...(homeClub?.playerIds ?? []), ...(awayClub?.playerIds ?? [])]) {
    const p = getPlayer(id);
    if (p) playerMap[id] = { firstName: p.firstName, lastName: p.lastName, clubId: p.clubId };
  }

  if (homeClub) clubMap[homeClub.id] = { name: homeClub.name };
  if (awayClub) clubMap[awayClub.id] = { name: awayClub.name };

  // The first focused player id — shown as the pulsing emerald ring on canvas
  const primaryFocusedId = activeMatch.focusSelections[0]?.playerId;

  // Weather string from fixture (may be undefined)
  const weather = fixture.weather;

  // ── Match stats (derived from accumulated events) ─────────────────────
  const homePlayerIdSet = new Set(homeClub?.playerIds ?? []);
  const matchStats = (() => {
    let homePoss = 0, awayPoss = 0;
    let homeShots = 0, awayShots = 0;
    let homeFouls = 0, awayFouls = 0;
    for (let pi = 0; pi <= activeMatch.currentPhase && pi < activeMatch.phases.length; pi++) {
      for (const ev of activeMatch.phases[pi].events) {
        const isHomePlayer = homePlayerIdSet.has(ev.playerId);
        if (ev.type === "pass" || ev.type === "positioning") {
          if (isHomePlayer) homePoss++; else awayPoss++;
        }
        if (ev.type === "shot" || ev.type === "goal") {
          if (isHomePlayer) homeShots++; else awayShots++;
        }
        if (ev.type === "foul") {
          if (isHomePlayer) homeFouls++; else awayFouls++;
        }
      }
    }
    const totalPoss = homePoss + awayPoss || 1;
    return {
      homePossession: Math.round((homePoss / totalPoss) * 100),
      awayPossession: Math.round((awayPoss / totalPoss) * 100),
      homeShots,
      awayShots,
      homeFouls,
      awayFouls,
    };
  })();

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <GameLayout>
      <div className="flex h-full flex-col">

        {/* ── Top scoreboard bar ──────────────────────────────────────────── */}
        <div className="border-b border-[#27272a] bg-[#0c0c0c] px-4 py-2.5 shrink-0" data-tutorial-id="match-scoreboard">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-base font-bold">{homeClub?.shortName ?? "HOME"}</span>
              <span className="text-xl font-bold tabular-nums">
                {homeGoals} – {awayGoals}
              </span>
              <span className="text-base font-bold">{awayClub?.shortName ?? "AWAY"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="tabular-nums text-xs">
                {currentPhase ? `${currentPhase.minute}'` : "FT"}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {activeMatch.currentPhase + 1} / {activeMatch.phases.length}
              </Badge>
            </div>
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {homeClub?.name} vs {awayClub?.name}
            {weather && weather !== "clear" && weather !== "cloudy" && (
              <span className="ml-2 text-zinc-600 capitalize">· {weather}</span>
            )}
          </div>
        </div>

        {/* ── Match stats bar (collapsible) ─────────────────────────────── */}
        <div className="shrink-0 border-b border-[#27272a] bg-[#0a0a0a]">
          <button
            onClick={() => setShowStats((v) => !v)}
            className="flex w-full items-center justify-center gap-1.5 px-4 py-1 text-[10px] text-zinc-600 hover:text-zinc-400 transition"
            aria-expanded={showStats}
            aria-label="Toggle match stats"
          >
            <BarChart3 size={10} aria-hidden="true" />
            {t("stats")}
            <ChevronDown
              size={10}
              className={`transition-transform ${showStats ? "rotate-180" : ""}`}
              aria-hidden="true"
            />
          </button>
          {showStats && (
            <div className="px-4 pb-2 flex items-center justify-center gap-6 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="text-zinc-400 tabular-nums">{matchStats.homePossession}%</span>
                <div className="w-20 h-1.5 bg-[#27272a] rounded-full overflow-hidden flex">
                  <div className="bg-white/60 h-full rounded-full" style={{ width: `${matchStats.homePossession}%` }} />
                </div>
                <span className="text-zinc-600 tabular-nums">{matchStats.awayPossession}%</span>
                <span className="text-zinc-700 text-[9px]">{t("possession")}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-400 tabular-nums">{matchStats.homeShots}</span>
                <span className="text-zinc-700">-</span>
                <span className="text-zinc-600 tabular-nums">{matchStats.awayShots}</span>
                <span className="text-zinc-700 text-[9px]">{t("shots")}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-400 tabular-nums">{matchStats.homeFouls}</span>
                <span className="text-zinc-700">-</span>
                <span className="text-zinc-600 tabular-nums">{matchStats.awayFouls}</span>
                <span className="text-zinc-700 text-[9px]">{t("fouls")}</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Main body ───────────────────────────────────────────────────── */}
        <div
          className="flex flex-1 overflow-hidden"
          data-tutorial-id="match-phases"
        >
          {/* ── Left: Pitch + Commentary (60%) ──────────────────────────── */}
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

            {/* Phase description banner (collapsible) */}
            {currentPhase && (
              <div className="shrink-0 border-b border-[#27272a] bg-[#0f0f0f] px-4 py-2" data-tutorial-id="match-phase-desc">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {t(`phaseTypes.${currentPhase.type}`)}
                    </Badge>
                    {descExpanded && (
                      <p className="text-xs text-zinc-400 leading-snug truncate">
                        {currentPhase.description}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setDescExpanded((v) => !v)}
                    className="shrink-0 text-zinc-600 hover:text-zinc-400 transition"
                    aria-label={descExpanded ? "Collapse phase description" : "Expand phase description"}
                  >
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${descExpanded ? "rotate-180" : "rotate-0"}`}
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </div>
            )}

            {/* Split: pitch canvas (top) + commentary panel (bottom) */}
            <div className="flex-1 overflow-hidden flex flex-col">

              {/* Pitch canvas — takes ~55% of the remaining height */}
              <div
                className="shrink-0 bg-[#0a0a0a]"
                style={{ height: "55%" }}
                aria-label="Pitch view"
                data-tutorial-id="match-pitch"
              >
                {currentPhase ? (
                  <PitchCanvas
                    phase={currentPhase}
                    homeTeamName={homeClub?.name ?? "Home"}
                    awayTeamName={awayClub?.name ?? "Away"}
                    homePlayers={homePlayers}
                    awayPlayers={awayPlayers}
                    focusedPlayerId={primaryFocusedId}
                    weather={weather}
                    onPlayerClick={handleCanvasPlayerClick}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-zinc-700 text-sm">
                    {t("awaitingPhase")}
                  </div>
                )}
              </div>

              {/* Commentary panel — scrollable, takes remaining height */}
              <div
                className="flex-1 min-h-0 overflow-hidden border-t border-[#27272a] bg-[#0c0c0c] flex flex-col"
                data-tutorial-id="match-commentary"
              >
                <div className="shrink-0 px-4 pt-2.5 pb-1.5">
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                    {t("commentary")}
                  </h3>
                </div>
                <div className="flex-1 min-h-0 px-4 pb-3 overflow-hidden">
                  {currentPhase ? (
                    <Commentary
                      events={currentPhase.events}
                      players={playerMap}
                      clubs={clubMap}
                      focusedPlayerIds={focusedIds}
                      weather={weather}
                      homeGoals={homeGoals}
                      awayGoals={awayGoals}
                      homePlayerIds={homePlayerIdSet}
                      momentum={currentPhase.momentum ?? 50}
                      prevMomentum={
                        activeMatch.currentPhase > 0
                          ? (activeMatch.phases[activeMatch.currentPhase - 1]?.momentum ?? 50)
                          : 50
                      }
                    />
                  ) : (
                    <p className="text-xs text-zinc-600 py-4 text-center">{t("noEvents")}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ── Right sidebar: Focus panel (40%) ─────────────────────────── */}
          <div className="w-72 shrink-0 border-l border-[#27272a] bg-[#0c0c0c] flex flex-col overflow-hidden" data-tutorial-id="match-focus-panel">

            {/* Focus players section */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-3 flex items-center justify-between">
                <Tooltip
                  content={t("lensTooltips.general")}
                  side="left"
                >
                  <h3 className="text-sm font-semibold">
                    <Eye size={14} className="mr-2 inline-block text-emerald-500" aria-hidden="true" />
                    {t("focusPlayers")}
                  </h3>
                </Tooltip>
                <span className="text-xs text-zinc-500">
                  {activeMatch.focusSelections.length}/3
                </span>
              </div>

              {/* Active focus selections */}
              <div className="space-y-2">
                {activeMatch.focusSelections.map((fs) => {
                  const player = getPlayer(fs.playerId);
                  return (
                    <div
                      key={fs.playerId}
                      className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <PlayerAvatar
                            playerId={fs.playerId}
                            nationality={player?.nationality}
                            size={48}
                          />
                          <div>
                            <p className="text-sm font-medium">
                              {player
                                ? `${player.firstName} ${player.lastName}`
                                : "Unknown"}
                            </p>
                            <p className="text-xs text-zinc-500">{player?.position}</p>
                          </div>
                        </div>
                        <span className="text-xs text-zinc-500">{fs.phases.length} ph</span>
                      </div>
                      <Tooltip
                        content={t(`lensTooltips.${fs.lens}`)}
                        side="left"
                      >
                        <select
                          value={fs.lens}
                          onChange={(e) =>
                            setFocus(fs.playerId, e.target.value as FocusLens)
                          }
                          className={`w-full rounded bg-[#0a0a0a] border border-[#27272a] px-2 py-1 text-xs ${
                            LENS_COLORS[fs.lens as FocusLens]
                          } focus:outline-none focus:ring-1 focus:ring-emerald-500`}
                          aria-label={`Focus lens for ${player?.firstName ?? "player"}`}
                          data-tutorial-id="match-focus-lens"
                        >
                          {LENS_KEYS.map((lens) => (
                            <option key={lens} value={lens}>
                              {t(`lenses.${lens}`)}
                            </option>
                          ))}
                        </select>
                      </Tooltip>
                    </div>
                  );
                })}
              </div>

              {/* Add focus player UI */}
              {activeMatch.focusSelections.length < 3 && currentPhase && (
                <div className="mt-3">
                  {showPlayerPicker ? (
                    <div className="rounded-md border border-[#27272a] bg-[#141414] p-2">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium text-zinc-400">
                          {canvasClickedPlayerId
                            ? t("addThisPlayer")
                            : t("selectPlayer")}
                        </span>
                        <button
                          onClick={() => {
                            setShowPlayerPicker(false);
                            setCanvasClickedPlayerId(null);
                          }}
                          className="text-zinc-500 hover:text-white transition"
                          aria-label="Close player picker"
                        >
                          <X size={12} aria-hidden="true" />
                        </button>
                      </div>
                      {availableToFocus.length === 0 ? (
                        <p className="text-xs text-zinc-500">
                          {t("allFocused")}
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {/* If canvas click pre-selected a player, show them first */}
                          {(canvasClickedPlayerId
                            ? [
                                canvasClickedPlayerId,
                                ...availableToFocus.filter(
                                  (id) => id !== canvasClickedPlayerId,
                                ),
                              ]
                            : availableToFocus
                          )
                            .filter((id) => availableToFocus.includes(id))
                            .map((id) => {
                              const p = getPlayer(id);
                              const isPreSelected = id === canvasClickedPlayerId;
                              return (
                                <button
                                  key={id}
                                  onClick={() => handleAddFocus(id)}
                                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs transition ${
                                    isPreSelected
                                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                      : "hover:bg-[#27272a] text-zinc-300"
                                  }`}
                                >
                                  <span>
                                    {p
                                      ? `${p.firstName} ${p.lastName}`
                                      : id}
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
                      onClick={() => {
                        setCanvasClickedPlayerId(null);
                        setShowPlayerPicker(true);
                      }}
                    >
                      <Plus size={14} className="mr-1" aria-hidden="true" />
                      {t("addFocusPlayer")}
                    </Button>
                  )}
                </div>
              )}

              {/* Involved players legend */}
              {currentPhase && allInvolvedPlayerIds.length > 0 && (
                <div className="mt-4 border-t border-[#27272a] pt-3" data-tutorial-id="match-involved-players">
                  <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                    {t("involvedThisPhase")}
                  </h4>
                  <div className="space-y-1">
                    {allInvolvedPlayerIds.map((id) => {
                      const p = getPlayer(id);
                      const isFocusedPlayer = focusedIds.has(id);
                      const isHome = homeClub?.playerIds?.includes(id) ?? false;
                      return (
                        <div
                          key={id}
                          className={`flex items-center justify-between text-xs px-1.5 py-0.5 rounded ${
                            isFocusedPlayer ? "text-emerald-400" : "text-zinc-400"
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            {/* Team colour dot */}
                            <span
                              className={`inline-block w-1.5 h-1.5 rounded-full ${
                                isHome ? "bg-white" : "bg-[#8b2252]"
                              }`}
                              aria-hidden="true"
                            />
                            {p ? `${p.firstName} ${p.lastName}` : id}
                          </span>
                          <span className="text-zinc-600">{p?.position}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Advance / end match buttons — pinned to bottom */}
            <div className="shrink-0 border-t border-[#27272a] p-4 space-y-2" data-tutorial-id="match-advance-btn">
              {isLastPhase ? (
                <Button className="w-full" onClick={endMatch}>
                  <Trophy size={14} className="mr-2" aria-hidden="true" />
                  {t("endMatch")}
                </Button>
              ) : (
                <Button className="w-full" onClick={() => {
                  advancePhase();
                  // Play crowd chant occasionally during attacking phases
                  const next = activeMatch.phases[activeMatch.currentPhase + 1];
                  if (next && (next.type === "counterAttack" || next.type === "setpiece")) {
                    playSFX("crowd-chant");
                  }
                }}>
                  <ChevronRight size={14} className="mr-2" aria-hidden="true" />
                  {t("nextPhase")}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </GameLayout>
  );
}
