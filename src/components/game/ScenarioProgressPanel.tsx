"use client";

import { CheckCircle2, Circle, Target } from "lucide-react";
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

  if (!scenario) return null;

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
  if (!scenarioId) return null;

  return (
    <ScenarioProgressPanel
      scenarioId={scenarioId}
      progress={scenarioProgress}
    />
  );
}
