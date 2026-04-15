import type { Activity } from "@/engine/core/types";

export function getInteractiveActivityCompletionKey(
  activity: Pick<Activity, "type" | "instanceId">,
  dayIndex: number,
): string {
  return activity.instanceId
    ? `${activity.instanceId}:d${dayIndex}`
    : `${activity.type}-d${dayIndex}`;
}
