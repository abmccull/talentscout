import { describe, expect, it } from "vitest";
import type { ReflectionJournalEntry } from "@/engine/core/types";
import { reconcileJournalFlagReactions } from "@/lib/reflectionJournalMigration";

describe("saved reflection flag authority", () => {
  it("repairs uniquely matched withdrawn judgments without mutating or guessing ambiguous history", () => {
    const entry = {
      flaggedMoments: [{ id: "flag", playerId: "p", phaseIndex: 1, minute: 10, reaction: "promising", note: "Initial impression" }],
      evidenceCards: [{ id: "cue", momentId: "m", playerId: "p", phaseIndex: 1, minute: 10, clarity: "clear", classification: "noConclusion" }],
    } as unknown as ReflectionJournalEntry;
    const original = JSON.stringify(entry);
    const repaired = reconcileJournalFlagReactions({ entry });
    expect(repaired.entry.flaggedMoments![0]).toMatchObject({ reaction: "needs_more_data", note: "Initial impression" });
    expect(JSON.stringify(entry)).toBe(original);
    expect(reconcileJournalFlagReactions(JSON.parse(JSON.stringify(repaired)))).toEqual(repaired);
    const ambiguous = { ...entry, evidenceCards: [...entry.evidenceCards!, { ...entry.evidenceCards![0], id: "other", momentId: "other" }] };
    expect(reconcileJournalFlagReactions({ entry: ambiguous }).entry).toBe(ambiguous);
    const linked = { ...ambiguous, flaggedMoments: [{ ...entry.flaggedMoments![0], momentId: "m" }] };
    expect(reconcileJournalFlagReactions({ entry: linked }).entry.flaggedMoments![0].reaction).toBe("needs_more_data");
    const noEvidence = { ...entry, evidenceCards: [] };
    expect(reconcileJournalFlagReactions({ entry: noEvidence }).entry).toBe(noEvidence);
  });
});
