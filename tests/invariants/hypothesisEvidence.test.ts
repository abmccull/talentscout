import { describe, expect, it } from "vitest";

import {
  applySessionEvidenceToHypotheses,
  collectSessionEvidenceForHypothesis,
  scoreHypothesisEvidence,
} from "@/engine/observation/evidence";
import { acceptHypothesis } from "@/engine/observation/session";
import type {
  Hypothesis,
  ObservationSession,
  PlayerMoment,
} from "@/engine/observation/types";

function moment(
  id: string,
  quality: number,
  momentType: PlayerMoment["momentType"] = "technicalAction",
): PlayerMoment {
  return {
    id,
    playerId: "player-1",
    momentType,
    quality,
    attributesHinted: ["firstTouch"],
    description: `${momentType} quality ${quality}`,
    vagueDescription: "A moment occurred.",
    pressureContext: false,
    isStandout: quality >= 8,
  };
}

function hypothesis(overrides: Partial<Hypothesis> = {}): Hypothesis {
  return {
    id: "hypothesis-1",
    playerId: "player-1",
    text: "The player's technical quality is repeatable.",
    domain: "technical",
    state: "open",
    createdAtWeek: 1,
    createdAtSeason: 1,
    expectedSignal: "positive",
    evidence: [],
    ...overrides,
  };
}

function session(
  moments: PlayerMoment[],
  hypotheses: Hypothesis[] = [],
  overrides: Partial<ObservationSession> = {},
): ObservationSession {
  return {
    id: "session-2",
    mode: "fullObservation",
    activityType: "schoolMatch",
    specialization: "youth",
    state: "reflection",
    phases: [{
      index: 0,
      minute: 1,
      description: "Focused observation",
      moments,
    }],
    currentPhaseIndex: 0,
    focusTokens: {
      available: 0,
      total: 3,
      allocations: [],
      warmupPhases: {},
    },
    flaggedMoments: [],
    hypotheses,
    insightPointsEarned: 0,
    reflectionNotes: [],
    players: [{
      playerId: "player-1",
      name: "Prospect One",
      position: "CAM",
      isFocused: false,
      focusedPhases: [0],
      focusHistory: [{ phaseIndex: 0, lens: "technical" }],
    }],
    startedAtWeek: 2,
    startedAtSeason: 1,
    ...overrides,
  };
}

describe("durable hypothesis evidence", () => {
  it("accepts the complete suggested hypothesis without discarding its evidence", () => {
    const suggested = hypothesis({
      evidence: [{
        id: "evidence-session-1",
        week: 1,
        season: 1,
        direction: "for",
        description: "Two positive moments formed this claim.",
        strength: "moderate",
        sourceType: "observation",
        sourceId: "session-1",
        context: "schoolMatch",
        independenceKey: "session:session-1:player-1:technical",
        signal: "positive",
      }],
    });
    const reflection = session([], []);

    const accepted = acceptHypothesis(reflection, suggested);
    const replayed = acceptHypothesis(accepted, suggested);

    expect(accepted.hypotheses).toHaveLength(1);
    expect(accepted.hypotheses[0].evidence).toEqual(suggested.evidence);
    expect(accepted.hypotheses[0]).toMatchObject({
      id: suggested.id,
      playerId: suggested.playerId,
      text: suggested.text,
      domain: suggested.domain,
      expectedSignal: suggested.expectedSignal,
    });
    expect(replayed.hypotheses).toHaveLength(1);
  });

  it("updates a carried hypothesis from a later independently observed session", () => {
    const carried = hypothesis({
      evidence: [{
        id: "evidence-session-1",
        week: 1,
        season: 1,
        direction: "for",
        description: "Strong initial evidence.",
        strength: "strong",
        sourceType: "observation",
        sourceId: "session-1",
        context: "schoolMatch",
        independenceKey: "session:session-1:player-1:technical",
        signal: "positive",
      }],
    });
    const laterSession = session([
      moment("positive-1", 8),
      moment("positive-2", 9),
      moment("positive-3", 8),
    ], [carried]);

    const result = applySessionEvidenceToHypotheses(laterSession);
    const updated = result.session.hypotheses[0];

    expect(result.addedEvidenceCount).toBe(1);
    expect(result.resolvedHypothesisCount).toBe(1);
    expect(updated.state).toBe("confirmed");
    expect(updated.evidence).toHaveLength(2);
    expect(updated.evidence[1]).toMatchObject({
      sourceType: "observation",
      sourceId: "session-2",
      season: 1,
      context: "schoolMatch",
      independenceKey: "session:session-2:player-1:technical",
      signal: "positive",
      direction: "for",
    });
    expect(result.session.insightPointsEarned).toBe(10);
  });

  it("records conflicting moments but scores one session as one independent source", () => {
    const carried = hypothesis({
      evidence: [{
        id: "evidence-session-1",
        week: 1,
        direction: "for",
        description: "Initial evidence.",
        strength: "strong",
        independenceKey: "session:session-1:player-1:technical",
      }],
    });
    const mixedSession = session([
      moment("positive-1", 9),
      moment("positive-2", 8),
      moment("negative-1", 2),
      moment("negative-2", 3),
    ], [carried]);

    const additions = collectSessionEvidenceForHypothesis(mixedSession, carried);
    const scores = scoreHypothesisEvidence([...carried.evidence, ...additions]);
    const result = applySessionEvidenceToHypotheses(mixedSession);

    expect(additions).toHaveLength(2);
    expect(new Set(additions.map((item) => item.independenceKey)).size).toBe(1);
    expect(scores.supportingSources + scores.opposingSources).toBe(1);
    expect(result.session.hypotheses[0].state).not.toBe("confirmed");
  });

  it("does not add evidence when relevant moments were neither focused nor flagged", () => {
    const carried = hypothesis();
    const passiveSession = session(
      [moment("passive-positive", 9)],
      [carried],
      {
        players: [{
          playerId: "player-1",
          name: "Prospect One",
          position: "CAM",
          isFocused: false,
          focusedPhases: [],
          focusHistory: [],
        }],
      },
    );

    const result = applySessionEvidenceToHypotheses(passiveSession);

    expect(result.addedEvidenceCount).toBe(0);
    expect(result.session.hypotheses[0]).toEqual(carried);
  });
});
