"use client";

import { useState, useMemo, useEffect } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Eye, ArrowLeft } from "lucide-react";
import type { Fixture } from "@/engine/core/types";
import { ClubCrest } from "@/components/game/ClubCrest";

export function FixtureBrowser() {
  const { gameState, startMatch, getClub, getLeague, setScreen, pendingFixtureClubFilter, setPendingFixtureClubFilter } = useGameStore();

  const [leagueFilter, setLeagueFilter] = useState("");
  const [weekMin, setWeekMin] = useState("");
  const [weekMax, setWeekMax] = useState("");
  const [clubSearch, setClubSearch] = useState(
    useGameStore.getState().pendingFixtureClubFilter ?? ""
  );
  const [showPlayed, setShowPlayed] = useState(false);

  useEffect(() => {
    if (pendingFixtureClubFilter) {
      setPendingFixtureClubFilter(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leagues = useMemo(
    () => (gameState ? Object.values(gameState.leagues) : []),
    [gameState],
  );

  const fixtures = useMemo(() => {
    if (!gameState) return [];
    let result = Object.values(gameState.fixtures);

    if (leagueFilter) {
      result = result.filter((f) => f.leagueId === leagueFilter);
    }
    if (weekMin) {
      result = result.filter((f) => f.week >= Number(weekMin));
    }
    if (weekMax) {
      result = result.filter((f) => f.week <= Number(weekMax));
    }
    if (!showPlayed) {
      result = result.filter((f) => !f.played);
    }
    if (clubSearch.trim()) {
      const q = clubSearch.trim().toLowerCase();
      result = result.filter((f) => {
        const home = gameState.clubs[f.homeClubId];
        const away = gameState.clubs[f.awayClubId];
        return (
          (home?.name ?? "").toLowerCase().includes(q) ||
          (home?.shortName ?? "").toLowerCase().includes(q) ||
          (away?.name ?? "").toLowerCase().includes(q) ||
          (away?.shortName ?? "").toLowerCase().includes(q)
        );
      });
    }
    return result.sort((a, b) => a.week - b.week);
  }, [gameState, leagueFilter, weekMin, weekMax, clubSearch, showPlayed]);

  if (!gameState) return null;

  return (
    <GameLayout>
      <div className="p-6">
        <button
          onClick={() => setScreen("dashboard")}
          className="mb-4 flex items-center gap-1 text-sm text-zinc-500 hover:text-white transition"
        >
          <ArrowLeft size={14} />
          Back to Dashboard
        </button>

        <div className="mb-6">
          <h1 className="text-2xl font-bold">Fixture Browser</h1>
          <p className="text-sm text-zinc-400">{fixtures.length} fixtures shown</p>
        </div>

        {/* Filters */}
        <div className="mb-4 rounded-lg border border-[#27272a] bg-[#141414] p-4">
          <div className="flex flex-wrap gap-3">
            <select
              value={leagueFilter}
              onChange={(e) => setLeagueFilter(e.target.value)}
              className="rounded-md border border-[#27272a] bg-[#0a0a0a] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              aria-label="Filter by league"
            >
              <option value="">All Leagues</option>
              {leagues.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-500 shrink-0">Week</label>
              <input
                type="number"
                placeholder="Min"
                value={weekMin}
                onChange={(e) => setWeekMin(e.target.value)}
                min={1}
                max={38}
                className="w-16 rounded-md border border-[#27272a] bg-[#0a0a0a] px-2 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <span className="text-zinc-600">–</span>
              <input
                type="number"
                placeholder="Max"
                value={weekMax}
                onChange={(e) => setWeekMax(e.target.value)}
                min={1}
                max={38}
                className="w-16 rounded-md border border-[#27272a] bg-[#0a0a0a] px-2 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div className="relative flex-1 min-w-48">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
                aria-hidden="true"
              />
              <input
                type="text"
                placeholder="Search club..."
                value={clubSearch}
                onChange={(e) => setClubSearch(e.target.value)}
                className="w-full rounded-md border border-[#27272a] bg-[#0a0a0a] py-2 pl-8 pr-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                aria-label="Search clubs"
              />
            </div>
            <Button
              variant={showPlayed ? "default" : "outline"}
              size="sm"
              onClick={() => setShowPlayed(!showPlayed)}
            >
              {showPlayed ? "Hiding Played" : "Show Played"}
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-[#27272a] overflow-hidden">
          {fixtures.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-zinc-500">No fixtures match your filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#27272a] bg-[#141414] text-left text-xs text-zinc-500">
                    <th className="px-4 py-3 font-medium">Wk</th>
                    <th className="px-4 py-3 font-medium">Home</th>
                    <th className="px-4 py-3 font-medium text-center">Score</th>
                    <th className="px-4 py-3 font-medium">Away</th>
                    <th className="px-4 py-3 font-medium">League</th>
                    <th className="px-4 py-3 font-medium">Weather</th>
                    <th className="px-4 py-3 font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {fixtures.slice(0, 100).map((f) => {
                    const home = gameState.clubs[f.homeClubId];
                    const away = gameState.clubs[f.awayClubId];
                    const league = gameState.leagues[f.leagueId];
                    return (
                      <tr
                        key={f.id}
                        className="border-b border-[#27272a] bg-[#0a0a0a] transition hover:bg-[#141414]"
                      >
                        <td className="px-4 py-3 text-zinc-400 tabular-nums">{f.week}</td>
                        <td className="px-4 py-3 font-medium text-white">
                          <div className="flex items-center gap-1.5">
                            {home && (
                              <ClubCrest
                                clubId={home.id}
                                clubName={home.name}
                                size={32}
                              />
                            )}
                            {home?.name ?? "?"}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums">
                          {f.played ? (
                            <span className="text-white">
                              {f.homeGoals} – {f.awayGoals}
                            </span>
                          ) : (
                            <span className="text-zinc-600">–</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-white">
                          <div className="flex items-center gap-1.5">
                            {away && (
                              <ClubCrest
                                clubId={away.id}
                                clubName={away.name}
                                size={32}
                              />
                            )}
                            {away?.name ?? "?"}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="text-[10px]">
                            {league?.shortName ?? "?"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-zinc-500 capitalize text-xs">
                          {f.weather
                            ? f.weather.replace(/([A-Z])/g, " $1").trim()
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {!f.played && f.week === gameState.currentWeek && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => startMatch(f.id)}
                            >
                              <Eye size={14} className="mr-1" aria-hidden="true" />
                              Scout
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {fixtures.length > 100 && (
          <p className="mt-2 text-xs text-zinc-500">
            Showing first 100 of {fixtures.length} fixtures. Use filters to narrow results.
          </p>
        )}
      </div>
    </GameLayout>
  );
}
