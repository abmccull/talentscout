"use client";

import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo } from "react";
import { FileText, ArrowLeft, Eye, Star, ArrowUp, ArrowDown, Minus, MessageCircle, GraduationCap, Target, TrendingUp, TrendingDown, AlertTriangle, CalendarPlus, Phone, Users } from "lucide-react";
import type { AttributeReading, HiddenIntel, Observation, SystemFitResult, StatisticalProfile, AnomalyFlag, ScoutSkill } from "@/engine/core/types";
import { ATTRIBUTE_DOMAINS } from "@/engine/core/types";
import { calculateConfidenceRange } from "@/engine/scout/perception";
import { StarRating, StarRatingRange } from "@/components/ui/StarRating";
import { getPerceivedAbility } from "@/engine/scout/perceivedAbility";
import { Tooltip } from "@/components/ui/tooltip";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { ClubCrest } from "@/components/game/ClubCrest";

const DOMAIN_LABELS: Record<string, string> = {
  technical: "Technical",
  physical: "Physical",
  mental: "Mental",
  tactical: "Tactical",
};

const DOMAIN_ORDER = ["technical", "physical", "mental", "tactical"] as const;

function confidenceColor(confidence: number): string {
  if (confidence >= 0.7) return "bg-emerald-500";
  if (confidence >= 0.4) return "bg-amber-500";
  return "bg-red-500";
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.7) return "High";
  if (confidence >= 0.4) return "Medium";
  return "Low";
}

function formatMarketValue(value: number): string {
  if (value >= 1_000_000) return `£${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `£${(value / 1_000).toFixed(0)}K`;
  return `£${value}`;
}

function formatAttribute(attr: string): string {
  const spaced = attr.replace(/([A-Z])/g, " $1").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function ReliabilityDots({ reliability }: { reliability: number }) {
  const total = 5;
  const filled = Math.round(reliability * total);
  return (
    <div className="flex items-center gap-0.5" aria-label={`Reliability: ${filled} out of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${
            i < filled ? "bg-violet-400" : "bg-[#27272a]"
          }`}
        />
      ))}
    </div>
  );
}

// ─── System Fit Card (firstTeam scouts) ────────────────────────────────────

function fitColor(score: number): string {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function fitTextColor(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

interface SystemFitCardProps {
  fit: SystemFitResult | undefined;
}

function SystemFitCard({ fit }: SystemFitCardProps) {
  if (!fit) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Target size={14} className="text-blue-400" aria-hidden="true" />
            System Fit
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-zinc-500">
            Schedule an observation to generate fit analysis.
          </p>
        </CardContent>
      </Card>
    );
  }

  const circumference = 2 * Math.PI * 28;
  const dashOffset = circumference * (1 - fit.overallFit / 100);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Target size={14} className="text-blue-400" aria-hidden="true" />
          System Fit
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Circular overall fit */}
        <div className="flex items-center gap-4">
          <div className="relative shrink-0" aria-label={`Overall fit: ${fit.overallFit}%`}>
            <svg width="72" height="72" viewBox="0 0 72 72" className="-rotate-90">
              <circle cx="36" cy="36" r="28" fill="none" stroke="#27272a" strokeWidth="6" />
              <circle
                cx="36" cy="36" r="28" fill="none"
                strokeWidth="6"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                className={
                  fit.overallFit >= 70
                    ? "stroke-emerald-500"
                    : fit.overallFit >= 40
                    ? "stroke-amber-500"
                    : "stroke-red-500"
                }
              />
            </svg>
            <span className={`absolute inset-0 flex items-center justify-center text-base font-bold ${fitTextColor(fit.overallFit)}`}>
              {fit.overallFit}%
            </span>
          </div>
          <div className="flex-1 space-y-2">
            {/* Position fit */}
            <div>
              <div className="mb-0.5 flex items-center justify-between text-xs">
                <span className="text-zinc-500">Position</span>
                <span className={`font-mono font-semibold ${fitTextColor(fit.positionFit)}`}>{fit.positionFit}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#27272a]">
                <div className={`h-full rounded-full transition-all ${fitColor(fit.positionFit)}`} style={{ width: `${fit.positionFit}%` }} />
              </div>
            </div>
            {/* Style fit */}
            <div>
              <div className="mb-0.5 flex items-center justify-between text-xs">
                <span className="text-zinc-500">Style</span>
                <span className={`font-mono font-semibold ${fitTextColor(fit.styleFit)}`}>{fit.styleFit}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#27272a]">
                <div className={`h-full rounded-full transition-all ${fitColor(fit.styleFit)}`} style={{ width: `${fit.styleFit}%` }} />
              </div>
            </div>
            {/* Age fit */}
            <div>
              <div className="mb-0.5 flex items-center justify-between text-xs">
                <span className="text-zinc-500">Age</span>
                <span className={`font-mono font-semibold ${fitTextColor(fit.ageFit)}`}>{fit.ageFit}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#27272a]">
                <div className={`h-full rounded-full transition-all ${fitColor(fit.ageFit)}`} style={{ width: `${fit.ageFit}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Strengths */}
        {fit.fitStrengths.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Strengths</p>
            <ul className="space-y-0.5">
              {fit.fitStrengths.map((s, i) => (
                <li key={i} className="text-xs text-emerald-400">+ {s}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Weaknesses */}
        {fit.fitWeaknesses.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Concerns</p>
            <ul className="space-y-0.5">
              {fit.fitWeaknesses.map((w, i) => (
                <li key={i} className="text-xs text-red-400">- {w}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Statistical Profile Card (data scouts) ────────────────────────────────

const STAT_LABELS: Record<string, string> = {
  goals: "Goals",
  assists: "Assists",
  passCompletion: "Pass Completion",
  tacklesWon: "Tackles Won",
  interceptions: "Interceptions",
  aerialDuelsWon: "Aerial Duels Won",
  dribbleSuccess: "Dribble Success",
  shotsOnTarget: "Shots on Target",
};

function percentileBarColor(p: number): string {
  if (p > 75) return "bg-emerald-500";
  if (p >= 50) return "bg-zinc-400";
  if (p >= 25) return "bg-amber-500";
  return "bg-red-500";
}

function TrendArrow({ trend }: { trend: "rising" | "stable" | "falling" | undefined }) {
  if (trend === "rising") return <TrendingUp size={12} className="text-emerald-400" aria-label="Rising" />;
  if (trend === "falling") return <TrendingDown size={12} className="text-red-400" aria-label="Falling" />;
  return <Minus size={12} className="text-zinc-500" aria-label="Stable" />;
}

interface StatProfileCardProps {
  profile: StatisticalProfile | undefined;
  anomalies: AnomalyFlag[];
}

function StatisticalProfileCard({ profile, anomalies }: StatProfileCardProps) {
  if (!profile) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <TrendingUp size={14} className="text-blue-400" aria-hidden="true" />
            Statistical Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-zinc-500">
            No statistical profile available. Generate one via the data analysis system.
          </p>
        </CardContent>
      </Card>
    );
  }

  const statKeys = Object.keys(STAT_LABELS) as Array<keyof typeof profile.per90>;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <TrendingUp size={14} className="text-blue-400" aria-hidden="true" />
          Statistical Profile
          <span className="ml-auto text-[10px] font-normal text-zinc-500">
            S{profile.season} W{profile.lastUpdated}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Per-90 stats grid */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {statKeys.map((key) => {
            const per90Val = profile.per90[key as keyof typeof profile.per90];
            const pct = profile.percentiles[key as keyof typeof profile.percentiles];
            const trend = profile.trends[key as keyof typeof profile.trends];
            return (
              <div key={key} className="rounded-md border border-[#27272a] p-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] text-zinc-400">{STAT_LABELS[key]}</span>
                  <div className="flex items-center gap-1">
                    <TrendArrow trend={trend} />
                    <span className="font-mono text-xs font-semibold text-white">
                      {typeof per90Val === "number" ? per90Val.toFixed(2) : "—"}
                    </span>
                  </div>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-[#27272a]">
                  <div
                    className={`h-full rounded-full transition-all ${percentileBarColor(pct)}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-0.5 text-[9px] text-zinc-600">{pct}th percentile</p>
              </div>
            );
          })}
        </div>

        {/* Anomaly flags */}
        {anomalies.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
              <AlertTriangle size={10} aria-hidden="true" />
              Anomalies Detected
            </p>
            <div className="space-y-1.5">
              {anomalies.map((flag) => (
                <div
                  key={flag.id}
                  className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-medium text-amber-400 capitalize">
                      {flag.stat.replace(/([A-Z])/g, " $1").trim()} — {flag.direction}
                    </span>
                    <Badge
                      variant="outline"
                      className="border-amber-500/40 text-amber-400 text-[9px]"
                    >
                      {flag.severity.toFixed(1)}σ
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[10px] text-zinc-400">{flag.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── ObservationsSidebar ────────────────────────────────────────────────────

function ObservationsSidebar({ observations }: { observations: Observation[] }) {
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const comparison = useMemo(() => {
    if (selected.length !== 2) return null;
    const obsA = observations.find((o) => o.id === selected[0]);
    const obsB = observations.find((o) => o.id === selected[1]);
    if (!obsA || !obsB) return null;

    const mapA = new Map(obsA.attributeReadings.map((r) => [String(r.attribute), r]));
    const mapB = new Map(obsB.attributeReadings.map((r) => [String(r.attribute), r]));
    const allAttrs = new Set([...mapA.keys(), ...mapB.keys()]);

    const rows: { attr: string; valA: number | null; valB: number | null; delta: number | null }[] = [];
    for (const attr of allAttrs) {
      const rA = mapA.get(attr);
      const rB = mapB.get(attr);
      rows.push({
        attr,
        valA: rA?.perceivedValue ?? null,
        valB: rB?.perceivedValue ?? null,
        delta: rA && rB ? rB.perceivedValue - rA.perceivedValue : null,
      });
    }
    rows.sort((a, b) => a.attr.localeCompare(b.attr));
    return { obsA, obsB, rows };
  }, [selected, observations]);

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-sm">
            <Tooltip content="Number of times you've observed this player. More observations improve reading accuracy." side="top">
              <span>Observations ({observations.length})</span>
            </Tooltip>
            {observations.length >= 2 && (
              <Button
                size="sm"
                variant={compareMode ? "default" : "ghost"}
                className="text-[10px] h-6 px-2"
                onClick={() => {
                  setCompareMode(!compareMode);
                  if (compareMode) setSelected([]);
                }}
              >
                Compare
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {observations.length === 0 ? (
            <p className="text-xs text-zinc-500">None yet.</p>
          ) : (
            <div className="space-y-2">
              {observations.slice(-5).reverse().map((obs) => {
                const isSelected = selected.includes(obs.id);
                return (
                  <div
                    key={obs.id}
                    className={`rounded-md border p-2 ${
                      compareMode
                        ? isSelected
                          ? "border-emerald-500 bg-emerald-500/5 cursor-pointer"
                          : "border-[#27272a] cursor-pointer hover:border-zinc-600"
                        : "border-[#27272a]"
                    }`}
                    onClick={compareMode ? () => toggleSelect(obs.id) : undefined}
                    role={compareMode ? "button" : undefined}
                  >
                    <div className="flex items-center justify-between mb-1">
                      {compareMode && (
                        <div
                          className={`mr-2 h-3.5 w-3.5 shrink-0 rounded-sm border ${
                            isSelected
                              ? "bg-emerald-500 border-emerald-500"
                              : "border-zinc-600"
                          }`}
                        />
                      )}
                      <span className="text-xs text-zinc-400 capitalize flex-1">
                        {obs.context.replace(/([A-Z])/g, " $1").trim()}
                      </span>
                      <span className="text-xs text-zinc-500">
                        W{obs.week} S{obs.season}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      {obs.attributeReadings.length} attribute
                      {obs.attributeReadings.length !== 1 ? "s" : ""} read
                    </p>
                  </div>
                );
              })}
            </div>
          )}
          {compareMode && selected.length < 2 && (
            <p className="mt-2 text-[10px] text-zinc-500">
              Select {2 - selected.length} more observation{selected.length === 0 ? "s" : ""} to compare.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Comparison panel */}
      {comparison && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Comparison: W{comparison.obsA.week} vs W{comparison.obsB.week}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <div className="flex items-center text-[10px] text-zinc-500 mb-2">
                <span className="w-24 shrink-0">Attribute</span>
                <span className="w-8 text-center shrink-0">W{comparison.obsA.week}</span>
                <span className="w-8 text-center shrink-0">W{comparison.obsB.week}</span>
                <span className="w-8 text-center shrink-0">Chg</span>
              </div>
              {comparison.rows.map((row) => (
                <div key={row.attr} className="flex items-center text-xs">
                  <span className="w-24 shrink-0 text-zinc-400 capitalize truncate">
                    {row.attr.replace(/([A-Z])/g, " $1").trim()}
                  </span>
                  <span className="w-8 text-center shrink-0 font-mono text-zinc-300">
                    {row.valA ?? "—"}
                  </span>
                  <span className="w-8 text-center shrink-0 font-mono text-zinc-300">
                    {row.valB ?? "—"}
                  </span>
                  <span className="w-8 flex items-center justify-center shrink-0">
                    {row.delta !== null ? (
                      row.delta > 0 ? (
                        <span className="flex items-center text-emerald-400">
                          <ArrowUp size={10} />
                          <span className="text-[10px]">{row.delta}</span>
                        </span>
                      ) : row.delta < 0 ? (
                        <span className="flex items-center text-red-400">
                          <ArrowDown size={10} />
                          <span className="text-[10px]">{Math.abs(row.delta)}</span>
                        </span>
                      ) : (
                        <Minus size={10} className="text-zinc-600" />
                      )
                    ) : (
                      <span className="text-zinc-700 text-[10px]">—</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}

/** Map each attribute domain to the scout skill that governs its accuracy. */
const DOMAIN_SKILL_MAP: Record<string, ScoutSkill> = {
  technical: "technicalEye",
  physical: "physicalAssessment",
  mental: "psychologicalRead",
  tactical: "tacticalUnderstanding",
  hidden: "psychologicalRead",
};

/** Backward-compat: compute rangeLow/rangeHigh for old saves missing them. */
function ensureRange(reading: AttributeReading, scoutSkill: number): AttributeReading {
  if (reading.rangeLow !== undefined && reading.rangeHigh !== undefined) return reading;
  const [rangeLow, rangeHigh] = calculateConfidenceRange(
    reading.perceivedValue, reading.confidence, scoutSkill, reading.observationCount,
  );
  return { ...reading, rangeLow, rangeHigh };
}

export function PlayerProfile() {
  const {
    gameState,
    selectedPlayerId,
    setScreen,
    getPlayerObservations,
    getPlayerReports,
    startReport,
    getClub,
    getLeague,
    toggleWatchlist,
    setPendingFixtureClubFilter,
    setPendingCalendarActivity,
    tapNetworkForPlayer,
  } = useGameStore();

  if (!gameState || !selectedPlayerId) return null;

  const player = gameState.players[selectedPlayerId]
    ?? gameState.unsignedYouth[selectedPlayerId]?.player
    ?? null;
  if (!player) return null;

  const club = getClub(player.clubId);
  const league = club ? getLeague(club.leagueId) : undefined;
  const observations = getPlayerObservations(selectedPlayerId);
  const reports = getPlayerReports(selectedPlayerId);

  // Own-club check: signed players at scout's club show exact values
  const isOwnClubPlayer = !!(player.clubId && player.clubId === gameState.scout.currentClubId);

  // Aggregate readings from all observations
  const allReadings: AttributeReading[] = observations.flatMap((o) => o.attributeReadings);

  // Merge by attribute (take best observation count, apply backward-compat range)
  const merged = new Map<string, AttributeReading>();
  for (const reading of allReadings) {
    const key = String(reading.attribute);
    const domain = ATTRIBUTE_DOMAINS[reading.attribute];
    const skillKey = DOMAIN_SKILL_MAP[domain] ?? "technicalEye";
    const skillLevel = gameState.scout.skills[skillKey as ScoutSkill];
    const withRange = ensureRange(reading, skillLevel);
    const existing = merged.get(key);
    if (!existing || withRange.observationCount > existing.observationCount) {
      merged.set(key, withRange);
    }
  }

  // Group by domain
  const byDomain = new Map<string, Array<[string, AttributeReading | undefined]>>();
  for (const [attr, domain] of Object.entries(ATTRIBUTE_DOMAINS)) {
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain)!.push([attr, merged.get(attr)]);
  }

  // Aggregate ability readings using shared helper
  const allObs = Object.values(gameState.observations);
  const perceived = getPerceivedAbility(allObs, selectedPlayerId);

  // Map perceived to the shape used by the UI below
  const aggregatedAbility = perceived
    ? {
        ca: perceived.ca,
        caLow: perceived.caLow,
        caHigh: perceived.caHigh,
        caConfidence: perceived.caConfidence,
        paLow: perceived.paLow,
        paHigh: perceived.paHigh,
        paConfidence: perceived.paConfidence,
      }
    : null;

  const contactIntel: HiddenIntel[] = gameState.contactIntel[selectedPlayerId] ?? [];

  // Unsigned youth detection
  const unsignedYouthRecord = gameState.unsignedYouth[selectedPlayerId] ?? null;

  // Specialization-specific data
  const specialization = gameState.scout.primarySpecialization;
  const clubId = gameState.scout.currentClubId ?? "";
  const fitCacheKey = `${selectedPlayerId}:${clubId}`;
  const systemFit = specialization === "firstTeam"
    ? (gameState.systemFitCache[fitCacheKey] ?? undefined)
    : undefined;
  const statisticalProfile = specialization === "data"
    ? (gameState.statisticalProfiles[selectedPlayerId] ?? undefined)
    : undefined;
  const playerAnomalies = specialization === "data"
    ? gameState.anomalyFlags.filter((f) => f.playerId === selectedPlayerId)
    : [];

  const convictionVariant = (c: string) => {
    if (c === "tablePound") return "default" as const;
    if (c === "strongRecommend") return "success" as const;
    if (c === "recommend") return "secondary" as const;
    return "outline" as const;
  };

  return (
    <GameLayout>
      <div className="p-6">
        {/* Back button */}
        <button
          onClick={() => setScreen("playerDatabase")}
          className="mb-4 flex items-center gap-1 text-sm text-zinc-500 hover:text-white transition"
          aria-label="Back to player database"
        >
          <ArrowLeft size={14} />
          Back to Players
        </button>

        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div className="flex items-start gap-4">
            <PlayerAvatar
              playerId={player.id}
              nationality={player.nationality}
              size={96}
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">
                  {player.firstName} {player.lastName}
                </h1>
                <button
                  onClick={() => toggleWatchlist(selectedPlayerId)}
                  className="p-1 rounded hover:bg-zinc-800 transition"
                  aria-label={gameState.watchlist.includes(selectedPlayerId) ? "Remove from watchlist" : "Add to watchlist"}
                >
                  <Star
                    size={18}
                    className={
                      gameState.watchlist.includes(selectedPlayerId)
                        ? "text-amber-400 fill-amber-400"
                        : "text-zinc-600"
                    }
                  />
                </button>
              </div>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">{player.position}</Badge>
                <span className="text-sm text-zinc-400">
                  Age {player.age} — {player.nationality}
                </span>
                {unsignedYouthRecord ? (
                  <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-400">
                    Unsigned
                  </Badge>
                ) : club ? (
                  <span className="flex items-center gap-1.5 text-sm text-zinc-400">
                    <ClubCrest clubId={club.id} clubName={club.name} size={32} />
                    {club.name}
                    {league ? ` (${league.shortName})` : ""}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => startReport(selectedPlayerId)} disabled={observations.length === 0}>
              <FileText size={14} className="mr-2" />
              Write Report
            </Button>
            {club && (
              <Button
                variant="outline"
                onClick={() => {
                  setPendingFixtureClubFilter(club.shortName);
                  setScreen("fixtureBrowser");
                }}
              >
                <Eye size={14} className="mr-2" />
                Find Match
              </Button>
            )}
            {/* Tap Network — available for any player with contacts */}
            <Button
              variant="outline"
              onClick={() => tapNetworkForPlayer(selectedPlayerId)}
              disabled={Object.keys(gameState.contacts).length === 0}
            >
              <Phone size={14} className="mr-2" />
              Tap Network
            </Button>
            {/* Youth-specific quick actions */}
            {unsignedYouthRecord && observations.length > 0 && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPendingCalendarActivity({
                      type: "followUpSession",
                      targetId: unsignedYouthRecord.id,
                      label: `Follow-Up: ${player.firstName} ${player.lastName}`,
                    });
                    setScreen("calendar");
                  }}
                >
                  <CalendarPlus size={14} className="mr-2" />
                  Schedule Follow-Up
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setPendingCalendarActivity({
                      type: "parentCoachMeeting",
                      targetId: unsignedYouthRecord.id,
                      label: `Meeting: ${player.firstName} ${player.lastName}`,
                    });
                    setScreen("calendar");
                  }}
                >
                  <Users size={14} className="mr-2" />
                  Meet Parents/Coach
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Overview */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-zinc-500">Position</p>
              <p className="mt-1 font-semibold">{player.position}</p>
              {player.secondaryPositions.length > 0 && (
                <p className="text-xs text-zinc-500">{player.secondaryPositions.join(", ")}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-zinc-500">Preferred Foot</p>
              <p className="mt-1 font-semibold capitalize">{player.preferredFoot}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-zinc-500">Market Value</p>
              <p className="mt-1 font-semibold text-emerald-400">
                {formatMarketValue(player.marketValue)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-zinc-500">Contract Expires</p>
              <p className="mt-1 font-semibold">Season {player.contractExpiry}</p>
            </CardContent>
          </Card>
        </div>

        {/* Unsigned Youth Details */}
        {unsignedYouthRecord && (
          <div className="mb-6">
            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-amber-400">
                  <GraduationCap size={14} aria-hidden="true" />
                  Unsigned Youth Prospect
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  {/* Buzz level */}
                  <div>
                    <p className="mb-1 text-xs text-zinc-500">Buzz Level</p>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-amber-400 transition-all"
                        style={{ width: `${unsignedYouthRecord.buzzLevel}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs font-medium text-white">{unsignedYouthRecord.buzzLevel}/100</p>
                  </div>

                  {/* Visibility */}
                  <div>
                    <p className="mb-1 text-xs text-zinc-500">Visibility</p>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${unsignedYouthRecord.visibility}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs font-medium text-white">{unsignedYouthRecord.visibility}/100</p>
                  </div>

                  {/* Discovered by */}
                  <div>
                    <p className="mb-1 text-xs text-zinc-500">Discovered By</p>
                    <p className="text-lg font-medium text-white">
                      {unsignedYouthRecord.discoveredBy.length}
                      <span className="ml-1 text-xs text-zinc-500">scout{unsignedYouthRecord.discoveredBy.length !== 1 ? "s" : ""}</span>
                    </p>
                  </div>

                  {/* Status */}
                  <div>
                    <p className="mb-1 text-xs text-zinc-500">Status</p>
                    <p className="text-sm font-medium">
                      {unsignedYouthRecord.placed ? (
                        <span className="text-emerald-400">Placed</span>
                      ) : (
                        <span className="text-amber-400">Available</span>
                      )}
                    </p>
                  </div>
                </div>

                {!unsignedYouthRecord.placed && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 border-amber-500/40 text-amber-400 hover:border-amber-400 hover:text-amber-300"
                    onClick={() => setScreen("calendar")}
                  >
                    <FileText size={12} className="mr-1.5" aria-hidden="true" />
                    Recommend to Club
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Ability Assessment */}
        {aggregatedAbility && (
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-zinc-500">Current Ability</p>
                  <div
                    className={`h-2 w-2 rounded-full ${confidenceColor(aggregatedAbility.caConfidence)}`}
                    title={`${confidenceLabel(aggregatedAbility.caConfidence)} confidence`}
                  />
                </div>
                {aggregatedAbility.caHigh - aggregatedAbility.caLow > 0.5 ? (
                  <StarRatingRange
                    low={aggregatedAbility.caLow}
                    high={aggregatedAbility.caHigh}
                    confidence={aggregatedAbility.caConfidence}
                    size="lg"
                  />
                ) : (
                  <StarRating
                    rating={aggregatedAbility.ca}
                    confidence={aggregatedAbility.caConfidence}
                    size="lg"
                  />
                )}
                {aggregatedAbility.caConfidence < 0.5 && (
                  <p className="mt-2 text-[10px] text-zinc-500">
                    More observations will narrow this range
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-zinc-500">Potential</p>
                  <div
                    className={`h-2 w-2 rounded-full ${confidenceColor(aggregatedAbility.paConfidence)}`}
                    title={`${confidenceLabel(aggregatedAbility.paConfidence)} confidence`}
                  />
                </div>
                <StarRatingRange
                  low={aggregatedAbility.paLow}
                  high={aggregatedAbility.paHigh}
                  confidence={aggregatedAbility.paConfidence}
                  size="lg"
                />
                {player.age <= 21 &&
                  aggregatedAbility.paHigh - aggregatedAbility.paLow > 1.0 && (
                    <p className="mt-2 text-[10px] text-zinc-500">
                      More observations will narrow this range
                    </p>
                  )}
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Attribute table */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Scouting Data
            </h2>
            {DOMAIN_ORDER.map((domain) => {
              const domainAttrs = byDomain.get(domain) ?? [];
              if (domainAttrs.length === 0) return null;
              const hasAny = domainAttrs.some(([, r]) => !!r);
              if (!hasAny) return null;
              return (
                <Card key={domain}>
                  <CardHeader className="pb-2 pt-4 px-4">
                    <CardTitle className="text-sm">{DOMAIN_LABELS[domain]}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <div className="space-y-2">
                      {domainAttrs.map(([attr, reading]) => (
                        <div key={attr} className="flex items-center gap-3">
                          <Tooltip content="Your estimated reading of this attribute. Accuracy depends on observations, lens focus, and scout skills." side="right">
                            <span className="w-32 shrink-0 text-xs capitalize text-zinc-400">
                              {attr.replace(/([A-Z])/g, " $1").trim()}
                            </span>
                          </Tooltip>
                          {reading ? (
                            isOwnClubPlayer ? (
                              <>
                                <div className="flex-1 relative h-1.5 rounded-full bg-[#27272a] overflow-hidden">
                                  <div
                                    className="absolute left-0 top-0 h-full rounded-full bg-emerald-500"
                                    style={{ width: `${(player.attributes[attr as keyof typeof player.attributes] / 20) * 100}%` }}
                                  />
                                </div>
                                <span className="w-8 shrink-0 text-right text-xs font-mono font-medium text-white">
                                  {player.attributes[attr as keyof typeof player.attributes]}
                                </span>
                              </>
                            ) : (
                              <>
                                <div className="flex-1 relative h-1.5 rounded-full bg-[#27272a] overflow-hidden">
                                  <div
                                    className={`absolute top-0 h-full rounded-full ${confidenceColor(reading.confidence)}`}
                                    style={{
                                      left: `${(((reading.rangeLow ?? reading.perceivedValue) - 1) / 19) * 100}%`,
                                      width: `${((((reading.rangeHigh ?? reading.perceivedValue) - (reading.rangeLow ?? reading.perceivedValue)) || 1) / 19) * 100}%`,
                                    }}
                                  />
                                </div>
                                <span className="w-8 shrink-0 text-right text-xs font-mono font-medium text-white">
                                  {reading.rangeLow != null && reading.rangeHigh != null && reading.rangeLow !== reading.rangeHigh
                                    ? `${reading.rangeLow}-${reading.rangeHigh}`
                                    : reading.perceivedValue}
                                </span>
                                <div
                                  className={`h-2 w-2 shrink-0 rounded-full ${confidenceColor(reading.confidence)}`}
                                  title={`${confidenceLabel(reading.confidence)} confidence (${reading.observationCount} obs)`}
                                />
                              </>
                            )
                          ) : (
                            <>
                              <div className="flex-1 h-1.5 rounded-full bg-[#27272a]" />
                              <span className="w-8 shrink-0 text-right text-xs text-zinc-600">?</span>
                              <div className="h-2 w-2 shrink-0 rounded-full bg-zinc-700" />
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {observations.length === 0 && (
              <div className="rounded-lg border border-[#27272a] bg-[#141414] p-6 text-center">
                <Eye size={24} className="mx-auto mb-2 text-zinc-600" aria-hidden="true" />
                <p className="text-sm text-zinc-500">No observations recorded yet.</p>
                <p className="text-xs text-zinc-600 mt-1">
                  Attend a match and focus on this player to gather data.
                </p>
              </div>
            )}

            {/* Contact Intel */}
            {contactIntel.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3 flex items-center gap-1.5">
                  <MessageCircle size={13} aria-hidden="true" />
                  Contact Intel
                </h2>
                <Card>
                  <CardContent className="px-4 pb-4 pt-4">
                    <div className="space-y-3">
                      {contactIntel.map((intel, i) => (
                        <div key={i} className="rounded-md border border-[#27272a] bg-[#141414] p-3">
                          <div className="flex items-start justify-between gap-3 mb-1.5">
                            <span className="text-xs font-medium text-violet-300">
                              {formatAttribute(intel.attribute)}
                            </span>
                            <ReliabilityDots reliability={intel.reliability} />
                          </div>
                          <p className="text-xs text-zinc-400 leading-relaxed">{intel.hint}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>

          {/* Sidebar: observations & reports */}
          <div className="space-y-4">
            {/* Observation history */}
            <ObservationsSidebar observations={observations} />

            {/* First-team: System Fit */}
            {specialization === "firstTeam" && (
              <SystemFitCard fit={systemFit} />
            )}

            {/* Data scout: Statistical Profile */}
            {specialization === "data" && (
              <StatisticalProfileCard
                profile={statisticalProfile}
                anomalies={playerAnomalies}
              />
            )}

            {/* Reports */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Reports ({reports.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {reports.length === 0 ? (
                  <p className="text-xs text-zinc-500">No reports filed yet.</p>
                ) : (
                  <div className="space-y-2">
                    {reports.map((r) => (
                      <div
                        key={r.id}
                        className="rounded-md border border-[#27272a] p-2"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <Badge
                            variant={convictionVariant(r.conviction)}
                            className="text-[10px]"
                          >
                            {r.conviction === "tablePound"
                              ? "TABLE POUND"
                              : r.conviction === "strongRecommend"
                              ? "Strong Rec"
                              : r.conviction === "recommend"
                              ? "Recommend"
                              : "Note"}
                          </Badge>
                          <span className="text-xs text-zinc-500">W{r.submittedWeek}</span>
                        </div>
                        <p className="text-xs text-zinc-400">
                          Quality: {r.qualityScore}/100
                        </p>
                        {r.clubResponse && (
                          <p className="text-xs text-zinc-500 capitalize mt-0.5">
                            Club: {r.clubResponse}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </GameLayout>
  );
}
