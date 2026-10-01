import type { ObservationSession } from "./types";

/** The recorded question belongs to the answer, not to a reopened setup default. */
export function getRecordedInquiryQuestion(session: ObservationSession) {
  if (session.mode !== "investigation") return undefined;
  for (const phase of session.phases) {
    for (const decision of Object.values(phase.dialogueChoiceResolutions ?? {})) {
      const inquiry = decision.inquiry;
      if (inquiry && session.players.some((player) => player.playerId === inquiry.playerId)) {
        return inquiry.questionId;
      }
    }
  }
  return undefined;
}
