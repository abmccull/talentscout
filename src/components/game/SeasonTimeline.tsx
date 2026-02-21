"use client";

import type { SeasonEvent, SeasonEventType } from "@/engine/core/types";

// =============================================================================
// CONSTANTS
// =============================================================================

const TOTAL_WEEKS = 38;

/** Tailwind background colour classes for each event type. */
const EVENT_TYPE_COLORS: Record<SeasonEventType, string> = {
  preSeasonTournament: "bg-amber-500",
  summerTransferWindow: "bg-emerald-500",
  winterTransferWindow: "bg-emerald-500",
  internationalBreak: "bg-blue-500",
  youthCup: "bg-pink-500",
  endOfSeasonReview: "bg-purple-500",
};

/** Tailwind text colour classes for event labels (matching their bar colour). */
const EVENT_TYPE_TEXT_COLORS: Record<SeasonEventType, string> = {
  preSeasonTournament: "text-amber-400",
  summerTransferWindow: "text-emerald-400",
  winterTransferWindow: "text-emerald-400",
  internationalBreak: "text-blue-400",
  youthCup: "text-pink-400",
  endOfSeasonReview: "text-purple-400",
};

// =============================================================================
// PROPS
// =============================================================================

interface SeasonTimelineProps {
  seasonEvents: SeasonEvent[];
  currentWeek: number;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Convert a week number to a percentage position on the timeline (0–100).
 * Week 1 maps to 0%, week 38 maps to 100%.
 */
function weekToPercent(week: number): number {
  return ((week - 1) / (TOTAL_WEEKS - 1)) * 100;
}

/**
 * Calculate width percentage for a segment spanning startWeek to endWeek
 * inclusive. One week occupies 1/(TOTAL_WEEKS-1) of the bar width.
 */
function segmentWidthPercent(startWeek: number, endWeek: number): number {
  return ((endWeek - startWeek + 1) / (TOTAL_WEEKS - 1)) * 100;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function SeasonTimeline({ seasonEvents, currentWeek }: SeasonTimelineProps) {
  if (seasonEvents.length === 0) return null;

  const currentWeekPercent = weekToPercent(currentWeek);

  return (
    <section aria-label="Season timeline" className="mb-6">
      <div className="rounded-lg border border-[#27272a] bg-[#141414] p-4">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Season Calendar — Week {currentWeek} of {TOTAL_WEEKS}
        </h2>

        {/* Timeline bar */}
        <div className="relative">
          {/* Background track */}
          <div
            className="relative h-4 w-full overflow-hidden rounded-full bg-zinc-800"
            role="img"
            aria-label={`Season timeline showing week ${currentWeek} of ${TOTAL_WEEKS}`}
          >
            {/* Event segments */}
            {seasonEvents.map((event) => {
              const leftPercent = weekToPercent(event.startWeek);
              const widthPercent = segmentWidthPercent(event.startWeek, event.endWeek);
              const colorClass = EVENT_TYPE_COLORS[event.type];

              return (
                <div
                  key={event.id}
                  title={`${event.name} (Weeks ${event.startWeek}–${event.endWeek})`}
                  aria-label={`${event.name}, weeks ${event.startWeek} to ${event.endWeek}`}
                  className={`absolute top-0 h-full opacity-80 ${colorClass}`}
                  style={{
                    left: `${leftPercent}%`,
                    width: `${widthPercent}%`,
                  }}
                />
              );
            })}

            {/* Current week indicator */}
            <div
              aria-hidden="true"
              className="absolute top-0 h-full w-0.5 bg-white shadow-[0_0_4px_rgba(255,255,255,0.6)]"
              style={{ left: `${currentWeekPercent}%` }}
            />
          </div>

          {/* Week number labels: start, mid, end */}
          <div className="mt-1 flex justify-between text-[10px] text-zinc-600" aria-hidden="true">
            <span>W1</span>
            <span>W10</span>
            <span>W20</span>
            <span>W28</span>
            <span>W38</span>
          </div>
        </div>

        {/* Event legend */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {seasonEvents.map((event) => {
            const isActive = event.startWeek <= currentWeek && currentWeek <= event.endWeek;
            const isUpcoming = event.startWeek > currentWeek;
            const textColorClass = EVENT_TYPE_TEXT_COLORS[event.type];
            const dotColorClass = EVENT_TYPE_COLORS[event.type];

            return (
              <div
                key={event.id}
                className={`flex items-center gap-1.5 ${isActive ? "opacity-100" : isUpcoming ? "opacity-60" : "opacity-30"}`}
              >
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 shrink-0 rounded-full ${dotColorClass}`}
                />
                <span className={`text-[11px] font-medium ${isActive ? textColorClass : "text-zinc-400"}`}>
                  {event.name}
                  {isActive && (
                    <span className="ml-1 text-[10px] font-normal text-zinc-500">
                      (active)
                    </span>
                  )}
                  {isUpcoming && (
                    <span className="ml-1 text-[10px] font-normal text-zinc-600">
                      wk {event.startWeek}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
