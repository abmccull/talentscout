import { describe, expect, it } from "vitest";

import {
  QUICK_CHOICE_IMPACTS,
  migrateQuickInteractionSession,
  populateQuickInteractionPhases,
  resolveQuickInteractionChoice,
} from "@/engine/observation/quickInteraction";
import {
  advanceSessionPhase,
  createSession,
  getSessionResult,
  startSession,
} from "@/engine/observation/session";
import type {
  ObservationSession,
  StrategicChoice,
} from "@/engine/observation/types";
import { createRNG } from "@/engine/rng";

const ACTIVITIES = [
  "statsBriefing",
  "dataConference",
  "assignTerritory",
  "analyticsTeamMeeting",
] as const;

const BRANCH_CASES = [
  ["statsBriefing", "priority", "target data"],
  ["statsBriefing", "technique", "identified a pattern"],
  ["dataConference", "network", "well-connected data director"],
  ["dataConference", "technique", "methodological question"],
  ["assignTerritory", "territory", "coverage plan has a gap"],
  ["assignTerritory", "priority", "conflicting assessments"],
  ["analyticsTeamMeeting", "priority", "initial output on the priority"],
  ["analyticsTeamMeeting", "technique", "methodological tension"],
] as const;

function createQuickSession(
  activityType: (typeof ACTIVITIES)[number] = "statsBriefing",
  seed = `quick-integrity-${activityType}`,
): ObservationSession {
  const generationRng = createRNG(seed);
  const skeleton = createSession(
    {
      activityType,
      specialization: "youth",
      playerPool: [{ playerId: "player-1", name: "Ari Prospect", position: "CM" }],
      seed,
      week: 4,
      season: 2,
      careerPath: "independent",
    },
    generationRng,
  );
  return startSession(populateQuickInteractionPhases(skeleton, generationRng));
}

function branchRng(session: ObservationSession) {
  return createRNG(`quick-branch-${session.id}`);
}

function choiceForOutcome(
  session: ObservationSession,
  outcomeType: StrategicChoice["outcomeType"],
) {
  const choice = session.phases[0]?.choices?.find(
    (candidate) => candidate.outcomeType === outcomeType,
  );
  if (!choice) throw new Error(`No ${outcomeType} choice in ${session.activityType}`);
  return choice;
}

describe("quick-interaction choice integrity", () => {
  it.each(ACTIVITIES)("starts %s with an unresolved, unmaterialized follow-up", (activityType) => {
    const session = createQuickSession(activityType);

    expect(session.mode).toBe("quickInteraction");
    expect(session.phases[0]?.choices?.length).toBeGreaterThanOrEqual(2);
    expect(session.phases[0]?.selectedChoiceId).toBeUndefined();
    expect(session.phases[1]?.choices).toBeUndefined();
    expect(session.phases[1]?.description).toContain("shaped by the approach");
  });

  it("materializes phase 2 from the player's actual phase-1 outcome", () => {
    const original = createQuickSession("statsBriefing", "actual-branch");
    const priority = choiceForOutcome(original, "priority");
    const technique = choiceForOutcome(original, "technique");

    const priorityPath = resolveQuickInteractionChoice(
      original,
      priority.id,
      branchRng(original),
    );
    const techniquePath = resolveQuickInteractionChoice(
      original,
      technique.id,
      branchRng(original),
    );

    expect(priorityPath.phases[0]?.selectedChoiceId).toBe(priority.id);
    expect(techniquePath.phases[0]?.selectedChoiceId).toBe(technique.id);
    expect(priorityPath.phases[1]?.choices?.map((choice) => choice.text))
      .not.toEqual(techniquePath.phases[1]?.choices?.map((choice) => choice.text));
    expect(priorityPath.phases[1]?.description).toContain("target data");
    expect(techniquePath.phases[1]?.description).toContain("identified a pattern");
  });

  it.each(BRANCH_CASES)(
    "%s routes a locked %s outcome into its authored follow-up",
    (activityType, outcomeType, expectedPrompt) => {
      const original = createQuickSession(activityType, `branch-${activityType}-${outcomeType}`);
      const choice = choiceForOutcome(original, outcomeType);
      const resolved = resolveQuickInteractionChoice(original, choice.id, branchRng(original));

      expect(resolved.phases[1]?.description).toContain(expectedPrompt);
      expect(resolved.phases[1]?.choices?.length).toBeGreaterThanOrEqual(2);
    },
  );

  it("locks exactly one choice and cannot re-award or replace it after serialization", () => {
    const original = createQuickSession("statsBriefing", "immutable-choice");
    const first = original.phases[0]!.choices![0];
    const alternate = original.phases[0]!.choices![1];
    const selected = resolveQuickInteractionChoice(original, first.id, branchRng(original));

    expect(selected.insightPointsEarned).toBe(first.impact.insightPoints);
    expect(selected.phases[0]?.choiceResolution).toMatchObject({
      choiceId: first.id,
      outcomeType: first.outcomeType,
      insightPointsAwarded: first.impact.insightPoints,
      fatigueDelta: first.impact.fatigueDelta,
      qualityModifier: first.impact.qualityModifier,
    });

    const repeated = resolveQuickInteractionChoice(selected, first.id, branchRng(selected));
    const changed = resolveQuickInteractionChoice(selected, alternate.id, branchRng(selected));
    expect(repeated).toBe(selected);
    expect(changed).toBe(selected);

    const roundTripped = JSON.parse(JSON.stringify(selected)) as ObservationSession;
    const afterReloadAttempt = resolveQuickInteractionChoice(
      roundTripped,
      alternate.id,
      branchRng(roundTripped),
    );
    expect(afterReloadAttempt).toEqual(selected);
  });

  it("blocks phase advancement until the current required choice is resolved", () => {
    const original = createQuickSession("dataConference", "advance-gate");

    expect(advanceSessionPhase(original)).toBe(original);
    const selected = resolveQuickInteractionChoice(
      original,
      original.phases[0]!.choices![0].id,
      branchRng(original),
    );
    const phase2 = advanceSessionPhase(selected);
    expect(phase2.currentPhaseIndex).toBe(1);
    expect(phase2.state).toBe("active");
    expect(advanceSessionPhase(phase2)).toBe(phase2);
  });

  it("rejects stale ids and selections outside the active state", () => {
    const active = createQuickSession("assignTerritory", "invalid-choice");
    const invalid = resolveQuickInteractionChoice(active, "not-a-current-choice", branchRng(active));
    expect(invalid).toEqual(active);

    const setup = { ...active, state: "setup" as const };
    const choiceId = setup.phases[0]!.choices![0].id;
    expect(resolveQuickInteractionChoice(setup, choiceId, branchRng(setup))).toBe(setup);
  });

  it("uses bounded asymmetric profiles with no strictly dominant outcome", () => {
    const entries = Object.entries(QUICK_CHOICE_IMPACTS);
    expect(new Set(entries.map(([, impact]) => JSON.stringify(impact))).size).toBe(entries.length);

    for (const [, impact] of entries) {
      expect(impact.insightPoints).toBeGreaterThanOrEqual(0);
      expect(impact.insightPoints).toBeLessThanOrEqual(6);
      expect(impact.fatigueDelta).toBeGreaterThanOrEqual(0);
      expect(impact.fatigueDelta).toBeLessThanOrEqual(3);
      expect(impact.qualityModifier).toBeGreaterThanOrEqual(0);
      expect(impact.qualityModifier).toBeLessThanOrEqual(3);
    }

    for (const [leftType, left] of entries) {
      for (const [rightType, right] of entries) {
        if (leftType === rightType) continue;
        const leftStrictlyDominates =
          left.insightPoints >= right.insightPoints
          && left.qualityModifier >= right.qualityModifier
          && left.fatigueDelta <= right.fatigueDelta
          && (
            left.insightPoints > right.insightPoints
            || left.qualityModifier > right.qualityModifier
            || left.fatigueDelta < right.fatigueDelta
          );
        expect(leftStrictlyDominates, `${leftType} must not dominate ${rightType}`).toBe(false);
      }
    }
  });

  it("carries exact choice costs and modifiers into the completed session result", () => {
    let session = createQuickSession("analyticsTeamMeeting", "result-modifiers");

    while (session.state === "active") {
      const phase = session.phases[session.currentPhaseIndex];
      expect(phase?.choices?.length).toBeGreaterThan(0);
      session = resolveQuickInteractionChoice(session, phase!.choices![0].id, branchRng(session));
      session = advanceSessionPhase(session);
    }

    expect(session.state).toBe("reflection");
    const result = getSessionResult(session);
    expect(result.strategicChoices).toHaveLength(session.phases.length);
    expect(result.fatigueDelta).toBe(
      result.strategicChoices.reduce((sum, choice) => sum + choice.fatigueDelta, 0),
    );
    expect(result.qualityModifier).toBe(
      result.strategicChoices.reduce((sum, choice) => sum + choice.qualityModifier, 0),
    );
    expect(result.insightPointsEarned).toBe(
      result.strategicChoices.reduce((sum, choice) => sum + choice.insightPointsAwarded, 0),
    );
  });

  it("rewinds a transient legacy session instead of accepting its random phase-2 branch", () => {
    const session = createQuickSession("statsBriefing", "legacy-repair");
    const legacy = {
      ...session,
      currentPhaseIndex: 1,
      phases: session.phases.map((phase, index) => ({
        ...phase,
        choices: (index === 1 ? session.phases[0].choices : phase.choices)?.map((choice) => {
          const { impact: _impact, ...preIntegrityChoice } = choice;
          return preIntegrityChoice as StrategicChoice;
        }),
        selectedChoiceId: undefined,
        choiceResolution: undefined,
      })),
    };

    const migrated = migrateQuickInteractionSession(legacy, branchRng(legacy));
    expect(migrated.currentPhaseIndex).toBe(0);
    expect(migrated.phases[0]?.choices?.every((choice) => Boolean(choice.impact))).toBe(true);
    expect(migrated.phases[1]?.choices).toBeUndefined();
    expect(migrated.insightPointsEarned).toBe(0);
  });
});
