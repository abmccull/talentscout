"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Wrench,
  Zap,
  Brain,
  Compass,
  Eye,
  Star,
  Lock,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ATTRIBUTE_DOMAINS } from "@/engine/core/types";
import type {
  SessionPhase,
  PlayerMoment,
  ObservationMode,
  SessionFlaggedMoment,
  DialogueNode,
  DataPoint,
  StrategicChoice,
} from "@/engine/observation/types";

// =============================================================================
// Props
// =============================================================================

interface ObservationPhaseProps {
  phase: SessionPhase;
  mode: ObservationMode;
  focusedPlayerIds: string[];
  flaggedMomentIds: string[];
  onFlagMoment: (momentId: string, reaction: SessionFlaggedMoment["reaction"]) => void;
  onDialogueChoice?: (nodeId: string, optionId: string) => void;
  onDataPointSelect?: (pointId: string) => void;
  onStrategicChoice?: (choiceId: string) => void;
  maxFlagsPerPhase: number;
  currentFlagCount: number;
}

// =============================================================================
// Constants
// =============================================================================

const MOMENT_TYPE_ICONS = {
  technicalAction: Wrench,
  physicalTest: Zap,
  mentalResponse: Brain,
  tacticalDecision: Compass,
  characterReveal: Eye,
} as const;

const MOMENT_TYPE_LABELS: Record<PlayerMoment["momentType"], string> = {
  technicalAction: "Technical",
  physicalTest: "Physical",
  mentalResponse: "Mental",
  tacticalDecision: "Tactical",
  characterReveal: "Character",
};

const MOMENT_TYPE_COLORS: Record<PlayerMoment["momentType"], string> = {
  technicalAction: "text-blue-400 bg-blue-400/10",
  physicalTest: "text-orange-400 bg-orange-400/10",
  mentalResponse: "text-purple-400 bg-purple-400/10",
  tacticalDecision: "text-yellow-400 bg-yellow-400/10",
  characterReveal: "text-emerald-400 bg-emerald-400/10",
};

const ATTRIBUTE_HINT_COLORS: Record<string, string> = {
  technical: "bg-blue-900/40 text-blue-300 border-blue-700/50",
  physical: "bg-orange-900/40 text-orange-300 border-orange-700/50",
  mental: "bg-purple-900/40 text-purple-300 border-purple-700/50",
  tactical: "bg-yellow-900/40 text-yellow-300 border-yellow-700/50",
};

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

const REACTION_OPTIONS: { value: SessionFlaggedMoment["reaction"]; label: string; color: string }[] = [
  { value: "promising", label: "Promising", color: "bg-emerald-700/60 hover:bg-emerald-600/60 text-emerald-200" },
  { value: "concerning", label: "Concerning", color: "bg-red-800/60 hover:bg-red-700/60 text-red-200" },
  { value: "interesting", label: "Interesting", color: "bg-blue-800/60 hover:bg-blue-700/60 text-blue-200" },
  { value: "needs_more_data", label: "Need More", color: "bg-zinc-700/60 hover:bg-zinc-600/60 text-zinc-300" },
];

const OUTCOME_TYPE_COLORS: Record<StrategicChoice["outcomeType"], string> = {
  territory: "text-blue-400",
  priority: "text-amber-400",
  network: "text-emerald-400",
  technique: "text-purple-400",
};

// =============================================================================
// Sub-components
// =============================================================================

// ── Atmosphere Event Banner ───────────────────────────────────────────────────

function AtmosphereEventBanner({ event }: { event: NonNullable<SessionPhase["atmosphereEvent"]> }) {
  const effectColors = {
    amplify: "border-emerald-600/40 bg-emerald-950/30 text-emerald-200",
    dampen: "border-zinc-600/40 bg-zinc-900/50 text-zinc-300",
    distraction: "border-amber-600/40 bg-amber-950/30 text-amber-200",
    reveal: "border-blue-600/40 bg-blue-950/30 text-blue-200",
  };
  const effectBadge = {
    amplify: "bg-emerald-500/20 text-emerald-400",
    dampen: "bg-zinc-500/20 text-zinc-400",
    distraction: "bg-amber-500/20 text-amber-400",
    reveal: "bg-blue-500/20 text-blue-400",
  };

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 mb-4",
        effectColors[event.effect],
      )}
      role="status"
      aria-live="polite"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 opacity-80" aria-hidden="true" />
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wide opacity-70">
            Atmosphere Event
          </span>
          <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", effectBadge[event.effect])}>
            {event.effect.charAt(0).toUpperCase() + event.effect.slice(1)}
          </span>
        </div>
        <p className="text-sm leading-snug">{event.description}</p>
      </div>
    </div>
  );
}

// ── Quality Dots ──────────────────────────────────────────────────────────────

function QualityDots({ quality }: { quality: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`Quality ${quality} out of 10`}>
      {Array.from({ length: 10 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            i < quality ? "bg-amber-400" : "bg-zinc-700",
          )}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

// ── Reaction Picker ───────────────────────────────────────────────────────────

interface ReactionPickerProps {
  onSelect: (reaction: SessionFlaggedMoment["reaction"]) => void;
  onClose: () => void;
}

function ReactionPicker({ onSelect, onClose }: ReactionPickerProps) {
  return (
    <div
      className="absolute right-0 top-full z-10 mt-1 flex flex-col gap-1 rounded-lg border border-zinc-700 bg-zinc-900 p-2 shadow-xl"
      role="dialog"
      aria-label="Flag reaction picker"
    >
      {REACTION_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onSelect(opt.value)}
          className={cn(
            "rounded px-3 py-1.5 text-xs font-medium transition-colors",
            opt.color,
          )}
        >
          {opt.label}
        </button>
      ))}
      <button
        type="button"
        onClick={onClose}
        className="mt-1 rounded px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}

// ── Moment Card ───────────────────────────────────────────────────────────────

interface MomentCardProps {
  moment: PlayerMoment;
  isFocused: boolean;
  isFlagged: boolean;
  canFlag: boolean;
  onFlagMoment: (momentId: string, reaction: SessionFlaggedMoment["reaction"]) => void;
}

function MomentCard({ moment, isFocused, isFlagged, canFlag, onFlagMoment }: MomentCardProps) {
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const Icon = MOMENT_TYPE_ICONS[moment.momentType];
  const typeColorClass = MOMENT_TYPE_COLORS[moment.momentType];

  const handleFlagClick = () => {
    if (isFlagged) return;
    if (!canFlag) return;
    setShowReactionPicker(true);
  };

  const handleReactionSelect = (reaction: SessionFlaggedMoment["reaction"]) => {
    onFlagMoment(moment.id, reaction);
    setShowReactionPicker(false);
  };

  return (
    <Card
      className={cn(
        "relative transition-all duration-200",
        moment.isStandout && "border-amber-500/60 shadow-amber-900/30 shadow-md",
        !moment.isStandout && "border-zinc-700/60",
        isFlagged && "opacity-70",
      )}
    >
      {/* Standout accent bar */}
      {moment.isStandout && (
        <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-lg bg-amber-400/80" aria-hidden="true" />
      )}

      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          {/* Type icon */}
          <div className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md", typeColorClass)}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </div>

          <div className="flex flex-1 flex-col gap-2 min-w-0">
            {/* Header row */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("text-xs font-medium", typeColorClass.split(" ")[0])}>
                {MOMENT_TYPE_LABELS[moment.momentType]}
              </span>
              {moment.pressureContext && (
                <span className="rounded px-1.5 py-0.5 text-xs bg-red-900/40 text-red-300 border border-red-700/30">
                  Under Pressure
                </span>
              )}
              {moment.isStandout && (
                <span className="rounded px-1.5 py-0.5 text-xs bg-amber-900/40 text-amber-300 border border-amber-700/30">
                  Standout
                </span>
              )}
            </div>

            {/* Description */}
            <p className="text-sm leading-snug text-zinc-200">
              {isFocused ? moment.description : moment.vagueDescription}
            </p>

            {/* Attribute hints + quality — focused only */}
            {isFocused && (
              <div className="flex flex-wrap items-center gap-2 mt-0.5">
                {moment.attributesHinted.map((attr) => {
                  const domain = ATTRIBUTE_DOMAINS[attr] ?? "technical";
                  return (
                    <span
                      key={attr}
                      className={cn(
                        "rounded border px-1.5 py-0.5 text-xs font-medium capitalize",
                        ATTRIBUTE_HINT_COLORS[domain] ?? "bg-zinc-800 text-zinc-300 border-zinc-700",
                      )}
                    >
                      {attr.replace(/([A-Z])/g, " $1").trim()}
                    </span>
                  );
                })}
                <QualityDots quality={moment.quality} />
              </div>
            )}
          </div>

          {/* Flag button */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={handleFlagClick}
              disabled={isFlagged || !canFlag}
              aria-label={
                isFlagged
                  ? "Moment already flagged"
                  : !canFlag
                  ? "Flag limit reached for this phase"
                  : "Flag this moment"
              }
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                isFlagged
                  ? "text-amber-400 bg-amber-900/30 cursor-default"
                  : canFlag
                  ? "text-zinc-500 hover:text-amber-400 hover:bg-amber-900/20"
                  : "text-zinc-700 cursor-not-allowed",
              )}
            >
              <Star
                className="h-4 w-4"
                fill={isFlagged ? "currentColor" : "none"}
                aria-hidden="true"
              />
            </button>

            {showReactionPicker && (
              <ReactionPicker
                onSelect={handleReactionSelect}
                onClose={() => setShowReactionPicker(false)}
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Mode renderers
// =============================================================================

// ── Full Observation ──────────────────────────────────────────────────────────

interface FullObservationContentProps {
  phase: SessionPhase;
  focusedPlayerIds: string[];
  flaggedMomentIds: string[];
  onFlagMoment: ObservationPhaseProps["onFlagMoment"];
  maxFlagsPerPhase: number;
  currentFlagCount: number;
}

function FullObservationContent({
  phase,
  focusedPlayerIds,
  flaggedMomentIds,
  onFlagMoment,
  maxFlagsPerPhase,
  currentFlagCount,
}: FullObservationContentProps) {
  const flagsLeft = maxFlagsPerPhase - currentFlagCount;

  return (
    <div className="flex flex-col gap-3">
      {flagsLeft > 0 && flagsLeft <= 1 && (
        <p className="text-xs text-amber-400/80" role="status" aria-live="polite">
          {flagsLeft} flag remaining this phase
        </p>
      )}
      {flagsLeft === 0 && (
        <p className="text-xs text-zinc-500" role="status" aria-live="polite">
          Flag limit reached for this phase
        </p>
      )}
      {phase.moments.map((moment) => (
        <MomentCard
          key={moment.id}
          moment={moment}
          isFocused={focusedPlayerIds.includes(moment.playerId)}
          isFlagged={flaggedMomentIds.includes(moment.id)}
          canFlag={flagsLeft > 0 && !flaggedMomentIds.includes(moment.id)}
          onFlagMoment={onFlagMoment}
        />
      ))}
    </div>
  );
}

// ── Investigation ─────────────────────────────────────────────────────────────

interface InvestigationContentProps {
  nodes: DialogueNode[];
  onDialogueChoice: (nodeId: string, optionId: string) => void;
  relationshipScore?: number;
}

function InvestigationContent({ nodes, onDialogueChoice, relationshipScore = 0 }: InvestigationContentProps) {
  const [selectedChoices, setSelectedChoices] = useState<Record<string, string>>({});

  const handleSelect = (nodeId: string, optionId: string) => {
    if (selectedChoices[nodeId]) return;
    setSelectedChoices((prev) => ({ ...prev, [nodeId]: optionId }));
    onDialogueChoice(nodeId, optionId);
  };

  return (
    <div className="flex flex-col gap-4">
      {nodes.map((node) => {
        const chosen = selectedChoices[node.id];
        const chosenOption = node.options.find((o) => o.id === chosen);

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
                <div className="rounded-md border border-zinc-700/40 bg-zinc-800/50 px-3 py-2">
                  <p className="text-sm italic text-zinc-300 leading-snug">
                    {chosenOption.outcome.narrativeText}
                  </p>
                  {chosenOption.outcome.relationshipDelta !== undefined && (
                    <p
                      className={cn(
                        "mt-1 text-xs font-medium",
                        chosenOption.outcome.relationshipDelta >= 0
                          ? "text-emerald-400"
                          : "text-red-400",
                      )}
                    >
                      Relationship{" "}
                      {chosenOption.outcome.relationshipDelta >= 0 ? "+" : ""}
                      {chosenOption.outcome.relationshipDelta}
                    </p>
                  )}
                </div>
              )}

              {/* Options */}
              {!chosen && (
                <div className="flex flex-col gap-2" role="group" aria-label="Response options">
                  {node.options.map((option) => {
                    const isLocked =
                      option.requiresRelationship !== undefined &&
                      relationshipScore < option.requiresRelationship;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        disabled={isLocked}
                        onClick={() => handleSelect(node.id, option.id)}
                        className={cn(
                          "flex items-center gap-2 rounded-md border px-3 py-2.5 text-sm text-left transition-colors",
                          isLocked
                            ? "cursor-not-allowed border-zinc-700/30 bg-zinc-800/30 text-zinc-600"
                            : RISK_COLORS[option.riskLevel],
                        )}
                        aria-disabled={isLocked}
                      >
                        {isLocked && (
                          <Lock className="h-3.5 w-3.5 shrink-0 text-zinc-600" aria-hidden="true" />
                        )}
                        <span className="flex-1 leading-snug">{option.text}</span>
                        <span
                          className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium capitalize",
                            isLocked ? "bg-zinc-700/30 text-zinc-600" : RISK_BADGE_COLORS[option.riskLevel],
                          )}
                          aria-label={`Risk level: ${option.riskLevel}`}
                        >
                          {isLocked ? "Locked" : option.riskLevel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
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
}

function AnalysisContent({ dataPoints, onDataPointSelect }: AnalysisContentProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    onDataPointSelect?.(id);
  };

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="list" aria-label="Data points">
      {dataPoints.map((point) => (
        <button
          key={point.id}
          type="button"
          role="listitem"
          onClick={() => handleSelect(point.id)}
          className={cn(
            "relative flex flex-col gap-1.5 rounded-lg border bg-[var(--card)] px-4 py-3 text-left transition-all",
            point.isHighlighted
              ? "border-amber-500/50 shadow-sm shadow-amber-900/20"
              : "border-zinc-700/50 hover:border-zinc-600/70",
            selectedId === point.id && "ring-1 ring-[var(--primary)]/50",
          )}
          aria-pressed={selectedId === point.id}
          aria-label={`${point.label}: ${point.value}`}
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
      ))}
    </div>
  );
}

// ── Quick Interaction ─────────────────────────────────────────────────────────

interface QuickInteractionContentProps {
  choices: StrategicChoice[];
  onStrategicChoice?: (choiceId: string) => void;
}

function QuickInteractionContent({ choices, onStrategicChoice }: QuickInteractionContentProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSelect = (id: string) => {
    if (selectedId) return;
    setSelectedId(id);
    onStrategicChoice?.(id);
  };

  return (
    <div className="flex flex-col gap-3" role="group" aria-label="Strategic choices">
      {choices.map((choice) => {
        const isSelected = selectedId === choice.id;
        const isDisabled = selectedId !== null && !isSelected;

        return (
          <button
            key={choice.id}
            type="button"
            disabled={isDisabled}
            onClick={() => handleSelect(choice.id)}
            className={cn(
              "flex flex-col gap-2 rounded-lg border p-4 text-left transition-all",
              isSelected
                ? "border-[var(--primary)]/60 bg-[var(--primary)]/10 shadow-sm"
                : isDisabled
                ? "cursor-not-allowed border-zinc-700/30 bg-zinc-900/30 opacity-40"
                : "border-zinc-700/60 bg-[var(--card)] hover:border-zinc-500/70 hover:bg-zinc-800/60",
            )}
            aria-pressed={isSelected}
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

            {isSelected ? (
              <p className="text-xs text-zinc-400 italic leading-snug border-t border-zinc-700/50 pt-2 mt-0.5">
                {choice.effect}
              </p>
            ) : (
              <p className="text-xs text-zinc-500 leading-snug">{choice.effect}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}

// =============================================================================
// Main component
// =============================================================================

export function ObservationPhase({
  phase,
  mode,
  focusedPlayerIds,
  flaggedMomentIds,
  onFlagMoment,
  onDialogueChoice,
  onDataPointSelect,
  onStrategicChoice,
  maxFlagsPerPhase,
  currentFlagCount,
}: ObservationPhaseProps) {
  const renderContent = () => {
    switch (mode) {
      case "fullObservation":
        return (
          <FullObservationContent
            phase={phase}
            focusedPlayerIds={focusedPlayerIds}
            flaggedMomentIds={flaggedMomentIds}
            onFlagMoment={onFlagMoment}
            maxFlagsPerPhase={maxFlagsPerPhase}
            currentFlagCount={currentFlagCount}
          />
        );

      case "investigation":
        if (!phase.dialogueNodes?.length) {
          return (
            <p className="text-sm text-zinc-500 italic">No dialogue in this phase.</p>
          );
        }
        return (
          <InvestigationContent
            nodes={phase.dialogueNodes}
            onDialogueChoice={onDialogueChoice ?? (() => {})}
          />
        );

      case "analysis":
        if (!phase.dataPoints?.length) {
          return (
            <p className="text-sm text-zinc-500 italic">No data points in this phase.</p>
          );
        }
        return (
          <AnalysisContent
            dataPoints={phase.dataPoints}
            onDataPointSelect={onDataPointSelect}
          />
        );

      case "quickInteraction":
        if (!phase.choices?.length) {
          return (
            <p className="text-sm text-zinc-500 italic">No choices available.</p>
          );
        }
        return (
          <QuickInteractionContent
            choices={phase.choices}
            onStrategicChoice={onStrategicChoice}
          />
        );

      default:
        return null;
    }
  };

  return (
    <section aria-label={`Phase ${phase.index + 1} — minute ${phase.minute}`}>
      {/* Atmosphere event banner */}
      {phase.atmosphereEvent && (
        <AtmosphereEventBanner event={phase.atmosphereEvent} />
      )}

      {/* Half-time notice */}
      {phase.isHalfTime && (
        <div
          className="mb-4 flex items-center justify-center rounded-lg border border-zinc-600/40 bg-zinc-800/50 px-4 py-2.5 text-sm font-semibold text-zinc-300"
          role="status"
        >
          Half Time — Focus tokens refreshed
        </div>
      )}

      {renderContent()}
    </section>
  );
}
