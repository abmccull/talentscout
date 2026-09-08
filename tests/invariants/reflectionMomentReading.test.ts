import { describe, expect, it } from "vitest";
import type { ScoutCueReading } from "@/engine/core/types";
import type { SessionFlaggedMoment } from "@/engine/observation/types";
import { describeFlaggedMoment } from "@/engine/observation/momentReading";

const flagged = {
  moment: {
    id: "passage-31",
    playerId: "daniel",
    description: "Daniel scans, waits for the defender to commit, and splits two lines with the pass.",
    vagueDescription: "One player appears to see a passing lane before it opens.",
  },
} as SessionFlaggedMoment;

describe("reflection retains the scout's view", () => {
  it("does not reveal the complete event when the recorded cue was only a glimpse", () => {
    const detail = "One player appears to see a passing lane before it opens. The view was incomplete.";
    const description = describeFlaggedMoment({ mode: "fullObservation", cueReadings: [
      { momentId: "passage-31", playerId: "daniel", clarity: "glimpse", detail } as ScoutCueReading,
    ] }, flagged);
    expect(description).toBe(detail);
    expect(description).not.toContain("splits two lines");
  });

  it("retains a strong recorded read including its uncertainty qualifier", () => {
    const detail = "Daniel splits two lines. The action is clear, but it still needs another context.";
    expect(describeFlaggedMoment({ mode: "fullObservation", cueReadings: [
      { momentId: "passage-31", playerId: "daniel", clarity: "strong", detail } as ScoutCueReading,
    ] }, flagged)).toBe(detail);
  });

  it("does not borrow another player's read of the same passage", () => {
    expect(describeFlaggedMoment({ mode: "fullObservation", cueReadings: [
      { momentId: "passage-31", playerId: "another-player", clarity: "strong", detail: "Another player makes a clear run." } as ScoutCueReading,
    ] }, flagged)).toBe(flagged.moment.vagueDescription);
  });

  it("keeps an older unrecorded watch conservative and preserves non-watch narratives", () => {
    expect(describeFlaggedMoment({ mode: "fullObservation" }, flagged)).toBe(flagged.moment.vagueDescription);
    expect(describeFlaggedMoment({ mode: "investigation" }, flagged)).toBe(flagged.moment.description);
  });
});
