"use client";

import { useState } from "react";
import {
  Activity,
  Building2,
  Crosshair,
  Network,
  Radio,
  ShieldAlert,
  Users,
  Zap,
} from "lucide-react";
import type { RivalScout } from "@/engine/core/types";
import {
  getRivalOrganizationDefinition,
  getRivalOrganizationThreat,
  type RivalOrganization,
  type RivalOrganizationOpportunity,
  type RivalOrganizationPressure,
} from "@/engine/rivals";

interface RivalOperationsNetworkProps {
  organizations: RivalOrganization[];
  rivals: Readonly<Record<string, RivalScout>>;
  opportunities: RivalOrganizationOpportunity[];
  pressure: RivalOrganizationPressure;
  formatAction: (action: string) => string;
}

const NODE_POSITIONS = [
  { left: "17%", top: "28%" },
  { left: "50%", top: "70%" },
  { left: "83%", top: "28%" },
] as const;

function signedPercent(multiplier: number): string {
  const percent = Math.round((multiplier - 1) * 100);
  return `${percent >= 0 ? "+" : ""}${percent}%`;
}

function threatTone(threat: number): string {
  if (threat >= 70) return "border-red-300 bg-red-400 text-red-950 shadow-red-400/30";
  if (threat >= 45) return "border-amber-300 bg-amber-400 text-amber-950 shadow-amber-400/25";
  return "border-fuchsia-300 bg-fuchsia-400 text-fuchsia-950 shadow-fuchsia-400/25";
}

export function RivalOperationsNetwork({
  organizations,
  rivals,
  opportunities,
  pressure,
  formatAction,
}: RivalOperationsNetworkProps) {
  const [selectedId, setSelectedId] = useState(organizations[0]?.id ?? "");
  const selected = organizations.find((organization) => organization.id === selectedId)
    ?? organizations[0];

  if (!selected) return null;

  const definition = getRivalOrganizationDefinition(selected.archetypeId);
  const threat = getRivalOrganizationThreat(selected);
  const selectedOpenings = opportunities.filter(
    (opportunity) => opportunity.organizationId === selected.id,
  );
  const members = selected.memberRivalIds
    .map((rivalId) => rivals[rivalId])
    .filter((rival): rival is RivalScout => Boolean(rival));
  const isCurrentPressure = pressure.sourceOrganizationId === selected.id;

  return (
    <section
      aria-labelledby="competitive-network-heading"
      data-testid="rival-operations-network"
      className="overflow-hidden rounded-2xl border border-fuchsia-300/15 bg-zinc-950/90 shadow-2xl shadow-black/25"
    >
      <div className="flex flex-col gap-2 border-b border-white/10 bg-gradient-to-r from-fuchsia-500/10 via-zinc-950 to-sky-500/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-fuchsia-200">
            <Radio size={13} aria-hidden="true" /> Live recruitment intelligence
          </p>
          <h3 id="competitive-network-heading" className="mt-1 text-lg font-semibold text-white">
            Competitive operations network
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-400">
            Select an organization to inspect who is moving, what it wants, and how its current campaign changes your market.
          </p>
        </div>
        <div className="flex min-h-10 items-center gap-2 self-start rounded-full border border-emerald-300/20 bg-emerald-300/5 px-3 text-xs text-emerald-200 sm:self-auto">
          <Activity size={14} aria-hidden="true" />
          {organizations.length} networks tracked
        </div>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.75fr)]">
        <div className="relative min-h-[19rem] overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.08),transparent_48%)] sm:min-h-[23rem] xl:border-b-0 xl:border-r">
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            aria-hidden="true"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)",
              backgroundSize: "34px 34px",
              maskImage: "linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)",
            }}
          />
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {organizations.slice(0, 3).map((organization, index) => {
              const position = NODE_POSITIONS[index];
              const x = Number.parseInt(position.left, 10);
              const y = Number.parseInt(position.top, 10);
              const active = pressure.sourceOrganizationId === organization.id;
              return (
                <line
                  key={organization.id}
                  x1="50"
                  y1="48"
                  x2={x}
                  y2={y}
                  stroke={active ? "rgba(251, 113, 133, .75)" : "rgba(217, 70, 239, .4)"}
                  strokeWidth={active ? "1.2" : ".7"}
                  strokeDasharray={active ? "3 2" : "1.5 2"}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>

          <div className="absolute left-1/2 top-[48%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
            <div className="grid size-16 place-items-center rounded-full border border-emerald-300/45 bg-emerald-400/10 shadow-[0_0_38px_rgba(52,211,153,.2)]">
              <Crosshair className="text-emerald-200" size={25} aria-hidden="true" />
            </div>
            <span className="mt-2 rounded-full border border-emerald-300/20 bg-zinc-950/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-200">
              Your desk
            </span>
          </div>

          {organizations.slice(0, 3).map((organization, index) => {
            const organizationDefinition = getRivalOrganizationDefinition(organization.archetypeId);
            const organizationThreat = getRivalOrganizationThreat(organization);
            const isSelected = organization.id === selected.id;
            const isActive = pressure.sourceOrganizationId === organization.id;
            const position = NODE_POSITIONS[index];
            return (
              <button
                key={organization.id}
                type="button"
                aria-pressed={isSelected}
                aria-label={`${organization.name}, threat ${organizationThreat}${isActive ? ", current campaign active" : ""}`}
                onClick={() => setSelectedId(organization.id)}
                className="group absolute flex w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 rounded-xl p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:w-32"
                style={position}
              >
                <span
                  className={`relative grid size-12 place-items-center rounded-full border-2 shadow-lg transition duration-200 motion-safe:group-hover:scale-110 ${threatTone(organizationThreat)} ${isSelected ? "ring-2 ring-white ring-offset-2 ring-offset-zinc-950" : ""}`}
                >
                  {isActive && (
                    <span className="absolute -inset-2 rounded-full border border-red-300/50 motion-safe:animate-ping" aria-hidden="true" />
                  )}
                  <Building2 size={19} aria-hidden="true" />
                </span>
                <span className="line-clamp-2 rounded-md bg-zinc-950/90 px-1.5 py-1 text-center text-[10px] font-semibold leading-3 text-zinc-100 group-hover:text-white sm:text-xs sm:leading-4">
                  {organization.name}
                </span>
                <span className="hidden text-[9px] uppercase tracking-wider text-zinc-400 sm:block">
                  {organizationDefinition.name}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col p-4 sm:p-5">
          <p className="sr-only" aria-live="polite">
            Selected {selected.name}. Threat {threat}. {isCurrentPressure ? "Its campaign is affecting this week." : "No active weekly campaign."}
          </p>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-fuchsia-200">
                Selected actor
              </p>
              <h4 className="mt-1 text-xl font-semibold text-white">{selected.name}</h4>
              <p className="mt-1 text-xs text-zinc-400">{definition.name}</p>
            </div>
            <span className="rounded-full border border-red-300/25 bg-red-400/10 px-2.5 py-1 font-mono text-xs font-bold text-red-200">
              Threat {threat}
            </span>
          </div>

          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.025] p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-zinc-100">{definition.agendaName}</span>
              <span className="text-[10px] text-fuchsia-200">Level {selected.agendaLevel}/10</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800" role="progressbar" aria-label={`${definition.agendaName}: ${Math.round(selected.agendaProgress)} percent toward the next level`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(selected.agendaProgress)}>
              <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-emerald-400" style={{ width: `${Math.max(0, Math.min(100, selected.agendaProgress))}%` }} />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-zinc-400">{definition.agendaDescription}</p>
          </div>

          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-sky-300/15 bg-sky-300/5 p-2">
              <dt className="text-[9px] uppercase tracking-wider text-zinc-400">Resources</dt>
              <dd className="mt-1 font-mono text-base font-bold text-sky-200">{Math.round(selected.resources)}</dd>
            </div>
            <div className="rounded-lg border border-amber-300/15 bg-amber-300/5 p-2">
              <dt className="text-[9px] uppercase tracking-wider text-zinc-400">Influence</dt>
              <dd className="mt-1 font-mono text-base font-bold text-amber-200">{Math.round(selected.influence)}</dd>
            </div>
            <div className="rounded-lg border border-red-300/15 bg-red-300/5 p-2">
              <dt className="text-[9px] uppercase tracking-wider text-zinc-400">Heat</dt>
              <dd className="mt-1 font-mono text-base font-bold text-red-200">{Math.round(selected.heat)}</dd>
            </div>
          </dl>

          <div className="mt-4 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2">
              <span className="flex items-center gap-2 text-zinc-400"><Network size={13} aria-hidden="true" /> Last move</span>
              <span className="text-right font-medium text-zinc-100">{selected.lastAction ? formatAction(selected.lastAction) : "Building position"}</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2">
              <span className="flex items-center gap-2 text-zinc-400"><Users size={13} aria-hidden="true" /> Known scouts</span>
              <span className="text-right font-medium text-zinc-100">{members.length > 0 ? members.map((member) => member.name).join(", ") : "None identified"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-zinc-400"><Zap size={13} aria-hidden="true" /> Openings</span>
              <span className={selectedOpenings.length > 0 ? "font-semibold text-amber-200" : "text-zinc-300"}>{selectedOpenings.length}</span>
            </div>
          </div>

          {isCurrentPressure ? (
            <div className="mt-4 rounded-xl border border-red-300/20 bg-red-400/5 p-3">
              <p className="flex items-center gap-2 text-xs font-semibold text-red-200">
                <ShieldAlert size={14} aria-hidden="true" /> Campaign affecting this week
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[10px] text-zinc-400">
                <div><span className="block font-mono text-sm font-bold text-white">{signedPercent(pressure.discoveryChanceMultiplier)}</span>discovery</div>
                <div><span className="block font-mono text-sm font-bold text-white">{signedPercent(pressure.poachChanceMultiplier)}</span>poaching</div>
                <div><span className="block font-mono text-sm font-bold text-white">{signedPercent(pressure.signingChanceMultiplier)}</span>signing</div>
              </div>
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-xs leading-5 text-zinc-400">
              This network is not applying the current weekly pressure, but its agenda and resources persist between moves.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
