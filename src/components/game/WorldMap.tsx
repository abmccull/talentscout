"use client";

import * as React from "react";
import { getContinentId } from "@/engine/world/travel";

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
  /** Active travel booking destination (for flight path). */
  travelDestination?: string;
  /** Called when the user clicks a country marker. Returns SVG coords for popup positioning. */
  onCountryClick?: (country: string, svgX: number, svgY: number) => void;
  /** Forwarded ref for the SVG element (used for coordinate conversion). */
  svgRef?: React.RefObject<SVGSVGElement | null>;
}

// =============================================================================
// GEOGRAPHIC DATA
// =============================================================================

const COUNTRY_COORDS: Record<string, { lat: number; lon: number; label: string; abbr: string }> = {
  // Europe
  england:     { lat: 52.5,  lon: -1.5,   label: "England",      abbr: "ENG" },
  scotland:    { lat: 56.5,  lon: -4.0,   label: "Scotland",     abbr: "SCO" },
  france:      { lat: 46.6,  lon: 2.3,    label: "France",       abbr: "FRA" },
  spain:       { lat: 40.4,  lon: -3.7,   label: "Spain",        abbr: "ESP" },
  portugal:    { lat: 39.4,  lon: -8.2,   label: "Portugal",     abbr: "POR" },
  germany:     { lat: 51.2,  lon: 10.4,   label: "Germany",      abbr: "GER" },
  netherlands: { lat: 52.1,  lon: 5.3,    label: "Netherlands",  abbr: "NED" },
  belgium:     { lat: 50.8,  lon: 4.4,    label: "Belgium",      abbr: "BEL" },
  switzerland: { lat: 46.8,  lon: 8.2,    label: "Switzerland",  abbr: "SWI" },
  italy:       { lat: 41.9,  lon: 12.5,   label: "Italy",        abbr: "ITA" },
  turkey:      { lat: 39.9,  lon: 32.9,   label: "Turkey",       abbr: "TUR" },
  // Africa
  nigeria:     { lat: 9.1,   lon: 7.5,    label: "Nigeria",      abbr: "NGA" },
  ghana:       { lat: 7.9,   lon: -1.0,   label: "Ghana",        abbr: "GHA" },
  ivorycoast:  { lat: 7.5,   lon: -5.5,   label: "Ivory Coast",  abbr: "CIV" },
  senegal:     { lat: 14.7,  lon: -17.4,  label: "Senegal",      abbr: "SEN" },
  cameroon:    { lat: 7.4,   lon: 12.4,   label: "Cameroon",     abbr: "CMR" },
  egypt:       { lat: 30.0,  lon: 31.2,   label: "Egypt",        abbr: "EGY" },
  southafrica: { lat: -30.6, lon: 22.9,   label: "South Africa", abbr: "RSA" },
  // Americas
  usa:         { lat: 39.8,  lon: -98.6,  label: "USA",          abbr: "USA" },
  canada:      { lat: 56.1,  lon: -106.3, label: "Canada",       abbr: "CAN" },
  mexico:      { lat: 23.6,  lon: -102.6, label: "Mexico",       abbr: "MEX" },
  brazil:      { lat: -14.2, lon: -51.9,  label: "Brazil",       abbr: "BRA" },
  argentina:   { lat: -38.4, lon: -63.6,  label: "Argentina",    abbr: "ARG" },
  colombia:    { lat: 4.6,   lon: -74.3,  label: "Colombia",     abbr: "COL" },
  // Asia
  japan:       { lat: 36.2,  lon: 138.3,  label: "Japan",        abbr: "JPN" },
  southkorea:  { lat: 35.9,  lon: 127.8,  label: "S. Korea",     abbr: "KOR" },
  china:       { lat: 35.9,  lon: 104.2,  label: "China",        abbr: "CHN" },
  saudiarabia: { lat: 23.9,  lon: 45.1,   label: "Saudi Arabia", abbr: "KSA" },
  // Oceania
  australia:   { lat: -25.3, lon: 133.8,  label: "Australia",    abbr: "AUS" },
  newzealand:  { lat: -40.9, lon: 174.9,  label: "New Zealand",  abbr: "NZL" },
};

/** European countries — smaller markers by default to avoid crowding. */
const EUROPE_KEYS = new Set([
  "england", "scotland", "france", "spain", "portugal",
  "germany", "netherlands", "belgium", "switzerland", "italy", "turkey",
]);

/** Minor coordinate nudges for overlapping European markers. */
const COORD_NUDGES: Record<string, { dx: number; dy: number }> = {
  netherlands: { dx: 2, dy: -4 },
  belgium:     { dx: 2, dy: 3 },
  switzerland: { dx: 3, dy: 3 },
};

// =============================================================================
// PROJECTION — calibrated to the AI-generated background image
// =============================================================================

// The background image (world-map.png) spans approximately 85°N to -77°S
// with ~8px dark border padding at top/bottom edges.
const PROJ_TOP_PAD = 8;
const PROJ_MAP_HEIGHT = 434; // 450 - 2 * 8
const PROJ_TOP_LAT = 85;
const PROJ_LAT_RANGE = 162; // 85 - (-77) = 162°

function lonLatToSvg(lon: number, lat: number): { x: number; y: number } {
  const x = ((lon + 180) / 360) * 800;
  const y = PROJ_TOP_PAD + ((PROJ_TOP_LAT - lat) / PROJ_LAT_RANGE) * PROJ_MAP_HEIGHT;
  return { x, y };
}

/** Get projected SVG coords for a country, with nudge applied. */
function getCountryPos(key: string): { x: number; y: number } | null {
  const coords = COUNTRY_COORDS[key];
  if (!coords) return null;
  const { x, y } = lonLatToSvg(coords.lon, coords.lat);
  const nudge = COORD_NUDGES[key];
  return { x: x + (nudge?.dx ?? 0), y: y + (nudge?.dy ?? 0) };
}

// =============================================================================
// 5-TIER COLOR SYSTEM
// =============================================================================

interface TierColors {
  core: string;
  glow: string;
  label: string;
}

function getTierColors(familiarity: number): TierColors {
  if (familiarity >= 80) return { core: "#16a34a", glow: "#22c55e", label: "Master" };
  if (familiarity >= 50) return { core: "#2563eb", glow: "#3b82f6", label: "Expert" };
  if (familiarity >= 25) return { core: "#d97706", glow: "#f59e0b", label: "Familiar" };
  if (familiarity >= 1)  return { core: "#78716c", glow: "#a8a29e", label: "Novice" };
  return { core: "#3f3f46", glow: "#52525b", label: "Unknown" };
}

// =============================================================================
// GRADIENT DEFINITIONS
// =============================================================================

function GradientDefs() {
  return (
    <defs>
      {/* Glow filter for hover state */}
      <filter id="marker-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      {/* Sonar pulse gradient */}
      <radialGradient id="sonar-gradient">
        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

// =============================================================================
// FAMILIARITY ARC
// =============================================================================

function FamiliarityArc({
  cx,
  cy,
  r,
  familiarity,
  color,
}: {
  cx: number;
  cy: number;
  r: number;
  familiarity: number;
  color: string;
}) {
  if (familiarity <= 0) return null;
  const circumference = 2 * Math.PI * r;
  const dashLen = (familiarity / 100) * circumference;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      fill="none"
      stroke={color}
      strokeWidth={2.5}
      strokeDasharray={`${dashLen} ${circumference - dashLen}`}
      strokeDashoffset={circumference * 0.25}
      strokeLinecap="round"
      style={{ transition: "stroke-dasharray 400ms ease" }}
    />
  );
}

// =============================================================================
// SONAR PULSE (current location)
// =============================================================================

function SonarPulse({ cx, cy }: { cx: number; cy: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={14} fill="url(#sonar-gradient)" opacity={0}>
        <animate attributeName="r" values="14;28;14" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.6;0;0.6" dur="3s" repeatCount="indefinite" />
      </circle>
      <circle cx={cx} cy={cy} r={14} fill="none" stroke="#f59e0b" strokeWidth={1.5} opacity={0.8}>
        <animate attributeName="r" values="14;22" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.8;0" dur="3s" repeatCount="indefinite" />
      </circle>
    </>
  );
}

// =============================================================================
// FLIGHT PATH (active booking)
// =============================================================================

function FlightPath({
  fromKey,
  toKey,
}: {
  fromKey: string;
  toKey: string;
}) {
  const from = getCountryPos(fromKey);
  const to = getCountryPos(toKey);
  if (!from || !to) return null;

  // Quadratic bezier control point — arc above midpoint
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2 - 40;
  const pathD = `M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`;

  return (
    <g>
      {/* Dashed flight path */}
      <path
        d={pathD}
        fill="none"
        stroke="#60a5fa"
        strokeWidth={1.5}
        strokeDasharray="6 4"
        opacity={0.6}
      >
        <animate
          attributeName="stroke-dashoffset"
          values="0;-10"
          dur="1s"
          repeatCount="indefinite"
        />
      </path>
      {/* Airplane icon animating along path */}
      <circle r={3} fill="#93c5fd">
        <animateMotion dur="4s" repeatCount="indefinite" path={pathD} rotate="auto" />
      </circle>
    </g>
  );
}

// =============================================================================
// COUNTRY MARKER — beacon-style
// =============================================================================

interface CountryMarkerProps {
  countryKey: string;
  familiarity: number;
  isCurrent: boolean;
  hasActiveAssignment: boolean;
  delay: number;
  onClick?: () => void;
}

function CountryMarker({
  countryKey,
  familiarity,
  isCurrent,
  hasActiveAssignment,
  delay,
  onClick,
}: CountryMarkerProps) {
  const [hovered, setHovered] = React.useState(false);
  const [visible, setVisible] = React.useState(false);

  // Staggered fade-in on mount (must be before early return)
  React.useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  const coords = COUNTRY_COORDS[countryKey];
  const pos = getCountryPos(countryKey);
  if (!coords || !pos) return null;

  const { x, y } = pos;
  const tier = getTierColors(familiarity);
  const isEurope = EUROPE_KEYS.has(countryKey);

  // Europe markers are smaller to reduce crowding
  const baseCore = isEurope ? 4 : 6;
  const baseRing = isEurope ? 8 : 14;
  const baseArc = isEurope ? 6.5 : 11;

  // Hover expands European markers to full size
  const coreR = hovered && isEurope ? 6 : baseCore;
  const ringR = hovered && isEurope ? 14 : baseRing;
  const arcR = hovered && isEurope ? 11 : baseArc;

  const scale = hovered ? 1.3 : 1;

  return (
    <g
      role="button"
      aria-label={`${coords.label}${isCurrent ? " (current location)" : ""}${hasActiveAssignment ? ", active assignment" : ""}, familiarity ${familiarity}%`}
      tabIndex={onClick ? 0 : -1}
      style={{
        cursor: onClick ? "pointer" : "default",
        opacity: visible ? 1 : 0,
        transition: "opacity 400ms ease",
      }}
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
      {/* Sonar pulse for current location */}
      {isCurrent && <SonarPulse cx={x} cy={y} />}

      {/* Outer glow ring */}
      <circle
        cx={x}
        cy={y}
        r={ringR}
        fill="none"
        stroke={tier.glow}
        strokeWidth={1.5}
        opacity={hovered ? 0.7 : 0.3}
        style={{
          transition: "all 200ms ease",
          transform: `scale(${scale})`,
          transformOrigin: `${x}px ${y}px`,
        }}
      />

      {/* Familiarity arc */}
      <g style={{
        transform: `scale(${scale})`,
        transformOrigin: `${x}px ${y}px`,
        transition: "transform 200ms ease",
      }}>
        <FamiliarityArc cx={x} cy={y} r={arcR} familiarity={familiarity} color={tier.glow} />
      </g>

      {/* Core dot */}
      <circle
        cx={x}
        cy={y}
        r={coreR}
        fill={tier.core}
        stroke={isCurrent ? "#f59e0b" : "#1c1917"}
        strokeWidth={isCurrent ? 2 : 1}
        filter={hovered ? "url(#marker-glow)" : undefined}
        style={{
          transition: "all 200ms ease",
          transform: `scale(${scale})`,
          transformOrigin: `${x}px ${y}px`,
        }}
      />

      {/* Country abbreviation — always visible on core dot */}
      <text
        x={x}
        y={y + 1}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={isEurope && !hovered ? 3 : 4.5}
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
        fill="#fff"
        pointerEvents="none"
        aria-hidden="true"
        style={{
          transition: "font-size 200ms ease",
          textShadow: "0 0 2px rgba(0,0,0,0.8)",
        }}
      >
        {coords.abbr}
      </text>

      {/* Full country name on hover — appears above marker */}
      {hovered && (
        <text
          x={x}
          y={y - ringR - 6}
          textAnchor="middle"
          dominantBaseline="auto"
          fontSize="9"
          fontWeight="600"
          fontFamily="system-ui, sans-serif"
          fill="#e4e4e7"
          pointerEvents="none"
          aria-hidden="true"
          style={{
            textShadow: "0 1px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.7)",
          }}
        >
          {coords.label}
        </text>
      )}

      {/* Pulsing emerald dot for active assignments */}
      {hasActiveAssignment && (
        <circle
          cx={x + (isEurope && !hovered ? 4 : 6)}
          cy={y - (isEurope && !hovered ? 4 : 6)}
          r={3}
          fill="#10b981"
          aria-hidden="true"
        >
          <animate attributeName="r" values="2.5;4;2.5" dur="1.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.5;1" dur="1.8s" repeatCount="indefinite" />
        </circle>
      )}
    </g>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * WorldMap — immersive full-bleed world map with beacon-style country markers.
 *
 * Uses a background image with interactive beacon markers at real geographic
 * positions. 5-tier color coding for familiarity, sonar pulse on current
 * location, animated flight path for active bookings.
 */
export function WorldMap({
  countries,
  familiarityLevels = {},
  currentLocation,
  activeAssignments = [],
  travelDestination,
  onCountryClick,
  svgRef,
}: WorldMapProps) {
  const activeSet = new Set(activeAssignments);
  const internalRef = React.useRef<SVGSVGElement>(null);
  const ref = svgRef ?? internalRef;

  return (
    <svg
      ref={ref}
      viewBox="0 0 800 450"
      preserveAspectRatio="xMidYMid slice"
      aria-label="World scouting map showing all scoutable countries"
      role="img"
      className="absolute inset-0 h-full w-full"
    >
      <GradientDefs />

      {/* Map background image */}
      <image
        href="/images/backgrounds/world-map.png"
        x="0"
        y="0"
        width="800"
        height="450"
        preserveAspectRatio="xMidYMid slice"
      />

      {/* Dark overlay to improve marker contrast */}
      <rect x="0" y="0" width="800" height="450" fill="#0a0a0a" opacity="0.3" />

      {/* Flight path for active booking */}
      {travelDestination && currentLocation && (
        <FlightPath fromKey={currentLocation} toKey={travelDestination} />
      )}

      {/* Render all country markers */}
      {countries.map((key, idx) => {
        if (!COUNTRY_COORDS[key]) return null;
        return (
          <CountryMarker
            key={key}
            countryKey={key}
            familiarity={familiarityLevels[key] ?? 0}
            isCurrent={key === currentLocation}
            hasActiveAssignment={activeSet.has(key)}
            delay={idx * 30}
            onClick={
              onCountryClick
                ? () => {
                    const pos = getCountryPos(key);
                    if (pos) onCountryClick(key, pos.x, pos.y);
                  }
                : undefined
            }
          />
        );
      })}
    </svg>
  );
}

// Re-export coords lookup for external popup positioning
export { COUNTRY_COORDS, lonLatToSvg, getCountryPos, getTierColors, EUROPE_KEYS };
export type { TierColors };
