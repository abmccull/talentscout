import type {
  ClubDecision,
  GameState,
  InboxMessage,
  ScoutReport,
  ScoutingCase,
} from "@/engine/core/types";
import {
  createGameCalendarIndex,
  gameWeeksBetweenWithCalendar,
  type GameCalendarIndex,
} from "@/engine/core/gameDate";
import { createNamedRNG } from "@/engine/run";
import {
  buildScoutingCaseDepth,
  buildScoutingCaseDepthIndex,
  type ScoutingCaseDepthIndex,
} from "@/engine/reports/scoutingCases";

export type ProspectFollowUpStage = "early-check" | "decision-point" | "accountability";
export type ProspectFollowUpPathway = "placed" | "shortlisted";

export interface ProspectFollowUpBeat {
  id: string;
  caseId: string;
  playerId: string;
  clubId?: string;
  stage: ProspectFollowUpStage;
  pathway: ProspectFollowUpPathway;
  title: string;
  update: string;
  caseQuestion: string;
  unresolvedQuestion: string;
  comparisonSummary?: string;
  contextChange?: string;
  accountabilitySummary: string;
  suggestedActivity: "followUpSession" | "parentCoachMeeting" | "trainingVisit";
  message: InboxMessage;
}
interface FollowUpAnchor {
  pathway: ProspectFollowUpPathway;
  week: number;
  season: number;
  clubId?: string;
  sourceId: string;
}

interface BeatTemplate {
  update: string;
  unresolvedQuestion: string;
  suggestedActivity: ProspectFollowUpBeat["suggestedActivity"];
}

interface FollowUpProjectionIndex {
  calendar: GameCalendarIndex;
  caseDepth: ScoutingCaseDepthIndex;
}

const FOLLOW_UP_STAGES: ReadonlyArray<{
  stage: ProspectFollowUpStage;
  dueAfterWeeks: number;
}> = [
  { stage: "early-check", dueAfterWeeks: 2 },
  { stage: "decision-point", dueAfterWeeks: 6 },
  { stage: "accountability", dueAfterWeeks: 18 },
];

const FOLLOW_UP_WINDOW_WEEKS = 24;

const PLACED_EARLY_TEMPLATES: readonly BeatTemplate[] = [
  {
    update: "The academy staff report that the first training block has exposed a gap between the football plan and the support the player needs away from the pitch.",
    unresolvedQuestion: "Is this normal settling-in friction, or does the family and education plan need to change before it affects development?",
    suggestedActivity: "parentCoachMeeting",
  },
  {
    update: "The player has entered the academy group, but the coach is still deciding which role and training level will produce useful minutes rather than safe peripheral work.",
    unresolvedQuestion: "Should you verify the role in training now, or let the staff complete the first adaptation block?",
    suggestedActivity: "trainingVisit",
  },
  {
    update: "Early feedback is encouraging, though the family describes the weekly routine as more demanding than the placement conversation suggested.",
    unresolvedQuestion: "Does the support network match the pathway you recommended, and what evidence would change your view?",
    suggestedActivity: "parentCoachMeeting",
  },
];

const PLACED_LATE_TEMPLATES: readonly BeatTemplate[] = [
  {
    update: "The novelty of the move has worn off. Selection, education and recovery demands are now competing for the same week.",
    unresolvedQuestion: "Is the pathway still developing the player, or should you challenge the role and support plan before the pattern hardens?",
    suggestedActivity: "followUpSession",
  },
  {
    update: "The club can now point to a real training trend, but the player has not yet received the match exposure implied by the original pathway.",
    unresolvedQuestion: "Do you stand behind the timetable, seek a clearer milestone, or reopen the fit question with new evidence?",
    suggestedActivity: "trainingVisit",
  },
  {
    update: "A second academy group has begun monitoring the situation while the current club weighs how quickly to increase the player's responsibility.",
    unresolvedQuestion: "Should outside interest create urgency, or is protecting a stable adaptation block still the better judgment?",
    suggestedActivity: "followUpSession",
  },
];

const SHORTLIST_EARLY_TEMPLATES: readonly BeatTemplate[] = [
  {
    update: "The club has kept the player live in its process, but the staff want one clearer answer before committing scarce academy time.",
    unresolvedQuestion: "Which context would most efficiently test the remaining doubt without repeating the evidence already filed?",
    suggestedActivity: "followUpSession",
  },
  {
    update: "The initial recommendation created interest. A coach has now raised a role-specific concern that the first report could not settle.",
    unresolvedQuestion: "Do you test the concern in training, or preserve your current recommendation until a competitive sample appears?",
    suggestedActivity: "trainingVisit",
  },
  {
    update: "The player's family understands that the club is interested, but the timetable and practical support remain vague.",
    unresolvedQuestion: "Should welfare and education readiness become part of the next recommendation revision?",
    suggestedActivity: "parentCoachMeeting",
  },
];

const SHORTLIST_LATE_TEMPLATES: readonly BeatTemplate[] = [
  {
    update: "The club has not closed the file, but another recruitment cycle is beginning to compete for the same place and staff attention.",
    unresolvedQuestion: "Is the missing evidence worth another week, or has the opportunity cost changed the recommendation itself?",
    suggestedActivity: "followUpSession",
  },
  {
    update: "The trial conversation has moved from ability to pathway: minutes, coaching ownership and the level of the first competitive assignment.",
    unresolvedQuestion: "Can you defend a specific development plan, or should the player remain available to a different environment?",
    suggestedActivity: "trainingVisit",
  },
  {
    update: "Interest remains genuine, although the family and club now describe different versions of what the next season would demand.",
    unresolvedQuestion: "Which promise needs to be made explicit before your recommendation can stay credible?",
    suggestedActivity: "parentCoachMeeting",
  },
];

const PLACED_ACCOUNTABILITY_TEMPLATES: readonly BeatTemplate[] = [
  {
    update: "Enough time has passed for the original recommendation to be compared with the player's actual pathway rather than the excitement of the move.",
    unresolvedQuestion: "Which part of the original judgment has held, which part needs revision, and what should you learn before staking the same conviction again?",
    suggestedActivity: "trainingVisit",
  },
  {
    update: "The placement now has a real body of training, selection, and support evidence behind it.",
    unresolvedQuestion: "Does the current pathway still justify the opportunity you recommended, or has the evidence moved the case somewhere else?",
    suggestedActivity: "followUpSession",
  },
  {
    update: "The club and family can now describe consequences that were impossible to know on placement day.",
    unresolvedQuestion: "What would you defend in a review meeting, and what would you explicitly revise?",
    suggestedActivity: "parentCoachMeeting",
  },
];

const SHORTLIST_ACCOUNTABILITY_TEMPLATES: readonly BeatTemplate[] = [
  {
    update: "The recommendation has remained open long enough for delay itself to become part of the decision.",
    unresolvedQuestion: "Has new evidence strengthened the case, or is the continued uncertainty now a reason to withdraw the original urgency?",
    suggestedActivity: "followUpSession",
  },
  {
    update: "A later recruitment cycle is now judging the player against a different set of needs and alternatives.",
    unresolvedQuestion: "Should you revise the fit, defend the original football read, or close the case without forcing a conclusion?",
    suggestedActivity: "trainingVisit",
  },
  {
    update: "The family and club have both lived with the uncertainty created by the original shortlist.",
    unresolvedQuestion: "What promise or condition must become concrete before keeping your recommendation active?",
    suggestedActivity: "parentCoachMeeting",
  },
];

function latestDecision(
  decisions: readonly ClubDecision[],
  outcomes: ReadonlySet<ClubDecision["outcome"]>,
): ClubDecision | undefined {
  let latest: ClubDecision | undefined;
  for (const decision of decisions) {
    if (!outcomes.has(decision.outcome)) continue;
    if (
      !latest
      || decision.decidedSeason > latest.decidedSeason
      || (
        decision.decidedSeason === latest.decidedSeason
        && decision.decidedWeek > latest.decidedWeek
      )
      || (
        decision.decidedSeason === latest.decidedSeason
        && decision.decidedWeek === latest.decidedWeek
        && decision.id.localeCompare(latest.id) > 0
      )
    ) {
      latest = decision;
    }
  }
  return latest;
}

function latestShortlistedReport(
  state: GameState,
  scoutingCase: ScoutingCase,
  index: FollowUpProjectionIndex,
): ScoutReport | undefined {
  const reports = new Map(
    (index.caseDepth.reportsByCaseId.get(scoutingCase.id) ?? []).map((report) => [report.id, report]),
  );
  for (const reportId of scoutingCase.reportIds ?? []) {
    const report = state.reports?.[reportId];
    if (report) reports.set(report.id, report);
  }

  let latest: ScoutReport | undefined;
  for (const report of reports.values()) {
    if (report.clubResponse !== "shortlisted") continue;
    if (
      !latest
      || report.submittedSeason > latest.submittedSeason
      || (
        report.submittedSeason === latest.submittedSeason
        && report.submittedWeek > latest.submittedWeek
      )
      || (
        report.submittedSeason === latest.submittedSeason
        && report.submittedWeek === latest.submittedWeek
        && report.id.localeCompare(latest.id) > 0
      )
    ) {
      latest = report;
    }
  }
  return latest;
}

function resolveAnchor(
  state: GameState,
  scoutingCase: ScoutingCase,
  index: FollowUpProjectionIndex,
): FollowUpAnchor | undefined {
  const decisions = new Map(
    (index.caseDepth.decisionsByCaseId.get(scoutingCase.id) ?? []).map((decision) => [decision.id, decision]),
  );
  for (const decisionId of scoutingCase.decisionIds ?? []) {
    const decision = state.clubDecisions?.[decisionId];
    if (decision) decisions.set(decision.id, decision);
  }
  const caseDecisions = [...decisions.values()];
  const accepted = latestDecision(caseDecisions, new Set(["accepted"]));
  if (accepted) {
    return {
      pathway: "placed",
      week: accepted.decidedWeek,
      season: accepted.decidedSeason,
      clubId: accepted.clubId,
      sourceId: accepted.id,
    };
  }

  const activeDecision = latestDecision(
    caseDecisions,
    new Set(["trial", "followUpRequested"]),
  );
  if (activeDecision) {
    return {
      pathway: "shortlisted",
      week: activeDecision.decidedWeek,
      season: activeDecision.decidedSeason,
      clubId: activeDecision.clubId,
      sourceId: activeDecision.id,
    };
  }

  const legacyShortlist = latestShortlistedReport(state, scoutingCase, index);
  if (!legacyShortlist) return undefined;
  return {
    pathway: "shortlisted",
    week: legacyShortlist.submittedWeek,
    season: legacyShortlist.submittedSeason,
    clubId: legacyShortlist.intendedClubId,
    sourceId: legacyShortlist.id,
  };
}

function buildFollowUpProjectionIndex(state: GameState): FollowUpProjectionIndex {
  return {
    calendar: createGameCalendarIndex(state.fixtures),
    caseDepth: buildScoutingCaseDepthIndex(state),
  };
}

function templatesFor(
  pathway: ProspectFollowUpPathway,
  stage: ProspectFollowUpStage,
): readonly BeatTemplate[] {
  if (pathway === "placed") {
    if (stage === "early-check") return PLACED_EARLY_TEMPLATES;
    return stage === "decision-point" ? PLACED_LATE_TEMPLATES : PLACED_ACCOUNTABILITY_TEMPLATES;
  }
  if (stage === "early-check") return SHORTLIST_EARLY_TEMPLATES;
  return stage === "decision-point" ? SHORTLIST_LATE_TEMPLATES : SHORTLIST_ACCOUNTABILITY_TEMPLATES;
}

function makeBeat(
  state: GameState,
  scoutingCase: ScoutingCase,
  anchor: FollowUpAnchor,
  stage: ProspectFollowUpStage,
  index: FollowUpProjectionIndex,
): ProspectFollowUpBeat | undefined {
  const player = state.players[scoutingCase.playerId]
    ?? state.retiredPlayers?.[scoutingCase.playerId]
    ?? Object.values(state.unsignedYouth ?? {}).find((candidate) =>
      candidate.player.id === scoutingCase.playerId,
    )?.player;
  if (!player) return undefined;

  const id = `prospect-follow-up:${scoutingCase.id}:${anchor.sourceId}:${stage}`;
  const templates = templatesFor(anchor.pathway, stage);
  const rng = createNamedRNG(
    state.runManifest.rootSeed,
    "prospect-follow-up",
    scoutingCase.id,
    anchor.sourceId,
    stage,
  );
  const template = rng.pick(templates);
  const depth = buildScoutingCaseDepth(state, scoutingCase.id, index.caseDepth);
  if (!depth) return undefined;
  const latestComparison = depth.comparisons.at(-1);
  const latestContextChange = depth.contextChanges.at(-1);
  const openUnknown = depth.unknowns.find((unknown) => unknown.status === "open");
  const unresolvedQuestion = openUnknown?.statement ?? template.unresolvedQuestion;
  const comparisonSummary = latestComparison?.summary;
  const contextChange = latestContextChange
    ? `${latestContextChange.from} to ${latestContextChange.to}: ${latestContextChange.explanation}`
    : undefined;
  const playerName = `${player.firstName} ${player.lastName}`.trim();
  const clubName = anchor.clubId ? state.clubs[anchor.clubId]?.name : undefined;
  const title = stage === "early-check"
    ? `${playerName}: First pathway check`
    : stage === "decision-point"
      ? `${playerName}: The next pathway decision`
      : `${playerName}: Review the original call`;
  const context = anchor.pathway === "placed"
    ? `${clubName ?? "The academy"} has supplied its first real post-placement update.`
    : `${clubName ?? "The interested club"} has kept the recommendation active.`;
  const body = [
    context,
    template.update,
    `CASE QUESTION: ${depth.centralQuestion.text}`,
    ...(comparisonSummary ? [`FOLLOW-UP COMPARISON: ${comparisonSummary}`] : []),
    ...(contextChange ? [`CONTEXT CHANGE: ${contextChange}`] : []),
    `UNRESOLVED: ${unresolvedQuestion}`,
    `ACCOUNTABILITY: ${depth.accountability.summary}`,
    `NEXT MOVE: Schedule a ${template.suggestedActivity === "parentCoachMeeting" ? "parent/coach meeting" : template.suggestedActivity === "trainingVisit" ? "training visit" : "follow-up session"} if you want to test it.`,
  ].join("\n\n");
  const message: InboxMessage = {
    id,
    week: state.currentWeek,
    season: state.currentSeason,
    type: "feedback",
    title,
    body,
    read: false,
    actionRequired: false,
    relatedId: player.id,
    relatedEntityType: "player",
  };
  return {
    id,
    caseId: scoutingCase.id,
    playerId: player.id,
    clubId: anchor.clubId,
    stage,
    pathway: anchor.pathway,
    title,
    update: template.update,
    caseQuestion: depth.centralQuestion.text,
    unresolvedQuestion,
    comparisonSummary,
    contextChange,
    accountabilitySummary: depth.accountability.summary,
    suggestedActivity: template.suggestedActivity,
    message,
  };
}

/**
 * Project the next deterministic, save-safe follow-up for every live youth
 * recommendation. Existing inbox ids are the persistence authority, so a
 * reload or repeated weekly projection cannot duplicate a beat.
 */
export function projectWeeklyProspectFollowUps(state: GameState): ProspectFollowUpBeat[] {
  if (state.scout.primarySpecialization !== "youth") return [];
  const existingIds = new Set((state.inbox ?? []).map((message) => message.id));
  const beats: ProspectFollowUpBeat[] = [];
  const index = buildFollowUpProjectionIndex(state);

  for (const scoutingCase of Object.values(state.scoutingCases ?? {})
    .sort((left, right) => left.id.localeCompare(right.id))) {
    const anchor = resolveAnchor(state, scoutingCase, index);
    if (!anchor) continue;
    const elapsed = gameWeeksBetweenWithCalendar(
      index.calendar,
      { week: anchor.week, season: anchor.season },
      { week: state.currentWeek, season: state.currentSeason },
    );
    if (elapsed < 0 || elapsed > FOLLOW_UP_WINDOW_WEEKS) continue;

    // One update per case per week keeps the inbox readable if an old save
    // resumes after a gap. Normal weekly play receives weeks 2, 6, and 18.
    for (const schedule of FOLLOW_UP_STAGES) {
      if (elapsed < schedule.dueAfterWeeks) continue;
      const id = `prospect-follow-up:${scoutingCase.id}:${anchor.sourceId}:${schedule.stage}`;
      if (existingIds.has(id)) continue;
      const beat = makeBeat(state, scoutingCase, anchor, schedule.stage, index);
      if (beat) beats.push(beat);
      break;
    }
  }
  return beats;
}
