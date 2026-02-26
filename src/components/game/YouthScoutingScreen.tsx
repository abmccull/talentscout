"use client";

import { useState, useMemo } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Users,
  Globe,
  MapPin,
  School,
  Trophy,
  Eye,
  Star,
  ClipboardList,
  Search,
  Sparkles,
  Filter,
  ChevronUp,
  ChevronDown,
  LayoutGrid,
  List,
} from "lucide-react";
import type { UnsignedYouth, SubRegion, Observation } from "@/engine/core/types";
import { getPerceivedAbility } from "@/engine/scout/perceivedAbility";
import { MiniStarRange } from "@/components/ui/MiniStarRange";

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = "unsigned" | "subRegions" | "venues";
type SortOption = "buzz" | "age" | "country" | "visibility" | "pipeline";
type PipelineStage = "discovered" | "observed" | "reported" | "placed";
type ViewMode = "card" | "list";

// ─── Venue data ──────────────────────────────────────────────────────────────

interface VenueInfo {
  name: string;
  slots: number;
  fatigue: number;
  description: string;
  requirement: string;
}

const VENUES: VenueInfo[] = [
  {
    name: "School Match",
    slots: 2,
    fatigue: 8,
    description:
      "Watch raw talent compete in school leagues. Reveals pace, physical attributes, and composure.",
    requirement: "No requirements",
  },
  {
    name: "Grassroots Tournament",
    slots: 3,
    fatigue: 12,
    description:
      "Multi-day events with diverse youth talent. Requires Youth spec level 1+.",
    requirement: "Youth specialization level 1+",
  },
  {
    name: "Street Football",
    slots: 2,
    fatigue: 6,
    description:
      "Unstructured play reveals pure technical ability. Requires sub-region familiarity 20+.",
    requirement: "Sub-region familiarity 20+",
  },
  {
    name: "Academy Trial Day",
    slots: 2,
    fatigue: 10,
    description:
      "Private academy sessions. Requires academy contact with 40+ relationship.",
    requirement: "Academy contact with 40+ relationship",
  },
  {
    name: "Youth Festival",
    slots: 3,
    fatigue: 14,
    description: "Major youth showcases. Requires career tier 2+.",
    requirement: "Career tier 2+",
  },
  {
    name: "Follow-Up Session",
    slots: 1,
    fatigue: 5,
    description:
      "Revisit a specific youth for deeper insight. Requires prior observation.",
    requirement: "Prior observation of the youth",
  },
  {
    name: "Parent / Coach Meeting",
    slots: 1,
    fatigue: 3,
    description:
      "Learn hidden details about a youth's character. Requires prior observation.",
    requirement: "Prior observation of the youth",
  },
  {
    name: "Write Placement Report",
    slots: 1,
    fatigue: 4,
    description: "Recommend a youth to a club. Requires observations.",
    requirement: "At least one observation of the youth",
  },
];

// ─── Table sort types ────────────────────────────────────────────────────────

type YouthSortKey = "name" | "position" | "age" | "nationality" | "value" | "ca" | "pa" | "buzz" | "visibility" | "pipeline";
type SortDir = "asc" | "desc";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatValue(n: number): string {
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `£${(n / 1_000).toFixed(0)}K`;
  return `£${n}`;
}

function familiarityColor(familiarity: number): string {
  if (familiarity > 50) return "bg-emerald-500";
  if (familiarity >= 20) return "bg-amber-500";
  return "bg-red-500";
}

function familiarityTextColor(familiarity: number): string {
  if (familiarity > 50) return "text-emerald-400";
  if (familiarity >= 20) return "text-amber-400";
  return "text-red-400";
}

function buzzColor(buzz: number): string {
  if (buzz >= 70) return "bg-emerald-500";
  if (buzz >= 40) return "bg-amber-500";
  return "bg-zinc-600";
}

function sortYouth(
  list: UnsignedYouth[],
  sort: SortOption,
  scoutId?: string,
  reportedIds?: Set<string>,
): UnsignedYouth[] {
  const copy = [...list];
  switch (sort) {
    case "buzz":
      return copy.sort((a, b) => b.buzzLevel - a.buzzLevel);
    case "age":
      return copy.sort((a, b) => a.player.age - b.player.age);
    case "country":
      return copy.sort((a, b) => a.country.localeCompare(b.country));
    case "visibility":
      return copy.sort((a, b) => b.visibility - a.visibility);
    case "pipeline": {
      const stageOrder = (y: UnsignedYouth): number => {
        if (y.placed) return 3;
        if (reportedIds?.has(y.id)) return 2;
        if (scoutId && y.discoveredBy.includes(scoutId)) return 1;
        return 0;
      };
      return copy.sort((a, b) => stageOrder(a) - stageOrder(b));
    }
  }
}

const SORT_LABELS: Record<SortOption, string> = {
  buzz: "By Buzz",
  age: "By Age",
  country: "By Country",
  visibility: "By Visibility",
  pipeline: "By Pipeline",
};

function getPipelineStage(
  youth: UnsignedYouth,
  scoutId: string,
  reportedIds: Set<string>,
  observationCountForPlayer: number,
): PipelineStage {
  if (youth.placed) return "placed";
  if (reportedIds.has(youth.id)) return "reported";
  if (youth.discoveredBy.includes(scoutId)) {
    // "Observed" = 2+ follow-up observation sessions; "Discovered" = spotted but not yet deeply watched
    return observationCountForPlayer >= 2 ? "observed" : "discovered";
  }
  // Regional/intel visibility: player is visible but scout hasn't personally discovered them yet
  return "discovered";
}

const PIPELINE_COLORS: Record<PipelineStage, string> = {
  discovered: "border-zinc-600 bg-zinc-800 text-zinc-400",
  observed: "border-emerald-500/50 bg-emerald-500/10 text-emerald-400",
  reported: "border-blue-500/50 bg-blue-500/10 text-blue-400",
  placed: "border-amber-500/50 bg-amber-500/10 text-amber-400",
};

const PIPELINE_LABELS: Record<PipelineStage, string> = {
  discovered: "Discovered",
  observed: "Observed",
  reported: "Reported",
  placed: "Placed",
};

// ─── Sub-components ──────────────────────────────────────────────────────────

interface YouthCardProps {
  youth: UnsignedYouth;
  scoutId: string;
  reportedIds: Set<string>;
  /** Number of observation sessions this scout has logged for this player. */
  observationCount: number;
  onClick: () => void;
}

function YouthCard({ youth, scoutId, reportedIds, observationCount, onClick }: YouthCardProps) {
  const isObserved = youth.discoveredBy.includes(scoutId);
  const stage = getPipelineStage(youth, scoutId, reportedIds, observationCount);
  const scoutCount = youth.discoveredBy.length;

  return (
    <button
      onClick={onClick}
      aria-label={`View profile for ${youth.player.firstName} ${youth.player.lastName}`}
      className="w-full rounded-lg border border-[#27272a] bg-[#141414] p-4 text-left transition hover:border-zinc-600"
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold text-white">
              {youth.player.firstName} {youth.player.lastName}
            </p>
            <Badge className={`shrink-0 text-[10px] ${PIPELINE_COLORS[stage]}`}>
              {PIPELINE_LABELS[stage]}
            </Badge>
            {isObserved && (youth.player.wonderkidTier === "generational" || youth.player.wonderkidTier === "worldClass") && (
              <Badge className={`shrink-0 text-[10px] ${
                youth.player.wonderkidTier === "generational"
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-400"
                  : "border-blue-500/50 bg-blue-500/10 text-blue-400"
              }`}>
                {youth.player.wonderkidTier === "generational" ? <Sparkles size={9} className="mr-1" /> : <Star size={9} className="mr-1" />}
                {youth.player.wonderkidTier === "generational" ? "Generational" : "World Class"}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">
            {youth.player.nationality} · Age {youth.player.age} ·{" "}
            {youth.player.position}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-zinc-500">Scouts</p>
          <p className="text-sm font-bold text-white">{scoutCount}</p>
        </div>
      </div>

      {/* Buzz level */}
      <div className="mb-2">
        <div className="mb-1 flex items-center justify-between text-[10px]">
          <span className="text-zinc-500">Buzz</span>
          <span className="text-zinc-400">{youth.buzzLevel}%</span>
        </div>
        <Progress
          value={youth.buzzLevel}
          className="h-1.5"
          indicatorClassName={buzzColor(youth.buzzLevel)}
        />
      </div>

      {/* Visibility */}
      <div>
        <div className="mb-1 flex items-center justify-between text-[10px]">
          <span className="text-zinc-500">Visibility</span>
          <span className="text-zinc-400">{youth.visibility}%</span>
        </div>
        <Progress
          value={youth.visibility}
          className="h-1.5"
          indicatorClassName="bg-blue-500"
        />
      </div>
    </button>
  );
}

interface VenueCardProps {
  venue: VenueInfo;
}

function VenueCard({ venue }: VenueCardProps) {
  return (
    <div className="rounded-lg border border-[#27272a] bg-[#141414] p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-white">{venue.name}</p>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            {venue.slots} slot{venue.slots !== 1 ? "s" : ""}
          </Badge>
          <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30">
            -{venue.fatigue} fatigue
          </Badge>
        </div>
      </div>
      <p className="text-sm text-zinc-400">{venue.description}</p>
      <p className="text-xs text-zinc-600">
        <span className="text-zinc-500">Requires: </span>
        {venue.requirement}
      </p>
    </div>
  );
}

// ─── Tab components ───────────────────────────────────────────────────────────

interface UnsignedYouthTabProps {
  youth: UnsignedYouth[];
  scoutId: string;
  sort: SortOption;
  setSort: (s: SortOption) => void;
  filterCountry: string;
  setFilterCountry: (c: string) => void;
  countries: string[];
  positions: string[];
  filterPosition: string;
  setFilterPosition: (p: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  observedOnly: boolean;
  setObservedOnly: (b: boolean) => void;
  reportedIds: Set<string>;
  onSelectYouth: (youthId: string) => void;
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;
  minAge: string;
  setMinAge: (v: string) => void;
  maxAge: string;
  setMaxAge: (v: string) => void;
  nationalities: string[];
  filterNationality: string;
  setFilterNationality: (n: string) => void;
  observations: Observation[];
}

function UnsignedYouthTab({
  youth,
  scoutId,
  sort,
  setSort,
  filterCountry,
  setFilterCountry,
  countries,
  positions,
  filterPosition,
  setFilterPosition,
  searchQuery,
  setSearchQuery,
  observedOnly,
  setObservedOnly,
  reportedIds,
  onSelectYouth,
  viewMode,
  setViewMode,
  minAge,
  setMinAge,
  maxAge,
  setMaxAge,
  nationalities,
  filterNationality,
  setFilterNationality,
  observations,
}: UnsignedYouthTabProps) {
  const [tableSortKey, setTableSortKey] = useState<YouthSortKey>("buzz");
  const [tableSortDir, setTableSortDir] = useState<SortDir>("desc");

  const handleTableSort = (key: YouthSortKey) => {
    if (tableSortKey === key) {
      setTableSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setTableSortKey(key);
      setTableSortDir("desc");
    }
  };

  const TableSortIcon = ({ col }: { col: YouthSortKey }) => {
    if (tableSortKey !== col) return <ChevronDown size={12} className="text-zinc-600" />;
    return tableSortDir === "asc" ? (
      <ChevronUp size={12} className="text-emerald-400" />
    ) : (
      <ChevronDown size={12} className="text-emerald-400" />
    );
  };

  let filtered = youth;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(
      (y) =>
        y.player.firstName.toLowerCase().includes(q) ||
        y.player.lastName.toLowerCase().includes(q),
    );
  }
  if (filterCountry) {
    filtered = filtered.filter((y) => y.country === filterCountry);
  }
  if (filterPosition) {
    filtered = filtered.filter((y) => y.player.position === filterPosition);
  }
  if (observedOnly) {
    filtered = filtered.filter((y) => y.discoveredBy.includes(scoutId));
  }
  if (minAge) {
    filtered = filtered.filter((y) => y.player.age >= Number(minAge));
  }
  if (maxAge) {
    filtered = filtered.filter((y) => y.player.age <= Number(maxAge));
  }
  if (filterNationality) {
    filtered = filtered.filter((y) => y.player.nationality === filterNationality);
  }
  // Build a count of observation sessions per player for pipeline stage logic
  const observationCountByPlayer = useMemo(() => {
    const map = new Map<string, number>();
    for (const obs of observations) {
      map.set(obs.playerId, (map.get(obs.playerId) ?? 0) + 1);
    }
    return map;
  }, [observations]);

  // Build perceived ability map for all filtered youth
  const perceivedMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof getPerceivedAbility>>();
    for (const y of filtered) {
      map.set(y.player.id, getPerceivedAbility(observations, y.player.id));
    }
    return map;
  }, [filtered, observations]);

  const sorted = sortYouth(filtered, sort, scoutId, reportedIds);

  // For list view, use table sort; for card view, use button sort
  const displayList = viewMode === "list"
    ? [...filtered].sort((a, b) => {
        let cmp = 0;
        switch (tableSortKey) {
          case "name": cmp = `${a.player.lastName}${a.player.firstName}`.localeCompare(`${b.player.lastName}${b.player.firstName}`); break;
          case "position": cmp = a.player.position.localeCompare(b.player.position); break;
          case "age": cmp = a.player.age - b.player.age; break;
          case "nationality": cmp = a.player.nationality.localeCompare(b.player.nationality); break;
          case "value": cmp = a.player.marketValue - b.player.marketValue; break;
          case "ca": cmp = (perceivedMap.get(a.player.id)?.ca ?? 0) - (perceivedMap.get(b.player.id)?.ca ?? 0); break;
          case "pa": cmp = (perceivedMap.get(a.player.id)?.paHigh ?? 0) - (perceivedMap.get(b.player.id)?.paHigh ?? 0); break;
          case "buzz": cmp = a.buzzLevel - b.buzzLevel; break;
          case "visibility": cmp = a.visibility - b.visibility; break;
          case "pipeline": {
            const stageOrder = (y: UnsignedYouth): number => {
              if (y.placed) return 3;
              if (reportedIds.has(y.id)) return 2;
              if (y.discoveredBy.includes(scoutId)) return 1;
              return 0;
            };
            cmp = stageOrder(a) - stageOrder(b);
            break;
          }
        }
        return tableSortDir === "asc" ? cmp : -cmp;
      })
    : sorted;

  return (
    <div>
      {/* Controls */}
      <div className="mb-4 rounded-lg border border-[#27272a] bg-[#141414] p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name..."
              aria-label="Search youth by name"
              className="w-full rounded-md border border-[#27272a] bg-[#0a0a0a] py-2 pl-8 pr-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Position filter */}
          <select
            value={filterPosition}
            onChange={(e) => setFilterPosition(e.target.value)}
            aria-label="Filter by position"
            className="rounded-md border border-[#27272a] bg-[#0a0a0a] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">All Positions</option>
            {positions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          {/* Age range */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500 shrink-0">Age</label>
            <input
              type="number"
              placeholder="Min"
              value={minAge}
              onChange={(e) => setMinAge(e.target.value)}
              min={13}
              max={21}
              aria-label="Minimum age"
              className="w-16 rounded-md border border-[#27272a] bg-[#0a0a0a] px-2 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <span className="text-zinc-600" aria-hidden="true">&ndash;</span>
            <input
              type="number"
              placeholder="Max"
              value={maxAge}
              onChange={(e) => setMaxAge(e.target.value)}
              min={13}
              max={21}
              aria-label="Maximum age"
              className="w-16 rounded-md border border-[#27272a] bg-[#0a0a0a] px-2 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Nationality filter */}
          {nationalities.length > 0 && (
            <select
              value={filterNationality}
              onChange={(e) => setFilterNationality(e.target.value)}
              aria-label="Filter by nationality"
              className="rounded-md border border-[#27272a] bg-[#0a0a0a] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">All Nationalities</option>
              {nationalities.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          )}

          {/* Country (region) filter */}
          {countries.length > 0 && (
            <select
              value={filterCountry}
              onChange={(e) => setFilterCountry(e.target.value)}
              aria-label="Filter by region"
              className="rounded-md border border-[#27272a] bg-[#0a0a0a] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">All Regions</option>
              {countries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}

          {/* Observed toggle */}
          <button
            onClick={() => setObservedOnly(!observedOnly)}
            aria-pressed={observedOnly}
            className={`rounded-md border px-3 py-2 text-sm transition cursor-pointer ${
              observedOnly
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-[#27272a] text-zinc-400 hover:bg-[#1a1a1a] hover:text-white"
            }`}
          >
            <Eye size={12} className="mr-1 inline" />
            My Pipeline
          </button>

          {/* View mode toggle */}
          <div className="ml-auto flex gap-1">
            <button
              onClick={() => setViewMode("card")}
              aria-pressed={viewMode === "card"}
              aria-label="Card view"
              className={`rounded-md border p-2 transition cursor-pointer ${
                viewMode === "card"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-[#27272a] text-zinc-400 hover:text-white"
              }`}
            >
              <LayoutGrid size={14} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              aria-pressed={viewMode === "list"}
              aria-label="List view"
              className={`rounded-md border p-2 transition cursor-pointer ${
                viewMode === "list"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-[#27272a] text-zinc-400 hover:text-white"
              }`}
            >
              <List size={14} />
            </button>
          </div>
        </div>

        {/* Sort buttons (card view only) */}
        {viewMode === "card" && (
          <div className="mt-3 flex gap-1 border-t border-[#27272a] pt-3">
            {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
              <button
                key={option}
                onClick={() => setSort(option)}
                aria-pressed={sort === option}
                className={`rounded-md border px-3 py-1.5 text-xs transition cursor-pointer ${
                  sort === option
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-[#27272a] text-zinc-400 hover:bg-[#1a1a1a] hover:text-white"
                }`}
              >
                {SORT_LABELS[option]}
              </button>
            ))}
          </div>
        )}
      </div>

      {displayList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users size={40} className="mb-4 text-zinc-700" aria-hidden="true" />
            <p className="text-sm text-zinc-500">No unsigned youth found.</p>
            <p className="mt-1 text-xs text-zinc-600">
              Scout youth venues to discover unsigned players in the world.
            </p>
          </CardContent>
        </Card>
      ) : viewMode === "list" ? (
        <div className="rounded-lg border border-[#27272a] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#27272a] bg-[#141414] text-left text-xs text-zinc-500">
                  {([
                    ["name", "Name"],
                    ["position", "Pos"],
                    ["age", "Age"],
                    ["nationality", "Nat"],
                    ["value", "Value"],
                    ["ca", "CA"],
                    ["pa", "PA"],
                    ["buzz", "Buzz"],
                    ["visibility", "Vis"],
                    ["pipeline", "Stage"],
                  ] as [YouthSortKey, string][]).map(([key, label]) => (
                    <th key={key} className="px-4 py-3 font-medium">
                      <button
                        onClick={() => handleTableSort(key)}
                        className="flex items-center gap-1 hover:text-white transition cursor-pointer"
                        aria-label={`Sort by ${label}`}
                      >
                        {label}
                        <TableSortIcon col={key} />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayList.map((y) => {
                  const stage = getPipelineStage(y, scoutId, reportedIds, observationCountByPlayer.get(y.player.id) ?? 0);
                  const isObserved = y.discoveredBy.includes(scoutId);
                  return (
                    <tr
                      key={y.id}
                      onClick={() => onSelectYouth(y.player.id)}
                      className="cursor-pointer border-b border-[#27272a] bg-[#0a0a0a] transition hover:bg-[#141414]"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelectYouth(y.player.id);
                        }
                      }}
                      role="button"
                      aria-label={`View profile for ${y.player.firstName} ${y.player.lastName}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">
                            {y.player.firstName} {y.player.lastName}
                          </span>
                          {isObserved && (y.player.wonderkidTier === "generational" || y.player.wonderkidTier === "worldClass") && (
                            <span className={`text-[10px] ${y.player.wonderkidTier === "generational" ? "text-amber-400" : "text-blue-400"}`}>
                              {y.player.wonderkidTier === "generational" ? "\u2605" : "\u2726"}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-[10px]">{y.player.position}</Badge>
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{y.player.age}</td>
                      <td className="px-4 py-3 text-zinc-400">{y.player.nationality}</td>
                      <td className="px-4 py-3 text-zinc-400">{formatValue(y.player.marketValue)}</td>
                      <td className="px-4 py-3">
                        <MiniStarRange perceived={perceivedMap.get(y.player.id) ?? null} mode="ca" />
                      </td>
                      <td className="px-4 py-3">
                        <MiniStarRange perceived={perceivedMap.get(y.player.id) ?? null} mode="pa" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-800">
                            <div
                              className={`h-full rounded-full ${y.buzzLevel >= 70 ? "bg-emerald-500" : y.buzzLevel >= 40 ? "bg-amber-500" : "bg-zinc-600"}`}
                              style={{ width: `${y.buzzLevel}%` }}
                            />
                          </div>
                          <span className="text-xs text-zinc-400">{y.buzzLevel}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-800">
                            <div className="h-full rounded-full bg-blue-500" style={{ width: `${y.visibility}%` }} />
                          </div>
                          <span className="text-xs text-zinc-400">{y.visibility}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={`text-[10px] ${PIPELINE_COLORS[stage]}`}>
                          {PIPELINE_LABELS[stage]}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" data-tutorial-id="youth-pipeline-list">
          {displayList.map((y) => (
            <YouthCard
              key={y.id}
              youth={y}
              scoutId={scoutId}
              reportedIds={reportedIds}
              observationCount={observationCountByPlayer.get(y.player.id) ?? 0}
              onClick={() => onSelectYouth(y.player.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface SubRegionsTabProps {
  subRegions: SubRegion[];
}

function SubRegionsTab({ subRegions }: SubRegionsTabProps) {
  // Group by country
  const grouped = useMemo(() => {
    const map: Record<string, SubRegion[]> = {};
    for (const sr of subRegions) {
      if (!map[sr.country]) map[sr.country] = [];
      map[sr.country].push(sr);
    }
    return map;
  }, [subRegions]);

  const countries = Object.keys(grouped).sort();

  if (subRegions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Globe size={40} className="mb-4 text-zinc-700" aria-hidden="true" />
          <p className="text-sm text-zinc-500">No sub-regions available.</p>
          <p className="mt-1 text-xs text-zinc-600">
            Sub-regions are unlocked as you scout different areas.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {countries.map((country) => (
        <div key={country}>
          <div className="mb-3 flex items-center gap-2">
            <Globe size={14} className="text-zinc-500" aria-hidden="true" />
            <h3 className="text-sm font-semibold capitalize text-zinc-300">
              {country}
            </h3>
            <Badge variant="secondary" className="text-[10px]">
              {grouped[country].length}
            </Badge>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {grouped[country].map((sr) => (
              <div
                key={sr.id}
                className="rounded-lg border border-[#27272a] bg-[#141414] p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <MapPin size={12} className="shrink-0 text-zinc-500" aria-hidden="true" />
                    <p className="truncate text-sm font-medium text-white">
                      {sr.name}
                    </p>
                  </div>
                  <span
                    className={`text-xs font-semibold ${familiarityTextColor(sr.familiarity)}`}
                  >
                    {sr.familiarity}%
                  </span>
                </div>
                <div className="mb-1 text-[10px] text-zinc-500">
                  Familiarity
                </div>
                <Progress
                  value={sr.familiarity}
                  className="h-1.5"
                  indicatorClassName={familiarityColor(sr.familiarity)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function VenuesTab() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {VENUES.map((venue) => (
        <VenueCard key={venue.name} venue={venue} />
      ))}
    </div>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export function YouthScoutingScreen() {
  const { gameState, selectPlayer, setScreen } = useGameStore();
  const [activeTab, setActiveTab] = useState<Tab>("unsigned");
  const [sort, setSort] = useState<SortOption>("buzz");
  const [filterCountry, setFilterCountry] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPosition, setFilterPosition] = useState("");
  const [observedOnly, setObservedOnly] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("card");
  const [minAge, setMinAge] = useState("");
  const [maxAge, setMaxAge] = useState("");
  const [filterNationality, setFilterNationality] = useState("");

  if (!gameState) return null;

  const { unsignedYouth, subRegions, legacyScore, scout } = gameState;

  const allYouthList = Object.values(unsignedYouth);
  const subRegionList = Object.values(subRegions);

  // Build sets for fast lookup
  const observedPlayerIds = new Set(
    Object.values(gameState.observations).map((o) => o.playerId),
  );
  const scoutHomeCountry = scout.nationality?.toLowerCase() ?? "";

  // Visibility filter: only show youth the scout has knowledge of
  const youthList = allYouthList.filter((y) => {
    // 1. Scout personally discovered this player
    if (y.discoveredBy.includes(scout.id)) return true;
    // 2. Scout has logged at least one observation session for this player
    if (observedPlayerIds.has(y.player.id)) return true;
    // 3. Scout has received contact intel about this player
    if (
      gameState.contactIntel[y.player.id] &&
      gameState.contactIntel[y.player.id].length > 0
    )
      return true;
    // 4. Regional exception: same country as scout's home country + sufficient word-of-mouth
    if (y.country === scoutHomeCountry && y.visibility >= 30) return true;
    return false;
  });

  // Summary stats
  const totalYouth = youthList.length;
  const discoveredByScout = youthList.filter((y) =>
    y.discoveredBy.includes(scout.id),
  ).length;
  const placedCount = youthList.filter((y) => y.placed).length;
  const countries = [...new Set(youthList.map((y) => y.country))].sort();
  const positions = [...new Set(youthList.map((y) => y.player.position))].sort();
  const nationalities = [...new Set(youthList.map((y) => y.player.nationality))].sort();
  const reportedIds = new Set(
    Object.values(gameState.placementReports ?? {})
      .filter((r) => r.scoutId === scout.id)
      .map((r) => r.unsignedYouthId),
  );
  const reportedCount = reportedIds.size;

  const handleSelectYouth = (playerId: string) => {
    selectPlayer(playerId);
    setScreen("playerProfile");
  };

  const TAB_CONFIG: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "unsigned", label: "Unsigned Youth", icon: Users },
    { id: "subRegions", label: "Sub-Regions", icon: Globe },
    { id: "venues", label: "Venues", icon: School },
  ];

  return (
    <GameLayout>
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Youth Scouting</h1>
          <p className="text-sm text-zinc-400">
            Discover and develop unsigned youth talent
          </p>
        </div>

        {/* Summary stats */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500">Known</p>
                  <p className="text-2xl font-bold text-white">{totalYouth}</p>
                </div>
                <Users size={20} className="text-zinc-600" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500">Discovered</p>
                  <p className="text-2xl font-bold text-emerald-400">
                    {discoveredByScout}
                  </p>
                </div>
                <Eye size={20} className="text-emerald-600" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500">Reported</p>
                  <p className="text-2xl font-bold text-blue-400">
                    {reportedCount}
                  </p>
                </div>
                <ClipboardList size={20} className="text-blue-600" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500">Placed</p>
                  <p className="text-2xl font-bold text-amber-400">
                    {placedCount}
                  </p>
                </div>
                <ClipboardList size={20} className="text-amber-600" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
          <Card data-tutorial-id="youth-legacy-score">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500">Legacy Score</p>
                  <p className="text-2xl font-bold text-amber-400">
                    {legacyScore.totalScore}
                  </p>
                </div>
                <Star size={20} className="text-amber-600" aria-hidden="true" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 border-b border-[#27272a] pb-0">
          {TAB_CONFIG.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              aria-selected={activeTab === id}
              role="tab"
              className={`flex cursor-pointer items-center gap-2 rounded-t-md px-4 py-2.5 text-sm font-medium transition ${
                activeTab === id
                  ? "border-b-2 border-emerald-500 text-emerald-400"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Icon size={14} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div role="tabpanel">
          {activeTab === "unsigned" && (
            <UnsignedYouthTab
              youth={youthList}
              scoutId={scout.id}
              sort={sort}
              setSort={setSort}
              filterCountry={filterCountry}
              setFilterCountry={setFilterCountry}
              countries={countries}
              positions={positions}
              filterPosition={filterPosition}
              setFilterPosition={setFilterPosition}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              observedOnly={observedOnly}
              setObservedOnly={setObservedOnly}
              reportedIds={reportedIds}
              onSelectYouth={handleSelectYouth}
              viewMode={viewMode}
              setViewMode={setViewMode}
              minAge={minAge}
              setMinAge={setMinAge}
              maxAge={maxAge}
              setMaxAge={setMaxAge}
              nationalities={nationalities}
              filterNationality={filterNationality}
              setFilterNationality={setFilterNationality}
              observations={Object.values(gameState.observations)}
            />
          )}
          {activeTab === "subRegions" && (
            <SubRegionsTab subRegions={subRegionList} />
          )}
          {activeTab === "venues" && <VenuesTab />}
        </div>
      </div>
    </GameLayout>
  );
}
