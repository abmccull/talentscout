"use client";

import { useState, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { YouthPortrait } from "@/components/game/YouthPortrait";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Users,
  Globe,
  MapPin,
  School,
  Trophy,
  Search,
  Filter,
  ChevronUp,
  ChevronDown,
  LayoutGrid,
  List,
  CalendarPlus,
  ArrowRight,
} from "lucide-react";
import type { UnsignedYouth, SubRegion, Observation, TournamentEvent } from "@/engine/core/types";
import { getPerceivedAbility, type PerceivedAbility } from "@/engine/scout/perceivedAbility";
import { confidenceLabel } from "./player-profile/playerProfileFormatting";
import { listYouthCases, type YouthCaseListItem } from "@/engine/youth/youthCaseList";
import { getScoutHomeCountry } from "@/engine/world/travel";
import { getCountryDisplayName } from "@/lib/country";
import { IS_YOUTH_EARLY_ACCESS } from "@/lib/demo";


// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = "unsigned" | "subRegions" | "venues" | "tournaments";
type SortOption = "buzz" | "age" | "country" | "visibility" | "pipeline" | "ca" | "pa";
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
      "Named local/regional tournament events. Discovered via contacts and regional knowledge.",
    requirement: "Discovered tournament active this week + Youth spec level 1+",
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
    description: "National and international tournament events with large talent pools.",
    requirement: "Discovered national/international tournament active this week + Career tier 2+",
  },
  {
    name: "Agency Showcase",
    slots: 3,
    fatigue: 16,
    description: "Your agency's exclusive youth showcase. Large, high-quality pool.",
    requirement: "Professional/HQ office, 3+ employees, costs £3,000",
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

type YouthSortKey = "name" | "position" | "age" | "nationality" | "ca" | "pa" | "buzz" | "visibility" | "pipeline";

const YOUTH_TABLE_COLUMNS: [YouthSortKey, string][] = [["name", "Prospect"], ["position", "Position"], ["age", "Age"], ["nationality", "Nationality"], ["ca", "Current read"], ["pa", "Upside read"], ["buzz", "Buzz"], ["visibility", "Visibility"], ["pipeline", "Stage"]];
type SortDir = "asc" | "desc";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function getPerceivedSortValue(
  perceived: PerceivedAbility | null | undefined,
  mode: "ca" | "pa",
): number {
  if (!perceived) return -1;
  if (mode === "ca") return (perceived.caLow + perceived.caHigh) / 2;
  return (perceived.paLow + perceived.paHigh) / 2;
}

function getObservationBadge(observationCount: number): {
  label: string;
  className: string;
} | null {
  if (observationCount >= 3) {
    return {
      label: `${observationCount} looks`,
      className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    };
  }
  if (observationCount >= 1) {
    return {
      label: `${observationCount} look${observationCount === 1 ? "" : "s"}`,
      className: "border-blue-500/30 bg-blue-500/10 text-blue-300",
    };
  }
  return null;
}

function sortYouth(
  list: UnsignedYouth[],
  sort: SortOption,
  perceivedMap: Map<string, PerceivedAbility | null>,
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
    case "ca":
      return copy.sort(
        (a, b) =>
          getPerceivedSortValue(perceivedMap.get(b.player.id), "ca") -
          getPerceivedSortValue(perceivedMap.get(a.player.id), "ca"),
      );
    case "pa":
      return copy.sort(
        (a, b) =>
          getPerceivedSortValue(perceivedMap.get(b.player.id), "pa") -
          getPerceivedSortValue(perceivedMap.get(a.player.id), "pa"),
      );
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
  ca: "By Current Read",
  pa: "By Upside Read",
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
  discovered: "border-[var(--border)] bg-transparent text-zinc-300",
  observed: "border-[var(--border)] bg-transparent text-[var(--primary)]",
  reported: "border-[var(--border)] bg-transparent text-zinc-200",
  placed: "border-[var(--border)] bg-transparent text-[var(--signal-moment)]",
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
  perceived: PerceivedAbility | null;
  scoutId: string;
  reportedIds: Set<string>;
  /** Number of observation sessions this scout has logged for this player. */
  observationCount: number;
  caseItem?: YouthCaseListItem;
  onClick: () => void;
}

function YouthCard({ youth, perceived, scoutId, reportedIds, observationCount, caseItem, onClick }: YouthCardProps) {
  const stage = getPipelineStage(youth, scoutId, reportedIds, observationCount);
  const name = `${youth.player.firstName} ${youth.player.lastName}`;
  const currentConfidence = perceived ? confidenceLabel(perceived.caConfidence) : undefined;
  const lastLook = caseItem?.lastLookLabel;
  return (
    <button type="button" onClick={onClick} aria-label={`View profile for ${name}`}
      className="group w-full border-b border-[var(--border)] py-5 text-left outline-none transition-colors hover:bg-white/[0.025] focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--background)] motion-reduce:transition-none sm:py-6">
      <div className="flex items-start gap-4">
        <YouthPortrait playerId={youth.player.id} nationality={youth.player.nationality} age={youth.player.age} size={96} className="shrink-0" alt={name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-editorial text-2xl leading-tight text-[var(--foreground)]">{name}</p>
              <p className="mt-2 text-sm text-zinc-300">{youth.player.position} · {youth.player.age} · {youth.player.nationality}</p>
            </div>
            <ArrowRight size={17} className="mt-1 shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
          </div>
          <p className="mt-3 text-xs text-zinc-400"><span className="font-medium text-[var(--primary)]">{PIPELINE_LABELS[stage]}</span> · {observationCount} {observationCount === 1 ? "look" : "looks"}{lastLook && lastLook !== "No look yet" ? ` · Last ${lastLook.toLowerCase()}` : ""}</p>
        </div>
      </div>
      <div className="mt-4">
        {caseItem ? <>
          <p className="dossier-eyebrow text-zinc-400">{caseItem.questionLabel}</p>
          <p className="mt-1.5 text-sm leading-6 text-zinc-200">{caseItem.openQuestion}</p>
          <p className="mt-2 text-sm leading-6 text-zinc-400"><span className="font-medium text-zinc-300">Next look: </span>{caseItem.nextTest}</p>
        </> : <p className="text-sm leading-6 text-zinc-300">{observationCount ? "Open the dossier to review the evidence and choose the next test." : "A known name. A first-hand observation is still needed."}</p>}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.06] pt-3 text-xs text-zinc-400">
        {perceived ? <>
          <span><span className="text-zinc-300">Current read </span>{perceived.caLow.toFixed(1)}–{perceived.caHigh.toFixed(1)} / 5 · {currentConfidence?.toLowerCase()} confidence</span>
          <span><span className="text-zinc-300">Upside </span>{perceived.paLow.toFixed(1)}–{perceived.paHigh.toFixed(1)} / 5 · {confidenceLabel(perceived.paConfidence).toLowerCase()} confidence</span>
        </> : <span className="text-zinc-300">Ability read still unknown</span>}
        {caseItem && caseItem.rivalHeat !== "quiet" && <span className="font-medium text-[var(--signal-moment)]">{caseItem.rivalHeatLabel}</span>}
      </div>
      <p className="mt-2 text-xs leading-5 text-zinc-400">{youth.discoveredBy.length} {youth.discoveredBy.length === 1 ? "scout has" : "scouts have"} found the name · Buzz {youth.buzzLevel}% · Visibility {youth.visibility}%</p>
    </button>
  );
}

function ProspectEstimate({ perceived, mode }: { perceived: PerceivedAbility | null; mode: "ca" | "pa" }) {
  if (!perceived) return <span className="text-xs text-zinc-400">Still unknown</span>;
  const low = mode === "ca" ? perceived.caLow : perceived.paLow;
  const high = mode === "ca" ? perceived.caHigh : perceived.paHigh;
  const confidence = mode === "ca" ? perceived.caConfidence : perceived.paConfidence;
  return <span className="text-sm text-zinc-200">{low.toFixed(1)}–{high.toFixed(1)} / 5<span className="mt-1 block text-xs text-zinc-400">{confidenceLabel(confidence)} confidence</span></span>;
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
  onPlanDiscovery: () => void;
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
  caseByPlayerId?: Map<string, YouthCaseListItem>;
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
  onPlanDiscovery,
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
  caseByPlayerId,
}: UnsignedYouthTabProps) {
  const [tableSortKey, setTableSortKey] = useState<YouthSortKey>("buzz");
  const [tableSortDir, setTableSortDir] = useState<SortDir>("desc");
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const handleTableSort = (key: YouthSortKey) => {
    if (tableSortKey === key) {
      setTableSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setTableSortKey(key);
      setTableSortDir("desc");
    }
  };

  const TableSortIcon = ({ col }: { col: YouthSortKey }) => {
    if (tableSortKey !== col) return <ChevronDown size={12} className="text-zinc-400" />;
    return tableSortDir === "asc" ? (
      <ChevronUp size={12} className="text-emerald-400" />
    ) : (
      <ChevronDown size={12} className="text-emerald-400" />
    );
  };

  let filtered = youth;
  if (searchQuery) {
    const q = searchQuery.trim().toLowerCase();
    filtered = filtered.filter(
      (y) =>
        `${y.player.firstName} ${y.player.lastName}`.toLowerCase().includes(q),
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
    const map = new Map<string, PerceivedAbility | null>();
    for (const y of filtered) {
      map.set(y.player.id, getPerceivedAbility(observations, y.player.id));
    }
    return map;
  }, [filtered, observations]);

  const sorted = sortYouth(filtered, sort, perceivedMap, scoutId, reportedIds);

  // For list view, use table sort; for card view, use button sort
  const displayList = viewMode === "list"
    ? [...filtered].sort((a, b) => {
        let cmp = 0;
        switch (tableSortKey) {
          case "name": cmp = `${a.player.lastName}${a.player.firstName}`.localeCompare(`${b.player.lastName}${b.player.firstName}`); break;
          case "position": cmp = a.player.position.localeCompare(b.player.position); break;
          case "age": cmp = a.player.age - b.player.age; break;
          case "nationality": cmp = a.player.nationality.localeCompare(b.player.nationality); break;
          case "ca": {
            const aP = perceivedMap.get(a.player.id);
            const bP = perceivedMap.get(b.player.id);
            cmp = getPerceivedSortValue(aP, "ca") - getPerceivedSortValue(bP, "ca");
            break;
          }
          case "pa": {
            const aP = perceivedMap.get(a.player.id);
            const bP = perceivedMap.get(b.player.id);
            cmp = getPerceivedSortValue(aP, "pa") - getPerceivedSortValue(bP, "pa");
            break;
          }
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
  const activeFilterCount = [
    filterPosition,
    minAge,
    maxAge,
    filterNationality,
    filterCountry,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setSearchQuery("");
    setFilterCountry("");
    setFilterPosition("");
    setFilterNationality("");
    setMinAge("");
    setMaxAge("");
  };

  return (
    <div>
      <div className="mb-2" hidden={youth.length === 0}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:flex-wrap sm:items-center">
          <div className="relative min-w-0 sm:min-w-64 sm:flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
            <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Find a prospect" aria-label="Search youth by name" className="min-h-11 w-full rounded-sm border border-[var(--border)] bg-[var(--surface)] py-2 pl-10 pr-3 text-sm text-[var(--foreground)] placeholder:text-zinc-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]" />
          </div>
          <button type="button" onClick={() => setShowMobileFilters((open) => !open)} aria-expanded={showMobileFilters} aria-controls="youth-advanced-filters" className="flex min-h-11 items-center gap-2 rounded-sm border border-[var(--border)] px-3 text-sm text-zinc-300 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"><Filter size={15} aria-hidden="true" />Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}</button>
          <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-2 sm:ml-auto">
            <button type="button" onClick={() => setObservedOnly(!observedOnly)} aria-pressed={observedOnly} aria-label="My Pipeline" className={`min-h-11 shrink-0 rounded-sm px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${observedOnly ? "bg-[var(--primary)]/15 text-[var(--primary)]" : "text-zinc-300 hover:bg-white/5"}`}>{observedOnly ? "My cases" : "All known names"}</button>
            <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 sm:flex-none"><span className="sr-only">Sort prospects</span>
              {viewMode === "card" ? <select value={sort} onChange={(event) => setSort(event.target.value as SortOption)} aria-label="Sort prospects" className="min-h-11 w-full min-w-0 rounded-sm border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]">{(Object.keys(SORT_LABELS) as SortOption[]).map((option) => <option key={option} value={option}>{SORT_LABELS[option]}</option>)}</select>
                : <select value={tableSortKey} onChange={(event) => handleTableSort(event.target.value as YouthSortKey)} aria-label="Sort prospects" className="min-h-11 w-full min-w-0 rounded-sm border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]">{YOUTH_TABLE_COLUMNS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>}
            </label>
            {viewMode === "list" && <button type="button" onClick={() => setTableSortDir((direction) => direction === "asc" ? "desc" : "asc")} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-zinc-300 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]" aria-label={`Sort ${tableSortDir === "asc" ? "ascending" : "descending"}; reverse order`}>{tableSortDir === "asc" ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}</button>}
            <div className="flex shrink-0" role="group" aria-label="Prospect view">
              <button type="button" onClick={() => setViewMode("card")} aria-pressed={viewMode === "card"} aria-label="Card view" className={`flex h-11 w-11 items-center justify-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${viewMode === "card" ? "bg-[var(--primary)]/15 text-[var(--primary)]" : "text-zinc-400 hover:bg-white/5"}`}><LayoutGrid size={16} aria-hidden="true" /></button>
              <button type="button" onClick={() => setViewMode("list")} aria-pressed={viewMode === "list"} aria-label="List view" className={`flex h-11 w-11 items-center justify-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${viewMode === "list" ? "bg-[var(--primary)]/15 text-[var(--primary)]" : "text-zinc-400 hover:bg-white/5"}`}><List size={16} aria-hidden="true" /></button>
            </div>
          </div>
        </div>
        <div id="youth-advanced-filters" hidden={!showMobileFilters} className="mt-3 border-y border-[var(--border)] py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1.5 text-xs text-zinc-400"><span>Position</span><select value={filterPosition} onChange={(event) => setFilterPosition(event.target.value)} aria-label="Filter by position" className="min-h-11 w-full rounded-sm border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"><option value="">All Positions</option>{positions.map((position) => <option key={position} value={position}>{position}</option>)}</select></label>
            <fieldset><legend className="mb-1.5 text-xs text-zinc-400">Age range</legend><div className="flex items-center gap-2"><input type="number" min={13} max={21} value={minAge} onChange={(event) => setMinAge(event.target.value)} placeholder="Min" aria-label="Minimum age" className="min-h-11 w-full min-w-0 rounded-sm border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]" /><span className="text-zinc-400" aria-hidden="true">–</span><input type="number" min={13} max={21} value={maxAge} onChange={(event) => setMaxAge(event.target.value)} placeholder="Max" aria-label="Maximum age" className="min-h-11 w-full min-w-0 rounded-sm border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]" /></div></fieldset>
            {nationalities.length > 0 && <label className="space-y-1.5 text-xs text-zinc-400"><span>Nationality</span><select value={filterNationality} onChange={(event) => setFilterNationality(event.target.value)} aria-label="Filter by nationality" className="min-h-11 w-full rounded-sm border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"><option value="">All Nationalities</option>{nationalities.map((nationality) => <option key={nationality} value={nationality}>{nationality}</option>)}</select></label>}
            {countries.length > 0 && <label className="space-y-1.5 text-xs text-zinc-400"><span>Region</span><select value={filterCountry} onChange={(event) => setFilterCountry(event.target.value)} aria-label="Filter by region" className="min-h-11 w-full rounded-sm border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"><option value="">All Regions</option>{countries.map((country) => <option key={country} value={country}>{getCountryDisplayName(country)}</option>)}</select></label>}
          </div>
          {(activeFilterCount > 0 || searchQuery) && <button type="button" onClick={clearFilters} className="mt-2 min-h-11 rounded-sm px-2 text-sm text-zinc-300 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]">Clear filters</button>}
        </div>
        <p className="mt-4 text-xs text-zinc-400" role="status" aria-live="polite">{displayList.length} {displayList.length === 1 ? "prospect" : "prospects"}{observedOnly ? " in your cases" : " known to you"}{searchQuery ? ` matching “${searchQuery}”` : ""} · Estimates follow your evidence</p>
      </div>

      {displayList.length === 0 ? (
        <section className="border-b border-[var(--border)] py-10" aria-labelledby="prospect-empty-title">
          <h2 id="prospect-empty-title" className="font-editorial text-2xl text-[var(--foreground)]">{youth.length ? "No names match this view" : "Your next discovery starts with a match"}</h2>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">{youth.length ? "Try another name or widen the filters to revisit the prospects you know." : "Plan a school match, academy visit or local trip. The names you discover will become working cases here."}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            {youth.length > 0 && <Button variant="outline" className="min-h-11" onClick={() => { clearFilters(); setObservedOnly(false); }}>Show all known names</Button>}
            <Button className="min-h-11" onClick={onPlanDiscovery}><CalendarPlus size={15} className="mr-2" aria-hidden="true" />Plan a discovery week</Button>
          </div>
        </section>
      ) : viewMode === "list" ? (
        <div>
          <div className="md:hidden" data-tutorial-id="youth-pipeline-list">
            {displayList.map((youth) => <YouthCard key={youth.id} youth={youth} perceived={perceivedMap.get(youth.player.id) ?? null} scoutId={scoutId} reportedIds={reportedIds} observationCount={observationCountByPlayer.get(youth.player.id) ?? 0} caseItem={caseByPlayerId?.get(youth.player.id)} onClick={() => onSelectYouth(youth.player.id)} />)}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#27272a] bg-[#141414] text-left text-xs text-zinc-500">
                  {YOUTH_TABLE_COLUMNS.map(([key, label]) => (
                    <th
                      key={key}
                      className={`px-3 py-3 font-medium ${key === "ca" || key === "pa" ? "min-w-[145px]" : key === "name" ? "min-w-[220px]" : ""}`} aria-sort={tableSortKey === key ? tableSortDir === "asc" ? "ascending" : "descending" : "none"}
                    >
                      <button
                        onClick={() => handleTableSort(key)}
                        className="flex min-h-11 items-center gap-1 text-zinc-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
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
                  const observationBadge = getObservationBadge(observationCountByPlayer.get(y.player.id) ?? 0);
                  return (
                    <tr
                      key={y.id}
                      onClick={() => onSelectYouth(y.player.id)}
                      className="cursor-pointer border-b border-[var(--border)] transition-colors hover:bg-white/[0.025] focus-within:bg-white/[0.025]"
                    >
                      <td className="px-4 py-3">
                        <button type="button" className="flex min-h-11 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]" aria-label={`View profile for ${y.player.firstName} ${y.player.lastName}`}>
                          <YouthPortrait playerId={y.player.id} age={y.player.age} nationality={y.player.nationality} size={48} alt={`${y.player.firstName} ${y.player.lastName}`} className="shrink-0" />
                          <span><span className="block font-medium text-[var(--foreground)]">{y.player.firstName} {y.player.lastName}</span><span className="mt-1 block text-xs text-zinc-400">{observationBadge?.label ?? "No live look yet"}</span></span>
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs">{y.player.position}</Badge>
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{y.player.age}</td>
                      <td className="px-4 py-3 text-zinc-400">{y.player.nationality}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <ProspectEstimate perceived={perceivedMap.get(y.player.id) ?? null} mode="ca" />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <ProspectEstimate perceived={perceivedMap.get(y.player.id) ?? null} mode="pa" />
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-zinc-300">{y.buzzLevel}%</td>
                      <td className="px-4 py-3 text-sm tabular-nums text-zinc-300">{y.visibility}%</td>
                      <td className="px-4 py-3">
                        <Badge className={`text-xs ${PIPELINE_COLORS[stage]}`}>
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
        <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-2 2xl:grid-cols-3" data-tutorial-id="youth-pipeline-list">
          {displayList.map((y) => (
            <YouthCard
              key={y.id}
              youth={y}
              perceived={perceivedMap.get(y.player.id) ?? null}
              scoutId={scoutId}
              reportedIds={reportedIds}
              observationCount={observationCountByPlayer.get(y.player.id) ?? 0}
              caseItem={caseByPlayerId?.get(y.player.id)}
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
            <h3 className="text-sm font-semibold text-zinc-300">
              {getCountryDisplayName(country)}
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

const PRESTIGE_COLORS: Record<string, string> = {
  local: "text-zinc-400",
  regional: "text-blue-400",
  national: "text-amber-400",
  international: "text-purple-400",
};

function TournamentsTab({ currentWeek, tournaments }: { currentWeek: number; tournaments: Record<string, TournamentEvent> }) {
  const tournamentList = Object.values(tournaments);
  const discovered = tournamentList.filter(t => t.discovered);
  const upcoming = discovered.filter(t => !t.attended && t.endWeek >= currentWeek).sort((a, b) => a.startWeek - b.startWeek);
  const past = discovered.filter(t => t.attended || t.endWeek < currentWeek).sort((a, b) => b.startWeek - a.startWeek);
  const undiscovered = tournamentList.filter(t => !t.discovered && t.endWeek >= currentWeek);

  return (
    <div className="space-y-6">
      {/* Upcoming / Active */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-zinc-300">Upcoming & Active ({upcoming.length})</h3>
        {upcoming.length === 0 ? (
          <p className="text-xs text-zinc-500">No discovered tournaments upcoming. Meet contacts or build regional familiarity to discover events.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {upcoming.map(t => {
              const isActive = t.startWeek <= currentWeek && t.endWeek >= currentWeek;
              return (
                <Card key={t.id} className={`border-zinc-700/50 bg-zinc-800/50 ${isActive ? "ring-1 ring-emerald-500/40" : ""}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium text-zinc-100">{t.name}</CardTitle>
                      {isActive && <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">Active</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1 text-xs text-zinc-400">
                    <div className="flex justify-between">
                      <span>Prestige</span>
                      <span className={PRESTIGE_COLORS[t.prestige] ?? "text-zinc-400"}>{t.prestige}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Country</span>
                      <span className="capitalize">{t.country}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Weeks</span>
                      <span>{t.startWeek}–{t.endWeek}</span>
                    </div>
                    {t.travelCost != null && t.travelCost > 0 && (
                      <div className="flex justify-between">
                        <span>Est. Cost</span>
                        <span className="text-amber-400">£{t.travelCost.toLocaleString()}</span>
                      </div>
                    )}
                    {t.confederation && (
                      <div className="flex justify-between">
                        <span>Confederation</span>
                        <span>{t.confederation}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Source</span>
                      <span className="capitalize">{t.discoverySource ?? "unknown"}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Undiscovered hint */}
      {undiscovered.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-zinc-300">Undiscovered ({undiscovered.length})</h3>
          <p className="text-xs text-zinc-500">
            {undiscovered.length} tournament{undiscovered.length > 1 ? "s" : ""} remain undiscovered this season. Build regional familiarity and meet contacts to uncover them.
          </p>
        </div>
      )}

      {/* Past tournaments */}
      {past.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-zinc-300">Past ({past.length})</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {past.map(t => (
              <div key={t.id} className="flex items-center justify-between rounded border border-zinc-700/30 bg-zinc-800/30 px-3 py-2 text-xs">
                <span className="text-zinc-300">{t.name}</span>
                <Badge className={t.attended ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-600/20 text-zinc-500"}>
                  {t.attended ? "Attended" : "Missed"}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
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
  const { gameState, selectPlayer, setScreen } = useGameStore(useShallow((state) => ({
    gameState: state.gameState,
    selectPlayer: state.selectPlayer,
    setScreen: state.setScreen,
  })));
  const [activeTab, setActiveTab] = useState<Tab>("unsigned");
  const [sort, setSort] = useState<SortOption>("buzz");
  const [filterCountry, setFilterCountry] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPosition, setFilterPosition] = useState("");
  const [observedOnly, setObservedOnly] = useState(IS_YOUTH_EARLY_ACCESS);
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
  const scoutHomeCountry = getScoutHomeCountry(scout);

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
  const placedCount = Object.values(gameState.placementReports ?? {}).filter(
    (report) => report.scoutId === scout.id && report.clubResponse === "accepted",
  ).length;
  const countries = [...new Set(youthList.map((y) => y.country))].sort();
  const positions = [...new Set(youthList.map((y) => y.player.position))].sort();
  const nationalities = [...new Set(youthList.map((y) => y.player.nationality))].sort();
  const reportedIds = new Set(
    Object.values(gameState.placementReports ?? {})
      .filter((r) => r.scoutId === scout.id)
      .map((r) => r.unsignedYouthId),
  );
  const observationCountByPlayer = new Map<string, number>();
  for (const observation of Object.values(gameState.observations)) {
    observationCountByPlayer.set(
      observation.playerId,
      (observationCountByPlayer.get(observation.playerId) ?? 0) + 1,
    );
  }
  const repeatLookCount = youthList.filter(
    (youth) => (observationCountByPlayer.get(youth.player.id) ?? 0) >= 2,
  ).length;
  const decisionReadyCount = youthList.filter((youth) => {
    if (youth.placed || reportedIds.has(youth.id)) return false;
    const perceived = getPerceivedAbility(Object.values(gameState.observations), youth.player.id);
    return (
      (observationCountByPlayer.get(youth.player.id) ?? 0) >= 2 &&
      perceived != null &&
      (perceived.caConfidence >= 0.7 || perceived.paConfidence >= 0.7)
    );
  }).length;

  const handleSelectYouth = (playerId: string) => {
    selectPlayer(playerId);
    setScreen("playerProfile");
  };

  const TAB_CONFIG: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "unsigned", label: "Unsigned Youth", icon: Users },
    { id: "subRegions", label: "Sub-Regions", icon: Globe },
    { id: "venues", label: "Venues", icon: School },
    { id: "tournaments", label: "Tournaments", icon: Trophy },
  ];
  const pipelineContent = (
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
      onPlanDiscovery={() => setScreen("calendar")}
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
      caseByPlayerId={IS_YOUTH_EARLY_ACCESS
        ? new Map(listYouthCases(gameState).map((item) => [item.playerId, item]))
        : undefined}
    />
  );

  return (
    <GameLayout>
      <div className="min-h-full bg-[var(--background)] p-4 sm:p-6 lg:p-8">
        <header className="mb-5 border-b border-[var(--border)] pb-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="dossier-eyebrow text-zinc-400">{IS_YOUTH_EARLY_ACCESS ? "Your working cases" : "Recruitment notebook"}</p>
              <h1 className="mt-2 font-editorial text-3xl leading-tight text-[var(--foreground)] sm:text-4xl">{IS_YOUTH_EARLY_ACCESS ? "Prospects" : "Youth Scouting"}</h1>
              {totalYouth > 0 && <p className="mt-2 text-sm leading-6 text-zinc-400">{totalYouth} known names · {discoveredByScout} found by you</p>}
            </div>
            {totalYouth > 0 && <Button className="min-h-11 gap-2" onClick={() => setScreen("calendar")}><CalendarPlus size={16} aria-hidden="true" />Plan discovery work<ArrowRight size={15} aria-hidden="true" /></Button>}
          </div>
          <dl hidden={totalYouth === 0} className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <div className="flex flex-row-reverse items-baseline gap-2"><dt className="text-zinc-400">repeat looks</dt><dd className="font-semibold tabular-nums text-[var(--foreground)]">{repeatLookCount}</dd></div>
            <div className="flex flex-row-reverse items-baseline gap-2"><dt className="text-zinc-400">decisions ready</dt><dd className="font-semibold tabular-nums text-[var(--foreground)]">{decisionReadyCount}</dd></div>
            <div className="flex flex-row-reverse items-baseline gap-2"><dt className="text-zinc-400">placed</dt><dd className="font-semibold tabular-nums text-[var(--foreground)]">{placedCount}</dd></div>
            {!IS_YOUTH_EARLY_ACCESS && <div className="flex flex-row-reverse items-baseline gap-2" data-tutorial-id="youth-legacy-score"><dt className="text-zinc-400">legacy score</dt><dd className="font-semibold tabular-nums text-[var(--foreground)]">{legacyScore.totalScore}</dd></div>}
          </dl>
        </header>

        {IS_YOUTH_EARLY_ACCESS ? (
          <section aria-label="My prospect pipeline">{pipelineContent}</section>
        ) : (
          <>
            <div className="mb-6 flex gap-1 overflow-x-auto border-b border-[#27272a]" role="tablist" aria-label="Youth scouting views">
              {TAB_CONFIG.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  id={`youth-tab-${id}`}
                  onClick={() => setActiveTab(id)}
                  aria-selected={activeTab === id}
                  aria-controls={`youth-panel-${id}`}
                  role="tab"
                  className={`flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-t-md px-4 py-2.5 text-sm font-medium transition ${
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
            <div id={`youth-panel-${activeTab}`} role="tabpanel" aria-labelledby={`youth-tab-${activeTab}`}>
              {activeTab === "unsigned" && pipelineContent}
              {activeTab === "subRegions" && <SubRegionsTab subRegions={subRegionList} />}
              {activeTab === "venues" && <VenuesTab />}
              {activeTab === "tournaments" && (
                <TournamentsTab currentWeek={gameState.currentWeek} tournaments={gameState.youthTournaments ?? {}} />
              )}
            </div>
          </>
        )}
      </div>
    </GameLayout>
  );
}
