import type { Contact } from "../core/types";
import type { DialogueChoiceResolution, ObservationSession } from "./types";
import { getRecordedInquiryQuestion } from "./inquiryQuestion";
import { SCOUTING_QUESTIONS } from "../scout/evidenceModel";

function sameInquiryWeek(contact: Contact, session: ObservationSession): boolean {
  return contact.inquiryDecisions?.occurredAt.week === session.startedAtWeek
    && contact.inquiryDecisions.occurredAt.season === session.startedAtSeason;
}

function decisionKey(session: ObservationSession, phaseIndex: number, nodeId: string): string {
  return JSON.stringify([session.activityInstanceId ?? session.id, phaseIndex, nodeId]);
}

/** Reopening an inquiry resumes its locked answers; it does not replay their contact effects. */
export function restoreInquiryDecisions(
  session: ObservationSession,
  contact: Contact | undefined,
): ObservationSession {
  if (!contact || session.sourceContactId !== contact.id) return session;
  const resolutions = sameInquiryWeek(contact, session)
    ? contact.inquiryDecisions?.resolutions ?? {}
    : {};
  let restoredInsight = 0;
  let restored = false;
  const phases = session.phases.map((phase) => {
    let updated = phase;
    for (const node of phase.dialogueNodes ?? []) {
      if (phase.dialogueChoiceResolutions?.[node.id] || phase.selectedDialogueOptionIds?.[node.id]) continue;
      const resolution = resolutions[decisionKey(session, phase.index, node.id)];
      if (!resolution || resolution.sourceContactId !== contact.id) continue;
      if (resolution.inquiry && !session.players.some((player) => player.playerId === resolution.inquiry?.playerId)) continue;
      restored = true;
      restoredInsight += resolution.insightPointsAwarded;
      updated = {
        ...updated,
        dialogueNodes: updated.dialogueNodes?.map((candidate) => candidate.id === node.id ? {
          ...candidate,
          text: resolution.promptText ?? (resolution.inquiry
            ? `Recorded inquiry: ${SCOUTING_QUESTIONS.find((question) => question.id === resolution.inquiry?.questionId)?.label ?? resolution.inquiry.questionId}`
            : candidate.text),
        } : candidate),
        selectedDialogueOptionIds: { ...updated.selectedDialogueOptionIds, [node.id]: resolution.optionId },
        dialogueChoiceResolutions: { ...updated.dialogueChoiceResolutions, [node.id]: resolution },
      };
    }
    return updated;
  });
  if (!restored && session.sourceRelationshipScore === contact.relationship) return session;
  return {
    ...session,
    phases,
    scoutingQuestionId: getRecordedInquiryQuestion({ ...session, phases }) ?? session.scoutingQuestionId,
    insightPointsEarned: session.insightPointsEarned + restoredInsight,
    sourceRelationshipScore: contact.relationship,
  };
}

/** Both favorable and unfavorable consequences commit once per scheduled decision. */
export function recordInquiryDecision(
  contact: Contact,
  session: ObservationSession,
  resolution: DialogueChoiceResolution,
): Contact {
  const currentWeek = sameInquiryWeek(contact, session);
  const resolutions = currentWeek ? contact.inquiryDecisions?.resolutions ?? {} : {};
  const key = decisionKey(session, resolution.phaseIndex, resolution.nodeId);
  if (resolutions[key]) return contact;
  const relationship = Math.max(0, Math.min(100, contact.relationship + resolution.relationshipDeltaApplied));
  const occurredAt = { season: session.startedAtSeason, week: session.startedAtWeek };
  return {
    ...contact,
    relationship,
    lastInteractionAt: occurredAt,
    dormant: relationship <= 20,
    inquiryDecisions: {
      occurredAt,
      resolutions: { ...resolutions, [key]: resolution },
    },
  };
}
