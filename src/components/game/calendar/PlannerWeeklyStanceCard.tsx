"use client";

import { Compass, GitBranch, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DELEGATION_POLICIES,
  WEEKLY_INTENTS,
  type WeeklyStrategyState,
} from "@/engine/core/weeklyStrategy";
import type { PlannerCareerPressure } from "./plannerCareerPressure";

interface PlannerWeeklyStanceCardProps {
  strategy: WeeklyStrategyState;
  careerPressure: PlannerCareerPressure;
}

const PRESSURE_TONE_CLASS: Record<PlannerCareerPressure["tone"], string> = {
  sky: "border-sky-400/30 bg-sky-500/10 text-sky-100",
  emerald: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
  amber: "border-amber-400/30 bg-amber-500/10 text-amber-100",
  violet: "border-violet-400/30 bg-violet-500/10 text-violet-100",
  red: "border-red-400/30 bg-red-500/10 text-red-100",
};

export function PlannerWeeklyStanceCard({
  strategy,
  careerPressure,
}: PlannerWeeklyStanceCardProps) {
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
            Schedule against what this career is asking of you
          </h2>
          <p className="mt-1 max-w-xl text-sm leading-6 text-zinc-300">
            Your current chapter, territory, and relationships now determine which open day is genuinely valuable.
          </p>
        </div>
        {latest && (
          <Badge variant="outline" className="border-white/10 text-zinc-300">
            {latest.alignedActivities} aligned last week
          </Badge>
        )}
      </div>

      <div
        data-testid="planner-career-pressure"
        data-career-fingerprint={careerPressure.fingerprintId}
        className={`mt-4 rounded-xl border p-4 ${PRESSURE_TONE_CLASS[careerPressure.tone]}`}
      >
        <div className="flex items-center gap-2">
          <GitBranch size={16} aria-hidden="true" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em]">
            This week&apos;s pressure · {careerPressure.eyebrow}
          </p>
        </div>
        <p className="mt-2 text-base font-semibold text-white">{careerPressure.value}</p>
        <p className="mt-1 text-sm leading-6 text-zinc-200">{careerPressure.detail}</p>
        <p className="mt-3 text-sm font-medium leading-6 text-white">
          {careerPressure.schedulingQuestion}
        </p>
        <p className="mt-1 text-xs leading-5 text-amber-100">
          Cost of neglect: {careerPressure.opportunityCost}
        </p>
      </div>

      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <div className="flex gap-2 rounded-lg border border-white/8 bg-black/15 p-3">
          <Compass size={15} className="mt-0.5 shrink-0 text-violet-300" aria-hidden="true" />
          <div>
            <p className="font-semibold uppercase tracking-[0.14em] text-violet-200">Desk stance</p>
            <p className="mt-1 text-zinc-200">
              {intent?.label ?? "Balanced desk"} · {intent?.promise}
            </p>
          </div>
        </div>
        <div className="flex gap-2 rounded-lg border border-white/8 bg-black/15 p-3">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-300" aria-hidden="true" />
          <div>
            <p className="font-semibold uppercase tracking-[0.14em] text-emerald-200">
              If you cannot attend
            </p>
            <p className="mt-1 text-zinc-200">
              {policy?.label ?? "Desk lead decides"} · {policy?.description}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
