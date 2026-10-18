import { describe, expect, it } from "vitest";
import { buildYouthDeskEvidenceIndex } from "@/lib/youthDeskEvidence";
import type { GameState, Observation, ObservationContext } from "@/engine/core/types";

function observation(id: string, context: ObservationContext, extra: Partial<Observation> = {}): Observation {
  return { id, context, playerId: "p", scoutId: "scout", week: 2, season: 1,
    abilityReading: { perceivedCA: 3, perceivedPALow: 3, perceivedPAHigh: 4,
      caConfidence: 0.9, paConfidence: 0.9 }, ...extra } as Observation;
}
function state(observations: Observation[]) {
  return { observations: Object.fromEntries(observations.map(o => [o.id, o])), reflectionJournal: {},
    scout: { id: "scout" }, currentWeek: 2, currentSeason: 1 } as GameState;
}

describe("youth desk evidence sources", () => {
  it("does not count replayed records from one session as independent live looks", () => {
    const game = state([
      observation("first", "schoolMatch", { sourceSessionId: "same-session" }),
      observation("replayed", "schoolMatch", { sourceSessionId: "same-session" }),
    ]);
    const evidence = buildYouthDeskEvidenceIndex(game).get("p");
    expect(evidence?.observationCount).toBe(1);
    expect(evidence?.hasFirmRead).toBe(false);
  });
  it("does not turn conversations, video or data into live looks or readiness", () => {
    const index = buildYouthDeskEvidenceIndex(state([
      observation("live", "schoolMatch"), observation("meeting", "parentCoachMeeting"),
      observation("video", "videoAnalysis"), observation("data", "databaseQuery"),
    ]));
    expect(index.get("p")).toMatchObject({ observationCount: 1, videoCount: 1,
      analysisCount: 1, conversationCount: 1, hasFirmRead: false });
  });
  it("excludes foreign and future evidence while retaining two eligible live looks", () => {
    const result = buildYouthDeskEvidenceIndex(state([
      observation("a", "schoolMatch"), observation("b", "followUpSession"),
      observation("foreign", "liveMatch", { scoutId: "other" }),
      observation("future", "liveMatch", { week: 3 }),
    ])).get("p");
    expect(result?.observationCount).toBe(2);
    expect(result?.hasFirmRead).toBe(true);
  });
  it("counts a conversation journal and its observation as one meeting even without new findings", () => {
    const game = state([observation("meeting", "parentCoachMeeting", { sourceSessionId: "session" })]);
    game.reflectionJournal = { journal: { id: "journal", sessionId: "session", sessionMode: "investigation",
      activityType: "parentCoachMeeting", notes: [], hypotheses: [], createdAt: 1,
      week: 2, season: 1, playerIds: ["p"], conversationDecisions: [] } };
    expect(buildYouthDeskEvidenceIndex(game).get("p")?.conversationCount).toBe(1);
    expect(buildYouthDeskEvidenceIndex(game).get("p")?.hasFirmRead).toBe(false);
  });
});
