"use client";

import { useEffect, useRef } from "react";
import type { MatchEvent } from "@/engine/core/types";
import {
  getCommentary,
  getScoreStatePrefix,
  getWeatherInterjection,
  getChainCommentary,
  getMomentumCommentary,
  type ScoreContext,
} from "@/engine/match/commentary";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommentaryPlayer {
  firstName: string;
  lastName: string;
  clubId: string;
}

export interface CommentaryClub {
  name: string;
}

export interface CommentaryProps {
  events: MatchEvent[];
  players: Record<string, CommentaryPlayer>;
  clubs: Record<string, CommentaryClub>;
  focusedPlayerIds?: Set<string>;
  /** Current weather condition for interjections */
  weather?: string;
  /** Running score for contextual prefixes */
  homeGoals?: number;
  awayGoals?: number;
  /** Set of home team player IDs (for score-state direction) */
  homePlayerIds?: Set<string>;
  /** Current phase momentum (0-100) */
  momentum?: number;
  /** Previous phase momentum (0-100) for shift detection */
  prevMomentum?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function qualityDotClass(quality: number): string {
  if (quality >= 8) return "bg-emerald-500";
  if (quality >= 4) return "bg-amber-500";
  return "bg-red-500";
}

function qualityLabel(quality: number): string {
  if (quality >= 8) return "High quality";
  if (quality >= 4) return "Mid quality";
  return "Low quality";
}

const EVENT_TYPE_ICONS: Record<string, string> = {
  goal:        "⚽",
  assist:      "🎯",
  shot:        "💥",
  pass:        "🔄",
  dribble:     "⚡",
  tackle:      "🛡️",
  header:      "🏃",
  save:        "🧤",
  foul:        "🟨",
  cross:       "↗",
  sprint:      "💨",
  positioning: "📍",
  error:       "❌",
  leadership:  "📣",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Commentary({
  events,
  players,
  clubs,
  focusedPlayerIds = new Set(),
  weather,
  homeGoals = 0,
  awayGoals = 0,
  homePlayerIds,
  momentum = 50,
  prevMomentum = 50,
}: CommentaryProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top when new events appear
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [events.length]);

  // Events newest first
  const displayEvents = [...events].reverse();

  if (displayEvents.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
        No events in this phase yet.
      </div>
    );
  }

  // Build recent player ID list for chain detection (original order)
  const recentPlayerIds = events.map((e) => e.playerId);

  return (
    <div
      ref={scrollContainerRef}
      className="overflow-y-auto h-full space-y-2 pr-1"
      aria-label="Match commentary"
      aria-live="polite"
    >
      {displayEvents.map((event, i) => {
        const player = players[event.playerId];
        const playerName = player
          ? `${player.firstName} ${player.lastName}`
          : "Unknown";
        const club = player?.clubId ? clubs[player.clubId] : undefined;
        const clubName = club?.name ?? "";

        // Base commentary from quality-aware templates
        let commentary = getCommentary(
          event.type,
          event.quality,
          playerName,
          clubName,
          event.minute,
        );

        // Enrich: score-state prefix (only on first event shown)
        if (i === displayEvents.length - 1 && homePlayerIds) {
          const scoreCtx: ScoreContext = {
            homeGoals,
            awayGoals,
            minute: event.minute,
            isHome: homePlayerIds.has(event.playerId),
          };
          const prefix = getScoreStatePrefix(scoreCtx, event.minute);
          if (prefix) commentary = prefix + commentary;
        }

        // Enrich: momentum commentary (only on first event)
        if (i === displayEvents.length - 1) {
          const momComment = getMomentumCommentary(momentum, prevMomentum, event.minute);
          if (momComment) commentary = momComment + commentary;
        }

        // Enrich: weather interjection
        if (weather) {
          const weatherText = getWeatherInterjection(weather, event.minute);
          if (weatherText) commentary = commentary + weatherText;
        }

        // Enrich: chain commentary (same player in consecutive events)
        const eventOriginalIndex = events.length - 1 - i;
        if (eventOriginalIndex > 0) {
          const preceding = recentPlayerIds.slice(0, eventOriginalIndex);
          const chain = getChainCommentary(event.playerId, preceding, playerName, event.minute);
          if (chain) commentary = commentary + chain;
        }

        const isFocused = focusedPlayerIds.has(event.playerId);
        const icon = EVENT_TYPE_ICONS[event.type] ?? "•";

        return (
          <article
            key={`${event.minute}-${event.type}-${i}`}
            className={`rounded-md border p-3 transition-colors ${
              isFocused
                ? "border-emerald-500/40 bg-emerald-500/5"
                : "border-[#27272a] bg-[#141414]"
            }`}
          >
            <div className="flex items-start gap-2.5">
              {/* Minute */}
              <span
                className="shrink-0 tabular-nums text-xs text-zinc-500 pt-0.5 min-w-[28px]"
                aria-label={`Minute ${event.minute}`}
              >
                {event.minute}&apos;
              </span>

              {/* Event icon */}
              <span
                className="shrink-0 text-sm leading-none pt-0.5"
                aria-hidden="true"
              >
                {icon}
              </span>

              {/* Commentary text */}
              <div className="flex-1 min-w-0">
                <p className="text-xs leading-relaxed text-zinc-300">
                  {commentary}
                </p>

                {/* Attribute pills */}
                {event.attributesRevealed.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1" aria-label="Attributes revealed">
                    {event.attributesRevealed.map((attr) => (
                      <span
                        key={attr}
                        className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          isFocused
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                            : "bg-zinc-800 text-zinc-500 border border-zinc-700"
                        }`}
                      >
                        {attr.replace(/([A-Z])/g, " $1").trim()}
                        {isFocused && (
                          <span className="text-[9px] text-emerald-500" aria-label="observation recorded">
                            +obs
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Quality indicator */}
              <div className="shrink-0 flex items-center gap-1.5 pt-0.5">
                <div
                  className={`h-2 w-2 rounded-full ${qualityDotClass(event.quality)}`}
                  title={`${qualityLabel(event.quality)}: ${event.quality}/10`}
                  role="img"
                  aria-label={`${qualityLabel(event.quality)}: ${event.quality} out of 10`}
                />
                <span className="text-[10px] tabular-nums text-zinc-500">
                  {event.quality}
                </span>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
