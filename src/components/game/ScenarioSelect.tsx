"use client";

import { useState } from "react";
import { useGameStore } from "@/stores/gameStore";
import { SCENARIOS, type ScenarioDef } from "@/engine/scenarios";
import { ArrowLeft, Clock, Target, ChevronRight, CheckCircle2, Circle } from "lucide-react";

// =============================================================================
// CONSTANTS
// =============================================================================

type CategoryTab = "all" | "starter" | "advanced";

const CATEGORY_TABS: { id: CategoryTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "starter", label: "Starter" },
  { id: "advanced", label: "Advanced" },
];

const DIFFICULTY_STYLES: Record<ScenarioDef["difficulty"], string> = {
  easy: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
  hard: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
  expert: "bg-red-500/20 text-red-400 border border-red-500/30",
};

const DIFFICULTY_LABELS: Record<ScenarioDef["difficulty"], string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  expert: "Expert",
};

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function DifficultyBadge({ difficulty }: { difficulty: ScenarioDef["difficulty"] }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${DIFFICULTY_STYLES[difficulty]}`}
    >
      {DIFFICULTY_LABELS[difficulty]}
    </span>
  );
}

function ObjectiveList({ scenario }: { scenario: ScenarioDef }) {
  const required = scenario.objectives.filter((o) => o.required);
  const bonus = scenario.objectives.filter((o) => !o.required);

  return (
    <div className="mt-3 space-y-1.5">
      {required.map((obj) => (
        <div key={obj.id} className="flex items-start gap-2 text-xs text-zinc-300">
          <CheckCircle2
            size={13}
            className="mt-0.5 shrink-0 text-emerald-400"
            aria-hidden="true"
          />
          <span>{obj.description}</span>
        </div>
      ))}
      {bonus.map((obj) => (
        <div key={obj.id} className="flex items-start gap-2 text-xs text-zinc-500">
          <Circle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span className="italic">{obj.description} (bonus)</span>
        </div>
      ))}
    </div>
  );
}

function ScenarioCard({
  scenario,
  onSelect,
}: {
  scenario: ScenarioDef;
  onSelect: (s: ScenarioDef) => void;
}) {
  return (
    <div className="group flex flex-col rounded-xl border border-[#27272a] bg-[#141414] p-5 transition hover:border-emerald-500/50 hover:bg-[#161a16]">
      {/* Header */}
      <div className="mb-2 flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-white">{scenario.name}</h3>
        <DifficultyBadge difficulty={scenario.difficulty} />
      </div>

      {/* Meta */}
      <div className="mb-3 flex items-center gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1">
          <Clock size={11} aria-hidden="true" />
          {scenario.estimatedSeasons} season{scenario.estimatedSeasons !== 1 ? "s" : ""}
        </span>
        <span className="flex items-center gap-1">
          <Target size={11} aria-hidden="true" />
          {scenario.objectives.filter((o) => o.required).length} required goal
          {scenario.objectives.filter((o) => o.required).length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Description */}
      <p className="mb-1 text-sm leading-relaxed text-zinc-400">
        {scenario.description}
      </p>

      {/* Objectives */}
      <ObjectiveList scenario={scenario} />

      {/* CTA */}
      <button
        onClick={() => onSelect(scenario)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.98]"
      >
        Start Scenario
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ScenarioSelect() {
  const setScreen = useGameStore((s) => s.setScreen);
  const setSelectedScenario = useGameStore((s) => s.setSelectedScenario);
  const [activeTab, setActiveTab] = useState<CategoryTab>("all");
  const [selectedScenario, setLocalSelectedScenario] = useState<ScenarioDef | null>(
    null,
  );

  const filtered =
    activeTab === "all"
      ? SCENARIOS
      : SCENARIOS.filter((s) => s.category === activeTab);

  const handleSelect = (scenario: ScenarioDef) => {
    setLocalSelectedScenario(scenario);
  };

  const handleConfirm = () => {
    if (selectedScenario === null) return;
    // Store the scenario ID in the game store so startNewGame can apply it.
    setSelectedScenario(selectedScenario.id);
    setScreen("newGame");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0a] to-[#0c140c] px-4 py-8">
      {/* Confirm overlay */}
      {selectedScenario !== null && (
        <ConfirmOverlay
          scenario={selectedScenario}
          onConfirm={handleConfirm}
          onCancel={() => setLocalSelectedScenario(null)}
        />
      )}

      <div className="mx-auto max-w-5xl">
        {/* Back */}
        <button
          onClick={() => setScreen("mainMenu")}
          className="mb-6 flex items-center gap-2 text-sm text-zinc-500 transition hover:text-zinc-300"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          Back to Menu
        </button>

        {/* Title */}
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-4xl font-bold tracking-tight text-white">
            Scenario<span className="text-emerald-500"> Select</span>
          </h1>
          <p className="text-sm text-zinc-500">
            Choose a challenge with predefined objectives and a unique starting context.
          </p>
        </div>

        {/* Category tabs */}
        <div className="mb-6 flex justify-center gap-2">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                activeTab === tab.id
                  ? "bg-emerald-600 text-white"
                  : "bg-[#1a1a1a] text-zinc-400 hover:bg-[#222] hover:text-zinc-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scenario grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((scenario) => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              onSelect={handleSelect}
            />
          ))}
        </div>

        {filtered.length === 0 && (
          <p className="py-12 text-center text-sm text-zinc-600">
            No scenarios in this category yet.
          </p>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// CONFIRM OVERLAY
// =============================================================================

function ConfirmOverlay({
  scenario,
  onConfirm,
  onCancel,
}: {
  scenario: ScenarioDef;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[#2a2a2a] bg-[#111] p-6 shadow-2xl">
        <h2 className="mb-1 text-xl font-bold text-white">{scenario.name}</h2>
        <div className="mb-4 flex items-center gap-2">
          <DifficultyBadge difficulty={scenario.difficulty} />
          <span className="text-xs text-zinc-500">
            Est. {scenario.estimatedSeasons} season
            {scenario.estimatedSeasons !== 1 ? "s" : ""}
          </span>
        </div>

        <p className="mb-4 text-sm leading-relaxed text-zinc-400">
          {scenario.description}
        </p>

        <div className="mb-6 rounded-lg border border-[#222] bg-[#0d0d0d] p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Starting Conditions
          </p>
          <div className="grid grid-cols-2 gap-1 text-xs text-zinc-400">
            <span>Tier:</span>
            <span className="text-zinc-200">{scenario.setup.startingTier}</span>
            <span>Reputation:</span>
            <span className="text-zinc-200">{scenario.setup.startingReputation}</span>
            <span>Starting Week:</span>
            <span className="text-zinc-200">{scenario.setup.startingWeek}</span>
            <span>Country:</span>
            <span className="text-zinc-200 capitalize">{scenario.setup.startingCountry}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-[#333] py-2.5 text-sm font-medium text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500"
          >
            Start Scenario
          </button>
        </div>
      </div>
    </div>
  );
}
