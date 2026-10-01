import type { DialogueChoiceResolution } from "@/engine/observation/types";
import { SCOUTING_QUESTIONS } from "./evidenceModel";

/** Conversation accounts preserve questions, not verified player findings. */
export function getConversationInquiryQuestions(
  decisions: readonly DialogueChoiceResolution[],
  playerIds?: ReadonlySet<string>,
) {
  const questions = new Map<string, { playerId: string; questionId: string; label: string }>();
  for (const decision of decisions) {
    const inquiry = decision.inquiry;
    if (!inquiry || (playerIds && !playerIds.has(inquiry.playerId))) continue;
    const question = SCOUTING_QUESTIONS.find(item => item.id === inquiry.questionId);
    if (!question) continue;
    const key = `${inquiry.playerId}:${inquiry.questionId}`;
    questions.set(key, { playerId: inquiry.playerId, questionId: question.id, label: question.label });
  }
  return [...questions.values()];
}
