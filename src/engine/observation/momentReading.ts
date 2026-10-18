import type { SessionFlaggedMoment } from "./types";
import { getPerceivedFlaggedMomentDescription, type FlaggedMomentView } from "./reflection";

/** Reflection preserves the scout's cue, never upgrades it to the underlying event. */
export function describeFlaggedMoment(
  session: FlaggedMomentView,
  flagged: SessionFlaggedMoment,
): string {
  if (session.mode !== "fullObservation") return flagged.moment.description;
  // Match both the passage and player so a nearby subject cannot supply this read.
  return getPerceivedFlaggedMomentDescription(session, flagged);
}
