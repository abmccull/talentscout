"use client";

import { Compass, ShieldCheck } from "lucide-react";
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

  return (
    <section
      aria-labelledby="weekly-strategy-heading"
      className="mb-4 rounded-xl border border-violet-400/20 bg-[#10131a]/94 p-4 shadow-xl shadow-black/20"
      data-testid="weekly-strategy-panel"
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Compass size={17} className="text-violet-300" aria-hidden="true" />
            <h2 id="weekly-strategy-heading" className="text-base font-semibold text-white">
              Set the week&apos;s intent
            </h2>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-zinc-300">
            Your intent changes which work the desk favors and how scheduled activities resolve.
            Every edge creates an opportunity cost, including work you plan manually. Both standing orders persist until you change them.
          </p>
        </div>
        {latest && (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-zinc-300">
            <span className="font-semibold text-white">Last week:</span>{" "}
            {latest.alignedActivities} aligned, {latest.opposedActivities} opposed, {latest.delegationMemories.length} delegated
          </div>
        )}
      </div>

      <fieldset>
        <legend className="text-xs font-bold uppercase tracking-[0.14em] text-violet-200">
          Strategic intent
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
          If you skip a live call
        </legend>
        <p className="mt-1 text-xs leading-relaxed text-zinc-300">
          Choose the standing order your desk will apply. Delegated calls are recorded in your career history and retain their tradeoffs.
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
    </section>
  );
}
