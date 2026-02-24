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

// Coordinates use population centers (not geographic centers) for large countries
// so markers land on recognizable city-light clusters in the night-view background.
const COUNTRY_COORDS: Record<string, { lat: number; lon: number; label: string; abbr: string }> = {
  // Europe — small countries, coords are fine as-is
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
  // Africa — capitals/population centers
  nigeria:     { lat: 9.1,   lon: 7.5,    label: "Nigeria",      abbr: "NGA" },
  ghana:       { lat: 7.9,   lon: -1.0,   label: "Ghana",        abbr: "GHA" },
  ivorycoast:  { lat: 7.5,   lon: -5.5,   label: "Ivory Coast",  abbr: "CIV" },
  senegal:     { lat: 14.7,  lon: -17.4,  label: "Senegal",      abbr: "SEN" },
  cameroon:    { lat: 7.4,   lon: 12.4,   label: "Cameroon",     abbr: "CMR" },
  egypt:       { lat: 30.0,  lon: 31.2,   label: "Egypt",        abbr: "EGY" },
  southafrica: { lat: -26.2, lon: 28.0,   label: "South Africa", abbr: "RSA" }, // Johannesburg
  // Americas — population centers (geographic centers fall on dark/ocean areas)
  usa:         { lat: 38.9,  lon: -77.0,  label: "USA",          abbr: "USA" }, // Washington DC
  canada:      { lat: 43.7,  lon: -79.4,  label: "Canada",       abbr: "CAN" }, // Toronto
  mexico:      { lat: 19.4,  lon: -99.1,  label: "Mexico",       abbr: "MEX" }, // Mexico City
  brazil:      { lat: -15.8, lon: -47.9,  label: "Brazil",       abbr: "BRA" }, // Brasília
  argentina:   { lat: -34.6, lon: -58.4,  label: "Argentina",    abbr: "ARG" }, // Buenos Aires
  colombia:    { lat: 4.7,   lon: -74.1,  label: "Colombia",     abbr: "COL" }, // Bogotá
  // Asia — population centers for large countries
  japan:       { lat: 36.2,  lon: 138.3,  label: "Japan",        abbr: "JPN" },
  southkorea:  { lat: 35.9,  lon: 127.8,  label: "S. Korea",     abbr: "KOR" },
  china:       { lat: 39.9,  lon: 116.4,  label: "China",        abbr: "CHN" }, // Beijing
  saudiarabia: { lat: 24.7,  lon: 46.7,   label: "Saudi Arabia", abbr: "KSA" }, // Riyadh
  // Oceania — population centers
  australia:   { lat: -33.9, lon: 151.2,  label: "Australia",    abbr: "AUS" }, // Sydney
  newzealand:  { lat: -41.3, lon: 174.8,  label: "New Zealand",  abbr: "NZL" }, // Wellington
};

/** European countries — smaller markers by default to avoid crowding. */
const EUROPE_KEYS = new Set([
  "england", "scotland", "france", "spain", "portugal",
  "germany", "netherlands", "belgium", "switzerland", "italy", "turkey",
]);

// =============================================================================
// SVG POSITIONS — hand-calibrated against the AI-generated background image
// =============================================================================

// The background image (1376×768) is rendered into viewBox 800×450 with
// preserveAspectRatio="xMidYMid slice". Positions are traced from visible
// landmasses and city-light clusters on the actual image.
const COUNTRY_SVG_POS: Record<string, { x: number; y: number }> = {
  // Europe — calibrated from rendered screenshot against visible landmasses
  england:     { x: 382, y: 142 },  // London/SE England
  scotland:    { x: 377, y: 132 },  // Central Scotland
  france:      { x: 388, y: 150 },  // Paris region
  spain:       { x: 378, y: 162 },  // Central Iberia
  portugal:    { x: 370, y: 161 },  // Western Iberia
  germany:     { x: 400, y: 140 },  // Central Germany
  netherlands: { x: 394, y: 135 },  // Dutch coast
  belgium:     { x: 394, y: 142 },  // Between FR/NL
  switzerland: { x: 399, y: 150 },  // Alpine region
  italy:       { x: 406, y: 156 },  // Rome area
  turkey:      { x: 435, y: 155 },  // Ankara area
  // Africa
  senegal:     { x: 365, y: 194 },  // Dakar / western tip
  ivorycoast:  { x: 378, y: 200 },  // Abidjan coast
  ghana:       { x: 385, y: 200 },  // Accra coast
  nigeria:     { x: 397, y: 200 },  // Lagos / Gulf of Guinea
  cameroon:    { x: 406, y: 202 },  // Douala / Yaoundé
  egypt:       { x: 433, y: 170 },  // Cairo / Nile delta
  southafrica: { x: 420, y: 250 },  // Johannesburg
  // Americas
  usa:         { x: 237, y: 158 },  // Washington DC / east coast
  canada:      { x: 228, y: 148 },  // Toronto / Great Lakes
  mexico:      { x: 196, y: 178 },  // Mexico City
  brazil:      { x: 270, y: 243 },  // São Paulo / Brasília
  argentina:   { x: 255, y: 272 },  // Buenos Aires
  colombia:    { x: 220, y: 198 },  // Bogotá
  // Asia
  china:       { x: 635, y: 145 },  // Beijing
  southkorea:  { x: 648, y: 148 },  // Seoul
  japan:       { x: 660, y: 150 },  // Tokyo
  saudiarabia: { x: 450, y: 175 },  // Riyadh
  // Oceania
  australia:   { x: 685, y: 262 },  // Sydney / east coast
  newzealand:  { x: 720, y: 278 },  // Wellington
};

// Fallback projection for countries without hand-calibrated positions
function lonLatToSvg(lon: number, lat: number): { x: number; y: number } {
  const x = -2 + ((lon + 180) / 360) * 770;
  const y = 8 + ((80 - lat) / 148) * 400;
  return { x, y };
}

/** Get SVG coords for a country (hand-calibrated, or projection fallback). */
function getCountryPos(key: string): { x: number; y: number } | null {
  const direct = COUNTRY_SVG_POS[key];
  if (direct) return direct;
  const coords = COUNTRY_COORDS[key];
  if (!coords) return null;
  return lonLatToSvg(coords.lon, coords.lat);
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
