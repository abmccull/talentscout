"use client";

import * as React from "react";
import { Trophy, XCircle, RotateCcw, Home, CheckCircle2 } from "lucide-react";
import { useGameStore } from "@/stores/gameStore";
import { getScenarioById } from "@/engine/scenarios/scenarioSetup";
import { Celebration } from "@/components/game/effects/Celebration";

// =============================================================================
// KEYFRAMES (injected once)
// =============================================================================

const OVERLAY_KEYFRAMES = `
@keyframes outcomeReveal {
  0%   { opacity: 0; transform: scale(0.9) translateY(16px); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
`;

// =============================================================================
// VICTORY OVERLAY
// =============================================================================

interface VictoryOverlayProps {
  scenarioId: string;
  onDismiss: () => void;
  onReturnToMenu: () => void;
}

function VictoryOverlay({ scenarioId, onDismiss, onReturnToMenu }: VictoryOverlayProps) {
  const scenario = getScenarioById(scenarioId);
  const [showCelebration, setShowCelebration] = React.useState(true);

  return (
    <>
      {showCelebration && (
        <Celebration
          tier="epic"
          title="Scenario Complete!"
          description={
            scenario
              ? `You conquered "${scenario.name}". Outstanding work.`
              : "All objectives complete!"
          }
          onDismiss={() => setShowCelebration(false)}
        />
      )}

      {/* Keep the outcome card behind the celebration or show it after dismiss */}
      {!showCelebration && (
        <>
          <style>{OVERLAY_KEYFRAMES}</style>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scenario-victory-title"
          >
            <div
              className="relative w-full max-w-md overflow-hidden rounded-3xl border border-emerald-500/30 bg-zinc-900 p-10 text-center shadow-2xl"
              style={{ animation: "outcomeReveal 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards" }}
            >
              {/* Decorative glow */}
              <div
                className="pointer-events-none absolute inset-0 rounded-3xl"
                style={{
                  background:
                    "radial-gradient(ellipse at 50% 0%, rgba(16,185,129,0.15) 0%, transparent 70%)",
                }}
                aria-hidden="true"
              />

              <div
                className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 ring-2 ring-emerald-500/30"
                aria-hidden="true"
              >
                <Trophy size={36} className="text-emerald-400" />
              </div>

              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-400">
                Scenario Complete
              </p>
              <h2
                id="scenario-victory-title"
                className="mb-2 text-3xl font-bold text-white"
              >
                {scenario?.name ?? "Victory!"}
              </h2>
              <p className="mb-8 text-sm leading-relaxed text-zinc-400">
                {scenario?.description ?? "All required objectives have been completed."}
              </p>

              {/* Objective summary */}
              <div className="mb-8 space-y-1.5 text-left">
                {(scenario?.objectives.filter((o) => o.required) ?? []).map((obj) => (
                  <div key={obj.id} className="flex items-start gap-2 text-xs text-emerald-300">
                    <CheckCircle2 size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>{obj.description}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onReturnToMenu}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-700 py-3 text-sm font-medium text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-400"
                >
                  <Home size={15} aria-hidden="true" />
                  Main Menu
                </button>
                <button
                  onClick={onDismiss}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400"
                >
                  Continue Playing
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// =============================================================================
// FAILURE OVERLAY
// =============================================================================

interface FailureOverlayProps {
  scenarioId: string;
  failReason?: string;
  onTryAgain: () => void;
  onReturnToMenu: () => void;
}

function FailureOverlay({ scenarioId, failReason, onTryAgain, onReturnToMenu }: FailureOverlayProps) {
  const scenario = getScenarioById(scenarioId);

  return (
    <>
      <style>{OVERLAY_KEYFRAMES}</style>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scenario-failure-title"
      >
        <div
          className="relative w-full max-w-md overflow-hidden rounded-3xl border border-red-500/30 bg-zinc-900 p-10 text-center shadow-2xl"
          style={{ animation: "outcomeReveal 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards" }}
        >
          {/* Decorative glow */}
          <div
            className="pointer-events-none absolute inset-0 rounded-3xl"
            style={{
              background:
                "radial-gradient(ellipse at 50% 0%, rgba(239,68,68,0.12) 0%, transparent 70%)",
            }}
            aria-hidden="true"
          />

          <div
            className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-red-500/20 ring-2 ring-red-500/30"
            aria-hidden="true"
          >
            <XCircle size={36} className="text-red-400" />
          </div>

          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-red-400">
            Scenario Failed
          </p>
          <h2
            id="scenario-failure-title"
            className="mb-2 text-3xl font-bold text-white"
          >
            {scenario?.name ?? "Scenario Failed"}
          </h2>

          {failReason && (
            <p className="mb-6 rounded-lg border border-red-500/20 bg-red-950/30 px-4 py-3 text-sm leading-relaxed text-red-300">
              {failReason}
            </p>
          )}

          {!failReason && (
            <p className="mb-6 text-sm leading-relaxed text-zinc-400">
              You were unable to complete the required objectives within the allowed time.
            </p>
          )}

          <div className="flex gap-3">
            <button
              onClick={onReturnToMenu}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-700 py-3 text-sm font-medium text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-zinc-400"
            >
              <Home size={15} aria-hidden="true" />
              Main Menu
            </button>
            <button
              onClick={onTryAgain}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-700 py-3 text-sm font-semibold text-white transition hover:bg-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-400"
            >
              <RotateCcw size={15} aria-hidden="true" />
              Try Again
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// =============================================================================
// MAIN EXPORT — store-connected wrapper
// =============================================================================

/**
 * ScenarioOutcomeOverlay — renders a victory or failure modal when
 * `scenarioOutcome` is non-null in the game store.  Renders nothing otherwise.
 */
export function ScenarioOutcomeOverlay() {
  const scenarioOutcome = useGameStore((s) => s.scenarioOutcome);
  const dismissScenarioOutcome = useGameStore((s) => s.dismissScenarioOutcome);
  const setScreen = useGameStore((s) => s.setScreen);
  const scenarioProgress = useGameStore((s) => s.scenarioProgress);
  const gameState = useGameStore((s) => s.gameState);

  if (!scenarioOutcome || !gameState?.activeScenarioId) return null;

  const scenarioId = gameState.activeScenarioId;

  const handleReturnToMenu = () => {
    dismissScenarioOutcome();
    setScreen("mainMenu");
  };

  const handleTryAgain = () => {
    dismissScenarioOutcome();
    setScreen("scenarioSelect");
  };

  const handleDismissVictory = () => {
    dismissScenarioOutcome();
  };

  if (scenarioOutcome === "victory") {
    return (
      <VictoryOverlay
        scenarioId={scenarioId}
        onDismiss={handleDismissVictory}
        onReturnToMenu={handleReturnToMenu}
      />
    );
  }

  if (scenarioOutcome === "failure") {
    return (
      <FailureOverlay
        scenarioId={scenarioId}
        failReason={scenarioProgress?.failReason}
        onTryAgain={handleTryAgain}
        onReturnToMenu={handleReturnToMenu}
      />
    );
  }

  return null;
}
