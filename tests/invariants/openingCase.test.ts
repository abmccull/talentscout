import { describe, expect, it } from "vitest";
import type {
  GameState,
  ReflectionJournalEntry,
  ScoutingEvidenceCard,
  Player,
  Scout,
  UnsignedYouth,
} from "@/engine/core/types";
import { createConsequenceEngineState } from "@/engine/consequences";
import type { ObservationSession } from "@/engine/observation/types";
import {
  OPENING_CASE_CHOICES,
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
  it("preserves an inconclusive opening read instead of inventing an exceptional action", () => {
    const state = openingState();
    const entry: ReflectionJournalEntry = {
      id: "journal-opening", sessionId: "opening-session", activityInstanceId: "opening-discovery:test",
      activityType: "schoolMatch", week: 1, season: 1, playerIds: ["lead"],
      notes: [], hypotheses: [], evidenceVersion: 1, createdAt: 1,
      evidenceCards: [{ id: "missed", playerId: "lead", clarity: "missed", classification: "noConclusion",
        detail: "You could not isolate a defensible cue from this passage.", summary: "No clean read",
      } as ScoutingEvidenceCard],
    };
    state.reflectionJournal = { opening: entry };
    const projection = buildOpeningCaseProjection(state)!;
    expect(projection.signal).toContain("No reliable conclusion");
    expect(projection.signal).toContain(entry.evidenceCards![0].detail);
    expect(projection.uncertainty).toContain("does not yet support a finding");
    expect(JSON.stringify(projection)).not.toMatch(/exceptional|vision and anticipation|natural composure/i);

    state.reflectionJournal.later = { ...entry, id: "later", week: 2, createdAt: 100,
      evidenceCards: [{ ...entry.evidenceCards![0], clarity: "usable", classification: "preReceiveDecision", detail: "Later-session detail" }],
    };
    expect(buildOpeningCaseProjection(state)?.signal).toBe(projection.signal);
    entry.evidenceCards = [{ ...entry.evidenceCards![0], clarity: "usable", classification: "preReceiveDecision", detail: "Scanned before receiving and found the exit." }];
    expect(buildOpeningCaseProjection(state)?.signal).toBe("Scanned before receiving and found the exit.");
  });

  it("does not borrow another player's cue or an unrelated same-week session", () => {
    const state = openingState();
    state.reflectionJournal = { unrelated: {
      id: "unrelated", sessionId: "other", activityInstanceId: "ordinary-booking",
      activityType: "schoolMatch", week: 1, season: 1, playerIds: ["lead"],
      notes: [], hypotheses: [], createdAt: 1,
      flaggedMoments: [{ id: "other-cue", playerId: "lead", description: "Unrelated detail",
        phaseIndex: 0, minute: 12, reaction: "promising", momentType: "tacticalDecision",
        attributesHinted: [], pressureContext: false }],
    } };
    expect(buildOpeningCaseProjection(state)?.signal).not.toContain("Unrelated detail");
    state.reflectionJournal.unrelated.activityInstanceId = "opening-discovery:test";
    state.reflectionJournal.unrelated.flaggedMoments![0].playerId = "other-player";
    expect(buildOpeningCaseProjection(state)?.signal).toContain("no retained player-specific passage");
  });
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

  it("keeps player-facing opening copy inside the scouting fiction", () => {
    const { openingCase, unsignedYouth } = setup();
    const projection = buildOpeningCaseProjection({ openingCase, unsignedYouth });
    const playerFacingCopy = JSON.stringify({ projection, choices: OPENING_CASE_CHOICES });

    expect(playerFacingCopy).not.toMatch(/\bthe game\b|early access|core loop|generated case/i);
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

  it("turns the opening watch into three authored beats of the real session", () => {
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
    expect(shaped.phases[0].moments[0]).toMatchObject({ quality: 6 });
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
    expect(resolved.inbox.at(-1)?.body).toContain("reads the silence as discretion");
    expect(resolved.inbox.at(-1)?.body).toContain("first reaction");
    expect(Object.keys(resolved.consequenceState.decisions)).toHaveLength(1);
    expect(Object.keys(resolved.consequenceState.memories)).toHaveLength(1);
    expect(Object.keys(resolved.consequenceState.facts)).toHaveLength(1);
  });
});
