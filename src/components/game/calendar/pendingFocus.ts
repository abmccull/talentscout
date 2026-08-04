import type { Activity } from "@/engine/core/types";

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
