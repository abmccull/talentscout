"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  Gauge,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type {
  EvidenceConfidenceBand,
  InitialAssessmentInput,
  ReportRecommendedAction,
  ScoutingEvidenceCard,
} from "@/engine/core/types";
import {
  buildInitialAssessment,
  getEvidenceClaimOptions,
  getEvidenceNextTestOptions,
  getEvidenceUnknownOptions,
  type InitialAssessmentBuildResult,
} from "@/engine/scout/evidenceModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AssessmentDraft = Partial<InitialAssessmentInput>;

export interface InitialAssessmentBuilderResult {
  draft: AssessmentDraft;
  complete: boolean;
  recommendedValue: InitialAssessmentInput | null;
  result: InitialAssessmentBuildResult;
}

interface InitialAssessmentBuilderProps {
  cards: ScoutingEvidenceCard[];
  playerName: string;
  value: InitialAssessmentInput | null;
  onChange: (value: InitialAssessmentInput | null) => void;
  onResultChange?: (result: InitialAssessmentBuilderResult) => void;
  disabled?: boolean;
}

const MOBILE_STEPS = [
  { id: "evidence", label: "Evidence" },
  { id: "suggests", label: "Suggests" },
  { id: "untested", label: "Untested" },
  { id: "nextAction", label: "Next action" },
  { id: "confidence", label: "Confidence" },
] as const;

const CLARITY_RANK: Record<ScoutingEvidenceCard["clarity"], number> = {
  missed: 0,
  glimpse: 1,
  usable: 2,
  strong: 3,
  exceptional: 4,
};

const RECOMMENDATION_OPTIONS: Array<{
  value: ReportRecommendedAction;
  label: string;
  description: string;
  tone: string;
}> = [
  {
    value: "monitor",
    label: "Keep private",
    description: "Retain the name and set up another look before escalating the case.",
    tone: "border-cyan-400/30 bg-cyan-400/[0.06] text-cyan-100",
  },
  {
    value: "inviteForTrial",
    label: "Test in harder context",
    description: "Move the player into a more demanding environment to challenge the first read.",
    tone: "border-emerald-400/30 bg-emerald-400/[0.07] text-emerald-100",
  },
  {
    value: "offerAcademyPlace",
    label: "Escalate now",
    description: "Present the player as ready for immediate recruitment attention.",
    tone: "border-amber-400/30 bg-amber-400/[0.08] text-amber-100",
  },
] as const;

const CONFIDENCE_OPTIONS: Array<{
  value: EvidenceConfidenceBand;
  label: string;
  description: string;
}> = [
  {
    value: "tentative",
    label: "Tentative",
    description: "Useful first impression only. The read is easy to overturn.",
  },
  {
    value: "working",
    label: "Working",
    description: "Plausible for planning, but still fragile without another context.",
  },
  {
    value: "supported",
    label: "Supported",
    description: "Credible enough to guide a next action with measured language.",
  },
  {
    value: "robust",
    label: "Robust",
    description: "Strong conviction. Use only when the cue can carry this weight.",
  },
] as const;

function formatToken(value: string): string {
  const spaced = value.replace(/([A-Z])/g, " $1").replace(/[-_]/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function sameInput(left: InitialAssessmentInput | null, right: InitialAssessmentInput | null): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return left.evidenceCardId === right.evidenceCardId
    && left.claimOptionId === right.claimOptionId
    && left.unknownOptionId === right.unknownOptionId
    && left.nextTestId === right.nextTestId
    && left.recommendation === right.recommendation
    && left.confidence === right.confidence;
}

function isCompleteDraft(draft: AssessmentDraft): draft is InitialAssessmentInput {
  return Boolean(
    draft.evidenceCardId
    && draft.claimOptionId
    && draft.unknownOptionId
    && draft.nextTestId
    && draft.recommendation
    && draft.confidence,
  );
}

function recommendedRecommendation(card: ScoutingEvidenceCard): ReportRecommendedAction {
  return card.confidence >= 0.68 ? "inviteForTrial" : "monitor";
}

function getRecommendedValue(cards: ScoutingEvidenceCard[]): InitialAssessmentInput | null {
  const card = [...cards].sort((left, right) => {
    if (right.confidence !== left.confidence) return right.confidence - left.confidence;
    if (CLARITY_RANK[right.clarity] !== CLARITY_RANK[left.clarity]) {
      return CLARITY_RANK[right.clarity] - CLARITY_RANK[left.clarity];
    }
    return left.minute - right.minute;
  })[0];
  if (!card) return null;

  const claim = getEvidenceClaimOptions(card)[0];
  const unknown = getEvidenceUnknownOptions(card)[0];
  const nextTest = unknown ? getEvidenceNextTestOptions(unknown)[0] : undefined;
  if (!claim || !unknown || !nextTest) return null;

  return {
    evidenceCardId: card.id,
    claimOptionId: claim.id,
    unknownOptionId: unknown.id,
    nextTestId: nextTest.id,
    recommendation: recommendedRecommendation(card),
    confidence: card.confidenceBand,
  };
}

function evaluateDraft(
  draft: AssessmentDraft,
  cards: ScoutingEvidenceCard[],
  playerName: string,
): InitialAssessmentBuilderResult {
  const errors: string[] = [];
  const recommendedValue = getRecommendedValue(cards);
  const card = draft.evidenceCardId
    ? cards.find((candidate) => candidate.id === draft.evidenceCardId)
    : undefined;

  if (!draft.evidenceCardId || !card) {
    errors.push("Choose one saved observation cue.");
  }

  const claimOptions = card ? getEvidenceClaimOptions(card) : [];
  const claim = draft.claimOptionId
    ? claimOptions.find((candidate) => candidate.id === draft.claimOptionId)
    : undefined;
  if (!draft.claimOptionId || !claim) {
    errors.push("Choose what the evidence suggests.");
  }

  const unknownOptions = card ? getEvidenceUnknownOptions(card) : [];
  const unknown = draft.unknownOptionId
    ? unknownOptions.find((candidate) => candidate.id === draft.unknownOptionId)
    : undefined;
  if (!draft.unknownOptionId || !unknown) {
    errors.push("Choose what remains untested.");
  }

  const nextTestOptions = unknown ? getEvidenceNextTestOptions(unknown) : [];
  const nextTest = draft.nextTestId
    ? nextTestOptions.find((candidate) => candidate.id === draft.nextTestId)
    : undefined;
  if (!draft.nextTestId || !nextTest) {
    errors.push("Choose the next test for this read.");
  }

  if (!draft.recommendation) {
    errors.push("Choose how strongly to act on this read.");
  }
  if (!draft.confidence) {
    errors.push("Choose how confident you are in this read.");
  }

  if (!isCompleteDraft(draft)) {
    return {
      draft,
      complete: false,
      recommendedValue,
      result: { valid: false, errors },
    };
  }

  const result = buildInitialAssessment(draft, cards, playerName);
  return {
    draft,
    complete: true,
    recommendedValue,
    result: result.valid
      ? result
      : {
        valid: false,
        errors: [...new Set([...errors, ...result.errors])],
      },
  };
}

function selectedTone(selected: boolean, accent: "emerald" | "cyan" | "amber"): string {
  if (!selected) {
    return "border-white/10 bg-black/20 text-zinc-200 hover:border-white/20 hover:bg-white/[0.03]";
  }
  if (accent === "cyan") return "border-cyan-400/55 bg-cyan-400/[0.09] text-cyan-50";
  if (accent === "amber") return "border-amber-400/55 bg-amber-400/[0.11] text-amber-50";
  return "border-emerald-400/55 bg-emerald-400/[0.09] text-emerald-50";
}

function FieldChoice({
  checked,
  disabled,
  name,
  title,
  description,
  meta,
  accent,
  onSelect,
  recommended = false,
}: {
  checked: boolean;
  disabled?: boolean;
  name: string;
  title: string;
  description: string;
  meta?: React.ReactNode;
  accent: "emerald" | "cyan" | "amber";
  onSelect: () => void;
  recommended?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer flex-col rounded-xl border px-4 py-3 transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2",
        accent === "cyan" && "focus-within:outline-cyan-300",
        accent === "amber" && "focus-within:outline-amber-300",
        accent === "emerald" && "focus-within:outline-emerald-300",
        disabled && "cursor-not-allowed opacity-55",
        selectedTone(checked, accent),
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="sr-only"
      />
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white">{title}</span>
          <span className="mt-1 block text-xs leading-5 text-zinc-300">{description}</span>
        </span>
        <span className="shrink-0 space-y-1 text-right">
          <span
            className={cn(
              "block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em]",
              checked
                ? accent === "amber"
                  ? "border-amber-300/45 bg-amber-300/15 text-amber-100"
                  : accent === "cyan"
                    ? "border-cyan-300/45 bg-cyan-300/15 text-cyan-100"
                    : "border-emerald-300/45 bg-emerald-300/15 text-emerald-100"
                : "border-white/10 bg-white/[0.03] text-zinc-400",
            )}
          >
            {checked ? "Selected" : "Available"}
          </span>
          {recommended && (
            <span className="block rounded-full border border-amber-300/35 bg-amber-300/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100">
              Recommended
            </span>
          )}
        </span>
      </span>
      {meta && <span className="mt-3 block text-xs text-zinc-400">{meta}</span>}
    </label>
  );
}

function SelectionSummary({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
      <p className="mt-1 text-sm text-zinc-100">{value}</p>
    </div>
  );
}

export function InitialAssessmentBuilder({
  cards,
  playerName,
  value,
  onChange,
  onResultChange,
  disabled = false,
}: InitialAssessmentBuilderProps) {
  const baseId = useId();
  const [draft, setDraft] = useState<AssessmentDraft>(value ?? {});
  const [mobileStep, setMobileStep] = useState(0);

  useEffect(() => {
    if (value) setDraft(value);
  }, [value]);

  const selectedCard = useMemo(
    () => cards.find((candidate) => candidate.id === draft.evidenceCardId),
    [cards, draft.evidenceCardId],
  );
  const claimOptions = useMemo(
    () => (selectedCard ? getEvidenceClaimOptions(selectedCard) : []),
    [selectedCard],
  );
  const unknownOptions = useMemo(
    () => (selectedCard ? getEvidenceUnknownOptions(selectedCard) : []),
    [selectedCard],
  );
  const selectedUnknown = useMemo(
    () => unknownOptions.find((candidate) => candidate.id === draft.unknownOptionId),
    [draft.unknownOptionId, unknownOptions],
  );
  const nextTestOptions = useMemo(
    () => (selectedUnknown ? getEvidenceNextTestOptions(selectedUnknown) : []),
    [selectedUnknown],
  );
  const selectedClaim = useMemo(
    () => claimOptions.find((candidate) => candidate.id === draft.claimOptionId),
    [claimOptions, draft.claimOptionId],
  );
  const selectedNextTest = useMemo(
    () => nextTestOptions.find((candidate) => candidate.id === draft.nextTestId),
    [draft.nextTestId, nextTestOptions],
  );

  const evaluation = useMemo(
    () => evaluateDraft(draft, cards, playerName),
    [cards, draft, playerName],
  );
  const emittedValue = evaluation.complete && evaluation.result.valid && isCompleteDraft(draft)
    ? draft
    : null;

  useEffect(() => {
    if (!sameInput(value, emittedValue)) {
      onChange(emittedValue);
    }
  }, [emittedValue, onChange, value]);

  useEffect(() => {
    onResultChange?.(evaluation);
  }, [evaluation, onResultChange]);

  const stepCompletion = [
    Boolean(selectedCard),
    Boolean(selectedClaim),
    Boolean(selectedUnknown),
    Boolean(selectedNextTest && draft.recommendation),
    Boolean(draft.confidence),
  ];
  const completedSteps = stepCompletion.filter(Boolean).length;
  const mobileProgressText = `Initial assessment step ${mobileStep + 1} of ${MOBILE_STEPS.length}. ${completedSteps} of ${MOBILE_STEPS.length} steps complete. Current step: ${MOBILE_STEPS[mobileStep]?.label ?? MOBILE_STEPS[0].label}.`;

  const canOpenMobileStep = (index: number): boolean => {
    if (index === 0) return true;
    return stepCompletion.slice(0, index).every(Boolean);
  };

  const applyDraft = (updater: (current: AssessmentDraft) => AssessmentDraft, nextStep?: number) => {
    setDraft((current) => updater(current));
    if (nextStep !== undefined) {
      setMobileStep((current) => (current === nextStep - 1 ? nextStep : current));
    }
  };

  const selectedRecommendation = RECOMMENDATION_OPTIONS.find(
    (option) => option.value === draft.recommendation,
  );
  const selectedConfidence = CONFIDENCE_OPTIONS.find(
    (option) => option.value === draft.confidence,
  );

  const preview = evaluation.result.assessment;
  const renderEvidenceChoices = () => (
    <fieldset className="space-y-3">
      <legend className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-200">
        Saved evidence
      </legend>
      <div className="space-y-3">
        {cards.map((card) => {
          const checked = draft.evidenceCardId === card.id;
          const recommended = evaluation.recommendedValue?.evidenceCardId === card.id;
          return (
            <FieldChoice
              key={card.id}
              name={`${baseId}-evidence`}
              checked={checked}
              disabled={disabled}
              accent="cyan"
              recommended={recommended}
              title={`${card.minute}' ${card.summary}`}
              description={card.detail}
              meta={(
                <span className="flex flex-wrap gap-2">
                  <span>{formatToken(card.classification)}</span>
                  <span>{formatToken(card.questionId)}</span>
                  <span>{formatToken(card.clarity)}</span>
                  <span>{Math.round(card.confidence * 100)}% cue confidence</span>
                </span>
              )}
              onSelect={() => applyDraft((current) => {
                const next: AssessmentDraft = { ...current, evidenceCardId: card.id };
                delete next.claimOptionId;
                delete next.unknownOptionId;
                delete next.nextTestId;
                return next;
              }, 1)}
            />
          );
        })}
      </div>
    </fieldset>
  );

  const renderClaimChoices = () => (
    <fieldset className="space-y-3">
      <legend className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-200">
        What it suggests
      </legend>
      {selectedCard ? (
        <div className="space-y-3">
          {claimOptions.map((option, index) => (
            <FieldChoice
              key={option.id}
              name={`${baseId}-claim`}
              checked={draft.claimOptionId === option.id}
              disabled={disabled}
              accent="emerald"
              recommended={index === 0}
              title={option.label}
              description={option.statement}
              meta={`Category: ${formatToken(option.category)} | Support: ${formatToken(option.support)}`}
              onSelect={() => applyDraft((current) => ({
                ...current,
                claimOptionId: option.id,
              }), 2)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/10 bg-black/15 px-4 py-5 text-sm text-zinc-400">
          Choose one evidence cue first. Claim options come from that card.
        </div>
      )}
    </fieldset>
  );

  const renderUnknownChoices = () => (
    <fieldset className="space-y-3">
      <legend className="text-xs font-bold uppercase tracking-[0.14em] text-amber-200">
        What remains untested
      </legend>
      {selectedCard ? (
        <div className="space-y-3">
          {unknownOptions.map((option, index) => (
            <FieldChoice
              key={option.id}
              name={`${baseId}-unknown`}
              checked={draft.unknownOptionId === option.id}
              disabled={disabled}
              accent="amber"
              recommended={index === 0}
              title={option.label}
              description={option.statement}
              meta={`Next question: ${formatToken(option.recommendedQuestionId)} | Needed context: ${option.contextRequirement}`}
              onSelect={() => applyDraft((current) => {
                const next: AssessmentDraft = {
                  ...current,
                  unknownOptionId: option.id,
                };
                delete next.nextTestId;
                return next;
              }, 3)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-white/10 bg-black/15 px-4 py-5 text-sm text-zinc-400">
          Choose an evidence cue before deciding what still needs testing.
        </div>
      )}
    </fieldset>
  );

  const renderNextActionChoices = () => (
    <div className="space-y-5">
      <fieldset className="space-y-3">
        <legend className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-200">
          Next test
        </legend>
        {selectedUnknown ? (
          <div className="space-y-3">
            {nextTestOptions.map((option, index) => (
              <FieldChoice
                key={option.id}
                name={`${baseId}-next-test`}
                checked={draft.nextTestId === option.id}
                disabled={disabled}
                accent="cyan"
                recommended={index === 0}
                title={option.label}
                description={option.description}
                meta={`Activity: ${formatToken(option.activityType)} | Requirement: ${option.contextRequirement}`}
                onSelect={() => applyDraft((current) => ({
                  ...current,
                  nextTestId: option.id,
                }))}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 bg-black/15 px-4 py-5 text-sm text-zinc-400">
            Choose the untested question first. The next action depends on it.
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-200">
          Recommended action
        </legend>
        <div className="space-y-3">
          {RECOMMENDATION_OPTIONS.map((option) => (
            <FieldChoice
              key={option.value}
              name={`${baseId}-recommendation`}
              checked={draft.recommendation === option.value}
              disabled={disabled}
              accent={option.value === "offerAcademyPlace" ? "amber" : option.value === "monitor" ? "cyan" : "emerald"}
              recommended={evaluation.recommendedValue?.recommendation === option.value}
              title={option.label}
              description={option.description}
              meta={`Current tone: ${option.value === "monitor" ? "Measured" : option.value === "inviteForTrial" ? "Testing" : "Immediate escalation"}`}
              onSelect={() => applyDraft((current) => ({
                ...current,
                recommendation: option.value,
              }), 4)}
            />
          ))}
        </div>
      </fieldset>
    </div>
  );

  const renderConfidenceChoices = () => (
    <fieldset className="space-y-3">
      <legend className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-200">
        Confidence
      </legend>
      <div className="space-y-3">
        {CONFIDENCE_OPTIONS.map((option) => (
          <FieldChoice
            key={option.value}
            name={`${baseId}-confidence`}
            checked={draft.confidence === option.value}
            disabled={disabled}
            accent={option.value === "robust" ? "amber" : option.value === "tentative" ? "cyan" : "emerald"}
            recommended={evaluation.recommendedValue?.confidence === option.value}
            title={option.label}
            description={option.description}
            meta={selectedCard ? `Cue band on saved evidence: ${formatToken(selectedCard.confidenceBand)}` : "Pick evidence first to compare against the cue band."}
            onSelect={() => applyDraft((current) => ({
              ...current,
              confidence: option.value,
            }))}
          />
        ))}
      </div>
    </fieldset>
  );

  const renderPreview = () => (
    <div
      className={cn(
        "rounded-2xl border p-4",
        preview
          ? "border-emerald-400/25 bg-emerald-400/[0.05]"
          : "border-amber-400/20 bg-amber-400/[0.05]",
      )}
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-400">
            Your draft
          </p>
          <h3 className="mt-1 text-base font-semibold text-white">
            {preview ? "Initial assessment ready" : "Assessment incomplete"}
          </h3>
        </div>
        <span
          className={cn(
            "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
            preview
              ? "border-emerald-300/35 bg-emerald-300/15 text-emerald-100"
              : "border-amber-300/35 bg-amber-300/15 text-amber-100",
          )}
        >
          {preview ? "Ready to file" : `${completedSteps}/${MOBILE_STEPS.length} chosen`}
        </span>
      </div>

      {preview ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm leading-6 text-zinc-100">{preview.generatedSummary}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectionSummary label="Recommendation" value={selectedRecommendation?.label ?? formatToken(preview.recommendation)} />
            <SelectionSummary label="Confidence" value={selectedConfidence?.label ?? formatToken(preview.confidence)} />
            <SelectionSummary label="Claims needing caution" value={preview.overclaimCount > 0 ? `${preview.overclaimCount} to revisit` : "None"} />
            <SelectionSummary label="Evidence strength" value={preview.score.total >= 80 ? "Strong" : preview.score.total >= 60 ? "Credible" : "Developing"} />
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {evaluation.result.errors.length > 0 && (
            <div className="rounded-xl border border-amber-400/25 bg-black/20 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-100">
                <AlertTriangle size={16} aria-hidden="true" />
                Remaining decisions
              </p>
              <ul className="mt-2 space-y-1 text-sm leading-5 text-zinc-200">
                {evaluation.result.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectionSummary label="Evidence" value={selectedCard ? `${selectedCard.minute}' ${selectedCard.summary}` : "Not selected"} />
            <SelectionSummary label="Suggests" value={selectedClaim?.label ?? "Not selected"} />
            <SelectionSummary label="Untested" value={selectedUnknown?.label ?? "Not selected"} />
            <SelectionSummary label="Next action" value={selectedNextTest?.label ?? "Not selected"} />
            <SelectionSummary label="Recommendation" value={selectedRecommendation?.label ?? "Not selected"} />
            <SelectionSummary label="Confidence" value={selectedConfidence?.label ?? "Not selected"} />
          </div>
        </div>
      )}
    </div>
  );

  if (cards.length === 0) {
    return (
      <Card className="border-cyan-400/20 bg-[#0f1519]/95">
        <CardHeader>
          <CardTitle className="text-white">Initial assessment</CardTitle>
          <CardDescription className="text-zinc-300">
            Save at least one observation cue before building the first read on {playerName}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-2xl border border-dashed border-cyan-400/20 bg-cyan-400/[0.04] px-5 py-6 text-sm leading-6 text-zinc-300">
            No evidence cards are available yet. Save a first-hand note before sketching your first read.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-emerald-400/20 bg-[#0f1519]/95 shadow-[0_24px_80px_-48px_rgba(16,185,129,0.45)]">
      <CardHeader className="gap-4 border-b border-white/10 pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-emerald-200">
              <Sparkles size={16} aria-hidden="true" />
              <span className="text-xs font-bold uppercase tracking-[0.16em]">Initial assessment</span>
            </div>
            <CardTitle className="mt-2 text-2xl text-white">
              Shape the first football read on {playerName}
            </CardTitle>
            <CardDescription className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">
              Keep this first read anchored to one saved cue, one explicit claim, one named uncertainty, one next test, and one confidence level. Nothing fills itself in until you choose it.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-3 lg:max-w-xs">
            <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.05] px-4 py-3 text-sm text-zinc-200">
              <p className="font-semibold text-cyan-100">Progress</p>
              <p className="mt-1">{completedSteps} of {MOBILE_STEPS.length} decisions chosen</p>
            </div>
            <p className="text-xs leading-5 text-zinc-400">
              Suggested choices are coaching, not an answer key. Every decision still has to be made and can carry a calibration cost.
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6">
        <p className="sr-only" aria-live="polite">
          {mobileProgressText}
        </p>

        <div className="lg:hidden">
          <div className="mb-4 flex flex-wrap gap-2">
            {MOBILE_STEPS.map((step, index) => {
              const active = index === mobileStep;
              const complete = stepCompletion[index];
              const reachable = canOpenMobileStep(index);
              return (
                <button
                  key={step.id}
                  type="button"
                  disabled={!reachable}
                  onClick={() => setMobileStep(index)}
                  className={cn(
                    "min-h-11 rounded-full border px-3 py-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300",
                    active
                      ? "border-emerald-400/45 bg-emerald-400/[0.12] text-emerald-50"
                      : complete
                        ? "border-cyan-400/35 bg-cyan-400/[0.08] text-cyan-100"
                        : "border-white/10 bg-black/20 text-zinc-400",
                    !reachable && "cursor-not-allowed opacity-50",
                  )}
                >
                  {complete ? <CheckCircle2 size={12} className="mr-1 inline" aria-hidden="true" /> : null}
                  {step.label}
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">
                  Step {mobileStep + 1} of {MOBILE_STEPS.length}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-white">{MOBILE_STEPS[mobileStep].label}</h3>
              </div>
              <div className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.05] px-3 py-1 text-xs font-semibold text-emerald-100">
                {completedSteps}/{MOBILE_STEPS.length} complete
              </div>
            </div>

            <div className="space-y-5">
              {mobileStep === 0 && renderEvidenceChoices()}
              {mobileStep === 1 && renderClaimChoices()}
              {mobileStep === 2 && renderUnknownChoices()}
              {mobileStep === 3 && renderNextActionChoices()}
              {mobileStep === 4 && (
                <div className="space-y-5">
                  {renderConfidenceChoices()}
                  {renderPreview()}
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={mobileStep === 0}
                onClick={() => setMobileStep((current) => Math.max(0, current - 1))}
                className="min-h-11 border-white/10 bg-black/20 text-zinc-100 hover:bg-white/[0.05]"
              >
                <ArrowLeft size={16} className="mr-2" aria-hidden="true" />
                Back
              </Button>
              {mobileStep < MOBILE_STEPS.length - 1 ? (
                <Button
                  type="button"
                  disabled={!stepCompletion[mobileStep]}
                  onClick={() => setMobileStep((current) => Math.min(MOBILE_STEPS.length - 1, current + 1))}
                  className="min-h-11 bg-emerald-600 text-white hover:bg-emerald-500"
                >
                  Next
                  <ArrowRight size={16} className="ml-2" aria-hidden="true" />
                </Button>
              ) : (
                <div className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-4 py-2 text-sm text-emerald-100">
                  Review complete
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="hidden lg:grid lg:grid-cols-[minmax(0,0.92fr)_minmax(340px,1.08fr)] lg:gap-6">
          <div className="space-y-6">
            <section className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.04] p-4">
              <div className="mb-4 flex items-center gap-2">
                <Eye size={16} className="text-cyan-200" aria-hidden="true" />
                <h3 className="text-lg font-semibold text-white">Evidence lane</h3>
              </div>
              {renderEvidenceChoices()}
            </section>

            {selectedCard && (
              <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={16} className="text-emerald-200" aria-hidden="true" />
                  <h3 className="text-lg font-semibold text-white">Selected cue</h3>
                </div>
                <p className="mt-3 text-sm leading-6 text-zinc-100">{selectedCard.detail}</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <SelectionSummary label="Minute" value={`${selectedCard.minute}'`} />
                  <SelectionSummary label="Question" value={formatToken(selectedCard.questionId)} />
                  <SelectionSummary label="Clarity" value={formatToken(selectedCard.clarity)} />
                  <SelectionSummary label="Cue confidence" value={`${Math.round(selectedCard.confidence * 100)}%`} />
                </div>
              </section>
            )}
          </div>

          <div className="space-y-6">
            <section className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4">
              <div className="mb-4 flex items-center gap-2">
                <Gauge size={16} className="text-emerald-200" aria-hidden="true" />
                <h3 className="text-lg font-semibold text-white">Decision lane</h3>
              </div>
              <div className="space-y-6">
                {renderClaimChoices()}
                {renderUnknownChoices()}
                {renderNextActionChoices()}
                {renderConfidenceChoices()}
              </div>
            </section>

            {renderPreview()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
