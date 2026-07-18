"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  ArrowRight,
  Globe2,
  MapPinned,
  ShieldAlert,
  Swords,
  X,
} from "lucide-react";
import type { GameState } from "@/engine/core/types";
import { getWorldTraitDefinitions } from "@/engine/run";
import { getWorldCountryAvailability } from "@/engine/world/countryAvailability";
import {
  deriveRegionalPresence,
  deriveTerritorialStrategy,
  type TerritorialStrategyPosture,
} from "@/engine/world/regionalPresence";
import { getCountryDisplayName } from "@/lib/country";
import { usePersistentDisclosure } from "@/lib/usePersistentDisclosure";
import { WorldConditionPanel } from "../career/WorldConditionPanel";

interface WorldOutlookDrawerProps {
  state: GameState;
  onClose: () => void;
  onOpenRivals: () => void;
}

const TERRITORIAL_POSTURE_LABELS: Record<TerritorialStrategyPosture, string> = {
  specialist: "Deep specialist network",
  selective: "Selective territorial coverage",
  network: "Balanced international network",
  overextended: "Network stretched beyond its support",
};

export function WorldOutlookDrawer({
  state,
  onClose,
  onOpenRivals,
}: WorldOutlookDrawerProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [landscapeOpen, setLandscapeOpen] = usePersistentDisclosure(
    "world.long-term-landscape",
  );
  const traits = getWorldTraitDefinitions(state.runManifest.worldTraitIds);
  const regionalPortfolio = useMemo(() => getWorldCountryAvailability(state)
    .filter((country) => country.travelEligible)
    .map((country) => deriveRegionalPresence(state, country.countryKey))
    .sort((left, right) => right.accessScore - left.accessScore), [state]);
  const territorialStrategy = useMemo(() => deriveTerritorialStrategy(state), [state]);
  const topRegions = regionalPortfolio
    .filter((region) => region.accessScore > 0)
    .slice(0, 5);
  const rivalCount = Object.keys(state.rivalOrganizationState?.organizations ?? {}).length;
  const openRivalOpportunities = Object.values(
    state.rivalOrganizationState?.opportunities ?? {},
  ).filter((opportunity) => opportunity.status === "open").length;

  useEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href], summary, [tabindex]:not([tabindex='-1'])",
      ) ?? []).filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-[70] flex justify-end bg-black/65 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="world-outlook-title"
        className="flex h-full w-full max-w-3xl flex-col border-l border-emerald-400/20 bg-[#0b1010]/98 shadow-2xl shadow-black/60"
        data-testid="world-outlook-drawer"
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Your scouting world
            </p>
            <h1 id="world-outlook-title" className="mt-1 flex items-center gap-2 text-xl font-bold text-white">
              <Globe2 size={20} aria-hidden="true" />
              World outlook
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-400">
              Read the football landscape, protect the regions where your word carries weight,
              and decide where your next advantage should come from.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 text-zinc-300 transition hover:border-white/25 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
            aria-label="Close world outlook"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6">
          <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.045] p-4" aria-labelledby="territorial-position-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">
                  Territorial position
                </p>
                <h2 id="territorial-position-title" className="mt-1 text-base font-semibold text-white">
                  {TERRITORIAL_POSTURE_LABELS[territorialStrategy.posture]}
                </h2>
              </div>
              <span className="rounded-full border border-emerald-300/20 bg-black/20 px-3 py-1.5 text-xs font-semibold text-emerald-100">
                {territorialStrategy.coveredCountryCount} active market{territorialStrategy.coveredCountryCount === 1 ? "" : "s"}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xl font-bold text-emerald-200">{territorialStrategy.deepCountryCount}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">Strongholds</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xl font-bold text-cyan-200">{territorialStrategy.breadthScore}%</p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">Reach</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-xl font-bold text-amber-200">{territorialStrategy.staleCountryIds.length}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">Stale markets</p>
              </div>
            </div>
            <div className="mt-3 grid gap-2 text-xs leading-5 sm:grid-cols-2">
              <p className="rounded-lg border border-emerald-300/10 bg-black/15 px-3 py-2 text-zinc-300">
                {territorialStrategy.strengths[0]}
              </p>
              <p className="rounded-lg border border-amber-300/10 bg-black/15 px-3 py-2 text-zinc-400">
                {territorialStrategy.tradeoffs[0]}
              </p>
            </div>
            {(territorialStrategy.contestedCountryIds.length > 0 || territorialStrategy.capacityStrain > 1) && (
              <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                {territorialStrategy.contestedCountryIds.length > 0 && (
                  <span className="rounded-full border border-red-300/20 bg-red-300/[0.06] px-2.5 py-1 text-red-100">
                    {territorialStrategy.contestedCountryIds.length} contested market{territorialStrategy.contestedCountryIds.length === 1 ? "" : "s"}
                  </span>
                )}
                {territorialStrategy.capacityStrain > 1 && (
                  <span className="rounded-full border border-amber-300/20 bg-amber-300/[0.06] px-2.5 py-1 text-amber-100">
                    {territorialStrategy.committedCountryCount} markets across {territorialStrategy.operatingCapacity} field capacity
                  </span>
                )}
              </div>
            )}

            {topRegions.length > 0 && (
              <ol className="mt-4 space-y-2" aria-label="Strongest regional networks">
                {topRegions.map((region, index) => (
                  <li key={region.countryId} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                    <span className="w-5 text-center text-xs font-bold text-zinc-500">{index + 1}</span>
                    <MapPinned size={15} className="shrink-0 text-emerald-300" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">
                        {getCountryDisplayName(region.countryId)}
                      </p>
                      <p className="truncate text-[11px] text-zinc-500">
                        {region.territorialContext.calendar.intensity} calendar · {region.territorialContext.intel.freshness} intel · {region.territorialContext.rivalMarket.pressureBand} pressure
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-emerald-200">
                      {region.accessScore}/100
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <WorldConditionPanel state={state} />

          <section className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-400/[0.04] p-4" aria-labelledby="recruitment-pressure-title">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-fuchsia-300">
                  <Swords size={14} aria-hidden="true" />
                  Recruitment pressure
                </p>
                <h2 id="recruitment-pressure-title" className="mt-1 text-base font-semibold text-white">
                  {rivalCount > 0
                    ? `${rivalCount} rival organization${rivalCount === 1 ? "" : "s"} are active`
                    : "The market is quiet for now"}
                </h2>
                <p className="mt-1 text-xs leading-5 text-zinc-400">
                  {openRivalOpportunities > 0
                    ? `${openRivalOpportunities} opening${openRivalOpportunities === 1 ? "" : "s"} can be acted on now. Waiting may protect your information, but it gives competitors time.`
                    : "Keep building evidence and relationships. Rival interest can turn a private lead into a contested decision quickly."}
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenRivals}
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-fuchsia-300/25 bg-fuchsia-400/10 px-4 text-sm font-semibold text-fuchsia-100 transition hover:border-fuchsia-300/50 hover:bg-fuchsia-400/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fuchsia-300"
              >
                Open rival desk
                <ArrowRight size={15} className="ml-2" aria-hidden="true" />
              </button>
            </div>
          </section>

          <details
            className="group rounded-2xl border border-white/10 bg-black/20"
            open={landscapeOpen}
            onToggle={(event) => setLandscapeOpen(event.currentTarget.open)}
          >
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300">
              <span className="flex items-center gap-2">
                <ShieldAlert size={16} className="text-zinc-400" aria-hidden="true" />
                Long-term football landscape
              </span>
              <span className="text-xs font-normal text-zinc-500">{traits.length} defining influence{traits.length === 1 ? "" : "s"}</span>
            </summary>
            <div className="grid gap-3 border-t border-white/10 p-4 sm:grid-cols-2">
              {traits.length === 0 ? (
                <p className="text-sm leading-6 text-zinc-400 sm:col-span-2">
                  This older career began before long-term world briefings were recorded.
                </p>
              ) : traits.map((trait) => (
                <article key={trait.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-fuchsia-300">
                    {trait.dimension}
                  </p>
                  <h3 className="mt-1 font-semibold text-white">{trait.name}</h3>
                  <p className="mt-2 text-xs leading-5 text-zinc-400">{trait.description}</p>
                  <ul className="mt-3 space-y-1.5 text-xs leading-5 text-zinc-300">
                    {trait.playerFacingEffects.map((effect) => (
                      <li key={effect} className="flex gap-2">
                        <span className="text-fuchsia-300" aria-hidden="true">&bull;</span>
                        <span>{effect}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </details>
        </div>
      </aside>
    </div>
  );
}
