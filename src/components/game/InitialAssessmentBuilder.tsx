"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
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
import { ChoiceCard } from "@/components/ui/ChoiceCard";
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
  onProgressChange?: (completedSteps: number) => void;
  disabled?: boolean;
}

const ASSESSMENT_STEPS = [
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

function FieldChoice({
  checked,
  disabled,
  name,
  value,
  title,
  description,
  meta,
  onSelect,
  recommended = false,
}: {
  checked: boolean;
  disabled?: boolean;
  name: string;
  value: string;
  title: string;
  description: string;
  meta?: React.ReactNode;
  accent?: "emerald" | "cyan" | "amber";
  onSelect: () => void;
  recommended?: boolean;
}) {
  return (
    <ChoiceCard
      type="radio"
      name={name}
      value={value}
      selected={checked}
      disabled={disabled}
      disabledReason={disabled ? "This judgment is locked." : undefined}
      onSelect={onSelect}
      className="rounded-none border-0 border-b border-[color:var(--border)] px-3 py-3"
    >
      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-sm font-semibold text-[color:var(--foreground)]">{title}</span>
        {recommended && <span className="text-xs font-medium text-[color:var(--primary)]">Suggested</span>}
      </span>
      <span className="mt-1 block text-sm leading-6 text-[color:var(--muted-foreground)]">{description}</span>
      {meta && <span className="mt-2 block text-xs leading-5 text-[color:var(--muted-foreground)]">{meta}</span>}
    </ChoiceCard>
  );
}

export function InitialAssessmentBuilder({
  cards,
  playerName,
  value,
  onChange,
  onResultChange,
  onProgressChange,
  disabled = false,
}: InitialAssessmentBuilderProps) {
  const baseId = useId();
  const [draft, setDraft] = useState<AssessmentDraft>(value ?? {});
  const [editorStep, setEditorStep] = useState(value ? 4 : 0);

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
  useEffect(() => {
    onProgressChange?.(completedSteps);
  }, [completedSteps, onProgressChange]);
  const firstIncompleteStep = stepCompletion.findIndex((complete) => !complete);
  // An upstream edit must reopen any invalidated decision before later steps.
  const activeStep = Math.min(editorStep, firstIncompleteStep < 0 ? 4 : firstIncompleteStep);
  const progressText = `Initial assessment step ${activeStep + 1} of ${ASSESSMENT_STEPS.length}. ${completedSteps} of ${ASSESSMENT_STEPS.length} steps complete. Current step: ${ASSESSMENT_STEPS[activeStep].label}.`;
  const previousStep = useRef(activeStep);

  useEffect(() => {
    if (previousStep.current !== activeStep) {
      document.getElementById(`${baseId}-${ASSESSMENT_STEPS[activeStep].id}-heading`)?.focus({ preventScroll: true });
      previousStep.current = activeStep;
    }
  }, [activeStep, baseId]);

  const canOpenStep = (index: number): boolean => {
    if (index === 0) return true;
    return stepCompletion.slice(0, index).every(Boolean);
  };

  const applyDraft = (updater: (current: AssessmentDraft) => AssessmentDraft, nextStep?: number) => {
    setDraft((current) => updater(current));
    if (nextStep !== undefined) {
      setEditorStep((current) => (current === nextStep - 1 ? nextStep : current));
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
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-[color:var(--foreground)]">
        Saved evidence
      </legend>
      <div className="space-y-2">
        {cards.map((card) => {
          const checked = draft.evidenceCardId === card.id;
          const recommended = evaluation.recommendedValue?.evidenceCardId === card.id;
          return (
            <FieldChoice
              key={card.id}
              name={`${baseId}-evidence`}
              value={card.id}
              checked={checked}
              disabled={disabled}
              accent="cyan"
              recommended={recommended}
              title={`${card.minute}' ${card.summary}`}
              description={card.detail}
              meta={(
                <span className="flex flex-wrap gap-x-3 gap-y-1">
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
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-[color:var(--foreground)]">
        What it suggests
      </legend>
      {selectedCard ? (
        <div className="space-y-2">
          {claimOptions.map((option, index) => (
            <FieldChoice
              key={option.id}
              name={`${baseId}-claim`}
              value={option.id}
              checked={draft.claimOptionId === option.id}
              disabled={disabled}
              accent="emerald"
              recommended={index === 0}
              title={option.label}
              description={option.statement}
              meta={`${formatToken(option.category)} · ${formatToken(option.support)} support`}
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
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-[color:var(--foreground)]">
        What remains untested
      </legend>
      {selectedCard ? (
        <div className="space-y-2">
          {unknownOptions.map((option, index) => (
            <FieldChoice
              key={option.id}
              name={`${baseId}-unknown`}
              value={option.id}
              checked={draft.unknownOptionId === option.id}
              disabled={disabled}
              accent="amber"
              recommended={index === 0}
              title={option.label}
              description={option.statement}
              meta={`${formatToken(option.recommendedQuestionId)} · ${option.contextRequirement}`}
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
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-[color:var(--foreground)]">
          Next test
        </legend>
        {selectedUnknown ? (
          <div className="space-y-2">
            {nextTestOptions.map((option, index) => (
              <FieldChoice
                key={option.id}
                name={`${baseId}-next-test`}
                value={option.id}
                checked={draft.nextTestId === option.id}
                disabled={disabled}
                accent="cyan"
                recommended={index === 0}
                title={option.label}
                description={option.description}
                meta={`${formatToken(option.activityType)} · ${option.contextRequirement}`}
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

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-[color:var(--foreground)]">
          Recommended action
        </legend>
        <div className="space-y-2">
          {RECOMMENDATION_OPTIONS.map((option) => (
            <FieldChoice
              key={option.value}
              name={`${baseId}-recommendation`}
              value={option.value}
              checked={draft.recommendation === option.value}
              disabled={disabled}
              accent={option.value === "offerAcademyPlace" ? "amber" : option.value === "monitor" ? "cyan" : "emerald"}
              recommended={evaluation.recommendedValue?.recommendation === option.value}
              title={option.label}
              description={option.description}
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
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-[color:var(--foreground)]">
        Confidence
      </legend>
      {selectedCard && (
        <p className="text-sm leading-6 text-[color:var(--muted-foreground)]">
          Saved cue: {formatToken(selectedCard.confidenceBand).toLowerCase()}. Choose the conviction you can defend.
        </p>
      )}
      <div className="space-y-2">
        {CONFIDENCE_OPTIONS.map((option) => (
          <FieldChoice
            key={option.value}
            name={`${baseId}-confidence`}
            value={option.value}
            checked={draft.confidence === option.value}
            disabled={disabled}
            accent={option.value === "robust" ? "amber" : option.value === "tentative" ? "cyan" : "emerald"}
            recommended={evaluation.recommendedValue?.confidence === option.value}
            title={option.label}
            description={option.description}
            onSelect={() => applyDraft((current) => ({
              ...current,
              confidence: option.value,
            }))}
          />
        ))}
      </div>
    </fieldset>
  );

  const stepSummaries = [
    selectedCard ? `${selectedCard.minute}' ${selectedCard.summary}` : "Choose a passage worth keeping",
    selectedClaim?.label ?? "Make a claim the cue can support",
    selectedUnknown?.label ?? "Name what you still need to learn",
    [selectedNextTest?.label, selectedRecommendation?.label].filter(Boolean).join(" · ") || "Set the next test and recommendation",
    selectedConfidence?.label ?? "Choose the conviction you can defend",
  ];
  const renderStep = [renderEvidenceChoices, renderClaimChoices, renderUnknownChoices, renderNextActionChoices, renderConfidenceChoices];

  const renderPreview = () => (
    <div className="border-t-2 border-[color:var(--primary)] bg-[color:var(--surface)] px-5 py-5 sm:px-6">
      <p className="dossier-eyebrow">Scouting dossier · First assessment</p>
      <h3 className="font-editorial mt-2 text-2xl leading-tight text-[color:var(--foreground)]">{playerName}</h3>
      {preview ? (
        <p className="mt-5 text-base leading-7 text-[color:var(--foreground)]">{preview.generatedSummary}</p>
      ) : selectedCard ? (
        <div className="mt-5 space-y-4 text-sm leading-6 text-[color:var(--foreground)]">
          <p><span className="font-semibold text-[color:var(--primary)]">{selectedCard.minute}&prime; </span>{selectedCard.detail}</p>
          {selectedClaim && <p>{selectedClaim.statement}</p>}
          {selectedUnknown && <p><span className="font-semibold">Still untested. </span>{selectedUnknown.statement}</p>}
          {selectedNextTest && <p><span className="font-semibold">Next look. </span>{selectedNextTest.description}</p>}
        </div>
      ) : (
        <p className="mt-5 text-sm leading-6 text-[color:var(--muted-foreground)]">
          Start with the passage you kept. Your evidence and judgment will form the first entry in this player&apos;s case.
        </p>
      )}
      {(selectedRecommendation || selectedConfidence) && (
        <dl className="dossier-section mt-5 grid gap-4 pb-0 sm:grid-cols-2">
          {selectedRecommendation && <div><dt className="dossier-eyebrow">Recommendation</dt><dd className="mt-1 text-sm font-semibold">{selectedRecommendation.label}</dd></div>}
          {selectedConfidence && <div><dt className="dossier-eyebrow">Confidence</dt><dd className="mt-1 text-sm font-semibold">{selectedConfidence.label}</dd></div>}
        </dl>
      )}
      {preview && preview.overclaimCount > 0 && (
        <p className="mt-5 flex items-start gap-2 text-sm leading-6 text-[color:var(--signal-warn)]">
          <AlertTriangle size={17} className="mt-1 shrink-0" aria-hidden="true" />
          {preview.overclaimCount} {preview.overclaimCount === 1 ? "claim needs" : "claims need"} cautious wording. Review the weight you have put on this cue.
        </p>
      )}
      {evaluation.complete && !evaluation.result.valid && (
        <ul className="mt-5 space-y-2 text-sm leading-6 text-[color:var(--signal-warn)]">
          {evaluation.result.errors.map((error) => <li key={error}>{error}</li>)}
        </ul>
      )}
    </div>
  );

  if (cards.length === 0) {
    return (
      <div className="dossier-section">
        <h2 className="font-editorial text-2xl">A first-hand cue comes first</h2>
        <p className="mt-3 max-w-prose text-sm leading-6 text-[color:var(--muted-foreground)]">
          Save at least one observation cue before building the first read on {playerName}.
        </p>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-9">
      <div className="min-w-0">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="font-editorial text-2xl text-[color:var(--foreground)]">Your judgment</h2>
          <p className="shrink-0 text-xs text-[color:var(--muted-foreground)]">{completedSteps} / {ASSESSMENT_STEPS.length} decisions</p>
        </div>
        <p className="sr-only" aria-live="polite">{progressText}</p>
        <div className="border-t border-[color:var(--border)]">
          {ASSESSMENT_STEPS.map((step, index) => {
            const active = index === activeStep;
            const complete = stepCompletion[index];
            return (
              <section key={step.id} className="border-b border-[color:var(--border)]">
                <h3>
                  <button
                    id={`${baseId}-${step.id}-heading`}
                    type="button"
                    aria-expanded={active}
                    aria-controls={`${baseId}-${step.id}-panel`}
                    disabled={!canOpenStep(index)}
                    onClick={() => setEditorStep(index)}
                    className={cn(
                      "flex min-h-16 w-full items-start gap-3 py-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ring)] disabled:cursor-not-allowed",
                      active ? "text-[color:var(--foreground)]" : "text-[color:var(--muted-foreground)]",
                    )}
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-xs tabular-nums text-[color:var(--primary)]" aria-hidden="true">
                      {complete ? <CheckCircle2 size={18} /> : String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{step.label}</span>
                      {!active && <span className="mt-1 block text-sm leading-5">{stepSummaries[index]}</span>}
                    </span>
                    <ChevronDown size={17} className={cn("mt-1 shrink-0 transition-transform", active && "rotate-180")} aria-hidden="true" />
                  </button>
                </h3>
                <div
                  id={`${baseId}-${step.id}-panel`}
                  role="region"
                  aria-labelledby={`${baseId}-${step.id}-heading`}
                  hidden={!active}
                  className="pb-5 sm:pl-8"
                >
                  {renderStep[index]()}
                </div>
              </section>
            );
          })}
        </div>
        <p className="mt-4 text-xs leading-5 text-[color:var(--muted-foreground)]">
          Suggestions guide the read. The final judgment is yours.
        </p>
      </div>
      <aside className="hidden min-w-0 lg:sticky lg:top-28 lg:block" aria-label="Dossier preview">
        {renderPreview()}
      </aside>
      <details className="group min-w-0 border-t border-[color:var(--border)] lg:hidden" open={Boolean(preview) || undefined}>
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--ring)]">
          Read your dossier
          <ChevronDown size={17} className="group-open:rotate-180" aria-hidden="true" />
        </summary>
        {renderPreview()}
      </details>
    </div>
  );
}
