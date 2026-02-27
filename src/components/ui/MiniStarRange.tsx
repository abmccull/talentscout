"use client";

import type { PerceivedAbility } from "@/engine/scout/perceivedAbility";

/**
 * FM-style compact star rating for table cells.
 *
 * Gold (★) = certain ability (low bound).
 * White (☆) = uncertainty range (low → high).
 * Dark  (★) = empty (remaining to 5).
 *
 * Half-star support: .5 values render as half-width stars.
 */

interface MiniStarRangeProps {
  perceived: PerceivedAbility | null;
  mode: "ca" | "pa";
}

export function MiniStarRange({ perceived, mode }: MiniStarRangeProps) {
  if (!perceived) {
    return <span className="text-zinc-600">?</span>;
  }

  const low = mode === "ca" ? perceived.caLow : perceived.paLow;
  const high = mode === "ca" ? perceived.caHigh : perceived.paHigh;

  return <FMStars low={low} high={high} />;
}

// ─── FM-style star rendering ────────────────────────────────────────────────

interface FMStarsProps {
  low: number;   // certain floor (0.5–5.0)
  high: number;  // uncertain ceiling (0.5–5.0)
}

function FMStars({ low, high }: FMStarsProps) {
  // Clamp values
  const lo = Math.max(0, Math.min(5, low));
  const hi = Math.max(lo, Math.min(5, high));

  return (
    <span className="inline-flex items-center gap-px text-[10px]">
      {Array.from({ length: 5 }, (_, i) => {
        const pos = i + 1;
        // Determine what this star position represents
        const goldFill = getFill(lo, pos);
        const whiteFill = getFill(hi, pos);

        if (goldFill === "full") {
          return <span key={i} className="text-amber-400">★</span>;
        }
        if (goldFill === "half") {
          // Half gold + check if the other half is white
          if (whiteFill === "full") {
            return <HalfStar key={i} leftClass="text-amber-400" rightClass="text-zinc-400" />;
          }
          return <HalfStar key={i} leftClass="text-amber-400" rightClass="text-zinc-700" />;
        }
        // No gold — check white
        if (whiteFill === "full") {
          return <span key={i} className="text-zinc-400">★</span>;
        }
        if (whiteFill === "half") {
          return <HalfStar key={i} leftClass="text-zinc-400" rightClass="text-zinc-700" />;
        }
        // Empty
        return <span key={i} className="text-zinc-700">★</span>;
      })}
    </span>
  );
}

/** Determine if a star position is fully filled, half filled, or empty given a rating. */
function getFill(rating: number, starPos: number): "full" | "half" | "empty" {
  if (rating >= starPos) return "full";
  if (rating >= starPos - 0.5) return "half";
  return "empty";
}

/** Render a star split into two halves with different colors. */
function HalfStar({ leftClass, rightClass }: { leftClass: string; rightClass: string }) {
  return (
    <span className="relative inline-block w-[10px] h-[10px]">
      {/* Right half (background) */}
      <span className={`absolute inset-0 ${rightClass}`}>★</span>
      {/* Left half (foreground, clipped) */}
      <span className={`absolute inset-0 overflow-hidden w-[5px] ${leftClass}`}>★</span>
    </span>
  );
}
