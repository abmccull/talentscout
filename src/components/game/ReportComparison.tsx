"use client";

import { useMemo } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, X } from "lucide-react";
import type {
  ScoutReport,
  ConvictionLevel,
  AttributeComparisonEntry,
  ReportComparison as ReportComparisonData,
  ReportComparisonMetrics,
  Player,
  Position,
} from "@/engine/core/types";
import { compareReports, calculatePositionFit } from "@/engine/reports/comparison";
import { StarRating, StarRatingRange } from "@/components/ui/StarRating";
import { ScreenBackground } from "@/components/ui/screen-background";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLAYER_COLORS = [
  { text: "text-emerald-400", bg: "bg-emerald-500", border: "border-emerald-500", fill: "#34d399" },
  { text: "text-sky-400", bg: "bg-sky-500", border: "border-sky-500", fill: "#38bdf8" },
  { text: "text-amber-400", bg: "bg-amber-500", border: "border-amber-500", fill: "#fbbf24" },
];

const CONVICTION_LABELS: Record<ConvictionLevel, string> = {
  note: "Note",
  recommend: "Recommend",
  strongRecommend: "Strong Rec",
  tablePound: "Table Pound",
};

const CONVICTION_VARIANT: Record<
  ConvictionLevel,
  "default" | "secondary" | "success" | "warning" | "destructive" | "outline"
> = {
  note: "outline",
  recommend: "secondary",
  strongRecommend: "success",
  tablePound: "default",
};

const DOMAIN_LABELS: Record<string, string> = {
  technical: "Technical",
  physical: "Physical",
  mental: "Mental",
  tactical: "Tactical",
  hidden: "Hidden",
};

// ---------------------------------------------------------------------------
// Radar Chart (pure SVG, no external libs)
// ---------------------------------------------------------------------------

const RADAR_SIZE = 280;
const RADAR_CENTER = RADAR_SIZE / 2;
const RADAR_RADIUS = 110;
const RADAR_LEVELS = 4; // concentric rings

interface RadarChartProps {
  attributes: AttributeComparisonEntry[];
  playerCount: number;
}

function RadarChart({ attributes, playerCount }: RadarChartProps) {
  if (attributes.length < 3) return null;

  // Pick up to 12 attributes for a readable radar
  const radarAttrs = attributes.slice(0, 12);
  const count = radarAttrs.length;
  const angleStep = (2 * Math.PI) / count;

  function polarToXY(angle: number, radius: number): [number, number] {
    return [
      RADAR_CENTER + radius * Math.sin(angle),
      RADAR_CENTER - radius * Math.cos(angle),
    ];
  }

  // Concentric level rings
  const rings = [];
  for (let level = 1; level <= RADAR_LEVELS; level++) {
    const r = (RADAR_RADIUS / RADAR_LEVELS) * level;
    const pts = [];
    for (let i = 0; i < count; i++) {
      pts.push(polarToXY(i * angleStep, r));
    }
    rings.push(
      <polygon
        key={`ring-${level}`}
        points={pts.map(([x, y]) => `${x},${y}`).join(" ")}
        fill="none"
        stroke="#27272a"
        strokeWidth={1}
      />,
    );
  }

  // Spoke lines
  const spokes = radarAttrs.map((_, i) => {
    const [x, y] = polarToXY(i * angleStep, RADAR_RADIUS);
    return (
      <line
        key={`spoke-${i}`}
        x1={RADAR_CENTER}
        y1={RADAR_CENTER}
        x2={x}
        y2={y}
        stroke="#27272a"
        strokeWidth={1}
      />
    );
  });

  // Labels
  const labels = radarAttrs.map((attr, i) => {
    const [x, y] = polarToXY(i * angleStep, RADAR_RADIUS + 22);
    const name = String(attr.attribute).replace(/([A-Z])/g, " $1").trim();
    const shortName = name.length > 10 ? name.slice(0, 8) + ".." : name;
    return (
      <text
        key={`label-${i}`}
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-zinc-500 text-[9px]"
      >
        {shortName}
      </text>
    );
  });

  // Player polygons
  const playerPolygons = [];
  for (let p = 0; p < playerCount; p++) {
    const points = radarAttrs.map((attr, i) => {
      const value = attr.values[p] ?? 0;
      const r = (value / 20) * RADAR_RADIUS;
      return polarToXY(i * angleStep, r);
    });

    playerPolygons.push(
      <polygon
        key={`player-${p}`}
        points={points.map(([x, y]) => `${x},${y}`).join(" ")}
        fill={PLAYER_COLORS[p].fill}
        fillOpacity={0.15}
        stroke={PLAYER_COLORS[p].fill}
        strokeWidth={2}
        strokeOpacity={0.8}
      />,
    );
  }

  return (
    <svg
      viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}
      className="w-full max-w-[320px] mx-auto"
      aria-label="Radar chart comparing player attributes"
    >
      {rings}
      {spokes}
      {playerPolygons}
      {labels}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Position Suitability Bars
// ---------------------------------------------------------------------------

const ALL_POSITIONS: Position[] = ["GK", "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST"];

interface PositionBarsProps {
  reports: ScoutReport[];
  playerNames: string[];
}

function PositionBars({ reports, playerNames }: PositionBarsProps) {
  const positions = ALL_POSITIONS.filter((pos) => pos !== "GK"); // GK rarely compared with outfield

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
        Position Suitability
      </h3>
      {positions.map((pos) => (
        <div key={pos} className="flex items-center gap-2">
          <span className="w-10 shrink-0 text-xs font-mono text-zinc-400">{pos}</span>
          <div className="flex-1 flex gap-1">
            {reports.map((report, idx) => {
              const fit = calculatePositionFit(report, pos);
              return (
                <div
                  key={report.id}
                  className="flex-1 relative h-3 rounded-full bg-[#1a1a1a] overflow-hidden"
                  title={`${playerNames[idx]}: ${fit}% fit for ${pos}`}
                >
                  <div
                    className={`absolute left-0 top-0 h-full rounded-full ${PLAYER_COLORS[idx].bg} opacity-70`}
                    style={{ width: `${fit}%` }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-[8px] font-mono text-white/80">
                    {fit}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Strengths / Weaknesses Comparison Matrix
// ---------------------------------------------------------------------------

interface StrengthWeaknessMatrixProps {
  reports: ScoutReport[];
  playerNames: string[];
}

function StrengthWeaknessMatrix({ reports, playerNames }: StrengthWeaknessMatrixProps) {
  // Collect all unique strengths and weaknesses
  const allStrengths = [...new Set(reports.flatMap((r) => r.strengths))];
  const allWeaknesses = [...new Set(reports.flatMap((r) => r.weaknesses))];

  return (
    <div className="space-y-4">
      {allStrengths.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
            Strengths Comparison
          </h3>
          <div className="space-y-1">
            {allStrengths.map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-emerald-600 shrink-0 mt-0.5">+</span>
                <span className="flex-1 text-zinc-400">{s.length > 60 ? s.slice(0, 57) + "..." : s}</span>
                <div className="flex gap-1 shrink-0">
                  {reports.map((r, idx) => (
                    <span
                      key={r.id}
                      className={`w-5 h-5 rounded-full text-[9px] flex items-center justify-center font-bold ${
                        r.strengths.includes(s)
                          ? `${PLAYER_COLORS[idx].bg} text-black`
                          : "bg-[#1a1a1a] text-zinc-600"
                      }`}
                      title={playerNames[idx]}
                    >
                      {idx + 1}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {allWeaknesses.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
            Weaknesses Comparison
          </h3>
          <div className="space-y-1">
            {allWeaknesses.map((w, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-red-600 shrink-0 mt-0.5">-</span>
                <span className="flex-1 text-zinc-400">{w.length > 60 ? w.slice(0, 57) + "..." : w}</span>
                <div className="flex gap-1 shrink-0">
                  {reports.map((r, idx) => (
                    <span
                      key={r.id}
                      className={`w-5 h-5 rounded-full text-[9px] flex items-center justify-center font-bold ${
                        r.weaknesses.includes(w)
                          ? "bg-red-500 text-black"
                          : "bg-[#1a1a1a] text-zinc-600"
                      }`}
                      title={playerNames[idx]}
                    >
                      {idx + 1}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function formatValue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(value);
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function ReportComparison() {
  const { gameState, comparisonReportIds, clearComparison, removeFromComparison, setScreen } = useGameStore();

  const { reports, players, comparison, playerNames } = useMemo(() => {
    if (!gameState) {
      return {
        reports: [] as ScoutReport[],
        players: [] as (Player | undefined)[],
        comparison: null as ReportComparisonData | null,
        playerNames: [] as string[],
      };
    }

    const rpts = comparisonReportIds
      .map((id) => gameState.reports[id])
      .filter((r): r is ScoutReport => r != null);

    const plrs = rpts.map((r) => gameState.players[r.playerId]);
    const names = plrs.map((p) => (p ? `${p.firstName} ${p.lastName}` : "Unknown"));
    const comp = rpts.length >= 2 ? compareReports(rpts) : null;

    return { reports: rpts, players: plrs, comparison: comp, playerNames: names };
  }, [gameState, comparisonReportIds]);

  if (!gameState || reports.length < 2 || !comparison) {
    return (
      <GameLayout>
        <div className="relative min-h-full p-6">
          <ScreenBackground src="/images/backgrounds/reports-desk.png" opacity={0.82} />
          <div className="relative z-10 flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm text-zinc-500 mb-4">
              Select at least 2 reports from Report History to compare.
            </p>
            <Button size="sm" onClick={() => setScreen("reportHistory")}>
              <ArrowLeft size={14} className="mr-1" /> Back to Reports
            </Button>
          </div>
        </div>
      </GameLayout>
    );
  }

  return (
    <GameLayout>
      <div className="relative min-h-full p-6">
        <ScreenBackground src="/images/backgrounds/reports-desk.png" opacity={0.82} />
        <div className="relative z-10">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Report Comparison</h1>
              <p className="text-sm text-zinc-400">
                Comparing {reports.length} scouted players side-by-side
              </p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={clearComparison}>
                Clear All
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setScreen("reportHistory")}
              >
                <ArrowLeft size={14} className="mr-1" /> Back
              </Button>
            </div>
          </div>

          {/* Player cards — side-by-side */}
          <div className={`mb-6 grid gap-4 ${reports.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
            {reports.map((report, idx) => {
              const player = players[idx];
              const metrics = comparison.metrics[idx];
              const color = PLAYER_COLORS[idx];

              return (
                <Card key={report.id} className={`border-l-2 ${color.border}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`w-5 h-5 rounded-full ${color.bg} text-black text-[10px] font-bold flex items-center justify-center`}>
                            {idx + 1}
                          </span>
                          <h3 className={`font-bold ${color.text}`}>
                            {playerNames[idx]}
                          </h3>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                          {player && (
                            <>
                              <span>{player.position}</span>
                              <span>Age {player.age}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => removeFromComparison(report.id)}
                        className="rounded-md p-1 text-zinc-600 hover:text-red-400 hover:bg-[#27272a] transition"
                        aria-label={`Remove ${playerNames[idx]} from comparison`}
                      >
                        <X size={14} />
                      </button>
                    </div>

                    {/* Key metrics */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-zinc-500">Conviction</span>
                        <div className="mt-0.5">
                          <Badge variant={CONVICTION_VARIANT[metrics.conviction]} className="text-[10px]">
                            {CONVICTION_LABELS[metrics.conviction]}
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <span className="text-zinc-500">Est. Value</span>
                        <p className="font-bold text-white mt-0.5">{formatValue(metrics.estimatedValue)}</p>
                      </div>
                      {metrics.perceivedCAStars != null && (
                        <div>
                          <span className="text-zinc-500">CA</span>
                          <div className="mt-0.5">
                            <StarRating rating={metrics.perceivedCAStars} size="sm" />
                          </div>
                        </div>
                      )}
                      {metrics.perceivedPARange != null && (
                        <div>
                          <span className="text-zinc-500">PA</span>
                          <div className="mt-0.5">
                            <StarRatingRange
                              low={metrics.perceivedPARange[0]}
                              high={metrics.perceivedPARange[1]}
                              size="sm"
                            />
                          </div>
                        </div>
                      )}
                      <div>
                        <span className="text-zinc-500">Avg Attr</span>
                        <p className="font-bold text-white mt-0.5">{metrics.avgAttribute.toFixed(1)}</p>
                      </div>
                      <div>
                        <span className="text-zinc-500">S / W</span>
                        <p className="mt-0.5">
                          <span className="text-emerald-400 font-bold">{metrics.strengthCount}</span>
                          <span className="text-zinc-600 mx-1">/</span>
                          <span className="text-red-400 font-bold">{metrics.weaknessCount}</span>
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Summary text */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                Comparison Summary
              </h3>
              <p className="text-sm text-zinc-300 leading-relaxed">{comparison.summaryText}</p>
            </CardContent>
          </Card>

          {/* Radar Chart + Attribute Table side by side */}
          <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Radar Chart */}
            <Card>
              <CardContent className="p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                  Attribute Overlay
                </h3>
                {/* Legend */}
                <div className="flex gap-4 mb-3">
                  {playerNames.map((name, idx) => (
                    <div key={idx} className="flex items-center gap-1.5">
                      <span className={`w-3 h-3 rounded-full ${PLAYER_COLORS[idx].bg}`} />
                      <span className={`text-xs ${PLAYER_COLORS[idx].text}`}>{name}</span>
                    </div>
                  ))}
                </div>
                <RadarChart
                  attributes={comparison.attributes}
                  playerCount={reports.length}
                />
              </CardContent>
            </Card>

            {/* Attribute comparison table */}
            <Card>
              <CardContent className="p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
                  Attribute Comparison
                </h3>
                <div className="overflow-y-auto max-h-[400px] space-y-0.5">
                  {/* Group by domain */}
                  {(["technical", "physical", "mental", "tactical"] as const).map((domain) => {
                    const domainAttrs = comparison.attributes.filter((a) => a.domain === domain);
                    if (domainAttrs.length === 0) return null;
                    return (
                      <div key={domain} className="mb-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1">
                          {DOMAIN_LABELS[domain]}
                        </div>
                        {domainAttrs.map((attr) => (
                          <div key={attr.attribute} className="flex items-center gap-2 py-0.5">
                            <span className="w-28 shrink-0 text-xs text-zinc-400 capitalize">
                              {String(attr.attribute).replace(/([A-Z])/g, " $1").trim()}
                            </span>
                            <div className="flex-1 flex gap-1">
                              {attr.values.map((val, idx) => (
                                <div
                                  key={idx}
                                  className="flex-1 flex items-center gap-1"
                                >
                                  <div className="flex-1 relative h-2 rounded-full bg-[#1a1a1a] overflow-hidden">
                                    <div
                                      className={`absolute left-0 top-0 h-full rounded-full ${PLAYER_COLORS[idx].bg} ${
                                        idx === attr.bestIndex ? "opacity-90" : "opacity-50"
                                      }`}
                                      style={{ width: `${(val / 20) * 100}%` }}
                                    />
                                  </div>
                                  <span
                                    className={`w-5 text-right text-[10px] font-mono font-bold ${
                                      idx === attr.bestIndex ? PLAYER_COLORS[idx].text : "text-zinc-500"
                                    }`}
                                  >
                                    {val || "-"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Position suitability + Strengths/Weaknesses */}
          <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardContent className="p-4">
                <PositionBars reports={reports} playerNames={playerNames} />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <StrengthWeaknessMatrix reports={reports} playerNames={playerNames} />
              </CardContent>
            </Card>
          </div>

          {/* Key Metrics Summary Table */}
          <Card className="mb-6">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#27272a] text-left text-xs text-zinc-500">
                      <th className="px-4 py-3 font-medium">Metric</th>
                      {playerNames.map((name, idx) => (
                        <th key={idx} className={`px-4 py-3 font-medium ${PLAYER_COLORS[idx].text}`}>
                          {name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      {
                        label: "Conviction",
                        render: (m: ReportComparisonMetrics) => CONVICTION_LABELS[m.conviction],
                      },
                      {
                        label: "Est. Value",
                        render: (m: ReportComparisonMetrics) => formatValue(m.estimatedValue),
                      },
                      {
                        label: "CA Stars",
                        render: (m: ReportComparisonMetrics) =>
                          m.perceivedCAStars != null ? `${m.perceivedCAStars}` : "-",
                      },
                      {
                        label: "PA Range",
                        render: (m: ReportComparisonMetrics) =>
                          m.perceivedPARange
                            ? `${m.perceivedPARange[0]}-${m.perceivedPARange[1]}`
                            : "-",
                      },
                      {
                        label: "Avg Attribute",
                        render: (m: ReportComparisonMetrics) => m.avgAttribute.toFixed(1),
                      },
                      {
                        label: "Strengths",
                        render: (m: ReportComparisonMetrics) => String(m.strengthCount),
                      },
                      {
                        label: "Weaknesses",
                        render: (m: ReportComparisonMetrics) => String(m.weaknessCount),
                      },
                    ].map((row) => (
                      <tr key={row.label} className="border-b border-[#27272a]">
                        <td className="px-4 py-2.5 text-xs text-zinc-400">{row.label}</td>
                        {comparison.metrics.map((m, idx) => (
                          <td key={m.reportId} className={`px-4 py-2.5 text-xs font-medium ${PLAYER_COLORS[idx].text}`}>
                            {row.render(m)}
                          </td>
                        ))}
                      </tr>
                    ))}

                    {/* Age row from player data */}
                    <tr className="border-b border-[#27272a]">
                      <td className="px-4 py-2.5 text-xs text-zinc-400">Age</td>
                      {players.map((p, idx) => (
                        <td key={idx} className={`px-4 py-2.5 text-xs font-medium ${PLAYER_COLORS[idx].text}`}>
                          {p?.age ?? "-"}
                        </td>
                      ))}
                    </tr>

                    {/* Position row */}
                    <tr className="border-b border-[#27272a]">
                      <td className="px-4 py-2.5 text-xs text-zinc-400">Position</td>
                      {players.map((p, idx) => (
                        <td key={idx} className={`px-4 py-2.5 text-xs font-medium ${PLAYER_COLORS[idx].text}`}>
                          {p?.position ?? "-"}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </GameLayout>
  );
}
