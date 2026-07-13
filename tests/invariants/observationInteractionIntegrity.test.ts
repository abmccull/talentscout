import { describe, expect, it } from "vitest";

import type { GameState, Scout } from "@/engine/core/types";
import {
  getInsightActionAvailability,
  type InsightActionAvailability,
} from "@/engine/insight/insight";
import type { InsightState } from "@/engine/insight/types";
import {
  migrateObservationSessionInteractions,
  resolveDataPointSelection,
  resolveDialogueOptionSelection,
} from "@/engine/observation/interactionSelection";
import { createSession, startSession } from "@/engine/observation/session";
import type { ObservationSession, SessionPhase } from "@/engine/observation/types";
import { createRNG } from "@/engine/rng";
import { createObservationActions } from "@/stores/actions/observationActions";
import type { GetState, SetState } from "@/stores/actions/types";
import type { GameStoreState } from "@/stores/gameStore";

function activeSession(mode: "investigation" | "analysis"): ObservationSession {
  const activityType = mode === "investigation" ? "followUpSession" : "databaseQuery";
  const skeleton = startSession(createSession({
    activityType,
    specialization: mode === "analysis" ? "data" : "youth",
    playerPool: [{ playerId: "player-1", name: "Ari Prospect", position: "CM" }],
    targetPlayerId: "player-1",
    seed: `interaction-${mode}`,
    week: 8,
    season: 2,
    sourceContactId: mode === "investigation" ? "contact-1" : undefined,
    sourceContactName: mode === "investigation" ? "Casey Coach" : undefined,
    sourceRelationshipScore: mode === "investigation" ? 98 : undefined,
  }, createRNG(`interaction-${mode}`)));

  const phase: SessionPhase = {
    ...skeleton.phases[0],
    index: 0,
    dialogueNodes: mode === "investigation"
      ? [{
          id: "node-1",
          speaker: "Casey Coach",
          text: "How strongly do you want to press?",
          options: [
            {
              id: "safe",
              text: "Keep the exchange measured",
              riskLevel: "safe",
              outcome: {
                narrativeText: "The contact appreciates your restraint.",
                relationshipDelta: 4,
                insightBonus: 3,
              },
            },
            {
              id: "bold",
              text: "Press for the hidden detail",
              riskLevel: "bold",
              outcome: {
                narrativeText: "The contact bristles at the pressure.",
                relationshipDelta: -3,
                insightBonus: 8,
              },
            },
          ],
        }]
      : undefined,
    dataPoints: mode === "analysis"
      ? [
          {
            id: "highlight",
            playerId: "player-1",
            label: "Progressive passes",
            value: 8.4,
            category: "anomaly",
            isHighlighted: true,
          },
          {
            id: "ordinary",
            playerId: "player-1",
            label: "Touches",
            value: 41,
            category: "statistical",
            isHighlighted: false,
          },
        ]
      : undefined,
  };

  return {
    ...skeleton,
    mode,
    phases: [phase],
    currentPhaseIndex: 0,
  };
}

function insightState(overrides: Partial<InsightState> = {}): InsightState {
  return {
    points: 0,
    capacity: 60,
    cooldownWeeksRemaining: 0,
    lifetimeUsed: 0,
    lifetimeEarned: 0,
    lastUsedWeek: 0,
    history: [],
    ...overrides,
  };
}

const dataScout = {
  primarySpecialization: "data",
  attributes: { intuition: 10 },
} as Scout;

function algorithmicEpiphany(
  options: InsightActionAvailability[],
): InsightActionAvailability {
  const option = options.find(({ action }) => action.id === "algorithmicEpiphany");
  if (!option) throw new Error("Expected algorithmicEpiphany availability");
  return option;
}

function observationStore(
  session: ObservationSession,
  gameState: GameState,
): {
  actions: ReturnType<typeof createObservationActions>;
  getStore: () => GameStoreState;
} {
  let store = {
    activeSession: session,
    gameState,
    lastInsightResult: null,
  } as unknown as GameStoreState;
  const get: GetState = () => store;
  const set: SetState = (partial) => {
    const update = typeof partial === "function" ? partial(store) : partial;
    store = { ...store, ...update };
  };
  return {
    actions: createObservationActions(get, set),
    getStore: () => store,
  };
}

describe("observation interaction integrity", () => {
  it("locks a dialogue option, snapshots the bounded applied relationship, and rewards once", () => {
    const original = activeSession("investigation");
    const selected = resolveDialogueOptionSelection(original, "node-1", "safe");

    expect(selected.applied).toBe(true);
    expect(selected.session.insightPointsEarned).toBe(3);
    expect(selected.session.sourceRelationshipScore).toBe(100);
    expect(selected.resolution).toMatchObject({
      optionId: "safe",
      insightPointsAwarded: 3,
      relationshipDeltaApplied: 2,
      sourceContactId: "contact-1",
    });
    expect(selected.session.phases[0].selectedDialogueOptionIds).toEqual({
      "node-1": "safe",
    });
  });

  it("cannot repeat or overwrite a dialogue decision before or after serialization", () => {
    const selected = resolveDialogueOptionSelection(
      activeSession("investigation"),
      "node-1",
      "safe",
    ).session;

    expect(resolveDialogueOptionSelection(selected, "node-1", "safe")).toEqual({
      session: selected,
      applied: false,
    });
    expect(resolveDialogueOptionSelection(selected, "node-1", "bold")).toEqual({
      session: selected,
      applied: false,
    });

    const reloaded = migrateObservationSessionInteractions(
      JSON.parse(JSON.stringify(selected)) as ObservationSession,
    );
    const afterReload = resolveDialogueOptionSelection(reloaded, "node-1", "bold");
    expect(afterReload.applied).toBe(false);
    expect(afterReload.session.insightPointsEarned).toBe(3);
    expect(afterReload.session.sourceRelationshipScore).toBe(100);
    expect(afterReload.session.phases[0].selectedDialogueOptionIds?.["node-1"]).toBe("safe");
  });

  it("fails closed when a selected id survives but a legacy resolution is absent", () => {
    const selected = resolveDialogueOptionSelection(
      activeSession("investigation"),
      "node-1",
      "safe",
    ).session;
    const legacy = {
      ...selected,
      phases: selected.phases.map((phase) => ({
        ...phase,
        dialogueChoiceResolutions: undefined,
      })),
    };

    const migrated = migrateObservationSessionInteractions(legacy);
    expect(resolveDialogueOptionSelection(migrated, "node-1", "bold").applied).toBe(false);
    expect(migrated.insightPointsEarned).toBe(3);
  });

  it("locks one analysis point and cannot farm or replace its insight reward", () => {
    const selected = resolveDataPointSelection(activeSession("analysis"), "highlight");
    expect(selected.applied).toBe(true);
    expect(selected.session.insightPointsEarned).toBe(3);
    expect(selected.session.phases[0].dataPointResolution).toMatchObject({
      pointId: "highlight",
      insightPointsAwarded: 3,
    });

    expect(resolveDataPointSelection(selected.session, "highlight").applied).toBe(false);
    expect(resolveDataPointSelection(selected.session, "ordinary").applied).toBe(false);
    const reloaded = migrateObservationSessionInteractions(
      JSON.parse(JSON.stringify(selected.session)) as ObservationSession,
    );
    expect(resolveDataPointSelection(reloaded, "ordinary").applied).toBe(false);
    expect(reloaded.insightPointsEarned).toBe(3);
    expect(reloaded.phases[0].selectedDataPointId).toBe("highlight");
  });

  it("describes low-IP and cooldown gates through the same contract the store enforces", () => {
    const lowIp = algorithmicEpiphany(
      getInsightActionAvailability(insightState({ points: 4 }), dataScout, "analysis"),
    );
    expect(lowIp.canUse).toBe(false);
    expect(lowIp.reason).toBe("Not enough Insight Points. Need 25, have 4.");

    const cooldown = algorithmicEpiphany(
      getInsightActionAvailability(
        insightState({ points: 50, cooldownWeeksRemaining: 2 }),
        dataScout,
        "analysis",
      ),
    );
    expect(cooldown.canUse).toBe(false);
    expect(cooldown.reason).toBe("Insight is on cooldown for 2 more weeks.");
  });

  it("projects the visible relationship consequence exactly once through the store action", () => {
    const session = activeSession("investigation");
    const gameState = {
      currentWeek: 8,
      contacts: {
        "contact-1": {
          id: "contact-1",
          name: "Casey Coach",
          type: "academyCoach",
          organization: "North Academy",
          relationship: 98,
          reliability: 70,
          knownPlayerIds: ["player-1"],
        },
      },
    } as unknown as GameState;
    const { actions, getStore } = observationStore(session, gameState);

    actions.selectDialogueOption("node-1", "safe");
    actions.selectDialogueOption("node-1", "safe");
    actions.selectDialogueOption("node-1", "bold");

    expect(getStore().activeSession?.insightPointsEarned).toBe(3);
    expect(getStore().gameState?.contacts["contact-1"].relationship).toBe(100);
    expect(getStore().gameState?.activeObservationSession).toBe(getStore().activeSession);
    expect(
      getStore().activeSession?.phases[0]
        .selectedDialogueOptionIds?.["node-1"],
    ).toBe("safe");
  });

  it("returns false without mutating insight state when IP or cooldown blocks the store action", () => {
    const session = activeSession("analysis");
    const lowIp = insightState({ points: 4 });
    const gameState = {
      seed: "blocked-insight",
      currentWeek: 8,
      currentSeason: 2,
      scout: { ...dataScout, insightState: lowIp },
    } as unknown as GameState;
    const lowIpStore = observationStore(session, gameState);

    expect(lowIpStore.actions.useInsight("algorithmicEpiphany")).toBe(false);
    expect(lowIpStore.getStore().gameState?.scout.insightState).toEqual(lowIp);
    expect(lowIpStore.getStore().lastInsightResult).toBeNull();

    const cooldown = insightState({ points: 50, cooldownWeeksRemaining: 2 });
    const cooldownStore = observationStore(session, {
      ...gameState,
      scout: { ...gameState.scout, insightState: cooldown },
    });
    expect(cooldownStore.actions.useInsight("algorithmicEpiphany")).toBe(false);
    expect(cooldownStore.getStore().gameState?.scout.insightState).toEqual(cooldown);
    expect(cooldownStore.getStore().lastInsightResult).toBeNull();
  });
});
