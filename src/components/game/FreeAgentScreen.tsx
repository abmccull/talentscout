"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGameStore } from "@/stores/gameStore";
import type { FreeAgent, Position } from "@/engine/core/types";
import { getFamiliarityVisibility } from "@/engine/freeAgents/discovery";
import {
  Users,
  Search,
  ChevronUp,
  ChevronDown,
  Star,
  ArrowLeft,
  AlertTriangle,
  Clock,
  MapPin,
} from "lucide-react";

// =============================================================================
// TYPES
// =============================================================================

type SortKey = "name" | "age" | "position" | "ca" | "wage" | "weeksInPool";
type SortDir = "asc" | "desc";

// =============================================================================
// HELPERS
// =============================================================================

function getVisibilityBadge(
  familiarity: number,
): { label: string; color: string } | null {
  const vis = getFamiliarityVisibility(familiarity);
  switch (vis) {
    case "expert": return { label: "Expert Intel", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" };
    case "good": return { label: "Good Intel", color: "text-blue-400 border-blue-500/30 bg-blue-500/10" };
    case "standard": return { label: "Standard", color: "text-zinc-400 border-zinc-500/30 bg-zinc-500/10" };
    case "basic": return { label: "Limited Intel", color: "text-amber-400 border-amber-500/30 bg-amber-500/10" };
    default: return null;
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export function FreeAgentScreen() {
  const gameState = useGameStore((s) => s.gameState);
  const setScreen = useGameStore((s) => s.setScreen);
  const selectPlayer = useGameStore((s) => s.selectPlayer);

  const [search, setSearch] = useState("");
  const [positionFilter, setPositionFilter] = useState<Position | "">("");
  const [sortKey, setSortKey] = useState<SortKey>("ca");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [discoveredOnly, setDiscoveredOnly] = useState(false);

  if (!gameState) return null;

  const pool = gameState.freeAgentPool;
  const scout = gameState.scout;
  const players = gameState.players;

  // Build list of visible free agents
  const visibleAgents = useMemo(() => {
    return pool.agents.filter((agent) => {
      if (agent.status !== "available") return false;

      // Check visibility: discovered or familiarity-based
      if (agent.discoveredByScout) return true;

      const countryRep = scout.countryReputations?.[agent.country];
      const familiarity = countryRep?.familiarity ?? 0;
      return familiarity >= 20; // Basic visibility threshold
    });
  }, [pool.agents, scout.countryReputations]);

  // Apply filters
  const filtered = useMemo(() => {
    let result = visibleAgents;

    if (discoveredOnly) {
      result = result.filter((a) => a.discoveredByScout);
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((agent) => {
        const player = players[agent.playerId];
        if (!player) return false;
        const name = `${player.firstName} ${player.lastName}`.toLowerCase();
        return name.includes(q);
      });
    }

    if (positionFilter) {
      result = result.filter((agent) => {
        const player = players[agent.playerId];
        return player?.position === positionFilter;
      });
    }

    // Sort
    result = [...result].sort((a, b) => {
      const pa = players[a.playerId];
      const pb = players[b.playerId];
      if (!pa || !pb) return 0;

      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = `${pa.lastName}`.localeCompare(`${pb.lastName}`);
          break;
        case "age":
          cmp = pa.age - pb.age;
          break;
        case "position":
          cmp = pa.position.localeCompare(pb.position);
          break;
        case "ca":
          cmp = pa.currentAbility - pb.currentAbility;
          break;
        case "wage":
          cmp = a.wageExpectation - b.wageExpectation;
          break;
        case "weeksInPool":
          cmp = a.weeksInPool - b.weeksInPool;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [visibleAgents, search, positionFilter, sortKey, sortDir, discoveredOnly, players]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? (
      <ChevronUp size={12} aria-hidden="true" />
    ) : (
      <ChevronDown size={12} aria-hidden="true" />
    );
  };

  const totalAvailable = pool.agents.filter((a) => a.status === "available").length;
  const discoveredCount = visibleAgents.filter((a) => a.discoveredByScout).length;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setScreen("dashboard")}>
            <ArrowLeft size={14} />
          </Button>
          <h1 className="text-lg font-bold">Free Agents</h1>
          <Badge variant="outline" className="text-zinc-400">
            {filtered.length} visible / {totalAvailable} global
          </Badge>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-zinc-500">Discovered</p>
            <p className="text-2xl font-bold text-emerald-400">{discoveredCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-zinc-500">Visible</p>
            <p className="text-2xl font-bold text-blue-400">{visibleAgents.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-zinc-500">Released This Season</p>
            <p className="text-2xl font-bold text-amber-400">{pool.totalReleasedThisSeason}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-zinc-500">Signed by Clubs</p>
            <p className="text-2xl font-bold text-zinc-400">{pool.totalSignedThisSeason}</p>
          </CardContent>
        </Card>
      </div>

      {/* NPC Competition Alert */}
      {pool.agents.some((a) => a.discoveredByScout && a.npcInterest.length > 0 && a.status === "available") && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
          <AlertTriangle size={14} className="shrink-0" aria-hidden="true" />
          Some discovered free agents have interest from other clubs — act quickly
        </div>
      )}

      {/* Filters */}
      <div className="rounded-lg border border-[#27272a] bg-[#141414] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search free agents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-[#27272a] bg-[#0a0a0a] py-2 pl-9 pr-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <select
            value={positionFilter}
            onChange={(e) => setPositionFilter(e.target.value as Position | "")}
            className="rounded-md border border-[#27272a] bg-[#0a0a0a] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">All Positions</option>
            <option value="GK">GK</option>
            <option value="CB">CB</option>
            <option value="LB">LB</option>
            <option value="RB">RB</option>
            <option value="DM">DM</option>
            <option value="CM">CM</option>
            <option value="AM">AM</option>
            <option value="LW">LW</option>
            <option value="RW">RW</option>
            <option value="ST">ST</option>
          </select>

          <Button
            variant={discoveredOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setDiscoveredOnly(!discoveredOnly)}
          >
            <Star size={12} className={`mr-1 ${discoveredOnly ? "fill-amber-400 text-amber-400" : ""}`} />
            Discovered Only
          </Button>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Users size={32} className="mb-3 text-zinc-700" />
          <p className="text-sm text-zinc-500">
            {visibleAgents.length === 0
              ? "No free agents visible yet. Build familiarity with more countries or develop your contact network."
              : "No free agents match your filters."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[#27272a]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#27272a] bg-[#0a0a0a] text-left text-zinc-500">
                {([
                  ["name", "Player"],
                  ["position", "Pos"],
                  ["age", "Age"],
                  ["ca", "Quality"],
                  ["wage", "Wage Exp."],
                  ["weeksInPool", "Weeks Free"],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <th key={key} className="px-4 py-3 font-medium">
                    <button
                      onClick={() => handleSort(key)}
                      className="flex items-center gap-1 hover:text-white transition"
                    >
                      {label}
                      <SortIcon col={key} />
                    </button>
                  </th>
                ))}
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Intel</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((agent) => (
                <FreeAgentRow
                  key={agent.playerId}
                  agent={agent}
                  player={players[agent.playerId]}
                  scout={scout}
                  clubs={gameState.clubs}
                  onClick={() => {
                    selectPlayer(agent.playerId);
                    setScreen("playerProfile");
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function FreeAgentRow({
  agent,
  player,
  scout,
  clubs,
  onClick,
}: {
  agent: FreeAgent;
  player: ReturnType<typeof useGameStore.getState>["gameState"] extends infer S
    ? S extends { players: Record<string, infer P> } ? P : never : never;
  scout: ReturnType<typeof useGameStore.getState>["gameState"] extends infer S
    ? S extends { scout: infer SC } ? SC : never : never;
  clubs: Record<string, { name: string }>;
  onClick: () => void;
}) {
  if (!player) return null;

  const countryRep = scout.countryReputations?.[agent.country];
  const familiarity = countryRep?.familiarity ?? 0;
  const visBadge = getVisibilityBadge(familiarity);
  const formerClub = clubs[agent.releasedFrom];

  const hasNPCInterest = agent.npcInterest.length > 0;

  // Basic vs detailed visibility
  const showDetails = agent.discoveredByScout || familiarity >= 40;

  return (
    <tr
      className="cursor-pointer border-b border-[#27272a] transition hover:bg-zinc-900"
      onClick={onClick}
    >
      <td className="px-4 py-3">
        <div>
          <p className="font-medium text-white">
            {familiarity >= 20 || agent.discoveredByScout
              ? `${player.firstName} ${player.lastName}`
              : "Unknown Player"}
          </p>
          <p className="text-xs text-zinc-500">
            {formerClub ? `ex-${formerClub.name}` : ""}
            {agent.country ? ` · ${agent.country}` : ""}
          </p>
        </div>
      </td>
      <td className="px-4 py-3">
        <Badge variant="outline" className="text-xs">
          {player.position}
        </Badge>
      </td>
      <td className="px-4 py-3 text-zinc-400">{player.age}</td>
      <td className="px-4 py-3">
        {showDetails ? (
          <QualityBar ca={player.currentAbility} />
        ) : (
          <span className="text-xs text-zinc-600">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-zinc-400">
        {showDetails ? `${agent.wageExpectation}/wk` : "—"}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 text-zinc-400">
          <Clock size={12} aria-hidden="true" />
          {agent.weeksInPool}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          {agent.discoveredByScout && (
            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs">
              Discovered
            </Badge>
          )}
          {hasNPCInterest && (
            <Badge className="bg-red-500/10 text-red-400 border-red-500/30 text-xs">
              {agent.npcInterest.length} club{agent.npcInterest.length > 1 ? "s" : ""} interested
            </Badge>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        {visBadge && (
          <Badge className={`${visBadge.color} text-xs`}>
            {visBadge.label}
          </Badge>
        )}
      </td>
    </tr>
  );
}

function QualityBar({ ca }: { ca: number }) {
  const pct = Math.min(100, (ca / 200) * 100);
  const color =
    ca >= 75 ? "bg-emerald-500" :
    ca >= 60 ? "bg-blue-500" :
    ca >= 45 ? "bg-amber-500" :
    "bg-zinc-500";

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-16 overflow-hidden rounded-full bg-zinc-800">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-zinc-400">{ca}</span>
    </div>
  );
}
