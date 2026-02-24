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
// GEOGRAPHIC DATA
// =============================================================================

const COUNTRY_COORDS: Record<string, { lat: number; lon: number; label: string }> = {
  // Europe
  england:     { lat: 52.5,  lon: -1.5,   label: "England" },
  scotland:    { lat: 56.5,  lon: -4.0,   label: "Scotland" },
  france:      { lat: 46.6,  lon: 2.3,    label: "France" },
  spain:       { lat: 40.4,  lon: -3.7,   label: "Spain" },
  portugal:    { lat: 39.4,  lon: -8.2,   label: "Portugal" },
  germany:     { lat: 51.2,  lon: 10.4,   label: "Germany" },
  netherlands: { lat: 52.1,  lon: 5.3,    label: "Netherlands" },
  belgium:     { lat: 50.8,  lon: 4.4,    label: "Belgium" },
  switzerland: { lat: 46.8,  lon: 8.2,    label: "Switzerland" },
  italy:       { lat: 41.9,  lon: 12.5,   label: "Italy" },
  turkey:      { lat: 39.9,  lon: 32.9,   label: "Turkey" },
  // Africa
  nigeria:     { lat: 9.1,   lon: 7.5,    label: "Nigeria" },
  ghana:       { lat: 7.9,   lon: -1.0,   label: "Ghana" },
  ivorycoast:  { lat: 7.5,   lon: -5.5,   label: "Ivory Coast" },
  senegal:     { lat: 14.7,  lon: -17.4,  label: "Senegal" },
  cameroon:    { lat: 7.4,   lon: 12.4,   label: "Cameroon" },
  egypt:       { lat: 30.0,  lon: 31.2,   label: "Egypt" },
  southafrica: { lat: -30.6, lon: 22.9,   label: "South Africa" },
  // Americas
  usa:         { lat: 39.8,  lon: -98.6,  label: "USA" },
  canada:      { lat: 56.1,  lon: -106.3, label: "Canada" },
  mexico:      { lat: 23.6,  lon: -102.6, label: "Mexico" },
  brazil:      { lat: -14.2, lon: -51.9,  label: "Brazil" },
  argentina:   { lat: -38.4, lon: -63.6,  label: "Argentina" },
  colombia:    { lat: 4.6,   lon: -74.3,  label: "Colombia" },
  // Asia
  japan:       { lat: 36.2,  lon: 138.3,  label: "Japan" },
  southkorea:  { lat: 35.9,  lon: 127.8,  label: "S. Korea" },
  china:       { lat: 35.9,  lon: 104.2,  label: "China" },
  saudiarabia: { lat: 23.9,  lon: 45.1,   label: "Saudi Arabia" },
  // Oceania
  australia:   { lat: -25.3, lon: 133.8,  label: "Australia" },
  newzealand:  { lat: -40.9, lon: 174.9,  label: "New Zealand" },
};

// European countries — labels hidden by default, shown on hover to avoid crowding
const EUROPE_KEYS = new Set([
  "england", "scotland", "france", "spain", "portugal",
  "germany", "netherlands", "belgium", "switzerland", "italy", "turkey",
]);

// =============================================================================
// PROJECTION
// =============================================================================

/** Equirectangular projection for 16:9 world map (83°N to -60°S). */
function lonLatToSvg(lon: number, lat: number): { x: number; y: number } {
  const x = ((lon + 180) / 360) * 800;
  const y = ((83 - lat) / 143) * 450; // 83°N to -60°S = 143° range
  return { x, y };
}

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
// SUB-COMPONENT: single country marker
// =============================================================================

interface CountryMarkerProps {
  countryKey: string;
  familiarity: number;
  isCurrent: boolean;
  hasActiveAssignment: boolean;
  onClick?: () => void;
}

function CountryMarker({
  countryKey,
  familiarity,
  isCurrent,
  hasActiveAssignment,
  onClick,
}: CountryMarkerProps) {
  const [hovered, setHovered] = React.useState(false);
  const coords = COUNTRY_COORDS[countryKey];
  if (!coords) return null;

  const { x, y } = lonLatToSvg(coords.lon, coords.lat);
  const fill = hovered ? countryFillHover(familiarity) : countryFill(familiarity);
  const stroke = isCurrent ? "#f59e0b" : "#1c1917";
  const strokeWidth = isCurrent ? 2.5 : 1;

  const isEurope = EUROPE_KEYS.has(countryKey);
  const showLabel = !isEurope || hovered;

  return (
    <g
      role="button"
      aria-label={`${coords.label}${isCurrent ? " (current location)" : ""}${hasActiveAssignment ? ", active assignment" : ""}`}
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
      {/* Country circle marker */}
      <circle
        cx={x}
        cy={y}
        r={hovered ? 9 : 7}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        style={{ transition: "all 150ms ease" }}
      />

      {/* Country label */}
      <text
        x={x}
        y={y - 12}
        textAnchor="middle"
        dominantBaseline="auto"
        fontSize="8"
        fontWeight="600"
        fontFamily="system-ui, sans-serif"
        fill="#e4e4e7"
        pointerEvents="none"
        aria-hidden="true"
        style={{
          opacity: showLabel ? 1 : 0,
          transition: "opacity 150ms ease",
          textShadow: "0 1px 3px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.6)",
        }}
      >
        {coords.label}
      </text>

      {/* Pulsing emerald dot for active assignments */}
      {hasActiveAssignment && (
        <circle
          cx={x + 6}
          cy={y - 6}
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
 * WorldMap — an interactive world map showing scoutable countries.
 *
 * Uses a Meshy AI-generated equirectangular map as background with
 * interactive circle markers at real geographic positions.
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
        viewBox="0 0 800 450"
        aria-label="World scouting map showing all scoutable countries"
        role="img"
        className="w-full"
        style={{ maxHeight: "480px" }}
      >
        {/* Map background image */}
        <image
          href="/images/backgrounds/world-map.png"
          x="0"
          y="0"
          width="800"
          height="450"
          preserveAspectRatio="xMidYMid slice"
        />

        {/* Render all countries that have coordinate data */}
        {countries.map((key) => {
          if (!COUNTRY_COORDS[key]) return null;
          return (
            <CountryMarker
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
          <span className="inline-block h-3 w-3 rounded-full bg-zinc-700" aria-hidden="true" />
          Unknown
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-yellow-700" aria-hidden="true" />
          Familiar
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-green-700" aria-hidden="true" />
          Well known
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-emerald-500" aria-hidden="true" />
          Active assignment
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full border-2 border-amber-500 bg-green-700" aria-hidden="true" />
          Current location
        </span>
      </div>
    </div>
  );
}
