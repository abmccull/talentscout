"use client";

import {
  memo,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
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
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type {
  ObservationSession,
  SessionPhase,
  PlayerMoment,
  LensType,
  SessionFlaggedMoment,
} from "@/engine/observation/types";
import { MODE_FLAGGED_SHORT_LABEL } from "@/engine/observation/types";
import type { InsightActionId } from "@/engine/insight/types";
import {
  createInsightState,
  getInsightActionAvailability,
} from "@/engine/insight/insight";
import { getSessionResult, isHalfTimePhase } from "@/engine/observation/session";
import type { ReflectionResult } from "@/engine/observation/reflection";
import { ReflectionScreen } from "./ReflectionScreen";
import {
  InvestigationContent,
  AnalysisContent,
  QuickInteractionContent,
} from "./ObservationPhase";
import { ObservationPitch } from "./observation/ObservationPitch";
import { useAudio } from "@/lib/audio/useAudio";
import { isOpeningDiscoverySession } from "@/engine/youth/openingCase";

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
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
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
                <Badge variant="outline" className="py-0 text-[10px] text-zinc-400">
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
                className="flex h-11 w-11 items-center justify-center rounded text-zinc-400 transition hover:text-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
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
                    className={`flex min-h-11 items-center gap-1.5 rounded px-2 py-1.5 text-xs transition hover:bg-[#27272a] ${config.className}`}
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

// (DialogueCard, DataPointCard, StrategicChoiceCard removed —
//  interactive equivalents imported from ObservationPhase.tsx)

// -- PhaseContent ------------------------------------------------------------

interface PhaseContentProps {
  phase: SessionPhase;
  session: ObservationSession;
  flaggedMomentIds: Set<string>;
  hasPhaseFlag: boolean;
  onFlagMoment: (momentId: string, reaction: SessionFlaggedMoment["reaction"]) => void;
  onDialogueChoice: (nodeId: string, optionId: string) => void;
  onDataPointSelect: (pointId: string) => void;
  onStrategicChoice: (choiceId: string) => void;
}

const PhaseContent = memo(function PhaseContent({
  phase,
  session,
  flaggedMomentIds,
  hasPhaseFlag,
  onFlagMoment,
  onDialogueChoice,
  onDataPointSelect,
  onStrategicChoice,
}: PhaseContentProps) {
  const playerMap = new Map(session.players.map((p) => [p.playerId, p]));

  // Full Observation: player moments
  if (session.mode === "fullObservation") {
    return (
      <div className="space-y-2">
        {phase.moments.length === 0 ? (
          <p className="py-6 text-center text-xs text-zinc-400">No moments observed in this phase.</p>
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

  // Investigation: interactive dialogue nodes
  if (session.mode === "investigation") {
    if ((phase.dialogueNodes ?? []).length === 0) {
      return <p className="py-6 text-center text-xs text-zinc-400">No dialogue in this phase.</p>;
    }
    return (
      <InvestigationContent
        nodes={phase.dialogueNodes!}
        onDialogueChoice={onDialogueChoice}
        relationshipScore={session.sourceRelationshipScore}
        selectedOptionIds={phase.selectedDialogueOptionIds}
        resolutions={phase.dialogueChoiceResolutions}
        sourceContactName={session.sourceContactName}
      />
    );
  }

  // Analysis: interactive data points
  if (session.mode === "analysis") {
    if ((phase.dataPoints ?? []).length === 0) {
      return <p className="py-6 text-center text-xs text-zinc-400">No data points in this phase.</p>;
    }
    return (
      <AnalysisContent
        dataPoints={phase.dataPoints!}
        onDataPointSelect={onDataPointSelect}
        selectedPointId={phase.selectedDataPointId}
        resolution={phase.dataPointResolution}
      />
    );
  }

  // Quick Interaction: interactive strategic choices
  if ((phase.choices ?? []).length === 0) {
    return <p className="py-6 text-center text-xs text-zinc-400">No choices available.</p>;
  }
  return (
    <QuickInteractionContent
      choices={phase.choices!}
      selectedChoiceId={phase.selectedChoiceId}
      onStrategicChoice={onStrategicChoice}
    />
  );
});

// -- FocusPanel --------------------------------------------------------------

interface FocusPanelProps {
  session: ObservationSession;
  onAllocateFocus: (playerId: string, lens: LensType) => void;
  onRemoveFocus: (playerId: string) => void;
  selectedPlayerId?: string | null;
  focusSelectedLensPicker?: boolean;
}

const FocusPanel = memo(function FocusPanel({
  session,
  onAllocateFocus,
  onRemoveFocus,
  selectedPlayerId,
  focusSelectedLensPicker = false,
}: FocusPanelProps) {
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const firstSelectedLensRef = useRef<HTMLButtonElement>(null);
  const { focusTokens, players } = session;

  const focusedPlayers = players.filter((p) => p.isFocused);
  const unfocusedPlayers = players.filter((p) => !p.isFocused);
  const canAllocate = focusTokens.available > 0;

  useEffect(() => {
    if (!selectedPlayerId) return;
    const selectedPlayer = players.find(
      (player) => player.playerId === selectedPlayerId,
    );
    if (selectedPlayer && !selectedPlayer.isFocused && canAllocate) {
      setPendingFocusId(selectedPlayerId);
    }
  }, [canAllocate, players, selectedPlayerId]);

  useEffect(() => {
    if (!focusSelectedLensPicker || pendingFocusId !== selectedPlayerId) return;
    const frame = requestAnimationFrame(() => {
      firstSelectedLensRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusSelectedLensPicker, pendingFocusId, selectedPlayerId]);

  const handleConfirmFocus = useCallback(
    (playerId: string, lens: LensType) => {
      onAllocateFocus(playerId, lens);
      setPendingFocusId(null);
    },
    [onAllocateFocus],
  );

  return (
    <div
      className="flex-1 overflow-y-auto p-4 space-y-4"
      data-tutorial-id="observation-focus-panel"
    >
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
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Active Focus
          </h4>
          <div className="space-y-2">
            {focusedPlayers.map((player) => {
              const lens = player.currentLens ?? "general";
              return (
                <div
                  key={player.playerId}
                  className={`rounded-md border ${LENS_BORDER[lens]} bg-[#141414] p-3 ${
                    player.playerId === selectedPlayerId
                      ? "ring-1 ring-emerald-400/70"
                      : ""
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-medium text-zinc-200">{player.name}</p>
                      <p className="text-xs text-zinc-400">{player.position}</p>
                    </div>
                    <button
                      onClick={() => onRemoveFocus(player.playerId)}
                      className="flex h-11 w-11 items-center justify-center rounded text-zinc-400 transition hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                      aria-label={`Remove focus from ${player.name}`}
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  </div>
                  <div
                    className="flex min-h-9 items-center justify-between rounded border border-[#27272a] bg-[#0a0a0a] px-2 py-1.5 text-xs"
                    aria-label={`${lens} observation lens locked for ${player.name}`}
                  >
                    <span className={`font-medium capitalize ${LENS_COLORS[lens]}`}>{lens}</span>
                    <span className="text-[10px] text-zinc-400">Locked for this focus</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Available players to focus */}
      {unfocusedPlayers.length > 0 && (
        <div>
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Players in Session
          </h4>
          <div className="space-y-1">
            {unfocusedPlayers.map((player) => {
              const isPending = pendingFocusId === player.playerId;
              return (
                <div key={player.playerId}>
                  <div className={`flex min-h-11 items-center justify-between rounded px-2 py-1.5 text-xs text-zinc-400 hover:bg-[#141414] transition motion-reduce:transition-none ${
                    player.playerId === selectedPlayerId
                      ? "bg-emerald-500/10 ring-1 ring-emerald-400/30"
                      : ""
                  }`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0"
                        aria-hidden="true"
                      />
                      <span className="truncate">{player.name}</span>
                      <span className="shrink-0 text-zinc-400">{player.position}</span>
                    </div>
                    {canAllocate && (
                      <button
                        onClick={() =>
                          setPendingFocusId(isPending ? null : player.playerId)
                        }
                        className="ml-2 min-h-10 shrink-0 rounded px-2.5 py-1 text-[10px] text-emerald-400 transition motion-reduce:transition-none hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400"
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
                      <p className="mb-1.5 text-[10px] text-zinc-400">Select lens for {player.name}</p>
                      {LENS_KEYS.map((lens) => (
                        <button
                          key={lens}
                          ref={
                            player.playerId === selectedPlayerId && lens === LENS_KEYS[0]
                              ? firstSelectedLensRef
                              : undefined
                          }
                          onClick={() => handleConfirmFocus(player.playerId, lens)}
                          className={`flex min-h-11 w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition motion-reduce:transition-none hover:bg-[#27272a] ${LENS_COLORS[lens]}`}
                          aria-label={`Use ${lens} lens for ${player.name}`}
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
        <p className="py-4 text-center text-xs text-zinc-400">
          No focus tokens remaining this half.
        </p>
      )}
    </div>
  );
});

// -- InvestigationSidebar ---------------------------------------------------

interface InvestigationSidebarProps {
  session: ObservationSession;
}

const InvestigationSidebar = memo(function InvestigationSidebar({
  session,
}: InvestigationSidebarProps) {
  const primaryPlayer = session.players[0];
  const speaker = session.players[1];
  const totalPhases = session.phases.length;
  const completedPhases = session.currentPhaseIndex + 1;
  const progressPct = Math.round((completedPhases / totalPhases) * 100);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* Conversation context */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
          <MessageSquare size={14} className="text-emerald-500" aria-hidden="true" />
          Conversation
        </h3>
        {primaryPlayer && (
          <div className="rounded-md border border-[#27272a] bg-[#141414] p-3 mb-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              About
            </p>
            <p className="text-sm font-medium text-zinc-200">{primaryPlayer.name}</p>
            <p className="text-xs text-zinc-400">{primaryPlayer.position}</p>
          </div>
        )}
        {speaker && (
          <div className="rounded-md border border-[#27272a] bg-[#141414] p-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Speaking with
            </p>
            <p className="text-sm font-medium text-zinc-200">{speaker.name}</p>
          </div>
        )}
      </div>

      {/* Dialogue progress */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Progress
          </span>
          <span className="text-xs text-zinc-400 tabular-nums">
            {completedPhases}/{totalPhases}
          </span>
        </div>
        <div
          className="h-1.5 bg-[#27272a] rounded-full overflow-hidden"
          role="progressbar"
          aria-valuenow={completedPhases}
          aria-valuemax={totalPhases}
          aria-label="Dialogue progress"
        >
          <div
            className="h-full rounded-full bg-emerald-500/70 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Hypotheses formed */}
      {session.hypotheses.length > 0 && (
        <div>
          <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Hypotheses Formed
          </h4>
          <div className="space-y-1.5">
            {session.hypotheses.map((hyp) => (
              <div
                key={hyp.id}
                className="rounded border border-[#27272a] bg-[#141414] px-3 py-2"
              >
                <p className="text-xs text-zinc-300 leading-snug">{hyp.text}</p>
                <p className="mt-0.5 text-[10px] capitalize text-zinc-400">{hyp.domain}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Insight earned */}
      <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-center">
        <p className="text-lg font-bold text-amber-400 tabular-nums">
          {session.insightPointsEarned}
        </p>
        <p className="text-[10px] text-zinc-400">Insight Earned</p>
      </div>
    </div>
  );
});

// -- MinimalInfoSidebar ---------------------------------------------------

interface MinimalInfoSidebarProps {
  session: ObservationSession;
}

const MinimalInfoSidebar = memo(function MinimalInfoSidebar({
  session,
}: MinimalInfoSidebarProps) {
  const primaryPlayer = session.players[0];

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
          {session.mode === "analysis" ? (
            <BarChart3 size={14} className="text-blue-400" aria-hidden="true" />
          ) : (
            <Shuffle size={14} className="text-purple-400" aria-hidden="true" />
          )}
          {session.mode === "analysis" ? "Data Analysis" : "Quick Decision"}
        </h3>
        {primaryPlayer && (
          <div className="rounded-md border border-[#27272a] bg-[#141414] p-3">
            <p className="text-sm font-medium text-zinc-200">{primaryPlayer.name}</p>
            <p className="text-xs text-zinc-400">{primaryPlayer.position}</p>
          </div>
        )}
      </div>

      {/* Insight earned */}
      <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-center">
        <p className="text-lg font-bold text-amber-400 tabular-nums">
          {session.insightPointsEarned}
        </p>
        <p className="text-[10px] text-zinc-400">Insight Earned</p>
      </div>
    </div>
  );
});

// -- SetupView ---------------------------------------------------------------

interface SetupViewProps {
  session: ObservationSession;
  onBegin: () => void;
}

function formatSituationLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

const SetupView = memo(function SetupView({ session, onBegin }: SetupViewProps) {
  const { venueAtmosphere, players, mode, situation } = session;
  const ModeIcon = MODE_ICONS[mode];
  const isOpeningDiscovery = isOpeningDiscoverySession(session);
  const veteranPrologue = useGameStore((state) => state.gameState?.veteranPrologue);
  const lead = players[0];

  if (
    isOpeningDiscovery
    && lead
    && veteranPrologue
    && veteranPrologue.activityInstanceId === session.activityInstanceId
  ) {
    const background = veteranPrologue.templateId === "data-anomaly"
      ? "/images/backgrounds/reports-desk.png"
      : veteranPrologue.templateId === "international-limited-access"
        ? "/images/backgrounds/world-map.png"
        : veteranPrologue.templateId === "rival-already-watching"
          ? "/images/backgrounds/rivals-binoculars.png"
          : mode === "investigation"
            ? "/images/backgrounds/network-lounge.png"
            : "/images/backgrounds/match-atmosphere.png";
    const beginLabel = mode === "analysis"
      ? "Test the signal"
      : mode === "investigation"
        ? "Start the investigation"
        : "Watch the live evidence";

    return (
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4 sm:p-8">
        <ScreenBackground src={background} opacity={0.38} />
        <div className="relative z-10 w-full max-w-3xl rounded-2xl border border-emerald-300/20 bg-[#0a0f0c]/95 p-5 shadow-2xl backdrop-blur sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-300/10">
              <ModeIcon size={25} className="text-emerald-300" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                {veteranPrologue.venueLabel} · {MODE_LABELS[mode]}
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">
                {veteranPrologue.title}
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-300">
                {veteranPrologue.premise}
              </p>
              <blockquote className="mt-4 rounded-xl border-l-2 border-amber-300/60 bg-amber-300/[0.06] px-4 py-3 text-sm italic leading-6 text-amber-50/90">
                “{veteranPrologue.pressure}”
                <footer className="mt-1 text-xs not-italic text-amber-200/70">
                  — {veteranPrologue.sourceContactName}
                </footer>
              </blockquote>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-400">Your lead</p>
                  <p className="mt-1 text-sm font-semibold text-white">{lead.name}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-400">Your deadline</p>
                  <p className="mt-1 text-sm font-semibold text-white">{veteranPrologue.deadline}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-400">Who is in conflict</p>
                  <p className="mt-1 text-sm font-semibold text-white">{veteranPrologue.stakeholderConflict}</p>
                </div>
              </div>
              <Button
                onClick={onBegin}
                size="lg"
                className="mt-6 w-full gap-2 sm:w-auto"
                data-tutorial-id="observation-begin-session"
              >
                <Play size={16} aria-hidden="true" />
                {beginLabel}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isOpeningDiscovery && lead) {
    return (
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4 sm:p-8">
        <ScreenBackground src="/images/backgrounds/match-atmosphere.png" opacity={0.38} />
        <div className="relative z-10 w-full max-w-3xl rounded-2xl border border-emerald-300/20 bg-[#0a0f0c]/95 p-5 shadow-2xl backdrop-blur sm:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-300/10">
              <Binoculars size={25} className="text-emerald-300" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">10:42 · Local school ground</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">The match started early.</h2>
              <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-300">
                No academy scout is here yet. {lead.name}, a {lead.position}, was mentioned quietly—but the source only saw one previous match. You have three phases to decide whether the name belongs in your notebook.
              </p>
              <blockquote className="mt-4 rounded-xl border-l-2 border-amber-300/60 bg-amber-300/[0.06] px-4 py-3 text-sm italic leading-6 text-amber-50/90">
                “Don&apos;t ask me if he&apos;s a star. I&apos;m telling you nobody important has written the name down yet.”
                <footer className="mt-1 text-xs not-italic text-amber-200/70">
                  — {session.sourceContactName ?? "Tommy Reyes"}, 14 minutes ago
                </footer>
              </blockquote>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-400">Your lead</p>
                  <p className="mt-1 text-sm font-semibold text-white">{lead.name}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-400">Your constraint</p>
                  <p className="mt-1 text-sm font-semibold text-white">3 observation beats</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-400">What is at stake</p>
                  <p className="mt-1 text-sm font-semibold text-white">Being first, not being certain</p>
                </div>
              </div>
              <Button
                onClick={onBegin}
                size="lg"
                className="mt-6 w-full gap-2 sm:w-auto"
                data-tutorial-id="observation-begin-session"
              >
                <Play size={16} aria-hidden="true" />
                Watch the match
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-4 text-center sm:p-8">
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
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
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

      {situation && (
        <div className="mb-4 w-full max-w-sm rounded-lg border border-sky-500/20 bg-sky-500/5 p-4 text-left">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-sky-300">
            What this situation can reveal
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded bg-black/20 p-2">
              <p className="text-[9px] text-zinc-500">Level</p>
              <p className="mt-0.5 text-[10px] font-medium text-white">{formatSituationLabel(situation.competitionLevel)}</p>
            </div>
            <div className="rounded bg-black/20 p-2">
              <p className="text-[9px] text-zinc-500">Stakes</p>
              <p className="mt-0.5 text-[10px] font-medium text-white">{formatSituationLabel(situation.stakes)}</p>
            </div>
            <div className="rounded bg-black/20 p-2">
              <p className="text-[9px] text-zinc-500">Tactical frame</p>
              <p className="mt-0.5 text-[10px] font-medium text-white">{formatSituationLabel(situation.tacticalFrame)}</p>
            </div>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-zinc-400">
            Evidence uncertainty ×{situation.uncertaintyMultiplier.toFixed(2)} · Misleading-sample risk {Math.round(situation.misleadingSignalRisk * 100)}%
          </p>
          {situation.biasWarnings[0] && (
            <p className="mt-1.5 text-[10px] leading-relaxed text-amber-200/80">
              Watch for: {situation.biasWarnings[0]}
            </p>
          )}
        </div>
      )}

      {players.length > 0 && (
        <div className="mb-6 max-w-sm w-full rounded-lg border border-[#27272a] bg-[#0f0f0f] p-4 text-left">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Players in Session ({players.length})
          </p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {players.map((p) => (
              <div key={p.playerId} className="flex items-center justify-between text-xs">
                <span className="text-zinc-300">{p.name}</span>
                <span className="text-zinc-400">{p.position}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Button
        onClick={onBegin}
        size="lg"
        className="gap-2"
        data-tutorial-id="observation-begin-session"
      >
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
  const lastReflectionResult = useGameStore((s) => s.lastReflectionResult) as ReflectionResult | null;

  const handleAddHypothesis = useCallback((playerId: string, text: string, domain: string) => {
    useGameStore.getState().addSessionHypothesis(playerId, text, domain);
  }, []);

  const handleAddNote = useCallback((note: string) => {
    useGameStore.getState().addSessionNote(note);
  }, []);

  // If we have a full reflection result, render the dedicated ReflectionScreen
  if (lastReflectionResult) {
    return (
      <div
        className="flex-1 overflow-y-auto p-4 sm:p-6"
        data-tutorial-id="observation-session-controls"
      >
        <div className="mx-auto max-w-2xl">
          <ReflectionScreen
            session={session}
            reflectionResult={lastReflectionResult}
            onAddHypothesis={handleAddHypothesis}
            onAddNote={handleAddNote}
            onComplete={onComplete}
          />
        </div>
      </div>
    );
  }

  // Fallback: minimal reflection view when no reflection result is available
  const result = getSessionResult(session);
  return (
    <div
      className="flex-1 overflow-y-auto p-4 sm:p-6"
      data-tutorial-id="observation-session-controls"
    >
      <div className="mx-auto max-w-2xl">
        <h2 className="text-lg font-semibold text-zinc-100 mb-1">Session Reflection</h2>
        <p className="text-sm text-zinc-400 mb-6">
          Review what you observed before completing the session.
        </p>

        {/* Insight summary */}
        <div className="mb-6 grid grid-cols-1 gap-3 min-[430px]:grid-cols-3">
          <div className="rounded-lg border border-[#27272a] bg-[#0f0f0f] p-3 text-center">
            <p className="text-xl font-bold text-emerald-400 tabular-nums">
              {result.insightPointsEarned}
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-400">Insight Points</p>
          </div>
          <div className="rounded-lg border border-[#27272a] bg-[#0f0f0f] p-3 text-center">
            <p className="text-xl font-bold text-amber-400 tabular-nums">
              {result.flaggedMoments.length}
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-400">{MODE_FLAGGED_SHORT_LABEL[result.mode]}</p>
          </div>
          <div className="rounded-lg border border-[#27272a] bg-[#0f0f0f] p-3 text-center">
            <p className="text-xl font-bold text-zinc-200 capitalize">
              {result.qualityTier}
            </p>
            <p className="mt-0.5 text-[10px] text-zinc-400">Quality Tier</p>
          </div>
        </div>

        {/* Session Notes */}
        <SessionNoteInput />

        <Button onClick={onComplete} className="w-full">
          Complete Session
        </Button>
      </div>
    </div>
  );
});

// -- SessionNoteInput --------------------------------------------------------

function SessionNoteInput() {
  const [note, setNote] = useState("");
  const addNote = useCallback((text: string) => {
    if (text.trim()) {
      useGameStore.getState().addSessionNote(text.trim());
    }
  }, []);

  return (
    <div className="mb-6">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
        Session Notes
      </h3>
      <div className="flex gap-2">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && note.trim()) {
              addNote(note);
              setNote("");
            }
          }}
          placeholder="Record an observation..."
          className="flex-1 rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:border-amber-500/50 focus:outline-none"
        />
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={!note.trim()}
          onClick={() => { addNote(note); setNote(""); }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

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
          <p className="mt-0.5 text-[10px] text-zinc-400">Insight Points</p>
        </div>
        <div className="rounded-lg border border-[#27272a] bg-[#0f0f0f] p-3 text-center">
          <p className="text-xl font-bold text-amber-400 tabular-nums">
            {result.focusedPlayerIds.length}
          </p>
          <p className="mt-0.5 text-[10px] text-zinc-400">Players Observed</p>
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
  const activeSession = useGameStore((s) => s.activeSession);
  const gameState = useGameStore((s) => s.gameState);
  const { playSFX } = useAudio();

  // Local UI state — all hooks must be called before any early return
  const [showInsightOverlay, setShowInsightOverlay] = useState(false);
  const [selectedPitchPlayerId, setSelectedPitchPlayerId] = useState<string | null>(null);
  const [showMobileFocus, setShowMobileFocus] = useState(false);
  const mobileFocusSheetRef = useRef<HTMLDivElement>(null);
  const mobileFocusToggleRef = useRef<HTMLButtonElement>(null);
  const insightDialogRef = useRef<HTMLDivElement>(null);
  const insightCloseRef = useRef<HTMLButtonElement>(null);
  const insightReturnFocusRef = useRef<HTMLButtonElement | null>(null);

  // Derived data — optional-chain safely when activeSession is null
  const currentPhase: SessionPhase | undefined =
    activeSession?.phases[activeSession.currentPhaseIndex];

  const flaggedMomentIds = useMemo(
    () => new Set<string>(
      activeSession?.flaggedMoments.map((flagged) => flagged.moment.id) ?? [],
    ),
    [activeSession?.flaggedMoments],
  );
  const openingBreakthroughFlagged = Boolean(
    gameState?.openingCase
    && activeSession?.flaggedMoments.some(
      (flagged) => flagged.moment.playerId === gameState.openingCase?.playerId
        && flagged.moment.isStandout,
    ),
  );
  const openingPhaseRequiresFlag = Boolean(
    isOpeningDiscoverySession(activeSession)
    && activeSession?.mode === "fullObservation"
    && gameState?.veteranPrologue?.activityInstanceId !== activeSession?.activityInstanceId
    && activeSession?.currentPhaseIndex === 1
    && !openingBreakthroughFlagged,
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
  const insightState = (
    gameState?.scout.insightState ?? createInsightState()
  );
  const insightActions = gameState && activeSession
    ? getInsightActionAvailability(
        insightState,
        gameState.scout,
        activeSession.mode,
      )
    : [];
  const openingTargetId = isOpeningDiscoverySession(activeSession)
    ? activeSession?.players[0]?.playerId ?? null
    : null;

  // Reset overlay when session changes
  useEffect(() => {
    setShowInsightOverlay(false);
    setSelectedPitchPlayerId(
      openingTargetId,
    );
    setShowMobileFocus(false);
  }, [activeSession?.id, openingTargetId]);

  const closeInsightOverlay = useCallback(() => {
    setShowInsightOverlay(false);
    requestAnimationFrame(() => {
      insightReturnFocusRef.current?.focus({ preventScroll: true });
    });
  }, []);

  const openInsightOverlay = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    insightReturnFocusRef.current = event.currentTarget;
    setShowInsightOverlay(true);
  }, []);

  useEffect(() => {
    if (!showInsightOverlay) return;
    requestAnimationFrame(() => insightCloseRef.current?.focus({ preventScroll: true }));
  }, [showInsightOverlay]);

  const handleInsightDialogKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeInsightOverlay();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = insightDialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, [closeInsightOverlay]);

  // ── Store actions ────────────────────────────────────────────────────────

  const handleBegin = useCallback(() => {
    playSFX("whistle");
    useGameStore.getState().beginSession();
  }, [playSFX]);

  const handleAdvancePhase = useCallback(() => {
    useGameStore.getState().advanceSessionPhase();
  }, []);

  const handleAllocateFocus = useCallback((playerId: string, lens: LensType) => {
    playSFX("click");
    useGameStore.getState().allocateSessionFocus(playerId, lens);
    requestAnimationFrame(() => {
      if (!mobileFocusSheetRef.current?.getClientRects().length) return;
      mobileFocusSheetRef.current
        .querySelector<HTMLButtonElement>('button[aria-label="Close focus controls"]')
        ?.focus({ preventScroll: true });
    });
  }, [playSFX]);

  const handleRemoveFocus = useCallback((playerId: string) => {
    useGameStore.getState().removeSessionFocus(playerId);
  }, []);

  const handleFlagMoment = useCallback(
    (momentId: string, reaction: SessionFlaggedMoment["reaction"]) => {
      playSFX("camera-shutter");
      useGameStore.getState().flagSessionMoment(momentId, reaction);
    },
    [playSFX],
  );

  const handlePitchPlayerSelect = useCallback((playerId: string) => {
    playSFX("click");
    setSelectedPitchPlayerId(playerId);
    setShowMobileFocus(true);
  }, [playSFX]);

  const closeMobileFocus = useCallback(() => {
    setShowMobileFocus(false);
    requestAnimationFrame(() => mobileFocusToggleRef.current?.focus({ preventScroll: true }));
  }, []);

  useEffect(() => {
    if (!showMobileFocus) return;
    requestAnimationFrame(() => {
      mobileFocusSheetRef.current
        ?.querySelector<HTMLButtonElement>('button[aria-label="Close focus controls"]')
        ?.focus({ preventScroll: true });
    });
  }, [showMobileFocus]);

  const handleMobileFocusKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMobileFocus();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = mobileFocusSheetRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, [closeMobileFocus]);

  const handleDialogueChoice = useCallback(
    (nodeId: string, optionId: string) => {
      useGameStore.getState().selectDialogueOption(nodeId, optionId);
    },
    [],
  );

  const handleDataPointSelect = useCallback(
    (pointId: string) => {
      useGameStore.getState().selectDataPoint(pointId);
    },
    [],
  );

  const handleStrategicChoice = useCallback(
    (choiceId: string) => {
      useGameStore.getState().selectStrategicChoice(choiceId);
    },
    [],
  );

  const handleCompleteReflection = useCallback(() => {
    useGameStore.getState().endObservationSession();
  }, []);

  const handleEndSession = useCallback(() => {
    useGameStore.getState().endObservationSession();
  }, []);

  const handleContinue = useCallback(() => {
    useGameStore.getState().endObservationSession();
    useGameStore.getState().setScreen("calendar");
  }, []);

  const handleUseInsight = useCallback((actionId: InsightActionId) => {
    const used = useGameStore.getState().useInsight(actionId);
    if (used) closeInsightOverlay();
  }, [closeInsightOverlay]);

  // ── Guard ──────────────────────────────────────────────────────────────────
  if (!activeSession) return null;

  const { state, mode } = activeSession;
  const ModeIcon = MODE_ICONS[mode];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <GameLayout>
      <div className="relative flex min-h-[calc(100dvh-7.5rem)] min-w-0 flex-col overflow-x-hidden pb-20 md:h-full md:min-h-0 md:pb-20 lg:pb-0">
        <ScreenBackground src="/images/backgrounds/match-atmosphere.png" opacity={0.85} />

        <div className="relative z-10 flex flex-1 flex-col min-h-0">

          {/* ── Top info bar ────────────────────────────────────────────── */}
          <div className="shrink-0 border-b border-[#27272a] bg-[#0c0c0c] px-3 py-2.5 sm:px-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <ModeIcon size={14} className="text-emerald-400 shrink-0" aria-hidden="true" />
                <span className="truncate text-sm font-semibold text-zinc-200">
                  {MODE_LABELS[mode]}
                </span>
                <Badge variant="secondary" className="hidden text-[10px] capitalize min-[430px]:inline-flex">
                  {activeSession.specialization}
                </Badge>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
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
              <p className="mt-0.5 text-[11px] capitalize text-zinc-400">
                {activeSession.activityType.replace(/([A-Z])/g, " $1").trim()}
                {mode === "fullObservation" && activeSession.venueAtmosphere?.weather
                  ? ` · ${activeSession.venueAtmosphere.weather}`
                  : ""}
                {activeSession.situation
                  ? ` · ${formatSituationLabel(activeSession.situation.stakes)} stakes · ${formatSituationLabel(activeSession.situation.tacticalFrame)}`
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
            <div
              className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden lg:flex-row lg:overflow-hidden"
              data-testid="active-observation-layout"
            >

              {/* ── Left: Phase content (60%) ───────────────────────────── */}
              <div className="flex min-w-0 flex-none flex-col lg:flex-1 lg:self-stretch lg:overflow-hidden">

                {/* Phase description banner */}
                <div className="shrink-0 border-b border-[#27272a] bg-[#0f0f0f] px-4 py-2">
                  <p className="text-xs text-zinc-400 leading-snug">
                    {currentPhase.description || "Observing…"}
                  </p>
                </div>

                {/* Atmosphere event banner — match modes only */}
                {mode === "fullObservation" && currentPhase.atmosphereEvent && (
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

                {/* Chaos indicator — match modes only */}
                {mode === "fullObservation" && activeSession.venueAtmosphere && (
                  <div className="shrink-0 px-4 py-1.5 flex items-center gap-2 border-b border-[#27272a]">
                    <span className="text-[10px] text-zinc-400">Observation clarity</span>
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
                <div className="min-h-0 flex-none p-3 sm:p-4 lg:flex-1 lg:overflow-y-auto">
                  {mode === "fullObservation" ? (
                    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(420px,1.15fr)_minmax(300px,0.85fr)]">
                      <ObservationPitch
                        session={activeSession}
                        phase={currentPhase}
                        selectedPlayerId={selectedPitchPlayerId}
                        onSelectPlayer={handlePitchPlayerSelect}
                      />
                      <section
                        className="min-w-0"
                        aria-labelledby="observation-evidence-heading"
                        data-tutorial-id="observation-evidence-feed"
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <h2
                            id="observation-evidence-heading"
                            className="text-[10px] font-semibold uppercase tracking-[0.13em] text-zinc-400"
                          >
                            Evidence feed
                          </h2>
                          <span className="text-[10px] text-zinc-400">
                            {currentPhase.moments.length} {currentPhase.moments.length === 1 ? "moment" : "moments"}
                          </span>
                        </div>
                        <PhaseContent
                          phase={currentPhase}
                          session={activeSession}
                          flaggedMomentIds={flaggedMomentIds}
                          hasPhaseFlag={hasPhaseFlag}
                          onFlagMoment={handleFlagMoment}
                          onDialogueChoice={handleDialogueChoice}
                          onDataPointSelect={handleDataPointSelect}
                          onStrategicChoice={handleStrategicChoice}
                        />
                      </section>
                    </div>
                  ) : (
                    <PhaseContent
                      phase={currentPhase}
                      session={activeSession}
                      flaggedMomentIds={flaggedMomentIds}
                      hasPhaseFlag={hasPhaseFlag}
                      onFlagMoment={handleFlagMoment}
                      onDialogueChoice={handleDialogueChoice}
                      onDataPointSelect={handleDataPointSelect}
                      onStrategicChoice={handleStrategicChoice}
                    />
                  )}
                </div>
              </div>

              {/* ── Right sidebar: mode-aware ──────────────────────────── */}
              <aside className="hidden w-72 shrink-0 flex-col overflow-hidden border-l border-[#27272a] bg-[#0c0c0c] lg:flex">

                {/* Sidebar content based on mode */}
                {mode === "fullObservation" ? (
                  <FocusPanel
                    session={activeSession}
                    onAllocateFocus={handleAllocateFocus}
                    onRemoveFocus={handleRemoveFocus}
                    selectedPlayerId={selectedPitchPlayerId}
                  />
                ) : mode === "investigation" ? (
                  <InvestigationSidebar session={activeSession} />
                ) : (
                  <MinimalInfoSidebar session={activeSession} />
                )}

                {/* Insight action button — visible when scout has any IP available */}
                {insightActions.length > 0 && (
                  <div className="shrink-0 border-t border-[#27272a] px-4 py-2">
                    <button
                      onClick={openInsightOverlay}
                      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs font-medium text-amber-400 transition hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                      aria-label="Use Insight action"
                    >
                      <Zap size={12} aria-hidden="true" />
                      Use Insight
                      <span className="ml-auto tabular-nums">
                        {insightState.points} IP
                      </span>
                    </button>
                  </div>
                )}

                {/* Flagged moments count */}
                {activeSession.flaggedMoments.length > 0 && (
                  <div className="shrink-0 border-t border-[#27272a] px-4 py-2">
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <Flag size={11} className="text-amber-400" aria-hidden="true" />
                      <span>
                        {activeSession.flaggedMoments.length} moment
                        {activeSession.flaggedMoments.length !== 1 ? "s" : ""} flagged
                      </span>
                    </div>
                  </div>
                )}

                {/* Advance / End buttons — pinned to bottom */}
                <div
                  className="shrink-0 border-t border-[#27272a] p-4 space-y-2"
                  data-tutorial-id="observation-session-controls"
                >
                  {isLastPhase ? (
                    <Button className="w-full" onClick={handleAdvancePhase}>
                      <Flag size={14} className="mr-2" aria-hidden="true" />
                      Go to Reflection
                    </Button>
                  ) : (
                    <Button className="w-full" onClick={handleAdvancePhase} disabled={openingPhaseRequiresFlag}>
                      <ChevronRight size={14} className="mr-2" aria-hidden="true" />
                      {openingPhaseRequiresFlag ? "Flag the standout moment" : "Next Phase"}
                    </Button>
                  )}
                  {!isOpeningDiscoverySession(activeSession) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-zinc-400"
                      onClick={handleEndSession}
                    >
                      End Session Early
                    </Button>
                  )}
                </div>
              </aside>

              {/* Mobile context sheet: stays in the single vertical flow. */}
              <section className="border-t border-[#27272a] bg-[#0c0c0c] lg:hidden">
                <button
                  ref={mobileFocusToggleRef}
                  type="button"
                  onClick={() => setShowMobileFocus((open) => !open)}
                  className="flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400"
                  aria-expanded={showMobileFocus}
                  aria-controls="mobile-observation-context"
                >
                  <SlidersHorizontal size={15} className="shrink-0 text-emerald-400" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-zinc-200">
                      {mode === "fullObservation" ? "Focus targets and lenses" : "Session context"}
                    </span>
                    <span className="block truncate text-[10px] text-zinc-400">
                      {mode === "fullObservation"
                        ? selectedPitchPlayerId
                          ? `${activeSession.players.find((player) => player.playerId === selectedPitchPlayerId)?.name ?? "Player"} selected`
                          : `${activeSession.focusTokens.available}/${activeSession.focusTokens.total} focus tokens remaining`
                        : "Open supporting information"}
                    </span>
                  </span>
                  {showMobileFocus ? (
                    <ChevronUp size={16} className="shrink-0 text-zinc-400" aria-hidden="true" />
                  ) : (
                    <ChevronDown size={16} className="shrink-0 text-zinc-400" aria-hidden="true" />
                  )}
                </button>
              </section>

              {showMobileFocus && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-40 cursor-default bg-black/60 backdrop-blur-[1px] lg:hidden"
                    onClick={closeMobileFocus}
                    aria-label="Dismiss focus sheet backdrop"
                    tabIndex={-1}
                  />
                  <div
                    ref={mobileFocusSheetRef}
                    id="mobile-observation-context"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="mobile-observation-context-title"
                    onKeyDown={handleMobileFocusKeyDown}
                    className="fixed inset-x-3 bottom-[calc(8.75rem+env(safe-area-inset-bottom))] z-50 flex max-h-[56dvh] flex-col overflow-hidden rounded-2xl border border-emerald-300/20 bg-[#0b0f0d] shadow-[0_24px_70px_rgba(0,0,0,0.65)] md:bottom-20 md:left-[15.75rem] md:right-3 lg:hidden"
                  >
                    <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                      <div className="min-w-0">
                        <h2 id="mobile-observation-context-title" className="text-sm font-semibold text-zinc-100">
                          {mode === "fullObservation" ? "Choose your focus" : "Session context"}
                        </h2>
                        <p className="truncate text-[10px] text-zinc-400">
                          {mode === "fullObservation" && selectedPitchPlayerId
                            ? activeSession.players.find((player) => player.playerId === selectedPitchPlayerId)?.name ?? "Selected player"
                            : "Supporting information"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={closeMobileFocus}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                        aria-label="Close focus controls"
                      >
                        <X size={18} aria-hidden="true" />
                      </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                      {mode === "fullObservation" ? (
                        <FocusPanel
                          session={activeSession}
                          onAllocateFocus={handleAllocateFocus}
                          onRemoveFocus={handleRemoveFocus}
                          selectedPlayerId={selectedPitchPlayerId}
                          focusSelectedLensPicker
                        />
                      ) : mode === "investigation" ? (
                        <InvestigationSidebar session={activeSession} />
                      ) : (
                        <MinimalInfoSidebar session={activeSession} />
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Mobile actions remain reachable above the fixed workspace nav. */}
              <div
                className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-white/10 bg-[#0a0d0b]/95 p-3 shadow-[0_-12px_30px_rgba(0,0,0,0.35)] backdrop-blur md:bottom-0 md:left-60 lg:hidden"
                data-tutorial-id="observation-session-controls"
                data-testid="mobile-observation-controls"
              >
                <div className="flex gap-2">
                  {!isOpeningDiscoverySession(activeSession) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-11 flex-1 text-zinc-300"
                      onClick={handleEndSession}
                    >
                      End early
                    </Button>
                  )}
                  {insightActions.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-11 shrink-0 border-amber-500/30 text-amber-300"
                      onClick={openInsightOverlay}
                      aria-label="Use Insight action"
                    >
                      <Zap size={13} className="mr-1.5" aria-hidden="true" />
                      Insight
                    </Button>
                  )}
                  {isLastPhase ? (
                    <Button className="min-h-11 flex-[1.35]" onClick={handleAdvancePhase}>
                      <Flag size={14} className="mr-1.5" aria-hidden="true" />
                      Reflect
                    </Button>
                  ) : (
                    <Button className="min-h-11 flex-[1.35]" onClick={handleAdvancePhase} disabled={openingPhaseRequiresFlag}>
                      {openingPhaseRequiresFlag ? "Flag the moment" : "Next phase"}
                      <ChevronRight size={14} className="ml-1.5" aria-hidden="true" />
                    </Button>
                  )}
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
              aria-labelledby="insight-actions-title"
              onKeyDown={handleInsightDialogKeyDown}
            >
              <div
                ref={insightDialogRef}
                className="mx-4 w-full max-w-md rounded-lg border border-[#27272a] bg-[#0c0c0c] p-6 shadow-2xl"
                data-testid="insight-actions-dialog"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 id="insight-actions-title" className="text-sm font-semibold flex items-center gap-2">
                    <Zap size={14} className="text-amber-400" aria-hidden="true" />
                    Insight Actions
                  </h3>
                  <button
                    ref={insightCloseRef}
                    onClick={closeInsightOverlay}
                    className="flex h-11 w-11 items-center justify-center rounded text-zinc-400 transition hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                    aria-label="Close insight panel"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
                <p className="text-xs text-zinc-400 mb-4">
                  Available:{" "}
                  <span className="text-amber-400 font-semibold">
                    {insightState.points} IP
                  </span>
                </p>
                {gameState ? (
                  <div className="space-y-2">
                    {insightActions.map(({ action, cost, canUse, reason }) => (
                      <button
                        key={action.id}
                        onClick={() => handleUseInsight(action.id)}
                        disabled={!canUse}
                        aria-describedby={reason ? `insight-action-${action.id}-reason` : undefined}
                        className={canUse
                          ? "min-h-11 w-full rounded border border-amber-800/40 bg-amber-950/30 p-3 text-left transition hover:bg-amber-900/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                          : "min-h-11 w-full cursor-not-allowed rounded border border-zinc-700/50 bg-zinc-900/50 p-3 text-left opacity-70"}
                        data-testid={`insight-action-${action.id}`}
                      >
                        <span className={canUse ? "text-xs font-semibold text-amber-300" : "text-xs font-semibold text-zinc-300"}>
                          {action.name}
                        </span>
                        <span className="text-xs text-zinc-400 ml-2">({cost} IP)</span>
                        <p className="mt-0.5 text-xs text-zinc-400">{action.description}</p>
                        {reason && (
                          <p
                            id={`insight-action-${action.id}-reason`}
                            className="mt-1 text-xs font-medium text-amber-200"
                          >
                            {reason}
                          </p>
                        )}
                      </button>
                    ))}
                    {insightActions.length === 0 && (
                      <p className="py-4 text-center text-xs text-zinc-400">
                        No insight actions available right now.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="py-4 text-center text-xs text-zinc-400">
                    No insight actions available.
                  </p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 min-h-11 w-full"
                  onClick={closeInsightOverlay}
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
