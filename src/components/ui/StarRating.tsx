"use client";

import { Star } from "lucide-react";

// ---------------------------------------------------------------------------
// StarRating — renders a half-star rating with confidence opacity
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
  const opacity = 0.4 + confidence * 0.6; // low confidence = faded

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
// StarRatingRange — displays a PA range like "3.0 — 4.5"
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

  if (low === high) {
    return <StarRating rating={low} confidence={confidence} size={size} />;
  }

  return (
    <div className="flex items-center gap-2" style={{ opacity }}>
      <div className="flex items-center gap-0.5">
        <Star size={px - 2} className="text-amber-400 fill-amber-400" strokeWidth={1.5} />
        <span className="text-xs font-mono font-medium text-zinc-300">{low.toFixed(1)}</span>
      </div>
      <span className="text-zinc-600 text-xs">—</span>
      <div className="flex items-center gap-0.5">
        <Star size={px - 2} className="text-amber-400 fill-amber-400" strokeWidth={1.5} />
        <span className="text-xs font-mono font-medium text-zinc-300">{high.toFixed(1)}</span>
      </div>
    </div>
  );
}
