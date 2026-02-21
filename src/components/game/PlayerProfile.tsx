"use client";

import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, ArrowLeft, Eye } from "lucide-react";
import type { AttributeReading } from "@/engine/core/types";
import { ATTRIBUTE_DOMAINS } from "@/engine/core/types";

const DOMAIN_LABELS: Record<string, string> = {
  technical: "Technical",
  physical: "Physical",
  mental: "Mental",
  goalkeeper: "Goalkeeper",
};

const DOMAIN_ORDER = ["technical", "physical", "mental", "goalkeeper"] as const;

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
            <h1 className="text-2xl font-bold">
              {player.firstName} {player.lastName}
            </h1>
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
              if (!hasAny && domain === "goalkeeper" && player.position !== "GK") return null;
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
          </div>

          {/* Sidebar: observations & reports */}
          <div className="space-y-4">
            {/* Observation history */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Observations ({observations.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {observations.length === 0 ? (
                  <p className="text-xs text-zinc-500">None yet.</p>
                ) : (
                  <div className="space-y-2">
                    {observations.slice(-5).reverse().map((obs) => (
                      <div
                        key={obs.id}
                        className="rounded-md border border-[#27272a] p-2"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-zinc-400 capitalize">
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
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

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
