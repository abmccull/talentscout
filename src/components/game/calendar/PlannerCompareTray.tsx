"use client";

import type { Activity } from "@/engine/core/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ACTIVITY_DISPLAY } from "./ActivityCard";
import {
  DAY_LABELS,
  getActivityEvidenceReturn,
  getActivityExpiryLabel,
  getActivityFatigueSummary,
  getActivityGuide,
  getActivityTravelLabel,
  getAvailabilitySummary,
  getBestReturns,
  getObligationCostLabel,
  getTargetPoolLabel,
} from "./activityPlanning";

interface PlannerCompareTrayProps {
  selectedActivity: Activity | null;
  openDayCount: number;
  canScheduleAt: (activity: Activity, dayIndex: number) => boolean;
  onClearSelection: () => void;
}

export function PlannerCompareTray({
  selectedActivity,
  openDayCount,
  canScheduleAt,
  onClearSelection,
}: PlannerCompareTrayProps) {
  if (!selectedActivity) {
    return (
      <section
        data-testid="planner-compare-tray"
        aria-labelledby="planner-compare-title"
        className="rounded-2xl border border-white/10 bg-[#10151b]/94 p-4 shadow-xl shadow-black/20"
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-200">
          Opportunity compare
        </p>
        <h2 id="planner-compare-title" className="mt-1 text-base font-semibold text-white">
          Compare one live call against the week
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-300">
          Choose one opportunity from the board or mobile list, then compare its evidence return, fatigue, travel, expiry, and obligation cost before placing it on the strip.
        </p>
      </section>
    );
  }

  const display = ACTIVITY_DISPLAY[selectedActivity.type];
  const guide = getActivityGuide(selectedActivity);
  const returns = getBestReturns(selectedActivity);
  const targetPoolLabel = getTargetPoolLabel(selectedActivity);
  const availability = getAvailabilitySummary(selectedActivity, canScheduleAt);
  const fatigue = getActivityFatigueSummary(selectedActivity);
  const compareItems = [
    {
      label: "Evidence return",
      value: getActivityEvidenceReturn(selectedActivity),
    },
    {
      label: "Fatigue",
      value: fatigue.fatigueLabel,
    },
    {
      label: "Travel",
      value: getActivityTravelLabel(selectedActivity),
    },
    {
      label: "Expiry",
      value: getActivityExpiryLabel(selectedActivity),
    },
    {
      label: "Obligation cost",
      value: getObligationCostLabel(selectedActivity, openDayCount),
    },
  ];

  return (
    <section
      data-testid="planner-compare-tray"
      aria-labelledby="planner-compare-title"
      className="rounded-2xl border border-blue-400/20 bg-[linear-gradient(145deg,rgba(15,21,31,0.98),rgba(10,13,17,0.98))] p-4 shadow-xl shadow-black/20"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-200">
            Opportunity compare
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h2 id="planner-compare-title" className={`text-base font-semibold ${display.color}`}>
              {display.label}
            </h2>
            {targetPoolLabel && (
              <Badge variant="outline" className="border-white/10 text-zinc-300">
                {targetPoolLabel}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm leading-6 text-zinc-300">
            {selectedActivity.description || guide.context}
          </p>
        </div>
        <Button variant="outline" className="min-h-11" onClick={onClearSelection}>
          Clear selection
        </Button>
      </div>

      <div className="mt-4 grid gap-3">
        {compareItems.map((item) => (
          <div key={item.label} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              {item.label}
            </p>
            <p className={`mt-1 text-sm leading-6 ${item.label === "Fatigue" ? fatigue.fatigueTone : "text-zinc-200"}`}>
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Decision focus
        </p>
        <p className="mt-1 text-sm leading-6 text-zinc-200">{guide.question}</p>
      </div>

      {returns.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {returns.map((item) => (
            <span
              key={item}
              className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[11px] text-blue-100"
            >
              {item}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-200">
          Start windows
        </p>
        <p className="mt-1 text-sm leading-6 text-zinc-200">
          {availability.availabilityLabel}
        </p>
        {availability.availableDays.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {availability.availableDays.map((dayLabel) => (
              <span
                key={dayLabel}
                className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[11px] text-zinc-200"
              >
                {dayLabel}
              </span>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs leading-5 text-zinc-400">
          {selectedActivity.targetPool?.length
            ? "Choose a highlighted day in the strip, then pick the target."
            : `Use the day strip to place this on ${availability.firstAvailableDayIndex >= 0 ? DAY_LABELS[availability.firstAvailableDayIndex] : "an available day"}.`}
        </p>
      </div>
    </section>
  );
}
