"use client";

import { Star } from "lucide-react";

// ---------------------------------------------------------------------------
// StarRating — renders a single-value star rating (no uncertainty range)
// ---------------------------------------------------------------------------

const SIZES = {
  sm: 14,
  md: 18,
  lg: 22,
} as const;

interface StarRatingProps {
  rating: number; // 0.5-5.0
  confidence?: number; // 0-1, controls opacity
  size?: keyof typeof SIZES;
}

export function StarRating({
  rating,
  confidence = 1,
  size = "md",
}: StarRatingProps) {
  const px = SIZES[size];
  const opacity = 0.4 + confidence * 0.6;

  return (
    <div
      className="flex items-center gap-0.5"
      style={{ opacity }}
      aria-label={`${rating} out of 5 stars`}
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const starIndex = i + 1;
        const fill =
          rating >= starIndex
            ? "full"
            : rating >= starIndex - 0.5
              ? "half"
              : "empty";

        return (
          <div key={i} className="relative" style={{ width: px, height: px }}>
            {/* Empty star background */}
            <Star
              size={px}
              className="absolute inset-0 text-zinc-700"
              strokeWidth={1.5}
            />
            {fill === "full" && (
              <Star
                size={px}
                className="absolute inset-0 text-amber-400 fill-amber-400"
                strokeWidth={1.5}
              />
            )}
            {fill === "half" && (
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ width: px / 2 }}
              >
                <Star
                  size={px}
                  className="text-amber-400 fill-amber-400"
                  strokeWidth={1.5}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// StarRatingRange — FM-style gold/white star display for ability ranges
//
// Gold stars  = certain floor (low bound)
// White stars = uncertainty (low → high)
// Dark stars  = remaining to 5
// ---------------------------------------------------------------------------

interface StarRatingRangeProps {
  low: number; // 0.5-5.0
  high: number; // 0.5-5.0
  confidence?: number; // 0-1
  size?: keyof typeof SIZES;
}

export function StarRatingRange({
  low,
  high,
  confidence = 1,
  size = "md",
}: StarRatingRangeProps) {
  const px = SIZES[size];
  const opacity = 0.4 + confidence * 0.6;

  // Defensive clamping
  const lo = Math.max(0, Math.min(5, low));
  const hi = Math.max(lo, Math.min(5, high));

  // No range — delegate to solid StarRating
  if (lo === hi) {
    return <StarRating rating={lo} confidence={confidence} size={size} />;
  }

  return (
    <div
      className="flex items-center gap-0.5"
      style={{ opacity }}
      aria-label={`${lo.toFixed(1)} to ${hi.toFixed(1)} stars`}
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const pos = i + 1;
        const goldFill = getFill(lo, pos);
        const whiteFill = getFill(hi, pos);

        return (
          <div key={i} className="relative" style={{ width: px, height: px }}>
            {/* Base: dark empty star */}
            <Star
              size={px}
              className="absolute inset-0 text-zinc-700"
              strokeWidth={1.5}
            />

            {goldFill === "full" ? (
              // Full gold star
              <Star
                size={px}
                className="absolute inset-0 text-amber-400 fill-amber-400"
                strokeWidth={1.5}
              />
            ) : goldFill === "half" ? (
              // Half gold, check if other half is white
              <>
                <div className="absolute inset-0 overflow-hidden" style={{ width: px / 2 }}>
                  <Star size={px} className="text-amber-400 fill-amber-400" strokeWidth={1.5} />
                </div>
                {whiteFill === "full" && (
                  <div className="absolute inset-0 overflow-hidden" style={{ marginLeft: px / 2, width: px / 2 }}>
                    <Star size={px} className="text-zinc-400 fill-zinc-400" strokeWidth={1.5} style={{ marginLeft: -(px / 2) }} />
                  </div>
                )}
              </>
            ) : whiteFill === "full" ? (
              // Full white star (uncertainty)
              <Star
                size={px}
                className="absolute inset-0 text-zinc-400 fill-zinc-400"
                strokeWidth={1.5}
              />
            ) : whiteFill === "half" ? (
              // Half white star
              <div className="absolute inset-0 overflow-hidden" style={{ width: px / 2 }}>
                <Star size={px} className="text-zinc-400 fill-zinc-400" strokeWidth={1.5} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function getFill(rating: number, starPos: number): "full" | "half" | "empty" {
  if (rating >= starPos) return "full";
  if (rating >= starPos - 0.5) return "half";
  return "empty";
}
