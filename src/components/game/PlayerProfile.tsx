"use client";

import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo } from "react";
import { FileText, ArrowLeft, Eye, Star, ArrowUp, ArrowDown, Minus, MessageCircle } from "lucide-react";
import type { AttributeReading, HiddenIntel, Observation } from "@/engine/core/types";
import { ATTRIBUTE_DOMAINS } from "@/engine/core/types";

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
            <span>Observations ({observations.length})</span>
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
  } = useGameStore();

  if (!gameState || !selectedPlayerId) return null;

  const player = gameState.players[selectedPlayerId];
  if (!player) return null;

  const club = getClub(player.clubId);
  const league = club ? getLeague(club.leagueId) : undefined;
  const observations = getPlayerObservations(selectedPlayerId);
  const reports = getPlayerReports(selectedPlayerId);

  // Aggregate readings from all observations
  const allReadings: AttributeReading[] = observations.flatMap((o) => o.attributeReadings);

  // Merge by attribute (take latest/highest-confidence)
  const merged = new Map<string, AttributeReading>();
  for (const reading of allReadings) {
    const key = String(reading.attribute);
    const existing = merged.get(key);
    if (!existing || reading.confidence > existing.confidence) {
      merged.set(key, reading);
    }
  }

  // Group by domain
  const byDomain = new Map<string, Array<[string, AttributeReading | undefined]>>();
  for (const [attr, domain] of Object.entries(ATTRIBUTE_DOMAINS)) {
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain)!.push([attr, merged.get(attr)]);
  }

  const contactIntel: HiddenIntel[] = gameState.contactIntel[selectedPlayerId] ?? [];

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
              {club && (
                <span className="text-sm text-zinc-400">
                  {club.name}
                  {league ? ` (${league.shortName})` : ""}
                </span>
              )}
            </div>
          </div>
          <Button onClick={() => startReport(selectedPlayerId)} disabled={observations.length === 0}>
            <FileText size={14} className="mr-2" />
            Write Report
          </Button>
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
                          <span className="w-32 shrink-0 text-xs capitalize text-zinc-400">
                            {attr.replace(/([A-Z])/g, " $1").trim()}
                          </span>
                          {reading ? (
                            <>
                              <div className="flex-1 relative h-1.5 rounded-full bg-[#27272a] overflow-hidden">
                                <div
                                  className={`absolute left-0 top-0 h-full rounded-full ${confidenceColor(reading.confidence)}`}
                                  style={{ width: `${(reading.perceivedValue / 20) * 100}%` }}
                                />
                              </div>
                              <span className="w-6 shrink-0 text-right text-xs font-mono font-medium text-white">
                                {reading.perceivedValue}
                              </span>
                              <div
                                className={`h-2 w-2 shrink-0 rounded-full ${confidenceColor(reading.confidence)}`}
                                title={`${confidenceLabel(reading.confidence)} confidence (${reading.observationCount} observations)`}
                              />
                            </>
                          ) : (
                            <>
                              <div className="flex-1 h-1.5 rounded-full bg-[#27272a]" />
                              <span className="w-6 shrink-0 text-right text-xs text-zinc-600">?</span>
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
