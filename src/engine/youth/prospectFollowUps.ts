import type {
  ClubDecision,
  GameState,
  InboxMessage,
  ProspectFollowUpStage,
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

import {
  prospectFollowUpMessageId,
  reconcileProspectFollowUpDeliveries,
  recordProspectFollowUpDelivery,
} from "./prospectFollowUpDelivery";

export type { ProspectFollowUpStage } from "@/engine/core/types";
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
    update: "Check whether the football plan and the support available away from the pitch still fit the player.",
    unresolvedQuestion: "Is this normal settling-in friction, or does the family and education plan need to change before it affects development?",
    suggestedActivity: "parentCoachMeeting",
  },
  {
    update: "Ask which role and training level the academy intends to use, and what would count as useful progress.",
    unresolvedQuestion: "Should you verify the role in training now, or let the staff complete the first adaptation block?",
    suggestedActivity: "trainingVisit",
  },
  {
    update: "Ask the family how the weekly routine compares with the plan discussed before placement.",
    unresolvedQuestion: "Does the support network match the pathway you recommended, and what evidence would change your view?",
    suggestedActivity: "parentCoachMeeting",
  },
];

const PLACED_LATE_TEMPLATES: readonly BeatTemplate[] = [
  {
    update: "Review how selection, education and recovery fit together now that the player has spent longer at the club.",
    unresolvedQuestion: "Is the pathway still developing the player, or should you challenge the role and support plan before the pattern hardens?",
    suggestedActivity: "followUpSession",
  },
  {
    update: "Check the training and appearance records against the intended pathway before judging the timetable.",
    unresolvedQuestion: "Do you stand behind the timetable, seek a clearer milestone, or reopen the fit question with new evidence?",
    suggestedActivity: "trainingVisit",
  },
  {
    update: "Check for recorded outside interest before deciding whether another academy changes your advice.",
    unresolvedQuestion: "Should outside interest create urgency, or is protecting a stable adaptation block still the better judgment?",
    suggestedActivity: "followUpSession",
  },
];

const SHORTLIST_EARLY_TEMPLATES: readonly BeatTemplate[] = [
  {
    update: "Ask whether the club still wants to pursue the player, and what evidence it would need next.",
    unresolvedQuestion: "Which context would most efficiently test the remaining doubt without repeating the evidence already filed?",
    suggestedActivity: "followUpSession",
  },
  {
    update: "Test whether a role-specific concern remains unresolved by the evidence in your first report.",
    unresolvedQuestion: "Do you test the concern in training, or preserve your current recommendation until a competitive sample appears?",
    suggestedActivity: "trainingVisit",
  },
  {
    update: "Ask the family and club to clarify the timetable and practical support before treating either as settled.",
    unresolvedQuestion: "Should welfare and education readiness become part of the next recommendation revision?",
    suggestedActivity: "parentCoachMeeting",
  },
];

const SHORTLIST_LATE_TEMPLATES: readonly BeatTemplate[] = [
  {
    update: "Check whether the opportunity is still open and whether another week of evidence would be worth the delay.",
    unresolvedQuestion: "Is the missing evidence worth another week, or has the opportunity cost changed the recommendation itself?",
    suggestedActivity: "followUpSession",
  },
  {
    update: "Ask about minutes, coaching ownership and the intended first competitive assignment.",
    unresolvedQuestion: "Can you defend a specific development plan, or should the player remain available to a different environment?",
    suggestedActivity: "trainingVisit",
  },
  {
    update: "Compare the family and club accounts of the proposed pathway; agreement has not yet been established.",
    unresolvedQuestion: "Which promise needs to be made explicit before your recommendation can stay credible?",
    suggestedActivity: "parentCoachMeeting",
  },
];

const PLACED_ACCOUNTABILITY_TEMPLATES: readonly BeatTemplate[] = [
  {
    update: "Compare the original recommendation with recorded pathway evidence; elapsed time alone does not validate your judgment.",
    unresolvedQuestion: "Which part of the original judgment has held, which part needs revision, and what should you learn before staking the same conviction again?",
    suggestedActivity: "trainingVisit",
  },
  {
    update: "Review the available training, selection and support evidence, identifying gaps before drawing a conclusion.",
    unresolvedQuestion: "Does the current pathway still justify the opportunity you recommended, or has the evidence moved the case somewhere else?",
    suggestedActivity: "followUpSession",
  },
  {
    update: "Ask the club and family what has changed since placement and cross-check their accounts.",
    unresolvedQuestion: "What would you defend in a review meeting, and what would you explicitly revise?",
    suggestedActivity: "parentCoachMeeting",
  },
];

const SHORTLIST_ACCOUNTABILITY_TEMPLATES: readonly BeatTemplate[] = [
  {
    update: "Review whether delay has changed the recommendation, using new evidence where it exists.",
    unresolvedQuestion: "Has new evidence strengthened the case, or is the continued uncertainty now a reason to withdraw the original urgency?",
    suggestedActivity: "followUpSession",
  },
  {
    update: "Check whether the club's needs and alternatives have changed before revising the original fit judgment.",
    unresolvedQuestion: "Should you revise the fit, defend the original football read, or close the case without forcing a conclusion?",
    suggestedActivity: "trainingVisit",
  },
  {
    update: "Ask which practical conditions remain unresolved before advising the family to keep waiting.",
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

  const id = prospectFollowUpMessageId(scoutingCase.id, anchor.sourceId, stage);
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
    ? `${stage === "early-check" ? "First pathway check" : "Pathway review"} for ${clubName ?? "the academy"}: a placement was recorded in season ${anchor.season}, week ${anchor.week}.`
    : `${clubName ?? "The interested club"}: a shortlist or follow-up decision was recorded in season ${anchor.season}, week ${anchor.week}; current interest still needs checking.`;
  const body = [
    context,
    `INVESTIGATION PROMPT: ${template.update} This is a question to investigate, not a confirmed update from the club or family.`,
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

interface FollowUpPlan {
  beats: ProspectFollowUpBeat[];
  scoutingCases: GameState["scoutingCases"];
}

/** Build one pure plan; committing publishes both its messages and delivery proof. */
function buildWeeklyProspectFollowUpPlan(state: GameState): FollowUpPlan {
  if (state.scout.primarySpecialization !== "youth") {
    return { beats: [], scoutingCases: state.scoutingCases };
  }
  const existingIds = new Set((state.inbox ?? []).map((message) => message.id));
  const beats: ProspectFollowUpBeat[] = [];
  const index = buildFollowUpProjectionIndex(state);
  let scoutingCases = reconcileProspectFollowUpDeliveries(state, index.caseDepth);

  for (const [caseKey, scoutingCase] of Object.entries(scoutingCases)
    .sort(([, left], [, right]) => left.id.localeCompare(right.id))) {
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
      const id = prospectFollowUpMessageId(scoutingCase.id, anchor.sourceId, schedule.stage);
      if (existingIds.has(id) || scoutingCase.prospectFollowUpDeliveries?.some(delivery =>
        delivery.sourceId === anchor.sourceId && delivery.stage === schedule.stage,
      )) continue;
      const beat = makeBeat(state, scoutingCase, anchor, schedule.stage, index);
      if (beat) {
        beats.push(beat);
        if (scoutingCases === state.scoutingCases) scoutingCases = { ...scoutingCases };
        scoutingCases[caseKey] = recordProspectFollowUpDelivery(scoutingCase, {
          sourceId: anchor.sourceId,
          stage: schedule.stage,
          deliveredWeek: state.currentWeek,
          deliveredSeason: state.currentSeason,
        });
      }
      break;
    }
  }
  return { beats, scoutingCases };
}

/** Preview authored communications without changing messages, proof, or RNG. */
export function projectWeeklyProspectFollowUps(state: GameState): ProspectFollowUpBeat[] {
  return buildWeeklyProspectFollowUpPlan(state).beats;
}

/** Publish actual messages and their durable proof together before inbox pruning. */
export function applyWeeklyProspectFollowUps(state: GameState): GameState {
  const plan = buildWeeklyProspectFollowUpPlan(state);
  if (plan.beats.length === 0 && plan.scoutingCases === state.scoutingCases) return state;
  return {
    ...state,
    scoutingCases: plan.scoutingCases,
    inbox: plan.beats.length === 0
      ? state.inbox
      : [...state.inbox, ...plan.beats.map(beat => beat.message)],
  };
}
