"use client";

import * as React from "react";

// =============================================================================
// TYPES
// =============================================================================

export interface ClubCrestProps {
  clubId: string;
  clubName: string;
  size?: 32 | 48 | 64;
}

// =============================================================================
// COLOUR PALETTE
// =============================================================================

/** 12 football-appropriate primary colours. */
const PRIMARY_PALETTE = [
  "#c0392b", // red
  "#e74c3c", // bright red
  "#2980b9", // blue
  "#1a5276", // navy
  "#1e8449", // dark green
  "#117a65", // teal
  "#7d3c98", // purple
  "#884ea0", // violet
  "#d35400", // orange
  "#ca8a04", // gold
  "#1c2833", // charcoal
  "#154360", // deep blue
];

/** Complementary secondary colours — index-matched to PRIMARY_PALETTE. */
const SECONDARY_PALETTE = [
  "#f5cba7", // cream vs red
  "#fadbd8", // pale vs bright red
  "#d6eaf8", // pale vs blue
  "#d6eaf8", // pale vs navy
  "#d5f5e3", // pale vs dark green
  "#d1f2eb", // pale vs teal
  "#e8daef", // pale vs purple
  "#f5eef8", // pale vs violet
  "#fdebd0", // pale vs orange
  "#1c2833", // dark vs gold
  "#f8f9fa", // white vs charcoal
  "#d6eaf8", // pale vs deep blue
];

// =============================================================================
// HASH HELPER
// =============================================================================

/** Deterministic hash of a string → integer. */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// =============================================================================
// SYMBOL PATHS  (centred on 0,0 — scaled to fit shield)
// =============================================================================

type SymbolId =
  | "star"
  | "circle"
  | "chevron"
  | "hStripe"
  | "vStripe"
  | "cross"
  | "diamond"
  | "triangle";

const SYMBOLS: SymbolId[] = [
  "star", "circle", "chevron", "hStripe",
  "vStripe", "cross", "diamond", "triangle",
];

interface SymbolProps {
  fill: string;
  cx: number;
  cy: number;
  scale: number;
}

function Symbol({ id, fill, cx, cy, scale }: SymbolProps & { id: SymbolId }) {
  const s = scale;
  switch (id) {
    case "star":
      return (
        <polygon
          points={`${cx},${cy - 9 * s} ${cx + 3 * s},${cy - 3 * s} ${cx + 9 * s},${cy - 2 * s} ${cx + 4 * s},${cy + 3 * s} ${cx + 6 * s},${cy + 9 * s} ${cx},${cy + 5 * s} ${cx - 6 * s},${cy + 9 * s} ${cx - 4 * s},${cy + 3 * s} ${cx - 9 * s},${cy - 2 * s} ${cx - 3 * s},${cy - 3 * s}`}
          fill={fill}
        />
      );
    case "circle":
      return <circle cx={cx} cy={cy} r={7 * s} fill={fill} />;
    case "chevron":
      return (
        <polyline
          points={`${cx - 8 * s},${cy - 5 * s} ${cx},${cy + 5 * s} ${cx + 8 * s},${cy - 5 * s}`}
          fill="none"
          stroke={fill}
          strokeWidth={3 * s}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case "hStripe":
      return (
        <rect x={cx - 10 * s} y={cy - 3 * s} width={20 * s} height={5 * s} fill={fill} rx={1} />
      );
    case "vStripe":
      return (
        <rect x={cx - 3 * s} y={cy - 10 * s} width={5 * s} height={20 * s} fill={fill} rx={1} />
      );
    case "cross":
      return (
        <g fill={fill}>
          <rect x={cx - 3 * s} y={cy - 10 * s} width={6 * s} height={20 * s} rx={1} />
          <rect x={cx - 10 * s} y={cy - 3 * s} width={20 * s} height={6 * s} rx={1} />
        </g>
      );
    case "diamond":
      return (
        <polygon
          points={`${cx},${cy - 10 * s} ${cx + 7 * s},${cy} ${cx},${cy + 10 * s} ${cx - 7 * s},${cy}`}
          fill={fill}
        />
      );
    case "triangle":
      return (
        <polygon
          points={`${cx},${cy - 10 * s} ${cx + 9 * s},${cy + 7 * s} ${cx - 9 * s},${cy + 7 * s}`}
          fill={fill}
        />
      );
  }
}

// =============================================================================
// SHIELD VARIANTS
// =============================================================================

type ShieldVariant = "pointed" | "rounded" | "square" | "oval";
const SHIELD_VARIANTS: ShieldVariant[] = ["pointed", "rounded", "square", "oval"];

interface ShieldProps {
  variant: ShieldVariant;
  primary: string;
  secondary: string;
  size: number;
}

function Shield({ variant, primary, secondary, size }: ShieldProps) {
  const w = size;
  const h = size;
  const cx = w / 2;
  const cy = h / 2;

  switch (variant) {
    case "pointed":
      return (
        <path
          d={`M${cx},${h * 0.92} L${w * 0.08},${h * 0.38} L${w * 0.08},${h * 0.12} L${w * 0.92},${h * 0.12} L${w * 0.92},${h * 0.38} Z`}
          fill={primary}
          stroke={secondary}
          strokeWidth={size / 16}
        />
      );
    case "rounded":
      return (
        <rect
          x={w * 0.08}
          y={h * 0.08}
          width={w * 0.84}
          height={h * 0.84}
          rx={w * 0.18}
          ry={h * 0.18}
          fill={primary}
          stroke={secondary}
          strokeWidth={size / 16}
        />
      );
    case "square":
      return (
        <rect
          x={w * 0.1}
          y={h * 0.1}
          width={w * 0.8}
          height={h * 0.8}
          rx={w * 0.06}
          fill={primary}
          stroke={secondary}
          strokeWidth={size / 16}
        />
      );
    case "oval":
      return (
        <ellipse
          cx={cx}
          cy={cy}
          rx={w * 0.42}
          ry={h * 0.46}
          fill={primary}
          stroke={secondary}
          strokeWidth={size / 16}
        />
      );
  }
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * ClubCrest — procedurally generates a simple SVG shield crest.
 *
 * All visual properties are deterministically derived from `clubId`,
 * so the same club always produces the same crest.
 */
export function ClubCrest({ clubId, clubName, size = 48 }: ClubCrestProps) {
  const hash = hashString(clubId);

  const paletteIdx  = hash % PRIMARY_PALETTE.length;
  const primary     = PRIMARY_PALETTE[paletteIdx];
  const secondary   = SECONDARY_PALETTE[paletteIdx];
  const shieldVariant = SHIELD_VARIANTS[(hash >> 4) % SHIELD_VARIANTS.length];
  const symbolId    = SYMBOLS[(hash >> 8) % SYMBOLS.length];

  // Initials: up to 2 characters for small sizes, 3 for large
  const words   = clubName.trim().split(/\s+/);
  const initials = words.length >= 2
    ? (words[0][0] + words[words.length - 1][0]).toUpperCase()
    : clubName.slice(0, 2).toUpperCase();

  const cx   = size / 2;
  const cy   = size / 2;
  const scale = size / 48; // normalise symbol scale to 48px reference

  // Text colour — use white on dark backgrounds, dark on light
  const isDarkPrimary = [
    "#c0392b", "#1a5276", "#1e8449", "#117a65",
    "#7d3c98", "#884ea0", "#1c2833", "#154360",
  ].includes(primary);
  const textFill = isDarkPrimary ? "#ffffff" : "#1c1917";
  const fontSize = size <= 32 ? 10 : size <= 48 ? 13 : 17;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label={`${clubName} crest`}
      role="img"
      style={{ display: "block", flexShrink: 0 }}
    >
      {/* Shield background */}
      <Shield variant={shieldVariant} primary={primary} secondary={secondary} size={size} />

      {/* Decorative symbol — only at larger sizes */}
      {size >= 48 && (
        <Symbol
          id={symbolId}
          fill={`${secondary}60`}
          cx={cx}
          cy={cy - size * 0.05}
          scale={scale * 0.55}
        />
      )}

      {/* Initials overlay */}
      <text
        x={cx}
        y={cy + fontSize * 0.38}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fontSize}
        fontWeight="bold"
        fontFamily="system-ui, -apple-system, sans-serif"
        fill={textFill}
        pointerEvents="none"
      >
        {initials}
      </text>
    </svg>
  );
}
