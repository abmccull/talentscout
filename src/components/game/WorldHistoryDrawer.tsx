"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  History,
  Trophy,
  X,
} from "lucide-react";
import type { Club, League, Player } from "@/engine/core/types";
import type {
  ClubSeasonHistory,
  PlayerSeasonHistory,
  WorldHistoryState,
  WorldSeasonHistory,
} from "@/engine/world/worldHistory";

interface WorldHistoryDrawerProps {
  history?: WorldHistoryState;
  currentSeason: number;
  clubs: Record<string, Club>;
  leagues: Record<string, League>;
  players: Record<string, Player>;
  retiredPlayers: Record<string, Player>;
  onOpenPlayer?: (playerId: string) => void;
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function clubName(clubs: Record<string, Club>, clubId: string): string {
  return clubs[clubId]?.name ?? "Historic club";
}

function playerName(
  players: Record<string, Player>,
  retiredPlayers: Record<string, Player>,
  history: PlayerSeasonHistory,
): string {
  const player = players[history.playerId] ?? retiredPlayers[history.playerId];
  if (player) return `${player.firstName} ${player.lastName}`;
  if (history.firstName || history.lastName) {
    return `${history.firstName ?? ""} ${history.lastName ?? ""}`.trim();
  }
  return "Historic player";
}

interface SeasonStory {
  champions: Array<{ leagueName: string; club: ClubSeasonHistory }>;
  promoted: ClubSeasonHistory[];
  relegated: ClubSeasonHistory[];
  performers: PlayerSeasonHistory[];
}

function buildSeasonStory(
  season: WorldSeasonHistory,
  leagues: Record<string, League>,
): SeasonStory {
  const champions = season.leagues.flatMap((league) => {
    const winner = season.clubs.find((club) =>
      club.leagueId === league.leagueId && club.standing?.position === 1,
    );
    return winner
      ? [{ leagueName: leagues[league.leagueId]?.name ?? "Historic competition", club: winner }]
      : [];
  });
  const performers = season.players
    .filter((player) => (player.performance?.appearances ?? 0) >= 3)
    .sort((left, right) =>
      (right.performance?.averageRating ?? 0) - (left.performance?.averageRating ?? 0)
      || (right.performance?.appearances ?? 0) - (left.performance?.appearances ?? 0)
      || left.playerId.localeCompare(right.playerId),
    )
    .slice(0, 5);
  return {
    champions,
    promoted: season.clubs.filter((club) => club.leagueMovement === "promoted"),
    relegated: season.clubs.filter((club) => club.leagueMovement === "relegated"),
    performers,
  };
}

function ClubMovementList({
  title,
  clubs: entries,
  clubsById,
  leaguesById,
  direction,
}: {
  title: string;
  clubs: ClubSeasonHistory[];
  clubsById: Record<string, Club>;
  leaguesById: Record<string, League>;
  direction: "up" | "down";
}) {
  const Icon = direction === "up" ? ArrowUpRight : ArrowDownRight;
  const tone = direction === "up" ? "text-emerald-300" : "text-rose-300";
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
      <h3 className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] ${tone}`}>
        <Icon size={15} aria-hidden="true" />
        {title}
      </h3>
      {entries.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {entries.map((club) => (
            <li key={club.clubId} className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-zinc-100">{clubName(clubsById, club.clubId)}</span>
              <span className="text-right text-xs text-zinc-500">
                {club.nextLeagueId
                  ? leaguesById[club.nextLeagueId]?.name ?? "Historic division"
                  : "Recorded move"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">No supported movement was recorded.</p>
      )}
    </section>
  );
}

export function WorldHistoryDrawer({
  history,
  currentSeason,
  clubs,
  leagues,
  players,
  retiredPlayers,
  onOpenPlayer,
}: WorldHistoryDrawerProps) {
  const [open, setOpen] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const seasons = history?.seasons ?? [];
  const season = seasons.find((candidate) => candidate.season === selectedSeason)
    ?? seasons[seasons.length - 1];
  const story = useMemo(
    () => season ? buildSeasonStory(season, leagues) : undefined,
    [season, leagues],
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("hidden") && element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }));
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls="world-history-drawer"
        onClick={() => setOpen((value) => !value)}
        className="absolute right-3 top-16 z-30 flex min-h-11 items-center gap-2 rounded-lg border border-amber-500/30 bg-zinc-950/90 px-3 py-2 text-xs font-semibold text-amber-200 shadow-lg backdrop-blur-md transition hover:border-amber-400/60 hover:bg-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
      >
        <History size={16} aria-hidden="true" />
        World Archive
        {seasons.length > 0 && (
          <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[10px] text-amber-100">
            {seasons.length}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            aria-hidden="true"
            className="absolute inset-0 z-[35] bg-black/25 backdrop-blur-[1px]"
            onMouseDown={close}
          />
        <section
          id="world-history-drawer"
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="world-history-title"
          aria-describedby="world-history-description"
          className="absolute inset-x-3 bottom-3 top-28 z-40 overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur-xl focus:outline-none md:left-auto md:w-[min(460px,calc(100%-1.5rem))]"
        >
          <div className="sticky top-0 z-10 -mx-1 -mt-1 flex items-start justify-between gap-4 bg-zinc-950/95 px-1 pb-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-300">
                Living world record
              </p>
              <h2 id="world-history-title" className="mt-1 text-xl font-semibold text-white">The seasons beyond your desk</h2>
              <p id="world-history-description" className="mt-1 text-xs leading-relaxed text-zinc-400">
                Only played results, explicit appearances, and resolved movements are archived.
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close world archive"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-700 text-zinc-300 transition hover:border-zinc-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          {season && story ? (
            <>
              <label className="mt-2 block sm:hidden">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Jump to archived season
                </span>
                <select
                  value={season.season}
                  onChange={(event) => setSelectedSeason(Number(event.target.value))}
                  className="mt-2 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm font-semibold text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
                >
                  {seasons.map((entry) => (
                    <option key={entry.season} value={entry.season}>Season {entry.season}</option>
                  ))}
                </select>
              </label>
              <div className="mt-2 hidden gap-2 overflow-x-auto pb-2 sm:flex" aria-label="Archived seasons">
                {seasons.map((entry) => {
                  const selected = entry.season === season.season;
                  return (
                    <button
                      key={entry.season}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setSelectedSeason(entry.season)}
                      className={`min-h-11 shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300 ${
                        selected
                          ? "border-amber-400/60 bg-amber-400/15 text-amber-100"
                          : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                      }`}
                    >
                      Season {entry.season}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Leagues</p>
                  <p className="mt-1 text-lg font-semibold text-white">{season.leagues.length}</p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Clubs</p>
                  <p className="mt-1 text-lg font-semibold text-white">{season.clubs.length}</p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Players</p>
                  <p className="mt-1 text-lg font-semibold text-white">{season.players.length}</p>
                </div>
              </div>

              <section className="mt-3 rounded-xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-zinc-950 p-4">
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">
                  <Trophy size={16} aria-hidden="true" />
                  Champions
                </h3>
                {story.champions.length > 0 ? (
                  <ul className="mt-3 space-y-3">
                    {story.champions.map(({ leagueName, club }) => (
                      <li key={`${club.leagueId}:${club.clubId}`}>
                        <p className="text-sm font-semibold text-white">{clubName(clubs, club.clubId)}</p>
                        <p className="mt-0.5 text-xs text-zinc-400">
                          {leagueName}
                          {club.standing ? ` · ${club.standing.points} points · ${club.standing.goalDifference >= 0 ? "+" : ""}${club.standing.goalDifference} GD` : ""}
                        </p>
                        {club.manager && (
                          <p className="mt-1 text-[11px] text-zinc-500">
                            {club.manager.managerName} · {club.manager.preferredFormation} · {club.manager.scoutingPreference}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-xs text-zinc-500">No league had enough played results to name a champion.</p>
                )}
              </section>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <ClubMovementList title="Promoted" clubs={story.promoted} clubsById={clubs} leaguesById={leagues} direction="up" />
                <ClubMovementList title="Relegated" clubs={story.relegated} clubsById={clubs} leaguesById={leagues} direction="down" />
              </div>

              <section className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/70 p-4">
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-300">
                  <Activity size={16} aria-hidden="true" />
                  Observable season performers
                </h3>
                {story.performers.length > 0 ? (
                  <ol className="mt-3 space-y-3">
                    {story.performers.map((player, index) => (
                      <li key={player.playerId} className="flex items-start gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-xs font-semibold text-blue-300">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              {onOpenPlayer && players[player.playerId] ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    close();
                                    onOpenPlayer(player.playerId);
                                  }}
                                  className="truncate text-left text-sm font-medium text-zinc-100 underline-offset-4 transition hover:text-blue-200 hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300"
                                >
                                  {playerName(players, retiredPlayers, player)}
                                </button>
                              ) : (
                                <p className="truncate text-sm font-medium text-zinc-100">
                                  {playerName(players, retiredPlayers, player)}
                                </p>
                              )}
                              <p className="text-[11px] text-zinc-500">
                                {player.position} · {player.status} · {formatMoney(player.marketValue)}
                              </p>
                            </div>
                            <span className="shrink-0 text-sm font-semibold text-blue-200">
                              {player.performance?.averageRating.toFixed(1)}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-zinc-400">
                            {player.performance?.appearances} apps · {player.performance?.starts} starts · {player.performance?.goals} goals · {player.performance?.assists} assists
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-3 text-xs leading-relaxed text-zinc-500">
                    No player has three explicit appearances in this archived season.
                  </p>
                )}
              </section>
            </>
          ) : (
            <div className="mt-8 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 p-6 text-center">
              <History className="mx-auto text-zinc-600" size={28} aria-hidden="true" />
              <h3 className="mt-3 text-sm font-semibold text-zinc-200">The archive starts after season one</h3>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                You are in season {currentSeason}. Final tables, movements, managers, and explicit performances will be sealed here at rollover.
              </p>
            </div>
          )}
        </section>
        </>
      )}
    </>
  );
}
