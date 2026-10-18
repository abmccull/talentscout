import type { ReflectionJournalEntry } from "@/engine/core/types";

/** Repair only flags whose retained evidence establishes that the read was withheld. */
export function reconcileJournalFlagReactions(
  journal: Record<string, ReflectionJournalEntry>,
): Record<string, ReflectionJournalEntry> {
  return Object.fromEntries(Object.entries(journal).map(([id, entry]) => {
    if (!entry.evidenceCards?.length || !entry.flaggedMoments?.length) return [id, entry];
    let changed = false;
    const flaggedMoments = entry.flaggedMoments.map((flag) => {
      const matches = entry.evidenceCards!.filter((card) => card.playerId === flag.playerId
        && (flag.momentId ? card.momentId === flag.momentId
          : card.phaseIndex === flag.phaseIndex && card.minute === flag.minute));
      if (matches.length !== 1) return flag;
      const card = matches[0];
      const withheld = card.clarity === "missed" || card.clarity === "glimpse"
        || card.classification === "noConclusion"
        || entry.evidenceDecisions?.[card.id]?.classification === "noConclusion";
      if (!withheld || flag.reaction === "needs_more_data") return flag;
      changed = true;
      return { ...flag, reaction: "needs_more_data" as const };
    });
    return [id, changed ? { ...entry, flaggedMoments } : entry];
  }));
}
