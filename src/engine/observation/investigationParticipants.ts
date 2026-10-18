import type { ObservationSession } from "./types";

/** Dialogue is authoritative: the player pool may contain other prospects. */
export function getInvestigationSpeakers(
  session: Pick<ObservationSession, "phases">,
  phaseIndex?: number,
): string[] {
  const phases = phaseIndex === undefined
    ? session.phases
    : session.phases.slice(phaseIndex, phaseIndex + 1);
  return [...new Set(phases.flatMap((phase) =>
    (phase.dialogueNodes ?? []).map((node) => node.speaker.trim()),
  ).filter((speaker) => speaker && speaker !== "Your notes" && speaker !== "You"))];
}
