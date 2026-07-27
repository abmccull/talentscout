import { describe, expect, it } from "vitest";
import type { GameState } from "@/engine/core/types";
import {
  createConsequenceEngineState,
  createDecisionRecord,
  registerDecision,
  selectDecisionOption,
} from "@/engine/consequences";
import { createRelationshipCallbackMessage } from "@/stores/actions/weeklyNarrativeConsequences";

function selectedRelationshipConsequence() {
  const offeredAt = { season: 1, week: 1 };
  const decision = createDecisionRecord({
    id: "relationship-conflict:academy-credit",
    source: { kind: "relationshipConflict", id: "academy-credit" },
    offeredAt,
    deadlineAt: { season: 1, week: 2 },
    visibility: "stakeholders",
    stakeholders: [
      { kind: "contact", id: "coach-1" },
      { kind: "manager", id: "manager-1" },
    ],
    outcomeRoll: 0.2,
    metadata: {
      recurrenceName: "The credit argument",
      relatedPlayerId: "player-1",
    },
    options: [
      {
        id: "share-credit",
        label: "Share the credit publicly",
        knownTradeoffs: ["The coach expects their role to be named"],
        immediateEffects: [],
        scheduledConsequences: [{
          id: "the-room-remembers",
          dueAt: { season: 1, week: 3 },
          effects: [],
          tags: ["relationshipConflict", "callback"],
        }],
      },
      {
        id: "keep-control",
        label: "Keep control of the story",
        knownTradeoffs: ["The coach may feel erased"],
        immediateEffects: [],
        scheduledConsequences: [],
      },
    ],
  });
  const registered = registerDecision(createConsequenceEngineState(), decision).state;
  const selected = selectDecisionOption(
    registered,
    decision.id,
    "share-credit",
    offeredAt,
  ).state;
  const consequence = Object.values(selected.consequences)[0];
  if (!consequence) throw new Error("Expected selected relationship consequence");
  return { selected, consequence };
}

function callbackState(): GameState {
  const { selected } = selectedRelationshipConsequence();
  return {
    currentWeek: 3,
    currentSeason: 1,
    consequenceState: selected,
    players: {
      "player-1": { id: "player-1", firstName: "Ivo", lastName: "Santos" },
    },
    retiredPlayers: {},
    unsignedYouth: {},
    contacts: {
      "coach-1": { id: "coach-1", name: "Mara Ellis" },
    },
    clubs: {
      "club-1": { id: "club-1", name: "Northbridge", managerId: "manager-1" },
    },
    managerProfiles: {
      "club-1": {
        clubId: "club-1",
        managerId: "manager-1",
        managerName: "Asha Morgan",
      },
    },
    rivalScouts: {},
    npcScouts: {},
    scout: { id: "scout-1", firstName: "Sam", lastName: "Vale" },
    finances: { employees: [] },
  } as unknown as GameState;
}

describe("relationship callback visibility", () => {
  it("turns delayed relationship fallout into a named, player-linked message", () => {
    const state = callbackState();
    const consequence = Object.values(state.consequenceState.consequences)[0]!;
    const message = createRelationshipCallbackMessage(state, consequence);

    expect(message).toMatchObject({
      id: `relationship-callback-${consequence.id}`,
      title: "The credit argument: The Room Remembers",
      actionRequired: false,
      relatedId: "player-1",
      relatedEntityType: "player",
    });
    expect(message?.body).toContain('"Share the credit publicly"');
    expect(message?.body).toContain("Ivo Santos");
    expect(message?.body).toContain("Mara Ellis");
    expect(message?.body).toContain("Asha Morgan");
  });

  it("does not invent a relationship story for an unrelated consequence", () => {
    const state = callbackState();
    const consequence = Object.values(state.consequenceState.consequences)[0]!;

    expect(createRelationshipCallbackMessage(state, {
      ...consequence,
      tags: consequence.tags.filter((tag) => tag !== "relationshipConflict"),
    })).toBeUndefined();
  });
});
