"use client";

import { Compass, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DELEGATION_POLICIES,
  WEEKLY_INTENTS,
  type WeeklyStrategyState,
} from "@/engine/core/weeklyStrategy";

interface PlannerWeeklyStanceCardProps {
  strategy: WeeklyStrategyState;
}

export function PlannerWeeklyStanceCard({ strategy }: PlannerWeeklyStanceCardProps) {
  const latest = strategy.history.at(-1);
  const intent = WEEKLY_INTENTS.find((entry) => entry.id === strategy.intentId);
  const policy = DELEGATION_POLICIES.find((entry) => entry.id === strategy.delegationPolicyId);

  return (
    <section
      data-testid="weekly-stance-card"
      aria-labelledby="weekly-stance-title"
      className="rounded-2xl border border-violet-400/20 bg-[linear-gradient(145deg,rgba(33,37,54,0.96),rgba(16,19,26,0.96))] p-4 shadow-xl shadow-black/20"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-200">
            Weekly stance
          </p>
          <h2 id="weekly-stance-title" className="mt-1 text-base font-semibold text-white">
            What the desk should protect this week
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-zinc-300">
            Keep the stance visible while you schedule. The compare tray and day strip should read against this intention.
          </p>
        </div>
        {latest && (
          <Badge variant="outline" className="border-white/10 text-zinc-300">
            {latest.alignedActivities} aligned last week
          </Badge>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-center gap-2">
            <Compass size={16} className="text-violet-300" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-200">
              Focus
            </p>
          </div>
          <p className="mt-2 text-sm font-semibold text-white">{intent?.label ?? "Balanced desk"}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-300">{intent?.promise}</p>
          <p className="mt-2 text-[11px] leading-5 text-amber-200">
            Cost: {intent?.opportunityCost ?? "You gain no specialist edge by default."}
          </p>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-300" aria-hidden="true" />
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200">
              Missed-call policy
            </p>
          </div>
          <p className="mt-2 text-sm font-semibold text-white">{policy?.label ?? "Desk lead decides"}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-300">{policy?.description}</p>
          <p className="mt-2 text-[11px] leading-5 text-amber-200">
            Cost: {policy?.opportunityCost ?? "Competent coverage, but no consistent edge."}
          </p>
        </div>
      </div>
    </section>
  );
}
