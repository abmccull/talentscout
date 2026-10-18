import type { Activity } from "@/engine/core/types";

export function getInteractiveActivityCompletionKey(
  activity: Pick<Activity, "type" | "instanceId">,
  dayIndex: number,
): string {
  return activity.instanceId
    ? `${activity.instanceId}:d${dayIndex}`
    : `${activity.type}-d${dayIndex}`;
}

/** Resolve either a legacy booking id or the UI's day-specific visit key.
 * Compare generated keys rather than stripping suffixes from opaque ids.
 */
export function findScheduledInteractiveActivity(
  activities: readonly (Activity | null | undefined)[],
  completionKey: string | undefined,
): Activity | undefined {
  if (!completionKey) return undefined;
  return activities.find(activity => activity?.instanceId === completionKey)
    ?? activities.find((activity, day) => activity && getInteractiveActivityCompletionKey(activity, day) === completionKey)
    ?? undefined;
}
