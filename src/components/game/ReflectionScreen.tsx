"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Sparkles,
  Brain,
  Flag,
  MessageSquarePlus,
  ChevronRight,
  Crosshair,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ObservationSession, SessionFlaggedMoment } from "@/engine/observation/types";
import { MODE_FLAGGED_LABEL } from "@/engine/observation/types";
import { formatObservationActivityLabel, type ReflectionResult } from "@/engine/observation/reflection";
import type { EvidenceClassificationId, ScoutCueReading } from "@/engine/core/types";
import { resolveObservationSignalAssessment } from "@/engine/observation/questions";

// =============================================================================
// PROP TYPES
// =============================================================================

interface ReflectionScreenProps {
  session: ObservationSession;
  reflectionResult: ReflectionResult;
  onAddNote: (note: string) => void;
  onClassifyEvidence: (cueId: string, classification: EvidenceClassificationId) => void;
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

const CLASSIFICATION_COPY: Record<EvidenceClassificationId, { label: string; description: string }> = {
  technicalExecution: { label: "Technical execution", description: "Body shape, touch, pass, strike, or control." },
  preReceiveDecision: { label: "Decision before receiving", description: "Scanning and option selection happened before the ball arrived." },
  offBallMovement: { label: "Off-ball movement", description: "Timing or positioning created value away from the ball." },
  pressureResponse: { label: "Response to pressure", description: "The action changed when contact, risk, or a setback arrived." },
  physicalRepeatability: { label: "Physical repeatability", description: "Balance, recovery, movement quality, or repeated output mattered." },
  anomaly: { label: "Unusual signal", description: "Worth keeping because it did not fit the surrounding level or pattern." },
  noConclusion: { label: "No reliable conclusion", description: "Keep the passage, but do not turn it into a trait claim yet." },
};

function cueReason(cue: ScoutCueReading): string {
  const positives: string[] = [];
  const limits: string[] = [];
  if (cue.factors.focus > 0) positives.push("focused attention");
  if (cue.factors.questionAlignment > 0) positives.push("a question that matched the action");
  if (cue.factors.domainSkill >= 0.14) positives.push("a developed scouting strength");
  if (cue.factors.regionalContext > 0.03) positives.push("a useful local reference base");
  if (cue.factors.fatigue < -0.04) limits.push("fatigue");
  if (cue.factors.conditions < -0.03) limits.push("difficult viewing conditions");
  if (cue.factors.focus < 0) limits.push("peripheral attention");
  const clear = positives.length > 0 ? `Sharpened by ${positives.join(", ")}.` : "No major clarity advantage.";
  return limits.length > 0 ? `${clear} Limited by ${limits.join(" and ")}.` : clear;
}

function EvidenceSynthesisPanel({
  session,
  onClassify,
}: {
  session: ObservationSession;
  onClassify: ReflectionScreenProps["onClassifyEvidence"];
}) {
  const flaggedMomentIds = useMemo(
    () => new Set(session.flaggedMoments.map((flagged) => flagged.moment.id)),
    [session.flaggedMoments],
  );
  const cues = (session.cueReadings ?? []).filter((cue) => flaggedMomentIds.has(cue.momentId));
  if (cues.length === 0) return null;

  return (
    <section aria-labelledby="evidence-synthesis-heading">
      <div className="mb-3 flex items-center gap-2">
        <Crosshair size={14} className="text-cyan-300" aria-hidden="true" />
        <div>
          <h2 id="evidence-synthesis-heading" className="text-xs font-semibold uppercase tracking-widest text-cyan-200">
            Interpret what you kept
          </h2>
          <p className="mt-1 text-xs leading-5 text-zinc-400">
            Classify at least one passage. This choice becomes report evidence; your private notes do not.
          </p>
        </div>
      </div>
      <div className="space-y-3">
        {cues.map((cue) => {
          const selected = session.evidenceDecisions?.[cue.id]?.classification;
          return (
            <article key={cue.id} className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.05] p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-white">{cue.minute}&apos; · {cue.summary}</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-300">{cue.detail}</p>
                </div>
                <span className="rounded-full border border-cyan-300/25 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-200">
                  {cue.clarity} read
                </span>
              </div>
              <p className="mt-2 text-[10px] leading-4 text-zinc-400">{cueReason(cue)}</p>
              <fieldset className="mt-3">
                <legend className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">What did this passage show?</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {cue.suggestedClassifications.map((classification) => {
                    const copy = CLASSIFICATION_COPY[classification];
                    return (
                      <label
                        key={classification}
                        className={`relative min-h-16 cursor-pointer rounded-lg border p-3 transition focus-within:ring-2 focus-within:ring-cyan-300 ${
                          selected === classification
                            ? "border-cyan-300/60 bg-cyan-300/12"
                            : "border-white/10 bg-black/20 hover:border-white/25"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`cue-classification-${cue.id}`}
                          checked={selected === classification}
                          onChange={() => onClassify(cue.id, classification)}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        />
                        <span className="block text-xs font-semibold text-white">{copy.label}</span>
                        <span className="mt-1 block text-[10px] leading-4 text-zinc-400">{copy.description}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </article>
          );
        })}
      </div>
    </section>
  );
}

// =============================================================================
// FLAGGED MOMENT TIMELINE
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
  onAddNote,
  onClassifyEvidence,
  onComplete,
}: ReflectionScreenProps) {
  const [noteInput, setNoteInput] = useState("");
  const completeButtonRef = useRef<HTMLButtonElement>(null);
  const flaggedCueIds = useMemo(() => {
    const momentIds = new Set(session.flaggedMoments.map((flagged) => flagged.moment.id));
    return (session.cueReadings ?? [])
      .filter((cue) => momentIds.has(cue.momentId))
      .map((cue) => cue.id);
  }, [session.cueReadings, session.flaggedMoments]);
  const requiresEvidenceInterpretation = session.specialization === "youth"
    && flaggedCueIds.length > 0
    && !flaggedCueIds.some((cueId) => session.evidenceDecisions?.[cueId]);
  const signalAssessment = session.mode === "fullObservation"
    ? resolveObservationSignalAssessment(session)
    : null;

  useEffect(() => {
    if (requiresEvidenceInterpretation) return;
    const frame = requestAnimationFrame(() => {
      completeButtonRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [requiresEvidenceInterpretation]);

  const {
    sessionSummary,
    insightPointsFromReflection,
    gutFeelingCandidate,
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
            <span>{formatObservationActivityLabel(session.activityType)}</span>
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
            {signalAssessment && (
              <div className={`rounded-xl border p-3 ${signalAssessment.outcome === "clear"
                ? "border-emerald-400/20 bg-emerald-400/[0.05]"
                : signalAssessment.outcome === "weak"
                  ? "border-amber-400/20 bg-amber-400/[0.05]"
                  : "border-zinc-500/20 bg-zinc-500/[0.05]"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={`text-xs font-semibold ${signalAssessment.outcome === "clear"
                    ? "text-emerald-200"
                    : signalAssessment.outcome === "weak"
                      ? "text-amber-200"
                      : "text-zinc-300"}`}
                  >
                    {signalAssessment.outcome === "clear"
                      ? "A usable signal"
                      : signalAssessment.outcome === "weak"
                        ? "A tentative signal"
                        : "No reliable signal today"}
                  </p>
                  {signalAssessment.comparisonReady && (
                    <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-2 py-1 text-[10px] text-cyan-100">
                      New comparison available
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-5 text-zinc-300">{signalAssessment.summary}</p>
                {signalAssessment.reasons.length > 0 && (
                  <p className="mt-1 text-[11px] leading-4 text-zinc-500">
                    {signalAssessment.reasons[0]}
                  </p>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-zinc-500">Reflection bonus:</span>
              <span className="text-sm font-bold text-amber-400">
                +{insightPointsFromReflection} IP
              </span>
            </div>
          </CardContent>
        </Card>
      </section>

      <EvidenceSynthesisPanel session={session} onClassify={onClassifyEvidence} />

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
                    Projection signal
                  </span>
                </div>
                <p className="text-sm font-semibold text-amber-200">
                  Broad range: {gutFeelingCandidate.paEstimate.low} &ndash; {gutFeelingCandidate.paEstimate.high}
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
                  Built from the cues you noticed. It is deliberately broad and can be wrong.
                </p>
              </div>
            )}
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
            {MODE_FLAGGED_LABEL[session.mode]}
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
            Private notebook
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
            placeholder="Optional private note — this is not scored or parsed (Ctrl+Enter to save)"
            rows={3}
            className="w-full resize-none rounded-lg border border-[#27272a] bg-[#141414] px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 outline-none transition focus:border-zinc-500 focus:ring-1 focus:ring-zinc-600"
            aria-describedby="reflection-note-hint"
          />
          <div className="flex items-center justify-between gap-2">
            <p id="reflection-note-hint" className="text-[10px] text-zinc-600">
              Private notes are archival only · Ctrl+Enter to save
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
          ref={completeButtonRef}
          size="lg"
          className="w-full bg-emerald-600 text-white shadow-md hover:bg-emerald-500 focus-visible:ring-emerald-500"
          onClick={onComplete}
          disabled={requiresEvidenceInterpretation}
          data-tutorial-id="observation-complete-reflection"
        >
          {requiresEvidenceInterpretation ? "Classify one saved passage" : "Complete Reflection"}
          <ChevronRight size={16} className="ml-2" aria-hidden="true" />
        </Button>
        <p className="mt-2 text-center text-[11px] text-zinc-500">
          Your classified evidence carries into the next assessment. Private notes remain in your notebook and never affect scoring.
        </p>
      </div>
    </div>
  );
}
