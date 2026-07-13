"use client";

import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useMemo } from "react";
import { FileText, ArrowLeft, Eye, Star, ArrowUp, ArrowDown, Minus, MessageCircle, GraduationCap, Target, TrendingUp, TrendingDown, AlertTriangle, CalendarPlus, ClipboardList, Phone, Users, HeartPulse, Handshake, Flame, Snowflake, Send, RotateCcw, X, Globe, ChevronRight } from "lucide-react";
import type {
  AttributeReading,
  HiddenIntel,
  Observation,
  SystemFitResult,
  StatisticalProfile,
  AnomalyFlag,
  ScoutSkill,
  DisciplinaryRecord,
  InboxMessage,
  ReflectionFlaggedMomentRecord,
  ReflectionHypothesisRecord,
  ReflectionJournalEntry,
} from "@/engine/core/types";
import { ATTRIBUTE_DOMAINS } from "@/engine/core/types";
import { calculateConfidenceRange } from "@/engine/scout/perception";
import { StarRating, StarRatingRange } from "@/components/ui/StarRating";
import { getPerceivedAbility } from "@/engine/scout/perceivedAbility";
import { Tooltip } from "@/components/ui/tooltip";
import { PlayerAvatar } from "@/components/game/PlayerAvatar";
import { ClubCrest } from "@/components/game/ClubCrest";
import { ARCHETYPE_LABELS, ARCHETYPE_DESCRIPTIONS } from "@/engine/players/personalityEffects";
import { isTransferWindowOpen } from "@/engine/core/transferWindow";
import { ACTIVITY_SLOT_COSTS } from "@/engine/core/calendar";
import { canAddActivity } from "@/engine/core/calendar";
import { HelpTooltip, AttributeValueTooltip } from "@/components/ui/HelpTooltip";
import { getCountryDisplayName } from "@/engine/network/contacts";
import { formatObservationActivityLabel } from "@/engine/observation/reflection";
import { getHighestValueNextContext } from "@/engine/observation/informationGain";
import { getYouthRivalPressure, getYouthRivalPressureBand } from "@/engine/rivals";
import { getScoutHomeCountry } from "@/engine/world/travel";
import { getTransferFlowProbability } from "@/engine/world/transfers";
import { normalizeCountryKey } from "@/lib/country";
import {
  getResolvedContactIntel,
  getResolvedPlayerIds,
  resolvePlayerEntity,
} from "@/lib/playerResolution";
import { EvidenceBoard } from "@/components/game/evidence";
import { getSeasonLength } from "@/engine/core/gameDate";

// ---------------------------------------------------------------------------
// Form display helpers (A1 — Form Visibility)
// ---------------------------------------------------------------------------

interface FormDisplay {
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: "up" | "down" | "neutral";
}

const FORM_MAP: Record<number, FormDisplay> = {
  3:  { label: "Exceptional Form", color: "text-emerald-400", bgColor: "bg-emerald-500/15", borderColor: "border-emerald-500/40", icon: "up" },
  2:  { label: "Good Form",        color: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/30", icon: "up" },
  1:  { label: "Decent Form",      color: "text-emerald-300", bgColor: "bg-emerald-500/5",  borderColor: "border-emerald-500/20", icon: "up" },
  0:  { label: "Average Form",     color: "text-zinc-400",    bgColor: "bg-zinc-500/10",    borderColor: "border-zinc-500/20",    icon: "neutral" },
};
FORM_MAP[-1] = { label: "Below Average",  color: "text-red-300",  bgColor: "bg-red-500/5",  borderColor: "border-red-500/20",  icon: "down" };
FORM_MAP[-2] = { label: "Poor Form",      color: "text-red-400",  bgColor: "bg-red-500/10", borderColor: "border-red-500/30",  icon: "down" };
FORM_MAP[-3] = { label: "Terrible Form",  color: "text-red-400",  bgColor: "bg-red-500/15", borderColor: "border-red-500/40",  icon: "down" };

function getFormDisplay(form: number): FormDisplay {
  const clamped = Math.max(-3, Math.min(3, Math.round(form)));
  return FORM_MAP[clamped] ?? FORM_MAP[0];
}

function FormIndicator({ form }: { form: number }) {
  const display = getFormDisplay(form);
  const IconComponent =
    display.icon === "up" ? TrendingUp :
    display.icon === "down" ? TrendingDown :
    Minus;

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 ${display.bgColor} ${display.borderColor}`}
    >
      <IconComponent size={14} className={display.color} aria-hidden="true" />
      <span className={`text-xs font-medium ${display.color}`}>
        {display.label}
      </span>
    </div>
  );
}

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

/** Color the attribute bar by perceived value (1–20 scale). */
function attributeValueColor(midpoint: number): string {
  if (midpoint >= 16) return "bg-emerald-500";
  if (midpoint >= 12) return "bg-emerald-600/80";
  if (midpoint >= 8) return "bg-amber-500";
  if (midpoint >= 5) return "bg-orange-500";
  return "bg-red-500";
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.7) return "High";
  if (confidence >= 0.4) return "Medium";
  return "Low";
}

function compareSeasonWeekDesc(
  left: { season: number; week: number },
  right: { season: number; week: number },
): number {
  if (right.season !== left.season) return right.season - left.season;
  return right.week - left.week;
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

function formatSeasonWeekLabel(season: number, week: number): string {
  return `Season ${season}, Week ${week}`;
}

function formatMomentType(momentType: ReflectionFlaggedMomentRecord["momentType"]): string {
  return formatAttribute(momentType);
}

function isQualitativeIntelMessage(message: InboxMessage): boolean {
  const title = message.title.toLowerCase();
  const body = message.body.toLowerCase();
  if (title.startsWith("network intel:")) return true;
  if (title.startsWith("exclusive tip")) return true;
  if (title.startsWith("gossip from")) return true;

  return [
    "coach",
    "parent",
    "family",
    "contact",
    "intel",
    "tip",
    "gossip",
  ].some((token) => title.includes(token) || body.includes(token));
}

function getHypothesisStateDisplay(state: ReflectionHypothesisRecord["state"]): {
  label: string;
  className: string;
} {
  switch (state) {
    case "confirmed":
      return {
        label: "Confirmed",
        className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
      };
    case "supported":
      return {
        label: "Supported",
        className: "border-sky-500/40 bg-sky-500/10 text-sky-300",
      };
    case "contradicted":
      return {
        label: "Contradicted",
        className: "border-amber-500/40 bg-amber-500/10 text-amber-300",
      };
    case "debunked":
      return {
        label: "Debunked",
        className: "border-red-500/40 bg-red-500/10 text-red-300",
      };
    default:
      return {
        label: "Open",
        className: "border-zinc-600 bg-zinc-800/70 text-zinc-300",
      };
  }
}

function getFlaggedReactionDisplay(reaction: ReflectionFlaggedMomentRecord["reaction"]): {
  label: string;
  className: string;
} {
  switch (reaction) {
    case "promising":
      return {
        label: "Promising",
        className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
      };
    case "concerning":
      return {
        label: "Concern",
        className: "border-red-500/30 bg-red-500/10 text-red-300",
      };
    case "interesting":
      return {
        label: "Interesting",
        className: "border-sky-500/30 bg-sky-500/10 text-sky-300",
      };
    default:
      return {
        label: "Watch",
        className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      };
  }
}

function ReliabilityDots({ reliability }: { reliability: number }) {
  const total = 5;
  const filled = Math.round(reliability * total);
  return (
    <div className="flex items-center gap-0.5" role="img" aria-label={`Reliability: ${filled} out of ${total}`}>
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

interface PlayerEvidenceEntry
  extends Omit<ReflectionJournalEntry, "flaggedMoments" | "hypotheses"> {
  flaggedMoments: ReflectionFlaggedMomentRecord[];
  hypotheses: ReflectionHypothesisRecord[];
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
            {/* Role fit */}
            <div>
              <div className="mb-0.5 flex items-center justify-between text-xs">
                <span className="text-zinc-500">Role</span>
                <span className={`font-mono font-semibold ${fitTextColor(fit.roleFit)}`}>{fit.roleFit}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#27272a]">
                <div className={`h-full rounded-full transition-all ${fitColor(fit.roleFit)}`} style={{ width: `${fit.roleFit}%` }} />
              </div>
            </div>
            {/* Tactical fit */}
            <div>
              <div className="mb-0.5 flex items-center justify-between text-xs">
                <span className="text-zinc-500">Tactical</span>
                <span className={`font-mono font-semibold ${fitTextColor(fit.tacticalFit)}`}>{fit.tacticalFit}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#27272a]">
                <div className={`h-full rounded-full transition-all ${fitColor(fit.tacticalFit)}`} style={{ width: `${fit.tacticalFit}%` }} />
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

        {/* Suggested role */}
        {fit.suggestedRole && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Suggested Role</span>
            <span className="rounded bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-400">
              {fit.suggestedRole.replace(/([A-Z])/g, " $1").trim()}
            </span>
          </div>
        )}

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

// ─── Form & Performance Card ────────────────────────────────────────────────

function formLabel(form: number): { text: string; color: string; arrow: string } {
  if (form >= 2) return { text: "Excellent", color: "text-emerald-400", arrow: "↑" };
  if (form === 1) return { text: "Good", color: "text-emerald-500", arrow: "↗" };
  if (form === 0) return { text: "Average", color: "text-zinc-400", arrow: "→" };
  if (form === -1) return { text: "Poor", color: "text-orange-400", arrow: "↘" };
  return { text: "Bad", color: "text-red-400", arrow: "↓" };
}

function ratingBarColor(rating: number): string {
  if (rating >= 8.0) return "bg-emerald-500";
  if (rating >= 7.0) return "bg-emerald-600/80";
  if (rating >= 6.0) return "bg-amber-500";
  if (rating >= 5.0) return "bg-orange-500";
  return "bg-red-500";
}

// ---------------------------------------------------------------------------
// Injury Status & History Card
// ---------------------------------------------------------------------------

const INJURY_TYPE_LABELS: Record<string, string> = {
  muscle: "Muscle",
  ligament: "Ligament",
  fracture: "Fracture",
  concussion: "Concussion",
  knock: "Knock",
  fatigue: "Fatigue",
};

const SEVERITY_COLORS: Record<string, string> = {
  minor: "text-amber-400",
  moderate: "text-orange-400",
  serious: "text-red-400",
  "career-threatening": "text-red-600",
};

function InjuryStatusCard({ player }: { player: import("@/engine/core/types").Player }) {
  const currentInjury = player.currentInjury;
  const history = player.injuryHistory;
  const injuries = history?.injuries ?? [];
  const totalWeeksMissed = history?.totalWeeksMissed ?? 0;
  const proneness = history?.injuryProneness ?? 0;
  const reinjuryWindow = history?.reinjuryWindowWeeksLeft ?? 0;

  // Only show card if player has injury data worth showing
  if (!currentInjury && injuries.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <HeartPulse size={14} className={currentInjury ? "text-red-500" : "text-zinc-500"} />
          Injury Status
          {proneness >= 0.15 && (
            <Badge variant="destructive" className="ml-auto text-[10px]">
              Injury Prone
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Current injury */}
        {currentInjury && (
          <div className="rounded-md border border-red-500/20 bg-red-500/5 p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-red-400">Currently Injured</span>
              <Badge variant="outline" className="text-[10px]">
                {currentInjury.weeksRemaining}w remaining
              </Badge>
            </div>
            <p className="text-xs text-zinc-300">
              {INJURY_TYPE_LABELS[currentInjury.type] ?? currentInjury.type} —{" "}
              <span className={SEVERITY_COLORS[currentInjury.severity] ?? "text-zinc-400"}>
                {currentInjury.severity}
              </span>
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-red-500 transition-all"
                style={{
                  width: `${((currentInjury.recoveryWeeks - currentInjury.weeksRemaining) / Math.max(1, currentInjury.recoveryWeeks)) * 100}%`,
                }}
              />
            </div>
            <p className="mt-1 text-[10px] text-zinc-500">
              Recovery: {currentInjury.recoveryWeeks - currentInjury.weeksRemaining}/{currentInjury.recoveryWeeks} weeks
            </p>
          </div>
        )}

        {/* Reinjury risk warning */}
        {!currentInjury && reinjuryWindow > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 p-2">
            <AlertTriangle size={12} className="text-amber-400 shrink-0" />
            <p className="text-[10px] text-amber-300">
              Elevated reinjury risk — {reinjuryWindow} week{reinjuryWindow !== 1 ? "s" : ""} remaining
            </p>
          </div>
        )}

        {/* Summary stats */}
        {injuries.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] text-zinc-500">Total Injuries</p>
              <p className="text-sm font-semibold text-white">{injuries.length}</p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500">Weeks Missed</p>
              <p className="text-sm font-semibold text-white">{totalWeeksMissed}</p>
            </div>
          </div>
        )}

        {/* Injury history timeline (last 5) */}
        {injuries.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              History
            </p>
            <div className="space-y-1.5">
              {injuries.slice(-5).reverse().map((inj) => (
                <div
                  key={inj.id}
                  className="flex items-center justify-between rounded border border-[#27272a] bg-[#141414] px-2 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-medium ${SEVERITY_COLORS[inj.severity] ?? "text-zinc-400"}`}>
                      {INJURY_TYPE_LABELS[inj.type] ?? inj.type}
                    </span>
                    <span className="text-[10px] text-zinc-500">
                      {inj.recoveryWeeks}w
                    </span>
                  </div>
                  <span className="text-[10px] text-zinc-600">
                    S{inj.occurredSeason} W{inj.occurredWeek}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FormPerformanceCard({ player }: { player: import("@/engine/core/types").Player }) {
  const recentRatings = player.recentMatchRatings ?? [];
  const seasonRatings = player.seasonRatings ?? [];
  const form = formLabel(player.form);

  // Calculate season average from recent ratings
  const avgRating = recentRatings.length > 0
    ? (recentRatings.reduce((s, r) => s + r.rating, 0) / recentRatings.length).toFixed(1)
    : null;

  if (recentRatings.length === 0 && seasonRatings.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <TrendingUp size={14} className="text-zinc-500" />
            Form & Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-zinc-500">No match data available yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <TrendingUp size={14} className="text-emerald-500" />
          Form & Performance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Current form indicator */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-400">Current Form</span>
          <span className={`text-sm font-semibold ${form.color}`}>
            {form.arrow} {form.text}
          </span>
        </div>

        {/* Season average */}
        {avgRating && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400">Recent Average</span>
            <span className="text-sm font-bold text-white">{avgRating}</span>
          </div>
        )}

        {/* Last 6 match ratings as mini bars */}
        {recentRatings.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              Recent Matches
            </p>
            <div className="flex items-end gap-1 h-10">
              {recentRatings.map((entry, i) => {
                const heightPct = ((entry.rating - 1) / 9) * 100;
                return (
                  <div
                    key={entry.fixtureId + i}
                    className="flex-1 flex flex-col items-center justify-end h-full"
                    title={`Week ${entry.week}: ${entry.rating.toFixed(1)}`}
                  >
                    <div
                      className={`w-full rounded-sm ${ratingBarColor(entry.rating)}`}
                      style={{ height: `${Math.max(8, heightPct)}%` }}
                    />
                    <span className="text-[9px] text-zinc-600 mt-0.5 font-mono">
                      {entry.rating.toFixed(1)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Season history table */}
        {seasonRatings.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              Season History
            </p>
            <div className="text-[10px]">
              <div className="grid grid-cols-6 gap-1 text-zinc-600 font-medium mb-1">
                <span>Season</span>
                <span className="text-right">Avg</span>
                <span className="text-right">Apps</span>
                <span className="text-right">Goals</span>
                <span className="text-right">Ast</span>
                <span className="text-right">CS</span>
              </div>
              {seasonRatings.map((sr) => (
                <div key={sr.season} className="grid grid-cols-6 gap-1 text-zinc-300">
                  <span>{sr.season}</span>
                  <span className="text-right font-bold">{sr.avgRating.toFixed(1)}</span>
                  <span className="text-right">{sr.appearances}</span>
                  <span className="text-right">{sr.goals}</span>
                  <span className="text-right">{sr.assists}</span>
                  <span className="text-right">{sr.cleanSheets > 0 ? sr.cleanSheets : "-"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Disciplinary Card Component ----

function DisciplinaryCard({ record, gameState }: { record: DisciplinaryRecord | undefined; gameState: { currentSeason: number } }) {
  const yellows = record?.yellowCards ?? 0;
  const reds = record?.redCards ?? 0;
  const suspWeeks = record?.suspensionWeeksRemaining ?? 0;
  const season = record?.season ?? gameState.currentSeason;

  // Warning thresholds
  const nearFiveYellow = yellows >= 3 && yellows < 5;
  const nearTenYellow = yellows >= 8 && yellows < 10;

  if (yellows === 0 && reds === 0 && suspWeeks === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <AlertTriangle size={14} className="text-zinc-500" aria-hidden="true" />
            Discipline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-zinc-500">Clean record this season.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <AlertTriangle size={14} className={suspWeeks > 0 ? "text-red-500" : "text-amber-500"} aria-hidden="true" />
          Discipline
          {suspWeeks > 0 && (
            <Badge variant="destructive" className="text-[10px] ml-auto">
              SUSPENDED ({suspWeeks} match{suspWeeks > 1 ? "es" : ""})
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Season stats */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-2 rounded-sm bg-amber-400" title="Yellow cards" />
            <span className="text-xs text-zinc-400">
              Yellows: <span className="font-semibold text-white">{yellows}</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-3 w-2 rounded-sm bg-red-500" title="Red cards" />
            <span className="text-xs text-zinc-400">
              Reds: <span className="font-semibold text-white">{reds}</span>
            </span>
          </div>
          <span className="text-[10px] text-zinc-600 ml-auto">Season {season}</span>
        </div>

        {/* Suspension warning */}
        {nearFiveYellow && (
          <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5">
            <p className="text-[10px] text-amber-300">
              Warning: {yellows}/5 yellows &mdash; {5 - yellows} more yellow card{5 - yellows > 1 ? "s" : ""} triggers a 1-match ban.
            </p>
          </div>
        )}
        {nearTenYellow && (
          <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5">
            <p className="text-[10px] text-amber-300">
              Warning: {yellows}/10 yellows &mdash; {10 - yellows} more yellow card{10 - yellows > 1 ? "s" : ""} triggers a 2-match ban.
            </p>
          </div>
        )}

        {/* Recent card history (last 5) */}
        {record && record.cardHistory.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              Recent Cards
            </p>
            <div className="space-y-1">
              {record.cardHistory.slice(-5).reverse().map((card, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px]">
                  <div
                    className={`h-2.5 w-1.5 rounded-sm ${
                      card.type === "red" ? "bg-red-500" : "bg-amber-400"
                    }`}
                  />
                  <span className="text-zinc-400">
                    {card.minute}&apos; &mdash; {card.reason.replace(/([A-Z])/g, " $1").toLowerCase().trim()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
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
    setPendingFixtureClubFilter,
    setPendingCalendarActivity,
    setPendingInternationalCountry,
    tapNetworkForPlayer,
    initiateTransferNegotiation,
    recommendPlayerForLoan,
    recallLoanPlayer,
    scheduleActivity,
  } = useGameStore();

  const [networkIntel, setNetworkIntel] = useState<{ title: string; body: string; contactName?: string } | null>(null);
  const [loanDialogOpen, setLoanDialogOpen] = useState(false);
  const [loanTargetClubId, setLoanTargetClubId] = useState("");
  const [loanRationale, setLoanRationale] = useState<
    "development" | "playing-time" | "experience" | "squad-depth"
  >("development");
  const [loanDuration, setLoanDuration] = useState(20);

  if (!gameState || !selectedPlayerId) return null;
  const seasonLength = getSeasonLength(
    gameState.fixtures,
    gameState.currentSeason,
  );

  const resolvedPlayer = resolvePlayerEntity(gameState, selectedPlayerId);
  if (!resolvedPlayer) return null;

  const player = resolvedPlayer.player;
  const isRetired = resolvedPlayer.isRetired;
  const canonicalPlayerId = resolvedPlayer.playerId;
  const unsignedYouthRecord = resolvedPlayer.unsignedYouth;
  const relatedPlayerIds = new Set(
    getResolvedPlayerIds(gameState, selectedPlayerId),
  );

  const club = getClub(player.clubId);
  const league = club ? getLeague(club.leagueId) : undefined;
  const observations = getPlayerObservations(canonicalPlayerId);
  const reports = getPlayerReports(canonicalPlayerId);

  // Own-club check: signed players at scout's club show exact values
  const isOwnClubPlayer = !!(player.clubId && player.clubId === gameState.scout.currentClubId);
  const transferWindowOpen = gameState.transferWindow
    ? isTransferWindowOpen([gameState.transferWindow], gameState.currentWeek)
    : false;
  const ownerClubId = player.contractClubId ?? player.loanParentClubId ?? player.clubId;
  const ownerLeagueId = gameState.clubs[ownerClubId]?.leagueId;
  const ownerCountry = normalizeCountryKey(
    ownerLeagueId ? gameState.leagues[ownerLeagueId]?.country : undefined,
  );
  const loanRouteScore = (clubId: string) => {
    const candidateLeagueId = gameState.clubs[clubId]?.leagueId;
    const candidateCountry = normalizeCountryKey(
      candidateLeagueId ? gameState.leagues[candidateLeagueId]?.country : undefined,
    );
    if (!ownerCountry || !candidateCountry) return 0.5;
    return getTransferFlowProbability(ownerCountry, candidateCountry);
  };
  const isForeignLoanClub = (clubId: string) => {
    const candidateLeagueId = gameState.clubs[clubId]?.leagueId;
    const candidateCountry = normalizeCountryKey(
      candidateLeagueId ? gameState.leagues[candidateLeagueId]?.country : undefined,
    );
    return !!ownerCountry && !!candidateCountry && ownerCountry !== candidateCountry;
  };
  const loanTargetClubs = Object.values(gameState.clubs)
    .filter((candidate) => {
      if (candidate.id === ownerClubId) return false;
      const owner = gameState.clubs[ownerClubId];
      if (!owner) return false;
      const reputationGap = owner.reputation - candidate.reputation;
      if (reputationGap < -10 || reputationGap > 45) return false;
      if (isForeignLoanClub(candidate.id)) {
        if (player.age < 18) return false;
        if (loanRouteScore(candidate.id) < 0.05) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const positionCount = (clubId: string) => gameState.clubs[clubId].playerIds.reduce(
        (count, playerId) => gameState.players[playerId]?.position === player.position ? count + 1 : count,
        0,
      );
      return (
        Number(isForeignLoanClub(a.id)) - Number(isForeignLoanClub(b.id)) ||
        positionCount(a.id) - positionCount(b.id) ||
        loanRouteScore(b.id) - loanRouteScore(a.id) ||
        b.youthAcademyRating - a.youthAcademyRating
      );
    })
    .slice(0, 20);
  const pendingLoanRecommendation = (gameState.loanRecommendations ?? []).some(
    (recommendation) =>
      recommendation.playerId === player.id &&
      (recommendation.status ?? "pending") === "pending",
  );
  const movementHistory = (gameState.playerMovementHistory ?? [])
    .filter((event) => event.playerId === player.id)
    .sort((a, b) => b.season - a.season || b.week - a.week);

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
  const perceived = getPerceivedAbility(allObs, canonicalPlayerId);

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

  const contactIntel: HiddenIntel[] = getResolvedContactIntel(gameState, canonicalPlayerId);
  const npcEvidenceReports = Object.values(gameState.npcReports ?? {})
    .filter((report) => relatedPlayerIds.has(report.playerId));
  const dossierEntries: PlayerEvidenceEntry[] = Object.values(
    gameState.reflectionJournal ?? {},
  )
    .filter((entry) => {
      const hasPlayerLink = entry.playerIds.some((id) => relatedPlayerIds.has(id));
      const hasHypothesis = entry.hypotheses.some((hypothesis) =>
        relatedPlayerIds.has(hypothesis.playerId),
      );
      const hasFlaggedMoment = (entry.flaggedMoments ?? []).some((moment) =>
        relatedPlayerIds.has(moment.playerId),
      );
      return hasPlayerLink || hasHypothesis || hasFlaggedMoment;
    })
    .map((entry) => ({
      ...entry,
      hypotheses: entry.hypotheses.filter((hypothesis) =>
        relatedPlayerIds.has(hypothesis.playerId),
      ),
      flaggedMoments: (entry.flaggedMoments ?? []).filter((moment) =>
        relatedPlayerIds.has(moment.playerId),
      ),
    }))
    .filter(
      (entry) =>
        entry.hypotheses.length > 0 ||
        entry.flaggedMoments.length > 0 ||
        entry.notes.length > 0 ||
        !!entry.summary,
    )
    .sort((left, right) => {
      const seasonWeekDelta = compareSeasonWeekDesc(left, right);
      if (seasonWeekDelta !== 0) return seasonWeekDelta;
      return right.createdAt - left.createdAt;
    });
  const dossierInboxIntel = gameState.inbox
    .filter(
      (message) =>
        !!message.relatedId &&
        relatedPlayerIds.has(message.relatedId) &&
        isQualitativeIntelMessage(message),
    )
    .sort(compareSeasonWeekDesc);
  const scoutHomeCountry = getScoutHomeCountry(gameState.scout);
  const foreignYouthCountry = unsignedYouthRecord && unsignedYouthRecord.country !== scoutHomeCountry
    ? unsignedYouthRecord.country
    : null;

  // Specialization-specific data
  const specialization = gameState.scout.primarySpecialization;
  const clubId = gameState.scout.currentClubId ?? "";
  const fitCacheKey = `${canonicalPlayerId}:${clubId}`;
  const systemFit = specialization === "firstTeam"
    ? (gameState.systemFitCache[fitCacheKey] ?? undefined)
    : undefined;
  const statisticalProfile = specialization === "data"
    ? (gameState.statisticalProfiles[canonicalPlayerId] ?? undefined)
    : undefined;
  const playerAnomalies = specialization === "data"
    ? gameState.anomalyFlags.filter((f) => f.playerId === canonicalPlayerId)
    : [];

  const convictionVariant = (c: string) => {
    if (c === "tablePound") return "default" as const;
    if (c === "strongRecommend") return "success" as const;
    if (c === "recommend") return "secondary" as const;
    return "outline" as const;
  };

  const watchlisted = gameState.watchlist.includes(canonicalPlayerId);
  const latestReport = [...reports].sort((left, right) => {
    if ((right.submittedSeason ?? 0) !== (left.submittedSeason ?? 0)) {
      return (right.submittedSeason ?? 0) - (left.submittedSeason ?? 0);
    }
    return (right.submittedWeek ?? 0) - (left.submittedWeek ?? 0);
  })[0];
  const relevantBriefs = unsignedYouthRecord
    ? Object.values(gameState.youthRecruitmentBriefs)
        .filter((brief) =>
          brief.status === "open"
          && player.age <= brief.maxAge
          && (
            brief.requiredPositions.includes(player.position)
            || player.secondaryPositions.some((position) => brief.requiredPositions.includes(position))
          )
        )
        .sort((left, right) => right.competitionPressure - left.competitionPressure)
    : [];
  const latestHypotheses = (() => {
    const byId = new Map<string, ReflectionHypothesisRecord>();
    [...dossierEntries].reverse().forEach((entry) => entry.hypotheses.forEach((hypothesis) => {
      byId.set(hypothesis.id, hypothesis);
    }));
    return [...byId.values()];
  })();
  const nextObservationContext = unsignedYouthRecord && !unsignedYouthRecord.placed
    ? getHighestValueNextContext({
        observations,
        playerId: canonicalPlayerId,
        candidateContexts: [
          "schoolMatch",
          "grassrootsTournament",
          "academyTrialDay",
          "followUpSession",
          "parentCoachMeeting",
          "trainingGround",
        ],
        targetDomains: latestHypotheses
          .filter((hypothesis) => hypothesis.state !== "confirmed" && hypothesis.state !== "debunked")
          .map((hypothesis) => hypothesis.domain),
      })
    : null;
  const trackingYouthRivals = unsignedYouthRecord
    ? Object.values(gameState.rivalScouts)
        .filter((rival) =>
          rival.specialization === "youth"
          && rival.targetPlayerIds.includes(canonicalPlayerId)
        )
        .map((rival) => {
          const pressure = getYouthRivalPressure(rival, unsignedYouthRecord);
          return { rival, pressure, band: getYouthRivalPressureBand(pressure) };
        })
        .sort((left, right) => right.pressure - left.pressure)
    : [];
  const unansweredAttributes = Array.from(byDomain.values()).flatMap((domainAttrs) =>
    domainAttrs
      .filter(([, reading]) => !reading)
      .map(([attr]) => formatAttribute(attr)),
  );
  const evidenceSignals =
    observations.length + dossierEntries.length + dossierInboxIntel.length + contactIntel.length;
  const nextDecision =
    observations.length === 0
      ? "Get a live view before you commit."
      : reports.length === 0
      ? "Turn the read into a report."
      : foreignYouthCountry && !unsignedYouthRecord?.placed
      ? `Travel to ${getCountryDisplayName(foreignYouthCountry)} before escalating.`
      : unsignedYouthRecord && !unsignedYouthRecord.placed
      ? "Decide if this prospect is ready for placement."
      : "Choose the most useful follow-up.";
  const nextDecisionReason =
    observations.length === 0
      ? "You still need first-hand evidence."
      : reports.length === 0
      ? `${observations.length} observation${observations.length === 1 ? "" : "s"} are ready to be formalized.`
      : unsignedYouthRecord && !unsignedYouthRecord.placed
      ? "Placement is the next professional call in this youth dossier."
      : unansweredAttributes.length > 0
      ? `${unansweredAttributes.length} attribute${unansweredAttributes.length === 1 ? "" : "s"} still need clarity.`
      : "The dossier is broad enough to decide whether to press or pause.";
  const identityLabel = unsignedYouthRecord
    ? unsignedYouthRecord.placed
      ? "Placed youth prospect"
      : "Unsigned youth prospect"
    : isRetired
    ? "Archived player profile"
    : "Active player dossier";

  return (
    <GameLayout>
      <div className="p-4 sm:p-6 lg:p-8 [&_.text-zinc-500]:text-zinc-400 [&_.text-zinc-600]:text-zinc-400">
        {/* Back button */}
        <button
          onClick={() => setScreen(specialization === "youth" ? "youthScouting" : "playerDatabase")}
          className="mb-4 flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-zinc-300 transition hover:bg-white/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
          aria-label={specialization === "youth" ? "Back to prospects" : "Back to player database"}
        >
          <ArrowLeft size={15} aria-hidden="true" />
          {specialization === "youth" ? "Back to Prospects" : "Back to Players"}
        </button>

        {/* Header */}
        <div className="mb-5 flex flex-col gap-5 rounded-2xl border border-white/10 bg-[#10151b]/95 p-5 shadow-xl shadow-black/20 xl:flex-row xl:items-start xl:justify-between sm:p-6">
          <div className="flex flex-col items-start gap-4 sm:flex-row">
            <PlayerAvatar
              playerId={player.id}
              nationality={player.nationality}
              size={96}
            />
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
                {identityLabel}
              </p>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                  {player.firstName} {player.lastName}
                </h1>
                <button
                  onClick={() => toggleWatchlist(canonicalPlayerId)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                  aria-label={gameState.watchlist.includes(canonicalPlayerId) ? "Remove from watchlist" : "Add to watchlist"}
                >
                  <Star
                    size={18}
                    className={
                      gameState.watchlist.includes(canonicalPlayerId)
                        ? "text-amber-400 fill-amber-400"
                        : "text-zinc-600"
                    }
                  />
                </button>
              </div>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">{player.position}</Badge>
                {player.injured && player.currentInjury && (
                  <Badge variant="destructive" className="text-[10px]">
                    <HeartPulse size={10} className="mr-1" />
                    Injured — {player.currentInjury.weeksRemaining}w
                  </Badge>
                )}
                {!player.injured && player.injured === false && (player.injuryHistory?.reinjuryWindowWeeksLeft ?? 0) > 0 && (
                  <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-400 text-[10px]">
                    Reinjury Risk
                  </Badge>
                )}
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
                {player.onLoan && player.loanParentClubId && (
                  <Badge className="border-sky-500/40 bg-sky-500/10 text-sky-400">
                    On Loan{getClub(player.loanParentClubId) ? ` from ${getClub(player.loanParentClubId)!.name}` : ""}
                  </Badge>
                )}
                <FormIndicator form={player.form} />
                {/* Form momentum badge */}
                {player.formTrend === "rising" && (player.formMomentum ?? 0) > 0 && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400"
                    title={`${(player.formMomentum ?? 0) + 3} consecutive strong performances`}
                  >
                    <Flame size={12} />
                    Hot Streak ({(player.formMomentum ?? 0) + 3} matches)
                  </span>
                )}
                {player.formTrend === "falling" && (player.formMomentum ?? 0) > 0 && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-400"
                    title={`${(player.formMomentum ?? 0) + 3} consecutive poor performances`}
                  >
                    <Snowflake size={12} />
                    Cold Streak ({(player.formMomentum ?? 0) + 3} matches)
                  </span>
                )}
              </div>
            </div>
        </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap xl:max-w-xl xl:justify-end [&>button]:min-h-11 [&>button]:w-full sm:[&>button]:w-auto">
            <Button onClick={() => startReport(canonicalPlayerId)} disabled={isRetired || observations.length === 0}>
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
              onClick={() => {
                const result = tapNetworkForPlayer(canonicalPlayerId);
                if (result) setNetworkIntel(result);
              }}
              disabled={Object.keys(gameState.contacts).length === 0}
            >
              <Phone size={14} className="mr-2" />
              Tap Network
            </Button>
            {/* Negotiate Transfer — first-team scouts with a club can negotiate */}
            {gameState.scout.primarySpecialization === "firstTeam" &&
             gameState.scout.currentClubId &&
             Boolean(player.contractClubId ?? player.clubId) &&
             player.clubId !== gameState.scout.currentClubId &&
             !player.onLoan &&
             !unsignedYouthRecord &&
             !isRetired &&
             transferWindowOpen &&
             !(gameState.activeNegotiations ?? []).some(
               (n) => n.playerId === canonicalPlayerId && n.phase !== "completed" && n.phase !== "collapsed"
             ) && (
              <Button
                variant="outline"
                onClick={() => initiateTransferNegotiation(canonicalPlayerId)}
              >
                <Handshake size={14} className="mr-2" />
                Negotiate Transfer
              </Button>
            )}
            {/* Recommend for Loan — own-club players not on loan, age < 26 */}
            {!isRetired && transferWindowOpen && isOwnClubPlayer && !player.onLoan &&
              player.age < 26 && loanTargetClubs.length > 0 && (
              <Button
                variant="outline"
                disabled={pendingLoanRecommendation}
                onClick={() => {
                  setLoanTargetClubId(loanTargetClubs[0].id);
                  setLoanDuration(Math.round(seasonLength / 2));
                  setLoanDialogOpen(true);
                }}
                title={pendingLoanRecommendation ? "A loan recommendation is awaiting a response" : "Choose a development loan destination"}
              >
                <Send size={14} className="mr-2" />
                {pendingLoanRecommendation ? "Recommendation Pending" : "Recommend for Loan"}
              </Button>
            )}
            {foreignYouthCountry && !unsignedYouthRecord?.placed && (
              <Button
                variant="outline"
                onClick={() => {
                  setPendingInternationalCountry(foreignYouthCountry);
                  setScreen("internationalView");
                }}
              >
                <Globe size={14} className="mr-2" />
                Scout in {getCountryDisplayName(foreignYouthCountry)}
              </Button>
            )}
            {/* Youth-specific quick actions */}
            {unsignedYouthRecord && observations.length > 0 && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    const activity = {
                      type: "followUpSession" as const,
                      slots: ACTIVITY_SLOT_COSTS.followUpSession,
                      targetId: player.id,
                      description: `Follow-up session: ${player.firstName} ${player.lastName}`,
                    };
                    // Find first available day slot
                    let scheduled = false;
                    for (let day = 0; day <= 7 - activity.slots; day++) {
                      if (canAddActivity(gameState.schedule, activity, day)) {
                        scheduleActivity(activity, day);
                        scheduled = true;
                        break;
                      }
                    }
                    if (scheduled) {
                      setPendingCalendarActivity({
                        type: "followUpSession",
                        targetId: player.id,
                        label: `Follow-Up: ${player.firstName} ${player.lastName}`,
                      });
                      setScreen("calendar");
                    } else {
                      window.alert("No free day slot available this week. Clear a day on the calendar first.");
                    }
                  }}
                >
                  <CalendarPlus size={14} className="mr-2" />
                  Schedule Follow-Up
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const activity = {
                      type: "parentCoachMeeting" as const,
                      slots: ACTIVITY_SLOT_COSTS.parentCoachMeeting,
                      targetId: player.id,
                      description: `Parent/Coach meeting: ${player.firstName} ${player.lastName}`,
                    };
                    let scheduled = false;
                    for (let day = 0; day <= 7 - activity.slots; day++) {
                      if (canAddActivity(gameState.schedule, activity, day)) {
                        scheduleActivity(activity, day);
                        scheduled = true;
                        break;
                      }
                    }
                    if (scheduled) {
                      setPendingCalendarActivity({
                        type: "parentCoachMeeting",
                        targetId: player.id,
                        label: `Meeting: ${player.firstName} ${player.lastName}`,
                      });
                      setScreen("calendar");
                    } else {
                      window.alert("No free day slot available this week. Clear a day on the calendar first.");
                    }
                  }}
                >
                  <Users size={14} className="mr-2" />
                  Meet Parents/Coach
                </Button>
              </>
            )}
          </div>
        </div>

        <Card className="mb-5 overflow-hidden border-emerald-400/20 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.1),transparent_42%),rgba(17,22,28,0.96)]">
          <CardContent className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Next scouting decision</p>
              <h2 className="mt-2 text-xl font-bold text-white sm:text-2xl">{nextDecision}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-300">{nextDecisionReason}</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-zinc-300">
                  {observations.length} live view{observations.length === 1 ? "" : "s"}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-zinc-300">
                  {evidenceSignals} evidence signal{evidenceSignals === 1 ? "" : "s"}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-zinc-300">
                  {reports.length} filed report{reports.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>
            <Button
              className="min-h-11 w-full lg:w-auto"
              onClick={() => {
                if (observations.length > 0 && reports.length === 0) {
                  startReport(canonicalPlayerId);
                  return;
                }
                setScreen("calendar");
              }}
            >
              {observations.length === 0
                ? "Plan first observation"
                : reports.length === 0
                  ? "Write the report"
                  : "Plan next action"}
              <ChevronRight size={16} className="ml-2" aria-hidden="true" />
            </Button>
          </CardContent>
        </Card>

        {unsignedYouthRecord && !unsignedYouthRecord.placed && (
          <section className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]" aria-label="Academy case evidence">
            <Card className="border-sky-400/20 bg-[#111820]/95">
              <CardHeader className="p-5 pb-3">
                <CardTitle className="flex items-center gap-2 text-base text-white">
                  <ClipboardList size={17} className="text-sky-300" aria-hidden="true" />
                  Brief fit and opportunity cost
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 p-5 pt-1">
                {relevantBriefs.length === 0 ? (
                  <p className="text-sm leading-6 text-zinc-400">No open academy brief currently matches this player&apos;s position and age. A speculative report can still preserve the judgment, but it has no immediate club need behind it.</p>
                ) : relevantBriefs.slice(0, 2).map((brief) => (
                  <div key={brief.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-300">{gameState.clubs[brief.clubId]?.name ?? "Academy client"}</p>
                        <p className="mt-1 font-semibold text-white">{brief.requiredPositions.join("/")} · {brief.preferredRole ? formatAttribute(brief.preferredRole) : "Open role"}</p>
                      </div>
                      <Badge variant={brief.competitionPressure >= 70 ? "warning" : "outline"} className="text-[10px]">
                        {brief.competitionPressure}/100 pressure
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-zinc-300">
                      <span className="rounded-full border border-white/10 px-2 py-1">Due S{brief.expiresSeason} W{brief.expiresWeek}</span>
                      <span className="rounded-full border border-white/10 px-2 py-1">£{brief.weeklyWageBudget.toLocaleString()}/wk</span>
                      <span className="rounded-full border border-white/10 px-2 py-1 capitalize">{brief.riskTolerance} risk</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-violet-400/20 bg-[#15131d]/95">
              <CardHeader className="p-5 pb-3">
                <CardTitle className="flex items-center gap-2 text-base text-white">
                  <Target size={17} className="text-violet-300" aria-hidden="true" />
                  Highest-value next evidence
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 pt-1">
                {nextObservationContext ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-lg font-bold text-white">{formatAttribute(nextObservationContext.context)}</p>
                        <p className="mt-1 text-xs text-zinc-400">{nextObservationContext.sourceFamily} evidence family</p>
                      </div>
                      <Badge variant={nextObservationContext.gainBand === "high" ? "success" : nextObservationContext.gainBand === "medium" ? "warning" : "outline"}>
                        Gain {nextObservationContext.score}/100
                      </Badge>
                    </div>
                    <ul className="mt-4 space-y-2 text-xs leading-5 text-zinc-300">
                      {nextObservationContext.reasons.slice(0, 3).map((reason) => (
                        <li key={reason} className="flex gap-2"><span className="text-violet-300">•</span><span>{reason}</span></li>
                      ))}
                    </ul>
                    <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-zinc-400">
                      <span>{latestHypotheses.length} preserved hypothes{latestHypotheses.length === 1 ? "is" : "es"}</span>
                      <span>·</span>
                      <span>{nextObservationContext.sameContextIndependentSources} prior independent source{nextObservationContext.sameContextIndependentSources === 1 ? "" : "s"} in this context</span>
                    </div>
                    <Button className="mt-4 min-h-11 w-full" variant="outline" onClick={() => setScreen("calendar")}>Plan this evidence</Button>
                  </>
                ) : (
                  <p className="text-sm text-zinc-400">No further youth evidence is currently required.</p>
                )}
              </CardContent>
            </Card>
            {trackingYouthRivals.length > 0 && (
              <Card className="border-red-400/20 bg-red-400/[0.05] lg:col-span-2">
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-red-300">Contested prospect</p>
                      <h3 className="mt-1 text-base font-bold text-white">Other scouts are building their own case</h3>
                    </div>
                    <Badge variant="destructive">{trackingYouthRivals.length} rival{trackingYouthRivals.length === 1 ? "" : "s"}</Badge>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {trackingYouthRivals.slice(0, 4).map(({ rival, pressure, band }) => (
                      <div key={rival.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-white">{rival.name}</p>
                          <Badge variant={band === "imminent" ? "destructive" : band === "contested" ? "warning" : "outline"} className="text-[10px]">{band}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-zinc-400">{gameState.clubs[rival.clubId]?.name ?? "Rival organization"} · Pressure {pressure}/100</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </section>
        )}

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
          {!isRetired && player.clubId && player.contractExpiry > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-zinc-500">Contract Expires</p>
                <p className="mt-1 font-semibold">Season {player.contractExpiry}</p>
              </CardContent>
            </Card>
          )}
          {/* Loan Status */}
          {!isRetired && player.onLoan && player.loanParentClubId && (
            <Card className="border-sky-500/20 bg-sky-500/5">
              <CardContent className="p-4">
                <p className="text-xs text-sky-400">On Loan</p>
                <p className="mt-1 text-sm font-semibold text-zinc-200">
                  From {getClub(player.loanParentClubId)?.name ?? "Unknown"}
                </p>
                {player.loanEndWeek != null && player.loanEndSeason != null && (
                  <p className="mt-0.5 text-xs text-zinc-400">
                    Returns: Season {player.loanEndSeason}, Week {player.loanEndWeek}
                  </p>
                )}
                {/* Recall from Loan button */}
                {(() => {
                  const deal = (gameState.activeLoans ?? []).find((l) => l.playerId === player.id);
                  if (!deal?.recallClause) return null;
                  const windowOpen = gameState.transferWindow
                    ? isTransferWindowOpen([gameState.transferWindow], gameState.currentWeek)
                    : false;
                  return (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 w-full border-sky-500/30 text-sky-400 hover:bg-sky-500/10"
                      disabled={!windowOpen}
                      onClick={() => recallLoanPlayer(deal.id)}
                      title={windowOpen ? "Recall player from loan" : "Transfer window is closed"}
                    >
                      <RotateCcw size={12} className="mr-1.5" />
                      {windowOpen ? "Recall from Loan" : "Window Closed"}
                    </Button>
                  );
                })()}
              </CardContent>
            </Card>
          )}
          {/* Free Agent Badge */}
          {!isRetired && !player.clubId && player.contractExpiry === 0 && gameState.freeAgentPool?.agents.some(
            (a) => a.playerId === player.id && a.status === "available"
          ) && (
            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardContent className="p-4">
                <p className="text-xs text-emerald-400">Free Agent</p>
                <p className="mt-1 text-sm text-zinc-300">Available to sign</p>
              </CardContent>
            </Card>
          )}
          {isRetired && (
            <Card className="border-zinc-500/30 bg-zinc-500/5">
              <CardContent className="p-4">
                <p className="text-xs font-medium text-zinc-300">Retired</p>
                <p className="mt-1 text-sm text-zinc-500">Career record preserved</p>
              </CardContent>
            </Card>
          )}
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

                <p className="mt-4 text-xs text-zinc-400">
                  Based in <span className="font-medium text-white">{getCountryDisplayName(unsignedYouthRecord.country)}</span>
                  {foreignYouthCountry ? " — you will need to travel there to scout in person." : "."}
                </p>

                {!unsignedYouthRecord.placed && latestReport && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 min-h-11 border-amber-500/40 text-amber-300 hover:border-amber-400 hover:text-amber-200"
                    onClick={() => {
                      setPendingCalendarActivity({
                        type: "writePlacementReport",
                        targetId: unsignedYouthRecord.player.id,
                        label: `Placement: ${unsignedYouthRecord.player.firstName} ${unsignedYouthRecord.player.lastName}`,
                      });
                      setScreen("calendar");
                    }}
                  >
                    <FileText size={12} className="mr-1.5" aria-hidden="true" />
                    Pitch Filed Report
                  </Button>
                )}
                {!unsignedYouthRecord.placed && !latestReport && observations.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 min-h-11 border-emerald-500/40 text-emerald-300 hover:border-emerald-400 hover:text-emerald-200"
                    onClick={() => startReport(canonicalPlayerId)}
                  >
                    <FileText size={12} className="mr-1.5" aria-hidden="true" />
                    File Report First
                  </Button>
                )}
                {!unsignedYouthRecord.placed && observations.length === 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 min-h-11"
                    onClick={() => setScreen("calendar")}
                  >
                    Plan First Observation
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
                  <p className="flex items-center gap-1 text-xs text-zinc-500">
                    Current Ability
                    <HelpTooltip text="A player's current ability level on a 1-5 star scale. Higher stars = better player right now." />
                  </p>
                  <div
                    className={`h-2 w-2 rounded-full ${confidenceColor(aggregatedAbility.caConfidence)}`}
                    title={`${confidenceLabel(aggregatedAbility.caConfidence)} confidence`}
                  />
                </div>
                <StarRatingRange
                  low={aggregatedAbility.caLow}
                  high={aggregatedAbility.caHigh}
                  confidence={aggregatedAbility.caConfidence}
                  size="lg"
                />
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
            <h2 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Scouting Data
              <HelpTooltip text="Confidence shows how certain you are about this player's attributes. Higher confidence means more accurate readings. Observe in multiple contexts to increase confidence." />
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
                                    className={`absolute top-0 h-full rounded-full ${attributeValueColor(reading.perceivedValue)}`}
                                    style={{
                                      left: `${(((reading.rangeLow ?? reading.perceivedValue) - 1) / 19) * 100}%`,
                                      width: `${((((reading.rangeHigh ?? reading.perceivedValue) - (reading.rangeLow ?? reading.perceivedValue)) || 1) / 19) * 100}%`,
                                    }}
                                  />
                                </div>
                                <AttributeValueTooltip value={reading.perceivedValue} confidence={reading.confidence}>
                                  <span className="w-10 shrink-0 text-right text-xs font-mono font-medium text-white cursor-help">
                                    {reading.rangeLow != null && reading.rangeHigh != null && reading.rangeLow !== reading.rangeHigh
                                      ? `${reading.rangeLow}-${reading.rangeHigh}`
                                      : reading.perceivedValue}
                                  </span>
                                </AttributeValueTooltip>
                                <span className="w-6 shrink-0 text-right text-[10px] text-zinc-500" title={`${reading.observationCount} observation${reading.observationCount !== 1 ? "s" : ""}`}>
                                  {reading.observationCount}x
                                </span>
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

            {/* Personality Profile */}
            {player.personalityProfile && (
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                  Character Profile
                </h2>
                <Card>
                  <CardContent className="px-4 pb-4 pt-4">
                    {player.personalityProfile.hiddenUntilRevealed ? (
                      <div className="text-center py-2">
                        <p className="text-xs text-zinc-500">
                          Character type not yet identified. Continue observing to uncover their personality.
                        </p>
                        {player.personalityProfile.revealedTraits.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2 justify-center">
                            {player.personalityProfile.revealedTraits.map((trait) => (
                              <span
                                key={trait}
                                className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-300"
                              >
                                {trait.replace(/([A-Z])/g, " $1").trim()}
                              </span>
                            ))}
                          </div>
                        )}
                        {player.personalityProfile.traits.length > player.personalityProfile.revealedTraits.length && (
                          <div className="mt-2 flex justify-center gap-1">
                            {Array.from({ length: player.personalityProfile.traits.length - player.personalityProfile.revealedTraits.length }).map((_, i) => (
                              <span
                                key={`q-${i}`}
                                className="rounded-full bg-zinc-700/50 px-3 py-1 text-xs font-medium text-zinc-500"
                              >
                                ?
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <Tooltip content={ARCHETYPE_DESCRIPTIONS[player.personalityProfile.archetype]} side="top">
                            <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400 cursor-help underline decoration-dotted underline-offset-2">
                              {ARCHETYPE_LABELS[player.personalityProfile.archetype]}
                            </span>
                          </Tooltip>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {player.personalityProfile.revealedTraits.map((trait) => (
                            <span
                              key={trait}
                              className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-300"
                            >
                              {trait.replace(/([A-Z])/g, " $1").trim()}
                            </span>
                          ))}
                          {player.personalityProfile.traits.length > player.personalityProfile.revealedTraits.length && (
                            Array.from({ length: player.personalityProfile.traits.length - player.personalityProfile.revealedTraits.length }).map((_, i) => (
                              <span
                                key={`h-${i}`}
                                className="rounded-full bg-zinc-700/50 px-3 py-1 text-xs font-medium text-zinc-500"
                              >
                                ?
                              </span>
                            ))
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-500">Transfer Willingness</span>
                            <span className={`text-xs font-medium ${player.personalityProfile.transferWillingness >= 0.7 ? "text-red-400" : player.personalityProfile.transferWillingness >= 0.4 ? "text-amber-400" : "text-emerald-400"}`}>
                              {player.personalityProfile.transferWillingness >= 0.7 ? "High" : player.personalityProfile.transferWillingness >= 0.4 ? "Medium" : "Low"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-500">Dressing Room</span>
                            <span className={`text-xs font-medium ${player.personalityProfile.dressingRoomImpact >= 2 ? "text-emerald-400" : player.personalityProfile.dressingRoomImpact >= 0 ? "text-zinc-300" : "text-red-400"}`}>
                              {player.personalityProfile.dressingRoomImpact >= 2 ? "Positive" : player.personalityProfile.dressingRoomImpact >= 0 ? "Neutral" : "Negative"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-500">Consistency</span>
                            <span className={`text-xs font-medium ${player.personalityProfile.formVolatility <= 0.3 ? "text-emerald-400" : player.personalityProfile.formVolatility <= 0.6 ? "text-amber-400" : "text-red-400"}`}>
                              {player.personalityProfile.formVolatility <= 0.3 ? "Very Consistent" : player.personalityProfile.formVolatility <= 0.6 ? "Moderate" : "Volatile"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-zinc-500">Big Match</span>
                            <span className={`text-xs font-medium ${player.personalityProfile.bigMatchModifier >= 1 ? "text-emerald-400" : player.personalityProfile.bigMatchModifier >= 0 ? "text-zinc-300" : "text-red-400"}`}>
                              {player.personalityProfile.bigMatchModifier >= 2 ? "Thrives" : player.personalityProfile.bigMatchModifier >= 1 ? "Rises" : player.personalityProfile.bigMatchModifier >= 0 ? "Neutral" : "Struggles"}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Behavioral Traits */}
            {(player.playerTraitsRevealed?.length ?? 0) > 0 && (
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                  Behavioral Traits
                </h2>
                <div className="flex flex-wrap gap-2">
                  {player.playerTraitsRevealed!.map((trait) => (
                    <span
                      key={trait}
                      className="rounded-full bg-violet-500/15 px-3 py-1 text-xs font-medium text-violet-300"
                    >
                      {trait.replace(/([A-Z])/g, " $1").trim()}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Natural Role */}
            {player.naturalRole && observations.length >= 3 && (
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                  Tactical Role
                </h2>
                <Card>
                  <CardContent className="px-4 pb-4 pt-4">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-zinc-400">Natural Role</span>
                      <span className="rounded bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-400">
                        {player.naturalRole.replace(/([A-Z])/g, " $1").trim()}
                      </span>
                    </div>
                    {player.secondaryRole && (
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-zinc-400">Secondary</span>
                        <span className="rounded bg-zinc-700/50 px-2 py-0.5 text-xs font-medium text-zinc-300">
                          {player.secondaryRole.replace(/([A-Z])/g, " $1").trim()}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
                Evidence Board
              </h2>
              <EvidenceBoard
                playerName={`${player.firstName} ${player.lastName}`}
                observations={observations}
                contactIntel={contactIntel}
                npcReports={npcEvidenceReports}
                currentWeek={gameState.currentWeek}
                currentSeason={gameState.currentSeason}
                seasonLength={seasonLength}
                messages={dossierInboxIntel.map((message) => ({
                  id: message.id,
                  title: message.title,
                  body: message.body,
                  week: message.week,
                  season: message.season,
                }))}
                flaggedMoments={dossierEntries.flatMap((entry) => entry.flaggedMoments)}
                hypotheses={latestHypotheses}
                reports={reports}
                unknowns={unansweredAttributes.slice(0, 6).map((attribute) =>
                  `${attribute} has not been observed with enough clarity.`,
                )}
                onStartReport={() => startReport(canonicalPlayerId)}
              />
            </div>

            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                Evidence Log
              </h2>
              <Card>
                <CardContent className="px-4 pb-4 pt-4">
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                    <section aria-label="Reflection journal evidence" className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <FileText size={13} className="text-sky-400" aria-hidden="true" />
                          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                            Journal
                          </p>
                        </div>
                        <span className="text-[10px] text-zinc-600">
                          {dossierEntries.length} saved
                        </span>
                      </div>

                      {dossierEntries.length === 0 ? (
                        <div className="rounded-md border border-dashed border-[#27272a] bg-[#111111] px-3 py-4">
                          <p className="text-xs text-zinc-500">
                            No durable reflection entries saved for this player yet.
                          </p>
                        </div>
                      ) : (
                        dossierEntries.slice(0, 3).map((entry) => (
                          <article
                            key={entry.id}
                            className="rounded-md border border-[#27272a] bg-[#141414] p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-medium text-white">
                                  {formatObservationActivityLabel(entry.activityType)}
                                </p>
                                <p className="mt-0.5 text-[10px] text-zinc-500">
                                  {formatSeasonWeekLabel(entry.season, entry.week)}
                                </p>
                              </div>
                              <div className="flex flex-wrap justify-end gap-1">
                                {entry.flaggedMoments.length > 0 && (
                                  <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-300">
                                    {entry.flaggedMoments.length} moment{entry.flaggedMoments.length === 1 ? "" : "s"}
                                  </span>
                                )}
                                {entry.hypotheses.length > 0 && (
                                  <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-sky-300">
                                    {entry.hypotheses.length} hypothes{entry.hypotheses.length === 1 ? "is" : "es"}
                                  </span>
                                )}
                              </div>
                            </div>

                            {entry.summary && (
                              <p className="mt-2 text-xs leading-relaxed text-zinc-300">
                                {entry.summary}
                              </p>
                            )}

                            {entry.flaggedMoments.length > 0 && (
                              <div className="mt-3 space-y-2">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                                  Flagged Moments
                                </p>
                                {entry.flaggedMoments.slice(0, 2).map((moment) => {
                                  const reactionDisplay = getFlaggedReactionDisplay(moment.reaction);
                                  return (
                                    <div key={moment.id} className="rounded-md border border-[#202020] bg-[#101010] p-2.5">
                                      <div className="flex items-center justify-between gap-2">
                                        <p className="text-[10px] text-zinc-500">
                                          {moment.minute}&apos; · {formatMomentType(moment.momentType)}
                                          {moment.pressureContext ? " · Under pressure" : ""}
                                        </p>
                                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide ${reactionDisplay.className}`}>
                                          {reactionDisplay.label}
                                        </span>
                                      </div>
                                      <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                                        {moment.description}
                                      </p>
                                      {moment.note && (
                                        <p className="mt-1 text-[11px] text-zinc-500">
                                          Note: {moment.note}
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {entry.hypotheses.length > 0 && (
                              <div className="mt-3 space-y-2">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                                  Hypotheses
                                </p>
                                {entry.hypotheses.slice(0, 2).map((hypothesis) => {
                                  const hypothesisDisplay = getHypothesisStateDisplay(hypothesis.state);
                                  const forEvidence = (hypothesis.evidence ?? []).filter((item) => item.direction === "for");
                                  const againstEvidence = (hypothesis.evidence ?? []).filter((item) => item.direction === "against");
                                  const evidence = hypothesis.evidence ?? [];
                                  const latestEvidence = evidence[evidence.length - 1];

                                  return (
                                    <div key={hypothesis.id} className="rounded-md border border-[#202020] bg-[#101010] p-2.5">
                                      <div className="flex items-start justify-between gap-2">
                                        <p className="text-xs leading-relaxed text-zinc-300">
                                          {hypothesis.text}
                                        </p>
                                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide ${hypothesisDisplay.className}`}>
                                          {hypothesisDisplay.label}
                                        </span>
                                      </div>
                                      <p className="mt-1 text-[10px] text-zinc-500">
                                        {formatAttribute(hypothesis.domain)} · {forEvidence.length} for · {againstEvidence.length} against
                                      </p>
                                      {latestEvidence && (
                                        <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
                                          Latest evidence: {latestEvidence.description}
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {entry.notes.length > 0 && (
                              <div className="mt-3 space-y-1.5">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                                  Notes
                                </p>
                                {entry.notes.slice(0, 2).map((note, noteIndex) => (
                                  <p key={`${entry.id}-note-${noteIndex}`} className="text-[11px] leading-relaxed text-zinc-400">
                                    {note}
                                  </p>
                                ))}
                              </div>
                            )}
                          </article>
                        ))
                      )}
                    </section>

                    <section aria-label="Linked inbox intelligence" className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Users size={13} className="text-violet-400" aria-hidden="true" />
                          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                            Linked Intel
                          </p>
                        </div>
                        <span className="text-[10px] text-zinc-600">
                          {dossierInboxIntel.length} linked
                        </span>
                      </div>

                      {dossierInboxIntel.length === 0 ? (
                        <div className="rounded-md border border-dashed border-[#27272a] bg-[#111111] px-3 py-4">
                          <p className="text-xs text-zinc-500">
                            No player-linked inbox intel saved yet.
                          </p>
                        </div>
                      ) : (
                        dossierInboxIntel.slice(0, 4).map((message) => (
                          <article
                            key={message.id}
                            className="rounded-md border border-[#27272a] bg-[#141414] p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-medium text-white">{message.title}</p>
                                <p className="mt-0.5 text-[10px] text-zinc-500">
                                  {formatSeasonWeekLabel(message.season, message.week)}
                                </p>
                              </div>
                              <Badge variant="outline" className="text-[9px] uppercase tracking-wide text-zinc-300">
                                {formatAttribute(message.type)}
                              </Badge>
                            </div>
                            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                              {message.body}
                            </p>
                          </article>
                        ))
                      )}
                    </section>
                  </div>
                </CardContent>
              </Card>
            </div>

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

            {/* Injury Status & History */}
            <InjuryStatusCard player={player} />

            {/* Form & Performance */}
            <FormPerformanceCard player={player} />

            {/* Discipline */}
            <DisciplinaryCard
              record={player.disciplinaryRecord ?? (gameState.disciplinaryRecords ?? {})[player.id]}
              gameState={gameState}
            />

            {movementHistory.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Career Journey</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {movementHistory.slice(0, 12).map((event) => {
                    const labels: Record<string, string> = {
                      youthSigning: "Signed from youth football",
                      permanentTransfer: "Permanent transfer",
                      loanStart: "Loan started",
                      loanReturn: "Returned from loan",
                      loanRecall: "Recalled from loan",
                      loanBuyOption: "Loan made permanent",
                      release: "Released",
                      freeAgentSigning: "Signed as a free agent",
                      contractRenewal: "Contract renewed",
                      retirement: "Retired",
                      footballExit: "Left professional football",
                    };
                    const fromName = event.fromClubId ? gameState.clubs[event.fromClubId]?.name : undefined;
                    const toName = event.toClubId ? gameState.clubs[event.toClubId]?.name : undefined;
                    const route = fromName && toName
                      ? `${fromName} → ${toName}`
                      : toName ?? fromName;
                    return (
                      <div key={event.id} className="rounded-md border border-[#27272a] bg-[#111] px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-medium text-zinc-200">{labels[event.type] ?? event.type}</p>
                          <span className="text-[10px] text-zinc-500">S{event.season} W{event.week}</span>
                        </div>
                        {(route || event.fee !== undefined) && (
                          <p className="mt-1 text-[11px] text-zinc-400">
                            {route}{route && event.fee !== undefined ? " · " : ""}
                            {event.fee !== undefined ? formatMarketValue(event.fee) : ""}
                          </p>
                        )}
                        {event.reason && <p className="mt-1 text-[10px] text-zinc-500">{event.reason}</p>}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
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
                        <p className="flex items-center gap-1 text-xs text-zinc-400">
                          Quality: {r.qualityScore}/100
                          <HelpTooltip text="Report quality based on observation count, accuracy, and conviction. Higher quality reports earn more income and reputation." />
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
      {loanDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setLoanDialogOpen(false)}>
          <div
            className="mx-4 w-full max-w-lg rounded-xl border border-[#27272a] bg-[#0c0c0c] p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-white">Build a loan development plan</h3>
                <p className="mt-1 text-xs text-zinc-400">
                  Choose the club, purpose, and duration. The target club will respond when the week advances.
                </p>
              </div>
              <button onClick={() => setLoanDialogOpen(false)} className="text-zinc-500 hover:text-white" aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-4">
              <label className="block text-xs text-zinc-400">
                Destination club
                <select
                  value={loanTargetClubId}
                  onChange={(event) => setLoanTargetClubId(event.target.value)}
                  className="mt-1.5 w-full rounded-md border border-[#27272a] bg-[#141414] px-3 py-2 text-sm text-white"
                >
                  {loanTargetClubs.map((candidate) => {
                    const leagueName = gameState.leagues[candidate.leagueId]?.name ?? "Unknown league";
                    return (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name} · {leagueName} · Academy {candidate.youthAcademyRating}/20
                      </option>
                    );
                  })}
                </select>
              </label>
              <label className="block text-xs text-zinc-400">
                Development objective
                <select
                  value={loanRationale}
                  onChange={(event) => setLoanRationale(event.target.value as typeof loanRationale)}
                  className="mt-1.5 w-full rounded-md border border-[#27272a] bg-[#141414] px-3 py-2 text-sm text-white"
                >
                  <option value="development">Coaching and development</option>
                  <option value="playing-time">Guaranteed playing time</option>
                  <option value="experience">Senior football experience</option>
                  <option value="squad-depth">Fill a clear squad need</option>
                </select>
              </label>
              <label className="block text-xs text-zinc-400">
                Duration
                <select
                  value={loanDuration}
                  onChange={(event) => setLoanDuration(Number(event.target.value))}
                  className="mt-1.5 w-full rounded-md border border-[#27272a] bg-[#141414] px-3 py-2 text-sm text-white"
                >
                  <option value={12}>12 weeks · short-term test</option>
                  <option value={Math.round(seasonLength / 2)}>
                    {Math.round(seasonLength / 2)} weeks · half season
                  </option>
                  <option value={seasonLength}>{seasonLength} weeks · full season</option>
                </select>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setLoanDialogOpen(false)}>Cancel</Button>
              <Button
                disabled={!loanTargetClubId}
                onClick={() => {
                  recommendPlayerForLoan(player.id, loanTargetClubId, loanRationale, loanDuration);
                  setLoanDialogOpen(false);
                }}
              >
                Submit Recommendation
              </Button>
            </div>
          </div>
        </div>
      )}
      {/* Network Intel Popup */}
      {networkIntel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setNetworkIntel(null)}>
          <div
            className="relative mx-4 w-full max-w-md rounded-xl border border-[#27272a] bg-[#0c0c0c] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setNetworkIntel(null)}
              className="absolute right-3 top-3 text-zinc-500 hover:text-white transition"
              aria-label="Close"
            >
              <X size={16} />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15">
                <Phone size={18} className="text-emerald-400" />
              </div>
              <h3 className="text-sm font-semibold text-white">{networkIntel.title}</h3>
            </div>
            <p className="text-sm text-zinc-300 leading-relaxed mb-4">{networkIntel.body}</p>
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>+3 fatigue{networkIntel.contactName ? ` · ${networkIntel.contactName} relationship −2` : ""}</span>
              <Button size="sm" variant="outline" onClick={() => setNetworkIntel(null)}>
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}
    </GameLayout>
  );
}
