"use client";

import { useState } from "react";
import {
  BookOpen,
  Sparkles,
  Brain,
  CheckCircle,
  XCircle,
  Flag,
  MessageSquarePlus,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ObservationSession, Hypothesis, SessionFlaggedMoment } from "@/engine/observation/types";
import type { ReflectionResult } from "@/engine/observation/reflection";

// =============================================================================
// PROP TYPES
// =============================================================================

interface ReflectionScreenProps {
  session: ObservationSession;
  reflectionResult: ReflectionResult;
  onAddHypothesis: (playerId: string, text: string, domain: string) => void;
  onAddNote: (note: string) => void;
  onComplete: () => void;
}

// =============================================================================
// DOMAIN BADGE
// =============================================================================

const DOMAIN_COLORS: Record<string, string> = {
  technical: "border-blue-500/40 bg-blue-500/10 text-blue-400",
  physical:  "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  mental:    "border-violet-500/40 bg-violet-500/10 text-violet-400",
  tactical:  "border-amber-500/40 bg-amber-500/10 text-amber-400",
  hidden:    "border-zinc-500/40 bg-zinc-500/10 text-zinc-300",
};

function DomainBadge({ domain }: { domain: string }) {
  const colorClass = DOMAIN_COLORS[domain] ?? DOMAIN_COLORS.hidden;
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${colorClass}`}
    >
      {domain}
    </span>
  );
}

// =============================================================================
// REACTION BADGE
// =============================================================================

const REACTION_LABELS: Record<SessionFlaggedMoment["reaction"], string> = {
  promising:      "Promising",
  concerning:     "Concerning",
  interesting:    "Interesting",
  needs_more_data:"More Data",
};

const REACTION_COLORS: Record<SessionFlaggedMoment["reaction"], string> = {
  promising:      "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  concerning:     "border-red-500/40 bg-red-500/10 text-red-400",
  interesting:    "border-amber-500/40 bg-amber-500/10 text-amber-400",
  needs_more_data:"border-zinc-500/40 bg-zinc-500/10 text-zinc-400",
};

// =============================================================================
// HYPOTHESIS CARD
// =============================================================================

interface HypothesisCardProps {
  hypothesis: Hypothesis;
  playerName: string;
  onAccept: () => void;
  onDismiss: () => void;
}

function HypothesisCard({ hypothesis, playerName, onAccept, onDismiss }: HypothesisCardProps) {
  const [dismissed, setDismissed] = useState(false);
  const [accepted, setAccepted] = useState(false);

  if (dismissed || accepted) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-[#27272a] bg-[#141414] px-4 py-3 opacity-50">
        {accepted
          ? <CheckCircle size={14} className="shrink-0 text-emerald-400" aria-hidden="true" />
          : <XCircle size={14} className="shrink-0 text-zinc-600" aria-hidden="true" />}
        <p className="text-xs text-zinc-500 line-through">{hypothesis.text}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#27272a] bg-[#141414] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-white">{playerName}</span>
            <DomainBadge domain={hypothesis.domain} />
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed">{hypothesis.text}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300"
          onClick={() => { setAccepted(true); onAccept(); }}
          aria-label={`Accept hypothesis: ${hypothesis.text}`}
        >
          <CheckCircle size={13} className="mr-1.5" aria-hidden="true" />
          Accept
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="flex-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
          onClick={() => setDismissed(true)}
          aria-label={`Dismiss hypothesis: ${hypothesis.text}`}
        >
          <XCircle size={13} className="mr-1.5" aria-hidden="true" />
          Dismiss
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// FLAGGED MOMENT TIMELINE (inline — no external MomentTimeline component exists yet)
// =============================================================================

function MomentTimeline({ flaggedMoments }: { flaggedMoments: SessionFlaggedMoment[] }) {
  if (flaggedMoments.length === 0) {
    return (
      <p className="text-sm text-zinc-500 italic py-2">No moments were flagged during this session.</p>
    );
  }

  return (
    <ol className="space-y-3" aria-label="Flagged moments timeline">
      {flaggedMoments.map((fm) => {
        const reactionColor = REACTION_COLORS[fm.reaction];
        const reactionLabel = REACTION_LABELS[fm.reaction];
        return (
          <li
            key={fm.id}
            className="flex gap-3"
          >
            {/* Minute marker */}
            <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[#27272a] bg-[#1a1a1a]">
                <span className="text-[9px] font-bold text-zinc-400">{fm.minute}&apos;</span>
              </div>
              <div className="w-px flex-1 bg-[#27272a]" aria-hidden="true" />
            </div>

            {/* Moment content */}
            <div className="mb-2 min-w-0 space-y-1.5 pb-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${reactionColor}`}
                >
                  {reactionLabel}
                </span>
                <span className="text-[10px] text-zinc-500">Phase {fm.phaseIndex + 1}</span>
              </div>
              <p className="text-sm text-zinc-300 leading-snug">{fm.moment.description}</p>
              {fm.note && (
                <p className="text-xs text-zinc-500 italic">Note: {fm.note}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function ReflectionScreen({
  session,
  reflectionResult,
  onAddHypothesis,
  onAddNote,
  onComplete,
}: ReflectionScreenProps) {
  const [noteInput, setNoteInput] = useState("");

  const {
    sessionSummary,
    insightPointsFromReflection,
    gutFeelingCandidate,
    suggestedHypotheses,
    reflectionPrompts,
  } = reflectionResult;

  function handleAddNote() {
    const trimmed = noteInput.trim();
    if (!trimmed) return;
    onAddNote(trimmed);
    setNoteInput("");
  }

  function handleNoteKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleAddNote();
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-10">

      {/* ── Header ── */}
      <header className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#27272a] bg-[#1a1a1a]"
          aria-hidden="true"
        >
          <BookOpen size={18} className="text-zinc-300" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Post-Observation Reflection</h1>
          <p className="text-sm text-zinc-400">
            W{session.startedAtWeek} &middot; S{session.startedAtSeason} &middot;{" "}
            <span className="capitalize">{session.activityType}</span>
          </p>
        </div>
      </header>

      {/* ── Session Summary ── */}
      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Session Summary
        </h2>
        <Card className="border-[#27272a] bg-[#141414] shadow-md">
          <CardContent className="p-5 space-y-3">
            <p className="text-sm leading-relaxed text-zinc-300">{sessionSummary}</p>
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-zinc-500">Insight Points earned:</span>
              <span className="text-sm font-bold text-amber-400">
                +{insightPointsFromReflection} IP
              </span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── Gut Feeling ── */}
      {gutFeelingCandidate !== null && (
        <section aria-labelledby="gut-feeling-heading">
          <h2 id="gut-feeling-heading" className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Gut Feeling
          </h2>
          <div
            className="relative overflow-hidden rounded-xl border border-amber-500/40 bg-gradient-to-br from-amber-950/60 to-zinc-900 p-5 shadow-lg"
            style={{ boxShadow: "0 0 24px 0 rgba(245,158,11,0.08)" }}
          >
            {/* Glow overlay */}
            <div
              className="pointer-events-none absolute inset-0 rounded-xl opacity-20"
              style={{ background: "radial-gradient(ellipse at 50% 0%, #f59e0b 0%, transparent 70%)" }}
              aria-hidden="true"
            />

            {/* Icon row */}
            <div className="mb-3 flex items-center gap-2">
              <Sparkles size={16} className="shrink-0 text-amber-400" aria-hidden="true" />
              <span className="text-xs font-semibold uppercase tracking-widest text-amber-400">
                Scout&apos;s Instinct
              </span>
            </div>

            {/* Narrative */}
            <blockquote className="mb-4">
              <p className="text-sm italic leading-relaxed text-amber-100/90">
                &ldquo;{gutFeelingCandidate.narrative}&rdquo;
              </p>
            </blockquote>

            {/* Player + domain */}
            <div className="mb-4 flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-white">
                {gutFeelingCandidate.playerName}
              </span>
              <DomainBadge domain={gutFeelingCandidate.domain} />
            </div>

            {/* Reliability bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-amber-300/70">Reliability</span>
                <span className="font-semibold text-amber-300">
                  {Math.round(gutFeelingCandidate.reliability * 100)}%
                </span>
              </div>
              <Progress
                value={gutFeelingCandidate.reliability * 100}
                className="h-1.5 bg-amber-950/60"
                indicatorClassName="bg-amber-400"
                aria-label={`Gut feeling reliability: ${Math.round(gutFeelingCandidate.reliability * 100)}%`}
              />
              <p className="text-[10px] text-amber-400/60">{gutFeelingCandidate.triggerReason}</p>
            </div>

            {/* PA Estimate — only when perk is active */}
            {gutFeelingCandidate.paEstimate && (
              <div
                className="mt-4 rounded-lg border border-dashed border-amber-600/30 bg-amber-950/30 p-3 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <Brain size={14} className="shrink-0 text-amber-500/70" aria-hidden="true" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-amber-500/70">
                    Potential Estimate
                  </span>
                </div>
                <p className="text-sm font-semibold text-amber-200">
                  Estimated PA: {gutFeelingCandidate.paEstimate.low} &ndash; {gutFeelingCandidate.paEstimate.high}
                </p>
                {/* Visual range bar on a 1–200 scale */}
                <div className="relative h-2 w-full rounded-full bg-zinc-800/80">
                  <div
                    className="absolute inset-y-0 rounded-full bg-gradient-to-r from-amber-600/60 to-amber-400/60"
                    style={{
                      left: `${((gutFeelingCandidate.paEstimate.low - 1) / 199) * 100}%`,
                      right: `${(1 - (gutFeelingCandidate.paEstimate.high - 1) / 199) * 100}%`,
                    }}
                    aria-hidden="true"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-zinc-500">
                  <span>1</span>
                  <span>200</span>
                </div>
                <p className="text-[10px] text-amber-500/50 italic">
                  Heuristic estimate based on instinct — not a data-driven assessment.
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Suggested Hypotheses ── */}
      {suggestedHypotheses.length > 0 && (
        <section aria-labelledby="hypotheses-heading">
          <h2 id="hypotheses-heading" className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Suggested Hypotheses
          </h2>
          <div className="space-y-3">
            {suggestedHypotheses.map((hypothesis) => {
              const player = session.players.find((p) => p.playerId === hypothesis.playerId);
              const playerName = player?.name ?? hypothesis.playerId;
              return (
                <HypothesisCard
                  key={hypothesis.id}
                  hypothesis={hypothesis}
                  playerName={playerName}
                  onAccept={() =>
                    onAddHypothesis(hypothesis.playerId, hypothesis.text, hypothesis.domain)
                  }
                  onDismiss={() => {
                    /* state is managed locally inside HypothesisCard */
                  }}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* ── Reflection Prompts ── */}
      {reflectionPrompts.length > 0 && (
        <section aria-labelledby="prompts-heading">
          <h2 id="prompts-heading" className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Reflection Prompts
          </h2>
          <div className="space-y-3">
            {reflectionPrompts.map((prompt, index) => (
              <div
                key={index}
                className="flex gap-3 rounded-r-lg border-l-2 border-zinc-600 bg-[#141414] px-4 py-3"
              >
                <p className="text-sm italic leading-relaxed text-zinc-400">{prompt}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Flagged Moments Review ── */}
      <section aria-labelledby="flagged-moments-heading">
        <div className="mb-3 flex items-center gap-2">
          <Flag size={13} className="text-zinc-500" aria-hidden="true" />
          <h2
            id="flagged-moments-heading"
            className="text-xs font-semibold uppercase tracking-widest text-zinc-500"
          >
            Moments You Flagged
          </h2>
          {session.flaggedMoments.length > 0 && (
            <span className="ml-auto text-xs font-semibold text-zinc-400">
              {session.flaggedMoments.length}
            </span>
          )}
        </div>
        <Card className="border-[#27272a] bg-[#141414]">
          <CardContent className="p-4">
            <MomentTimeline flaggedMoments={session.flaggedMoments} />
          </CardContent>
        </Card>
      </section>

      {/* ── Notes ── */}
      <section aria-labelledby="notes-heading">
        <div className="mb-3 flex items-center gap-2">
          <Brain size={13} className="text-zinc-500" aria-hidden="true" />
          <h2
            id="notes-heading"
            className="text-xs font-semibold uppercase tracking-widest text-zinc-500"
          >
            Personal Notes
          </h2>
        </div>

        {/* Existing notes */}
        {session.reflectionNotes.length > 0 && (
          <div className="mb-3 space-y-2">
            {session.reflectionNotes.map((note, index) => (
              <div
                key={index}
                className="rounded-lg border border-[#27272a] bg-[#141414] px-4 py-3"
              >
                <p className="text-sm text-zinc-300 leading-relaxed">{note}</p>
              </div>
            ))}
          </div>
        )}

        {/* Note input */}
        <div className="space-y-2">
          <label htmlFor="reflection-note-input" className="sr-only">
            Add a personal note
          </label>
          <textarea
            id="reflection-note-input"
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            onKeyDown={handleNoteKeyDown}
            placeholder="Add a note about what you observed… (Ctrl+Enter to save)"
            rows={3}
            className="w-full resize-none rounded-lg border border-[#27272a] bg-[#141414] px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition focus:border-zinc-500 focus:ring-1 focus:ring-zinc-600"
            aria-describedby="reflection-note-hint"
          />
          <div className="flex items-center justify-between gap-2">
            <p id="reflection-note-hint" className="text-[10px] text-zinc-600">
              Ctrl+Enter to save quickly
            </p>
            <Button
              size="sm"
              variant="outline"
              className="border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white"
              onClick={handleAddNote}
              disabled={noteInput.trim().length === 0}
            >
              <MessageSquarePlus size={13} className="mr-1.5" aria-hidden="true" />
              Add Note
            </Button>
          </div>
        </div>
      </section>

      {/* ── Complete Button ── */}
      <div className="pt-2">
        <Button
          size="lg"
          className="w-full bg-emerald-600 text-white shadow-md hover:bg-emerald-500 focus-visible:ring-emerald-500"
          onClick={onComplete}
        >
          Complete Reflection
          <ChevronRight size={16} className="ml-2" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
