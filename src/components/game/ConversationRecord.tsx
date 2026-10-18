import type { DialogueChoiceResolution } from "@/engine/observation/types";
import { SCOUTING_QUESTIONS } from "@/engine/scout/evidenceModel";

/** Keep testimony readable in both the player dossier and the journal. */
export function ConversationRecord({ decisions }: { decisions?: DialogueChoiceResolution[] }) {
  if (!decisions?.length) return null;
  return (
    <details className="mt-3 border-t border-white/10 pt-2">
      <summary className="cursor-pointer text-xs font-medium text-cyan-200">
        Conversation record · {decisions.length} response{decisions.length === 1 ? "" : "s"}
      </summary>
      <p className="mt-2 text-xs text-zinc-400">Source accounts and your decisions. These are not direct observations.</p>
      <ol className="mt-2 space-y-3">
        {decisions.map((decision) => (
          <li key={`${decision.phaseIndex}-${decision.nodeId}`} className="text-xs leading-relaxed">
            {decision.inquiry && (
              <p className="mb-1 text-cyan-200">
                Question: {SCOUTING_QUESTIONS.find((question) => question.id === decision.inquiry?.questionId)?.label ?? decision.inquiry.questionId}
              </p>
            )}
            {!decision.inquiry && decision.promptText && (
              <p className="mb-1 text-zinc-300">{decision.promptText}</p>
            )}
            <p className="font-medium text-zinc-200">{decision.optionText}</p>
            <p className="text-zinc-400">{decision.sourceName ?? decision.inquiry?.sourceName ?? "Source not recorded"}</p>
            <p className="mt-1 text-zinc-300">{decision.narrativeText}</p>
          </li>
        ))}
      </ol>
    </details>
  );
}
