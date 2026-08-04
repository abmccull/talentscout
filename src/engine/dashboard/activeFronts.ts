import type { GameState } from "@/engine/core/types";
import type { DashboardActionTarget, DashboardCareerThread } from "./types";
import {
  projectActiveCareerFronts,
  type ActiveCareerFront,
  type ActiveCareerFrontUrgency,
} from "@/engine/career/activeCareerFronts";
import {
  projectWeeklyProspectFollowUps,
  type ProspectFollowUpBeat,
} from "@/engine/youth/prospectFollowUps";

export interface DashboardActiveFront {
  id: string;
  family: "stalled_pathway" | "pathway_follow_up";
  caseId?: string;
  playerId: string;
  reportId?: string;
  title: string;
  summary: string;
  explanation: string;
  consequence: string;
  actionLabel: string;
  actionTarget: DashboardActionTarget;
  sourceActionTarget: DashboardActionTarget;
  evidenceIds: string[];
  lastUpdatedAt: {
    season: number;
    week: number;
  };
  significance: number;
  tone: "positive" | "neutral" | "negative";
  urgency?: ActiveCareerFrontUrgency;
  beat?: ProspectFollowUpBeat;
  careerFront?: ActiveCareerFront;
}

function uniqueIds(ids: Array<string | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
}

function getPlayerName(state: GameState, playerId: string): string {
  const player = state.players[playerId] ?? state.retiredPlayers?.[playerId];
  return player ? `${player.firstName} ${player.lastName}` : "A former prospect";
}

function getLatestReportIdForCase(state: GameState, caseId: string): string | undefined {
  const scoutingCase = state.scoutingCases?.[caseId];
  return scoutingCase?.activeReportId ?? scoutingCase?.reportIds.at(-1);
}

function actionLabelFor(beat: ProspectFollowUpBeat["suggestedActivity"]): string {
  switch (beat) {
    case "trainingVisit":
      return "Plan training visit";
    case "parentCoachMeeting":
      return "Plan parent and coach meeting";
    default:
      return "Plan follow-up session";
  }
}

function titleFor(state: GameState, beat: ProspectFollowUpBeat): string {
  const name = getPlayerName(state, beat.playerId);
  if (beat.stage === "accountability") return `${name}: revisit the pathway you backed`;
  return `${name}: the next pathway decision is live`;
}

function consequenceFor(beat: ProspectFollowUpBeat): string {
  if (beat.stage === "accountability") {
    return "If you leave it alone, the original call hardens into a verdict you explain afterward instead of a live intervention.";
  }
  return "If you wait, this evidence window passes and the next pathway decision will be made without your follow-up.";
}

function threadForFront(front: DashboardActiveFront): DashboardCareerThread {
  return {
    id: `career-thread:${front.id}`,
    type: "active_front",
    primaryItemId: front.id,
    relatedItemIds: uniqueIds([
      front.caseId,
      front.playerId,
      front.reportId,
      ...front.evidenceIds,
    ]),
    playerId: front.playerId,
    caseId: front.caseId,
    reportId: front.reportId,
    title: front.title,
    summary: front.summary,
    whatHappened: front.careerFront
      ? front.careerFront.stakes
      : front.beat
        ? [
            front.beat.update,
            ...(front.beat.comparisonSummary ? [`FOLLOW-UP COMPARISON: ${front.beat.comparisonSummary}`] : []),
            ...(front.beat.contextChange ? [`CONTEXT CHANGE: ${front.beat.contextChange}`] : []),
            `UNRESOLVED: ${front.beat.unresolvedQuestion}`,
            `ACCOUNTABILITY: ${front.beat.accountabilitySummary}`,
          ]
        : [front.explanation],
    careerImpact: front.consequence,
    actionTarget: front.sourceActionTarget,
    evidenceIds: front.evidenceIds,
    lastUpdatedAt: front.lastUpdatedAt,
    archived: false,
    significance: front.significance,
    tone: front.tone,
  };
}

export function buildDashboardActiveFronts(state: GameState): DashboardActiveFront[] {
  if (state.scout?.primarySpecialization !== "youth") return [];
  const stalledFronts: DashboardActiveFront[] = projectActiveCareerFronts(state).map((front) => {
    const decisionOffered = front.decisionStatus === "offered";
    return {
      id: front.id,
      family: "stalled_pathway" as const,
      caseId: front.caseId,
      playerId: front.playerId,
      reportId: front.reportId,
      title: front.title,
      summary: front.premise,
      explanation: front.stakes.join(" "),
      consequence: decisionOffered
        ? "Choose a response now; the simulated career will revisit it in eight weeks."
        : "The route is live pressure now. Leaving it alone keeps your original judgment exposed.",
      actionLabel: decisionOffered ? "Choose pathway response" : "Plan pathway review",
      actionTarget: decisionOffered
        ? {
            screen: "inbox",
            decisionId: front.decisionId,
            relatedId: front.playerId,
          }
        : {
            screen: "calendar",
            week: state.currentWeek,
            season: state.currentSeason,
            playerId: front.playerId,
            focusActivityType: front.trigger === "released" ? "followUpSession" : "trainingVisit",
          },
      sourceActionTarget: front.reportId || front.caseId
        ? {
            screen: "reportHistory",
            reportId: front.reportId,
            caseId: front.caseId,
            playerId: front.playerId,
          }
        : {
            screen: "alumniDashboard",
            alumniRecordId: front.alumniRecordId,
            playerId: front.playerId,
          },
      evidenceIds: front.evidenceIds,
      lastUpdatedAt: {
        season: state.currentSeason,
        week: state.currentWeek,
      },
      significance: front.score / 100,
      tone: "negative" as const,
      urgency: front.urgency,
      careerFront: front,
    };
  });
  const stalledPlayerIds = new Set(stalledFronts.map((front) => front.playerId));
  const followUpFronts: DashboardActiveFront[] = projectWeeklyProspectFollowUps(state)
    .filter((beat) => beat.pathway === "placed" && beat.stage !== "early-check")
    .filter((beat) => !stalledPlayerIds.has(beat.playerId))
    .map((beat) => {
      const reportId = getLatestReportIdForCase(state, beat.caseId);
      return {
        id: `active-front:${beat.id}`,
        family: "pathway_follow_up" as const,
        caseId: beat.caseId,
        playerId: beat.playerId,
        reportId,
        title: titleFor(state, beat),
        summary: beat.update,
        explanation: `${beat.caseQuestion} ${beat.unresolvedQuestion}`,
        consequence: consequenceFor(beat),
        actionLabel: actionLabelFor(beat.suggestedActivity),
        actionTarget: {
          screen: "calendar",
          week: state.currentWeek,
          season: state.currentSeason,
          playerId: beat.playerId,
          focusActivityType: beat.suggestedActivity,
        },
        sourceActionTarget: reportId || beat.caseId
          ? {
              screen: "reportHistory",
              reportId,
              caseId: beat.caseId,
              playerId: beat.playerId,
            }
          : {
              screen: "playerProfile",
              playerId: beat.playerId,
            },
        evidenceIds: uniqueIds([
          beat.id,
          beat.caseId,
          beat.playerId,
          beat.clubId,
          reportId,
        ]),
        lastUpdatedAt: {
          season: state.currentSeason,
          week: state.currentWeek,
        },
        significance: beat.stage === "accountability" ? 0.95 : 0.82,
        tone: beat.stage === "accountability" ? "negative" : "neutral",
        beat,
      };
    });
  return [...stalledFronts, ...followUpFronts];
}

export function buildDashboardActiveFrontThreads(state: GameState): DashboardCareerThread[] {
  return buildDashboardActiveFronts(state).map((front) => threadForFront(front));
}
