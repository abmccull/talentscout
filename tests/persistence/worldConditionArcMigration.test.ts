import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createConsequenceEngineState,
  registerDecision,
  selectDecisionOption,
} from "@/engine/consequences";
import {
  createWorldConditionArcState,
  materializeWorldConditionArcDecision,
  startWorldConditionArcs,
} from "@/engine/world/worldConditionArcs";
import type {
  WorldConditionInstance,
  WorldConditionModifiers,
} from "@/engine/world/worldConditions";
import { migrateSaveRecord, migrateSaveState } from "@/lib/db";

const goldenV0Path = fileURLToPath(
  new URL("../fixtures/saves/v0-save-record.json", import.meta.url),
);

const NEUTRAL: WorldConditionModifiers = {
  discoveryMultiplier: 1,
  observationConfidenceMultiplier: 1,
  opportunityMultiplier: 1,
  developmentMultiplier: 1,
  breakthroughMultiplier: 1,
  recruitmentScoreAdjustment: 0,
  travelCostMultiplier: 1,
  travelDurationDelta: 0,
  travelFatigueMultiplier: 1,
  marketplaceValueMultiplier: 1,
  rivalPressureMultiplier: 1,
  seasonalFinanceAdjustment: 0,
};

function baseline() {
  const legacy = JSON.parse(readFileSync(goldenV0Path, "utf8")) as unknown;
  return migrateSaveRecord(legacy).state;
}

function academyArcFixture() {
  const state = baseline();
  const now = { week: state.currentWeek, season: state.currentSeason };
  const condition: WorldConditionInstance = {
    id: `academy-investment-wave:s${state.currentSeason}:england`,
    definitionId: "academy-investment-wave",
    scope: "regional",
    season: state.currentSeason,
    countryId: "england",
    modifiers: NEUTRAL,
  };
  const arcs = startWorldConditionArcs({
    state: createWorldConditionArcState(),
    rootSeed: state.runManifest.rootSeed,
    conditions: [condition],
    now,
  });
  const arc = Object.values(arcs.active)[0];
  const decision = materializeWorldConditionArcDecision(arc, now)!;
  return { state, now, arcs, arc, decision };
}

describe("world-condition arc save migration", () => {
  it("initializes legacy saves through the canonical idempotent boundary", () => {
    const first = migrateSaveState(baseline());
    const second = migrateSaveState(first);

    expect(first.worldConditionArcState).toEqual({
      version: 1,
      active: {},
      completed: [],
    });
    expect(second).toEqual(first);
  });

  it("reconciles a persisted selection without rerolling or delaying its aftermath", () => {
    const { state, now, arcs, arc, decision } = academyArcFixture();
    const registered = registerDecision(createConsequenceEngineState(), decision);
    const selected = selectDecisionOption(
      registered.state,
      decision.id,
      "embed-locally",
      now,
    );
    const migrated = migrateSaveState({
      ...state,
      worldConditionArcState: arcs,
      consequenceState: selected.state,
    });
    const reloaded = migrateSaveState(migrated);
    const migratedArc = migrated.worldConditionArcState?.active[arc.id];

    expect(migratedArc).toMatchObject({
      selectedChoiceId: "embed-locally",
      selectedAt: now,
      aftermathAt: {
        season: now.season,
        week: now.week + 5,
      },
      outcomeRoll: arc.outcomeRoll,
    });
    expect(reloaded).toEqual(migrated);
  });

  it("closes an orphaned action prompt instead of pinning it forever", () => {
    const { state, decision } = academyArcFixture();
    const registered = registerDecision(createConsequenceEngineState(), decision);
    const messageId = "orphan-world-arc-choice";
    const migrated = migrateSaveState({
      ...state,
      worldConditionArcState: createWorldConditionArcState(),
      consequenceState: registered.state,
      inbox: [
        ...state.inbox,
        {
          id: messageId,
          week: state.currentWeek,
          season: state.currentSeason,
          type: "event",
          title: "Orphaned world choice",
          body: "This prompt lost its owning arc.",
          read: false,
          actionRequired: true,
          relatedId: decision.id,
          relatedEntityType: "narrative",
        },
      ],
    });

    expect(migrated.consequenceState.decisions[decision.id]).toMatchObject({
      status: "expired",
      selectionKind: "system",
    });
    expect(migrated.inbox.find((message) => message.id === messageId)?.actionRequired)
      .toBe(false);
  });
});
