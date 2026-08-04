import { describe, expect, it } from "vitest";
import type { GameState, Observation, Player, Scout, UnsignedYouth } from "@/engine/core/types";
import { getAvailableActivities } from "@/engine/core/calendar";
import {
  buildProfessionalCaseOpportunityLockMetadata,
  applyProfessionalCaseOpportunityActivity,
} from "@/engine/youth/professionalCaseOpportunities";
import { createConsequenceEngineState, type OpportunityLock } from "@/engine/consequences";

function makePlayer(id: string, firstName: string, lastName: string): Player {
  return {
    id,
    firstName,
    lastName,
    age: 16,
    position: "RW",
    nationality: "ghana",
    injured: false,
    clubId: "",
  } as unknown as Player;
}

function makeYouth(id: string, player: Player): UnsignedYouth {
  return {
    id,
    player,
    visibility: 25,
    buzzLevel: 15,
    discoveredBy: ["scout-1"],
    regionId: "region-1",
    country: "ghana",
    venueAppearances: ["schoolMatch"],
    generatedSeason: 1,
    placed: false,
    retired: false,
  };
}

function makeScout(): Scout {
  return {
    id: "scout-1",
    firstName: "Alex",
    lastName: "Morgan",
    primarySpecialization: "youth",
    careerTier: 2,
    reputation: 35,
    fatigue: 20,
    clubTrust: 50,
    specializationReputation: 30,
  } as unknown as Scout;
}

function makeLock(input: {
  id: string;
  player: Player;
  caseId?: string;
  familyId?: string;
  label?: string;
  exclusiveSetId?: string;
  expiresWeek?: number;
}): OpportunityLock {
  const caseId = input.caseId ?? "case_scout-1_prospect-1";
  const familyId = input.familyId ?? "role-conversion";
  return {
    id: input.id,
    opportunityId: `professional-case:${caseId}:${familyId}:opening`,
    exclusiveSetId: input.exclusiveSetId ?? `professional-case:${caseId}:${familyId}`,
    owner: { kind: "scout", id: "scout-1" },
    status: "active",
    createdAt: { season: 1, week: 9 },
    expiresAt: { season: 1, week: input.expiresWeek ?? 12 },
    sourceDecisionId: "decision:case",
    metadata: buildProfessionalCaseOpportunityLockMetadata({
      label: input.label ?? "Role-conversion access window",
      actorName: "Maya Okoro",
      countryId: input.player.nationality,
      playerName: `${input.player.firstName} ${input.player.lastName}`,
      clubName: "Right Step Academy",
      playerId: input.player.id,
      caseId,
      familyId,
    }),
  };
}

function makeState(): GameState {
  const lockedPlayer = makePlayer("prospect-1", "Noah", "Mensah");
  const observedPlayer = makePlayer("prospect-2", "Luis", "Diaz");
  const unsignedYouth = {
    "unsigned-1": makeYouth("unsigned-1", lockedPlayer),
    "unsigned-2": makeYouth("unsigned-2", observedPlayer),
  };
  const observations: Record<string, Observation> = {
    "obs-1": { id: "obs-1", playerId: observedPlayer.id } as Observation,
    "obs-2": { id: "obs-2", playerId: observedPlayer.id } as Observation,
  };
  return {
    currentWeek: 9,
    currentSeason: 1,
    scout: makeScout(),
    fixtures: {},
    contacts: {},
    subRegions: {},
    observations,
    unsignedYouth,
    players: {},
    reports: {},
    consequenceState: {
      ...createConsequenceEngineState(),
      opportunityLocks: {
        "lock:primary": makeLock({ id: "lock:primary", player: lockedPlayer }),
      },
    },
    scoutingCases: {
      "case_scout-1_prospect-1": {
        id: "case_scout-1_prospect-1",
        playerId: lockedPlayer.id,
        openedWeek: 5,
        openedSeason: 1,
        lastUpdatedWeek: 5,
        lastUpdatedSeason: 1,
      },
    },
    inbox: [],
    retiredPlayers: {},
  } as unknown as GameState;
}

describe("professional case opportunities", () => {
  it("surfaces live windows in targeted youth activity pools and prioritizes them", () => {
    const state = makeState();

    const activities = getAvailableActivities(
      state.scout,
      state.currentWeek,
      [],
      [],
      state.subRegions,
      state.observations,
      state.unsignedYouth,
      state.players,
      undefined,
      undefined,
      state.reports,
      {
        currentSeason: state.currentSeason,
        consequenceState: state.consequenceState,
      },
    );

    const followUp = activities.find((activity) => activity.type === "followUpSession");
    expect(followUp?.targetPool?.[0]).toMatchObject({
      id: "prospect-1",
      description: "Role-conversion access window until S1 W12",
    });
  });

  it("consumes the matching live lock, records a fact, and closes exclusive siblings", () => {
    const state = makeState();
    const lockedPlayer = state.unsignedYouth["unsigned-1"]!.player;
    state.consequenceState.opportunityLocks["lock:sibling"] = makeLock({
      id: "lock:sibling",
      player: lockedPlayer,
      label: "Fallback trial window",
      exclusiveSetId: "professional-case:case_scout-1_prospect-1:role-conversion",
      expiresWeek: 14,
    });

    const updated = applyProfessionalCaseOpportunityActivity(
      state,
      "followUpSession",
      lockedPlayer.id,
    );

    expect(updated.consequenceState.opportunityLocks["lock:primary"]?.status).toBe("consumed");
    expect(updated.consequenceState.opportunityLocks["lock:sibling"]?.status).toBe("closed");
    expect(updated.consequenceState.facts["fact:case_scout-1_prospect-1:opportunity:lock:primary"])
      .toMatchObject({
        kind: "professionalCaseOpportunityResolved",
        value: "followUpSession",
      });
    expect(updated.inbox.some((message) =>
      message.id === "prospect-follow-up:case_scout-1_prospect-1:lock:primary",
    )).toBe(true);
    expect(updated.scoutingCases["case_scout-1_prospect-1"]?.lastUpdatedWeek).toBe(9);
  });

  it("does not consume a lock for an unrelated target", () => {
    const state = makeState();

    expect(applyProfessionalCaseOpportunityActivity(
      state,
      "followUpSession",
      "prospect-404",
    )).toBe(state);
  });

  it("is idempotent across duplicate or replayed activity resolution", () => {
    const state = makeState();
    const consumed = applyProfessionalCaseOpportunityActivity(
      state,
      "followUpSession",
      "prospect-1",
    );

    expect(applyProfessionalCaseOpportunityActivity(
      consumed,
      "followUpSession",
      "prospect-1",
    )).toBe(consumed);
  });
});
