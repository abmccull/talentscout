"use client";

import { useRef, useEffect, useCallback, useMemo } from "react";
import type { MatchPhase } from "@/engine/core/types";
import {
  POSITION_DEFAULTS,
  getPlayerPositionInPhase,
} from "./matchPositions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PitchPlayer {
  id: string;
  name: string;
  position: string;
}

export interface PitchCanvasProps {
  phase: MatchPhase;
  homeTeamName: string;
  awayTeamName: string;
  homePlayers: PitchPlayer[];
  awayPlayers: PitchPlayer[];
  focusedPlayerId?: string;
  weather?: string;
  onPlayerClick?: (playerId: string) => void;
}

// ---------------------------------------------------------------------------
// Drawing constants
// ---------------------------------------------------------------------------

const PITCH_COLOR = "#2d5a27";
const LINE_COLOR = "rgba(255,255,255,0.7)";
const HOME_COLOR = "#ffffff";
const AWAY_COLOR = "#8b2252";
const BALL_COLOR = "#ffd700";
const FOCUS_COLOR = "#10b981"; // emerald-500
const DOT_RADIUS = 7;
const DOT_RADIUS_INVOLVED = 9;
const LINE_WIDTH = 1.5;

// Pitch aspect ratio: 68m wide × 105m tall (real dimensions)
const PITCH_RATIO = 68 / 105; // ≈ 0.648

// ---------------------------------------------------------------------------
// Weather drawing helpers
// ---------------------------------------------------------------------------

function drawRain(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = "#9ecfff";
  ctx.lineWidth = 1;
  const spacing = 18;
  const offset = (t * 4) % spacing;
  for (let x = -spacing; x < w + spacing; x += spacing) {
    for (let y = -spacing; y < h + spacing; y += spacing) {
      const sx = x + offset * 0.3;
      const sy = y + offset;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + 4, sy + 9);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawSnow(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "#ffffff";
  // Static snow dots based on a seeded offset so they drift predictably
  const count = 40;
  const step = (w * h) / count;
  for (let i = 0; i < count; i++) {
    const baseX = (i * 137.5) % w;
    const baseY = ((i * step * 0.001 + t * 0.6) % h + h) % h;
    const size = 1.5 + (i % 3) * 0.8;
    ctx.beginPath();
    ctx.arc(baseX, baseY, size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFog(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
  grad.addColorStop(0, "rgba(220,230,220,0)");
  grad.addColorStop(1, "rgba(200,220,200,0.20)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Pitch lines drawing
// ---------------------------------------------------------------------------

function drawPitchLines(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  ctx.strokeStyle = LINE_COLOR;
  ctx.lineWidth = LINE_WIDTH;

  // Outer boundary
  ctx.strokeRect(0, 0, w, h);

  // Halfway line
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();

  // Centre circle (radius ≈ 9.15m → ~8.7% of pitch height)
  const cr = h * 0.087;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, cr, 0, Math.PI * 2);
  ctx.stroke();

  // Centre spot
  ctx.fillStyle = LINE_COLOR;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 2, 0, Math.PI * 2);
  ctx.fill();

  // Penalty areas (16.5m = 15.7% of pitch height, 40.3m = 59.3% of pitch width)
  const paHeight = h * 0.157;
  const paWidth = w * 0.593;
  const paLeft = (w - paWidth) / 2;

  // Home penalty area (top)
  ctx.strokeRect(paLeft, 0, paWidth, paHeight);
  // Away penalty area (bottom)
  ctx.strokeRect(paLeft, h - paHeight, paWidth, paHeight);

  // Goal areas (5.5m = 5.2% of height, 18.3m = 26.9% of width)
  const gaHeight = h * 0.052;
  const gaWidth = w * 0.269;
  const gaLeft = (w - gaWidth) / 2;

  ctx.strokeRect(gaLeft, 0, gaWidth, gaHeight);
  ctx.strokeRect(gaLeft, h - gaHeight, gaWidth, gaHeight);

  // Goals (7.32m wide = 10.8% of width, ~3m depth = 2.9% height)
  const goalWidth = w * 0.108;
  const goalDepth = h * 0.029;
  const goalLeft = (w - goalWidth) / 2;

  ctx.setLineDash([3, 3]);
  ctx.strokeRect(goalLeft, -goalDepth, goalWidth, goalDepth);
  ctx.strokeRect(goalLeft, h, goalWidth, goalDepth);
  ctx.setLineDash([]);

  // Penalty spots
  ctx.fillStyle = LINE_COLOR;
  // Home (top) penalty spot: 11m from goal = 10.5% of pitch height
  ctx.beginPath();
  ctx.arc(w / 2, h * 0.105, 2, 0, Math.PI * 2);
  ctx.fill();
  // Away (bottom) penalty spot
  ctx.beginPath();
  ctx.arc(w / 2, h - h * 0.105, 2, 0, Math.PI * 2);
  ctx.fill();

  // Corner arcs (radius 1m ≈ 0.95% of height)
  const ca = h * 0.009;
  ctx.beginPath();
  ctx.arc(0, 0, ca, 0, Math.PI / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w, 0, ca, Math.PI / 2, Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, h, ca, -Math.PI / 2, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w, h, ca, Math.PI, 3 * Math.PI / 2);
  ctx.stroke();

  ctx.restore();
}

// ---------------------------------------------------------------------------
// Player dot drawing
// ---------------------------------------------------------------------------

function drawPlayerDot(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  isHome: boolean,
  isInvolved: boolean,
  isFocused: boolean,
  pulseAlpha: number,
): void {
  const radius = isInvolved ? DOT_RADIUS_INVOLVED : DOT_RADIUS;
  const fillColor = isHome ? HOME_COLOR : AWAY_COLOR;
  const borderColor = isHome ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.3)";

  // Focus pulse ring (drawn below the dot)
  if (isFocused) {
    ctx.save();
    ctx.globalAlpha = pulseAlpha * 0.6;
    ctx.strokeStyle = FOCUS_COLOR;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 5 + pulseAlpha * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Shadow
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 4;
  ctx.fillStyle = fillColor;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Border ring
  ctx.save();
  ctx.strokeStyle = isFocused ? FOCUS_COLOR : borderColor;
  ctx.lineWidth = isFocused ? 2 : 1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Phase label overlay
// ---------------------------------------------------------------------------

const PHASE_LABELS: Record<string, string> = {
  buildUp:          "Build-Up",
  transition:       "Transition",
  setpiece:         "Set Piece",
  pressingSequence: "Pressing",
  counterAttack:    "Counter Attack",
  possession:       "Possession",
};

function drawPhaseLabel(
  ctx: CanvasRenderingContext2D,
  w: number,
  phaseType: string,
  minute: number,
): void {
  const label = PHASE_LABELS[phaseType] ?? phaseType;
  const text = `${label}  ${minute}'`;

  ctx.save();
  ctx.font = "bold 11px system-ui, sans-serif";
  const metrics = ctx.measureText(text);
  const padding = 8;
  const bannerW = metrics.width + padding * 2;
  const bannerH = 22;
  const bx = (w - bannerW) / 2;
  const by = 8;

  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.beginPath();
  // Rounded rect
  const r = 4;
  ctx.moveTo(bx + r, by);
  ctx.lineTo(bx + bannerW - r, by);
  ctx.arcTo(bx + bannerW, by, bx + bannerW, by + r, r);
  ctx.lineTo(bx + bannerW, by + bannerH - r);
  ctx.arcTo(bx + bannerW, by + bannerH, bx + bannerW - r, by + bannerH, r);
  ctx.lineTo(bx + r, by + bannerH);
  ctx.arcTo(bx, by + bannerH, bx, by + bannerH - r, r);
  ctx.lineTo(bx, by + r);
  ctx.arcTo(bx, by, bx + r, by, r);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, bx + padding, by + bannerH / 2);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Ball indicator
// ---------------------------------------------------------------------------

function drawBallIndicator(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
): void {
  ctx.save();
  ctx.fillStyle = BALL_COLOR;
  ctx.shadowColor = "rgba(255,215,0,0.6)";
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();

  // Ball seam lines
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0.3, 2.8);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------

function toCanvas(
  px: number,
  py: number,
  canvasW: number,
  canvasH: number,
): [number, number] {
  return [(px / 100) * canvasW, (py / 100) * canvasH];
}

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

interface DrawnPlayer {
  id: string;
  cx: number;
  cy: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PitchCanvas({
  phase,
  homeTeamName,
  awayTeamName,
  homePlayers,
  awayPlayers,
  focusedPlayerId,
  weather,
  onPlayerClick,
}: PitchCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);
  const drawnPlayersRef = useRef<DrawnPlayer[]>([]);
  const startTimeRef = useRef<number>(Date.now());

  // Memoize the set so hooks depending on it don't rebuild on every render
  const involvedSet = useMemo(
    () => new Set(phase.involvedPlayerIds),
    // Join to get a stable primitive dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase.involvedPlayerIds.join(",")],
  );

  // Compute ball position: centroid of involved players
  const getBallPosition = useCallback(
    (
      allPlayerPositions: { id: string; pos: { x: number; y: number } }[],
    ): { x: number; y: number } => {
      const involved = allPlayerPositions.filter((p) => involvedSet.has(p.id));
      if (involved.length === 0) return { x: 50, y: 50 };
      const sum = involved.reduce(
        (acc, p) => ({ x: acc.x + p.pos.x, y: acc.y + p.pos.y }),
        { x: 0, y: 0 },
      );
      return { x: sum.x / involved.length, y: sum.y / involved.length };
    },
    [involvedSet],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const containerW = container.clientWidth;
    const containerH = container.clientHeight;

    // Fit pitch (PITCH_RATIO = width/height) inside container
    let pitchW: number;
    let pitchH: number;
    if (containerW / containerH < PITCH_RATIO) {
      pitchW = containerW;
      pitchH = containerW / PITCH_RATIO;
    } else {
      pitchH = containerH;
      pitchW = containerH * PITCH_RATIO;
    }

    const offsetX = (containerW - pitchW) / 2;
    const offsetY = (containerH - pitchH) / 2;

    // Only resize if needed (avoids flickering)
    if (canvas.width !== containerW || canvas.height !== containerH) {
      canvas.width = containerW;
      canvas.height = containerH;
    }

    // Time for animation
    const t = (Date.now() - startTimeRef.current) / 1000;
    const pulseAlpha = (Math.sin(t * 3) + 1) / 2; // 0–1

    ctx.clearRect(0, 0, containerW, containerH);

    // Pitch background
    ctx.fillStyle = PITCH_COLOR;
    ctx.fillRect(offsetX, offsetY, pitchW, pitchH);

    // Subtle pitch stripes
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = "#ffffff";
    const stripeH = pitchH / 8;
    for (let i = 0; i < 8; i += 2) {
      ctx.fillRect(offsetX, offsetY + i * stripeH, pitchW, stripeH);
    }
    ctx.restore();

    // Pitch lines (translated into canvas space)
    ctx.save();
    ctx.translate(offsetX, offsetY);
    drawPitchLines(ctx, pitchW, pitchH);
    ctx.restore();

    // Weather effects
    if (weather === "rain" || weather === "heavyRain") {
      ctx.save();
      ctx.translate(offsetX, offsetY);
      drawRain(ctx, pitchW, pitchH, t);
      ctx.restore();
    } else if (weather === "snow") {
      ctx.save();
      ctx.translate(offsetX, offsetY);
      drawSnow(ctx, pitchW, pitchH, t);
      ctx.restore();
    } else if (weather === "fog") {
      ctx.save();
      ctx.translate(offsetX, offsetY);
      drawFog(ctx, pitchW, pitchH);
      ctx.restore();
    }

    // Build player position list
    const allPlayerPositions: { id: string; pos: { x: number; y: number } }[] = [];

    const resolveAndDrift = (
      player: PitchPlayer,
    ): { x: number; y: number } => {
      const base =
        POSITION_DEFAULTS[player.position] ?? { x: 50, y: 50 };
      return getPlayerPositionInPhase(
        base,
        phase.type,
        involvedSet.has(player.id),
        player.id === focusedPlayerId,
      );
    };

    // Away players have mirrored y (they play toward the home goal = low y)
    const resolveAwayAndDrift = (
      player: PitchPlayer,
    ): { x: number; y: number } => {
      const base =
        POSITION_DEFAULTS[player.position] ?? { x: 50, y: 50 };
      // Mirror y for away team
      const mirroredBase = { x: 100 - base.x, y: 100 - base.y };
      return getPlayerPositionInPhase(
        mirroredBase,
        phase.type,
        involvedSet.has(player.id),
        player.id === focusedPlayerId,
      );
    };

    const drawnPlayers: DrawnPlayer[] = [];

    // Draw away players first (rendered below home in overlap)
    for (const player of awayPlayers) {
      const pos = resolveAwayAndDrift(player);
      allPlayerPositions.push({ id: player.id, pos });
      const [cx, cy] = toCanvas(pos.x, pos.y, pitchW, pitchH);
      const canvasCx = cx + offsetX;
      const canvasCy = cy + offsetY;
      drawPlayerDot(
        ctx,
        canvasCx,
        canvasCy,
        false,
        involvedSet.has(player.id),
        player.id === focusedPlayerId,
        pulseAlpha,
      );
      drawnPlayers.push({ id: player.id, cx: canvasCx, cy: canvasCy });
    }

    // Draw home players
    for (const player of homePlayers) {
      const pos = resolveAndDrift(player);
      allPlayerPositions.push({ id: player.id, pos });
      const [cx, cy] = toCanvas(pos.x, pos.y, pitchW, pitchH);
      const canvasCx = cx + offsetX;
      const canvasCy = cy + offsetY;
      drawPlayerDot(
        ctx,
        canvasCx,
        canvasCy,
        true,
        involvedSet.has(player.id),
        player.id === focusedPlayerId,
        pulseAlpha,
      );
      drawnPlayers.push({ id: player.id, cx: canvasCx, cy: canvasCy });
    }

    // Ball indicator at centroid of involved players
    const ballPos = getBallPosition(allPlayerPositions);
    const [bx, by] = toCanvas(ballPos.x, ballPos.y, pitchW, pitchH);
    drawBallIndicator(ctx, bx + offsetX, by + offsetY);

    // Phase label overlay
    ctx.save();
    ctx.translate(offsetX, offsetY);
    drawPhaseLabel(ctx, pitchW, phase.type, phase.minute);
    ctx.restore();

    // Team name labels (small, at top/bottom)
    ctx.save();
    ctx.font = "10px system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.textAlign = "center";
    ctx.fillText(homeTeamName, offsetX + pitchW / 2, offsetY + pitchH - 6);
    ctx.fillText(awayTeamName, offsetX + pitchW / 2, offsetY + 40);
    ctx.restore();

    drawnPlayersRef.current = drawnPlayers;
  }, [
    phase,
    homePlayers,
    awayPlayers,
    focusedPlayerId,
    weather,
    homeTeamName,
    awayTeamName,
    getBallPosition,
    involvedSet,
  ]);

  // Animation loop
  useEffect(() => {
    startTimeRef.current = Date.now();

    const loop = () => {
      draw();
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, [draw]);

  // Handle click to identify which player was clicked
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onPlayerClick) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      for (const p of drawnPlayersRef.current) {
        const dist = Math.hypot(clickX - p.cx, clickY - p.cy);
        if (dist <= DOT_RADIUS_INVOLVED + 4) {
          onPlayerClick(p.id);
          return;
        }
      }
    },
    [onPlayerClick],
  );

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full"
      aria-label={`Pitch view — ${phase.type} phase at ${phase.minute} minutes`}
      role="img"
    >
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className={onPlayerClick ? "cursor-pointer" : "cursor-default"}
        aria-hidden="true"
        style={{ display: "block", width: "100%", height: "100%" }}
      />
    </div>
  );
}
