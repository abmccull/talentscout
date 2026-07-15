"use client";

import { useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  ChevronUp,
  ChevronDown,
  Users,
  FileText,
  Star,
  Lock,
} from "lucide-react";
import type { Position } from "@/engine/core/types";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { ClubCrest } from "@/components/game/ClubCrest";
import { MiniStarRange } from "@/components/ui/MiniStarRange";
import {
  buildPlayerDatabaseIndexes,
  buildPlayerDatabaseRows,
  filterAndSortPlayerRows,
  filterPlayersForSpecialization,
  paginateRows,
  type PlayerDatabaseSortDir,
  type PlayerDatabaseSortKey,
} from "./queries/playerDatabaseQuery";

const PAGE_SIZE = 50;
const POSITIONS: Position[] = [
  "GK",
  "CB",
  "LB",
  "RB",
  "CDM",
  "CM",
  "CAM",
  "LW",
  "RW",
  "ST",
];

function formatValue(n: number): string {
  if (n >= 1_000_000) return `\u00A3${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `\u00A3${(n / 1_000).toFixed(0)}K`;
  return `\u00A3${n}`;
}

function parseValueInput(input: string): number {
  const trimmed = input.trim().replace(/[\u00A3,]/g, "");
  const upper = trimmed.toUpperCase();
  if (upper.endsWith("M")) return parseFloat(upper) * 1_000_000;
  if (upper.endsWith("K")) return parseFloat(upper) * 1_000;
  return parseFloat(trimmed) || 0;
}

export function PlayerDatabase() {
  const {
    players,
    clubs,
    leagues,
    observations,
    reports,
    watchlist,
    freeAgentPool,
    specialization,
    selectPlayer,
    setScreen,
    startReport,
    toggleWatchlist,
  } = useGameStore(
    useShallow((state) => ({
      players: state.gameState?.players,
      clubs: state.gameState?.clubs,
      leagues: state.gameState?.leagues,
      observations: state.gameState?.observations,
      reports: state.gameState?.reports,
      watchlist: state.gameState?.watchlist,
      freeAgentPool: state.gameState?.freeAgentPool,
      specialization: state.gameState?.scout.primarySpecialization,
      selectPlayer: state.selectPlayer,
      setScreen: state.setScreen,
      startReport: state.startReport,
      toggleWatchlist: state.toggleWatchlist,
    })),
  );

  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<Position | "">("");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [scoutedOnly, setScoutedOnly] = useState(true);
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [sortKey, setSortKey] = useState<PlayerDatabaseSortKey>("name");
  const [sortDir, setSortDir] = useState<PlayerDatabaseSortDir>("asc");
  const [nationalityFilter, setNationalityFilter] = useState("");
  const [leagueFilter, setLeagueFilter] = useState("");
  const [minValue, setMinValue] = useState("");
  const [maxValue, setMaxValue] = useState("");
  const [page, setPage] = useState(1);

  const allPlayers = useMemo(() => Object.values(players ?? {}), [players]);
  const indexes = useMemo(
    () => buildPlayerDatabaseIndexes(observations, reports),
    [observations, reports],
  );

  const scoutedPlayers = useMemo(
    () => allPlayers.filter((player) => indexes.scoutedPlayerIds.has(player.id)),
    [allPlayers, indexes],
  );

  const isGlobalQueryReady = useMemo(
    () =>
      search.trim().length >= 2
      || Boolean(positionFilter)
      || Boolean(minAge)
      || Boolean(maxAge)
      || Boolean(nationalityFilter)
      || Boolean(leagueFilter)
      || Boolean(minValue)
      || Boolean(maxValue)
      || watchlistOnly,
    [
      search,
      positionFilter,
      minAge,
      maxAge,
      nationalityFilter,
      leagueFilter,
      minValue,
      maxValue,
      watchlistOnly,
    ],
  );

  const sourcePlayers =
    scoutedOnly || !isGlobalQueryReady ? scoutedPlayers : allPlayers;

  const specFilteredPlayers = useMemo(
    () =>
      filterPlayersForSpecialization(
        sourcePlayers,
        specialization,
        scoutedOnly,
      ),
    [sourcePlayers, specialization, scoutedOnly],
  );

  const rows = useMemo(
    () => buildPlayerDatabaseRows(specFilteredPlayers, clubs, leagues, indexes),
    [specFilteredPlayers, clubs, leagues, indexes],
  );

  const allNationalities = useMemo(
    () => [...new Set(specFilteredPlayers.map((player) => player.nationality))].sort(),
    [specFilteredPlayers],
  );

  const allLeagues = useMemo(
    () =>
      [...new Set(rows.map((row) => row.leagueName).filter((league) => league !== "?"))].sort(),
    [rows],
  );

  const watchlistSet = useMemo(() => new Set(watchlist ?? []), [watchlist]);

  const filtered = useMemo(
    () =>
      filterAndSortPlayerRows(
        rows,
        {
          search,
          positionFilter,
          minAge: minAge ? Number(minAge) : undefined,
          maxAge: maxAge ? Number(maxAge) : undefined,
          nationalityFilter,
          leagueFilter,
          minValue: minValue ? parseValueInput(minValue) : undefined,
          maxValue: maxValue ? parseValueInput(maxValue) : undefined,
          watchlistOnly,
          watchlist: watchlistSet,
        },
        sortKey,
        sortDir,
      ),
    [
      rows,
      search,
      positionFilter,
      minAge,
      maxAge,
      nationalityFilter,
      leagueFilter,
      minValue,
      maxValue,
      watchlistOnly,
      watchlistSet,
      sortKey,
      sortDir,
    ],
  );

  const paginated = useMemo(
    () => paginateRows(filtered, page, PAGE_SIZE),
    [filtered, page],
  );

  useEffect(() => {
    setPage(1);
  }, [
    search,
    positionFilter,
    minAge,
    maxAge,
    scoutedOnly,
    watchlistOnly,
    sortKey,
    sortDir,
    nationalityFilter,
    leagueFilter,
    minValue,
    maxValue,
  ]);

  if (!players) return null;

  const hasAvailableFreeAgents = freeAgentPool?.agents.some(
    (agent) => agent.status === "available",
  );
  const currentPage = paginated.page;
  const totalPages = paginated.totalPages;
  const visibleRows = paginated.items;
  const resultStart = filtered.length === 0
    ? 0
    : (currentPage - 1) * PAGE_SIZE + 1;
  const resultEnd = filtered.length === 0
    ? 0
    : Math.min(filtered.length, resultStart + visibleRows.length - 1);

  const handleSort = (key: PlayerDatabaseSortKey) => {
    if (sortKey === key) {
      setSortDir((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const handleRowClick = (playerId: string) => {
    selectPlayer(playerId);
    setScreen("playerProfile");
  };

  const SortIcon = ({ col }: { col: PlayerDatabaseSortKey }) => {
    if (sortKey !== col) return <ChevronDown size={12} className="text-zinc-600" />;
    return sortDir === "asc" ? (
      <ChevronUp size={12} className="text-emerald-400" />
    ) : (
      <ChevronDown size={12} className="text-emerald-400" />
    );
  };

  return (
    <GameLayout>
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Player Database</h1>
            <p className="text-sm text-zinc-400">
              {scoutedOnly
                ? `${filtered.length} scouted player${filtered.length !== 1 ? "s" : ""} shown`
                : isGlobalQueryReady
                  ? `${filtered.length} player${filtered.length !== 1 ? "s" : ""} matched`
                  : "Global search locked until you add a search term or filter"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={watchlistOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setWatchlistOnly(!watchlistOnly)}
            >
              <Star
                size={12}
                className={`mr-1 ${watchlistOnly ? "fill-amber-400 text-amber-400" : ""}`}
                aria-hidden="true"
              />
              Watchlist
            </Button>
            <Button
              variant={scoutedOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setScoutedOnly(true)}
            >
              Scouted Only
            </Button>
            <Button
              variant={!scoutedOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setScoutedOnly(false)}
            >
              Global Search
            </Button>
            {hasAvailableFreeAgents && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setScreen("freeAgents")}
              >
                <Users size={12} className="mr-1 text-emerald-400" aria-hidden="true" />
                Free Agents
              </Button>
            )}
          </div>
        </div>

        <div
          className="mb-4 rounded-lg border border-[#27272a] bg-[#141414] p-4"
          data-tutorial-id="player-db-search"
        >
          {!scoutedOnly && !isGlobalQueryReady && (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
              <Lock size={12} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
              <span>
                Wider database access is intentionally gated. Add a search term or at least one
                filter to query beyond your own scouting notes.
              </span>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-48 flex-1">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                aria-hidden="true"
              />
              <input
                type="text"
                placeholder="Search name, club, league..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-md border border-[#27272a] bg-[#0a0a0a] py-2 pl-8 pr-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                aria-label="Search players"
              />
            </div>

            <select
              value={positionFilter}
              onChange={(event) => setPositionFilter(event.target.value as Position | "")}
              className="rounded-md border border-[#27272a] bg-[#0a0a0a] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              aria-label="Filter by position"
            >
              <option value="">All Positions</option>
              {POSITIONS.map((position) => (
                <option key={position} value={position}>
                  {position}
                </option>
              ))}
            </select>

            <select
              value={nationalityFilter}
              onChange={(event) => setNationalityFilter(event.target.value)}
              className="rounded-md border border-[#27272a] bg-[#0a0a0a] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              aria-label="Filter by nationality"
            >
              <option value="">All Nationalities</option>
              {allNationalities.map((nationality) => (
                <option key={nationality} value={nationality}>
                  {nationality}
                </option>
              ))}
            </select>

            {allLeagues.length > 0 && (
              <select
                value={leagueFilter}
                onChange={(event) => setLeagueFilter(event.target.value)}
                className="rounded-md border border-[#27272a] bg-[#0a0a0a] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                aria-label="Filter by league"
              >
                <option value="">All Leagues</option>
                {allLeagues.map((league) => (
                  <option key={league} value={league}>
                    {league}
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center gap-2">
              <label className="shrink-0 text-xs text-zinc-500">Age</label>
              <input
                type="number"
                placeholder="Min"
                value={minAge}
                onChange={(event) => setMinAge(event.target.value)}
                min={15}
                max={45}
                aria-label="Minimum age"
                className="w-16 rounded-md border border-[#27272a] bg-[#0a0a0a] px-2 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <span className="text-zinc-600" aria-hidden="true">
                -
              </span>
              <input
                type="number"
                placeholder="Max"
                value={maxAge}
                onChange={(event) => setMaxAge(event.target.value)}
                min={15}
                max={45}
                aria-label="Maximum age"
                className="w-16 rounded-md border border-[#27272a] bg-[#0a0a0a] px-2 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="shrink-0 text-xs text-zinc-500">Value</label>
              <input
                type="text"
                placeholder="Min"
                value={minValue}
                onChange={(event) => setMinValue(event.target.value)}
                aria-label="Minimum market value"
                className="w-20 rounded-md border border-[#27272a] bg-[#0a0a0a] px-2 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <span className="text-zinc-600" aria-hidden="true">
                -
              </span>
              <input
                type="text"
                placeholder="Max"
                value={maxValue}
                onChange={(event) => setMaxValue(event.target.value)}
                aria-label="Maximum market value"
                className="w-20 rounded-md border border-[#27272a] bg-[#0a0a0a] px-2 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>

        <div
          className="overflow-hidden rounded-lg border border-[#27272a]"
          data-tutorial-id="player-db-list"
        >
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users size={32} className="mb-3 text-zinc-700" aria-hidden="true" />
              <p className="text-sm text-zinc-500">
                {scoutedOnly
                  ? "No scouted players yet. Attend matches and observe players."
                  : isGlobalQueryReady
                    ? "No players match your filters."
                    : "Add a search term or filter to unlock the wider database."}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-[#27272a] bg-[#111111] px-4 py-2 text-xs text-zinc-500">
                <span>
                  Showing {resultStart}-{resultEnd} of {filtered.length}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setPage(currentPage - 1)}
                    disabled={currentPage <= 1}
                  >
                    Prev
                  </Button>
                  <span>
                    Page {currentPage} / {totalPages}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setPage(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#27272a] bg-[#141414] text-left text-xs text-zinc-500">
                      {(
                        [
                          ["name", "Name"],
                          ["age", "Age"],
                          ["position", "Pos"],
                          ["nationality", "Nat"],
                          ["club", "Club"],
                          ["league", "League"],
                          ["value", "Value"],
                          ["ca", "Ability"],
                          ["observations", "Obs"],
                          ["reports", "Rep"],
                          ["lastSeen", "Last Seen"],
                        ] as [PlayerDatabaseSortKey, string][]
                      ).map(([key, label], index) => (
                        <th key={`${key}-${index}`} className="px-4 py-3 font-medium">
                          <button
                            onClick={() => handleSort(key)}
                            className="flex items-center gap-1 transition hover:text-white"
                            aria-label={`Sort by ${label}`}
                          >
                            {label}
                            <SortIcon col={key} />
                          </button>
                        </th>
                      ))}
                      <th className="px-4 py-3 font-medium" scope="col">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <tr
                        key={row.player.id}
                        onClick={() => handleRowClick(row.player.id)}
                        className="cursor-pointer border-b border-[#27272a] bg-[#0a0a0a] transition hover:bg-[#141414]"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            handleRowClick(row.player.id);
                          }
                        }}
                        role="button"
                        aria-label={`View profile for ${row.player.firstName} ${row.player.lastName}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleWatchlist(row.player.id);
                              }}
                              className="shrink-0"
                              aria-label={watchlistSet.has(row.player.id) ? "Remove from watchlist" : "Add to watchlist"}
                            >
                              <Star
                                size={12}
                                className={
                                  watchlistSet.has(row.player.id)
                                    ? "fill-amber-400 text-amber-400"
                                    : "text-zinc-700 transition hover:text-zinc-500"
                                }
                              />
                            </button>
                            <PlayerAvatar
                              playerId={row.player.id}
                              nationality={row.player.nationality}
                              size={48}
                            />
                            <span className="font-medium text-white">
                              {row.player.firstName} {row.player.lastName}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-zinc-400">{row.player.age}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="text-[10px]">
                            {row.player.position}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-zinc-400">{row.player.nationality}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 text-zinc-400">
                            {row.clubId && (
                              <ClubCrest
                                clubId={row.clubId}
                                clubName={row.clubName}
                                size={32}
                              />
                            )}
                            {row.clubName}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-zinc-500">{row.leagueName}</td>
                        <td className="px-4 py-3 text-zinc-400">
                          {formatValue(row.player.marketValue)}
                        </td>
                        <td className="px-4 py-3">
                          <MiniStarRange perceived={row.perceived} mode="ca" />
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={
                              row.observationCount > 0
                                ? "text-emerald-400"
                                : "text-zinc-600"
                            }
                          >
                            {row.observationCount}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={
                              row.reportCount > 0 ? "text-amber-400" : "text-zinc-600"
                            }
                          >
                            {row.reportCount}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-zinc-500">
                          {row.lastSeenWeek ? `W${row.lastSeenWeek}` : "-"}
                        </td>
                        <td className="px-4 py-3">
                          {row.observationCount > 0 && (
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                startReport(row.player.id);
                              }}
                              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-amber-400 transition hover:bg-amber-500/10 hover:text-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-500"
                              aria-label={`Write report for ${row.player.firstName} ${row.player.lastName}`}
                              title="Write Report"
                            >
                              <FileText size={12} aria-hidden="true" />
                              Report
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </GameLayout>
  );
}
