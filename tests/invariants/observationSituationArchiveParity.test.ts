// Destination: tests/invariants/observationSituationArchiveParity.test.ts.
// Stored history is supplied DIRECTLY to real consumers; candidate/session snapshots remain logical.
import { describe, expect, it } from "vitest";
import { summarizeObservationKnowledge, rankNextObservationContexts, compareObservationEvidence,
  getHighestValueNextContext } from "@/engine/observation/informationGain";
import { deriveObservationContextResolution } from "@/engine/observation/contextResolution";
import { buildContextualScoutingQuestions, buildObservationExperienceSnapshot } from "@/engine/observation/questions";
import { jsonBound, observation, snapshot, wire } from "../engine/observation/observationSituationArchiveFixtures";
const stored = () => jsonBound(wire());
const history = (situation: unknown) => [
  observation("first", "session-a", situation), observation("same-source-duplicate", "session-a", situation),
  observation("independent", "session-b", situation),
];
describe("stored situation parity with existing observation consumers", () => {
  it("preserves duplicate-source counts, stable repetition and novel situation gain", () => {
    const before = history(snapshot()), after = history(stored());
    const baseline = summarizeObservationKnowledge(before, "archive-player");
    expect(baseline).toMatchObject({ rawObservationCount: 3, independentSourceCount: 2, duplicateObservationCount: 1 });
    expect(summarizeObservationKnowledge(after, "archive-player")).toStrictEqual(baseline);
    const request = { playerId: "archive-player", candidateContexts: ["schoolMatch", "trainingGround"] as const,
      targetDomains: ["technical"] as const, targetQuestionIds: ["decisions"] as const,
      candidateSituations: { schoolMatch: snapshot() } };
    expect(rankNextObservationContexts({ ...request, observations: after }))
      .toStrictEqual(rankNextObservationContexts({ ...request, observations: before }));
    const repeated = getHighestValueNextContext({ ...request, observations: after, candidateContexts: ["schoolMatch"] })!;
    const newSetting = { ...snapshot(), weather: "heavy_rain", repetitionKey: `${snapshot().repetitionKey}:adverse` };
    const novel = getHighestValueNextContext({ ...request, observations: after, candidateContexts: ["schoolMatch"],
      candidateSituations: { schoolMatch: newSetting } })!;
    const baselineNovel = getHighestValueNextContext({ ...request, observations: before, candidateContexts: ["schoolMatch"],
      candidateSituations: { schoolMatch: newSetting } })!;
    expect(novel).toStrictEqual(baselineNovel);
    expect(novel.repetitionMultiplier).toBeGreaterThan(repeated.repetitionMultiplier);
    expect(repeated.repetitionKey).toBe(snapshot().repetitionKey);
  });
  it("preserves contextual modifiers and same-situation counts from stored history", () => {
    const input = { player: { id: "archive-player", position: "CM" as const, secondaryPositions: [], naturalRole: "mezzala" as const },
      context: "schoolMatch" as const, situation: snapshot() };
    const before = deriveObservationContextResolution({ ...input, existingObservations: history(snapshot()) });
    const after = deriveObservationContextResolution({ ...input, existingObservations: history(stored()) });
    expect(after).toStrictEqual(before); expect(after.sameSituationCount).toBeGreaterThan(0);
  });
  it("preserves earned observer context and full question order, scores, reasons and recommendation", () => {
    const request = { playerId: "archive-player", scout: { skills: { technicalEye: 12, tacticalUnderstanding: 14,
      psychologicalRead: 11, physicalAssessment: 10, potentialAssessment: 13, playerJudgment: 12,
      dataLiteracy: 10 } }, regionalKnowledgeLevel: 65, openQuestionIds: ["pressure"] as const };
    const before = buildObservationExperienceSnapshot({ ...request, observations: history(snapshot()) });
    const after = buildObservationExperienceSnapshot({ ...request, observations: history(stored()) });
    expect(after).toStrictEqual(before);
    expect(after.priorContextKeys).toStrictEqual([snapshot().repetitionKey]);
    const player = { playerId: "archive-player", position: "CB" as const, naturalRole: "ballPlayingDefender" as const };
    const original = buildContextualScoutingQuestions({ player, activityType: "schoolMatch", situation: snapshot(), observer: before });
    const restored = buildContextualScoutingQuestions({ player, activityType: "schoolMatch", situation: snapshot(), observer: after });
    expect(restored).toStrictEqual(original); expect(restored).toHaveLength(6);
    expect(restored.filter(item => item.recommended)).toHaveLength(1);
  });
  it("preserves materially changed setting facts in comparisons between directly stored observations", () => {
    const first = observation("first", "session-a", snapshot());
    const nextLogical = { ...snapshot(), id: "situation:novel", venueType: "academy", competitionLevel: "academy" as const,
      stakes: "competitive" as const, tacticalFrame: "pressing" as const, repetitionKey: "academy:pressing:competitive" };
    const second = observation("second", "session-b", nextLogical);
    const nextWire = wire(); const a = nextWire.observationSituationV1;
    a[4] = "situation:novel"; a[6] = "academy"; a[7] = "academy"; a[8] = "competitive";
    a[9] = "pressing"; a[17] = "academy:pressing:competitive";
    const baseline = compareObservationEvidence(first, second);
    expect(baseline.contextChanged).toBe(true);
    // The existing comparison reports conditions only when other context changes are absent.
    expect(baseline.contextChanges.map(item => item.kind)).toEqual(expect.arrayContaining(["competition", "stakes", "tacticalFrame"]));
    expect(compareObservationEvidence(observation("first", "session-a", stored()),
      observation("second", "session-b", jsonBound(nextWire)))).toStrictEqual(baseline);
  });
});
