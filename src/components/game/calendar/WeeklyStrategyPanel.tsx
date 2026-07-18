"use client";

import { ChevronDown, Compass, ShieldCheck } from "lucide-react";
import {
  DELEGATION_POLICIES,
  WEEKLY_INTENTS,
  type DelegationPolicyId,
  type WeeklyIntentId,
  type WeeklyStrategyState,
} from "@/engine/core/weeklyStrategy";

interface WeeklyStrategyPanelProps {
  strategy: WeeklyStrategyState;
  onSelectIntent: (intentId: WeeklyIntentId) => void;
  onSelectPolicy: (policyId: DelegationPolicyId) => void;
}

export function WeeklyStrategyPanel({
  strategy,
  onSelectIntent,
  onSelectPolicy,
}: WeeklyStrategyPanelProps) {
  const latest = strategy.history.at(-1);
  const selectedIntent = WEEKLY_INTENTS.find((intent) => intent.id === strategy.intentId)
    ?? WEEKLY_INTENTS[0];
  const selectedPolicy = DELEGATION_POLICIES.find(
    (policy) => policy.id === strategy.delegationPolicyId,
  ) ?? DELEGATION_POLICIES[0];

  return (
    <section
      aria-label="Set the week's intent"
      className="mb-4 overflow-hidden rounded-xl border border-violet-400/20 bg-[#10131a]/94 shadow-xl shadow-black/20"
      data-testid="weekly-strategy-panel"
    >
      <details className="group">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 marker:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300 [&::-webkit-details-marker]:hidden sm:px-5">
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <Compass size={17} className="shrink-0 text-violet-300" aria-hidden="true" />
              <span id="weekly-strategy-heading" className="text-sm font-semibold text-white sm:text-base">
                Change desk policy
              </span>
            </span>
            <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-300">
              <span className="font-semibold text-violet-200">{selectedIntent.label}</span>
              <span aria-hidden="true"> · </span>
              <span className="font-semibold text-emerald-200">{selectedPolicy.label}</span>
              <span className="text-zinc-400"> — how your desk prioritizes work and handles calls you miss.</span>
            </span>
          </span>
          <ChevronDown
            size={18}
            className="shrink-0 text-zinc-400 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>

        <div className="border-t border-white/10 p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <p className="max-w-3xl text-xs leading-relaxed text-zinc-300">
              Set what the desk should protect this week. Every option creates an advantage and leaves something else exposed.
            </p>
            {latest && (
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300">
                <span className="font-semibold text-white">Last week:</span>{" "}
                {latest.alignedActivities} aligned, {latest.opposedActivities} opposed, {latest.delegationMemories.length} delegated
              </div>
            )}
          </div>

          <fieldset>
            <legend className="text-xs font-bold uppercase tracking-[0.14em] text-violet-200">
              What should the desk prioritize?
            </legend>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup">
              {WEEKLY_INTENTS.map((intent) => {
                const selected = strategy.intentId === intent.id;
                return (
                  <button
                    key={intent.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-describedby={`intent-cost-${intent.id}`}
                    onClick={() => onSelectIntent(intent.id)}
                    className={`min-h-11 rounded-lg border px-3 py-2.5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-300 ${
                      selected
                        ? "border-violet-400/60 bg-violet-400/10"
                        : "border-white/10 bg-black/20 hover:border-violet-400/35 hover:bg-violet-400/[0.05]"
                    }`}
                  >
                    <span className="block text-sm font-semibold text-white">{intent.label}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-zinc-300">{intent.promise}</span>
                    <span id={`intent-cost-${intent.id}`} className="mt-1.5 block text-xs leading-relaxed text-amber-200">
                      Cost: {intent.opportunityCost}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="mt-4 border-t border-white/10 pt-4">
            <legend className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-200">
              <ShieldCheck size={14} aria-hidden="true" />
              If you miss a live call
            </legend>
            <p className="mt-1 text-xs leading-relaxed text-zinc-300">
              Choose the standing order your desk will follow. Delegated calls stay in your career history and keep their tradeoffs.
            </p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4" role="radiogroup">
              {DELEGATION_POLICIES.map((policy) => {
                const selected = strategy.delegationPolicyId === policy.id;
                return (
                  <button
                    key={policy.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-describedby={`policy-cost-${policy.id}`}
                    onClick={() => onSelectPolicy(policy.id)}
                    className={`min-h-11 rounded-lg border px-3 py-2.5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 ${
                      selected
                        ? "border-emerald-400/55 bg-emerald-400/[0.09]"
                        : "border-white/10 bg-black/20 hover:border-emerald-400/30 hover:bg-emerald-400/[0.04]"
                    }`}
                  >
                    <span className="block text-xs font-semibold text-white">{policy.label}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-zinc-300">{policy.description}</span>
                    <span id={`policy-cost-${policy.id}`} className="mt-1 block text-xs leading-relaxed text-amber-200">
                      Cost: {policy.opportunityCost}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      </details>
    </section>
  );
}
