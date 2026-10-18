import { describe, expect, it } from "vitest";
import type { ScoutCueReading } from "@/engine/core/types";
import type { SessionFlaggedMoment } from "@/engine/observation/types";
import { describeFlaggedMoment } from "@/engine/observation/momentReading";

const flagged = {
  phaseIndex: 0,
  moment: {
    id: "passage-31",
    playerId: "daniel",
    description: "Daniel scans, waits for the defender to commit, and splits two lines with the pass.",
    vagueDescription: "One player appears to see a passing lane before it opens.",
  },
} as SessionFlaggedMoment;

const focused = {
  currentPhaseIndex: 0,
  players: [{ playerId: "daniel", focusedPhases: [0] }],
  phases: [{ index: 0, moments: [flagged.moment] }],
} as unknown as Pick<import("@/engine/observation/types").ObservationSession, "currentPhaseIndex" | "players" | "phases">;

describe("reflection retains the scout's view", () => {
  it("does not reveal the complete event when the recorded cue was only a glimpse", () => {
    const detail = "One player appears to see a passing lane before it opens. The view was incomplete.";
    const description = describeFlaggedMoment({ ...focused, mode: "fullObservation", cueReadings: [
      { phaseIndex: 0, momentId: "passage-31", playerId: "daniel", clarity: "glimpse", detail } as ScoutCueReading,
    ] }, flagged);
    expect(description).toBe(detail);
    expect(description).not.toContain("splits two lines");
  });

  it("retains a strong recorded read including its uncertainty qualifier", () => {
    const detail = "Daniel splits two lines. The action is clear, but it still needs another context.";
    expect(describeFlaggedMoment({ ...focused, mode: "fullObservation", cueReadings: [
      { phaseIndex: 0, momentId: "passage-31", playerId: "daniel", clarity: "strong", detail } as ScoutCueReading,
    ] }, flagged)).toBe(detail);
  });

  it("does not borrow another player's read of the same passage", () => {
    expect(describeFlaggedMoment({ ...focused, mode: "fullObservation", cueReadings: [
      { phaseIndex: 0, momentId: "passage-31", playerId: "another-player", clarity: "strong", detail: "Another player makes a clear run." } as ScoutCueReading,
    ] }, flagged)).toBe(flagged.moment.vagueDescription);
  });

  it("cannot retain unfocused, future, or mismatched-phase cues", () => {
    const cue = { phaseIndex: 0, momentId: "passage-31", playerId: "daniel", clarity: "strong", detail: "UNSEEN DETAIL" } as ScoutCueReading;
    for (const context of [
      { ...focused, players: [{ ...focused.players[0], focusedPhases: [] }] },
      { ...focused, currentPhaseIndex: -1 },
      { ...focused, phases: [] },
    ]) {
      expect(describeFlaggedMoment({ ...context, mode: "fullObservation", cueReadings: [cue] }, flagged)).toBe(flagged.moment.vagueDescription);
    }
    expect(describeFlaggedMoment({ ...focused, mode: "fullObservation", cueReadings: [{ ...cue, phaseIndex: 1 }] }, flagged)).toBe(flagged.moment.vagueDescription);
  });

  it("keeps an older unrecorded watch conservative and preserves non-watch narratives", () => {
    expect(describeFlaggedMoment({ mode: "fullObservation" }, flagged)).toBe(flagged.moment.vagueDescription);
    expect(describeFlaggedMoment({ mode: "investigation" }, flagged)).toBe(flagged.moment.description);
  });
});
