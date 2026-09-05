import { addActivity, canScheduleActivity, getAvailableActivities } from "@/engine/core/calendar";
import type { Activity, GameState } from "@/engine/core/types";

/** Repair older checkpoints only when an actual authored opening report exists. */
export function reconcileOpeningReportStage(state: GameState): GameState {
  const opening = state.openingCase;
  if (opening?.stage !== "report" || !Object.values(state.reports).some((report) =>
    report.playerId === opening.playerId && report.scoutId === state.scout.id,
  )) return state;
  return { ...state, openingCase: { ...opening, stage: "complete" } };
}

export function bookOpeningFollowUp(state: GameState): GameState {
  const opening = state.openingCase;
  if (!opening?.playerId || !state.schedule) return state;

  const report = Object.values(state.reports ?? {})
    .filter((candidate) => candidate.playerId === opening.playerId && candidate.scoutId === state.scout.id)
    .sort((left, right) => right.submittedSeason - left.submittedSeason
      || right.submittedWeek - left.submittedWeek
      || (right.revision ?? 1) - (left.revision ?? 1)
      || right.id.localeCompare(left.id))[0];
  if (report?.recommendedAction === "pass" || report?.evidenceAssessment?.recommendation === "pass") return state;
  if (openingFollowUpDayIndex(state) >= 0) return state;

  const youth = opening.youthId
    ? state.unsignedYouth?.[opening.youthId]
    : undefined;
  if (youth?.placed || youth?.retired) return state;
  const playerName = youth
    ? `${youth.player.firstName} ${youth.player.lastName}`
    : "the kid";
  const nextTest = report?.evidenceAssessment?.nextTest;
  // Use the same availability and duration as the planner. A chosen test must
  // remain pending when unavailable; silently replacing it changes the decision.
  const availableTest = nextTest ? getAvailableActivities(
    state.scout, state.currentWeek, Object.values(state.fixtures ?? {}), Object.values(state.contacts ?? {}),
    state.subRegions, state.observations, state.unsignedYouth, state.players,
    undefined, state.youthTournaments, state.reports,
    { currentSeason: state.currentSeason, consequenceState: state.consequenceState },
  ).find((candidate) => candidate.type === nextTest.activityType
    && (!candidate.targetId || candidate.targetId === opening.playerId)
    && (!candidate.targetPool || candidate.targetPool.some((target) => target.id === opening.playerId))) : undefined;
  if (nextTest && !availableTest) return state;

  const activity: Activity = {
    instanceId: `opening-followup-${opening.id}`,
    type: availableTest?.type ?? "followUpSession",
    slots: availableTest?.slots ?? 1,
    targetId: opening.playerId,
    ...(nextTest ? {
      scoutingQuestionId: nextTest.questionId,
      scoutingQuestionIds: [nextTest.questionId],
      ...(report?.briefId ? { briefId: report.briefId } : {}),
    } : {}),
    description: nextTest
      ? `${nextTest.label} — ${playerName}. ${nextTest.description} Required context: ${nextTest.contextRequirement}`
      : `Second look — ${playerName}. Watch where the first read can fail.`,
  };
  // The first gap may be too short for a tournament. Find the first complete
  // legal block, keeping every existing commitment untouched.
  const dayIndex = (state.schedule.activities ?? []).findIndex((_entry, index) =>
    canScheduleActivity(state.schedule, activity, index, state.scout));
  if (dayIndex < 0) return state;

  return {
    ...state,
    schedule: addActivity(state.schedule, activity, dayIndex),
  };
}

export function openingFollowUpDayIndex(state: GameState): number {
  const opening = state.openingCase;
  if (!opening?.playerId) return -1;
  return (state.schedule?.activities ?? []).findIndex(
    (activity) => activity?.targetId === opening.playerId
      && (activity.instanceId === `opening-followup-${opening.id}` || activity.type === "followUpSession"),
  );
}
