"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, Clock, Flag } from "lucide-react";
import type { SessionFlaggedMoment } from "@/engine/observation/types";

// =============================================================================
// Types
// =============================================================================

interface MomentTimelineProps {
  flaggedMoments: SessionFlaggedMoment[];
  onRemoveFlag?: (flagId: string) => void;
}

// =============================================================================
// Constants
// =============================================================================

type Reaction = SessionFlaggedMoment["reaction"];

const REACTION_CONFIG: Record<
  Reaction,
  { label: string; textColor: string; bgColor: string; borderColor: string; dotColor: string }
> = {
  promising: {
    label: "Promising",
    textColor: "text-green-400",
    bgColor: "bg-green-500/15",
    borderColor: "border-green-500/30",
    dotColor: "bg-green-400",
  },
  concerning: {
    label: "Concerning",
    textColor: "text-red-400",
    bgColor: "bg-red-500/15",
    borderColor: "border-red-500/30",
    dotColor: "bg-red-400",
  },
  interesting: {
    label: "Interesting",
    textColor: "text-blue-400",
    bgColor: "bg-blue-500/15",
    borderColor: "border-blue-500/30",
    dotColor: "bg-blue-400",
  },
  needs_more_data: {
    label: "Needs data",
    textColor: "text-amber-400",
    bgColor: "bg-amber-500/15",
    borderColor: "border-amber-500/30",
    dotColor: "bg-amber-400",
  },
};

// =============================================================================
// Sub-components
// =============================================================================

function ReactionBadge({ reaction }: { reaction: Reaction }) {
  const { label, textColor, bgColor, borderColor } = REACTION_CONFIG[reaction];
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${textColor} ${bgColor} ${borderColor}`}
    >
      {label}
    </span>
  );
}

function TimelineEntry({
  flaggedMoment,
  isLast,
  onRemoveFlag,
}: {
  flaggedMoment: SessionFlaggedMoment;
  isLast: boolean;
  onRemoveFlag?: (flagId: string) => void;
}) {
  const { id, phaseIndex, moment, reaction, minute, note } = flaggedMoment;
  const { dotColor } = REACTION_CONFIG[reaction];

  // Truncate description to a readable snippet
  const snippet =
    moment.description.length > 120
      ? `${moment.description.slice(0, 120).trimEnd()}…`
      : moment.description;

  return (
    <li className="relative flex gap-3">
      {/* Timeline spine */}
      <div className="flex flex-col items-center">
        <div
          className={`mt-1 h-3 w-3 flex-shrink-0 rounded-full ring-2 ring-zinc-900 ${dotColor}`}
          aria-hidden="true"
        />
        {!isLast && (
          <div
            className="mt-1 w-px flex-1 bg-zinc-700/60"
            aria-hidden="true"
          />
        )}
      </div>

      {/* Entry card */}
      <div className="mb-4 min-w-0 flex-1 rounded-lg border border-zinc-700/50 bg-zinc-800/50 px-3 py-2.5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="flex items-center gap-1 text-xs font-medium text-zinc-400">
              <Clock className="h-3 w-3" aria-hidden="true" />
              {minute}&prime;
            </span>
            <span className="text-xs text-zinc-600">·</span>
            <span className="text-xs text-zinc-500">Phase {phaseIndex + 1}</span>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <ReactionBadge reaction={reaction} />
            {onRemoveFlag && (
              <button
                type="button"
                onClick={() => onRemoveFlag(id)}
                aria-label={`Remove flag for moment at minute ${minute}`}
                className="rounded p-0.5 text-zinc-600 transition-colors hover:bg-zinc-700 hover:text-zinc-300"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        {/* Player ID */}
        <p className="mt-1 text-xs font-semibold text-zinc-200">
          {moment.playerId}
        </p>

        {/* Moment description snippet */}
        <p className="mt-1 text-xs leading-relaxed text-zinc-400">{snippet}</p>

        {/* Optional scout note */}
        {note && (
          <blockquote className="mt-2 border-l-2 border-zinc-600 pl-2 text-xs italic text-zinc-500">
            &ldquo;{note}&rdquo;
          </blockquote>
        )}
      </div>
    </li>
  );
}

// =============================================================================
// Main component
// =============================================================================

export function MomentTimeline({
  flaggedMoments,
  onRemoveFlag,
}: MomentTimelineProps) {
  const sorted = [...flaggedMoments].sort(
    (a, b) => a.minute - b.minute || a.phaseIndex - b.phaseIndex,
  );

  return (
    <section
      aria-label="Flagged moments timeline"
      className="flex flex-col"
    >
      <div className="mb-3 flex items-center gap-2">
        <Flag className="h-4 w-4 text-amber-400" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-zinc-200">
          Flagged Moments
        </h2>
        {sorted.length > 0 && (
          <span className="ml-auto rounded-full bg-zinc-700 px-2 py-0.5 text-xs tabular-nums text-zinc-400">
            {sorted.length}
          </span>
        )}
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-700 bg-zinc-900/40 px-4 py-8 text-center">
          <Flag className="mb-2 h-6 w-6 text-zinc-600" aria-hidden="true" />
          <p className="text-sm font-medium text-zinc-400">
            No moments flagged yet.
          </p>
          <p className="mt-1 max-w-[200px] text-xs leading-relaxed text-zinc-600">
            Flag moments during observation to build a player timeline.
          </p>
        </div>
      ) : (
        <div className="overflow-y-auto pr-1" style={{ maxHeight: "60vh" }}>
          <ul
            role="list"
            aria-label="Timeline entries"
            className="space-y-0"
          >
            {sorted.map((fm, idx) => (
              <TimelineEntry
                key={fm.id}
                flaggedMoment={fm}
                isLast={idx === sorted.length - 1}
                onRemoveFlag={onRemoveFlag}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
