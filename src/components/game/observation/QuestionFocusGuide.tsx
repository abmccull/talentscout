import type { ScoutingQuestionId } from "@/engine/core/types";
import type { LensType } from "@/engine/observation/types";
import { SCOUTING_QUESTIONS } from "@/engine/scout/evidenceModel";
import { LENS_VISUAL } from "./lensVisual";

function skillName(skill: string): string {
  return skill.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}

/** Explain the actual question definition; this view never changes the question or focus. */
export function QuestionFocusGuide({ questionId, placement, currentLens }: {
  questionId?: ScoutingQuestionId;
  placement: "setup" | "attention";
  currentLens?: LensType;
}) {
  const question = SCOUTING_QUESTIONS.find((entry) => entry.id === questionId);
  if (!question) return null;
  const skill = skillName(question.primarySkill);
  const lens = LENS_VISUAL[question.lens].label;
  const mismatched = currentLens && currentLens !== question.lens;

  return (
    <div className="mt-3 text-xs leading-5 text-zinc-300">
      {placement === "attention" && <p className="font-medium text-zinc-200">Question: {question.matchFocus}</p>}
      <p>Uses your {skill}. <span className="text-[var(--primary)]">{lens} focus fits this question.</span></p>
      {mismatched && (
        <p className="mt-1 text-zinc-400">{LENS_VISUAL[currentLens].label} focus does not change the question; it still uses {skill}.</p>
      )}
    </div>
  );
}

export function QuestionLensMatch({ questionId, lens }: { questionId?: ScoutingQuestionId; lens: LensType }) {
  const question = SCOUTING_QUESTIONS.find((entry) => entry.id === questionId);
  if (!question || question.lens !== lens) return null;
  return <span aria-hidden="true" className="text-[10px] font-semibold text-[var(--primary)]">Fits question</span>;
}
