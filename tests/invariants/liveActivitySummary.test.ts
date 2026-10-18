import { describe, expect, it } from "vitest";
import type { Activity, ReflectionJournalEntry, ScoutingEvidenceCard } from "@/engine/core/types";
import { getLiveActivitySummary } from "@/lib/liveActivitySummary";

const activity: Activity = { type: "streetFootball", slots: 1, description: "Watch", instanceId: "tuesday-watch" };
const journal: ReflectionJournalEntry = {
  id: "session", sessionId: "session", activityInstanceId: "tuesday-watch:d1",
  sessionMode: "fullObservation", activityType: "streetFootball", week: 1, season: 1,
  playerIds: ["ryan"], notes: [], hypotheses: [], evidenceCards: [],
  summary: "The watch did not settle the question.", createdAt: 1,
};
const state = (entry = journal) => ({ currentWeek: 1, currentSeason: 1, reflectionJournal: { session: entry } });

describe("live booking summary authority", () => {
  it("uses the recorded unanswered inquiry instead of inventing a productive meeting", () => {
    const meeting: Activity = { ...activity, type: "parentCoachMeeting" };
    const entry: ReflectionJournalEntry = { ...journal, activityType: "parentCoachMeeting", sessionMode: "investigation",
      summary: "You spoke with Maya about Ryan.", conversationDecisions: [{ phaseIndex: 1, nodeId: "ask", optionId: "ask",
        optionText: "What happens under pressure?", narrativeText: "Maya could not answer the pressure question.",
        insightPointsAwarded: 0, relationshipDeltaApplied: 0,
        inquiry: { playerId: "ryan", questionId: "pressure", sourceName: "Maya", status: "unanswered" },
      }] };
    const result = getLiveActivitySummary(state(entry), meeting, 1)!;
    expect(result.tier).toBe("inconclusive");
    expect(result.narrative).toContain("Maya could not answer");
    expect(result.playerEvidence.ryan).toBe("No new player finding established");
    expect(getLiveActivitySummary(state({ ...entry, activityInstanceId: "other" }), meeting, 1)).toBeNull();
    expect(getLiveActivitySummary(state({ ...entry, season: 2 }), meeting, 1)).toBeNull();
  });
  it("replaces a generic successful watch with the actual inconclusive reflection", () => {
    const summary = getLiveActivitySummary(state(), activity, 1)!;
    expect(summary.tier).toBe("inconclusive");
    expect(summary.narrative).toContain(journal.summary);
    expect(summary.narrative).toContain("No usable claim retained");
    expect(summary.playerEvidence.ryan).toBe("No usable claim retained");
  });

  it("does not borrow another booking, season, activity or legacy session", () => {
    for (const patch of [
      { activityInstanceId: "monday-watch" }, { week: 2 }, { season: 2 },
      { activityInstanceId: undefined }, { sessionMode: "investigation" as const },
      { activityType: "schoolMatch" as const },
    ]) expect(getLiveActivitySummary(state({ ...journal, ...patch }), activity, 1)).toBeNull();
  });

  it("a clear cue deliberately withheld by the scout is not advertised as a usable claim", () => {
    const evidenceCards = [
      { playerId: "ryan", clarity: "usable", classification: "noConclusion" },
      { playerId: "ryan", clarity: "glimpse", classification: "technicalExecution" },
    ] as ScoutingEvidenceCard[];
    expect(getLiveActivitySummary(state({ ...journal, evidenceCards }), activity, 1)?.tier).toBe("inconclusive");
  });

  it("retained clear evidence stays provisional and belongs only to its observed player", () => {
    const evidenceCards = [{ playerId: "ryan", clarity: "usable", classification: "technicalExecution" }] as ScoutingEvidenceCard[];
    const summary = getLiveActivitySummary(state({ ...journal, playerIds: ["ryan", "jude"], evidenceCards }), activity, 1)!;
    expect(summary.tier).toBe("provisional evidence");
    expect(summary.playerEvidence.ryan).toContain("1 usable saved cue");
    expect(summary.playerEvidence.jude).toBe("No usable claim retained");
  });
});
