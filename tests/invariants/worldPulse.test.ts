import { describe, expect, it } from "vitest";
import type { GameState } from "@/engine/core/types";
import { createConsequenceEngineState } from "@/engine/consequences";
import { createStoryDirectorStateV2, recordStorySelectionV2 } from "@/engine/events/storyDirectorV2";
import {
  WORLD_PULSE_MIN_GAP_WEEKS,
  applyDirectedWorldPulse,
  prepareWeeklyWorldPulse,
} from "@/engine/events/worldPulse";

function baseState(): GameState {
  return {
    currentWeek: 7,
    currentSeason: 1,
    seed: "world-pulse-seed",
    fixtures: {},
    leagues: {
      "league-es": { id: "league-es", country: "spain" },
    },
    clubs: {
      "club-sevilla": {
        id: "club-sevilla",
        name: "Sevilla Norte",
        leagueId: "league-es",
        scoutingPhilosophy: "academyFirst",
      },
    },
    players: {
      "player-1": {
        id: "player-1",
        firstName: "Mateo",
        lastName: "Ruiz",
        position: "CM",
        secondaryPositions: [],
      },
    },
    retiredPlayers: {},
    unsignedYouth: {},
    countries: ["spain"],
    runManifest: {
      rootSeed: "world-pulse-seed",
      specialization: "youth",
    },
    scout: {
      id: "scout-1",
      homeCountry: "spain",
    },
    storyDirectorV2: createStoryDirectorStateV2(),
    eventDirector: {
      lastMajorBeatWeek: 0,
      lastMajorBeatSeason: 0,
      quietWeeks: 3,
      tension: 0,
      recentSpecialEventIds: [],
      recentCategories: [],
    },
    consequenceState: createConsequenceEngineState(),
    inbox: [],
    scoutingCases: {
      "case-1": {
        id: "case-1",
        playerId: "player-1",
        scoutId: "scout-1",
        status: "reported",
        reportIds: ["report-1"],
        decisionIds: ["decision-1"],
        professionalContext: {
          centralQuestion: "Can he handle the next level now?",
        },
      },
    },
    reports: {
      "report-1": {
        id: "report-1",
        caseId: "case-1",
        playerId: "player-1",
        riskFactors: ["Adaptation to academy structure"],
        categoryVerdicts: {
          roleFit: {
            verdict: "Promising but still role-dependent.",
            confidence: "medium",
            hypothesisIds: [],
            acknowledgedUncertainty: "Needs another live context before the pathway call is safe.",
          },
        },
        submittedWeek: 4,
        submittedSeason: 1,
        evidenceObservationIds: ["obs-1"],
      },
    },
    observations: {
      "obs-1": {
        id: "obs-1",
        playerId: "player-1",
        context: "schoolMatch",
      },
    },
    clubDecisions: {
      "decision-1": {
        id: "decision-1",
        caseId: "case-1",
        outcome: "followUpRequested",
        decidedWeek: 5,
        decidedSeason: 1,
        requestedEvidenceCategory: "roleFit",
        reasons: ["The club wants a clearer answer on the role fit."],
      },
    },
    recommendationReviews: {},
    worldConditionState: {
      version: 1,
      activeSeason: 1,
      active: [],
      history: [],
    },
    worldConditionArcState: undefined,
    rivalScouts: {
      "rival-1": { id: "rival-1", name: "Nadia Perez" },
    },
    rivalOrganizationState: {
      organizations: {
        "org-1": {
          id: "org-1",
          archetypeId: "academy-conglomerate",
          name: "Costa Network",
          agendaId: "control-youth-pathways",
          memberRivalIds: ["rival-1"],
          resources: 60,
          influence: 45,
          heat: 66,
          agendaProgress: 25,
          agendaLevel: 2,
          momentum: 2,
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
      campaignState: {
        campaigns: {},
        processedWeekKeys: [],
        archivedCampaignIds: [],
      },
      processedWeekKeys: [],
    },
    contacts: {},
  } as unknown as GameState;
}

describe("world pulse", () => {
  it("creates a deterministic non-modal pulse only in genuinely quiet weeks", () => {
    const state = baseState();

    const prepared = prepareWeeklyWorldPulse({ state, blockedByActivity: false, seasonLength: 38 });
    const blocked = prepareWeeklyWorldPulse({ state, blockedByActivity: true, seasonLength: 38 });
    const notQuiet = prepareWeeklyWorldPulse({
      state: { ...state, eventDirector: { ...state.eventDirector, quietWeeks: 1 } },
      blockedByActivity: false,
      seasonLength: 38,
    });

    expect(prepared).toBeDefined();
    expect(prepared?.candidate.kind).toBe("worldPulse");
    expect(prepared?.message.type).toBe("news");
    expect(prepared?.message.actionRequired).toBe(false);
    expect(prepared?.message.title).toContain("Mateo Ruiz");
    expect(blocked).toBeUndefined();
    expect(notQuiet).toBeUndefined();
  });

  it("respects the global pulse gap by reading prior world-pulse occurrences from Story Director V2", () => {
    const state = baseState();
    const prepared = prepareWeeklyWorldPulse({ state, blockedByActivity: false, seasonLength: 38 });
    expect(prepared).toBeDefined();

    const afterSelection = {
      ...state,
      storyDirectorV2: recordStorySelectionV2(
        state.storyDirectorV2!,
        prepared!.candidate,
        { season: 1, week: 5 },
      ),
    };
    const suppressed = prepareWeeklyWorldPulse({
      state: afterSelection,
      blockedByActivity: false,
      seasonLength: 38,
    });
    const allowedAgain = prepareWeeklyWorldPulse({
      state: { ...afterSelection, currentWeek: 5 + WORLD_PULSE_MIN_GAP_WEEKS },
      blockedByActivity: false,
      seasonLength: 38,
    });

    expect(suppressed).toBeUndefined();
    expect(allowedAgain).toBeDefined();
  });

  it("writes the accepted pulse once and stays silent on replay", () => {
    const state = baseState();
    const prepared = prepareWeeklyWorldPulse({ state, blockedByActivity: false, seasonLength: 38 });
    expect(prepared).toBeDefined();

    const accepted = applyDirectedWorldPulse({
      state,
      prepared,
      acceptedCandidateIds: new Set([prepared!.candidate.id]),
    });
    const replayed = applyDirectedWorldPulse({
      state: accepted,
      prepared,
      acceptedCandidateIds: new Set([prepared!.candidate.id]),
    });
    const rejected = applyDirectedWorldPulse({
      state,
      prepared,
      acceptedCandidateIds: new Set(),
    });

    expect(accepted.inbox.filter((message) => message.id === prepared!.message.id)).toHaveLength(1);
    expect(replayed.inbox.filter((message) => message.id === prepared!.message.id)).toHaveLength(1);
    expect(rejected).toBe(state);
  });
});
