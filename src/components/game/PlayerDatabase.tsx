"use client";

import { useState, useMemo } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronUp, ChevronDown, Users, FileText, Star } from "lucide-react";
import type { Player, Position } from "@/engine/core/types";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { ClubCrest } from "@/components/game/ClubCrest";

type SortKey = "name" | "age" | "position" | "club" | "league" | "observations" | "reports" | "lastSeen";
type SortDir = "asc" | "desc";

const POSITIONS: Position[] = ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST"];

interface PlayerRow {
  player: Player;
  clubId: string;
  clubName: string;
  leagueName: string;
  observationCount: number;
  reportCount: number;
  lastSeenWeek: number | null;
}

export function PlayerDatabase() {
  const {
    gameState,
    selectPlayer,
    setScreen,
    startReport,
    toggleWatchlist,
    getPlayerObservations,
    getPlayerReports,
    getClub,
    getLeague,
    getScoutedPlayers,
  } = useGameStore();

  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<Position | "">("");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [scoutedOnly, setScoutedOnly] = useState(true);
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // All hooks must be called before any early return
  const scoutedPlayers = useMemo(
    () => getScoutedPlayers(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gameState?.observations]
  );

  const allPlayers = useMemo(
    () => (gameState ? Object.values(gameState.players) : []),
    [gameState]
  );

  const sourcePlayers = scoutedOnly ? scoutedPlayers : allPlayers;

  const specialization = gameState?.scout.primarySpecialization;
  const specFilteredPlayers = useMemo(() => {
    if (scoutedOnly) return sourcePlayers; // scouted = show all observed
    if (specialization === "youth") return sourcePlayers.filter(p => p.age <= 21);
    return sourcePlayers;
  }, [sourcePlayers, scoutedOnly, specialization]);

  const rows: PlayerRow[] = useMemo(() => {
    return specFilteredPlayers.map((player) => {
      const club = getClub(player.clubId);
      const league = club ? getLeague(club.leagueId) : undefined;
      const observations = getPlayerObservations(player.id);
      const reports = getPlayerReports(player.id);
      const lastSeenWeek =
        observations.length > 0 ? Math.max(...observations.map((o) => o.week)) : null;
      return {
        player,
        clubId: club?.id ?? "",
        clubName: club?.shortName ?? "?",
        leagueName: league?.shortName ?? "?",
        observationCount: observations.length,
        reportCount: reports.length,
        lastSeenWeek,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specFilteredPlayers, gameState?.observations, gameState?.reports]);

  const filtered = useMemo(() => {
    let result = rows;

    if (watchlistOnly && gameState) {
      const wl = new Set(gameState.watchlist);
      result = result.filter((r) => wl.has(r.player.id));
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (r) =>
          `${r.player.firstName} ${r.player.lastName}`.toLowerCase().includes(q) ||
          r.clubName.toLowerCase().includes(q) ||
          r.leagueName.toLowerCase().includes(q)
      );
    }

    if (positionFilter) {
      result = result.filter((r) => r.player.position === positionFilter);
    }

    if (minAge) {
      result = result.filter((r) => r.player.age >= Number(minAge));
    }

    if (maxAge) {
      result = result.filter((r) => r.player.age <= Number(maxAge));
    }

    return result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = `${a.player.lastName}${a.player.firstName}`.localeCompare(
            `${b.player.lastName}${b.player.firstName}`
          );
          break;
        case "age":
          cmp = a.player.age - b.player.age;
          break;
        case "position":
          cmp = a.player.position.localeCompare(b.player.position);
          break;
        case "club":
          cmp = a.clubName.localeCompare(b.clubName);
          break;
        case "league":
          cmp = a.leagueName.localeCompare(b.leagueName);
          break;
        case "observations":
          cmp = a.observationCount - b.observationCount;
          break;
        case "reports":
          cmp = a.reportCount - b.reportCount;
          break;
        case "lastSeen":
          cmp = (a.lastSeenWeek ?? -1) - (b.lastSeenWeek ?? -1);
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, search, positionFilter, minAge, maxAge, sortKey, sortDir, watchlistOnly, gameState]);

  // Early return after all hooks
  if (!gameState) return null;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const handleRowClick = (playerId: string) => {
    selectPlayer(playerId);
    setScreen("playerProfile");
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
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
            <p className="text-sm text-zinc-400">{filtered.length} players shown</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={watchlistOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setWatchlistOnly(!watchlistOnly)}
            >
              <Star size={12} className={`mr-1 ${watchlistOnly ? "fill-amber-400 text-amber-400" : ""}`} aria-hidden="true" />
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
              All Players
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-4 rounded-lg border border-[#27272a] bg-[#141414] p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                aria-hidden="true"
              />
              <input
                type="text"
                placeholder="Search name, club, league..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-[#27272a] bg-[#0a0a0a] py-2 pl-8 pr-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                aria-label="Search players"
              />
            </div>
            <select
              value={positionFilter}
              onChange={(e) => setPositionFilter(e.target.value as Position | "")}
              className="rounded-md border border-[#27272a] bg-[#0a0a0a] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              aria-label="Filter by position"
            >
              <option value="">All Positions</option>
              {POSITIONS.map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <label htmlFor="minAge" className="text-xs text-zinc-500 shrink-0">
                Age
              </label>
              <input
                id="minAge"
                type="number"
                placeholder="Min"
                value={minAge}
                onChange={(e) => setMinAge(e.target.value)}
                min={15}
                max={45}
                className="w-16 rounded-md border border-[#27272a] bg-[#0a0a0a] px-2 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <span className="text-zinc-600" aria-hidden="true">
                –
              </span>
              <label htmlFor="maxAge" className="sr-only">
                Max age
              </label>
              <input
                id="maxAge"
                type="number"
                placeholder="Max"
                value={maxAge}
                onChange={(e) => setMaxAge(e.target.value)}
                min={15}
                max={45}
                className="w-16 rounded-md border border-[#27272a] bg-[#0a0a0a] px-2 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-[#27272a] overflow-hidden">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users size={32} className="mb-3 text-zinc-700" aria-hidden="true" />
              <p className="text-sm text-zinc-500">
                {scoutedOnly
                  ? "No scouted players yet. Attend matches and observe players."
                  : "No players match your filters."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#27272a] bg-[#141414] text-left text-xs text-zinc-500">
                    {(
                      [
                        ["name", "Name"],
                        ["age", "Age"],
                        ["position", "Pos"],
                        ["club", "Club"],
                        ["league", "League"],
                        ["observations", "Obs"],
                        ["reports", "Rep"],
                        ["lastSeen", "Last Seen"],
                      ] as [SortKey, string][]
                    ).map(([key, label], i) => (
                      <th key={`${key}-${i}`} className="px-4 py-3 font-medium">
                        <button
                          onClick={() => handleSort(key)}
                          className="flex items-center gap-1 hover:text-white transition"
                          aria-label={`Sort by ${label}`}
                        >
                          {label}
                          <SortIcon col={key} />
                        </button>
                      </th>
                    ))}
                    {/* Non-sortable actions column */}
                    <th className="px-4 py-3 font-medium" scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr
                      key={row.player.id}
                      onClick={() => handleRowClick(row.player.id)}
                      className="cursor-pointer border-b border-[#27272a] bg-[#0a0a0a] transition hover:bg-[#141414]"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleRowClick(row.player.id);
                        }
                      }}
                      role="button"
                      aria-label={`View profile for ${row.player.firstName} ${row.player.lastName}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleWatchlist(row.player.id);
                            }}
                            className="shrink-0"
                            aria-label={gameState.watchlist.includes(row.player.id) ? "Remove from watchlist" : "Add to watchlist"}
                          >
                            <Star
                              size={12}
                              className={
                                gameState.watchlist.includes(row.player.id)
                                  ? "text-amber-400 fill-amber-400"
                                  : "text-zinc-700 hover:text-zinc-500 transition"
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
                      <td className="px-4 py-3">
                        <span
                          className={
                            row.observationCount > 0 ? "text-emerald-400" : "text-zinc-600"
                          }
                        >
                          {row.observationCount}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={row.reportCount > 0 ? "text-amber-400" : "text-zinc-600"}
                        >
                          {row.reportCount}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-500">
                        {row.lastSeenWeek ? `W${row.lastSeenWeek}` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {row.observationCount > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startReport(row.player.id);
                            }}
                            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-amber-400 hover:bg-amber-500/10 hover:text-amber-300 transition focus:outline-none focus:ring-1 focus:ring-amber-500"
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
          )}
        </div>
      </div>
    </GameLayout>
  );
}
