"use client";

/**
 * F20: Data Visualization Dashboard — CSS/SVG chart components.
 *
 * All charts are built with inline SVG and Tailwind CSS. No external
 * charting libraries are used to keep the bundle small.
 *
 * Components:
 *  - ScatterPlot   — value vs ability, age vs potential
 *  - BarChart       — league comparison, regional stats
 *  - RadarChart     — player attribute profiles
 *  - TrendLine      — development trajectories over seasons
 *  - HeatMap        — scouting coverage by country/region
 */

import type {
  ScatterPlotData,
  HeatMapData,
  TrendLineData,
  BarChartData,
  RadarChartData,
} from "@/engine/core/types";

// =============================================================================
// POSITION COLOR MAP
// =============================================================================

const POSITION_COLORS: Record<string, string> = {
  GK: "#facc15",   // yellow-400
  CB: "#3b82f6",   // blue-500
  LB: "#60a5fa",   // blue-400
  RB: "#60a5fa",   // blue-400
  CDM: "#a78bfa",  // violet-400
  CM: "#818cf8",   // indigo-400
  CAM: "#c084fc",  // purple-400
  LW: "#34d399",   // emerald-400
  RW: "#34d399",   // emerald-400
  ST: "#f87171",   // red-400
};

function getPositionColor(position: string): string {
  return POSITION_COLORS[position] ?? "#71717a"; // zinc-500 fallback
}

// =============================================================================
// SCATTER PLOT
// =============================================================================

interface ScatterPlotProps {
  data: ScatterPlotData;
  width?: number;
  height?: number;
  onPointClick?: (playerId: string) => void;
}

export function ScatterPlot({
  data,
  width = 400,
  height = 280,
  onPointClick,
}: ScatterPlotProps) {
  const padding = { top: 20, right: 20, bottom: 36, left: 50 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const xScale = (v: number) => padding.left + (v / data.xMax) * plotW;
  const yScale = (v: number) => padding.top + plotH - (v / data.yMax) * plotH;

  // Y-axis tick values (5 ticks)
  const yTicks = Array.from({ length: 5 }, (_, i) =>
    Math.round((data.yMax / 4) * i),
  );
  // X-axis tick values (5 ticks)
  const xTicks = Array.from({ length: 5 }, (_, i) =>
    Math.round((data.xMax / 4) * i),
  );

  /** Format large numbers for axis labels. */
  function formatValue(v: number): string {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
    return String(v);
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      aria-label={`Scatter plot: ${data.xLabel} vs ${data.yLabel}`}
    >
      {/* Grid lines */}
      {yTicks.map((tick) => (
        <line
          key={`yg-${tick}`}
          x1={padding.left}
          x2={width - padding.right}
          y1={yScale(tick)}
          y2={yScale(tick)}
          stroke="#27272a"
          strokeWidth="0.5"
        />
      ))}

      {/* Y-axis labels */}
      {yTicks.map((tick) => (
        <text
          key={`yl-${tick}`}
          x={padding.left - 6}
          y={yScale(tick) + 3}
          textAnchor="end"
          className="fill-zinc-500"
          fontSize="8"
        >
          {formatValue(tick)}
        </text>
      ))}

      {/* X-axis labels */}
      {xTicks.map((tick) => (
        <text
          key={`xl-${tick}`}
          x={xScale(tick)}
          y={height - 4}
          textAnchor="middle"
          className="fill-zinc-500"
          fontSize="8"
        >
          {formatValue(tick)}
        </text>
      ))}

      {/* Axis labels */}
      <text
        x={width / 2}
        y={height - 16}
        textAnchor="middle"
        className="fill-zinc-400"
        fontSize="9"
      >
        {data.xLabel}
      </text>
      <text
        x={12}
        y={height / 2}
        textAnchor="middle"
        className="fill-zinc-400"
        fontSize="9"
        transform={`rotate(-90, 12, ${height / 2})`}
      >
        {data.yLabel}
      </text>

      {/* Data points */}
      {data.points.map((point) => (
        <circle
          key={point.playerId}
          cx={xScale(point.x)}
          cy={yScale(point.y)}
          r={point.isAnomaly ? 5 : 3}
          fill={getPositionColor(point.category)}
          opacity={point.isAnomaly ? 1 : 0.7}
          stroke={point.isAnomaly ? "#ffffff" : "none"}
          strokeWidth={point.isAnomaly ? 1.5 : 0}
          className="cursor-pointer transition-opacity hover:opacity-100"
          onClick={() => onPointClick?.(point.playerId)}
        >
          <title>{`${point.label} (${point.category}) — ${data.xLabel}: ${point.x}, ${data.yLabel}: ${formatValue(point.y)}${point.isAnomaly ? " [ANOMALY]" : ""}`}</title>
        </circle>
      ))}
    </svg>
  );
}

// =============================================================================
// BAR CHART
// =============================================================================

interface BarChartProps {
  data: BarChartData;
  height?: number;
  showSecondary?: boolean;
}

export function BarChart({
  data,
  height = 220,
  showSecondary = false,
}: BarChartProps) {
  if (data.bars.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-zinc-500">
        No data available
      </div>
    );
  }

  const maxVal = Math.max(
    data.maxValue,
    ...data.bars.map((b) => b.value),
    ...(showSecondary ? data.bars.map((b) => b.secondaryValue ?? 0) : []),
  );

  return (
    <div className="w-full" style={{ height }} aria-label={`Bar chart: ${data.yLabel}`}>
      {/* Y-axis label */}
      <div className="mb-1 text-center text-[9px] text-zinc-500">{data.yLabel}</div>
      <div className="flex h-full items-end gap-1 px-2 pb-6">
        {data.bars.map((bar) => {
          const primaryHeight = (bar.value / maxVal) * 100;
          const secondaryHeight = showSecondary && bar.secondaryValue
            ? (bar.secondaryValue / maxVal) * 100
            : 0;

          return (
            <div key={bar.key} className="flex flex-1 flex-col items-center gap-0.5">
              <span className="text-[8px] font-semibold text-zinc-300 tabular-nums">
                {bar.value}
              </span>
              <div className="relative flex w-full items-end justify-center gap-0.5" style={{ height: `${height - 60}px` }}>
                {/* Secondary bar (PA) */}
                {showSecondary && bar.secondaryValue !== undefined && (
                  <div
                    className="w-2 rounded-t bg-zinc-600 transition-all"
                    style={{ height: `${secondaryHeight}%` }}
                    title={`${bar.label} PA: ${bar.secondaryValue}`}
                  />
                )}
                {/* Primary bar (CA) */}
                <div
                  className="w-3 rounded-t bg-emerald-500 transition-all"
                  style={{ height: `${primaryHeight}%` }}
                  title={`${bar.label}: ${bar.value}`}
                />
              </div>
              <span className="mt-0.5 max-w-[48px] truncate text-center text-[7px] text-zinc-500">
                {bar.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// RADAR CHART
// =============================================================================

interface RadarChartProps {
  data: RadarChartData;
  size?: number;
}

export function RadarChart({ data, size = 240 }: RadarChartProps) {
  const center = size / 2;
  const maxRadius = (size - 40) / 2;
  const n = data.axes.length;

  if (n < 3) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-zinc-500">
        Need at least 3 axes
      </div>
    );
  }

  const angleStep = (2 * Math.PI) / n;

  /** Get x,y coordinates for a value on axis i. */
  function getPoint(i: number, value: number, max: number): { x: number; y: number } {
    const angle = -Math.PI / 2 + i * angleStep;
    const ratio = value / max;
    return {
      x: center + Math.cos(angle) * ratio * maxRadius,
      y: center + Math.sin(angle) * ratio * maxRadius,
    };
  }

  // Build polygon points for the data shape
  const shapePoints = data.axes
    .map((axis, i) => {
      const pt = getPoint(i, axis.value, axis.max);
      return `${pt.x},${pt.y}`;
    })
    .join(" ");

  // Concentric grid rings (at 25%, 50%, 75%, 100%)
  const rings = [0.25, 0.5, 0.75, 1.0];

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="mx-auto w-full"
      style={{ maxWidth: size }}
      aria-label={`Radar chart: ${data.label}`}
    >
      {/* Grid rings */}
      {rings.map((r) => {
        const ringPoints = Array.from({ length: n }, (_, i) => {
          const angle = -Math.PI / 2 + i * angleStep;
          return `${center + Math.cos(angle) * r * maxRadius},${center + Math.sin(angle) * r * maxRadius}`;
        }).join(" ");

        return (
          <polygon
            key={`ring-${r}`}
            points={ringPoints}
            fill="none"
            stroke="#27272a"
            strokeWidth="0.5"
          />
        );
      })}

      {/* Axis lines */}
      {data.axes.map((_, i) => {
        const angle = -Math.PI / 2 + i * angleStep;
        const ex = center + Math.cos(angle) * maxRadius;
        const ey = center + Math.sin(angle) * maxRadius;
        return (
          <line
            key={`axis-${i}`}
            x1={center}
            y1={center}
            x2={ex}
            y2={ey}
            stroke="#3f3f46"
            strokeWidth="0.5"
          />
        );
      })}

      {/* Data polygon */}
      <polygon
        points={shapePoints}
        fill="rgba(52, 211, 153, 0.2)"
        stroke="#34d399"
        strokeWidth="1.5"
      />

      {/* Data points */}
      {data.axes.map((axis, i) => {
        const pt = getPoint(i, axis.value, axis.max);
        return (
          <circle
            key={`pt-${i}`}
            cx={pt.x}
            cy={pt.y}
            r="3"
            fill="#34d399"
          >
            <title>{`${axis.label}: ${Math.round(axis.value)}/${axis.max}`}</title>
          </circle>
        );
      })}

      {/* Labels */}
      {data.axes.map((axis, i) => {
        const angle = -Math.PI / 2 + i * angleStep;
        const labelR = maxRadius + 16;
        const lx = center + Math.cos(angle) * labelR;
        const ly = center + Math.sin(angle) * labelR;
        return (
          <text
            key={`label-${i}`}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-zinc-400"
            fontSize="8"
          >
            {axis.label}
          </text>
        );
      })}
    </svg>
  );
}

// =============================================================================
// TREND LINE
// =============================================================================

interface TrendLineProps {
  lines: TrendLineData[];
  width?: number;
  height?: number;
}

export function TrendLine({
  lines,
  width = 400,
  height = 200,
}: TrendLineProps) {
  if (lines.length === 0 || lines.every((l) => l.points.length === 0)) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-zinc-500">
        No trend data available
      </div>
    );
  }

  const padding = { top: 16, right: 16, bottom: 32, left: 40 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  // Compute domain
  const allPoints = lines.flatMap((l) => l.points);
  const seasonMin = Math.min(...allPoints.map((p) => p.season));
  const seasonMax = Math.max(...allPoints.map((p) => p.season));
  const valueMin = Math.min(...allPoints.map((p) => p.value));
  const valueMax = Math.max(...allPoints.map((p) => p.value));

  const seasonRange = Math.max(1, seasonMax - seasonMin);
  const valueRange = Math.max(1, valueMax - valueMin);
  const valuePad = valueRange * 0.1;

  const xScale = (s: number) =>
    padding.left + ((s - seasonMin) / seasonRange) * plotW;
  const yScale = (v: number) =>
    padding.top + plotH - ((v - (valueMin - valuePad)) / (valueRange + valuePad * 2)) * plotH;

  // Y-axis ticks
  const yTicks = Array.from({ length: 5 }, (_, i) =>
    Math.round(valueMin + (valueRange / 4) * i),
  );

  // X-axis ticks (seasons)
  const xTicks: number[] = [];
  for (let s = seasonMin; s <= seasonMax; s++) {
    xTicks.push(s);
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        aria-label="Development trend lines"
      >
        {/* Grid */}
        {yTicks.map((tick) => (
          <line
            key={`yg-${tick}`}
            x1={padding.left}
            x2={width - padding.right}
            y1={yScale(tick)}
            y2={yScale(tick)}
            stroke="#27272a"
            strokeWidth="0.5"
          />
        ))}

        {/* Y-axis labels */}
        {yTicks.map((tick) => (
          <text
            key={`yl-${tick}`}
            x={padding.left - 6}
            y={yScale(tick) + 3}
            textAnchor="end"
            className="fill-zinc-500"
            fontSize="8"
          >
            {tick}
          </text>
        ))}

        {/* X-axis labels */}
        {xTicks.map((season) => (
          <text
            key={`xl-${season}`}
            x={xScale(season)}
            y={height - 6}
            textAnchor="middle"
            className="fill-zinc-500"
            fontSize="8"
          >
            S{season}
          </text>
        ))}

        {/* Lines */}
        {lines.map((line) => {
          if (line.points.length < 2) return null;
          const pathData = line.points
            .map((p, i) =>
              `${i === 0 ? "M" : "L"} ${xScale(p.season)} ${yScale(p.value)}`,
            )
            .join(" ");

          return (
            <g key={line.playerId}>
              <path
                d={pathData}
                fill="none"
                stroke={line.color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Data point dots */}
              {line.points.map((p) => (
                <circle
                  key={`${line.playerId}-${p.season}`}
                  cx={xScale(p.season)}
                  cy={yScale(p.value)}
                  r="3"
                  fill={line.color}
                >
                  <title>{`${line.label} S${p.season}: CA ${p.value}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-3 px-2">
        {lines.map((line) => (
          <div key={line.playerId} className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: line.color }}
            />
            <span className="text-[9px] text-zinc-400">{line.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// HEAT MAP
// =============================================================================

interface HeatMapProps {
  data: HeatMapData;
  maxCells?: number;
}

export function HeatMap({ data, maxCells = 20 }: HeatMapProps) {
  const cells = data.cells.slice(0, maxCells);

  if (cells.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-xs text-zinc-500">
        No coverage data available
      </div>
    );
  }

  return (
    <div aria-label={data.title}>
      <div className="grid grid-cols-4 gap-1 sm:grid-cols-5">
        {cells.map((cell) => {
          // Intensity maps to opacity of emerald-500
          const bgOpacity = Math.max(0.08, cell.intensity);
          const textColor =
            cell.intensity > 0.5
              ? "text-white"
              : cell.intensity > 0.15
                ? "text-emerald-300"
                : "text-zinc-500";

          return (
            <div
              key={cell.key}
              className={`rounded px-1.5 py-2 text-center transition-colors ${textColor}`}
              style={{
                backgroundColor: `rgba(16, 185, 129, ${bgOpacity})`,
              }}
              title={`${cell.label}: ${cell.rawValue} observations`}
            >
              <div className="truncate text-[8px] font-medium leading-tight">
                {cell.label}
              </div>
              <div className="mt-0.5 text-[10px] font-bold tabular-nums">
                {cell.rawValue}
              </div>
            </div>
          );
        })}
      </div>

      {/* Intensity legend */}
      <div className="mt-2 flex items-center justify-between px-1">
        <span className="text-[8px] text-zinc-600">Low</span>
        <div className="flex flex-1 mx-2 h-1.5 rounded-full overflow-hidden">
          <div className="flex-1" style={{ backgroundColor: "rgba(16, 185, 129, 0.1)" }} />
          <div className="flex-1" style={{ backgroundColor: "rgba(16, 185, 129, 0.3)" }} />
          <div className="flex-1" style={{ backgroundColor: "rgba(16, 185, 129, 0.5)" }} />
          <div className="flex-1" style={{ backgroundColor: "rgba(16, 185, 129, 0.7)" }} />
          <div className="flex-1" style={{ backgroundColor: "rgba(16, 185, 129, 1.0)" }} />
        </div>
        <span className="text-[8px] text-zinc-600">High</span>
      </div>
    </div>
  );
}

// =============================================================================
// POSITION LEGEND (shared helper)
// =============================================================================

const POSITION_GROUPS = [
  { positions: ["GK"], label: "GK", color: POSITION_COLORS.GK },
  { positions: ["CB", "LB", "RB"], label: "DEF", color: POSITION_COLORS.CB },
  { positions: ["CDM", "CM", "CAM"], label: "MID", color: POSITION_COLORS.CM },
  { positions: ["LW", "RW", "ST"], label: "ATT", color: POSITION_COLORS.ST },
] as const;

export function PositionLegend() {
  return (
    <div className="flex gap-3">
      {POSITION_GROUPS.map((group) => (
        <div key={group.label} className="flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: group.color }}
          />
          <span className="text-[9px] text-zinc-500">{group.label}</span>
        </div>
      ))}
    </div>
  );
}
