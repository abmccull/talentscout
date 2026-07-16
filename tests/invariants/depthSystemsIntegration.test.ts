import { describe, expect, it } from "vitest";

import {
  createCareerMoment,
  enqueueCareerMoments,
  suppressCareerMoment,
} from "@/engine/career/careerMoments";
import {
  offerLateCareerDilemma,
} from "@/engine/career/lateCareerDilemmaMaterializer";
import {
  LATE_CAREER_DILEMMAS,
} from "@/engine/career/lateCareerDilemmas";
import { createConsequenceEngineState } from "@/engine/consequences/decisionLedger";
import type {
  GameState,
  RegionalKnowledge,
  Scout,
} from "@/engine/core/types";
import {
  getRegionalTravelQuote,
} from "@/engine/world/regionalPresence";
import { bookTravel } from "@/engine/world/travel";
import { createProgressionActions } from "@/stores/actions/progressionActions";
import type { GetState, SetState } from "@/stores/actions/types";
import type { GameStoreState } from "@/stores/gameStoreTypes";

function careerMoment(id: string) {
  return createCareerMoment({
    rootSeed: "depth-integration",
    id,
    source: { kind: "test", id },
    occurredAt: { season: 3, week: 8 },
    category: "vindication",
    tone: "positive",
    magnitude: "major",
    cue: "vindication",
    title: `Moment ${id}`,
    summary: "A material scouting call returned to the career record.",
    stakeholderIds: [],
    tags: ["regression"],
  });
}

function knowledge(countryId: string, knowledgeLevel: number): RegionalKnowledge {
  return {
    countryId,
    knowledgeLevel,
    discoveredLeagues: [],
    culturalInsights: [],
    localContacts: [],
    scoutingEfficiency: 1,
  };
}

function scout(): Scout {
  return {
    id: "scout-1",
    firstName: "Rae",
    lastName: "Mora",
    age: 39,
    nationality: "English",
    homeCountry: "england",
    attributes: { adaptability: 10, intuition: 12 } as Scout["attributes"],
    skills: {} as Scout["skills"],
    primarySpecialization: "regional",
    specializationLevel: 10,
    specializationXp: 0,
    unlockedPerks: [],
    careerTier: 5,
    careerPath: "club",
    reputation: 60,
    clubTrust: 70,
    specializationReputation: 55,
    currentClubId: "eng-club",
    salary: 0,
    savings: 0,
    reportsSubmitted: 0,
    successfulFinds: 0,
    discoveryCredits: [],
    fatigue: 20,
    skillXp: {},
    attributeXp: {},
    npcScoutIds: [],
    countryReputations: {
      england: {
        country: "england",
        familiarity: 50,
        reportsSubmitted: 0,
        successfulFinds: 0,
        contactCount: 0,
      },
      brazil: {
        country: "brazil",
        familiarity: 20,
        reportsSubmitted: 0,
        successfulFinds: 0,
        contactCount: 0,
      },
    },
    boardDirectives: [],
  } as Scout;
}

function regionalState(): GameState {
  return {
    seed: "travel-posture-regression",
    runManifest: { rootSeed: "travel-posture-regression" },
    currentWeek: 8,
    currentSeason: 3,
    scout: scout(),
    countries: ["england", "brazil"],
    territories: {
      england: {
        id: "england",
        name: "England",
        country: "England",
        countryKey: "england",
        leagueIds: ["eng-league"],
        maxScouts: 3,
        assignedScoutIds: [],
      },
      brazil: {
        id: "brazil",
        name: "Brazil",
        country: "Brazil",
        countryKey: "brazil",
        leagueIds: ["bra-league"],
        maxScouts: 3,
        assignedScoutIds: [],
      },
    },
    leagues: {
      "eng-league": { id: "eng-league", country: "England", clubIds: ["eng-club"] },
      "bra-league": { id: "bra-league", country: "Brazil", clubIds: ["bra-club"] },
    },
    clubs: {
      "eng-club": { id: "eng-club", leagueId: "eng-league", managerId: "manager-1" },
      "bra-club": { id: "bra-club", leagueId: "bra-league" },
    },
    players: {
      prospect: {
        id: "prospect",
        clubId: "bra-club",
        firstName: "Jo",
        lastName: "Silva",
      },
    },
    fixtures: {
      "eng-fixture": { id: "eng-fixture", leagueId: "eng-league" },
      "bra-fixture": { id: "bra-fixture", leagueId: "bra-league" },
    },
    subRegions: {
      england: {
        id: "england",
        name: "London",
        country: "England",
        countryKey: "england",
        familiarity: 0,
      },
      brazil: {
        id: "brazil",
        name: "Sao Paulo",
        country: "Brazil",
        countryKey: "brazil",
        familiarity: 0,
      },
    },
    unsignedYouth: {},
    youthTournaments: {},
    regionalKnowledge: {
      england: knowledge("england", 25),
      brazil: knowledge("brazil", 20),
    },
    contacts: {},
    finances: undefined,
    assistantScouts: [],
    npcScouts: {},
    consequenceState: createConsequenceEngineState(),
    inbox: [],
  } as unknown as GameState;
}

describe("depth-system integration regressions", () => {
  it("suppresses one career moment exactly once while preserving the rest of the queue", () => {
    const first = careerMoment("first");
    const second = careerMoment("second");
    const queued = enqueueCareerMoments(undefined, [first, second], {
      season: 3,
      week: 8,
    });

    const suppressed = suppressCareerMoment(
      queued,
      first.id,
      { season: 3, week: 9 },
      "Player disabled this automatic presentation.",
    );
    const replayed = suppressCareerMoment(
      suppressed,
      first.id,
      { season: 3, week: 10 },
      "A replay must not add another delivery.",
    );
    const regenerated = enqueueCareerMoments(replayed, [first], {
      season: 3,
      week: 11,
    });

    expect(suppressed.pending.map((moment) => moment.id)).toEqual([second.id]);
    expect(suppressed.history).toEqual([
      expect.objectContaining({
        moment: expect.objectContaining({ id: first.id }),
        status: "suppressed",
        reason: "Player disabled this automatic presentation.",
      }),
    ]);
    expect(replayed).toEqual(suppressed);
    expect(regenerated.pending.map((moment) => moment.id)).toEqual([second.id]);
    expect(regenerated.history).toHaveLength(1);
  });

  it("persists the selected travel posture and keeps its quote tradeoffs after serialization", () => {
    const state = regionalState();
    const assignment = getRegionalTravelQuote(state, "brazil", "assignmentFirst");
    const deepDive = getRegionalTravelQuote(state, "brazil", "deepDive");
    const blitz = getRegionalTravelQuote(state, "brazil", "opportunityBlitz");
    const booked = bookTravel(
      state.scout,
      "brazil",
      state.currentWeek,
      blitz.duration,
      38,
      blitz.cost,
      "opportunityBlitz",
    );
    const reloaded = JSON.parse(JSON.stringify(booked)) as Scout;

    expect(deepDive.cost).toBeGreaterThan(assignment.cost);
    expect(blitz.cost).toBeGreaterThan(deepDive.cost);
    expect(blitz.fatigueMultiplier).toBeGreaterThan(deepDive.fatigueMultiplier);
    expect(blitz.posture).toBe("opportunityBlitz");
    expect(reloaded.travelBooking).toMatchObject({
      destinationCountry: "brazil",
      posture: "opportunityBlitz",
      cost: blitz.cost,
    });
  });

  it("resolves an offered late-career dilemma through the actual store action", () => {
    const definition = LATE_CAREER_DILEMMAS.find(
      (candidate) => candidate.id === "clubDoctrineCollision",
    );
    expect(definition).toBeDefined();
    const source = regionalState();
    source.finances = {
      employees: [{ id: "employee-1", morale: 60 }],
    } as GameState["finances"];
    source.rivalScouts = {
      rival: {
        id: "rival",
        name: "Nadia Petrov",
        isNemesis: true,
        reputation: 65,
        aggressiveness: 0.5,
      },
    } as unknown as GameState["rivalScouts"];
    const offered = offerLateCareerDilemma(source, definition!);
    expect(offered.changed).toBe(true);
    expect(offered.decision?.metadata).toMatchObject({
      title: definition!.title,
      premise: definition!.premise,
    });
    offered.state.inbox = [{
      id: "career-crossroads-inbox",
      week: source.currentWeek,
      season: source.currentSeason,
      type: "event",
      title: definition!.title,
      body: definition!.premise,
      read: false,
      actionRequired: true,
      relatedId: offered.decision!.id,
      relatedEntityType: "narrative",
    }];
    offered.state.consequenceState.callbacks["unrelated-broken-callback"] = {
      id: "unrelated-broken-callback",
      consequenceId: "missing-unrelated-consequence",
      callbackKey: "applyConsequence",
      dueAt: { week: source.currentWeek, season: source.currentSeason },
      status: "pending",
    };

    let store = { gameState: offered.state } as unknown as GameStoreState;
    const get: GetState = () => store;
    const set: SetState = (partial) => {
      const update = typeof partial === "function" ? partial(store) : partial;
      store = { ...store, ...update };
    };
    const actions = createProgressionActions(get, set);
    actions.resolveConsequenceDecision(offered.decision!.id, "threatenExit");

    const resolved = store.gameState!;
    expect(resolved.consequenceState.decisions[offered.decision!.id]).toMatchObject({
      status: "selected",
      selectedOptionId: "threatenExit",
      selectionKind: "player",
    });
    expect(resolved.scout).toMatchObject({ reputation: 61, clubTrust: 62, fatigue: 24 });
    expect(resolved.inbox[0]).toMatchObject({ read: true, actionRequired: false });
    expect(resolved.consequenceState.callbacks["unrelated-broken-callback"].status)
      .toBe("cancelled");
    expect(resolved.inbox.some((message) =>
      message.title === "A linked consequence could not be applied"
    )).toBe(true);

    actions.resolveConsequenceDecision(offered.decision!.id, "threatenExit");
    expect(store.gameState!.scout).toMatchObject({
      reputation: 61,
      clubTrust: 62,
      fatigue: 24,
    });
  });
});
