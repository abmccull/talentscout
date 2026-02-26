"use client";

import { memo, useState, useCallback, useEffect } from "react";
import { useGameStore } from "@/stores/gameStore";
import { GameLayout } from "./GameLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScreenBackground } from "@/components/ui/screen-background";
import {
  Eye,
  ChevronRight,
  Flag,
  Zap,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Database,
  X,
  Play,
  Binoculars,
  BarChart3,
  MessageSquare,
  Shuffle,
} from "lucide-react";
import type {
  ObservationSession,
  SessionPhase,
  PlayerMoment,
  LensType,
  SessionFlaggedMoment,
  DataPoint,
  DialogueNode,
  StrategicChoice,
} from "@/engine/observation/types";
import { getSessionResult, isHalfTimePhase } from "@/engine/observation/session";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LENS_KEYS: LensType[] = ["technical", "physical", "mental", "tactical", "general"];

const LENS_COLORS: Record<LensType, string> = {
  technical: "text-blue-400",
  physical:  "text-orange-400",
  mental:    "text-purple-400",
  tactical:  "text-yellow-400",
  general:   "text-zinc-400",
};

const LENS_BORDER: Record<LensType, string> = {
  technical: "border-blue-500/30",
  physical:  "border-orange-500/30",
  mental:    "border-purple-500/30",
  tactical:  "border-yellow-500/30",
  general:   "border-zinc-500/30",
};

const REACTION_CONFIG: Record<
  SessionFlaggedMoment["reaction"],
  { label: string; icon: React.ElementType; className: string }
> = {
  promising:      { label: "Promising",      icon: CheckCircle2, className: "text-emerald-400" },
  concerning:     { label: "Concerning",      icon: AlertTriangle, className: "text-red-400" },
  interesting:    { label: "Interesting",     icon: HelpCircle, className: "text-amber-400" },
  needs_more_data: { label: "Needs More Data", icon: Database, className: "text-blue-400" },
};

const MODE_LABELS: Record<ObservationSession["mode"], string> = {
  fullObservation: "Live Observation",
  investigation:   "Investigation",
  analysis:        "Analysis",
  quickInteraction: "Quick Decision",
};

const MODE_ICONS: Record<ObservationSession["mode"], React.ElementType> = {
  fullObservation: Binoculars,
  investigation:   MessageSquare,
  analysis:        BarChart3,
  quickInteraction: Shuffle,
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// -- MomentCard --------------------------------------------------------------

interface MomentCardProps {
  moment: PlayerMoment;
  isFocused: boolean;
  playerName: string;
  canFlag: boolean;
  alreadyFlagged: boolean;
  onFlag: (momentId: string, reaction: SessionFlaggedMoment["reaction"]) => void;
}

const MomentCard = memo(function MomentCard({
  moment,
  isFocused,
  playerName,
  canFlag,
  alreadyFlagged,
  onFlag,
}: MomentCardProps) {
  const [showReactions, setShowReactions] = useState(false);

  const handleFlagClick = useCallback(() => {
    if (!canFlag || alreadyFlagged) return;
    setShowReactions((v) => !v);
  }, [canFlag, alreadyFlagged]);

  const handleReaction = useCallback(
    (reaction: SessionFlaggedMoment["reaction"]) => {
      onFlag(moment.id, reaction);
      setShowReactions(false);
    },
    [moment.id, onFlag],
  );

  return (
    <Card
      className={`border ${
        isFocused
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-[#27272a] bg-[#0f0f0f]"
      } ${moment.isStandout ? "ring-1 ring-amber-500/30" : ""}`}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="mb-1 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {playerName}
              </span>
              <Badge variant="secondary" className="text-[10px] py-0">
                {moment.momentType.replace(/([A-Z])/g, " $1").trim()}
              </Badge>
              {moment.isStandout && (
                <Badge variant="warning" className="text-[10px] py-0">
                  Standout
                </Badge>
              )}
              {moment.pressureContext && (
                <Badge variant="outline" className="text-[10px] py-0 text-zinc-500">
                  Under Pressure
                </Badge>
              )}
            </div>
            <p className="text-xs text-zinc-300 leading-snug">
              {isFocused ? moment.description : moment.vagueDescription}
            </p>
            {isFocused && moment.attributesHinted.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {moment.attributesHinted.map((attr) => (
                  <span
                    key={attr}
                    className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400"
                  >
                    {attr}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Flag button */}
          <div className="shrink-0">
            {alreadyFlagged ? (
              <Flag size={14} className="text-amber-400" aria-label="Flagged" />
            ) : canFlag ? (
              <button
                onClick={handleFlagClick}
                className="rounded p-0.5 text-zinc-600 hover:text-amber-400 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400"
                aria-label="Flag this moment"
                aria-expanded={showReactions}
              >
                <Flag size={14} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Reaction picker */}
        {showReactions && (
          <div className="mt-2 grid grid-cols-2 gap-1 border-t border-[#27272a] pt-2">
            {(Object.entries(REACTION_CONFIG) as [SessionFlaggedMoment["reaction"], typeof REACTION_CONFIG[keyof typeof REACTION_CONFIG]][]).map(
              ([reaction, config]) => {
                const Icon = config.icon;
                return (
                  <button
                    key={reaction}
                    onClick={() => handleReaction(reaction)}
                    className={`flex items-center gap-1.5 rounded px-2 py-1.5 text-xs transition hover:bg-[#27272a] ${config.className}`}
                  >
                    <Icon size={12} aria-hidden="true" />
                    {config.label}
                  </button>
                );
              },
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// -- DataPointCard -----------------------------------------------------------

interface DataPointCardProps {
  point: DataPoint;
  playerName?: string;
}

const DataPointCard = memo(function DataPointCard({ point, playerName }: DataPointCardProps) {
  return (
    <Card
      className={`border ${
        point.isHighlighted
          ? "border-blue-500/30 bg-blue-500/5"
          : "border-[#27272a] bg-[#0f0f0f]"
      }`}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-0.5">
              {playerName ?? "Team"} — {point.category}
            </p>
            <p className="text-xs text-zinc-300">{point.label}</p>
            {point.relatedAttributes && point.relatedAttributes.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {point.relatedAttributes.map((attr) => (
                  <span key={attr} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                    {attr}
                  </span>
                ))}
              </div>
            )}
          </div>
          <span className="shrink-0 text-sm font-bold text-zinc-200 tabular-nums">
            {point.value}
          </span>
        </div>
      </CardContent>
    </Card>
  );
});

// -- DialogueCard ------------------------------------------------------------

interface DialogueCardProps {
  node: DialogueNode;
}

const DialogueCard = memo(function DialogueCard({ node }: DialogueCardProps) {
  return (
    <Card className="border border-[#27272a] bg-[#0f0f0f]">
      <CardContent className="p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
          {node.speaker}
        </p>
        <p className="text-xs text-zinc-300 leading-snug italic">&ldquo;{node.text}&rdquo;</p>
        {node.options.length > 0 && (
          <div className="mt-2 space-y-1 border-t border-[#27272a] pt-2">
            {node.options.map((opt) => (
              <div key={opt.id} className="flex items-start gap-2 text-xs">
                <Badge
                  variant={
                    opt.riskLevel === "bold"
                      ? "destructive"
                      : opt.riskLevel === "moderate"
                        ? "warning"
                        : "secondary"
                  }
                  className="shrink-0 mt-0.5 text-[10px] py-0"
                >
                  {opt.riskLevel}
                </Badge>
                <span className="text-zinc-400">{opt.text}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

// -- StrategicChoiceCard -----------------------------------------------------

interface StrategicChoiceCardProps {
  choice: StrategicChoice;
}

const StrategicChoiceCard = memo(function StrategicChoiceCard({ choice }: StrategicChoiceCardProps) {
  return (
    <Card className="border border-[#27272a] bg-[#0f0f0f] hover:border-zinc-600 transition-colors">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="text-sm font-medium text-zinc-200">{choice.text}</p>
          <Badge variant="outline" className="shrink-0 text-[10px] py-0 capitalize">
            {choice.outcomeType}
          </Badge>
        </div>
        <p className="text-xs text-zinc-400 leading-snug">{choice.description}</p>
      </CardContent>
    </Card>
  );
});

// -- PhaseContent ------------------------------------------------------------

interface PhaseContentProps {
  phase: SessionPhase;
  session: ObservationSession;
  flaggedMomentIds: Set<string>;
  hasPhaseFlag: boolean;
  onFlagMoment: (momentId: string, reaction: SessionFlaggedMoment["reaction"]) => void;
}

const PhaseContent = memo(function PhaseContent({
  phase,
  session,
  flaggedMomentIds,
  hasPhaseFlag,
  onFlagMoment,
}: PhaseContentProps) {
  const playerMap = new Map(session.players.map((p) => [p.playerId, p]));

  // Full Observation: player moments
  if (session.mode === "fullObservation") {
    return (
      <div className="space-y-2">
        {phase.moments.length === 0 ? (
          <p className="text-xs text-zinc-600 py-6 text-center">No moments observed in this phase.</p>
        ) : (
          phase.moments.map((moment) => {
            const sessionPlayer = playerMap.get(moment.playerId);
            return (
              <MomentCard
                key={moment.id}
                moment={moment}
                isFocused={sessionPlayer?.isFocused ?? false}
                playerName={sessionPlayer?.name ?? moment.playerId}
                canFlag={!hasPhaseFlag}
                alreadyFlagged={flaggedMomentIds.has(moment.id)}
                onFlag={onFlagMoment}
              />
            );
          })
        )}
      </div>
    );
  }

  // Investigation: dialogue nodes
  if (session.mode === "investigation") {
    return (
      <div className="space-y-2">
        {(phase.dialogueNodes ?? []).length === 0 ? (
          <p className="text-xs text-zinc-600 py-6 text-center">No dialogue in this phase.</p>
        ) : (
          (phase.dialogueNodes ?? []).map((node) => (
            <DialogueCard key={node.id} node={node} />
          ))
        )}
      </div>
    );
  }

  // Analysis: data points
  if (session.mode === "analysis") {
    return (
      <div className="space-y-2">
        {(phase.dataPoints ?? []).length === 0 ? (
          <p className="text-xs text-zinc-600 py-6 text-center">No data points in this phase.</p>
        ) : (
          (phase.dataPoints ?? []).map((point) => {
            const player = point.playerId ? playerMap.get(point.playerId) : undefined;
            return (
              <DataPointCard
                key={point.id}
                point={point}
                playerName={player?.name}
              />
            );
          })
        )}
      </div>
    );
  }

  // Quick Interaction: strategic choices
  return (
    <div className="space-y-2">
      {(phase.choices ?? []).length === 0 ? (
        <p className="text-xs text-zinc-600 py-6 text-center">No choices available.</p>
      ) : (
        (phase.choices ?? []).map((choice) => (
          <StrategicChoiceCard key={choice.id} choice={choice} />
        ))
      )}
    </div>
  );
});

// -- FocusPanel --------------------------------------------------------------

interface FocusPanelProps {
  session: ObservationSession;
  onAllocateFocus: (playerId: string, lens: LensType) => void;
  onRemoveFocus: (playerId: string) => void;
}

const FocusPanel = memo(function FocusPanel({
  session,
  onAllocateFocus,
  onRemoveFocus,
}: FocusPanelProps) {
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const { focusTokens, players } = session;

  const focusedPlayers = players.filter((p) => p.isFocused);
  const unfocusedPlayers = players.filter((p) => !p.isFocused);
  const canAllocate = focusTokens.available > 0;

  const handleConfirmFocus = useCallback(
    (playerId: string, lens: LensType) => {
      onAllocateFocus(playerId, lens);
      setPendingFocusId(null);
    },
    [onAllocateFocus],
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Token counter */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Eye size={14} className="text-emerald-500" aria-hidden="true" />
            Focus Tokens
          </h3>
          <span className="text-xs text-zinc-400 tabular-nums">
            {focusTokens.available}/{focusTokens.total} remaining
          </span>
        </div>
        {/* Token pips */}
        <div className="flex gap-1.5" role="meter" aria-valuenow={focusTokens.available} aria-valuemax={focusTokens.total} aria-label="Focus tokens remaining">
          {Array.from({ length: focusTokens.total }).map((_, i) => (
            <div
              key={i}
              className={`h-2 flex-1 rounded-full transition-colors ${
                i < focusTokens.available ? "bg-emerald-500" : "bg-zinc-700"
              }`}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>

      {/* Active focus allocations */}
      {focusedPlayers.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-2">
            Active Focus
          </h4>
          <div className="space-y-2">
            {focusedPlayers.map((player) => {
              const lens = player.currentLens ?? "general";
              return (
                <div
                  key={player.playerId}
                  className={`rounded-md border ${LENS_BORDER[lens]} bg-[#141414] p-3`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-zinc-200">{player.name}</p>
                      <p className="text-xs text-zinc-500">{player.position}</p>
                    </div>
                    <button
                      onClick={() => onRemoveFocus(player.playerId)}
                      className="rounded p-0.5 text-zinc-600 hover:text-zinc-300 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
                      aria-label={`Remove focus from ${player.name}`}
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  </div>
                  <select
                    value={lens}
                    onChange={(e) =>
                      // TODO: Wire to gameStore session actions (allocateSessionFocus)
                      onAllocateFocus(player.playerId, e.target.value as LensType)
                    }
                    className={`w-full rounded bg-[#0a0a0a] border border-[#27272a] px-2 py-1 text-xs ${LENS_COLORS[lens]} focus:outline-none focus:ring-1 focus:ring-emerald-500`}
                    aria-label={`Observation lens for ${player.name}`}
                  >
                    {LENS_KEYS.map((l) => (
                      <option key={l} value={l} className="capitalize">
                        {l.charAt(0).toUpperCase() + l.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Available players to focus */}
      {unfocusedPlayers.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-2">
            Players in Session
          </h4>
          <div className="space-y-1">
            {unfocusedPlayers.map((player) => {
              const isPending = pendingFocusId === player.playerId;
              return (
                <div key={player.playerId}>
                  <div className="flex items-center justify-between rounded px-2 py-1.5 text-xs text-zinc-400 hover:bg-[#141414] transition">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="truncate">{player.name}</span>
                      <span className="text-zinc-600 shrink-0">{player.position}</span>
                    </div>
                    {canAllocate && (
                      <button
                        onClick={() =>
                          setPendingFocusId(isPending ? null : player.playerId)
                        }
                        className="shrink-0 ml-2 text-[10px] text-emerald-400 hover:text-emerald-300 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400 rounded px-1.5 py-0.5"
                        aria-label={`Add focus to ${player.name}`}
                        aria-expanded={isPending}
                      >
                        {isPending ? "Cancel" : "Focus"}
                      </button>
                    )}
                  </div>

                  {/* Lens selector for pending player */}
                  {isPending && (
                    <div className="mt-1 mb-2 rounded border border-[#27272a] bg-[#141414] p-2 space-y-1">
                      <p className="text-[10px] text-zinc-500 mb-1.5">Select lens for {player.name}</p>
                      {LENS_KEYS.map((lens) => (
                        <button
                          key={lens}
                          onClick={() => handleConfirmFocus(player.playerId, lens)}
                          className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition hover:bg-[#27272a] ${LENS_COLORS[lens]}`}
                        >
                          <span className="capitalize font-medium">{lens}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!canAllocate && focusedPlayers.length === 0 && (
        <p className="text-xs text-zinc-600 text-center py-4">
          No focus tokens remaining this half.
        </p>
      )}
    </div>
  );
});

// -- SetupView ---------------------------------------------------------------

interface SetupViewProps {
  session: ObservationSession;
  onBegin: () => void;
}

const SetupView = memo(function SetupView({ session, onBegin }: SetupViewProps) {
  const { venueAtmosphere, players, mode } = session;
  const ModeIcon = MODE_ICONS[mode];

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20">
        <ModeIcon size={24} className="text-emerald-400" aria-hidden="true" />
      </div>
      <h2 className="text-lg font-semibold text-zinc-100 mb-1">
        {MODE_LABELS[mode]}
      </h2>
      <p className="text-sm text-zinc-400 mb-2">
        {session.phases.length} phase{session.phases.length !== 1 ? "s" : ""}
        {session.focusTokens.total > 0 &&
          ` · ${session.focusTokens.total} focus token${session.focusTokens.total !== 1 ? "s" : ""} per half`}
      </p>

      {venueAtmosphere && (
        <div className="mb-4 max-w-sm rounded-lg border border-[#27272a] bg-[#0f0f0f] p-4 text-left">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1">
            Venue Atmosphere
          </p>
          <p className="text-xs text-zinc-300 leading-snug mb-2">
            {venueAtmosphere.description}
          </p>
          {venueAtmosphere.amplifiedAttributes.length > 0 && (
            <div className="mb-1 flex flex-wrap gap-1">
              <span className="text-[10px] text-emerald-500 mr-1">Amplified:</span>
              {venueAtmosphere.amplifiedAttributes.map((a) => (
                <span key={a} className="rounded bg-emerald-900/30 px-1.5 py-0.5 text-[10px] text-emerald-400">
                  {a}
                </span>
              ))}
            </div>
          )}
          {venueAtmosphere.dampenedAttributes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-[10px] text-red-500 mr-1">Dampened:</span>
              {venueAtmosphere.dampenedAttributes.map((a) => (
                <span key={a} className="rounded bg-red-900/30 px-1.5 py-0.5 text-[10px] text-red-400">
                  {a}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {players.length > 0 && (
        <div className="mb-6 max-w-sm w-full rounded-lg border border-[#27272a] bg-[#0f0f0f] p-4 text-left">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-2">
            Players in Session ({players.length})
          </p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {players.map((p) => (
              <div key={p.playerId} className="flex items-center justify-between text-xs">
                <span className="text-zinc-300">{p.name}</span>
                <span className="text-zinc-600">{p.position}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Button onClick={onBegin} size="lg" className="gap-2">
        <Play size={16} aria-hidden="true" />
        Begin Observation
      </Button>
    </div>
  );
});

// -- ReflectionView ----------------------------------------------------------

interface ReflectionViewProps {
  session: ObservationSession;
  onComplete: () => void;
}

const ReflectionView = memo(function ReflectionView({ session, onComplete }: ReflectionViewProps) {
  const result = getSessionResult(session);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-lg font-semibold text-zinc-100 mb-1">Session Reflection</h2>
        <p className="text-sm text-zinc-400 mb-6">
          Review what you observed before completing the session.
        </p>

        {/* Insight summary */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="rounded-lg border border-[#27272a] bg-[#0f0f0f] p-3 text-center">
            <p className="text-xl font-bold text-emerald-400 tabular-nums">
              {result.insightPointsEarned}
            </p>
            <p className="text-[10px] text-zinc-500 mt-0.5">Insight Points</p>
          </div>
          <div className="rounded-lg border border-[#27272a] bg-[#0f0f0f] p-3 text-center">
            <p className="text-xl font-bold text-amber-400 tabular-nums">
              {result.flaggedMoments.length}
            </p>
            <p className="text-[10px] text-zinc-500 mt-0.5">Moments Flagged</p>
          </div>
          <div className="rounded-lg border border-[#27272a] bg-[#0f0f0f] p-3 text-center">
            <p className="text-xl font-bold text-zinc-200 capitalize">
              {result.qualityTier}
            </p>
            <p className="text-[10px] text-zinc-500 mt-0.5">Quality Tier</p>
          </div>
        </div>

        {/* Flagged moments review */}
        {result.flaggedMoments.length > 0 && (
          <div className="mb-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-600 mb-3">
              Flagged Moments
            </h3>
            <div className="space-y-2">
              {result.flaggedMoments.map((fm) => {
                const config = REACTION_CONFIG[fm.reaction];
                const Icon = config.icon;
                return (
                  <div
                    key={fm.id}
                    className="rounded-md border border-[#27272a] bg-[#0f0f0f] p-3"
                  >
                    <div className="flex items-start gap-2">
                      <Icon size={14} className={`mt-0.5 shrink-0 ${config.className}`} aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-xs font-medium ${config.className}`}>
                            {config.label}
                          </span>
                          <span className="text-[10px] text-zinc-600">
                            {fm.minute}&apos;
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 leading-snug">
                          {fm.moment.description}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Button onClick={onComplete} className="w-full">
          Complete Session
        </Button>
      </div>
    </div>
  );
});

// -- CompleteView ------------------------------------------------------------

interface CompleteViewProps {
  session: ObservationSession;
  onContinue: () => void;
}

const CompleteView = memo(function CompleteView({ session, onContinue }: CompleteViewProps) {
  const result = getSessionResult(session);

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <CheckCircle2 size={40} className="text-emerald-400 mb-4" aria-hidden="true" />
      <h2 className="text-lg font-semibold text-zinc-100 mb-1">Session Complete</h2>
      <p className="text-sm text-zinc-400 mb-6">
        {result.phasesCompleted} of {result.totalPhases} phases completed —{" "}
        <span className="capitalize text-zinc-300">{result.qualityTier}</span> quality
      </p>
      <div className="grid grid-cols-2 gap-3 mb-8 w-full max-w-xs">
        <div className="rounded-lg border border-[#27272a] bg-[#0f0f0f] p-3 text-center">
          <p className="text-xl font-bold text-emerald-400 tabular-nums">
            {result.insightPointsEarned}
          </p>
          <p className="text-[10px] text-zinc-500 mt-0.5">Insight Points</p>
        </div>
        <div className="rounded-lg border border-[#27272a] bg-[#0f0f0f] p-3 text-center">
          <p className="text-xl font-bold text-amber-400 tabular-nums">
            {result.focusedPlayerIds.length}
          </p>
          <p className="text-[10px] text-zinc-500 mt-0.5">Players Observed</p>
        </div>
      </div>
      <Button onClick={onContinue} size="lg">
        Continue
      </Button>
    </div>
  );
});

// ---------------------------------------------------------------------------
// ObservationScreen (main)
// ---------------------------------------------------------------------------

export function ObservationScreen() {
  // TODO: Wire to gameStore session actions — activeSession will be added to GameStore
  // when the observation engine is integrated. The cast to `unknown` then
  // `ObservationSession | null` is intentional: this component is written ahead of
  // the store update and the property does not exist on GameStore yet. Remove the
  // intermediate cast once GameStore exports `activeSession`.
  const activeSession = useGameStore(
    // Cast through unknown: property is intentionally missing from GameStore until wired.
    (s) => (s as unknown as { activeSession: ObservationSession | null }).activeSession ?? null,
  );

  // Local UI state — all hooks must be called before any early return
  const [showInsightOverlay, setShowInsightOverlay] = useState(false);

  // Derived data — optional-chain safely when activeSession is null
  const currentPhase: SessionPhase | undefined =
    activeSession?.phases[activeSession.currentPhaseIndex];

  const flaggedMomentIds = new Set<string>(
    activeSession?.flaggedMoments.map((fm) => fm.moment.id) ?? [],
  );

  const hasPhaseFlag = (activeSession?.flaggedMoments ?? []).some(
    (fm) => fm.phaseIndex === (activeSession?.currentPhaseIndex ?? -1),
  );

  const isHalfTime = activeSession
    ? isHalfTimePhase(activeSession, activeSession.currentPhaseIndex)
    : false;

  const isLastPhase = activeSession
    ? activeSession.currentPhaseIndex >= activeSession.phases.length - 1
    : false;

  // Reset overlay when session changes
  useEffect(() => {
    setShowInsightOverlay(false);
  }, [activeSession?.id]);

  // ── Store action stubs (TODO: replace with real store actions) ─────────────
  // TODO: Wire to gameStore session actions

  const handleBegin = useCallback(() => {
    // TODO: Wire — call gameStore.advanceSessionPhase() or startSession action
  }, []);

  const handleAdvancePhase = useCallback(() => {
    // TODO: Wire — call gameStore.advanceSessionPhase()
  }, []);

  const handleAllocateFocus = useCallback((playerId: string, lens: LensType) => {
    // TODO: Wire — call gameStore.allocateSessionFocus(playerId, lens)
  }, []);

  const handleRemoveFocus = useCallback((playerId: string) => {
    // TODO: Wire — call gameStore.removeSessionFocus(playerId)
  }, []);

  const handleFlagMoment = useCallback(
    (momentId: string, reaction: SessionFlaggedMoment["reaction"]) => {
      // TODO: Wire — call gameStore.flagSessionMoment(momentId, reaction)
    },
    [],
  );

  const handleCompleteReflection = useCallback(() => {
    // TODO: Wire — call gameStore.completeSession() or equivalent
  }, []);

  const handleEndSession = useCallback(() => {
    // TODO: Wire — call gameStore.endSession()
  }, []);

  const handleContinue = useCallback(() => {
    // TODO: Wire — call gameStore.endSession() / navigate away
  }, []);

  // ── Guard ──────────────────────────────────────────────────────────────────
  if (!activeSession) return null;

  const { state, mode } = activeSession;
  const ModeIcon = MODE_ICONS[mode];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <GameLayout>
      <div className="relative flex h-full flex-col">
        <ScreenBackground src="/images/backgrounds/match-atmosphere.png" opacity={0.85} />

        <div className="relative z-10 flex flex-1 flex-col min-h-0">

          {/* ── Top info bar ────────────────────────────────────────────── */}
          <div className="shrink-0 border-b border-[#27272a] bg-[#0c0c0c] px-4 py-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ModeIcon size={14} className="text-emerald-400 shrink-0" aria-hidden="true" />
                <span className="text-sm font-semibold text-zinc-200">
                  {MODE_LABELS[mode]}
                </span>
                <Badge variant="secondary" className="text-[10px] capitalize">
                  {activeSession.specialization}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                {state === "active" && currentPhase && (
                  <>
                    <Badge variant="outline" className="tabular-nums text-xs">
                      {mode === "fullObservation"
                        ? `${currentPhase.minute}'`
                        : `Step ${currentPhase.minute}`}
                    </Badge>
                    <Badge variant="secondary" className="text-xs tabular-nums">
                      {activeSession.currentPhaseIndex + 1} / {activeSession.phases.length}
                    </Badge>
                    {isHalfTime && (
                      <Badge variant="warning" className="text-xs">
                        Half Time
                      </Badge>
                    )}
                  </>
                )}
                <Badge
                  variant={
                    state === "complete"
                      ? "success"
                      : state === "reflection"
                        ? "warning"
                        : "outline"
                  }
                  className="text-xs capitalize"
                >
                  {state}
                </Badge>
              </div>
            </div>
            {state === "active" && (
              <p className="mt-0.5 text-[11px] text-zinc-500 capitalize">
                {activeSession.activityType.replace(/([A-Z])/g, " $1").trim()}
                {activeSession.venueAtmosphere?.weather
                  ? ` · ${activeSession.venueAtmosphere.weather}`
                  : ""}
              </p>
            )}
          </div>

          {/* ── State-machine body ──────────────────────────────────────── */}

          {state === "setup" && (
            <SetupView session={activeSession} onBegin={handleBegin} />
          )}

          {state === "reflection" && (
            <ReflectionView session={activeSession} onComplete={handleCompleteReflection} />
          )}

          {state === "complete" && (
            <CompleteView session={activeSession} onContinue={handleContinue} />
          )}

          {state === "active" && currentPhase && (
            <div className="flex flex-1 overflow-hidden">

              {/* ── Left: Phase content (60%) ───────────────────────────── */}
              <div className="flex flex-col flex-1 min-w-0 overflow-hidden">

                {/* Phase description banner */}
                <div className="shrink-0 border-b border-[#27272a] bg-[#0f0f0f] px-4 py-2">
                  <p className="text-xs text-zinc-400 leading-snug">
                    {currentPhase.description || "Observing…"}
                  </p>
                </div>

                {/* Atmosphere event banner */}
                {currentPhase.atmosphereEvent && (
                  <div
                    className="shrink-0 border-b border-amber-500/30 bg-amber-500/5 px-4 py-2"
                    role="status"
                    aria-live="polite"
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle
                        size={13}
                        className="text-amber-400 mt-0.5 shrink-0"
                        aria-hidden="true"
                      />
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500 mr-2">
                          Atmosphere Event
                        </span>
                        <span className="text-xs text-amber-200">
                          {currentPhase.atmosphereEvent.description}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Chaos indicator (subtle) */}
                {activeSession.venueAtmosphere && (
                  <div className="shrink-0 px-4 py-1.5 flex items-center gap-2 border-b border-[#27272a]">
                    <span className="text-[10px] text-zinc-600">Observation clarity</span>
                    <div className="flex-1 h-1 bg-[#27272a] rounded-full overflow-hidden max-w-[80px]">
                      <div
                        className="h-full rounded-full bg-emerald-500/60"
                        style={{
                          width: `${Math.round((1 - activeSession.venueAtmosphere.chaosLevel) * 100)}%`,
                        }}
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                )}

                {/* Phase content — scrollable */}
                <div className="flex-1 min-h-0 overflow-y-auto p-4">
                  <PhaseContent
                    phase={currentPhase}
                    session={activeSession}
                    flaggedMomentIds={flaggedMomentIds}
                    hasPhaseFlag={hasPhaseFlag}
                    onFlagMoment={handleFlagMoment}
                  />
                </div>
              </div>

              {/* ── Right sidebar: Focus panel (40%) ────────────────────── */}
              <div className="w-72 shrink-0 border-l border-[#27272a] bg-[#0c0c0c] flex flex-col overflow-hidden">

                {/* Focus panel (only for modes with tokens) */}
                {activeSession.focusTokens.total > 0 ? (
                  <FocusPanel
                    session={activeSession}
                    onAllocateFocus={handleAllocateFocus}
                    onRemoveFocus={handleRemoveFocus}
                  />
                ) : (
                  <div className="flex-1 overflow-y-auto p-4">
                    <p className="text-xs text-zinc-600 text-center py-8">
                      No focus tokens in this session mode.
                    </p>
                  </div>
                )}

                {/* Insight action button */}
                {activeSession.insightPointsEarned > 0 && (
                  <div className="shrink-0 border-t border-[#27272a] px-4 py-2">
                    <button
                      onClick={() => setShowInsightOverlay(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs font-medium text-amber-400 transition hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400"
                      aria-label="Use Insight action"
                    >
                      <Zap size={12} aria-hidden="true" />
                      Use Insight
                      <span className="ml-auto tabular-nums">
                        {activeSession.insightPointsEarned} IP
                      </span>
                    </button>
                  </div>
                )}

                {/* Flagged moments count */}
                {activeSession.flaggedMoments.length > 0 && (
                  <div className="shrink-0 border-t border-[#27272a] px-4 py-2">
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <Flag size={11} className="text-amber-400" aria-hidden="true" />
                      <span>
                        {activeSession.flaggedMoments.length} moment
                        {activeSession.flaggedMoments.length !== 1 ? "s" : ""} flagged
                      </span>
                    </div>
                  </div>
                )}

                {/* Advance / End buttons — pinned to bottom */}
                <div className="shrink-0 border-t border-[#27272a] p-4 space-y-2">
                  {isLastPhase ? (
                    <Button className="w-full" onClick={handleAdvancePhase}>
                      <Flag size={14} className="mr-2" aria-hidden="true" />
                      Go to Reflection
                    </Button>
                  ) : (
                    <Button className="w-full" onClick={handleAdvancePhase}>
                      <ChevronRight size={14} className="mr-2" aria-hidden="true" />
                      Next Phase
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-zinc-500"
                    onClick={handleEndSession}
                  >
                    End Session Early
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ── Insight overlay ─────────────────────────────────────────── */}
          {showInsightOverlay && (
            <div
              className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              aria-label="Insight Actions"
            >
              <div className="w-full max-w-md rounded-lg border border-[#27272a] bg-[#0c0c0c] p-6 shadow-2xl mx-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Zap size={14} className="text-amber-400" aria-hidden="true" />
                    Insight Actions
                  </h3>
                  <button
                    onClick={() => setShowInsightOverlay(false)}
                    className="rounded p-0.5 text-zinc-600 hover:text-zinc-300 transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400"
                    aria-label="Close insight panel"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
                <p className="text-xs text-zinc-400 mb-4">
                  {/* TODO: Wire to gameStore.useInsight(actionId) for available insight actions */}
                  Available:{" "}
                  <span className="text-amber-400 font-semibold">
                    {activeSession.insightPointsEarned} IP
                  </span>
                </p>
                <p className="text-xs text-zinc-600 text-center py-4">
                  Insight actions will appear here once wired to gameStore.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                  onClick={() => setShowInsightOverlay(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>
    </GameLayout>
  );
}
