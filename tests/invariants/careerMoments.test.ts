import { describe, expect, it } from "vitest";
import {
  CAREER_MOMENT_HISTORY_LIMIT,
  CAREER_MOMENT_PENDING_LIMIT,
  acknowledgeCareerMoment,
  careerMomentFromNarrativeEvent,
  createCareerMoment,
  createCareerMomentState,
  enqueueCareerMoments,
  selectNextCareerMoment,
  suppressPendingCareerMoments,
} from "@/engine/career/careerMoments";
import type { NarrativeEvent } from "@/engine/core/types";

function moment(index: number, magnitude: "minor" | "major" | "careerDefining" = "minor") {
  return createCareerMoment({
    rootSeed: "seed",
    id: `moment-${index}`,
    source: { kind: "test", id: `${index}` },
    occurredAt: { season: 1, week: index + 1 },
    category: magnitude === "careerDefining" ? "farewell" : "discovery",
    tone: magnitude === "careerDefining" ? "reflective" : "positive",
    magnitude,
    cue: magnitude === "careerDefining" ? "farewell" : "discovery",
    title: `Moment ${index}`,
    summary: "Persisted summary",
    stakeholderIds: [],
    tags: ["test"],
  });
}

describe("career moment director", () => {
  it("enqueues and acknowledges a source exactly once across reload", () => {
    const first = enqueueCareerMoments(undefined, [moment(1)], { season: 1, week: 2 });
    const presented = acknowledgeCareerMoment(first, "moment-1", { season: 1, week: 2 });
    const reloaded = createCareerMomentState(JSON.parse(JSON.stringify(presented)));
    const replay = enqueueCareerMoments(reloaded, [moment(1)], { season: 1, week: 3 });

    expect(replay.pending).toHaveLength(0);
    expect(replay.history).toHaveLength(1);
    expect(replay.history[0].status).toBe("presented");
  });

  it("bounds the queue and explicitly records overflow as suppressed", () => {
    const candidates = Array.from({ length: CAREER_MOMENT_PENDING_LIMIT + 5 }, (_, index) =>
      moment(index, index === CAREER_MOMENT_PENDING_LIMIT + 4 ? "careerDefining" : "minor"),
    );
    const state = enqueueCareerMoments(undefined, candidates, { season: 1, week: 20 });

    expect(state.pending).toHaveLength(CAREER_MOMENT_PENDING_LIMIT);
    expect(state.pending.some((item) => item.magnitude === "careerDefining")).toBe(true);
    expect(state.history.filter((item) => item.status === "suppressed")).toHaveLength(5);
  });

  it("honors presentation policy without losing disabled moments", () => {
    const state = enqueueCareerMoments(undefined, [moment(1)], { season: 1, week: 2 });
    expect(selectNextCareerMoment(state, { cinematicMoments: "off" })).toBeUndefined();
    const suppressed = suppressPendingCareerMoments(state, { season: 1, week: 2 });
    expect(suppressed.pending).toHaveLength(0);
    expect(suppressed.history[0].status).toBe("suppressed");
  });

  it("maps high-value narrative outcomes without exposing hidden player truth", () => {
    const event: NarrativeEvent = {
      id: "event-1",
      type: "hiddenGemVindication",
      week: 8,
      season: 3,
      title: "The old report resurfaces",
      description: "A former recommendation made a senior debut.",
      relatedIds: ["player-1"],
      acknowledged: false,
    };
    const mapped = careerMomentFromNarrativeEvent(event, "seed");

    expect(mapped).toMatchObject({ category: "vindication", cue: "vindication" });
    expect(mapped?.summary).toBe(event.description);
    expect(mapped?.summary).not.toMatch(/potential|current ability|\bPA\b|\bCA\b/i);
  });

  it("keeps presentation history bounded", () => {
    let state = createCareerMomentState();
    for (let index = 0; index < CAREER_MOMENT_HISTORY_LIMIT + 20; index += 1) {
      state = enqueueCareerMoments(state, [moment(index)], { season: 1, week: index + 1 });
      state = acknowledgeCareerMoment(state, `moment-${index}`, { season: 1, week: index + 1 });
    }
    expect(state.history).toHaveLength(CAREER_MOMENT_HISTORY_LIMIT);
  });
});
