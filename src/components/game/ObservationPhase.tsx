"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Star, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  DialogueNode,
  DialogueChoiceResolution,
  DataPoint,
  DataPointSelectionResolution,
  StrategicChoice,
} from "@/engine/observation/types";

const RISK_COLORS = {
  safe: "border-emerald-600/50 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/40",
  moderate: "border-amber-600/50 bg-amber-950/30 text-amber-300 hover:bg-amber-900/40",
  bold: "border-red-600/50 bg-red-950/30 text-red-300 hover:bg-red-900/40",
} as const;

const RISK_BADGE_COLORS = {
  safe: "bg-emerald-500/20 text-emerald-400",
  moderate: "bg-amber-500/20 text-amber-400",
  bold: "bg-red-500/20 text-red-400",
} as const;

const DATA_CATEGORY_COLORS = {
  statistical: "bg-blue-500/20 text-blue-400",
  comparison: "bg-purple-500/20 text-purple-400",
  trend: "bg-emerald-500/20 text-emerald-400",
  anomaly: "bg-amber-500/20 text-amber-400",
} as const;

const OUTCOME_TYPE_COLORS: Record<StrategicChoice["outcomeType"], string> = {
  territory: "text-blue-400",
  priority: "text-amber-400",
  network: "text-emerald-400",
  technique: "text-purple-400",
};

interface InvestigationContentProps {
  nodes: DialogueNode[];
  onDialogueChoice: (nodeId: string, optionId: string) => void;
  relationshipScore?: number;
  selectedOptionIds?: Record<string, string>;
  resolutions?: Record<string, DialogueChoiceResolution>;
  sourceContactName?: string;
}

export function InvestigationContent({
  nodes,
  onDialogueChoice,
  relationshipScore = 0,
  selectedOptionIds = {},
  resolutions = {},
  sourceContactName,
}: InvestigationContentProps) {
  const handleSelect = (nodeId: string, optionId: string) => {
    if (selectedOptionIds[nodeId] || resolutions[nodeId]) return;
    onDialogueChoice(nodeId, optionId);
  };

  return (
    <div className="flex flex-col gap-4">
      {nodes.map((node) => {
        const chosen = selectedOptionIds[node.id];
        const chosenOption = node.options.find((o) => o.id === chosen);
        const resolution = resolutions[node.id];

        return (
          <Card key={node.id} className="border-zinc-700/60">
            <CardContent className="p-4 flex flex-col gap-3">
              {/* Speaker + text */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {node.speaker}
                </span>
                <p className="text-sm leading-relaxed text-zinc-200">{node.text}</p>
              </div>

              {/* Consequence after selection */}
              {chosen && chosenOption && (
                <div
                  className="rounded-md border border-zinc-700/40 bg-zinc-800/50 px-3 py-2"
                  role="status"
                  aria-live="polite"
                  data-testid={`dialogue-resolution-${node.id}`}
                >
                  <p className="text-sm italic text-zinc-300 leading-snug">
                    {resolution?.narrativeText ?? chosenOption.outcome.narrativeText}
                  </p>
                  {(resolution?.relationshipDeltaApplied ?? 0) !== 0 && (
                    <p
                      className={cn(
                        "mt-1 text-xs font-medium",
                        (resolution?.relationshipDeltaApplied ?? 0) >= 0
                          ? "text-emerald-400"
                          : "text-red-400",
                      )}
                    >
                      {sourceContactName ? `${sourceContactName} relationship` : "Relationship"}{" "}
                      {(resolution?.relationshipDeltaApplied ?? 0) >= 0 ? "+" : ""}
                      {resolution?.relationshipDeltaApplied ?? 0}
                    </p>
                  )}
                  {(resolution?.insightPointsAwarded ?? 0) > 0 && (
                    <p className="mt-1 text-xs font-medium text-amber-300">
                      Insight +{resolution?.insightPointsAwarded ?? 0}
                    </p>
                  )}
                </div>
              )}

              {/* Options */}
              <div className="flex flex-col gap-2" role="group" aria-label="Response options">
                {node.options.map((option) => {
                    const isRelationshipLocked =
                      option.requiresRelationship !== undefined &&
                      relationshipScore < option.requiresRelationship;
                    const isSelected = chosen === option.id;
                    const isChoiceLocked = Boolean(chosen || resolution);
                    const isDisabled = isRelationshipLocked || isChoiceLocked;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => handleSelect(node.id, option.id)}
                        className={cn(
                          "flex min-h-11 items-center gap-2 rounded-md border px-3 py-2.5 text-sm text-left transition-colors",
                          isSelected
                            ? "cursor-default border-emerald-500/60 bg-emerald-950/40 text-emerald-100 disabled:opacity-100"
                            : isDisabled
                              ? "cursor-not-allowed border-zinc-700/30 bg-zinc-800/30 text-zinc-500"
                              : RISK_COLORS[option.riskLevel],
                        )}
                        aria-pressed={isSelected}
                        data-testid={`dialogue-option-${option.id}`}
                      >
                        {isDisabled && !isSelected && (
                          <Lock className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
                        )}
                        <span className="flex-1 leading-snug">{option.text}</span>
                        <span
                          className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium capitalize",
                            isDisabled && !isSelected
                              ? "bg-zinc-700/30 text-zinc-500"
                              : RISK_BADGE_COLORS[option.riskLevel],
                          )}
                          aria-label={`Risk level: ${option.riskLevel}`}
                        >
                          {isSelected
                            ? "Selected"
                            : isRelationshipLocked
                              ? `Needs ${option.requiresRelationship} relationship`
                              : isChoiceLocked
                                ? "Locked"
                                : option.riskLevel}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── Analysis ──────────────────────────────────────────────────────────────────

interface AnalysisContentProps {
  dataPoints: DataPoint[];
  onDataPointSelect?: (pointId: string) => void;
  selectedPointId?: string;
  resolution?: DataPointSelectionResolution;
}

export function AnalysisContent({
  dataPoints,
  onDataPointSelect,
  selectedPointId,
  resolution,
}: AnalysisContentProps) {
  const handleSelect = (id: string) => {
    if (selectedPointId || resolution) return;
    onDataPointSelect?.(id);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label="Data points">
        {dataPoints.map((point) => {
          const isSelected = selectedPointId === point.id;
          const isLocked = Boolean(selectedPointId || resolution);
          return (
        <button
          key={point.id}
          type="button"
          disabled={isLocked}
          onClick={() => handleSelect(point.id)}
          className={cn(
            "relative flex min-h-11 flex-col gap-1.5 rounded-lg border bg-[var(--card)] px-4 py-3 text-left transition-all",
            point.isHighlighted
              ? "border-amber-500/50 shadow-sm shadow-amber-900/20"
              : "border-zinc-700/50 hover:border-zinc-600/70",
            isSelected && "ring-1 ring-[var(--primary)]/70 disabled:opacity-100",
            isLocked && !isSelected && "cursor-not-allowed opacity-45",
          )}
          aria-pressed={isSelected}
          aria-label={`${point.label}: ${point.value}`}
          data-testid={`analysis-data-point-${point.id}`}
        >
          {/* Golden left border for highlighted points */}
          {point.isHighlighted && (
            <div className="absolute inset-y-0 left-0 w-0.5 rounded-l-lg bg-amber-400/80" aria-hidden="true" />
          )}

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-zinc-400 truncate">
              {point.playerId ? `Player · ` : "Team · "}
              <span className={cn("rounded px-1.5 py-0.5 font-medium", DATA_CATEGORY_COLORS[point.category])}>
                {point.category}
              </span>
            </span>
            {point.isHighlighted && (
              <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" aria-hidden="true" />
            )}
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-base font-bold text-zinc-100">{point.value}</span>
            <span className="text-xs text-zinc-400 truncate">{point.label}</span>
          </div>

          {point.relatedAttributes && point.relatedAttributes.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {point.relatedAttributes.slice(0, 3).map((attr) => (
                <span key={attr} className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">
                  {attr.replace(/([A-Z])/g, " $1").trim()}
                </span>
              ))}
            </div>
          )}
        </button>
          );
        })}
      </div>
      <p className="text-xs text-zinc-400" role="status" aria-live="polite">
        {resolution
          ? `${resolution.pointLabel} locked. Insight +${resolution.insightPointsAwarded}.`
          : "Select one signal to preserve as the phase's analysis takeaway."}
      </p>
    </div>
  );
}

// ── Quick Interaction ─────────────────────────────────────────────────────────

interface QuickInteractionContentProps {
  choices: StrategicChoice[];
  selectedChoiceId?: string;
  onStrategicChoice?: (choiceId: string) => void;
}

export function QuickInteractionContent({
  choices,
  selectedChoiceId,
  onStrategicChoice,
}: QuickInteractionContentProps) {
  const handleSelect = (id: string) => {
    if (selectedChoiceId) return;
    onStrategicChoice?.(id);
  };

  const selectedChoice = choices.find((choice) => choice.id === selectedChoiceId);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed text-zinc-400">
        Choose one approach. It locks immediately, shapes the next phase, and cannot be replayed for extra rewards.
      </p>
      <div className="flex flex-col gap-3" role="group" aria-label="Strategic choices">
        {choices.map((choice) => {
          const isSelected = selectedChoiceId === choice.id;
          const isLocked = Boolean(selectedChoiceId);

          return (
            <button
              key={choice.id}
              type="button"
              disabled={isLocked}
              onClick={() => handleSelect(choice.id)}
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-4 text-left transition-all",
                isSelected
                  ? "cursor-default border-[var(--primary)]/60 bg-[var(--primary)]/10 shadow-sm disabled:opacity-100"
                  : isLocked
                  ? "cursor-not-allowed border-zinc-700/30 bg-zinc-900/30 opacity-40"
                  : "border-zinc-700/60 bg-[var(--card)] hover:border-zinc-500/70 hover:bg-zinc-800/60",
              )}
              aria-pressed={isSelected}
              data-testid={`strategic-choice-${choice.id}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm text-zinc-100">{choice.text}</span>
                <span
                  className={cn(
                    "shrink-0 rounded px-2 py-0.5 text-xs font-medium capitalize",
                    OUTCOME_TYPE_COLORS[choice.outcomeType],
                    "bg-zinc-800",
                  )}
                >
                  {choice.outcomeType}
                </span>
              </div>

              <p className="text-sm text-zinc-300 leading-snug">{choice.description}</p>

              <span
                className="flex flex-wrap gap-1.5 text-meta font-medium"
                data-testid="strategic-choice-impact"
              >
                <span className="rounded bg-emerald-500/10 px-2 py-1 text-emerald-300">
                  +{choice.impact.insightPoints} insight
                </span>
                <span className="rounded bg-amber-500/10 px-2 py-1 text-amber-300">
                  +{choice.impact.fatigueDelta} fatigue
                </span>
                {choice.impact.qualityModifier > 0 && (
                  <span className="rounded bg-blue-500/10 px-2 py-1 text-blue-300">
                    +{choice.impact.qualityModifier} session quality
                  </span>
                )}
              </span>

              {isSelected ? (
                <p className="text-xs text-zinc-300 italic leading-snug border-t border-zinc-700/50 pt-2 mt-0.5">
                  Locked: {choice.effect}
                </p>
              ) : (
                <p className="text-xs text-zinc-300 leading-snug">{choice.effect}</p>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-zinc-400" role="status" aria-live="polite">
        {selectedChoice
          ? `${selectedChoice.text} locked. The next phase now reflects this outcome.`
          : "A choice is required before the session can advance."}
      </p>
    </div>
  );
}
