import type {
  ClubDecision,
  GameState,
  InboxMessage,
  ScoutReport,
  ScoutingCase,
} from "@/engine/core/types";
import { gameWeeksBetween } from "@/engine/core/gameDate";
import { createNamedRNG } from "@/engine/run";

export type ProspectFollowUpStage = "early-check" | "decision-point";
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
  unresolvedQuestion: string;
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

const FOLLOW_UP_STAGES: ReadonlyArray<{
  stage: ProspectFollowUpStage;
  dueAfterWeeks: number;
}> = [
  { stage: "early-check", dueAfterWeeks: 2 },
  { stage: "decision-point", dueAfterWeeks: 6 },
];

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

function latestDecision(
  decisions: readonly ClubDecision[],
  outcomes: ReadonlySet<ClubDecision["outcome"]>,
): ClubDecision | undefined {
  return decisions
    .filter((decision) => outcomes.has(decision.outcome))
    .sort((left, right) =>
      right.decidedSeason - left.decidedSeason
      || right.decidedWeek - left.decidedWeek
      || right.id.localeCompare(left.id)
    )[0];
}

function latestShortlistedReport(
  state: GameState,
  scoutingCase: ScoutingCase,
): ScoutReport | undefined {
  const reportIds = new Set(scoutingCase.reportIds ?? []);
  return Object.values(state.reports ?? {})
    .filter((report) =>
      (report.caseId === scoutingCase.id || reportIds.has(report.id))
      && report.clubResponse === "shortlisted"
    )
    .sort((left, right) =>
      right.submittedSeason - left.submittedSeason
      || right.submittedWeek - left.submittedWeek
      || right.id.localeCompare(left.id)
    )[0];
}

function resolveAnchor(state: GameState, scoutingCase: ScoutingCase): FollowUpAnchor | undefined {
  const decisionIds = new Set(scoutingCase.decisionIds ?? []);
  const decisions = Object.values(state.clubDecisions ?? {}).filter((decision) =>
    decision.caseId === scoutingCase.id || decisionIds.has(decision.id),
  );
  const accepted = latestDecision(decisions, new Set(["accepted"]));
  if (accepted) {
    return {
      pathway: "placed",
      week: accepted.decidedWeek,
      season: accepted.decidedSeason,
      clubId: accepted.clubId,
      sourceId: accepted.id,
    };
  }

  const activeDecision = latestDecision(decisions, new Set(["trial", "followUpRequested"]));
  if (activeDecision) {
    return {
      pathway: "shortlisted",
      week: activeDecision.decidedWeek,
      season: activeDecision.decidedSeason,
      clubId: activeDecision.clubId,
      sourceId: activeDecision.id,
    };
  }

  const legacyShortlist = latestShortlistedReport(state, scoutingCase);
  if (!legacyShortlist) return undefined;
  return {
    pathway: "shortlisted",
    week: legacyShortlist.submittedWeek,
    season: legacyShortlist.submittedSeason,
    clubId: legacyShortlist.intendedClubId,
    sourceId: legacyShortlist.id,
  };
}

function templatesFor(
  pathway: ProspectFollowUpPathway,
  stage: ProspectFollowUpStage,
): readonly BeatTemplate[] {
  if (pathway === "placed") {
    return stage === "early-check" ? PLACED_EARLY_TEMPLATES : PLACED_LATE_TEMPLATES;
  }
  return stage === "early-check" ? SHORTLIST_EARLY_TEMPLATES : SHORTLIST_LATE_TEMPLATES;
}

function makeBeat(
  state: GameState,
  scoutingCase: ScoutingCase,
  anchor: FollowUpAnchor,
  stage: ProspectFollowUpStage,
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
  const playerName = `${player.firstName} ${player.lastName}`.trim();
  const clubName = anchor.clubId ? state.clubs[anchor.clubId]?.name : undefined;
  const title = stage === "early-check"
    ? `${playerName}: First pathway check`
    : `${playerName}: The next pathway decision`;
  const context = anchor.pathway === "placed"
    ? `${clubName ?? "The academy"} has supplied its first real post-placement update.`
    : `${clubName ?? "The interested club"} has kept the recommendation active.`;
  const body = [
    context,
    template.update,
    "",
    `UNRESOLVED: ${template.unresolvedQuestion}`,
    `NEXT MOVE: Schedule a ${template.suggestedActivity === "parentCoachMeeting" ? "parent/coach meeting" : template.suggestedActivity === "trainingVisit" ? "training visit" : "follow-up session"} if you want to test it.`,
  ].join("\n");
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
    unresolvedQuestion: template.unresolvedQuestion,
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

  for (const scoutingCase of Object.values(state.scoutingCases ?? {})
    .sort((left, right) => left.id.localeCompare(right.id))) {
    const anchor = resolveAnchor(state, scoutingCase);
    if (!anchor) continue;
    const elapsed = gameWeeksBetween(
      state.fixtures,
      { week: anchor.week, season: anchor.season },
      { week: state.currentWeek, season: state.currentSeason },
    );
    if (elapsed < 0 || elapsed > 8) continue;

    // One update per case per week keeps the inbox readable if an old save
    // resumes after a gap. Normal weekly play still receives weeks 2 and 6.
    for (const schedule of FOLLOW_UP_STAGES) {
      if (elapsed < schedule.dueAfterWeeks) continue;
      const id = `prospect-follow-up:${scoutingCase.id}:${anchor.sourceId}:${schedule.stage}`;
      if (existingIds.has(id)) continue;
      const beat = makeBeat(state, scoutingCase, anchor, schedule.stage);
      if (beat) beats.push(beat);
      break;
    }
  }
  return beats;
}
