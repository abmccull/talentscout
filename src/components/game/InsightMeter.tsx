"use client";

import * as React from "react";
import type { InsightState } from "@/engine/insight/types";

// =============================================================================
// KEYFRAMES (injected once)
// =============================================================================

const PULSE_KEYFRAMES = `
@keyframes insightPulse {
  0%, 100% { filter: drop-shadow(0 0 4px rgba(245, 158, 11, 0.4)); }
  50%       { filter: drop-shadow(0 0 12px rgba(245, 158, 11, 0.9)); }
}
@keyframes insightRingPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0.0); }
  50%       { box-shadow: 0 0 0 6px rgba(245, 158, 11, 0.25); }
}
`;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Converts polar coordinates to a cartesian SVG point on a circle.
 */
function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number
): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * Builds an SVG arc path string for an arc from startAngle to endAngle.
 * The arc starts at the bottom-left and sweeps clockwise.
 *
 * Arc spans from -210° to 30° (240° sweep, centred bottom), which reads
 * as left-to-right to the user.
 */
function buildArcPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

const ARC_START = -210; // degrees
const ARC_END = 30;     // degrees — 240° total sweep

// =============================================================================
// FULL METER
// =============================================================================

interface InsightMeterProps {
  insightState: InsightState;
  compact?: boolean;
}

function FullInsightMeter({ insightState }: { insightState: InsightState }) {
  const { points, capacity, cooldownWeeksRemaining } = insightState;
  const pct = capacity > 0 ? Math.min(points / capacity, 1) : 0;
  const isReady = points >= 20 && cooldownWeeksRemaining === 0;
  const isOnCooldown = cooldownWeeksRemaining > 0;

  // Sweep the fill arc from start to pct of full sweep
  const sweepDeg = 240;
  const fillEnd = ARC_START + sweepDeg * pct;

  const cx = 60;
  const cy = 60;
  const r = 48;

  const trackPath = buildArcPath(cx, cy, r, ARC_START, ARC_END);
  const fillPath = pct > 0 ? buildArcPath(cx, cy, r, ARC_START, fillEnd) : null;

  return (
    <>
      <style>{PULSE_KEYFRAMES}</style>
      <div className="flex flex-col items-center gap-1">
        <div
          className="relative"
          style={
            isReady
              ? { animation: "insightPulse 2.4s ease-in-out infinite" }
              : undefined
          }
          aria-label={`Insight Points: ${points} of ${capacity}`}
        >
          <svg
            width={120}
            height={100}
            viewBox="0 0 120 100"
            aria-hidden="true"
            className="overflow-visible"
          >
            {/* Track */}
            <path
              d={trackPath}
              fill="none"
              stroke="rgb(253 230 138)" /* amber-200 */
              strokeWidth={8}
              strokeLinecap="round"
              opacity={0.25}
            />

            {/* Fill */}
            {fillPath && (
              <path
                d={fillPath}
                fill="none"
                stroke="rgb(245 158 11)" /* amber-500 */
                strokeWidth={8}
                strokeLinecap="round"
              />
            )}
          </svg>

          {/* Centre text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pb-4">
            <span className="text-3xl font-bold leading-none text-amber-400">
              {points}
            </span>
          </div>
        </div>

        {/* Capacity label */}
        <p className="text-xs text-zinc-400" aria-label={`Capacity: ${capacity} IP`}>
          / {capacity} IP
        </p>

        {/* Cooldown warning */}
        {isOnCooldown && (
          <p className="mt-0.5 text-xs font-medium text-red-400" role="status">
            Cooldown: {cooldownWeeksRemaining}{" "}
            {cooldownWeeksRemaining === 1 ? "week" : "weeks"}
          </p>
        )}

        {/* Ready indicator */}
        {isReady && (
          <p className="mt-0.5 text-xs font-semibold text-amber-400" role="status">
            Ready to use
          </p>
        )}
      </div>
    </>
  );
}

// =============================================================================
// COMPACT BADGE
// =============================================================================

function CompactInsightMeter({ insightState }: { insightState: InsightState }) {
  const { points, capacity, cooldownWeeksRemaining } = insightState;
  const pct = capacity > 0 ? Math.min(points / capacity, 1) : 0;
  const isReady = points >= 20 && cooldownWeeksRemaining === 0;

  // SVG ring: circumference of a circle r=16
  const r = 16;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - pct);

  return (
    <>
      <style>{PULSE_KEYFRAMES}</style>
      <div
        className="relative inline-flex items-center justify-center"
        aria-label={`Insight: ${points} / ${capacity} IP${cooldownWeeksRemaining > 0 ? `, cooldown ${cooldownWeeksRemaining}w` : ""}`}
        style={
          isReady
            ? { animation: "insightRingPulse 2.4s ease-in-out infinite", borderRadius: "9999px" }
            : undefined
        }
      >
        <svg
          width={44}
          height={44}
          viewBox="0 0 44 44"
          aria-hidden="true"
          className="-rotate-90"
        >
          {/* Track ring */}
          <circle
            cx={22}
            cy={22}
            r={r}
            fill="none"
            stroke="rgb(253 230 138)"
            strokeWidth={4}
            opacity={0.25}
          />
          {/* Fill ring */}
          {pct > 0 && (
            <circle
              cx={22}
              cy={22}
              r={r}
              fill="none"
              stroke="rgb(245 158 11)"
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          )}
        </svg>

        {/* IP number */}
        <span className="absolute text-xs font-bold leading-none text-amber-400">
          {points}
        </span>
      </div>
    </>
  );
}

// =============================================================================
// EXPORT
// =============================================================================

export function InsightMeter({ insightState, compact = false }: InsightMeterProps) {
  if (compact) {
    return <CompactInsightMeter insightState={insightState} />;
  }
  return <FullInsightMeter insightState={insightState} />;
}
