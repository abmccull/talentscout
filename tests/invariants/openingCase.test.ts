import { describe, expect, it } from "vitest";
import type {
  GameState,
  Player,
  Scout,
  UnsignedYouth,
} from "@/engine/core/types";
import { createConsequenceEngineState } from "@/engine/consequences";
import type { ObservationSession } from "@/engine/observation/types";
import {
  buildOpeningCaseProjection,
  claimOpeningDiscovery,
  createOpeningCase,
  resolveOpeningCaseChoice,
  shapeOpeningObservationSession,
} from "@/engine/youth/openingCase";

function player(id: string, potentialAbility: number): Player {
  return {
    id,
    firstName: id === "lead" ? "Micah" : "Youth",
    lastName: id === "lead" ? "Vale" : id,
    age: 16,
    nationality: "English",
    position: "CM",
    currentAbility: 45,
    potentialAbility,
    clubId: "",
    wage: 0,
    marketValue: 0,
  } as Player;
}

function youth(id: string, potentialAbility: number, country = "england"): UnsignedYouth {
  return {
    id: `youth-${id}`,
    player: player(id, potentialAbility),
    visibility: 0,
    buzzLevel: 0,
    discoveredBy: [],
    regionId: "north",
    country,
    venueAppearances: [],
    generatedSeason: 1,
    placed: false,
    retired: false,
  };
}

function setup() {
  const unsignedYouth: Record<string, UnsignedYouth> = {
    "youth-lead": youth("lead", 190),
    "youth-two": youth("two", 130),
    "youth-three": youth("three", 120),
    "youth-four": youth("four", 110),
    "youth-five": youth("five", 100),
  };
  const scout = { id: "scout-1", primarySpecialization: "youth" } as Scout;
  const openingCase = createOpeningCase({
    seed: "opening-test",
    scout,
    unsignedYouth,
    contacts: {
      tommy: {
        id: "tommy",
        name: "Tommy Reyes",
        type: "schoolCoach",
        organization: "Northside School Football",
        relationship: 60,
        reliability: 75,
        knownPlayerIds: [],
        trustLevel: 55,
      },
    },
    youthRecruitmentBriefs: {},
    week: 1,
    season: 1,
  });
  if (!openingCase) throw new Error("Expected an opening case");
  return { scout, unsignedYouth, openingCase };
}

function openingState(): GameState {
  const { scout, unsignedYouth, openingCase } = setup();
  return {
    seed: "opening-test",
    currentWeek: 1,
    currentSeason: 1,
    scout,
    unsignedYouth,
    openingCase,
    discoveryRecords: [],
    contacts: {
      tommy: {
        id: "tommy",
        name: "Tommy Reyes",
        type: "schoolCoach",
        organization: "Northside School Football",
        relationship: 60,
        reliability: 75,
        knownPlayerIds: [],
        trustLevel: 55,
      },
    },
    fixtures: {},
    rivalScouts: {},
    inbox: [],
    consequenceState: createConsequenceEngineState(),
  } as unknown as GameState;
}

describe("opening discovery case", () => {
  it("selects a genuine lead deterministically without leaking hidden ability", () => {
    const first = setup();
    const second = setup();

    expect(first.openingCase.playerId).toBe("lead");
    expect(second.openingCase).toEqual(first.openingCase);

    const projection = buildOpeningCaseProjection({
      openingCase: first.openingCase,
      unsignedYouth: first.unsignedYouth,
    });
    const playerSafeJson = JSON.stringify(projection);
    expect(playerSafeJson).not.toContain("potentialAbility");
    expect(playerSafeJson).not.toContain("currentAbility");
    expect(playerSafeJson).not.toContain("attributes");
  });

  it("starts locally when the selected world has enough eligible prospects", () => {
    const { scout } = setup();
    const unsignedYouth: Record<string, UnsignedYouth> = {
      "youth-local-one": youth("local-one", 160),
      "youth-local-two": youth("local-two", 145),
      "youth-local-three": youth("local-three", 130),
      "youth-local-four": youth("local-four", 120),
      "youth-global-one": youth("global-one", 200, "brazil"),
      "youth-global-two": youth("global-two", 195, "brazil"),
      "youth-global-three": youth("global-three", 190, "brazil"),
      "youth-global-four": youth("global-four", 185, "brazil"),
    };
    const localCase = createOpeningCase({
      seed: "local-opening",
      scout,
      unsignedYouth,
      contacts: {},
      youthRecruitmentBriefs: {},
      preferredCountry: "england",
      week: 1,
      season: 1,
    });

    expect(localCase).not.toBeNull();
    expect(unsignedYouth[localCase!.youthId].country).toBe("england");
  });

  it("turns the real observation state machine into signal, breakthrough, and contradiction", () => {
    const { openingCase, unsignedYouth } = setup();
    const session = {
      id: "session-1",
      activityInstanceId: openingCase.id,
      mode: "fullObservation",
      phases: [0, 1, 2, 3, 4].map((index) => ({
        index,
        minute: index * 15,
        description: `Phase ${index}`,
        moments: [],
      })),
      currentPhaseIndex: 0,
      players: openingCase.playerPoolIds.map((playerId) => ({ playerId })),
    } as unknown as ObservationSession;

    const shaped = shapeOpeningObservationSession(session, unsignedYouth[openingCase.youthId].player);
    expect(shaped.phases).toHaveLength(3);
    expect(shaped.phases[1].moments[0]).toMatchObject({ quality: 9, isStandout: true });
    expect(shaped.phases[2].moments[0]).toMatchObject({ quality: 4, pressureContext: true });
  });

  it("claims and resolves the first career decision exactly once", () => {
    const original = openingState();
    const claimed = claimOpeningDiscovery(original);
    const claimedAgain = claimOpeningDiscovery(claimed);

    expect(claimed.openingCase?.stage).toBe("decision");
    expect(claimed.discoveryRecords).toHaveLength(1);
    expect(claimedAgain.discoveryRecords).toHaveLength(1);

    const resolved = resolveOpeningCaseChoice(claimed, "protect");
    const resolvedAgain = resolveOpeningCaseChoice(resolved, "callClub");
    expect(resolved.openingCase).toMatchObject({ stage: "report", selectedChoiceId: "protect" });
    expect(resolvedAgain.openingCase?.selectedChoiceId).toBe("protect");
    expect(resolved.inbox.filter((message) => message.id.startsWith("opening-choice:"))).toHaveLength(1);
    expect(Object.keys(resolved.consequenceState.decisions)).toHaveLength(1);
    expect(Object.keys(resolved.consequenceState.memories)).toHaveLength(1);
    expect(Object.keys(resolved.consequenceState.facts)).toHaveLength(1);
  });
});
