"use client";

import { Star } from "lucide-react";

const SIZES = {
  sm: 14,
  md: 18,
  lg: 22,
} as const;

function formatRatingValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

interface StarRatingProps {
  rating: number;
  confidence?: number;
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
      role="img"
      className="flex items-center gap-0.5"
      style={{ opacity }}
      aria-label={`${formatRatingValue(rating)} out of 5 stars`}
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
          <div
            key={i}
            aria-hidden="true"
            className="relative"
            style={{ width: px, height: px }}
          >
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

interface StarRatingRangeProps {
  low: number;
  high: number;
  confidence?: number;
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
  const lo = Math.max(0, Math.min(5, low));
  const hi = Math.max(lo, Math.min(5, high));

  if (lo === hi) {
    return <StarRating rating={lo} confidence={confidence} size={size} />;
  }

  return (
    <div
      role="img"
      className="flex items-center gap-0.5"
      style={{ opacity }}
      aria-label={`${formatRatingValue(lo)} to ${formatRatingValue(hi)} out of 5 stars`}
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const pos = i + 1;
        const goldFill = getFill(lo, pos);
        const whiteFill = getFill(hi, pos);

        return (
          <div
            key={i}
            aria-hidden="true"
            className="relative"
            style={{ width: px, height: px }}
          >
            <Star
              size={px}
              className="absolute inset-0 text-zinc-700"
              strokeWidth={1.5}
            />

            {goldFill === "full" ? (
              <Star
                size={px}
                className="absolute inset-0 text-amber-400 fill-amber-400"
                strokeWidth={1.5}
              />
            ) : goldFill === "half" ? (
              <>
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
                {whiteFill === "full" && (
                  <div
                    className="absolute inset-0 overflow-hidden"
                    style={{ marginLeft: px / 2, width: px / 2 }}
                  >
                    <Star
                      size={px}
                      className="text-zinc-400 fill-zinc-400"
                      strokeWidth={1.5}
                      style={{ marginLeft: -(px / 2) }}
                    />
                  </div>
                )}
              </>
            ) : whiteFill === "full" ? (
              <Star
                size={px}
                className="absolute inset-0 text-zinc-400 fill-zinc-400"
                strokeWidth={1.5}
              />
            ) : whiteFill === "half" ? (
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ width: px / 2 }}
              >
                <Star
                  size={px}
                  className="text-zinc-400 fill-zinc-400"
                  strokeWidth={1.5}
                />
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
