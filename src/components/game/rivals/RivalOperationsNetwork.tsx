"use client";

import { useState } from "react";
import { Building2, Network, ShieldAlert, Users } from "lucide-react";
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
  { left: "50%", top: "76%" },
  { left: "83%", top: "28%" },
] as const;

function signedPercent(multiplier: number): string {
  const percent = Math.round((multiplier - 1) * 100);
  return `${percent >= 0 ? "+" : ""}${percent}%`;
}

export function RivalOperationsNetwork({
  organizations, rivals, opportunities, pressure, formatAction,
}: RivalOperationsNetworkProps) {
  const [selectedId, setSelectedId] = useState(pressure.sourceOrganizationId ?? organizations[0]?.id ?? "");
  const selected = organizations.find((organization) => organization.id === selectedId) ?? organizations[0];
  if (!selected) return null;

  const definition = getRivalOrganizationDefinition(selected.archetypeId);
  const threat = getRivalOrganizationThreat(selected);
  const selectedOpenings = opportunities.filter((opportunity) => opportunity.organizationId === selected.id);
  const members = selected.memberRivalIds.map((rivalId) => rivals[rivalId]).filter((rival): rival is RivalScout => Boolean(rival));
  const isCurrentPressure = pressure.sourceOrganizationId === selected.id;

  return (
    <section aria-labelledby="competitive-network-heading" data-testid="rival-operations-network" className="overflow-hidden border border-[var(--border)] bg-[var(--surface)]">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--border)] px-4 py-4 sm:px-5">
        <h3 id="competitive-network-heading" className="font-editorial text-2xl text-white">Organization watch</h3>
        <span className="text-xs text-zinc-400">{organizations.length} networks tracked</span>
      </header>

      <div className="grid gap-1 border-b border-[var(--border)] p-2 sm:grid-cols-3" role="group" aria-label="Choose recruitment organization">
        {organizations.map((organization) => {
          const isActive = pressure.sourceOrganizationId === organization.id;
          const isSelected = organization.id === selected.id;
          return (
            <button key={organization.id} type="button" onClick={() => setSelectedId(organization.id)} aria-pressed={isSelected} aria-label={`${organization.name}, threat ${getRivalOrganizationThreat(organization)}${isActive ? ", current campaign active" : ""}`} className={`min-h-11 border-l-2 px-3 py-2 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${isSelected ? "border-[var(--accent)] bg-white/5 text-white" : "border-transparent text-zinc-400 hover:bg-white/5 hover:text-white"}`}>
              <span className="block font-medium">{organization.name}</span>
              {isActive && <span className="mt-1 block text-xs text-amber-200">Affecting this week</span>}
            </button>
          );
        })}
      </div>

      <div className="p-4 sm:p-5">
        <p className="sr-only" aria-live="polite">Selected {selected.name}. Threat {threat}. {isCurrentPressure ? "Its campaign is affecting this week." : "No active weekly campaign."}</p>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-lg font-semibold text-white">{selected.name}</h4>
            <p className="mt-1 text-sm text-zinc-400">{definition.name}</p>
          </div>
          <span className="text-xs text-zinc-400">{selectedOpenings.length} {selectedOpenings.length === 1 ? "opening" : "openings"}</span>
        </div>

        {isCurrentPressure ? (
          <section className="mt-4 border-l-2 border-amber-400/60 bg-amber-400/5 px-4 py-3" aria-label="Current rival campaign">
            <h5 className="flex items-center gap-2 text-sm font-semibold text-amber-200"><ShieldAlert size={16} aria-hidden="true" /> Campaign affecting this week</h5>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-3 text-sm">
              <div><dt className="text-xs text-zinc-400">Discovery chance</dt><dd className="mt-1 font-medium text-white">{signedPercent(pressure.discoveryChanceMultiplier)}</dd></div>
              <div><dt className="text-xs text-zinc-400">Poaching chance</dt><dd className="mt-1 font-medium text-white">{signedPercent(pressure.poachChanceMultiplier)}</dd></div>
              <div><dt className="text-xs text-zinc-400">Signing chance</dt><dd className="mt-1 font-medium text-white">{signedPercent(pressure.signingChanceMultiplier)}</dd></div>
            </dl>
          </section>
        ) : (
          <p className="mt-4 border-l-2 border-[var(--border)] pl-3 text-sm leading-6 text-zinc-300">No active weekly campaign from this organization. Its relationships and long-term agenda are still developing.</p>
        )}

        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="flex items-center gap-2 text-xs text-zinc-400"><Network size={14} aria-hidden="true" /> Last move</dt>
            <dd className="mt-1 text-sm font-medium text-white">{selected.lastAction ? formatAction(selected.lastAction) : "Building position"}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-2 text-xs text-zinc-400"><Users size={14} aria-hidden="true" /> Known scouts</dt>
            <dd className="mt-1 text-sm font-medium text-white">{members.length > 0 ? members.map((member) => member.name).join(", ") : "None identified"}</dd>
          </div>
        </dl>

        <details className="mt-5 border-t border-[var(--border)] pt-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-zinc-300">Long-term agenda · {definition.agendaName}</summary>
          <p className="mt-2 text-sm leading-6 text-zinc-300">{definition.agendaDescription}</p>
          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-400"><span>Agenda level {selected.agendaLevel}/10</span><span>{Math.round(selected.agendaProgress)}% toward the next level</span></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label={`${definition.agendaName}: ${Math.round(selected.agendaProgress)} percent toward the next level`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(selected.agendaProgress)}>
            <div className="h-full bg-[var(--accent)]" style={{ width: `${Math.max(0, Math.min(100, selected.agendaProgress))}%` }} />
          </div>
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-3 text-sm">
            <div><dt className="text-xs text-zinc-400">Resources</dt><dd className="mt-1 text-zinc-200">{Math.round(selected.resources)}</dd></div>
            <div><dt className="text-xs text-zinc-400">Influence</dt><dd className="mt-1 text-zinc-200">{Math.round(selected.influence)}</dd></div>
            <div><dt className="text-xs text-zinc-400">Heat</dt><dd className="mt-1 text-zinc-200">{Math.round(selected.heat)}</dd></div>
            <div><dt className="text-xs text-zinc-400">Threat</dt><dd className="mt-1 text-zinc-200">{threat}</dd></div>
          </dl>
        </details>

        <details className="mt-3 border-t border-[var(--border)] pt-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-zinc-300">Relationship sketch</summary>
          <div className="relative mt-3 h-64 overflow-hidden bg-black/10">
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {organizations.slice(0, 3).map((organization, index) => {
                const position = NODE_POSITIONS[index];
                const active = pressure.sourceOrganizationId === organization.id;
                return <line key={organization.id} x1="50" y1="48" x2={Number.parseInt(position.left, 10)} y2={Number.parseInt(position.top, 10)} stroke={active ? "#c9a86d" : "#556158"} strokeWidth={active ? "1.5" : "1"} strokeDasharray={active ? undefined : "3 4"} vectorEffect="non-scaling-stroke" />;
              })}
            </svg>
            <span className="absolute left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 bg-[var(--surface)] px-3 py-2 text-xs text-zinc-300">Your desk</span>
            {organizations.slice(0, 3).map((organization, index) => {
              const isSelected = organization.id === selected.id;
              const isActive = pressure.sourceOrganizationId === organization.id;
              return (
                <button key={organization.id} type="button" onClick={() => setSelectedId(organization.id)} aria-pressed={isSelected} aria-label={`Select ${organization.name} in relationship sketch`} className={`absolute flex w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded px-1 py-2 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)] sm:w-36 ${isSelected ? "text-white" : "text-zinc-400"}`} style={NODE_POSITIONS[index]}>
                  <span className={`grid h-8 w-8 place-items-center rounded border bg-[var(--surface)] ${isSelected ? "border-[var(--accent)]" : "border-[var(--border)]"}`}><Building2 size={17} aria-hidden="true" /></span>
                  <span className="bg-[var(--surface)] px-1 text-xs leading-4">{organization.name}</span>
                  {isActive && <span className="text-[11px] text-amber-200">Active campaign</span>}
                </button>
              );
            })}
          </div>
        </details>
      </div>
    </section>
  );
}
