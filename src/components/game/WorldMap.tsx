"use client";

import * as React from "react";

// =============================================================================
// TYPES
// =============================================================================

export interface WorldMapProps {
  /** All country keys that exist in the game world. */
  countries: string[];
  /** Familiarity level per country key, 0–100. */
  familiarityLevels?: Record<string, number>;
  /** The scout's current country key. */
  currentLocation?: string;
  /** Countries with active scouting assignments. */
  activeAssignments?: string[];
  /** Called when the user clicks a country shape. */
  onCountryClick?: (country: string) => void;
}

// =============================================================================
// MAP LAYOUT DATA
// =============================================================================

/**
 * Approximate [cx, cy, rx, ry] positions on a 800×400 viewBox.
 * Layout is stylized / board-game-style — not geographically precise.
 */
const COUNTRY_POSITIONS: Record<
  string,
  { cx: number; cy: number; rx: number; ry: number; label: string }
> = {
  // Europe
  england:     { cx: 240, cy: 80,  rx: 22, ry: 18, label: "England" },
  scotland:    { cx: 230, cy: 58,  rx: 16, ry: 14, label: "Scotland" },
  france:      { cx: 258, cy: 108, rx: 24, ry: 18, label: "France" },
  spain:       { cx: 232, cy: 136, rx: 26, ry: 18, label: "Spain" },
  portugal:    { cx: 212, cy: 140, rx: 14, ry: 14, label: "Portugal" },
  germany:     { cx: 284, cy: 92,  rx: 22, ry: 18, label: "Germany" },
  netherlands: { cx: 272, cy: 72,  rx: 16, ry: 14, label: "Netherlands" },
  belgium:     { cx: 268, cy: 87,  rx: 14, ry: 12, label: "Belgium" },
  switzerland: { cx: 278, cy: 112, rx: 14, ry: 12, label: "Switzerland" },
  italy:       { cx: 296, cy: 128, rx: 18, ry: 20, label: "Italy" },
  turkey:      { cx: 334, cy: 126, rx: 22, ry: 16, label: "Turkey" },
  // Africa
  nigeria:     { cx: 278, cy: 216, rx: 22, ry: 18, label: "Nigeria" },
  ghana:       { cx: 256, cy: 218, rx: 16, ry: 14, label: "Ghana" },
  ivorycoast:  { cx: 248, cy: 228, rx: 16, ry: 14, label: "Ivory Coast" },
  senegal:     { cx: 230, cy: 204, rx: 16, ry: 14, label: "Senegal" },
  cameroon:    { cx: 292, cy: 224, rx: 16, ry: 14, label: "Cameroon" },
  egypt:       { cx: 318, cy: 186, rx: 20, ry: 16, label: "Egypt" },
  southafrica: { cx: 310, cy: 272, rx: 22, ry: 18, label: "South Africa" },
  // Americas
  usa:         { cx: 120, cy: 140, rx: 34, ry: 24, label: "USA" },
  canada:      { cx: 112, cy: 108, rx: 32, ry: 20, label: "Canada" },
  mexico:      { cx: 106, cy: 172, rx: 22, ry: 18, label: "Mexico" },
  brazil:      { cx: 178, cy: 244, rx: 32, ry: 28, label: "Brazil" },
  argentina:   { cx: 166, cy: 294, rx: 20, ry: 24, label: "Argentina" },
  colombia:    { cx: 152, cy: 216, rx: 18, ry: 16, label: "Colombia" },
  // Asia
  japan:       { cx: 582, cy: 124, rx: 16, ry: 20, label: "Japan" },
  southkorea:  { cx: 562, cy: 136, rx: 16, ry: 14, label: "S. Korea" },
  china:       { cx: 534, cy: 128, rx: 30, ry: 22, label: "China" },
  saudiarabia: { cx: 376, cy: 172, rx: 24, ry: 18, label: "Saudi Arabia" },
  // Oceania
  australia:   { cx: 590, cy: 280, rx: 36, ry: 26, label: "Australia" },
  newzealand:  { cx: 644, cy: 308, rx: 16, ry: 14, label: "New Zealand" },
};

// =============================================================================
// COLOUR HELPERS
// =============================================================================

function countryFill(familiarity: number): string {
  if (familiarity <= 0)  return "#3f3f46"; // zinc-700 — unknown
  if (familiarity < 50)  return "#a16207"; // yellow-700 — partial
  return "#15803d";                         // green-700 — well-known
}

function countryFillHover(familiarity: number): string {
  if (familiarity <= 0)  return "#52525b";
  if (familiarity < 50)  return "#ca8a04";
  return "#16a34a";
}

// =============================================================================
// SUB-COMPONENT: single country shape
// =============================================================================

interface CountryShapeProps {
  countryKey: string;
  familiarity: number;
  isCurrent: boolean;
  hasActiveAssignment: boolean;
  onClick?: () => void;
}

function CountryShape({
  countryKey,
  familiarity,
  isCurrent,
  hasActiveAssignment,
  onClick,
}: CountryShapeProps) {
  const [hovered, setHovered] = React.useState(false);
  const pos = COUNTRY_POSITIONS[countryKey];
  if (!pos) return null;

  const fill = hovered ? countryFillHover(familiarity) : countryFill(familiarity);
  const stroke = isCurrent ? "#f59e0b" : "#1c1917"; // amber border for current location
  const strokeWidth = isCurrent ? 2.5 : 1;

  return (
    <g
      role="button"
      aria-label={`${pos.label}${isCurrent ? " (current location)" : ""}${hasActiveAssignment ? ", active assignment" : ""}`}
      tabIndex={onClick ? 0 : -1}
      style={{ cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <ellipse
        cx={pos.cx}
        cy={pos.cy}
        rx={pos.rx}
        ry={pos.ry}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        style={{ transition: "fill 150ms ease" }}
      />

      {/* Country label — hidden at small sizes via fontSize */}
      <text
        x={pos.cx}
        y={pos.cy + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="7"
        fontFamily="system-ui, sans-serif"
        fill="#e4e4e7"
        pointerEvents="none"
        aria-hidden="true"
      >
        {pos.label}
      </text>

      {/* Pulsing emerald dot for active assignments */}
      {hasActiveAssignment && (
        <circle
          cx={pos.cx + pos.rx - 5}
          cy={pos.cy - pos.ry + 5}
          r={4}
          fill="#10b981"
          aria-hidden="true"
        >
          <animate
            attributeName="r"
            values="3;5;3"
            dur="1.8s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="opacity"
            values="1;0.5;1"
            dur="1.8s"
            repeatCount="indefinite"
          />
        </circle>
      )}
    </g>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * WorldMap — a stylized SVG schematic map of the 22+ game countries.
 *
 * Countries are shown as ellipses positioned approximately on a world layout.
 * Colour encodes familiarity level; a gold border marks the current location;
 * pulsing dots mark active scouting assignments.
 */
export function WorldMap({
  countries,
  familiarityLevels = {},
  currentLocation,
  activeAssignments = [],
  onCountryClick,
}: WorldMapProps) {
  const activeSet = new Set(activeAssignments);

  return (
    <div
      className="w-full overflow-hidden rounded-xl border border-zinc-700/50 bg-zinc-900"
      aria-label="World scouting map"
    >
      <svg
        viewBox="0 0 800 400"
        aria-label="World scouting map showing all scoutable countries"
        role="img"
        className="w-full"
        style={{ maxHeight: "420px" }}
      >
        {/* Ocean background */}
        <rect width="800" height="400" fill="#0f172a" />

        {/* Subtle grid lines for reference */}
        <line x1="400" y1="0" x2="400" y2="400" stroke="#1e293b" strokeWidth="0.5" aria-hidden="true" />
        <line x1="0" y1="200" x2="800" y2="200" stroke="#1e293b" strokeWidth="0.5" aria-hidden="true" />

        {/* Continent silhouette hints (purely decorative) */}
        <text x="120" y="390" fontSize="9" fill="#1e293b" fontFamily="system-ui" aria-hidden="true">Americas</text>
        <text x="255" y="390" fontSize="9" fill="#1e293b" fontFamily="system-ui" aria-hidden="true">Europe / Africa</text>
        <text x="510" y="390" fontSize="9" fill="#1e293b" fontFamily="system-ui" aria-hidden="true">Asia / Oceania</text>

        {/* Render all countries that have position data */}
        {countries.map((key) => {
          if (!COUNTRY_POSITIONS[key]) return null;
          return (
            <CountryShape
              key={key}
              countryKey={key}
              familiarity={familiarityLevels[key] ?? 0}
              isCurrent={key === currentLocation}
              hasActiveAssignment={activeSet.has(key)}
              onClick={onCountryClick ? () => onCountryClick(key) : undefined}
            />
          );
        })}
      </svg>

      {/* Legend */}
      <div
        className="flex flex-wrap items-center gap-4 border-t border-zinc-800 px-4 py-2 text-xs text-zinc-400"
        aria-label="Map legend"
      >
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm bg-zinc-700" aria-hidden="true" />
          Unknown
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm bg-yellow-700" aria-hidden="true" />
          Familiar
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm bg-green-700" aria-hidden="true" />
          Well known
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-emerald-500" aria-hidden="true" />
          Active assignment
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-sm border-2 border-amber-500 bg-green-700" aria-hidden="true" />
          Current location
        </span>
      </div>
    </div>
  );
}
