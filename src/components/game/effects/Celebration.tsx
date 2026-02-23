"use client";

import * as React from "react";

// =============================================================================
// TYPES
// =============================================================================

export type CelebrationTier = "minor" | "major" | "epic";

export interface CelebrationProps {
  tier: CelebrationTier;
  title: string;
  description: string;
  onDismiss: () => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const CONFETTI_COLORS = [
  "#22c55e", // emerald
  "#f59e0b", // amber
  "#3b82f6", // blue
  "#ec4899", // pink
  "#a855f7", // purple
  "#f97316", // orange
  "#06b6d4", // cyan
  "#84cc16", // lime
];

const MINOR_AUTO_DISMISS_MS = 3000;

// =============================================================================
// CONFETTI PARTICLE
// =============================================================================

interface Particle {
  id: number;
  x: number;        // left offset %
  size: number;     // px
  color: string;
  delay: number;    // animation-delay s
  duration: number; // animation-duration s
  rotation: number; // initial rotation deg
}

function generateParticles(count: number): Particle[] {
  // Seeded pseudo-random using index so values are stable per render
  return Array.from({ length: count }, (_, i) => {
    const seed = (i * 7 + 13) % 97;
    return {
      id: i,
      x: (seed * 103) % 100,
      size: 6 + ((i * 3) % 8),
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: ((i * 0.17) % 1.5),
      duration: 2.2 + ((i * 0.13) % 1.8),
      rotation: (i * 47) % 360,
    };
  });
}

// ---------------------------------------------------------------------------
// Keyframe injection — done once via a <style> tag in the overlay
// ---------------------------------------------------------------------------

const CONFETTI_KEYFRAMES = `
@keyframes confettiFall {
  0%   { transform: translateY(-20px) rotate(var(--rot)); opacity: 1; }
  80%  { opacity: 1; }
  100% { transform: translateY(110vh) rotate(calc(var(--rot) + 720deg)); opacity: 0; }
}
@keyframes minorPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.6); }
  50%       { box-shadow: 0 0 0 24px rgba(16, 185, 129, 0); }
}
@keyframes epicReveal {
  0%   { opacity: 0; transform: scale(0.85) translateY(20px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
`;

function ConfettiOverlay({ count, slowFall }: { count: number; slowFall: boolean }) {
  const particles = React.useMemo(() => generateParticles(count), [count]);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
      aria-hidden="true"
    >
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: 0,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            borderRadius: p.size > 10 ? "2px" : "50%",
            // CSS custom property for rotation in keyframe
            ["--rot" as string]: `${p.rotation}deg`,
            animation: `confettiFall ${slowFall ? p.duration * 1.6 : p.duration}s ${p.delay}s ease-in forwards`,
          }}
        />
      ))}
    </div>
  );
}

// =============================================================================
// TIER COMPONENTS
// =============================================================================

function MinorCelebration({
  title,
  description,
  onDismiss,
}: Omit<CelebrationProps, "tier">) {
  // Auto-dismiss after MINOR_AUTO_DISMISS_MS
  React.useEffect(() => {
    const id = setTimeout(onDismiss, MINOR_AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Unlocked: ${title}`}
      className="fixed bottom-8 left-1/2 z-50 -translate-x-1/2"
    >
      <div
        className="flex items-center gap-3 rounded-2xl border border-emerald-500/40 bg-zinc-900 px-6 py-4 shadow-2xl"
        style={{ animation: "minorPulse 1.2s ease-out 1" }}
      >
        <span className="text-2xl" aria-hidden="true">
          ✓
        </span>
        <div>
          <p className="text-sm font-bold text-emerald-400">Unlocked!</p>
          <p className="text-base font-semibold text-white">{title}</p>
          <p className="text-sm text-zinc-400">{description}</p>
        </div>
      </div>
    </div>
  );
}

function MajorCelebration({
  title,
  description,
  onDismiss,
}: Omit<CelebrationProps, "tier">) {
  return (
    <>
      <ConfettiOverlay count={24} slowFall={false} />

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={onDismiss}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Achievement: ${title}`}
          className="relative mx-4 max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-8 text-center shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-4xl mx-auto"
            aria-hidden="true"
          >
            🏆
          </div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-emerald-400">
            Achievement Unlocked
          </p>
          <h2 className="mb-2 text-2xl font-bold text-white">{title}</h2>
          <p className="mb-6 text-sm leading-relaxed text-zinc-400">{description}</p>
          <button
            onClick={onDismiss}
            className="w-full rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
          >
            Continue
          </button>
        </div>
      </div>
    </>
  );
}

function EpicCelebration({
  title,
  description,
  onDismiss,
}: Omit<CelebrationProps, "tier">) {
  return (
    <>
      <ConfettiOverlay count={48} slowFall={true} />

      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md"
        onClick={onDismiss}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Epic achievement: ${title}`}
          className="relative mx-4 max-w-md rounded-3xl border border-amber-500/40 bg-zinc-900 p-10 text-center shadow-2xl"
          style={{ animation: "epicReveal 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Decorative glow */}
          <div
            className="pointer-events-none absolute inset-0 rounded-3xl"
            style={{
              background:
                "radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.15) 0%, transparent 70%)",
            }}
            aria-hidden="true"
          />

          <div
            className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/20 text-5xl mx-auto ring-2 ring-amber-500/30"
            aria-hidden="true"
          >
            ⭐
          </div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-amber-400">
            Epic Achievement
          </p>
          <h2 className="mb-3 text-3xl font-bold text-white">{title}</h2>
          <p className="mb-8 text-base leading-relaxed text-zinc-300">{description}</p>
          <button
            onClick={onDismiss}
            className="w-full rounded-xl bg-gradient-to-b from-amber-400 to-amber-600 px-8 py-3 text-base font-bold text-zinc-900 shadow-lg transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            Incredible!
          </button>
        </div>
      </div>
    </>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * Celebration — renders a tier-appropriate celebration overlay.
 *
 * - minor: Emerald glow toast, auto-dismisses after 3 s.
 * - major: CSS confetti (24 particles) + announcement card.
 * - epic:  Extended confetti (48 particles, slower) + dramatic card.
 *
 * All confetti is pure CSS — no libraries.
 */
export function Celebration({ tier, title, description, onDismiss }: CelebrationProps) {
  return (
    <>
      <style>{CONFETTI_KEYFRAMES}</style>
      {tier === "minor" && (
        <MinorCelebration title={title} description={description} onDismiss={onDismiss} />
      )}
      {tier === "major" && (
        <MajorCelebration title={title} description={description} onDismiss={onDismiss} />
      )}
      {tier === "epic" && (
        <EpicCelebration title={title} description={description} onDismiss={onDismiss} />
      )}
    </>
  );
}
