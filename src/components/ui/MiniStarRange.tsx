"use client";

import type { PerceivedAbility } from "@/engine/scout/perceivedAbility";

/**
 * Compact uncertainty-aware star rating for table cells.
 *
 * Shows ranges, fading, and "?" states depending on the scout's
 * confidence and the width of the perceived range.
 */

interface MiniStarRangeProps {
  perceived: PerceivedAbility | null;
  mode: "ca" | "pa";
}

export function MiniStarRange({ perceived, mode }: MiniStarRangeProps) {
  if (!perceived) {
    return <span className="text-zinc-600">?</span>;
  }

  const opacity = mode === "ca"
    ? 0.4 + perceived.caConfidence * 0.6
    : 0.4 + perceived.paConfidence * 0.6;

  if (mode === "ca") {
    return <CADisplay perceived={perceived} opacity={opacity} />;
  }
  return <PADisplay perceived={perceived} opacity={opacity} />;
}

// ─── CA display ─────────────────────────────────────────────────────────────

function CADisplay({
  perceived,
  opacity,
}: {
  perceived: PerceivedAbility;
  opacity: number;
}) {
  const spread = perceived.caHigh - perceived.caLow;

  // Wide range: show text range
  if (spread > 1.5) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-[10px] font-mono text-zinc-300"
        style={{ opacity }}
      >
        <span className="text-amber-400">★</span>
        {perceived.caLow.toFixed(1)}-{perceived.caHigh.toFixed(1)}
      </span>
    );
  }

  // Medium range: show stars with spread indicator
  if (spread > 0.5) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-[10px]"
        style={{ opacity }}
      >
        <MiniStarsInline rating={perceived.ca} />
        <span className="text-zinc-500 font-mono ml-0.5">
          ±{(spread / 2).toFixed(1)}
        </span>
      </span>
    );
  }

  // Narrow range: solid stars
  return (
    <span style={{ opacity }}>
      <MiniStarsInline rating={perceived.ca} />
    </span>
  );
}

// ─── PA display ─────────────────────────────────────────────────────────────

function PADisplay({
  perceived,
  opacity,
}: {
  perceived: PerceivedAbility;
  opacity: number;
}) {
  const spread = perceived.paHigh - perceived.paLow;

  // Wide range: show text range
  if (spread > 0.5) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-[10px] font-mono text-zinc-300"
        style={{ opacity }}
      >
        <span className="text-amber-400">★</span>
        {perceived.paLow.toFixed(1)}-{perceived.paHigh.toFixed(1)}
      </span>
    );
  }

  // Narrow range: solid stars
  return (
    <span style={{ opacity }}>
      <MiniStarsInline rating={perceived.paLow} />
    </span>
  );
}

// ─── Shared star rendering ──────────────────────────────────────────────────

function MiniStarsInline({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  const empty = 5 - full - (half ? 1 : 0);
  return (
    <span className="inline-flex items-center gap-px text-[10px]">
      {Array.from({ length: full }, (_, i) => (
        <span key={`f${i}`} className="text-amber-400">★</span>
      ))}
      {half && <span className="text-amber-400/60">★</span>}
      {Array.from({ length: empty }, (_, i) => (
        <span key={`e${i}`} className="text-zinc-700">★</span>
      ))}
    </span>
  );
}
