"use client";

import { useState } from "react";
import type {
  SeasonEvent,
  SeasonEventType,
  SeasonEventEffect,
  SeasonEventEffectType,
} from "@/engine/core/types";

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

/** Human-readable labels for effect types. */
const EFFECT_TYPE_LABELS: Record<SeasonEventEffectType, string> = {
  transferPriceModifier: "Transfer Prices",
  scoutingCostModifier: "Scouting Cost",
  fatigueModifier: "Fatigue",
  reputationBonus: "Reputation",
  youthIntake: "Youth Prospects",
  playerAvailability: "Availability",
  injuryRiskModifier: "Injury Risk",
  attributeRevealBonus: "Reveal Quality",
};

/** Badge color for each effect type. */
const EFFECT_TYPE_BADGE_COLORS: Record<SeasonEventEffectType, string> = {
  transferPriceModifier: "bg-emerald-900/60 text-emerald-300 border-emerald-700/50",
  scoutingCostModifier: "bg-sky-900/60 text-sky-300 border-sky-700/50",
  fatigueModifier: "bg-orange-900/60 text-orange-300 border-orange-700/50",
  reputationBonus: "bg-purple-900/60 text-purple-300 border-purple-700/50",
  youthIntake: "bg-pink-900/60 text-pink-300 border-pink-700/50",
  playerAvailability: "bg-red-900/60 text-red-300 border-red-700/50",
  injuryRiskModifier: "bg-red-900/60 text-red-300 border-red-700/50",
  attributeRevealBonus: "bg-cyan-900/60 text-cyan-300 border-cyan-700/50",
};

// =============================================================================
// PROPS
// =============================================================================

interface SeasonTimelineProps {
  seasonEvents: SeasonEvent[];
  currentWeek: number;
  onResolveEvent?: (eventId: string, choiceIndex: number) => void;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Convert a week number to a percentage position on the timeline (0-100).
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

/**
 * Format an effect value as a human-readable string.
 * Positive modifiers show +, negative show -.
 */
function formatEffectValue(effect: SeasonEventEffect): string {
  const val = effect.value;
  if (
    effect.type === "reputationBonus" ||
    effect.type === "youthIntake"
  ) {
    return val > 0 ? `+${val}` : `${val}`;
  }
  // Percentage-based modifiers
  const pct = Math.round(val * 100);
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/** Compact badge showing a single effect. */
function EffectBadge({ effect }: { effect: SeasonEventEffect }) {
  const label = EFFECT_TYPE_LABELS[effect.type];
  const colorClass = EFFECT_TYPE_BADGE_COLORS[effect.type];
  const valueStr = formatEffectValue(effect);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${colorClass}`}
      title={`${label}: ${valueStr}`}
    >
      {label} {valueStr}
    </span>
  );
}

/** Modal overlay for choosing a season event option. */
function ChoiceModal({
  event,
  onChoose,
  onClose,
}: {
  event: SeasonEvent;
  onChoose: (choiceIndex: number) => void;
  onClose: () => void;
}) {
  if (!event.choices) return null;
  const textColorClass = EVENT_TYPE_TEXT_COLORS[event.type];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border border-zinc-700 bg-[#1a1a1a] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className={`mb-1 text-sm font-bold ${textColorClass}`}>
          {event.name}
        </h3>
        <p className="mb-4 text-xs text-zinc-400">{event.description}</p>

        <div className="space-y-3">
          {event.choices.map((choice, idx) => (
            <button
              key={idx}
              onClick={() => onChoose(idx)}
              className="w-full rounded-md border border-zinc-600 bg-zinc-800 p-3 text-left transition-colors hover:border-zinc-500 hover:bg-zinc-700"
            >
              <div className="mb-1 text-xs font-semibold text-zinc-200">
                {choice.label}
              </div>
              <div className="mb-2 text-[11px] text-zinc-400">
                {choice.description}
              </div>
              <div className="flex flex-wrap gap-1">
                {choice.effects.map((eff, effIdx) => (
                  <EffectBadge key={effIdx} effect={eff} />
                ))}
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-md border border-zinc-600 bg-zinc-800 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-700"
        >
          Decide Later
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function SeasonTimeline({
  seasonEvents,
  currentWeek,
  onResolveEvent,
}: SeasonTimelineProps) {
  const [choiceEvent, setChoiceEvent] = useState<SeasonEvent | null>(null);

  if (seasonEvents.length === 0) return null;

  const currentWeekPercent = weekToPercent(currentWeek);

  const handleChoose = (choiceIndex: number) => {
    if (choiceEvent && onResolveEvent) {
      onResolveEvent(choiceEvent.id, choiceIndex);
    }
    setChoiceEvent(null);
  };

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
                  title={`${event.name} (Weeks ${event.startWeek}--${event.endWeek})`}
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
            const hasUnresolvedChoice =
              isActive && event.choices && event.choices.length > 0 && !event.resolved;

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
                {hasUnresolvedChoice && onResolveEvent && (
                  <button
                    onClick={() => setChoiceEvent(event)}
                    className="ml-1 rounded border border-amber-600/50 bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 transition-colors hover:bg-amber-800/50"
                  >
                    Choose
                  </button>
                )}
                {isActive && event.resolved && event.choices && event.choiceSelected !== undefined && (
                  <span className="ml-1 text-[10px] text-zinc-500">
                    ({event.choices[event.choiceSelected]?.label})
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Active effect badges */}
        {seasonEvents.some(
          (e) =>
            e.startWeek <= currentWeek &&
            currentWeek <= e.endWeek &&
            e.effects &&
            e.effects.length > 0,
        ) && (
          <div className="mt-3 border-t border-zinc-800 pt-2">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              Active Effects
            </div>
            <div className="flex flex-wrap gap-1.5">
              {seasonEvents
                .filter(
                  (e) =>
                    e.startWeek <= currentWeek &&
                    currentWeek <= e.endWeek,
                )
                .flatMap((e) => {
                  // Show choice effects if resolved, otherwise base effects
                  const effects =
                    e.resolved &&
                    e.choiceSelected !== undefined &&
                    e.choices?.[e.choiceSelected]
                      ? e.choices[e.choiceSelected].effects
                      : e.effects ?? [];
                  return effects.map((eff, idx) => (
                    <EffectBadge key={`${e.id}-${idx}`} effect={eff} />
                  ));
                })}
            </div>
          </div>
        )}
      </div>

      {/* Choice modal */}
      {choiceEvent && (
        <ChoiceModal
          event={choiceEvent}
          onChoose={handleChoose}
          onClose={() => setChoiceEvent(null)}
        />
      )}
    </section>
  );
}
