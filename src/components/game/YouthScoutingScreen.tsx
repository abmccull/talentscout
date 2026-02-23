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
} from "lucide-react";
import type { UnsignedYouth, SubRegion } from "@/engine/core/types";

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = "unsigned" | "subRegions" | "venues";
type SortOption = "buzz" | "age" | "country";

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

function buzzColor(buzz: number): string {
  if (buzz >= 70) return "bg-emerald-500";
  if (buzz >= 40) return "bg-amber-500";
  return "bg-zinc-600";
}

function sortYouth(
  list: UnsignedYouth[],
  sort: SortOption,
): UnsignedYouth[] {
  const copy = [...list];
  switch (sort) {
    case "buzz":
      return copy.sort((a, b) => b.buzzLevel - a.buzzLevel);
    case "age":
      return copy.sort((a, b) => a.player.age - b.player.age);
    case "country":
      return copy.sort((a, b) => a.country.localeCompare(b.country));
  }
}

const SORT_LABELS: Record<SortOption, string> = {
  buzz: "By Buzz",
  age: "By Age",
  country: "By Country",
};

// ─── Sub-components ──────────────────────────────────────────────────────────

interface YouthCardProps {
  youth: UnsignedYouth;
  scoutId: string;
  onClick: () => void;
}

function YouthCard({ youth, scoutId, onClick }: YouthCardProps) {
  const isObserved = youth.discoveredBy.includes(scoutId);
  const observationCount = youth.discoveredBy.length;

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
            {isObserved && (
              <Badge className="shrink-0 border-emerald-500/50 bg-emerald-500/10 text-[10px] text-emerald-400">
                <Eye size={9} className="mr-1" aria-hidden="true" />
                Observed
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
          <p className="text-sm font-bold text-white">{observationCount}</p>
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
  onSelectYouth: (youthId: string) => void;
}

function UnsignedYouthTab({
  youth,
  scoutId,
  sort,
  setSort,
  filterCountry,
  setFilterCountry,
  countries,
  onSelectYouth,
}: UnsignedYouthTabProps) {
  const filtered = filterCountry
    ? youth.filter((y) => y.country === filterCountry)
    : youth;
  const sorted = sortYouth(filtered, sort);

  return (
    <div>
      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
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

        {countries.length > 0 && (
          <select
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value)}
            aria-label="Filter by country"
            className="rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-600 focus:border-emerald-500/50 focus:outline-none"
          >
            <option value="">All Countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </div>

      {sorted.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Users size={40} className="mb-4 text-zinc-700" aria-hidden="true" />
            <p className="text-sm text-zinc-500">No unsigned youth found.</p>
            <p className="mt-1 text-xs text-zinc-600">
              Scout youth venues to discover unsigned players in the world.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" data-tutorial-id="youth-pipeline-list">
          {sorted.map((y) => (
            <YouthCard
              key={y.id}
              youth={y}
              scoutId={scoutId}
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

  if (!gameState) return null;

  const { unsignedYouth, subRegions, legacyScore, scout } = gameState;

  const youthList = Object.values(unsignedYouth);
  const subRegionList = Object.values(subRegions);

  // Summary stats
  const totalYouth = youthList.length;
  const discoveredByScout = youthList.filter((y) =>
    y.discoveredBy.includes(scout.id),
  ).length;
  const placedCount = youthList.filter((y) => y.placed).length;
  const countries = [...new Set(youthList.map((y) => y.country))].sort();

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
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-zinc-500">Total Youth</p>
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
                  <p className="text-xs text-zinc-500">Placed</p>
                  <p className="text-2xl font-bold text-blue-400">
                    {placedCount}
                  </p>
                </div>
                <ClipboardList size={20} className="text-blue-600" aria-hidden="true" />
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
              onSelectYouth={handleSelectYouth}
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
