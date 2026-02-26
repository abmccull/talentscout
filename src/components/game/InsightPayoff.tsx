"use client";

import * as React from "react";
import { Sparkles, CheckCircle2, Star, Users, BarChart2, TrendingUp } from "lucide-react";
import type { InsightActionResult } from "@/engine/insight/types";

// =============================================================================
// KEYFRAMES
// =============================================================================

const PAYOFF_KEYFRAMES = `
@keyframes payoffReveal {
  0%   { opacity: 0; transform: scale(0.92) translateY(20px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes particleDrift {
  0%   { transform: translateY(0) rotate(0deg);   opacity: 0.6; }
  100% { transform: translateY(-80px) rotate(30deg); opacity: 0; }
}
`;

// =============================================================================
// PARTICLE DECORATION
// =============================================================================

// Static seed avoids hydration mismatch — these are purely decorative.
const PARTICLES: Array<{ left: string; delay: string; duration: string; size: number }> = [
  { left: "8%",  delay: "0s",    duration: "3.2s", size: 4 },
  { left: "18%", delay: "0.4s",  duration: "2.8s", size: 3 },
  { left: "30%", delay: "0.9s",  duration: "3.6s", size: 5 },
  { left: "45%", delay: "0.2s",  duration: "2.5s", size: 3 },
  { left: "58%", delay: "0.7s",  duration: "3.0s", size: 4 },
  { left: "70%", delay: "1.1s",  duration: "2.7s", size: 3 },
  { left: "82%", delay: "0.5s",  duration: "3.4s", size: 5 },
  { left: "92%", delay: "1.3s",  duration: "2.9s", size: 4 },
];

function ParticleLayer() {
  return (
    <div
      className="pointer-events-none absolute bottom-0 left-0 right-0 h-32 overflow-hidden"
      aria-hidden="true"
    >
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className="absolute bottom-0 rounded-full bg-amber-400/60"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            animation: `particleDrift ${p.duration} ${p.delay} ease-out infinite`,
          }}
        />
      ))}
    </div>
  );
}

// =============================================================================
// RESULTS SECTIONS
// =============================================================================

function ResultRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-500/15 bg-amber-500/5 px-4 py-2.5">
      <span className="text-amber-400" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-sm text-zinc-300">{label}</span>
      <span className="shrink-0 text-sm font-semibold text-amber-300">{value}</span>
    </div>
  );
}

// =============================================================================
// HELPERS
// =============================================================================

function formatAttributeName(attr: string): string {
  return attr
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

// =============================================================================
// RESULTS RENDERER
// =============================================================================

function ResultsSection({ result }: { result: InsightActionResult }) {
  const rows: Array<{ icon: React.ReactNode; label: string; value: string }> = [];

  // clarityOfVision / diamondInTheRough — observations
  if (result.observations && result.observations.length > 0) {
    result.observations.forEach((obs) => {
      rows.push({
        icon: <CheckCircle2 size={14} />,
        label: formatAttributeName(obs.attribute),
        value: String(obs.trueValue),
      });
    });
  }

  // hiddenNature — revealedAttributes
  if (result.revealedAttributes && result.revealedAttributes.length > 0) {
    result.revealedAttributes.forEach((attr) => {
      rows.push({
        icon: <Star size={14} />,
        label: formatAttributeName(attr.attribute),
        value: String(attr.value),
      });
    });
  }

  // diamondInTheRough — discoveredPlayerId
  if (result.discoveredPlayerId) {
    rows.push({
      icon: <Users size={14} />,
      label: "Prospect discovered",
      value: result.discoveredPlayerId,
    });
  }

  // theVerdict — reportQualityBonus
  if (result.reportQualityBonus !== undefined) {
    rows.push({
      icon: <BarChart2 size={14} />,
      label: "Report quality bonus",
      value: `+${result.reportQualityBonus}`,
    });
  }

  // perfectFit — systemFitData
  if (result.systemFitData) {
    Object.entries(result.systemFitData).forEach(([role, grade]) => {
      rows.push({
        icon: <CheckCircle2 size={14} />,
        label: `System fit — ${formatAttributeName(role)}`,
        value: String(grade),
      });
    });
  }

  // networkPulse — contactIntel
  if (result.contactIntel && result.contactIntel.length > 0) {
    result.contactIntel.forEach((item) => {
      rows.push({
        icon: <Users size={14} />,
        label: "Contact intel",
        value: item.intel,
      });
    });
  }

  // territoryMastery — confidenceBonus
  if (result.confidenceBonus !== undefined) {
    rows.push({
      icon: <TrendingUp size={14} />,
      label: "Confidence bonus (sub-region)",
      value: `+${result.confidenceBonus}%`,
    });
  }

  // algorithmicEpiphany — queryAccuracyBonus
  if (result.queryAccuracyBonus !== undefined) {
    rows.push({
      icon: <BarChart2 size={14} />,
      label: "Query accuracy multiplier",
      value: `×${result.queryAccuracyBonus.toFixed(2)}`,
    });
  }

  // marketBlindSpot — undervaluedPlayers
  if (result.undervaluedPlayers && result.undervaluedPlayers.length > 0) {
    rows.push({
      icon: <TrendingUp size={14} />,
      label: "Undervalued prospects found",
      value: String(result.undervaluedPlayers.length),
    });
  }

  if (rows.length === 0) return null;

  return (
    <div className="space-y-2" aria-label="Insight outcomes">
      {rows.map((row, i) => (
        <ResultRow key={i} icon={row.icon} label={row.label} value={row.value} />
      ))}
    </div>
  );
}

// =============================================================================
// PROPS
// =============================================================================

interface InsightPayoffProps {
  result: InsightActionResult;
  actionName: string;
  onDismiss: () => void;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function InsightPayoff({ result, actionName, onDismiss }: InsightPayoffProps) {
  const { success, narrative } = result;

  React.useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onDismiss]);

  return (
    <>
      <style>{PAYOFF_KEYFRAMES}</style>

      {/* Full-screen backdrop */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="insight-payoff-title"
      >
        {/* Ambient golden glow behind panel */}
        <div
          className="pointer-events-none fixed inset-0"
          style={{
            background: success
              ? "radial-gradient(ellipse at 50% 50%, rgba(245,158,11,0.10) 0%, transparent 60%)"
              : "radial-gradient(ellipse at 50% 50%, rgba(113,113,122,0.08) 0%, transparent 60%)",
          }}
          aria-hidden="true"
        />

        {/* Modal card */}
        <div
          className={[
            "relative w-full max-w-lg overflow-hidden rounded-3xl shadow-2xl",
            success
              ? "border border-amber-500/40 bg-zinc-900"
              : "border border-zinc-700/60 bg-zinc-900",
          ].join(" ")}
          style={{ animation: "payoffReveal 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards" }}
        >
          {/* Top glow bar */}
          {success && (
            <div
              className="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent"
              aria-hidden="true"
            />
          )}

          {/* Decorative top radial */}
          <div
            className="pointer-events-none absolute inset-0 rounded-3xl"
            style={{
              background: success
                ? "radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.12) 0%, transparent 55%)"
                : "radial-gradient(ellipse at 50% 0%, rgba(113,113,122,0.08) 0%, transparent 55%)",
            }}
            aria-hidden="true"
          />

          {/* Particles on success */}
          {success && <ParticleLayer />}

          {/* Content */}
          <div className="relative z-10 px-8 py-8">
            {/* Sparkle icon */}
            <div
              className={[
                "mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full",
                success
                  ? "bg-amber-500/20 ring-2 ring-amber-500/30"
                  : "bg-zinc-700/40 ring-2 ring-zinc-600/30",
              ].join(" ")}
              aria-hidden="true"
            >
              <Sparkles
                size={28}
                className={success ? "text-amber-400" : "text-zinc-500"}
              />
            </div>

            {/* Label */}
            <p
              className={[
                "mb-1 text-center text-xs font-semibold uppercase tracking-widest",
                success ? "text-amber-500" : "text-zinc-500",
              ].join(" ")}
            >
              {success ? "Insight Triggered" : "Insight Fizzled"}
            </p>

            {/* Action name */}
            <h2
              id="insight-payoff-title"
              className={[
                "mb-6 text-center text-2xl font-bold tracking-tight",
                success ? "text-amber-300" : "text-zinc-400",
              ].join(" ")}
            >
              {actionName}
            </h2>

            {/* Narrative text */}
            <div
              className={[
                "mb-6 rounded-xl border px-5 py-4",
                success
                  ? "border-amber-500/15 bg-amber-950/20"
                  : "border-zinc-700/50 bg-zinc-800/40",
              ].join(" ")}
            >
              <p
                className={[
                  "text-center text-sm italic leading-relaxed",
                  success ? "text-zinc-200" : "text-zinc-500",
                ].join(" ")}
              >
                {!success && (
                  <span className="not-italic text-zinc-500">
                    The insight was unclear&hellip;{" "}
                  </span>
                )}
                &ldquo;{narrative}&rdquo;
              </p>
            </div>

            {/* Concrete outcomes */}
            {success && <ResultsSection result={result} />}

            {/* Continue button */}
            <button
              onClick={onDismiss}
              className={[
                "mt-6 w-full rounded-xl py-3 text-sm font-semibold transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400",
                success
                  ? "bg-amber-500 text-amber-950 hover:bg-amber-400"
                  : "border border-zinc-700 bg-transparent text-zinc-300 hover:border-zinc-500 hover:text-zinc-100",
              ].join(" ")}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
