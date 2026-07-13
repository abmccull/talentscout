"use client";

import { AlertTriangle, CheckCircle2, Circle, Target } from "lucide-react";
import { useGameStore } from "@/stores/gameStore";
import { getScenarioById } from "@/engine/scenarios/scenarioSetup";
import type { ScenarioProgress } from "@/engine/scenarios";

// =============================================================================
// PROPS
// =============================================================================

interface ScenarioProgressPanelProps {
  scenarioId: string;
  progress: ScenarioProgress | null;
}

function InvalidScenarioNotice({
  scenarioId,
  reason,
}: {
  scenarioId: string;
  reason: string;
}) {
  return (
    <div
      className="mb-6 rounded-xl border border-amber-500/30 bg-amber-950/20 p-4"
      role="alert"
      data-testid="invalid-scenario-notice"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-400" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-amber-200">Scenario archived safely</p>
          <p className="mt-1 text-xs leading-5 text-zinc-300">{reason}</p>
          <p className="mt-1 text-[10px] text-zinc-400">Reference: {scenarioId}</p>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Compact panel that shows the active scenario name, per-objective status,
 * and a completion fraction.  Designed to sit near the top of the Dashboard.
 */
export function ScenarioProgressPanel({
  scenarioId,
  progress,
}: ScenarioProgressPanelProps) {
  const scenario = getScenarioById(scenarioId);

  if (!scenario) {
    return (
      <InvalidScenarioNotice
        scenarioId={scenarioId}
        reason={progress?.invalidReason ?? `Scenario "${scenarioId}" is unavailable. No completion or reward was granted.`}
      />
    );
  }

  const objectives = progress?.objectives ?? scenario.objectives.map((o) => ({
    id: o.id,
    description: o.description,
    completed: false,
    required: o.required,
  }));

  const requiredObjectives = objectives.filter((o) => o.required);
  const completedRequired = requiredObjectives.filter((o) => o.completed).length;
  const totalRequired = requiredObjectives.length;
  const allDone = completedRequired === totalRequired && totalRequired > 0;

  return (
    <div
      className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4"
      role="region"
      aria-label={`Scenario progress: ${scenario.name}`}
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Target size={15} className="shrink-0 text-emerald-400" aria-hidden="true" />
          <span className="text-sm font-semibold text-emerald-300">{scenario.name}</span>
        </div>
        <span
          className={`text-xs font-medium tabular-nums ${
            allDone ? "text-emerald-400" : "text-zinc-400"
          }`}
          aria-label={`${completedRequired} of ${totalRequired} required objectives complete`}
        >
          {completedRequired}/{totalRequired}
        </span>
      </div>

      {/* Objectives */}
      <ul className="space-y-1.5" aria-label="Objectives">
        {objectives.map((obj) => (
          <li key={obj.id} className="flex items-start gap-2 text-xs">
            {obj.completed ? (
              <CheckCircle2
                size={13}
                className="mt-0.5 shrink-0 text-emerald-400"
                aria-hidden="true"
              />
            ) : (
              <Circle
                size={13}
                className="mt-0.5 shrink-0 text-zinc-500"
                aria-hidden="true"
              />
            )}
            <span
              className={`leading-snug ${
                obj.required
                  ? obj.completed
                    ? "text-emerald-300 line-through opacity-70"
                    : "text-zinc-300"
                  : obj.completed
                  ? "text-zinc-500 line-through opacity-60"
                  : "italic text-zinc-500"
              }`}
            >
              {obj.description}
              {!obj.required && (
                <span className="ml-1 not-italic text-zinc-600">(bonus)</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {/* Progress bar */}
      <div className="mt-3">
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800"
          role="progressbar"
          aria-valuenow={completedRequired}
          aria-valuemin={0}
          aria-valuemax={totalRequired}
          aria-label="Required objectives progress"
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              allDone ? "bg-emerald-400" : "bg-emerald-600"
            }`}
            style={{
              width: totalRequired > 0 ? `${(completedRequired / totalRequired) * 100}%` : "0%",
            }}
          />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// CONNECTED WRAPPER
// =============================================================================

/**
 * Store-connected wrapper — reads scenario state from gameStore directly.
 * Renders nothing when no scenario is active.
 */
export function ConnectedScenarioProgressPanel() {
  const gameState = useGameStore((s) => s.gameState);
  const scenarioProgress = useGameStore((s) => s.scenarioProgress);

  const scenarioId = gameState?.activeScenarioId;
  if (!scenarioId) {
    const archive = gameState?.invalidScenarioArchives?.at(-1);
    return archive ? (
      <InvalidScenarioNotice scenarioId={archive.scenarioId} reason={archive.reason} />
    ) : null;
  }

  return (
    <ScenarioProgressPanel
      scenarioId={scenarioId}
      progress={scenarioProgress}
    />
  );
}
