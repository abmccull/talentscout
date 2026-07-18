"use client";

import { AlertTriangle, CheckCircle2, Compass, ShieldCheck } from "lucide-react";
import type { Club, FinancialRecord, Scout } from "@/engine/core/types";
import {
  deriveAgencyStrategicHealth,
  type AgencyStrategicHealthStatus,
} from "@/engine/finance/agency";
import {
  AGENCY_STRATEGIC_POSTURES,
  type AgencyStrategicPosture,
} from "@/engine/finance/agencyCapacity";
import { usePersistentDisclosure } from "@/lib/usePersistentDisclosure";

interface AgencyStrategyPanelProps {
  finances: FinancialRecord;
  scout: Scout;
  clubs: Record<string, Club>;
  onChangePosture: (posture: AgencyStrategicPosture) => void;
  postureChangeLocked?: boolean;
}

const STATUS_LABELS: Record<AgencyStrategicHealthStatus, string> = {
  resilient: "Resilient",
  stable: "Stable",
  stretched: "Stretched",
  fragile: "Fragile",
  critical: "Critical",
};

const STATUS_CLASSES: Record<AgencyStrategicHealthStatus, string> = {
  resilient: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  stable: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200",
  stretched: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  fragile: "border-orange-400/30 bg-orange-400/10 text-orange-200",
  critical: "border-red-400/30 bg-red-400/10 text-red-200",
};

function formatRunway(months: number | null): string {
  if (months === null) return "Self-funding";
  if (months >= 24) return "24+ months";
  return `${months.toFixed(months < 4 ? 1 : 0)} months`;
}

function PressureMeter({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  const tone = value >= 70 ? "bg-red-400" : value >= 45 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-zinc-200">{label}</span>
        <span className="font-mono text-zinc-300">{Math.round(value)}/100</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-label={`${label}: ${Math.round(value)} of 100`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}>
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
      <p className="mt-2 text-[11px] leading-4 text-zinc-500">{detail}</p>
    </div>
  );
}

export function AgencyStrategyPanel({
  finances,
  scout,
  clubs,
  onChangePosture,
  postureChangeLocked = false,
}: AgencyStrategyPanelProps) {
  const health = deriveAgencyStrategicHealth(finances, scout);
  const [strategyOpen, setStrategyOpen] = usePersistentDisclosure(
    "agency.operating-posture",
    health.posture !== health.recommendedPosture,
  );
  const dominantClient = health.dominantClientId
    ? clubs[health.dominantClientId]?.shortName ?? clubs[health.dominantClientId]?.name
    : undefined;
  const posture = AGENCY_STRATEGIC_POSTURES[health.posture];
  const recommended = AGENCY_STRATEGIC_POSTURES[health.recommendedPosture];

  return (
    <section
      className="mb-4 rounded-2xl border border-emerald-400/20 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.08),transparent_40%),rgba(12,17,20,0.96)] p-4 sm:p-5"
      aria-labelledby="agency-health-title"
      data-testid="agency-strategy-panel"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
            <Compass size={14} aria-hidden="true" />
            Agency position
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 id="agency-health-title" className="text-lg font-bold text-white">
              {posture.label}
            </h2>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_CLASSES[health.status]}`}>
              {STATUS_LABELS[health.status]} · {health.score}/100
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-400">{posture.purpose}</p>
        </div>
        {health.recommendedPosture !== health.posture && (
          <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-3 py-2 text-xs text-amber-100">
            <p className="font-semibold">Recommended: {recommended.label}</p>
            <p className="mt-0.5 text-amber-100/70">{recommended.purpose}</p>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Cash runway</p>
          <p className="mt-1 text-base font-bold text-white">{formatRunway(health.runwayMonths)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Client book</p>
          <p className="mt-1 text-base font-bold text-white">{health.activeClientCount} active</p>
          <p className="mt-0.5 truncate text-[10px] text-zinc-500">
            {dominantClient
              ? `${dominantClient} is ${Math.round(health.clientConcentration * 100)}% of committed value`
              : "No dominant client"}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Delivery load</p>
          <p className="mt-1 text-base font-bold text-white">{health.committedWork}/{health.effectiveMonthlyCapacity}</p>
          <p className="mt-0.5 text-[10px] text-zinc-500">reports committed / sustainable capacity</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-wide text-zinc-500">Next mandate</p>
          <p className={`mt-1 text-base font-bold ${health.seniorAgencyReady ? "text-emerald-200" : "text-amber-200"}`}>
            {health.seniorAgencyReady ? "Ready to scale" : "Build the foundations"}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <PressureMeter
          label="Client concentration"
          value={health.clientConcentrationRisk}
          detail="How badly losing one account would destabilize the practice."
        />
        <PressureMeter
          label="Delivery strain"
          value={health.qualityDebt}
          detail="Work owed faster than the team can review, recover, and defend it."
        />
        <PressureMeter
          label="Reputation exposure"
          value={health.reputationExposure}
          detail="How far one delivery failure could spread across the client book."
        />
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        {(health.strengths[0] || health.pressurePoints[0]) && (
          <div className="flex gap-2 rounded-xl border border-white/10 bg-black/20 p-3">
            {health.strengths[0]
              ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-300" aria-hidden="true" />
              : <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />}
            <p className="leading-5 text-zinc-300">{health.strengths[0] ?? health.pressurePoints[0]}</p>
          </div>
        )}
        {(health.pressurePoints[0] || health.promotionBlockers[0]) && (
          <div className="flex gap-2 rounded-xl border border-amber-300/10 bg-amber-300/[0.035] p-3">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />
            <p className="leading-5 text-zinc-300">{health.pressurePoints[0] ?? health.promotionBlockers[0]}</p>
          </div>
        )}
      </div>

      <details
        className="group mt-3 rounded-xl border border-white/10 bg-black/20"
        open={strategyOpen}
        onToggle={(event) => setStrategyOpen(event.currentTarget.open)}
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300">
          Choose operating posture
          <span className="text-xs font-normal text-zinc-400 group-open:hidden">Change what the agency protects</span>
          <span className="hidden text-xs font-normal text-zinc-400 group-open:inline">Hide choices</span>
        </summary>
        <div className="grid gap-2 border-t border-white/10 p-3 md:grid-cols-2 xl:grid-cols-5">
          {(Object.entries(AGENCY_STRATEGIC_POSTURES) as Array<[
            AgencyStrategicPosture,
            (typeof AGENCY_STRATEGIC_POSTURES)[AgencyStrategicPosture],
          ]>).map(([id, rule]) => {
            const active = id === health.posture;
            const isRecommended = id === health.recommendedPosture;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                disabled={active || postureChangeLocked}
                onClick={() => onChangePosture(id)}
                className={`min-h-28 rounded-xl border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 ${active
                  ? "border-emerald-300/40 bg-emerald-300/10"
                  : postureChangeLocked
                    ? "cursor-not-allowed border-white/5 bg-white/[0.015] opacity-55"
                    : "border-white/10 bg-white/[0.025] hover:border-emerald-300/25 hover:bg-emerald-300/[0.05]"}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-white">{rule.label}</span>
                  {active
                    ? <ShieldCheck size={15} className="text-emerald-300" aria-label="Current posture" />
                    : isRecommended
                      ? <span className="text-[8px] font-semibold uppercase tracking-wide text-amber-200">Recommended</span>
                      : null}
                </span>
                <span className="mt-2 block text-[11px] leading-4 text-zinc-400">{rule.purpose}</span>
              </button>
            );
          })}
        </div>
        {postureChangeLocked && (
          <p className="border-t border-white/10 px-4 py-3 text-xs text-zinc-500">
            This week&apos;s operating decision is set. Review the consequences before choosing again next week.
          </p>
        )}
      </details>
    </section>
  );
}
