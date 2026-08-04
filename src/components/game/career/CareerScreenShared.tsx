"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  CheckCircle,
  TrendingUp,
} from "lucide-react";
import type { JobOffer, PerformanceReview } from "@/engine/core/types";
import type {
  CareerMetricTileProps,
  CareerTimelineEntry,
} from "./careerScreenModel";
import { formatBalance, formatSalary } from "./careerScreenModel";

function metricToneClass(tone: CareerMetricTileProps["tone"]): string {
  switch (tone) {
    case "emerald":
      return "text-emerald-300";
    case "amber":
      return "text-amber-300";
    case "blue":
      return "text-blue-300";
    case "violet":
      return "text-violet-300";
    case "red":
      return "text-red-300";
    default:
      return "text-white";
  }
}

export function timelineToneClasses(tone: CareerTimelineEntry["tone"]): string {
  switch (tone) {
    case "emerald":
      return "border-emerald-500/30 bg-emerald-500/8";
    case "amber":
      return "border-amber-500/30 bg-amber-500/8";
    case "blue":
      return "border-blue-500/30 bg-blue-500/8";
    case "red":
      return "border-red-500/30 bg-red-500/8";
    default:
      return "border-[#27272a] bg-black/20";
  }
}

export function CareerMetricTile({
  label,
  value,
  helper,
  tone = "default",
}: CareerMetricTileProps) {
  return (
    <div className="rounded-2xl border border-white/8 bg-black/25 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        {label}
      </p>
      <p className={`mt-2 text-xl font-semibold ${metricToneClass(tone)}`}>{value}</p>
      {helper && <p className="mt-1 text-xs text-zinc-400">{helper}</p>}
    </div>
  );
}

export function outcomeColor(outcome: PerformanceReview["outcome"]): string {
  switch (outcome) {
    case "promoted":
      return "text-emerald-400";
    case "retained":
      return "text-blue-400";
    case "warning":
      return "text-amber-400";
    case "fired":
      return "text-red-400";
  }
}

export function outcomeIcon(outcome: PerformanceReview["outcome"]) {
  switch (outcome) {
    case "promoted":
      return <TrendingUp size={14} className="text-emerald-400" aria-hidden="true" />;
    case "retained":
      return <CheckCircle size={14} className="text-blue-400" aria-hidden="true" />;
    case "warning":
      return <AlertTriangle size={14} className="text-amber-400" aria-hidden="true" />;
    case "fired":
      return <AlertTriangle size={14} className="text-red-400" aria-hidden="true" />;
  }
}

interface JobOfferCardProps {
  clubName: string;
  offer: JobOffer;
  onAccept: () => void;
  onDecline: () => void;
}

export function JobOfferCard({
  clubName,
  offer,
  onAccept,
  onDecline,
}: JobOfferCardProps) {
  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div className="mb-3 flex items-start justify-between">
        <div>
          <p className="font-semibold text-white">{clubName}</p>
          <p className="text-sm text-zinc-400">{offer.role}</p>
        </div>
        <div className="flex gap-1.5">
          {offer.renewalOfContractId && <Badge variant="outline">Renewal</Badge>}
          <Badge variant="secondary">Tier {offer.tier}</Badge>
        </div>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-zinc-500">Salary: </span>
          <span className="text-emerald-400 font-semibold">{formatSalary(offer.salary)}</span>
        </div>
        <div>
          <span className="text-zinc-500">Contract: </span>
          <span className="text-white">
            {offer.contractLength} season{offer.contractLength !== 1 ? "s" : ""}
          </span>
        </div>
        {offer.territory && (
          <div className="col-span-2">
            <span className="text-zinc-500">Territory: </span>
            <span className="text-white">{offer.territory}</span>
          </div>
        )}
        <div className="col-span-2">
          <span className="text-zinc-500">Expires: </span>
          <span className="text-amber-400">Week {offer.expiresWeek}</span>
        </div>
      </div>
      {offer.objectives && (
        <div className="mb-3 rounded-md border border-white/10 bg-black/20 p-2.5">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Success measures
          </p>
          <div className="grid grid-cols-3 gap-2 text-[10px] text-zinc-300">
            <span>{offer.objectives.reportsPerSeason} reports</span>
            <span>{offer.objectives.minimumAverageQuality}+ quality</span>
            <span>{offer.objectives.successfulRecommendations} signings</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-500">
            {(offer.signingBonus ?? 0) > 0 && (
              <span>{formatBalance(offer.signingBonus ?? 0)} signing bonus</span>
            )}
            <span>{Math.round((offer.performanceBonusRate ?? 0) * 100)}% performance upside</span>
            <span>
              {offer.educationBudget
                ? `${formatBalance(offer.educationBudget)} education`
                : "No education budget"}
            </span>
            <span>{offer.severanceWeeks ?? 0} weeks severance</span>
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" onClick={onAccept}>
          Accept
        </Button>
        <Button size="sm" variant="outline" className="flex-1" onClick={onDecline}>
          Decline
        </Button>
      </div>
    </div>
  );
}
