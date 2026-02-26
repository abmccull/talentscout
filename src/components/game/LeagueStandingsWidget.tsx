"use client";

import { useState, useMemo } from "react";
import { useGameStore, type ClubStanding } from "@/stores/gameStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, ChevronDown, ChevronUp } from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function zoneRowClass(zone: ClubStanding["zone"]): string {
  switch (zone) {
    case "promotion":
      return "border-l-2 border-l-emerald-500/60";
    case "relegation":
      return "border-l-2 border-l-red-500/60";
    default:
      return "border-l-2 border-l-transparent";
  }
}

function zoneTextClass(zone: ClubStanding["zone"]): string {
  switch (zone) {
    case "promotion":
      return "text-emerald-400";
    case "relegation":
      return "text-red-400";
    default:
      return "text-zinc-300";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LeagueStandingsWidget() {
  const { gameState, getLeagueStandings } = useGameStore();
  const [expanded, setExpanded] = useState(false);
  const [selectedLeagueId, setSelectedLeagueId] = useState("");

  // Gather all leagues, sorted by tier then name
  const leagues = useMemo(() => {
    if (!gameState) return [];
    return Object.values(gameState.leagues).sort(
      (a, b) => a.tier - b.tier || a.name.localeCompare(b.name),
    );
  }, [gameState]);

  // Determine which league to show: prefer selected, fall back to first
  const activeLeagueId = selectedLeagueId && gameState?.leagues[selectedLeagueId]
    ? selectedLeagueId
    : leagues[0]?.id ?? "";

  const standings = getLeagueStandings(activeLeagueId);
  const selectedLeague = gameState?.leagues[activeLeagueId];

  if (!gameState || leagues.length === 0) return null;

  // Show top 5 + bottom 3 in compact mode, all in expanded mode
  const visibleStandings = expanded
    ? standings
    : standings.length > 10
      ? [...standings.slice(0, 5), ...standings.slice(-3)]
      : standings;
  const isCompact = !expanded && standings.length > 10;

  // Count promotion/relegation zones for legend
  const hasPromotion = standings.some((s) => s.zone === "promotion");
  const hasRelegation = standings.some((s) => s.zone === "relegation");

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <Trophy size={14} className="text-amber-400" aria-hidden="true" />
            League Table
          </span>
          {leagues.length > 1 && (
            <select
              value={activeLeagueId}
              onChange={(e) => setSelectedLeagueId(e.target.value)}
              className="rounded border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-500"
            >
              {leagues.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.shortName} (T{l.tier})
                </option>
              ))}
            </select>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Legend */}
        {(hasPromotion || hasRelegation) && (
          <div className="mb-2 flex gap-3 text-[10px]">
            {hasPromotion && (
              <span className="flex items-center gap-1 text-emerald-400">
                <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" aria-hidden="true" />
                Promotion
              </span>
            )}
            {hasRelegation && (
              <span className="flex items-center gap-1 text-red-400">
                <span className="inline-block h-2 w-2 rounded-sm bg-red-500" aria-hidden="true" />
                Relegation
              </span>
            )}
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded border border-zinc-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50 text-zinc-500">
                <th className="w-6 px-2 py-1.5 text-center">#</th>
                <th className="px-2 py-1.5 text-left">Club</th>
                <th className="w-8 px-1 py-1.5 text-center">P</th>
                <th className="w-8 px-1 py-1.5 text-center">W</th>
                <th className="w-8 px-1 py-1.5 text-center">D</th>
                <th className="w-8 px-1 py-1.5 text-center">L</th>
                <th className="w-10 px-1 py-1.5 text-center">GD</th>
                <th className="w-10 px-1 py-1.5 text-center font-semibold">Pts</th>
              </tr>
            </thead>
            <tbody>
              {visibleStandings.map((row, i) => {
                // Determine actual position: in compact mode the bottom 3 are offset
                const actualPosition =
                  isCompact && i >= 5
                    ? standings.length - 3 + (i - 5)
                    : standings.indexOf(row);

                return (
                  <tr
                    key={row.clubId}
                    className={`border-b border-zinc-800/50 last:border-b-0 ${zoneRowClass(row.zone)}`}
                  >
                    <td className={`px-2 py-1.5 text-center ${zoneTextClass(row.zone)}`}>
                      {actualPosition + 1}
                    </td>
                    <td className={`px-2 py-1.5 font-medium ${zoneTextClass(row.zone)}`}>
                      {row.clubName}
                    </td>
                    <td className="px-1 py-1.5 text-center text-zinc-500">{row.played}</td>
                    <td className="px-1 py-1.5 text-center text-zinc-400">{row.won}</td>
                    <td className="px-1 py-1.5 text-center text-zinc-500">{row.drawn}</td>
                    <td className="px-1 py-1.5 text-center text-zinc-500">{row.lost}</td>
                    <td className={`px-1 py-1.5 text-center ${row.goalDifference > 0 ? "text-emerald-400" : row.goalDifference < 0 ? "text-red-400" : "text-zinc-500"}`}>
                      {row.goalDifference > 0 ? "+" : ""}{row.goalDifference}
                    </td>
                    <td className="px-1 py-1.5 text-center font-bold text-white">{row.points}</td>
                  </tr>
                );
              })}
              {isCompact && (
                <tr className="border-b border-zinc-800/50">
                  <td colSpan={8} className="px-2 py-1 text-center text-zinc-600 text-[10px]">
                    ...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Expand/collapse toggle */}
        {standings.length > 10 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 flex w-full items-center justify-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition"
          >
            {expanded ? (
              <>
                <ChevronUp size={12} aria-hidden="true" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown size={12} aria-hidden="true" />
                Full table
              </>
            )}
          </button>
        )}

        {/* League info */}
        {selectedLeague && (
          <p className="mt-1.5 text-[10px] text-zinc-600">
            {selectedLeague.name} &middot; Tier {selectedLeague.tier} &middot; {selectedLeague.country}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
