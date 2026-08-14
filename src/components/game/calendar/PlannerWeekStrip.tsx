"use client";

import type { ReactNode } from "react";
import type { Activity } from "@/engine/core/types";
import { X } from "lucide-react";
import { ACTIVITY_DISPLAY } from "./ActivityCard";

interface PlannerWeekStripProps {
  dayKeys: readonly string[];
  activities: Array<Activity | null>;
  selectedActivity: Activity | null;
  receiptMessage?: string | null;
  dragOverDay: number | null;
  hoverDay: number | null;
  slotsUsed: number;
  openDayCount: number;
  severity: "ok" | "warn" | "danger";
  upcomingEvent?: { name: string; startWeek: number };
  isWeekBlank?: boolean;
  prelude?: ReactNode;
  onClearSelection: () => void;
  onRequestOpportunitySelection?: () => void;
  onDaySlotClick: (dayIndex: number) => void;
  onUnscheduleActivity: (dayIndex: number) => void;
  onDaySlotDrop: (event: React.DragEvent, dayIndex: number) => void;
  onDragEnterDay: (dayIndex: number) => void;
  onDragLeaveDay: () => void;
  onHoverDay: (dayIndex: number | null) => void;
  canScheduleAt: (activity: Activity, dayIndex: number) => boolean;
  translateDay: (key: string) => string;
}

export function PlannerWeekStrip({
  dayKeys,
  activities,
  selectedActivity,
  receiptMessage,
  dragOverDay,
  hoverDay,
  slotsUsed,
  openDayCount,
  severity,
  upcomingEvent,
  isWeekBlank = false,
  prelude,
  onClearSelection,
  onRequestOpportunitySelection,
  onDaySlotClick,
  onUnscheduleActivity,
  onDaySlotDrop,
  onDragEnterDay,
  onDragLeaveDay,
  onHoverDay,
  canScheduleAt,
  translateDay,
}: PlannerWeekStripProps) {
  const firstOpenDayIndex = activities.findIndex((activity) => !activity);
  const previewStart = selectedActivity && hoverDay != null && canScheduleAt(selectedActivity, hoverDay)
    ? hoverDay
    : null;
  const previewDays = new Set<number>();
  if (selectedActivity && previewStart != null) {
    for (let index = previewStart; index < previewStart + selectedActivity.slots; index++) {
      previewDays.add(index);
    }
  }

  return (
    <section
      id="planner-itinerary"
      data-tutorial-id="calendar-grid"
      aria-labelledby="itinerary-heading"
      className="sticky -top-4 z-20 -mx-2 mb-4 rounded-2xl border border-emerald-400/20 bg-[#0c1217]/95 p-3 shadow-2xl shadow-black/40 backdrop-blur-xl sm:mx-0 md:top-0 sm:p-4"
    >
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="itinerary-heading" className="text-base font-semibold text-white">
              Weekly itinerary
            </h2>
            <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
              {slotsUsed}/7 days committed
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
              severity === "danger"
                ? "border-red-400/25 bg-red-400/10 text-red-200"
                : severity === "warn"
                  ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
                  : "border-sky-400/25 bg-sky-400/10 text-sky-200"
            }`}>
              {severity === "danger" ? "Fatigue under pressure" : severity === "warn" ? "Fatigue needs room" : "Condition stable"}
            </span>
          </div>
          <p className="mt-1 text-sm leading-6 text-zinc-300" aria-live="polite">
            {selectedActivity
              ? `${ACTIVITY_DISPLAY[selectedActivity.type]?.label ?? "Selected activity"} is live in compare mode. Choose a start day in the strip.`
              : `${openDayCount} open day${openDayCount === 1 ? "" : "s"}. The strip is the week: every placement should make the next choice harder or clearer.`}
          </p>
        </div>
        {selectedActivity && (
          <button
            type="button"
            onClick={onClearSelection}
            className="min-h-11 rounded-lg border border-white/10 px-4 text-sm font-semibold text-zinc-200 transition hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
          >
            Clear selection
          </button>
        )}
      </div>

      {prelude && <div className="mb-4">{prelude}</div>}

      {receiptMessage && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="workspace-receipt-pulse mb-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-2 text-sm text-emerald-100"
        >
          {receiptMessage}
        </div>
      )}

      <div
        className="grid grid-cols-7 gap-1 pb-1 sm:gap-2"
        tabIndex={0}
        role="region"
        aria-label="Weekly itinerary days. Use left and right arrow keys to scroll."
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          event.currentTarget.scrollBy({
            left: event.key === "ArrowLeft" ? -220 : 220,
            behavior: "smooth",
          });
        }}
      >
        {dayKeys.map((dayKey, dayIndex) => {
          const activity = activities[dayIndex];
          const display = activity ? ACTIVITY_DISPLAY[activity.type] : null;
          const Icon = display?.icon;
          const canPlaceSelected = !!selectedActivity && canScheduleAt(selectedActivity, dayIndex);
          const canPromptSelection = !selectedActivity && !!onRequestOpportunitySelection;
          const isDropTarget = dragOverDay === dayIndex && !activity;
          const isPreviewed = previewDays.has(dayIndex);
          const isPrimaryOpportunityPrompt =
            !selectedActivity && canPromptSelection && dayIndex === firstOpenDayIndex;
          const renderExpandedEmptyState = selectedActivity ? true : isPrimaryOpportunityPrompt;
          const isPassiveBlankDay =
            isWeekBlank && !activity && !selectedActivity && !isPrimaryOpportunityPrompt;

          return (
            <div
              key={dayKey}
              className={`workspace-interactive relative min-h-[88px] min-w-0 rounded-xl border p-2 transition sm:min-h-[120px] sm:p-3 xl:min-h-[132px] ${
                activity
                  ? "border-emerald-400/25 bg-emerald-400/[0.06]"
                  : isPreviewed
                    ? "border-blue-300/45 bg-blue-400/[0.08]"
                    : canPlaceSelected || isDropTarget
                      ? "border-blue-400/35 bg-blue-400/[0.06]"
                      : isPassiveBlankDay
                        ? "border-transparent bg-transparent xl:px-2"
                        : isWeekBlank
                        ? "border-emerald-400/18 bg-emerald-400/[0.04]"
                        : "border-white/10 bg-black/25"
              }`}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                onDragEnterDay(dayIndex);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                  onDragLeaveDay();
                }
              }}
              onDrop={(event) => onDaySlotDrop(event, dayIndex)}
              onMouseEnter={() => onHoverDay(dayIndex)}
              onMouseLeave={() => onHoverDay(null)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                    {translateDay(dayKey)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">
                    {activity
                      ? "Committed"
                      : canPlaceSelected
                        ? "Available start"
                        : canPromptSelection
                          ? isWeekBlank
                            ? "Needs the first call"
                            : "Open for a decision"
                          : "Open day"}
                  </p>
                </div>
                {activity && display && (
                  <button
                    type="button"
                    onClick={() => onUnscheduleActivity(dayIndex)}
                    className="flex h-11 w-11 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-red-500/10 hover:text-red-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                    aria-label={`Remove ${display.label} from ${translateDay(dayKey)}`}
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                )}
              </div>

              {activity && display && Icon ? (
                <div className="mt-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <span className={`mt-0.5 rounded-lg border border-white/10 bg-black/30 p-2 ${display.color}`}>
                      <Icon size={16} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${display.color}`}>{display.label}</p>
                      <p className="mt-1 line-clamp-3 text-xs leading-5 text-zinc-300">{activity.description}</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-zinc-400">
                    Occupies {activity.slots} day{activity.slots === 1 ? "" : "s"}.
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedActivity) {
                      onDaySlotClick(dayIndex);
                      return;
                    }
                    onRequestOpportunitySelection?.();
                  }}
                  disabled={selectedActivity ? !canPlaceSelected : !canPromptSelection}
                  aria-label={
                    selectedActivity
                      ? `Place ${ACTIVITY_DISPLAY[selectedActivity.type]?.label ?? "activity"} on ${translateDay(dayKey)}`
                      : `${translateDay(dayKey)} open day — choose work`
                  }
                  data-planner-day-button="true"
                  data-day-index={dayIndex}
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                    const current = event.currentTarget as HTMLButtonElement;
                    const container = current.closest("[data-tutorial-id='calendar-grid']");
                    if (!container) return;
                    const buttons = Array.from(
                      container.querySelectorAll<HTMLButtonElement>("[data-planner-day-button='true']"),
                    );
                    const currentIndex = buttons.indexOf(current);
                    if (currentIndex < 0) return;
                    const delta = event.key === "ArrowRight" ? 1 : -1;
                    const next = buttons[currentIndex + delta];
                    if (!next) return;
                    event.preventDefault();
                    next.focus();
                  }}
                  className={`workspace-interactive mt-4 flex min-h-[68px] w-full flex-col items-start justify-center rounded-xl border px-3 py-3 text-left text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400 ${
                    selectedActivity
                      ? canPlaceSelected
                        ? "border-blue-400/30 bg-blue-400/[0.06] font-semibold text-blue-100 hover:bg-blue-400/10"
                        : "border-white/10 bg-black/20 text-zinc-500"
                      : renderExpandedEmptyState
                        ? "border-emerald-400/35 bg-emerald-400/[0.08] text-white hover:bg-emerald-400/[0.12]"
                        : isPassiveBlankDay
                          ? "border-dashed border-white/10 bg-transparent text-zinc-400 hover:border-emerald-400/25 hover:bg-emerald-400/[0.04] hover:text-zinc-200 xl:min-h-[48px] xl:rounded-lg xl:px-2"
                        : "border-white/12 bg-white/[0.04] text-zinc-200 hover:bg-white/[0.07]"
                  }`}
                >
                  <span className={`${renderExpandedEmptyState || selectedActivity ? "text-sm" : "text-[13px]"} font-semibold`}>
                    {selectedActivity
                      ? canPlaceSelected
                        ? "Place here"
                        : "Unavailable"
                      : renderExpandedEmptyState
                        ? isWeekBlank
                          ? "Choose the first live look"
                          : "Choose the next live look"
                        : "Open day"}
                  </span>
                  {(selectedActivity || renderExpandedEmptyState) && (
                    <span
                      className={`mt-1 text-xs leading-5 ${
                        selectedActivity
                          ? canPlaceSelected
                            ? "text-blue-100/85"
                            : "text-zinc-500"
                          : "text-emerald-100/85"
                      }`}
                    >
                      {selectedActivity
                        ? canPlaceSelected
                          ? `Commit ${selectedActivity.slots} day${selectedActivity.slots === 1 ? "" : "s"} here.`
                          : "This slot is blocked by another commitment."
                        : isWeekBlank
                          ? "Start the week with evidence, access, or recovery before the trail goes quiet."
                          : "Use one open slot to make the next evidence choice clearer."}
                    </span>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {(upcomingEvent || severity !== "ok") && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/8 pt-3 text-[11px]">
          {upcomingEvent && (
            <span className="text-zinc-300">
              Next event: <strong className="font-semibold text-white">{upcomingEvent.name}</strong> in W{upcomingEvent.startWeek}
            </span>
          )}
          {severity !== "ok" && (
            <span className={severity === "danger" ? "text-red-300" : "text-amber-300"}>
              {severity === "danger" ? "Accuracy is at risk; protect a recovery day." : "Moderate fatigue; leave room for recovery."}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
