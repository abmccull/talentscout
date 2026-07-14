"use client";

import * as React from "react";
import {
  getCountryMapDefinition,
  getCountryMapPosition,
  isCompactCountryMapMarker,
} from "@/engine/world/mapCountryRegistry";

// =============================================================================
// TYPES
// =============================================================================

export interface WorldMapProps {
  /** All country keys that exist in the game world. */
  countries: string[];
  /** Familiarity level per country key, 0–100. */
  familiarityLevels?: Record<string, number>;
  /** Regional knowledge level per country key, 0–100 (F13). */
  knowledgeLevels?: Record<string, number>;
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
  const from = getCountryMapPosition(fromKey);
  const to = getCountryMapPosition(toKey);
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
  /** Regional knowledge level 0–100 (F13). */
  knowledgeLevel: number;
  isCurrent: boolean;
  hasActiveAssignment: boolean;
  delay: number;
  onClick?: () => void;
}

function CountryMarker({
  countryKey,
  familiarity,
  knowledgeLevel,
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

  const country = getCountryMapDefinition(countryKey);
  const pos = getCountryMapPosition(countryKey);
  if (!country || !pos) return null;

  const { x, y } = pos;
  const tier = getTierColors(familiarity);
  const isCompact = isCompactCountryMapMarker(countryKey);

  // Dense regional clusters use smaller default markers to reduce crowding.
  const baseCore = isCompact ? 4 : 6;
  const baseRing = isCompact ? 8 : 14;
  const baseArc = isCompact ? 6.5 : 11;

  // Hover expands compact markers to the standard interaction target.
  const coreR = hovered && isCompact ? 6 : baseCore;
  const ringR = hovered && isCompact ? 14 : baseRing;
  const arcR = hovered && isCompact ? 11 : baseArc;

  const scale = hovered ? 1.3 : 1;

  return (
    <g
      role="button"
      aria-label={`${country.label}${isCurrent ? " (current location)" : ""}${hasActiveAssignment ? ", active assignment" : ""}, familiarity ${familiarity}%`}
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
        fontSize={isCompact && !hovered ? 3 : 4.5}
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
        {country.abbreviation}
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
          {country.label}
        </text>
      )}

      {/* Pulsing emerald dot for active assignments */}
      {hasActiveAssignment && (
        <circle
          cx={x + (isCompact && !hovered ? 4 : 6)}
          cy={y - (isCompact && !hovered ? 4 : 6)}
          r={3}
          fill="#10b981"
          aria-hidden="true"
        >
          <animate attributeName="r" values="2.5;4;2.5" dur="1.8s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.5;1" dur="1.8s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Knowledge level indicator (F13) — small diamond badge bottom-right */}
      {knowledgeLevel > 0 && (
        <g aria-hidden="true">
          <rect
            x={x + (isCompact && !hovered ? 3 : 5) - 3.5}
            y={y + (isCompact && !hovered ? 3 : 5) - 3.5}
            width={7}
            height={7}
            rx={1.5}
            fill={
              knowledgeLevel >= 75 ? "#a855f7" :
              knowledgeLevel >= 50 ? "#6366f1" :
              knowledgeLevel >= 25 ? "#8b5cf6" :
              "#64748b"
            }
            stroke="#0a0a0a"
            strokeWidth={0.5}
            opacity={hovered ? 1 : 0.8}
          />
          <text
            x={x + (isCompact && !hovered ? 3 : 5)}
            y={y + (isCompact && !hovered ? 3 : 5) + 0.5}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={4}
            fontWeight="700"
            fontFamily="system-ui, sans-serif"
            fill="#fff"
            pointerEvents="none"
          >
            {knowledgeLevel >= 75 ? "M" : knowledgeLevel >= 50 ? "E" : knowledgeLevel >= 25 ? "F" : "N"}
          </text>
        </g>
      )}

      {/* Knowledge level tooltip on hover */}
      {hovered && knowledgeLevel > 0 && (
        <text
          x={x}
          y={y + ringR + 10}
          textAnchor="middle"
          dominantBaseline="auto"
          fontSize="6"
          fontWeight="500"
          fontFamily="system-ui, sans-serif"
          fill="#c4b5fd"
          pointerEvents="none"
          aria-hidden="true"
          style={{
            textShadow: "0 1px 4px rgba(0,0,0,0.9)",
          }}
        >
          Knowledge: {knowledgeLevel}%
        </text>
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
 * Uses an illustrated background with canonical, image-calibrated beacon
 * markers. 5-tier color coding for familiarity, sonar pulse on current
 * location, and an animated flight path for active bookings all share the
 * same country-position resolver.
 */
export function WorldMap({
  countries,
  familiarityLevels = {},
  knowledgeLevels = {},
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
      role="group"
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
        if (!getCountryMapDefinition(key)) return null;
        return (
          <CountryMarker
            key={key}
            countryKey={key}
            familiarity={familiarityLevels[key] ?? 0}
            knowledgeLevel={knowledgeLevels[key] ?? 0}
            isCurrent={key === currentLocation}
            hasActiveAssignment={activeSet.has(key)}
            delay={idx * 30}
            onClick={
              onCountryClick
                ? () => {
                    const pos = getCountryMapPosition(key);
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

export {
  getCountryMapDefinition,
  getCountryMapPosition,
  getTierColors,
};
export type { TierColors };
