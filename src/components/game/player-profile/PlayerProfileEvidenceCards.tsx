"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Minus,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import type {
  AnomalyFlag,
  Observation,
  StatisticalProfile,
  SystemFitResult,
} from "@/engine/core/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip } from "@/components/ui/tooltip";
import { buildObservationTrend } from "@/engine/scout/observationTrend";
import { formatAttribute } from "./playerProfileFormatting";

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

function percentileBarColor(percentile: number): string {
  if (percentile > 75) return "bg-emerald-500";
  if (percentile >= 50) return "bg-zinc-400";
  if (percentile >= 25) return "bg-amber-500";
  return "bg-red-500";
}

function TrendArrow({
  trend,
}: {
  trend: "rising" | "stable" | "falling" | undefined;
}) {
  if (trend === "rising") {
    return <TrendingUp size={12} className="text-emerald-400" aria-label="Rising" />;
  }
  if (trend === "falling") {
    return <TrendingDown size={12} className="text-red-400" aria-label="Falling" />;
  }
  return <Minus size={12} className="text-zinc-500" aria-label="Stable" />;
}

export function SystemFitCard({ fit }: { fit: SystemFitResult | undefined }) {
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
        <div className="flex items-center gap-4">
          <div className="relative shrink-0" aria-label={`Overall fit: ${fit.overallFit}%`}>
            <svg width="72" height="72" viewBox="0 0 72 72" className="-rotate-90">
              <circle cx="36" cy="36" r="28" fill="none" stroke="#27272a" strokeWidth="6" />
              <circle
                cx="36"
                cy="36"
                r="28"
                fill="none"
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
            <span
              className={`absolute inset-0 flex items-center justify-center text-base font-bold ${fitTextColor(fit.overallFit)}`}
            >
              {fit.overallFit}%
            </span>
          </div>
          <div className="flex-1 space-y-2">
            <div>
              <div className="mb-0.5 flex items-center justify-between text-xs">
                <span className="text-zinc-500">Position</span>
                <span className={`font-mono font-semibold ${fitTextColor(fit.positionFit)}`}>{fit.positionFit}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#27272a]">
                <div className={`h-full rounded-full transition-all ${fitColor(fit.positionFit)}`} style={{ width: `${fit.positionFit}%` }} />
              </div>
            </div>
            <div>
              <div className="mb-0.5 flex items-center justify-between text-xs">
                <span className="text-zinc-500">Role</span>
                <span className={`font-mono font-semibold ${fitTextColor(fit.roleFit)}`}>{fit.roleFit}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#27272a]">
                <div className={`h-full rounded-full transition-all ${fitColor(fit.roleFit)}`} style={{ width: `${fit.roleFit}%` }} />
              </div>
            </div>
            <div>
              <div className="mb-0.5 flex items-center justify-between text-xs">
                <span className="text-zinc-500">Tactical</span>
                <span className={`font-mono font-semibold ${fitTextColor(fit.tacticalFit)}`}>{fit.tacticalFit}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#27272a]">
                <div className={`h-full rounded-full transition-all ${fitColor(fit.tacticalFit)}`} style={{ width: `${fit.tacticalFit}%` }} />
              </div>
            </div>
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

        {fit.suggestedRole && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Suggested Role</span>
            <span className="rounded bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-400">
              {formatAttribute(fit.suggestedRole)}
            </span>
          </div>
        )}

        {fit.fitStrengths.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Strengths</p>
            <ul className="space-y-0.5">
              {fit.fitStrengths.map((strength, index) => (
                <li key={index} className="text-xs text-emerald-400">+ {strength}</li>
              ))}
            </ul>
          </div>
        )}

        {fit.fitWeaknesses.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Concerns</p>
            <ul className="space-y-0.5">
              {fit.fitWeaknesses.map((weakness, index) => (
                <li key={index} className="text-xs text-red-400">- {weakness}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function StatisticalProfileCard({
  profile,
  anomalies,
}: {
  profile: StatisticalProfile | undefined;
  anomalies: AnomalyFlag[];
}) {
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
            No statistical profile is available yet. Commission an analyst review to add one to the dossier.
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
        {profile.evidenceContext && (
          <div className="rounded-md border border-cyan-500/20 bg-cyan-500/5 px-3 py-2">
            <div className="flex items-center justify-between gap-3 text-[10px]">
              <span className="font-medium capitalize text-cyan-200">
                {profile.evidenceContext.accessTier} regional data access
              </span>
              <span className="font-mono text-cyan-300">
                {Math.round(profile.evidenceContext.confidence * 100)}% source confidence
              </span>
            </div>
            <p className="mt-1 text-[9px] leading-relaxed text-zinc-500">
              {profile.evidenceContext.explanation}
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {statKeys.map((key) => {
            const per90Val = profile.per90[key as keyof typeof profile.per90];
            const percentile = profile.percentiles[key as keyof typeof profile.percentiles];
            const trend = profile.trends[key as keyof typeof profile.trends];
            return (
              <div key={key} className="rounded-md border border-[#27272a] p-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[10px] text-zinc-400">{STAT_LABELS[key]}</span>
                  <div className="flex items-center gap-1">
                    <TrendArrow trend={trend} />
                    <span className="font-mono text-xs font-semibold text-white">
                      {typeof per90Val === "number" ? per90Val.toFixed(2) : "\u2014"}
                    </span>
                  </div>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-[#27272a]">
                  <div
                    className={`h-full rounded-full transition-all ${percentileBarColor(percentile)}`}
                    style={{ width: `${percentile}%` }}
                  />
                </div>
                <p className="mt-0.5 text-[9px] text-zinc-600">{percentile}th percentile</p>
              </div>
            );
          })}
        </div>

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
                      {formatAttribute(flag.stat)} {"\u2014"} {flag.direction}
                    </span>
                    <Badge
                      variant="outline"
                      className="border-amber-500/40 text-amber-400 text-[9px]"
                    >
                      {flag.severity.toFixed(1)}\u03C3
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

export function ObservationsSidebar({
  observations,
  trendHistoryDepth,
}: {
  observations: Observation[];
  trendHistoryDepth?: number;
}) {
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const toggleSelect = (id: string) => {
    setSelected((previous) => {
      if (previous.includes(id)) return previous.filter((entry) => entry !== id);
      if (previous.length >= 2) return [previous[1], id];
      return [...previous, id];
    });
  };

  const comparison = useMemo(() => {
    if (selected.length !== 2) return null;
    const obsA = observations.find((observation) => observation.id === selected[0]);
    const obsB = observations.find((observation) => observation.id === selected[1]);
    if (!obsA || !obsB) return null;

    const mapA = new Map(obsA.attributeReadings.map((reading) => [String(reading.attribute), reading]));
    const mapB = new Map(obsB.attributeReadings.map((reading) => [String(reading.attribute), reading]));
    const allAttributes = new Set([...mapA.keys(), ...mapB.keys()]);

    const rows: {
      attr: string;
      valA: number | null;
      valB: number | null;
      delta: number | null;
    }[] = [];

    for (const attr of allAttributes) {
      const readingA = mapA.get(attr);
      const readingB = mapB.get(attr);
      rows.push({
        attr,
        valA: readingA?.perceivedValue ?? null,
        valB: readingB?.perceivedValue ?? null,
        delta: readingA && readingB ? readingB.perceivedValue - readingA.perceivedValue : null,
      });
    }

    rows.sort((left, right) => left.attr.localeCompare(right.attr));
    return { obsA, obsB, rows };
  }, [observations, selected]);

  const observationTrend = useMemo(
    () => (trendHistoryDepth ? buildObservationTrend(observations, trendHistoryDepth) : null),
    [observations, trendHistoryDepth],
  );

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
                className="h-6 px-2 text-[10px]"
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
          {observationTrend && observationTrend.seasons.length > 0 && (
            <div className="mb-3 rounded-md border border-sky-800/50 bg-sky-950/20 p-3" data-testid="performance-tracker-trend">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-300">Evidence trend</span>
                <span className="text-xs capitalize text-zinc-300">{observationTrend.direction}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {observationTrend.seasons.map((season) => (
                  <span key={season.season} className="rounded border border-zinc-700 bg-zinc-950/70 px-2 py-1 text-[10px] text-zinc-300">
                    S{season.season}: {season.averagePerceivedValue.toFixed(1)} {"\u00B7"} {season.averageConfidence}% confidence
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-zinc-400">{observationTrend.explanation}</p>
            </div>
          )}
          {observations.length === 0 ? (
            <p className="text-xs text-zinc-500">None yet.</p>
          ) : (
            <div className="space-y-2">
              {observations.slice(-5).reverse().map((observation) => {
                const isSelected = selected.includes(observation.id);
                return (
                  <div
                    key={observation.id}
                    className={`rounded-md border p-2 ${
                      compareMode
                        ? isSelected
                          ? "border-emerald-500 bg-emerald-500/5 cursor-pointer"
                          : "border-[#27272a] cursor-pointer hover:border-zinc-600"
                        : "border-[#27272a]"
                    }`}
                    onClick={compareMode ? () => toggleSelect(observation.id) : undefined}
                    role={compareMode ? "button" : undefined}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      {compareMode && (
                        <div
                          className={`mr-2 h-3.5 w-3.5 shrink-0 rounded-sm border ${
                            isSelected
                              ? "bg-emerald-500 border-emerald-500"
                              : "border-zinc-600"
                          }`}
                        />
                      )}
                      <span className="flex-1 text-xs capitalize text-zinc-400">
                        {formatAttribute(observation.context)}
                      </span>
                      <span className="text-xs text-zinc-500">
                        W{observation.week} S{observation.season}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      {observation.attributeReadings.length} attribute
                      {observation.attributeReadings.length !== 1 ? "s" : ""} read
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

      {comparison && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Comparison: W{comparison.obsA.week} vs W{comparison.obsB.week}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              <div className="mb-2 flex items-center text-[10px] text-zinc-500">
                <span className="w-24 shrink-0">Attribute</span>
                <span className="w-8 shrink-0 text-center">W{comparison.obsA.week}</span>
                <span className="w-8 shrink-0 text-center">W{comparison.obsB.week}</span>
                <span className="w-8 shrink-0 text-center">Chg</span>
              </div>
              {comparison.rows.map((row) => (
                <div key={row.attr} className="flex items-center text-xs">
                  <span className="w-24 shrink-0 truncate text-zinc-400 capitalize">
                    {formatAttribute(row.attr)}
                  </span>
                  <span className="w-8 shrink-0 text-center font-mono text-zinc-300">
                    {row.valA ?? "\u2014"}
                  </span>
                  <span className="w-8 shrink-0 text-center font-mono text-zinc-300">
                    {row.valB ?? "\u2014"}
                  </span>
                  <span className="flex w-8 shrink-0 items-center justify-center">
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
                      <span className="text-[10px] text-zinc-700">\u2014</span>
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
