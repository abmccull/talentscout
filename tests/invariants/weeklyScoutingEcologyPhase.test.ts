import { describe, expect, it } from "vitest";
import type { GameState } from "@/engine/core/types";
import { createConsequenceEngineState } from "@/engine/consequences";
import { prepareWeeklyRelationshipConflictCandidate } from "@/engine/consequences/relationshipConflictDirector";
import {
  STORY_DIRECTOR_V2_MAX_ACTIVE_CHOICES,
  createStoryDirectorStateV2,
  scoreStoryCandidatesV2,
} from "@/engine/events/storyDirectorV2";
import { directWeeklyStoryEmissionsV2 } from "@/engine/events/weeklyStoryDirectorAdapter";
import type { RivalOrganizationOpportunity } from "@/engine/rivals/organizations";
import {
  applyDirectedWeeklyScoutingEcology,
  prepareWeeklyScoutingEcology,
  type PreparedWeeklyScoutingEcology,
} from "@/stores/actions/weeklyScoutingEcologyPhase";

function ecologyFixture(): GameState {
  return {
    currentWeek: 1,
    currentSeason: 1,
    fixtures: {},
    countries: ["england"],
    runManifest: {
      rootSeed: "weekly-ecology-seed",
      specialization: "youth",
    },
    scout: {
      id: "scout",
    },
    contacts: {
      reporter: {
        id: "reporter",
        name: "Mara Vale",
        type: "journalist",
        relationship: 58,
        trustLevel: 61,
      },
    },
    finances: {
      employees: [],
    },
    rivalScouts: {
      "rival-a": {
        id: "rival-a",
        name: "Rival A",
      },
    },
    rivalOrganizationState: {
      organizations: {
        "org-alpha": {
          id: "org-alpha",
          archetypeId: "academy-conglomerate",
          name: "Northbridge Circuit",
          agendaId: "control-youth-pathways",
          memberRivalIds: ["rival-a"],
          resources: 60,
          influence: 45,
          heat: 64,
          agendaProgress: 25,
          agendaLevel: 2,
          momentum: 1,
          foundedSeason: 1,
        },
      },
      activities: [],
      opportunities: {},
      currentPressure: {
        discoveryChanceMultiplier: 1,
        poachChanceMultiplier: 1,
        signingChanceMultiplier: 1,
        youthProgressBonus: 0,
      },
      processedWeekKeys: [],
    },
    managerProfiles: {},
    boardProfile: undefined,
    clubs: {},
    players: {
      prospect: {
        id: "prospect",
        firstName: "Ivo",
        lastName: "Santos",
      },
    },
    retiredPlayers: {},
    unsignedYouth: {},
    reports: {},
    watchlist: ["prospect"],
    inbox: [],
    consequenceState: createConsequenceEngineState({
      memories: {
        "family-memory": {
          id: "family-memory",
          stakeholder: { kind: "family", id: "prospect" },
          subject: { kind: "scout", id: "scout" },
          tags: ["privacy"],
          valence: 20,
          intensity: 50,
          salience: 60,
          visibility: "stakeholders",
          createdAt: { season: 1, week: 1 },
        },
      },
    }),
  } as unknown as GameState;
}

function openRivalOpportunity(): RivalOrganizationOpportunity {
  return {
    id: "opportunity-alpha",
    organizationId: "org-alpha",
    kind: "relationship-defection",
    title: "A contact wants out",
    description: "A rival organization contact may defect if you move quickly.",
    status: "open",
    createdSeason: 1,
    createdWeek: 1,
    expiresSeason: 1,
    expiresWeek: 3,
    relatedPlayerId: "prospect",
    outcomeRoll: 0.42,
    successChance: 0.5,
    knownTradeoffs: [
      "A failed approach strengthens the rival network.",
      "Acting now consumes this week's attention.",
    ],
  };
}

function forcedRelationshipWeek(state: GameState): PreparedWeeklyScoutingEcology {
  const relationshipConflict = prepareWeeklyRelationshipConflictCandidate({
    state,
    forceTrigger: true,
  }).prepared;
  return {
    relationshipConflict,
    candidates: relationshipConflict ? [relationshipConflict.candidate] : [],
  };
}

describe("weekly scouting ecology phase", () => {
  it("keeps a prepared relationship conflict side-effect free when rejected", () => {
    const state = ecologyFixture();
    const snapshot = structuredClone(state);
    const prepared = forcedRelationshipWeek(state);

    expect(prepared.relationshipConflict).toBeDefined();
    expect(prepared.rivalOpportunity).toBeUndefined();
    expect(state).toEqual(snapshot);

    const rejected = applyDirectedWeeklyScoutingEcology({
      state,
      prepared,
      acceptedCandidateIds: new Set(),
    });

    expect(rejected).toBe(state);
    expect(Object.keys(rejected.consequenceState.decisions)).toHaveLength(0);
    expect(rejected.inbox).toEqual([]);
  });

  it("offers a relationship conflict exactly once across prepare-apply replays", () => {
    const state = ecologyFixture();
    const prepared = forcedRelationshipWeek(state);
    const candidateId = prepared.relationshipConflict?.candidate.id;

    expect(candidateId).toBeTruthy();

    const accepted = applyDirectedWeeklyScoutingEcology({
      state,
      prepared,
      acceptedCandidateIds: new Set([candidateId!]),
    });

    expect(Object.values(accepted.consequenceState.decisions).filter(
      (decision) => decision.source.kind === "relationshipConflict",
    )).toHaveLength(1);
    expect(accepted.inbox.filter((message) => message.relatedId === candidateId)).toHaveLength(1);

    const replayPrepared = prepareWeeklyScoutingEcology({ state: accepted });
    expect(replayPrepared.relationshipConflict).toBeUndefined();
    expect(replayPrepared.candidates).toEqual([]);

    const replayed = applyDirectedWeeklyScoutingEcology({
      state: accepted,
      prepared: replayPrepared,
      acceptedCandidateIds: new Set([candidateId!]),
    });

    expect(replayed).toBe(accepted);
    expect(replayed.inbox.filter((message) => message.relatedId === candidateId)).toHaveLength(1);
  });

  it("keeps a rejected rival opportunity silent but eligible for a later week", () => {
    const opportunity = openRivalOpportunity();
    const base = ecologyFixture();
    const state = {
      ...base,
      rivalOrganizationState: {
        ...base.rivalOrganizationState,
        opportunities: { [opportunity.id]: opportunity },
      },
    };
    const prepared = prepareWeeklyScoutingEcology({
      state,
      rivalOpportunity: opportunity,
    });

    expect(prepared.rivalOpportunity).toBeDefined();

    const rejected = applyDirectedWeeklyScoutingEcology({
      state,
      prepared,
      acceptedCandidateIds: new Set(),
    });

    expect(rejected).toBe(state);
    expect(rejected.inbox).toEqual([]);

    const retried = prepareWeeklyScoutingEcology({
      state: { ...rejected, currentWeek: 2 },
    });
    expect(retried.rivalOpportunity?.opportunity.id).toBe(opportunity.id);
    expect(retried.rivalOpportunity?.candidate.id)
      .toBe(prepared.rivalOpportunity?.candidate.id);
  });

  it("surfaces an accepted rival opportunity prompt only once", () => {
    const state = ecologyFixture();
    const prepared = prepareWeeklyScoutingEcology({
      state,
      rivalOpportunity: openRivalOpportunity(),
    });
    const candidateId = prepared.rivalOpportunity?.candidate.id;
    const messageId = `rival-organization-opportunity-${prepared.rivalOpportunity?.opportunity.id}`;

    expect(candidateId).toBeTruthy();

    const accepted = applyDirectedWeeklyScoutingEcology({
      state,
      prepared,
      acceptedCandidateIds: new Set([candidateId!]),
    });
    const replayed = applyDirectedWeeklyScoutingEcology({
      state: accepted,
      prepared,
      acceptedCandidateIds: new Set([candidateId!]),
    });

    expect(accepted.inbox.filter((message) => message.id === messageId)).toHaveLength(1);
    expect(replayed).toBe(accepted);
    expect(replayed.inbox.filter((message) => message.id === messageId)).toHaveLength(1);

    const noLongerPending = prepareWeeklyScoutingEcology({ state: accepted });
    expect(noLongerPending.rivalOpportunity).toBeUndefined();
  });

  it("routes ecology openings through the shared Story Director choice and novelty gates", () => {
    const state = ecologyFixture();
    const forcedRelationship = forcedRelationshipWeek(state);
    const rivalOnly = prepareWeeklyScoutingEcology({
      state,
      rivalOpportunity: openRivalOpportunity(),
    });
    const prepared: PreparedWeeklyScoutingEcology = {
      relationshipConflict: forcedRelationship.relationshipConflict,
      rivalOpportunity: rivalOnly.rivalOpportunity,
      candidates: [
        ...(forcedRelationship.relationshipConflict
          ? [forcedRelationship.relationshipConflict.candidate]
          : []),
        ...(rivalOnly.rivalOpportunity
          ? [rivalOnly.rivalOpportunity.candidate]
          : []),
      ],
    };

    expect(prepared.relationshipConflict).toBeDefined();
    expect(prepared.rivalOpportunity).toBeDefined();
    expect(prepared.candidates).toHaveLength(2);

    const direction = directWeeklyStoryEmissionsV2({
      rootSeed: "weekly-ecology-seed",
      state: createStoryDirectorStateV2(),
      now: { season: 1, week: 1 },
      priorEvents: [],
      emissions: [],
      candidates: prepared.candidates,
      activeChoiceCount: 0,
      seasonLength: 38,
    });
    const reversed = directWeeklyStoryEmissionsV2({
      rootSeed: "weekly-ecology-seed",
      state: createStoryDirectorStateV2(),
      now: { season: 1, week: 1 },
      priorEvents: [],
      emissions: [],
      candidates: [...prepared.candidates].reverse(),
      activeChoiceCount: 0,
      seasonLength: 38,
    });
    const overloaded = directWeeklyStoryEmissionsV2({
      rootSeed: "weekly-ecology-seed",
      state: createStoryDirectorStateV2(),
      now: { season: 1, week: 1 },
      priorEvents: [],
      emissions: [],
      candidates: prepared.candidates,
      activeChoiceCount: STORY_DIRECTOR_V2_MAX_ACTIVE_CHOICES,
      seasonLength: 38,
    });

    expect(direction.acceptedCandidates).toHaveLength(1);
    expect(direction.rejectedCandidates).toHaveLength(1);
    expect(reversed.acceptedCandidates[0]?.candidate.id)
      .toBe(direction.acceptedCandidates[0]?.candidate.id);

    expect(overloaded.acceptedCandidates).toEqual([]);
    expect(overloaded.rejectedCandidates).toHaveLength(2);
    expect(overloaded.rejectedCandidates.every((entry) =>
      entry.score.blockedReasons.includes("choice-overload"),
    )).toBe(true);

    const rescoredAccepted = scoreStoryCandidatesV2({
      state: direction.state,
      now: { season: 1, week: 2 },
      candidates: [direction.acceptedCandidates[0].candidate],
      activeChoiceCount: 0,
      seasonLength: 38,
    })[0];

    expect(rescoredAccepted.blockedReasons).toContain("template-cooldown");
  });
});
