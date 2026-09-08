import type { ObservationSession, SessionFlaggedMoment } from "./types";
import { getPerceivedFlaggedMomentDescription } from "./reflection";

/** Reflection preserves the scout's cue, never upgrades it to the underlying event. */
export function describeFlaggedMoment(
  session: Pick<ObservationSession, "mode" | "cueReadings">,
  flagged: SessionFlaggedMoment,
): string {
  if (session.mode !== "fullObservation") return flagged.moment.description;
  // Match both the passage and player so a nearby subject cannot supply this read.
  return getPerceivedFlaggedMomentDescription(session, flagged);
}
