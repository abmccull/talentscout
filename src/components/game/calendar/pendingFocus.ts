import type { Activity, ActivityType, ObservationContext } from "@/engine/core/types";

const YOUTH_EVIDENCE_CONTEXTS: readonly { context: ObservationContext; activityType: ActivityType }[] = [
  { context: "schoolMatch", activityType: "schoolMatch" },
  { context: "grassrootsTournament", activityType: "grassrootsTournament" },
  { context: "academyTrialDay", activityType: "academyTrialDay" },
  { context: "followUpSession", activityType: "followUpSession" },
  { context: "parentCoachMeeting", activityType: "parentCoachMeeting" },
  { context: "trainingGround", activityType: "trainingVisit" },
];

/** A generic venue visit does not guarantee access to this particular prospect. */
export function getBookableYouthEvidenceContexts(activities: readonly Activity[], playerId: string) {
  return YOUTH_EVIDENCE_CONTEXTS.filter(({ activityType }) =>
    resolvePendingFeaturedActivity(activities, { type: activityType, targetId: playerId, label: "" }) !== null,
  );
}

export function resolvePendingFeaturedActivity(
  engineActivities: readonly Activity[],
  pendingCalendarActivity: { type: string; targetId: string; label: string } | null,
): Activity | null {
  if (!pendingCalendarActivity) return null;
  return engineActivities.find((activity) => (
    activity.type === pendingCalendarActivity.type
    && (
      activity.targetId === pendingCalendarActivity.targetId
      || activity.targetPool?.some((target) => target.id === pendingCalendarActivity.targetId) === true
    )
  )) ?? null;
}
