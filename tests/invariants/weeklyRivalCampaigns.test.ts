import { describe, expect, it } from "vitest";
import type {
  Contact,
  GameState,
  InboxMessage,
  Observation,
  Player,
  RivalScout,
} from "@/engine/core/types";
import {
  createConsequenceEngineState,
  expireDueDecisions,
  selectDecisionOption,
} from "@/engine/consequences";
import type {
  RivalCampaign,
  RivalCampaignCounterplayOption,
} from "@/engine/rivals";
import { createRivalCampaignState } from "@/engine/rivals";
import {
  applyDirectedWeeklyRivalCampaigns,
  prepareWeeklyRivalCampaigns,
  reconcileRivalCampaignDecisions,
} from "@/stores/actions/weeklyRivalCampaigns";

function rival(id = "rival-a"): RivalScout {
  return {
    id,
    name: "Rival A",
    quality: 3,
    specialization: "regional",
    clubId: "rival-club",
    targetPlayerIds: ["known-player"],
    reputation: 52,
    personality: "aggressive",
    isNemesis: false,
    competingForPlayers: [],
    currentTarget: "known-player",
    scoutingProgress: {},
    aggressiveness: 0.7,
    budgetTier: "medium",
    winsAgainstPlayer: 0,
    lossesToPlayer: 0,
  };
}

function player(
  id: string,
  firstName: string,
  lastName: string,
  overrides: Partial<Player> = {},
): Player {
  return {
    id,
    firstName,
    lastName,
    age: 18,
    dateOfBirth: { day: 1, month: 1, year: 2008 },
    nationality: "England",
    position: "CM",
    secondaryPositions: [],
    preferredFoot: "right",
    clubId: "",
    contractClubId: "",
    contractExpiry: 1,
    wage: 500,
    marketValue: 50_000,
    attributes: {} as Player["attributes"],
    currentAbility: 100,
    potentialAbility: 145,
    developmentProfile: "steadyGrower",
    wonderkidTier: "qualityPro",
    form: 0,
    morale: 7,
    injured: false,
    injuryWeeksRemaining: 0,
    personalityTraits: [],
    personalityRevealed: [],
    playerTraits: [],
    playerTraitsRevealed: [],
    recentMatchRatings: [],
    seasonRatings: [],
    ...overrides,
  } as Player;
}

function observation(playerId: string): Observation {
  return {
    id: `observation-${playerId}`,
    playerId,
    week: 1,
    season: 1,
    competition: "Academy fixture",
    minutesObserved: 90,
    notes: [],
    source: "live",
  } as unknown as Observation;
}

function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "contact-1",
    name: "Mara Vale",
    type: "coach",
    relationship: 52,
    trustLevel: 50,
    organization: "Northbridge Academy",
    knownPlayerIds: ["known-player"],
    referralNetwork: [],
    country: "england",
    region: "england",
    ...overrides,
  } as Contact;
}

function responseOptions(): RivalCampaignCounterplayOption[] {
  return [
    {
      id: "protect",
      label: "Protect the channel",
      style: "protect",
      successModifier: 0.25,
      knownTradeoffs: ["Costs attention this week."],
    },
    {
      id: "counter",
      label: "Counter through a second source",
      style: "counter",
      successModifier: 0.1,
      knownTradeoffs: ["Can irritate the family network."],
    },
    {
      id: "withdraw",
      label: "Withdraw and preserve credibility",
      style: "withdraw",
      successModifier: -0.2,
      knownTradeoffs: ["You concede the initiative."],
    },
  ];
}

function responseCampaign(overrides: Partial<RivalCampaign> = {}): RivalCampaign {
  return {
    id: "campaign-1",
    organizationId: "org-alpha",
    organizationArchetypeId: "agent-black-book",
    leadRivalId: "rival-a",
    kind: "relationshipPoach",
    targetKind: "contact",
    target: {
      entity: { kind: "contact", id: "contact-1" },
      label: "Mara Vale",
      regionId: "england",
      notes: ["Northbridge Academy"],
    },
    phase: "response",
    status: "active",
    createdAt: { season: 1, week: 1 },
    updatedAt: { season: 1, week: 2 },
    phaseStartedAt: { season: 1, week: 2 },
    responseDueAt: { season: 1, week: 3 },
    responseDecisionId: "decision:campaign-1",
    outcomeRoll: 0.05,
    baseSuccessChance: 0.52,
    visibleSignals: [{
      headline: "A rival is pushing into Mara Vale's circle",
      detail: "You need to decide whether to protect or concede this relationship.",
      urgency: "high",
    }],
    responseOptions: responseOptions(),
    subjectRefs: [
      { kind: "contact", id: "contact-1" },
      { kind: "rivalScout", id: "rival-a" },
    ],
    ...overrides,
  };
}

function territoryResponseCampaign(overrides: Partial<RivalCampaign> = {}): RivalCampaign {
  return responseCampaign({
    kind: "territoryLock",
    targetKind: "territory",
    target: {
      entity: { kind: "territory", id: "england" },
      label: "England youth circuit",
      regionId: "england",
      notes: ["Protected school and academy routes"],
    },
    subjectRefs: [
      { kind: "territory", id: "england" },
      { kind: "rivalScout", id: "rival-a" },
    ],
    ...overrides,
  });
}

function baseState(overrides: Partial<GameState> = {}): GameState {
  const knownPlayer = player("known-player", "Known", "Prospect");
  const hiddenPlayer = player("hidden-player", "Hidden", "Star", {
    currentAbility: 190,
    potentialAbility: 200,
  });
  return {
    currentWeek: 2,
    currentSeason: 1,
    fixtures: {},
    countries: ["england"],
    runManifest: {
      rootSeed: "weekly-rival-campaigns-seed",
      specialization: "youth",
    },
    scout: {
      id: "scout",
      currentClubId: undefined,
      fatigue: 20,
      reputation: 48,
    },
    contacts: {
      "contact-1": contact(),
    },
    finances: {
      employees: [],
    },
    rivalScouts: {
      "rival-a": rival(),
    },
    rivalOrganizationState: {
      organizations: {
        "org-alpha": {
          id: "org-alpha",
          archetypeId: "agent-black-book",
          name: "Northbridge Circuit",
          agendaId: "control-youth-pathways",
          memberRivalIds: ["rival-a"],
          resources: 60,
          influence: 52,
          heat: 64,
          agendaProgress: 20,
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
      campaignState: createRivalCampaignState(),
    },
    managerProfiles: {},
    boardProfile: undefined,
    clubs: {},
    leagues: {},
    players: {
      "known-player": knownPlayer,
      "hidden-player": hiddenPlayer,
    },
    retiredPlayers: {},
    unsignedYouth: {},
    reports: {},
    observations: {
      "known-player-live": observation("known-player"),
    },
    contactIntel: {},
    placementReports: {},
    watchlist: ["known-player"],
    inbox: [],
    accessAgreements: {},
    youthTournaments: {},
    territories: {},
    regionalKnowledge: {},
    npcScouts: {},
    consequenceState: createConsequenceEngineState(),
    ...overrides,
  } as unknown as GameState;
}

function withResponseCampaign(state: GameState): GameState {
  return {
    ...state,
    rivalOrganizationState: {
      ...state.rivalOrganizationState,
      campaignState: createRivalCampaignState({
        campaigns: {
          "campaign-1": responseCampaign(),
        },
        history: [],
        processedWeekKeys: [],
      }),
    },
  };
}

function acceptFirstCampaign(state: GameState) {
  const prepared = prepareWeeklyRivalCampaigns({ state, seasonLength: 38 });
  expect(prepared.presentations).toHaveLength(1);
  const accepted = applyDirectedWeeklyRivalCampaigns({
    state: prepared.state,
    prepared,
    acceptedCandidateIds: new Set([prepared.presentations[0]!.candidate.id]),
  });
  const decision = accepted.consequenceState.decisions["decision:campaign-1"];
  expect(decision).toBeDefined();
  return { prepared, accepted, decision };
}

function campaignDecisionMessage(inbox: readonly InboxMessage[]): InboxMessage[] {
  return inbox.filter((message) => message.relatedId === "decision:campaign-1");
}

describe("weekly rival campaigns", () => {
  it("prepares deterministically and does not mutate the same week twice", () => {
    const initial = withResponseCampaign(baseState());

    const first = prepareWeeklyRivalCampaigns({ state: initial, seasonLength: 38 });
    const replay = prepareWeeklyRivalCampaigns({
      state: structuredClone(initial),
      seasonLength: 38,
    });

    expect(replay).toEqual(first);

    const sameWeekReplay = prepareWeeklyRivalCampaigns({
      state: first.state,
      seasonLength: 38,
    });
    expect(sameWeekReplay.state).toEqual(first.state);
    expect(sameWeekReplay.presentations).toEqual(first.presentations);
  });

  it("keeps a response campaign silent when Story Director rejects it", () => {
    const initial = withResponseCampaign(baseState());
    const prepared = prepareWeeklyRivalCampaigns({ state: initial, seasonLength: 38 });

    expect(prepared.presentations).toHaveLength(1);

    const rejected = applyDirectedWeeklyRivalCampaigns({
      state: prepared.state,
      prepared,
      acceptedCandidateIds: new Set(),
    });

    expect(rejected).toBe(prepared.state);
    expect(Object.keys(rejected.consequenceState.decisions)).toHaveLength(0);
    expect(campaignDecisionMessage(rejected.inbox)).toEqual([]);
  });

  it("registers exactly one canonical rival-campaign decision when accepted", () => {
    const initial = withResponseCampaign(baseState());
    const { prepared, accepted, decision } = acceptFirstCampaign(initial);

    expect(Object.values(accepted.consequenceState.decisions).filter(
      (entry) => entry.source.kind === "rivalCampaign",
    )).toHaveLength(1);
    expect(decision.source).toEqual({ kind: "rivalCampaign", id: "campaign-1" });
    expect(decision.defaultOptionId).toBe("withdraw");
    expect(decision.metadata?.targetLabel).toBe("Mara Vale");
    expect(campaignDecisionMessage(accepted.inbox)).toHaveLength(1);

    const replayed = applyDirectedWeeklyRivalCampaigns({
      state: accepted,
      prepared,
      acceptedCandidateIds: new Set([prepared.presentations[0]!.candidate.id]),
    });

    expect(replayed).toBe(accepted);
    expect(Object.values(replayed.consequenceState.decisions).filter(
      (entry) => entry.source.kind === "rivalCampaign",
    )).toHaveLength(1);
    expect(campaignDecisionMessage(replayed.inbox)).toHaveLength(1);
  });

  it("resolves a chosen response exactly once and applies provenance effects once", () => {
    const initial = withResponseCampaign(baseState());
    const { accepted } = acceptFirstCampaign(initial);
    const now = { season: 1, week: 2 };
    const selected = selectDecisionOption(
      accepted.consequenceState,
      "decision:campaign-1",
      "protect",
      now,
      "player",
      38,
    );
    expect(selected.changed).toBe(true);

    const resolved = reconcileRivalCampaignDecisions({
      ...accepted,
      consequenceState: selected.state,
    }, now);

    const campaign = resolved.rivalOrganizationState.campaignState.campaigns["campaign-1"];
    expect(campaign.status).toBe("resolved");
    expect(campaign.phase).toBe("aftermath");
    expect(campaign.result?.responseOptionId).toBe("protect");
    expect(campaign.result?.success).toBe(true);
    expect(Object.keys(resolved.consequenceState.facts)).toHaveLength(1);
    expect(Object.keys(resolved.consequenceState.memories)).toHaveLength(1);
    expect(Object.keys(resolved.consequenceState.obligations)).toHaveLength(1);
    expect(resolved.contacts["contact-1"]?.trustLevel).toBe(58);
    expect(resolved.contacts["contact-1"]?.relationship).toBe(56);
    expect(resolved.rivalScouts["rival-a"]?.lossesToPlayer).toBe(1);
    expect(campaignDecisionMessage(resolved.inbox)).toHaveLength(1);

    const replay = reconcileRivalCampaignDecisions(resolved, now);
    expect(replay).toEqual(resolved);
  });

  it("expires a missed response instead of allowing the default withdrawal to roll a success", () => {
    const initial = withResponseCampaign(baseState());
    const { accepted, decision } = acceptFirstCampaign(initial);
    const expired = expireDueDecisions(
      accepted.consequenceState,
      { season: 1, week: 4 },
      38,
    );
    expect(expired.expiredDecisionIds).toContain(decision.id);

    const resolved = reconcileRivalCampaignDecisions({
      ...accepted,
      currentWeek: 4,
      consequenceState: expired.state,
    }, { season: 1, week: 4 });

    const expiredDecision = resolved.consequenceState.decisions[decision.id];
    const campaign = resolved.rivalOrganizationState.campaignState.campaigns["campaign-1"];
    expect(expiredDecision.selectionKind).toBe("default");
    expect(expiredDecision.selectedOptionId).toBe("withdraw");
    expect(campaign.status).toBe("expired");
    expect(campaign.result?.responseOptionId).toBe("withdraw");
    expect(campaign.result?.resolution).toBe("expired");
    expect(campaign.result?.success).toBe(false);
    expect(Object.keys(resolved.consequenceState.facts)).toHaveLength(1);

    const replay = reconcileRivalCampaignDecisions(resolved, { season: 1, week: 4 });
    expect(replay).toEqual(resolved);
  });

  it("never surfaces an undiscovered hidden player as a rival-campaign target", () => {
    let state = baseState({
      currentWeek: 1,
      contacts: {},
      watchlist: [],
      observations: {
        "known-player-live": observation("known-player"),
      },
    });

    let prepared = prepareWeeklyRivalCampaigns({ state, seasonLength: 38 });
    for (let week = 2; week <= 24 && Object.keys(prepared.state.rivalOrganizationState.campaignState.campaigns).length === 0; week++) {
      state = {
        ...prepared.state,
        currentWeek: week,
      };
      prepared = prepareWeeklyRivalCampaigns({ state, seasonLength: 38 });
    }

    const campaigns = Object.values(prepared.state.rivalOrganizationState.campaignState.campaigns);
    expect(campaigns.length).toBeGreaterThan(0);
    expect(campaigns.every((campaign) => campaign.target.entity.id === "known-player")).toBe(true);
    expect(campaigns.every((campaign) => campaign.target.label === "Known Prospect")).toBe(true);
    expect(campaigns.some((campaign) => campaign.target.label === "Hidden Star")).toBe(false);
    expect(prepared.presentations.every((presentation) =>
      presentation.campaign.target.entity.id !== "hidden-player"
      && presentation.candidate.cast.every((entry) => entry.id !== "hidden-player"),
    )).toBe(true);
  });

  it("only revokes the contested rival territory channel when a territory campaign is lost", () => {
    const initial = {
      ...baseState({
        accessAgreements: {
          "access:rival-campaign:campaign-1:regionalIntro:territory:england": {
            id: "access:rival-campaign:campaign-1:regionalIntro:territory:england",
            grantor: { kind: "territory", id: "england" },
            beneficiary: { kind: "scout", id: "scout" },
            scope: "regionalIntro",
            status: "active",
            exclusive: false,
            confidential: true,
            createdAt: { season: 1, week: 1 },
            expiresAt: { season: 1, week: 8 },
            countryId: "england",
            regionId: "england",
          },
          "access:agency-dilemma:decision-1:england": {
            id: "access:agency-dilemma:decision-1:england",
            grantor: { kind: "territory", id: "england" },
            beneficiary: { kind: "scout", id: "scout" },
            scope: "regionalIntro",
            status: "active",
            exclusive: false,
            confidential: true,
            createdAt: { season: 1, week: 1 },
            expiresAt: { season: 1, week: 8 },
            countryId: "england",
            regionId: "england",
          },
          "access:contact:contact-1:player:known-player:s1:w1": {
            id: "access:contact:contact-1:player:known-player:s1:w1",
            grantor: { kind: "contact", id: "contact-1" },
            beneficiary: { kind: "scout", id: "scout" },
            scope: "playerEarlyAccess",
            status: "active",
            exclusive: true,
            confidential: true,
            createdAt: { season: 1, week: 1 },
            expiresAt: { season: 1, week: 4 },
            subject: { kind: "player", id: "known-player" },
            countryId: "england",
            regionId: "england",
          },
        },
      }),
      rivalOrganizationState: {
        ...baseState().rivalOrganizationState,
        campaignState: createRivalCampaignState({
          campaigns: {
            "campaign-1": territoryResponseCampaign(),
          },
          history: [],
          processedWeekKeys: [],
        }),
      },
    } as GameState;

    const { accepted } = acceptFirstCampaign(initial);
    const now = { season: 1, week: 2 };
    const selected = selectDecisionOption(
      accepted.consequenceState,
      "decision:campaign-1",
      "withdraw",
      now,
      "player",
      38,
    );
    expect(selected.changed).toBe(true);

    const resolved = reconcileRivalCampaignDecisions({
      ...accepted,
      consequenceState: selected.state,
    }, now);
    const agreements = resolved.accessAgreements ?? {};

    expect(
      agreements["access:rival-campaign:campaign-1:regionalIntro:territory:england"]?.status,
    ).toBe("revoked");
    expect(agreements["access:agency-dilemma:decision-1:england"]?.status).toBe("active");
    expect(
      agreements["access:contact:contact-1:player:known-player:s1:w1"]?.status,
    ).toBe("active");
  });
});
