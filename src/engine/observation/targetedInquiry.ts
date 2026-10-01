import type { HiddenAttribute, HiddenIntel, ScoutingQuestionId } from "../core/types";
import type { ObservationSession } from "./types";
import { SCOUTING_QUESTIONS } from "../scout/evidenceModel";
import { isOpeningDiscoverySession } from "../youth/openingCase";

const RELEVANT_ATTRIBUTES: Record<ScoutingQuestionId, readonly HiddenAttribute[]> = {
  execution: [], decisions: [], movement: [],
  pressure: ["bigGameTemperament"],
  repeatability: ["consistency"],
  projection: ["professionalism"],
};

/** Revisit an attributed account, never invent a witness or turn repetition into corroboration. */
export function shapeTargetedInquiry(
  session: ObservationSession,
  intel: readonly HiddenIntel[],
): ObservationSession {
  if (session.state !== "setup" || session.mode !== "investigation"
    || session.activityType !== "parentCoachMeeting" || isOpeningDiscoverySession(session)
    || !session.scoutingQuestionId || !session.players[0]) return session;
  const phaseIndex = Math.min(1, session.phases.length - 1);
  const phase = session.phases[phaseIndex];
  if (!phase || Object.keys(phase.dialogueChoiceResolutions ?? {}).length > 0
    || Object.keys(phase.selectedDialogueOptionIds ?? {}).length > 0) return session;
  const questionId = session.scoutingQuestionId;
  const player = session.players[0];
  const source = session.sourceContactName?.trim() || "the parent or coach";
  const account = intel.filter((entry) => session.sourceContactId
    && entry.sourceContactId === session.sourceContactId
    && entry.playerId === player.playerId
    && RELEVANT_ATTRIBUTES[questionId].includes(entry.attribute)
    && entry.hint.trim()
    && (entry.recordedSeason === undefined || entry.recordedSeason < session.startedAtSeason
      || (entry.recordedSeason === session.startedAtSeason
        && (entry.recordedWeek ?? 0) <= session.startedAtWeek)))
    .sort((a, b) => (b.recordedSeason ?? 0) - (a.recordedSeason ?? 0)
      || (b.recordedWeek ?? 0) - (a.recordedWeek ?? 0))[0];
  const question = SCOUTING_QUESTIONS.find((entry) => entry.id === questionId)?.label ?? questionId;
  const date = account?.recordedSeason !== undefined && account.recordedWeek !== undefined
    ? `season ${account.recordedSeason}, week ${account.recordedWeek}` : "an unknown date";
  const response = account
    ? `Your notes attribute this account to ${source}, recorded in ${date}: “${account.hint}” This is the same source account, not a fresh observation or independent confirmation.`
    : `You have no attributable account from ${source} that answers this question about ${player.name}. The question remains open; this meeting has not established a new player finding.`;
  const inquiry = {
    playerId: player.playerId, questionId, sourceContactId: session.sourceContactId,
    sourceName: source, status: account ? "recalledAccount" as const : "unanswered" as const,
    statement: account?.hint, recordedWeek: account?.recordedWeek,
    recordedSeason: account?.recordedSeason,
  };
  const node = {
    id: `targeted-inquiry-${phaseIndex}`, speaker: "You",
    text: `Your question about ${player.name}: ${question} Decide what this source can add before treating an account as evidence.`,
    options: [
      { id: "recall-account", text: "Compare this question with the source's recorded account", riskLevel: "safe" as const,
        outcome: { narrativeText: response, insightBonus: 0, inquiry } },
      { id: "check-basis", text: "Check whether the account identifies a specific witnessed event", riskLevel: "safe" as const,
        outcome: { narrativeText: account
          ? `${response} The retained record does not independently verify a witnessed passage. Ask for an example and check it in another context before relying on it.`
          : response, insightBonus: 0, inquiry } },
      { id: "leave-open", text: "Leave the question open for a direct observation", riskLevel: "safe" as const,
        outcome: { narrativeText: `You leave the question about ${player.name} open and reserve judgment until you can observe a relevant passage.`,
          insightBonus: 0, inquiry: { ...inquiry, status: "withheld" as const, statement: undefined } } },
    ],
  };
  return { ...session, phases: session.phases.map((item, index) => index === phaseIndex
    ? { ...item, dialogueNodes: [node] } : item) };
}
