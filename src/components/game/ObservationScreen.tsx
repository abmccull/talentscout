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
import { ChoiceCard } from "@/components/ui/ChoiceCard";
import { Badge } from "@/components/ui/badge";
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
} from "@/engine/observation/types";
import type {
  EvidenceClassificationId,
  ObservationHalftimeApproach,
  ScoutCueReading,
  ScoutingQuestionId,
} from "@/engine/core/types";
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
import { YouthPortraitWithFallback } from "./YouthPortrait";
import { ObservationPitch } from "./observation/ObservationPitch";
import {
  LENS_KEYS,
  LENS_VISUAL,
  lensShapeClass,
} from "./observation/lensVisual";
import { useAudio } from "@/lib/audio/useAudio";
import { isOpeningDiscoverySession } from "@/engine/youth/openingCase";
import { SCOUTING_QUESTIONS } from "@/engine/scout/evidenceModel";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

function LensMark({ lens }: { lens: LensType }) {
  const visual = LENS_VISUAL[lens];
  return (
    <i
      className={`inline-block shrink-0 ${lensShapeClass(visual.shape)}`}
      aria-hidden="true"
    />
  );
}

const REACTION_CONFIG: Record<
  SessionFlaggedMoment["reaction"],
  { label: string; icon: React.ElementType; className: string }
> = {
  promising:      { label: "Promising",      icon: CheckCircle2, className: "signal-focus" },
  concerning:     { label: "Concerning",      icon: AlertTriangle, className: "signal-danger" },
  interesting:    { label: "Interesting",     icon: HelpCircle, className: "signal-moment" },
  needs_more_data: { label: "Needs More Data", icon: Database, className: "text-zinc-300" },
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
  minute: number;
  moment: PlayerMoment;
  cue?: ScoutCueReading;
  isFocused: boolean;
  playerName: string;
  canFlag: boolean;
  alreadyFlagged: boolean;
  onFlag: (momentId: string, reaction: SessionFlaggedMoment["reaction"]) => void;
}

const MomentCard = memo(function MomentCard({
  moment, cue, isFocused, playerName, canFlag, alreadyFlagged, onFlag, minute,
}: MomentCardProps) {
  const [showReactions, setShowReactions] = useState(false);
  return (
    <article className="relative border-b border-white/10 py-3 last:border-0 sm:py-5">
      <div className="mb-2 flex items-center gap-3">
        <span className="w-8 shrink-0 text-sm font-semibold tabular-nums text-zinc-400">{minute}′</span>
        <h3 className="min-w-0 flex-1 text-sm font-semibold text-[var(--foreground)]">{playerName}</h3>
        {alreadyFlagged && <Flag size={14} className="text-[var(--signal-moment)]" aria-label="Flagged" />}
      </div>
      <div className="sm:pl-11">
        <p className="text-sm leading-6 text-zinc-200">{isFocused && cue ? cue.detail : moment.vagueDescription}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="text-zinc-400">{isFocused && cue ? `${formatSituationLabel(cue.clarity)} · ${formatSituationLabel(cue.confidenceBand)} confidence` : "Peripheral view · Uncertain"}</span>
          {moment.isStandout && <span className="font-medium text-[var(--signal-moment)]">Standout moment</span>}
          {moment.pressureContext && <span className="text-zinc-400">Under pressure</span>}
        </div>
        {isFocused && cue?.regionalContext && <details className="mt-2 text-xs leading-5 text-zinc-400"><summary className="min-h-11 cursor-pointer py-2">Local context</summary><p>{cue.regionalContext}</p></details>}
        {isFocused && (cue?.attributesHinted.length ?? 0) > 0 && <p className="mt-2 text-xs text-zinc-300">Possible signal: {cue!.attributesHinted.map(formatSituationLabel).join(" · ")}</p>}
        {canFlag && !alreadyFlagged && (
          <button
            type="button" onClick={() => setShowReactions((open) => !open)}
            data-tutorial-id="observation-flag-moment"
            className="mt-3 flex min-h-11 items-center gap-2 rounded-sm px-2 text-sm font-medium text-[var(--signal-moment)] hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--signal-moment)]"
            aria-label={moment.isStandout ? "Flag standout moment" : "Flag this moment"} aria-expanded={showReactions}
          ><Flag size={14} aria-hidden="true" />Flag moment</button>
        )}
        {showReactions && !alreadyFlagged && (
          <div className="mt-2 grid grid-cols-2 gap-1 border-t border-white/10 pt-2" role="group" data-tutorial-id="observation-reactions" aria-label={`Your first read of ${playerName}`}>
            {(Object.entries(REACTION_CONFIG) as [SessionFlaggedMoment["reaction"], typeof REACTION_CONFIG[keyof typeof REACTION_CONFIG]][]).map(([reaction, config]) => {
              const Icon = config.icon;
              return <button key={reaction} type="button" onClick={() => { onFlag(moment.id, reaction); setShowReactions(false); }}
                data-tutorial-id={reaction === "promising" ? "observation-promising-reaction" : undefined}
                className={`flex min-h-11 items-center gap-2 rounded-sm px-2 py-2 text-xs hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${config.className}`}>
                <Icon size={14} aria-hidden="true" />{config.label}
              </button>;
            })}
          </div>
        )}
      </div>
    </article>
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
  requiredLeadId?: string;
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
  requiredLeadId,
  onFlagMoment,
  onDialogueChoice,
  onDataPointSelect,
  onStrategicChoice,
}: PhaseContentProps) {
  const playerMap = new Map(session.players.map((p) => [p.playerId, p]));

  // Full Observation: player moments
  if (session.mode === "fullObservation") {
    return (
      <div>
        {phase.moments.length === 0 ? (
          <p className="py-6 text-center text-xs text-zinc-400">No moments observed in this phase.</p>
        ) : (
          phase.moments.map((moment) => {
            const sessionPlayer = playerMap.get(moment.playerId);
            const cue = session.cueReadings?.find((candidate) => candidate.momentId === moment.id);
            return (
              <MomentCard
                key={moment.id}
                moment={moment}
                minute={phase.minute}
                cue={cue}
                isFocused={sessionPlayer?.isFocused ?? false}
                playerName={sessionPlayer?.name ?? moment.playerId}
                canFlag={requiredLeadId ? moment.playerId === requiredLeadId : !hasPhaseFlag}
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
  session, onAllocateFocus, onRemoveFocus, selectedPlayerId, focusSelectedLensPicker = false,
}: FocusPanelProps) {
  const firstSelectedLensRef = useRef<HTMLButtonElement>(null);
  const releaseFocusRef = useRef<HTMLButtonElement>(null);
  const focusHeadingRef = useRef<HTMLHeadingElement>(null);
  const selected = session.players.find((player) => player.playerId === selectedPlayerId) ?? session.players[0];
  const canAllocate = session.focusTokens.available > 0;
  const otherFocused = session.players.filter((player) => player.isFocused && player.playerId !== selected?.playerId);
  const selectedId = selected?.playerId;
  const selectedIsFocused = selected?.isFocused;

  useEffect(() => {
    if (!focusSelectedLensPicker || !selectedId || selectedIsFocused || !canAllocate) return;
    const frame = requestAnimationFrame(() => firstSelectedLensRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [focusSelectedLensPicker, selectedId, selectedIsFocused, canAllocate]);

  return (
    <section className="px-4 py-3 sm:px-6 sm:py-4" data-tutorial-id="observation-focus-panel" aria-labelledby="observation-focus-title">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 ref={focusHeadingRef} tabIndex={-1} id="observation-focus-title" className="dossier-eyebrow text-zinc-400">Your attention</h2>
          <p className="mt-1 hidden text-base font-semibold text-[var(--foreground)] sm:block">{selected?.name ?? "Choose a player"}</p>
        </div>
        <p className="shrink-0 text-right text-xs leading-5 text-zinc-400"><span className="text-base font-semibold tabular-nums text-[var(--foreground)]">{session.focusTokens.available}/{session.focusTokens.total}</span><span className="ml-1 sm:ml-0 sm:block">focus remaining</span></p>
      </div>
      {selected?.isFocused ? (
        <div className="mt-3 flex items-center justify-between gap-3 border-l-2 border-[var(--primary)] pl-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]"><LensMark lens={selected.currentLens ?? "general"} />{LENS_VISUAL[selected.currentLens ?? "general"].label} focus</p>
            <p className="mt-1 hidden text-xs text-zinc-400 sm:block">Lens locked while you keep watching.</p>
          </div>
          <button ref={releaseFocusRef} type="button" onClick={() => { onRemoveFocus(selected.playerId); requestAnimationFrame(() => (firstSelectedLensRef.current ?? focusHeadingRef.current)?.focus({ preventScroll: true })); }} aria-label={`Remove focus from ${selected.name}`} className="min-h-11 rounded-sm px-2 text-xs text-zinc-300 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]">Release focus</button>
        </div>
      ) : selected && canAllocate ? (
        <>
          <p className="mt-2 hidden text-xs leading-5 text-zinc-400 lg:block">Choose a lens. Each closer look costs one focus.</p>
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 lg:flex-wrap" role="group" aria-label={`Observation lens for ${selected.name}`}>
            {LENS_KEYS.map((lens, index) => (
              <button key={lens} type="button" ref={index === 0 ? firstSelectedLensRef : undefined}
                onClick={() => { onAllocateFocus(selected.playerId, lens); requestAnimationFrame(() => releaseFocusRef.current?.focus({ preventScroll: true })); }} aria-label={`Use ${lens} lens for ${selected.name}`}
                data-tutorial-id={index === 0 ? "observation-focus-lens" : undefined}
                className="flex min-h-11 shrink-0 items-center gap-2 rounded-sm bg-white/[0.045] px-3 text-xs font-medium text-zinc-200 transition-colors hover:bg-[var(--primary)]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] motion-reduce:transition-none">
                <LensMark lens={lens} />{LENS_VISUAL[lens].label}
              </button>
            ))}
          </div>
        </>
      ) : <p className="mt-3 text-sm leading-6 text-zinc-400">No focus remaining this half. Keep watching for a peripheral signal.</p>}
      {otherFocused.length > 0 && <div className="mt-3 border-t border-white/10 pt-2">
        {otherFocused.map((player) => <div key={player.playerId} className="flex items-center justify-between gap-2 text-xs text-zinc-400"><span>{player.name} · {LENS_VISUAL[player.currentLens ?? "general"].label}</span><button type="button" aria-label={`Remove focus from ${player.name}`} onClick={() => onRemoveFocus(player.playerId)} className="min-h-11 shrink-0 px-2 text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]">Release</button></div>)}
      </div>}
    </section>
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
            <p className="mb-1 text-eyebrow font-semibold uppercase tracking-wider text-zinc-400">
              About
            </p>
            <p className="text-sm font-medium text-zinc-200">{primaryPlayer.name}</p>
            <p className="text-xs text-zinc-400">{primaryPlayer.position}</p>
          </div>
        )}
        {speaker && (
          <div className="rounded-md border border-[#27272a] bg-[#141414] p-3">
            <p className="mb-1 text-eyebrow font-semibold uppercase tracking-wider text-zinc-400">
              Speaking with
            </p>
            <p className="text-sm font-medium text-zinc-200">{speaker.name}</p>
          </div>
        )}
      </div>

      {/* Dialogue progress */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-eyebrow font-semibold uppercase tracking-wider text-zinc-400">
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
          <h4 className="mb-2 text-eyebrow font-semibold uppercase tracking-wider text-zinc-400">
            Hypotheses Formed
          </h4>
          <div className="space-y-1.5">
            {session.hypotheses.map((hyp) => (
              <div
                key={hyp.id}
                className="rounded border border-[#27272a] bg-[#141414] px-3 py-2"
              >
                <p className="text-xs text-zinc-300 leading-snug">{hyp.text}</p>
                <p className="mt-0.5 text-eyebrow capitalize text-zinc-400">{hyp.domain}</p>
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
        <p className="text-eyebrow text-zinc-400">Insight Earned</p>
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
        <p className="text-eyebrow text-zinc-400">Insight Earned</p>
      </div>
    </div>
  );
});

// -- SetupView ---------------------------------------------------------------

interface SetupViewProps {
  session: ObservationSession;
  onBegin: () => void;
  onQuestionChange: (questionId: ScoutingQuestionId) => void;
}

function formatSituationLabel(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

interface ScoutingQuestionSelectorProps {
  session: ObservationSession;
  onChange: (questionId: ScoutingQuestionId) => void;
}

const ScoutingQuestionSelector = memo(function ScoutingQuestionSelector({
  session,
  onChange,
}: ScoutingQuestionSelectorProps) {
  if (session.mode !== "fullObservation") return null;
  const selected = session.scoutingQuestionId ?? SCOUTING_QUESTIONS[0].id;
  const questionOptions = (session.questionOptions?.length
    ? session.questionOptions.map((option) => {
      const definition = SCOUTING_QUESTIONS.find((question) => question.id === option.id);
      return {
        id: option.id,
        label: definition?.label ?? formatSituationLabel(option.id),
        focus: `${option.roleAngle} ${option.contextAngle}`.trim(),
        prompt: option.prompt,
        reason: option.reason,
        recommended: option.recommended,
      };
    })
    : SCOUTING_QUESTIONS.map((question, index) => ({
      id: question.id,
      label: question.label,
      focus: question.matchFocus,
      prompt: question.prompt,
      reason: "",
      recommended: index === 0,
    })));
  const selectedDefinition = questionOptions.find((question) => question.id === selected);
  return (
    <fieldset className="mt-6 border-t border-white/15 pt-4">
      <legend className="dossier-eyebrow pr-3 text-zinc-300">
        What are you here to learn?
      </legend>
      <details className="mt-1">
        <summary className="min-h-11 cursor-pointer py-3 text-sm text-[var(--primary)]">{selectedDefinition?.label ?? "Choose a question"} · Change question</summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {questionOptions.map((question) => (
          <ChoiceCard
            key={question.id}
            type="radio"
            name={`scouting-question-${session.id}`}
            value={question.id}
            selected={selected === question.id}
            recommended={question.recommended}
            onSelect={() => onChange(question.id)}
            className="min-h-16 px-3 py-2.5"
          >
            <span className="block text-xs font-semibold leading-4 text-white">{question.label}</span>
            
          </ChoiceCard>
        ))}
      </div>
      </details>
      {selectedDefinition && (
        <p className="mt-3 text-sm leading-6 text-zinc-300">
          <span className="block">{selectedDefinition.prompt}</span>
          {selectedDefinition.reason && (
            <span className="mt-1 block text-xs leading-5 text-zinc-400">Why it fits: {selectedDefinition.reason}</span>
          )}
        </p>
      )}
    </fieldset>
  );
});

const HALFTIME_APPROACHES: Array<{
  id: ObservationHalftimeApproach;
  label: string;
  description: string;
}> = [
  {
    id: "confirm",
    label: "Confirm the first read",
    description: "Keep the same question and look for a second independent cue.",
  },
  {
    id: "challenge",
    label: "Try to prove yourself wrong",
    description: "Prioritise moments that conflict with the impression you already formed.",
  },
  {
    id: "broaden",
    label: "Broaden the watch",
    description: "Spend the second half looking beyond the original signal.",
  },
];

const HalftimeApproachPanel = memo(function HalftimeApproachPanel({
  selected,
  onSelect,
}: {
  selected?: ObservationHalftimeApproach;
  onSelect: (approach: ObservationHalftimeApproach) => void;
}) {
  return (
    <section
      className="shrink-0 border-y border-white/10 px-4 py-4 sm:px-6"
      aria-labelledby="halftime-read-title"
      data-tutorial-id={selected ? undefined : "observation-halftime-approach"}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="dossier-eyebrow text-[var(--signal-moment)]">Half-time adjustment</p>
          <h2 id="halftime-read-title" className="mt-0.5 text-sm font-semibold text-white">How will you watch the second half?</h2>
        </div>
        {selected && <Badge variant="warning" className="text-eyebrow">Locked</Badge>}
      </div>
      <div className="mt-2 grid gap-2">
        {HALFTIME_APPROACHES.map((approach) => (
          <ChoiceCard
            key={approach.id}
            selected={selected === approach.id}
            disabled={Boolean(selected) && selected !== approach.id}
            disabledReason={selected && selected !== approach.id ? "Second-half approach is locked." : undefined}
            onSelect={() => onSelect(approach.id)}
            className="min-h-16 p-2.5"
          >
            <span className="block text-xs font-semibold text-white">{approach.label}</span>
            <span className="mt-1 block text-eyebrow leading-4 text-quiet">{approach.description}</span>
          </ChoiceCard>
        ))}
      </div>
    </section>
  );
});

const SetupView = memo(function SetupView({ session, onBegin, onQuestionChange }: SetupViewProps) {
  const { venueAtmosphere, players, mode, situation } = session;
  const ModeIcon = MODE_ICONS[mode];
  const isOpeningDiscovery = isOpeningDiscoverySession(session);
  const veteranPrologue = useGameStore((state) => state.gameState?.veteranPrologue);
  const lead = players[0];

  if (isOpeningDiscovery && lead) {
    const prologue = veteranPrologue?.activityInstanceId === session.activityInstanceId ? veteranPrologue : undefined;
    const background = prologue?.templateId === "data-anomaly" ? "/images/backgrounds/reports-desk.png"
      : prologue?.templateId === "international-limited-access" ? "/images/backgrounds/world-map.png"
      : prologue?.templateId === "rival-already-watching" ? "/images/backgrounds/rivals-binoculars.png"
      : mode === "investigation" ? "/images/backgrounds/network-lounge.png"
      : "/images/backgrounds/activities/touchline-documentary.webp";
    const beginLabel = !prologue ? "Watch the match" : mode === "analysis" ? "Test the signal" : mode === "investigation" ? "Start the investigation" : "Watch the live evidence";
    return (
      <div className="grid min-h-0 flex-1 overflow-y-auto bg-[var(--background)] lg:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.15fr)]">
        <section className="relative flex min-h-[176px] flex-col justify-end overflow-hidden bg-[#19221b] px-5 py-6 sm:px-8 sm:py-8 lg:min-h-full">
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${background}')` }} aria-hidden="true" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/25 to-black/10" aria-hidden="true" />
          <div className="relative flex items-end gap-4">
            <YouthPortraitWithFallback playerId={lead.playerId} size={96} alt={lead.name} className="h-24 w-24 shrink-0 rounded-none ring-0 ring-offset-0" />
            <div>
              <p className="dossier-eyebrow text-white/70">Your lead</p>
              <h2 className="mt-1 font-editorial text-2xl text-white sm:text-3xl">{lead.name}</h2>
              <p className="mt-1 text-sm text-white/75">{lead.position} · First encounter</p>
            </div>
          </div>
        </section>
        <div className="px-5 pb-28 pt-5 sm:px-8 sm:py-8 lg:px-10 xl:px-14">
          <div className="mx-auto max-w-2xl">
            <p className="dossier-eyebrow text-zinc-400">{prologue ? `${prologue.venueLabel} · ${MODE_LABELS[mode]}` : "10:42 · Local school ground"}</p>
            <h2 className="mt-3 font-editorial text-3xl leading-tight text-[var(--foreground)] sm:text-4xl">{prologue?.title ?? "The match started early."}</h2>
            <p className="mt-4 text-sm leading-7 text-zinc-300">{prologue?.premise ?? `No academy scout is here yet. ${lead.name} was mentioned quietly, but the source only saw one previous match. Watch the play and decide whether the name deserves another look.`}</p>
            <details className="mt-3 text-sm text-quiet"><summary className="min-h-11 cursor-pointer py-3">The contact’s note</summary><blockquote className="border-l-2 border-[var(--signal-moment)] pl-4 text-sm italic leading-7 text-zinc-300">
              “{prologue?.pressure ?? "Don't ask me if he's a star. I'm telling you nobody important has written the name down yet."}”
              <footer className="mt-1 text-xs not-italic text-zinc-400">— {prologue?.sourceContactName ?? session.sourceContactName ?? "Tommy Reyes"}{!prologue && ", 14 minutes ago"}</footer>
            </blockquote></details>
            <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <div><dt className="text-xs text-zinc-400">{prologue ? "Your deadline" : "Time available"}</dt><dd className="mt-1 font-medium text-zinc-200">{prologue?.deadline ?? "Three passages"}</dd></div>
              <div><dt className="text-xs text-zinc-400">{prologue ? "The tension" : "Your task"}</dt><dd className="mt-1 font-medium text-zinc-200">{prologue?.stakeholderConflict ?? "Find a reason to look again"}</dd></div>
            </dl>
            <ScoutingQuestionSelector session={session} onChange={onQuestionChange} />
            <Button onClick={onBegin} size="lg" className="mt-5 min-h-12 w-full gap-2 max-sm:fixed max-sm:inset-x-4 max-sm:bottom-4 max-sm:z-40 max-sm:mt-0 max-sm:w-auto shadow-[0_0_0_16px_var(--background)] sm:w-auto sm:min-w-56 sm:shadow-none" data-tutorial-id="observation-begin-session"><Play size={16} aria-hidden="true" />{beginLabel}</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-start overflow-y-auto p-4 text-center sm:justify-center sm:p-8">
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
          <p className="mb-1 text-eyebrow font-semibold uppercase tracking-wider text-zinc-400">
            Venue Atmosphere
          </p>
          <p className="text-xs text-zinc-300 leading-snug mb-2">
            {venueAtmosphere.description}
          </p>
          {venueAtmosphere.amplifiedAttributes.length > 0 && (
            <div className="mb-1 flex flex-wrap gap-1">
              <span className="text-eyebrow text-emerald-500 mr-1">Amplified:</span>
              {venueAtmosphere.amplifiedAttributes.map((a) => (
                <span key={a} className="rounded bg-emerald-900/30 px-1.5 py-0.5 text-eyebrow text-emerald-400">
                  {formatSituationLabel(a)}
                </span>
              ))}
            </div>
          )}
          {venueAtmosphere.dampenedAttributes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-eyebrow text-red-500 mr-1">Dampened:</span>
              {venueAtmosphere.dampenedAttributes.map((a) => (
                <span key={a} className="rounded bg-red-900/30 px-1.5 py-0.5 text-eyebrow text-red-400">
                  {formatSituationLabel(a)}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {situation && (
        <div className="mb-4 w-full max-w-sm rounded-lg border border-sky-500/20 bg-sky-500/5 p-4 text-left">
          <p className="mb-2 text-eyebrow font-semibold uppercase tracking-wider text-sky-300">
            What this situation can reveal
          </p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded bg-black/20 p-2">
              <p className="text-eyebrow text-quiet">Level</p>
              <p className="mt-0.5 text-eyebrow font-medium text-white">{formatSituationLabel(situation.competitionLevel)}</p>
            </div>
            <div className="rounded bg-black/20 p-2">
              <p className="text-eyebrow text-quiet">Stakes</p>
              <p className="mt-0.5 text-eyebrow font-medium text-white">{formatSituationLabel(situation.stakes)}</p>
            </div>
            <div className="rounded bg-black/20 p-2">
              <p className="text-eyebrow text-quiet">Tactical frame</p>
              <p className="mt-0.5 text-eyebrow font-medium text-white">{formatSituationLabel(situation.tacticalFrame)}</p>
            </div>
          </div>
          <p className="mt-2 text-eyebrow leading-relaxed text-zinc-400">
            Evidence uncertainty ×{situation.uncertaintyMultiplier.toFixed(2)} · Misleading-sample risk {Math.round(situation.misleadingSignalRisk * 100)}%
          </p>
          {situation.biasWarnings[0] && (
            <p className="mt-1.5 text-eyebrow leading-relaxed text-amber-200/80">
              Watch for: {situation.biasWarnings[0]}
            </p>
          )}
        </div>
      )}

      {players.length > 0 && (
        <div className="mb-6 max-w-sm w-full rounded-lg border border-[#27272a] bg-[#0f0f0f] p-4 text-left">
          <p className="mb-2 text-eyebrow font-semibold uppercase tracking-wider text-zinc-400">
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

      <div className="w-full max-w-3xl text-left">
        <ScoutingQuestionSelector session={session} onChange={onQuestionChange} />
      </div>

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

  const handleAddNote = useCallback((note: string) => {
    useGameStore.getState().addSessionNote(note);
  }, []);

  const handleClassifyEvidence = useCallback((
    cueId: string,
    classification: EvidenceClassificationId,
  ) => {
    useGameStore.getState().classifySessionEvidence(cueId, classification);
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
            onAddNote={handleAddNote}
            onClassifyEvidence={handleClassifyEvidence}
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
            <p className="mt-0.5 text-eyebrow text-zinc-400">Insight Points</p>
          </div>
          <div className="rounded-lg border border-[#27272a] bg-[#0f0f0f] p-3 text-center">
            <p className="text-xl font-bold text-amber-400 tabular-nums">
              {result.flaggedMoments.length}
            </p>
            <p className="mt-0.5 text-eyebrow text-zinc-400">{MODE_FLAGGED_SHORT_LABEL[result.mode]}</p>
          </div>
          <div className="rounded-lg border border-[#27272a] bg-[#0f0f0f] p-3 text-center">
            <p className="text-xl font-bold text-zinc-200 capitalize">
              {result.qualityTier}
            </p>
            <p className="mt-0.5 text-eyebrow text-zinc-400">Quality Tier</p>
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
          <p className="mt-0.5 text-eyebrow text-zinc-400">Insight Points</p>
        </div>
        <div className="rounded-lg border border-[#27272a] bg-[#0f0f0f] p-3 text-center">
          <p className="text-xl font-bold text-amber-400 tabular-nums">
            {result.focusedPlayerIds.length}
          </p>
          <p className="mt-0.5 text-eyebrow text-zinc-400">Players Observed</p>
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
  const setScreen = useGameStore((s) => s.setScreen);
  const { playSFX } = useAudio();

  useEffect(() => {
    if (!activeSession) setScreen("dashboard");
  }, [activeSession, setScreen]);

  // Local UI state — all hooks must be called before any early return
  const [showInsightOverlay, setShowInsightOverlay] = useState(false);
  const [selectedPitchPlayerId, setSelectedPitchPlayerId] = useState<string | null>(null);
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
  const openingEvidenceFlagged = Boolean(
    gameState?.openingCase
    && activeSession?.flaggedMoments.some(
      (flagged) => flagged.moment.playerId === gameState.openingCase?.playerId,
    ),
  );
  const openingPhaseRequiresFlag = Boolean(
    isOpeningDiscoverySession(activeSession)
    && activeSession?.mode === "fullObservation"
    && gameState?.veteranPrologue?.activityInstanceId !== activeSession?.activityInstanceId
    && activeSession?.currentPhaseIndex === 1
    && !openingEvidenceFlagged,
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
  const requiresHalftimeChoice = Boolean(
    activeSession?.mode === "fullObservation"
    && isHalfTime
    && !activeSession.halftimeApproach,
  );
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
  const firstSessionPlayerId = activeSession?.players[0]?.playerId ?? null;
  const openingTargetId = isOpeningDiscoverySession(activeSession)
    ? firstSessionPlayerId
    : null;

  // Reset overlay when session changes
  useEffect(() => {
    setShowInsightOverlay(false);
    setSelectedPitchPlayerId(
      openingTargetId ?? firstSessionPlayerId,
    );
  }, [activeSession?.id, openingTargetId, firstSessionPlayerId]);

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

  const handleQuestionChange = useCallback((questionId: ScoutingQuestionId) => {
    playSFX("page-turn");
    useGameStore.getState().setSessionScoutingQuestion(questionId);
  }, [playSFX]);

  const handleAdvancePhase = useCallback(() => {
    useGameStore.getState().advanceSessionPhase();
  }, []);

  const handleAllocateFocus = useCallback((playerId: string, lens: LensType) => {
    playSFX("click");
    useGameStore.getState().allocateSessionFocus(playerId, lens);
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
  }, [playSFX]);

  const handleHalftimeApproach = useCallback((approach: ObservationHalftimeApproach) => {
    playSFX("page-turn");
    useGameStore.getState().setSessionHalftimeApproach(approach);
  }, [playSFX]);

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
  if (!activeSession) {
    return (
      <GameLayout chrome="watch">
        <p className="sr-only">Returning to the desk. The watch session has ended.</p>
      </GameLayout>
    );
  }

  const { state, mode } = activeSession;
  const ModeIcon = MODE_ICONS[mode];
  const isLiveWatch = mode === "fullObservation";
  const isOpeningWatch = isOpeningDiscoverySession(activeSession);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <GameLayout chrome="watch">
      <div className="relative flex min-h-[calc(100dvh-3rem)] min-w-0 flex-col overflow-x-hidden bg-[var(--background)] lg:h-[calc(100dvh-3rem)] lg:min-h-0 lg:overflow-hidden">
        <ScreenBackground
          src={isOpeningWatch
            ? "/images/backgrounds/activities/touchline-documentary.webp"
            : "/images/backgrounds/match-atmosphere.png"}
          opacity={0.72}
        />

        <div className="relative z-10 flex flex-1 flex-col min-h-0">

          {/* ── Top info bar ────────────────────────────────────────────── */}
          <div className="shrink-0 border-b border-[#27272a] bg-[#0c0c0c] px-3 py-2.5 sm:px-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <ModeIcon size={14} className="signal-focus shrink-0" aria-hidden="true" />
                <h1 className="truncate text-base font-semibold text-[var(--foreground)]">
                  {MODE_LABELS[mode]}
                </h1>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
                {state === "active" && currentPhase && (
                  <>
                    <Badge variant="outline" className="tabular-nums text-xs">
                      {mode === "fullObservation"
                        ? `${currentPhase.minute}'`
                        : `Step ${currentPhase.minute}`}
                    </Badge>
                    {isHalfTime && (
                      <Badge variant="warning" className="text-xs">
                        Half Time
                      </Badge>
                    )}
                  </>
                )}
              </div>
            </div>
            {state === "active" && (
              <p className="mt-0.5 text-meta capitalize text-zinc-400">
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
            <SetupView
              session={activeSession}
              onBegin={handleBegin}
              onQuestionChange={handleQuestionChange}
            />
          )}

          {state === "reflection" && (
            <ReflectionView session={activeSession} onComplete={handleCompleteReflection} />
          )}

          {state === "complete" && (
            <CompleteView session={activeSession} onContinue={handleContinue} />
          )}

          {state === "active" && currentPhase && (
            isLiveWatch ? (
              <div className="grid min-h-0 min-w-0 flex-1 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:grid-cols-[minmax(0,1fr)_390px] xl:grid-cols-[minmax(0,1fr)_420px]" data-testid="active-observation-layout">
                <div className="flex min-h-0 min-w-0 flex-col">
                  <ObservationPitch session={activeSession} phase={currentPhase} selectedPlayerId={selectedPitchPlayerId} onSelectPlayer={handlePitchPlayerSelect} />
                </div>
                <aside className="flex min-h-0 min-w-0 flex-col bg-[var(--background)] lg:overflow-y-auto" aria-label="Your scouting notebook">
                  <FocusPanel session={activeSession} onAllocateFocus={handleAllocateFocus} onRemoveFocus={handleRemoveFocus} selectedPlayerId={selectedPitchPlayerId} />
                  {isHalfTime && <HalftimeApproachPanel selected={activeSession.halftimeApproach} onSelect={handleHalftimeApproach} />}
                  <section className="border-t border-white/10 px-4 py-3 sm:px-6 sm:py-5" aria-labelledby="observation-evidence-heading" data-tutorial-id="observation-evidence-feed">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="dossier-eyebrow hidden text-zinc-400 sm:block">Touchline notebook</p>
                        <h2 id="observation-evidence-heading" className="font-editorial text-xl text-[var(--foreground)] sm:mt-1 sm:text-2xl">What you noticed</h2>
                      </div>
                      <span className="mt-1 text-sm tabular-nums text-zinc-400">{currentPhase.minute}′</span>
                    </div>
                    <p className="mt-2 hidden text-xs leading-5 text-zinc-400 sm:block">A first impression. Test it before you make a claim.</p>
                    <PhaseContent phase={currentPhase} session={activeSession} flaggedMomentIds={flaggedMomentIds} hasPhaseFlag={hasPhaseFlag} requiredLeadId={openingPhaseRequiresFlag ? gameState?.openingCase?.playerId : undefined} onFlagMoment={handleFlagMoment} onDialogueChoice={handleDialogueChoice} onDataPointSelect={handleDataPointSelect} onStrategicChoice={handleStrategicChoice} />
                  </section>
                  {activeSession.flaggedMoments.length > 0 && (
                    <details className="border-t border-white/10 px-4 py-4 sm:px-6">
                      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]">In your notebook · {activeSession.flaggedMoments.length} {activeSession.flaggedMoments.length === 1 ? "moment" : "moments"}</summary>
                      <ol className="mt-3 space-y-4">
                        {activeSession.flaggedMoments.map((flagged) => {
                          const cue = activeSession.cueReadings?.find((reading) => reading.momentId === flagged.moment.id);
                          const player = activeSession.players.find((candidate) => candidate.playerId === flagged.moment.playerId);
                          return <li key={flagged.id} className="border-l border-white/20 pl-3">
                            <p className="text-xs text-zinc-400">{flagged.minute}′ · {player?.name ?? "Player"}</p>
                            <p className="mt-1 text-sm leading-6 text-zinc-300">{cue?.detail ?? flagged.moment.vagueDescription}</p>
                            <p className={`mt-1 text-xs font-medium ${REACTION_CONFIG[flagged.reaction].className}`}>{REACTION_CONFIG[flagged.reaction].label} · Initial read</p>
                          </li>;
                        })}
                      </ol>
                    </details>
                  )}
                </aside>
                <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[var(--background)] px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6" data-tutorial-id="observation-session-controls" data-testid="mobile-observation-controls">
                  <div className="flex items-center justify-between gap-3">
                    <div className="hidden text-xs leading-5 text-zinc-400 sm:block"><span className="font-medium text-zinc-200">Passage {activeSession.currentPhaseIndex + 1} of {activeSession.phases.length}</span><br />{activeSession.flaggedMoments.length} recorded · {activeSession.focusTokens.available} focus remaining</div>
                    <div className="flex w-full items-center gap-2 sm:w-auto">
                      {!isOpeningWatch && <Button variant="ghost" className="min-h-11 shrink-0 text-zinc-300" onClick={handleEndSession}>End early</Button>}
                      {insightActions.length > 0 && <Button variant="outline" className="min-h-11 shrink-0 gap-2 text-zinc-300" onClick={openInsightOverlay} aria-label="Use Insight action"><Zap size={14} aria-hidden="true" /><span className="hidden min-[430px]:inline">Insight</span><span className="tabular-nums">{insightState.points}</span></Button>}
                      <Button className="min-h-11 min-w-0 flex-1 gap-2 sm:min-w-56 sm:flex-none" onClick={handleAdvancePhase} disabled={!isLastPhase && (openingPhaseRequiresFlag || requiresHalftimeChoice)} data-tutorial-id={isOpeningWatch && activeSession.currentPhaseIndex === 0 ? "observation-advance-to-standout" : undefined}>
                        {isLastPhase ? "Reflect on the watch" : openingPhaseRequiresFlag ? "Record a moment before moving on" : requiresHalftimeChoice ? "Choose how to watch" : "Next phase"}<ChevronRight size={16} className="shrink-0" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 min-w-0 flex-1 flex-col pb-24 lg:flex-row lg:overflow-hidden lg:pb-0" data-testid="active-observation-layout">
                <div className="flex min-w-0 flex-1 flex-col lg:overflow-y-auto">
                  <div className="border-b border-white/10 px-4 py-4 sm:px-6"><p className="text-sm leading-6 text-zinc-300">{currentPhase.description || "Observing…"}</p></div>
                  <div className="px-4 py-5 sm:px-6">
                    <PhaseContent phase={currentPhase} session={activeSession} flaggedMomentIds={flaggedMomentIds} hasPhaseFlag={hasPhaseFlag} requiredLeadId={openingPhaseRequiresFlag ? gameState?.openingCase?.playerId : undefined} onFlagMoment={handleFlagMoment} onDialogueChoice={handleDialogueChoice} onDataPointSelect={handleDataPointSelect} onStrategicChoice={handleStrategicChoice} />
                  </div>
                  <details className="border-t border-white/10 px-4 py-4 lg:hidden"><summary className="min-h-11 cursor-pointer text-sm font-medium text-zinc-300">Session context</summary>{mode === "investigation" ? <InvestigationSidebar session={activeSession} /> : <MinimalInfoSidebar session={activeSession} />}</details>
                </div>
                <aside className="hidden w-80 shrink-0 flex-col overflow-y-auto border-l border-white/10 bg-[var(--surface)] lg:flex">
                  {mode === "investigation" ? <InvestigationSidebar session={activeSession} /> : <MinimalInfoSidebar session={activeSession} />}
                  <div className="mt-auto space-y-2 border-t border-white/10 p-4" data-tutorial-id="observation-session-controls">
                    {insightActions.length > 0 && <Button variant="outline" className="min-h-11 w-full gap-2" onClick={openInsightOverlay} aria-label="Use Insight action"><Zap size={14} aria-hidden="true" />Use Insight · {insightState.points} IP</Button>}
                    <Button className="min-h-11 w-full gap-2" onClick={handleAdvancePhase}><ChevronRight size={14} aria-hidden="true" />{isLastPhase ? "Go to Reflection" : "Next Phase"}</Button>
                    {!isOpeningWatch && <Button variant="ghost" className="min-h-11 w-full text-zinc-300" onClick={handleEndSession}>End Session Early</Button>}
                  </div>
                </aside>
                <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[var(--background)] p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden" data-tutorial-id="observation-session-controls" data-testid="mobile-observation-controls">
                  <div className="flex items-center gap-2">
                    {!isOpeningWatch && <Button variant="ghost" className="min-h-11 shrink-0 text-zinc-300" onClick={handleEndSession}>End early</Button>}
                    {insightActions.length > 0 && <Button variant="outline" className="min-h-11 shrink-0" onClick={openInsightOverlay} aria-label="Use Insight action"><Zap size={14} aria-hidden="true" /></Button>}
                    <Button className="min-h-11 flex-1 gap-2" onClick={handleAdvancePhase}>{isLastPhase ? "Reflect" : "Next phase"}<ChevronRight size={14} aria-hidden="true" /></Button>
                  </div>
                </div>
              </div>
            )
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
