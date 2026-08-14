import { addActivity, canScheduleActivity } from "@/engine/core/calendar";
import type { Activity, GameState } from "@/engine/core/types";

export function bookOpeningFollowUp(state: GameState): GameState {
  const opening = state.openingCase;
  if (!opening?.playerId || !state.schedule) return state;

  const alreadyBooked = (state.schedule.activities ?? []).some(
    (activity) =>
      activity?.type === "followUpSession"
      && activity.targetId === opening.playerId,
  );
  if (alreadyBooked) return state;

  const dayIndex = (state.schedule.activities ?? []).findIndex((activity) => activity == null);
  if (dayIndex < 0) return state;

  const youth = opening.youthId
    ? state.unsignedYouth?.[opening.youthId]
    : undefined;
  const playerName = youth
    ? `${youth.player.firstName} ${youth.player.lastName}`
    : "the kid";
  const activity: Activity = {
    instanceId: `opening-followup-${opening.id}`,
    type: "followUpSession",
    slots: 1,
    targetId: opening.playerId,
    description: `Second look — ${playerName}. Watch where the first read can fail.`,
  };
  if (!canScheduleActivity(state.schedule, activity, dayIndex, state.scout)) {
    return state;
  }

  return {
    ...state,
    schedule: addActivity(state.schedule, activity, dayIndex),
  };
}

export function openingFollowUpDayIndex(state: GameState): number {
  const playerId = state.openingCase?.playerId;
  if (!playerId) return -1;
  return (state.schedule?.activities ?? []).findIndex(
    (activity) => activity?.type === "followUpSession" && activity.targetId === playerId,
  );
}
