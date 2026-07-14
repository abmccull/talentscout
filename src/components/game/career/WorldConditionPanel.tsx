"use client";

import {
  CalendarRange,
  ChevronDown,
  Globe2,
  History,
  MapPinned,
} from "lucide-react";
import type { GameState } from "@/engine/core/types";
import {
  formatWorldConditionCountry,
  getWorldConditionDefinition,
  type WorldConditionInstance,
} from "@/engine/world/worldConditions";

interface WorldConditionPanelProps {
  state: Pick<GameState, "currentSeason" | "worldConditionState">;
}

function ConditionCard({ condition }: { condition: WorldConditionInstance }) {
  const definition = getWorldConditionDefinition(condition.definitionId);
  if (!definition) return null;
  const regional = condition.scope === "regional";
  const Icon = regional ? MapPinned : Globe2;
  return (
    <article
      className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.045] p-4"
      data-testid={`world-condition-${condition.definitionId}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">
            <Icon size={14} aria-hidden="true" />
            {regional
              ? formatWorldConditionCountry(condition.countryId)
              : "Global condition"}
          </p>
          <h4 className="mt-1 font-semibold text-white">{definition.name}</h4>
        </div>
        <span className="shrink-0 rounded-full border border-cyan-300/20 bg-black/20 px-2.5 py-1 text-xs text-cyan-100">
          Season {condition.season}
        </span>
      </div>
      <p className="mt-2 text-xs leading-5 text-zinc-400">{definition.description}</p>
      <ul className="mt-3 space-y-1.5 text-xs leading-5 text-zinc-200">
        {definition.playerFacingEffects.map((effect) => (
          <li key={effect} className="flex gap-2">
            <span className="text-cyan-300" aria-hidden="true">&bull;</span>
            <span>{effect}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function WorldConditionPanel({ state }: WorldConditionPanelProps) {
  const conditionState = state.worldConditionState;
  if (!conditionState || conditionState.active.length === 0) {
    return (
      <section className="md:col-span-3" aria-labelledby="seasonal-world-heading">
        <h3 id="seasonal-world-heading" className="text-sm font-semibold text-white">
          Seasonal football context
        </h3>
        <p className="mt-2 text-sm text-zinc-400">
          No seasonal condition record is available for this imported career yet.
        </p>
      </section>
    );
  }

  const currentRecord = conditionState.history.find(
    (record) => record.season === conditionState.activeSeason,
  );
  const archive = [...conditionState.history]
    .filter((record) => record.season !== conditionState.activeSeason)
    .sort((left, right) => right.season - left.season);

  return (
    <section
      className="space-y-3 border-t border-white/10 pt-4 md:col-span-3"
      aria-labelledby="seasonal-world-heading"
      data-testid="world-condition-panel"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="seasonal-world-heading" className="flex items-center gap-2 text-sm font-semibold text-white">
            <CalendarRange size={16} className="text-cyan-300" aria-hidden="true" />
            Season {state.currentSeason} live conditions
          </h3>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-400">
            These seeded conditions are part of the simulation, not flavour text. They change regional discovery,
            evidence, opportunities, development, recruitment pressure, travel, and market finances.
          </p>
        </div>
        <span className="rounded-full border border-cyan-400/20 bg-cyan-400/[0.07] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200">
          {conditionState.active.length} active
        </span>
      </div>

      {currentRecord?.callback && (
        <div className="rounded-xl border border-amber-300/15 bg-amber-300/[0.045] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">
            What changed
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-300">{currentRecord.callback}</p>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        {conditionState.active.map((condition) => (
          <ConditionCard key={condition.id} condition={condition} />
        ))}
      </div>

      {archive.length > 0 && (
        <details className="group rounded-xl border border-white/10 bg-black/20">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
            <span className="flex items-center gap-2">
              <History size={15} className="text-zinc-400" aria-hidden="true" />
              Condition archive ({archive.length} season{archive.length === 1 ? "" : "s"})
            </span>
            <ChevronDown size={16} className="text-zinc-500 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="space-y-3 border-t border-white/10 px-4 py-4">
            {archive.slice(0, 8).map((record) => (
              <article key={record.season} className="rounded-lg border border-white/10 bg-white/[0.025] p-3">
                <p className="text-xs font-semibold text-white">Season {record.season}</p>
                <p className="mt-1 text-xs leading-5 text-zinc-400">{record.callback}</p>
                <ul className="mt-2 flex flex-wrap gap-2" aria-label={`Season ${record.season} conditions`}>
                  {record.conditions.map((condition) => {
                    const definition = getWorldConditionDefinition(condition.definitionId);
                    return (
                      <li
                        key={condition.id}
                        className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-zinc-300"
                      >
                        {condition.scope === "regional"
                          ? `${formatWorldConditionCountry(condition.countryId)}: `
                          : ""}
                        {definition?.name ?? condition.definitionId}
                      </li>
                    );
                  })}
                </ul>
              </article>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
