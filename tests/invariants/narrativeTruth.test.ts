import { describe, expect, it } from "vitest";

import type { GameState, Player, ScoutReport } from "@/engine/core/types";
import {
  FACTUAL_NARRATIVE_TRUTH_CONTRACTS,
  MATERIAL_FACTUAL_NARRATIVE_TYPES,
  generateNarrativeEventOfType,
  resolveNarrativeTruth,
} from "@/engine/events";
import {
  generateQuietNarrativeCallback,
  generateWeeklyEvent,
} from "@/engine/events/narrativeEvents";
import { getNarrativeCallbackSignals } from "@/engine/events/narrativeTruth";
import { startChain } from "@/engine/events/eventChains";
import { processActiveStorylines } from "@/engine/events/storylines";
import { RNG } from "@/engine/rng";

function player(id = "player-1"): Player {
  return {
    id,
    firstName: id === "player-1" ? "Ari" : "Sam",
    lastName: id === "player-1" ? "Prospect" : id,
    age: 18,
    injured: false,
    seasonRatings: [],
  } as unknown as Player;
}

function report(overrides: Partial<ScoutReport> = {}): ScoutReport {
  return {
    id: "report-1",
    caseId: "case-1",
    revision: 1,
    playerId: "player-1",
    scoutId: "scout-1",
    submittedWeek: 1,
    submittedSeason: 1,
    conviction: "recommend",
    attributeAssessments: [],
    strengths: [],
    weaknesses: [],
    summary: "Early assessment",
    estimatedValue: 0,
    qualityScore: 70,
    ...overrides,
  } as ScoutReport;
}

function gameState(overrides: Partial<GameState> = {}): GameState {
  const ari = player();
  const submittedReport = report();
  return {
    currentWeek: 20,
    currentSeason: 1,
    players: { [ari.id]: ari },
    retiredPlayers: {},
    reports: { [submittedReport.id]: submittedReport },
    observations: {
      "observation-1": { id: "observation-1", playerId: ari.id },
    },
    matchRatings: {},
    fixtures: {},
    playerMovementHistory: [],
    alumniRecords: [],
    youthTournaments: {},
    clubs: {
      "club-1": { id: "club-1", name: "Academy FC" },
      "club-2": { id: "club-2", name: "City FC" },
    },
    scout: {
      id: "scout-1",
      reputation: 50,
      careerTier: 3,
      careerPath: "independent",
      primarySpecialization: "youth",
    },
    countries: ["england", "france"],
    contacts: {},
    rivalScouts: {},
    unsignedYouth: {},
    narrativeEvents: [],
    eventChains: [],
    ...overrides,
  } as unknown as GameState;
}

describe("narrative truth contracts", () => {
  it("requires an authoritative contract for every material factual story type", () => {
    expect(Object.keys(FACTUAL_NARRATIVE_TRUTH_CONTRACTS).sort()).toEqual(
      [...MATERIAL_FACTUAL_NARRATIVE_TYPES].sort(),
    );
    for (const contract of Object.values(FACTUAL_NARRATIVE_TRUTH_CONTRACTS)) {
      expect(contract.kind).toBe("fact");
    }
  });

  it("requires a real command receipt before command-backed prose is eligible", () => {
    const state = gameState();
    expect(resolveNarrativeTruth({
      kind: "command",
      commandId: "travel.complete",
      resolveReceipt: () => null,
    }, state)).toBeNull();

    expect(resolveNarrativeTruth({
      kind: "command",
      commandId: "travel.complete",
      resolveReceipt: () => ({
        source: "simulation-command",
        sourceId: "travel-booking-1",
        relatedIds: [],
      }),
    }, state)).toMatchObject({
      kind: "command",
      evidence: { sourceId: "travel-booking-1" },
    });
  });

  it("does not turn a generic report into a debut hat-trick or transfer", () => {
    const state = gameState();

    expect(generateNarrativeEventOfType(
      new RNG("unsupported-hat-trick"),
      state,
      "debutHatTrick",
    )).toBeNull();
    expect(generateNarrativeEventOfType(
      new RNG("unsupported-transfer"),
      state,
      "hiddenGemVindication",
    )).toBeNull();

    const withHatTrick = gameState({
      matchRatings: {
        "fixture-1": {
          "player-1": {
            playerId: "player-1",
            fixtureId: "fixture-1",
            rating: 9.4,
            eventCount: 5,
            stats: { goals: 3 },
            source: "simulated",
          },
        },
      },
    });
    const hatTrick = generateNarrativeEventOfType(
      new RNG("supported-hat-trick"),
      withHatTrick,
      "debutHatTrick",
    );
    expect(hatTrick).toMatchObject({
      type: "debutHatTrick",
      relatedIds: expect.arrayContaining(["player-1", "fixture-1"]),
    });
    expect(hatTrick?.description).toContain("Ari Prospect");

    const withMovement = gameState({
      playerMovementHistory: [{
        id: "movement-1",
        playerId: "player-1",
        type: "permanentTransfer",
        week: 15,
        season: 1,
        fromClubId: "club-1",
        toClubId: "club-2",
      }],
    });
    const movement = generateNarrativeEventOfType(
      new RNG("supported-transfer"),
      withMovement,
      "hiddenGemVindication",
    );
    expect(movement).toMatchObject({
      relatedIds: expect.arrayContaining(["player-1", "club-2", "movement-1"]),
    });
    expect(movement?.description).toContain("documented move to City FC");
    expect(movement?.description).toContain("does not establish that your report caused");
  });

  it("requires canonical injury records instead of observations or conviction alone", () => {
    const state = gameState();
    expect(generateNarrativeEventOfType(
      new RNG("unsupported-target-injury"),
      state,
      "targetInjured",
    )).toBeNull();
    expect(generateNarrativeEventOfType(
      new RNG("unsupported-setback"),
      state,
      "injurySetback",
    )).toBeNull();

    const injured = player();
    injured.injured = true;
    injured.currentInjury = {
      id: "injury-1",
      playerId: injured.id,
      type: "ligament",
      severity: "serious",
      recoveryWeeks: 12,
      weeksRemaining: 12,
      reinjuryRisk: 0.2,
      occurredWeek: 20,
      occurredSeason: 1,
    };
    const withInjury = gameState({ players: { [injured.id]: injured } });

    for (const type of ["targetInjured", "injurySetback"] as const) {
      expect(generateNarrativeEventOfType(
        new RNG(`supported-${type}`),
        withInjury,
        type,
      )).toMatchObject({
        type,
        relatedIds: expect.arrayContaining(["player-1", "injury-1"]),
      });
    }
  });

  it("requires a debut milestone and a real discovered tournament record", () => {
    const unsupported = gameState({
      alumniRecords: [{
        id: "alumni-1",
        playerId: "player-1",
        milestones: [],
      } as unknown as GameState["alumniRecords"][number]],
    });
    expect(generateNarrativeEventOfType(
      new RNG("unsupported-debut"),
      unsupported,
      "debutBrilliance",
    )).toBeNull();
    expect(generateNarrativeEventOfType(
      new RNG("unsupported-tournament"),
      unsupported,
      "internationalTournament",
    )).toBeNull();

    const supported = gameState({
      alumniRecords: [{
        id: "alumni-1",
        playerId: "player-1",
        milestones: [{
          type: "firstTeamDebut",
          week: 19,
          season: 1,
          description: "Senior debut",
          notified: false,
        }],
      } as unknown as GameState["alumniRecords"][number]],
      youthTournaments: {
        "tournament-1": {
          id: "tournament-1",
          name: "Continental Youth Cup",
          country: "france",
          category: "international",
          prestige: "international",
          startWeek: 21,
          endWeek: 23,
          season: 1,
          discovered: true,
          attended: false,
          poolSizeMultiplier: 1.5,
          observationBonus: 2,
          extraAttributes: 1,
        },
      },
    });

    expect(generateNarrativeEventOfType(
      new RNG("supported-debut"),
      supported,
      "debutBrilliance",
    )).toMatchObject({
      relatedIds: expect.arrayContaining(["player-1", "alumni-1"]),
    });
    const tournament = generateNarrativeEventOfType(
      new RNG("supported-tournament"),
      supported,
      "internationalTournament",
    );
    expect(tournament).toMatchObject({ relatedIds: ["tournament-1"] });
    expect(tournament?.description).toContain("Continental Youth Cup in france");
  });

  it("frames legacy speculative chains as rumors rather than world facts", () => {
    const state = gameState({
      players: {
        "player-1": player("player-1"),
        "player-2": player("player-2"),
        "player-3": player("player-3"),
      },
    });

    for (const chainKey of ["transferSaga", "injuryComeback", "youthBreakthrough"]) {
      const started = startChain(new RNG(`rumor-${chainKey}`), state, chainKey);
      expect(started?.event.title).toMatch(/^Rumour:/);
      expect(started?.event.description).toContain(
        "not an authoritative world-state update",
      );
    }
  });

  it("does not invent an international trip when no travel booking exists", () => {
    const storyline = {
      id: "storyline-international",
      templateId: "internationalDiscovery",
      name: "The International Discovery",
      stages: [],
      currentStage: 1,
      nextStageWeek: 20,
      nextStageSeason: 1,
      startedWeek: 15,
      startedSeason: 1,
      resolved: false,
      context: {
        contactId: "contact-1",
        contactName: "Coach Morgan",
        country: "France",
        countryKey: "france",
        playerId: "player-1",
        playerName: "Ari Prospect",
        playerChoice: null,
      },
    } as GameState["activeStorylines"][number];

    const noTravel = processActiveStorylines(
      gameState({ activeStorylines: [storyline] }),
      new RNG("no-ghost-trip"),
    );
    expect(noTravel.events).toEqual([]);
    expect(noTravel.updatedStorylines[0].resolved).toBe(true);

    const travellingState = gameState({ activeStorylines: [storyline] });
    travellingState.scout.travelBooking = {
      destinationCountry: "france",
      departureWeek: 19,
      returnWeek: 22,
      cost: 1_000,
      isAbroad: true,
    };
    const travelling = processActiveStorylines(
      travellingState,
      new RNG("real-trip"),
    );
    expect(travelling.events[0]?.description).toContain(
      "active travel booking records you as present",
    );
    expect(travelling.events[0]?.description).toContain(
      "trip itself is not observation evidence",
    );
  });

  it("derives quiet callbacks from real career, prospect, club, and rival receipts", () => {
    const base = gameState();
    const callbackState = gameState({
      currentWeek: 20,
      scout: {
        ...base.scout,
        performancePulses: [{
          period: 4,
          season: 1,
          reportsSubmitted: 3,
          reportQualityAvg: 78,
          accuracyRate: 72,
          signingSuccess: 1,
          fatigueAvg: 20,
          grade: "B",
          trend: "improving",
        }],
      },
      recommendationReviews: {
        review: {
          id: "review",
          caseId: "case-1",
          reportId: "report-1",
          playerId: "player-1",
          clubId: "club-1",
          checkpoint: "oneSeason",
          dueWeek: 18,
          dueSeason: 1,
          status: "complete",
          completedWeek: 19,
          completedSeason: 1,
          overallScore: 74,
          playerFacingDimensions: [{
            key: "pathwayQuality",
            label: "Pathway quality",
            status: "positive",
            evidenceLevel: "full",
            score: 80,
            summary: "Senior minutes support the original pathway read.",
          }],
        },
      },
      clubDecisions: {
        decision: {
          id: "decision",
          caseId: "case-1",
          deliveryId: "delivery-1",
          reportId: "report-1",
          clubId: "club-1",
          outcome: "followUpRequested",
          decidedWeek: 17,
          decidedSeason: 1,
        },
      },
      rivalScouts: {
        rival: {
          id: "rival",
          name: "Rita Vale",
        } as GameState["rivalScouts"][string],
      },
      rivalActivities: [{
        rivalId: "rival",
        type: "targetAcquired",
        playerId: "player-1",
        week: 18,
        season: 1,
      }],
      eventDirector: {
        version: 1,
        tension: 20,
        quietWeeks: 6,
        recentEventTypes: [],
        eventCounts: {},
        recentSpecialEventIds: [],
        specialEventCounts: {},
        totalEvents: 0,
      },
    });

    const signals = getNarrativeCallbackSignals(callbackState);
    expect(new Set(signals.map((signal) => signal.domain)))
      .toEqual(new Set(["career", "prospect", "club", "rival"]));
    expect(signals.every((signal) => signal.evidence.sourceId.length > 0)).toBe(true);
    expect(signals.every((signal) => signal.evidence.relatedIds.length > 0)).toBe(true);

    const direct = generateQuietNarrativeCallback(callbackState);
    const weekly = generateWeeklyEvent(new RNG("quiet-receipt"), callbackState, {
      triggerChance: 0,
    });
    expect(direct).toMatchObject({
      id: "callback:prospect:recommendation-review:review",
      acknowledged: false,
    });
    expect(direct?.choices).toBeUndefined();
    expect(weekly.event).toEqual(direct);
    expect(direct?.description).toContain("formal review is complete");
  });

  it("does not fabricate, repeat, or flood quiet callbacks", () => {
    const director = {
      version: 1 as const,
      tension: 20,
      quietWeeks: 6,
      recentEventTypes: [],
      eventCounts: {},
      recentSpecialEventIds: [],
      specialEventCounts: {},
      totalEvents: 0,
    };
    expect(generateQuietNarrativeCallback(gameState({ eventDirector: director }))).toBeNull();

    const withReview = gameState({
      eventDirector: director,
      recommendationReviews: {
        review: {
          id: "review",
          caseId: "case-1",
          reportId: "report-1",
          playerId: "player-1",
          clubId: "club-1",
          checkpoint: "oneSeason",
          dueWeek: 18,
          dueSeason: 1,
          status: "complete",
          completedWeek: 19,
          completedSeason: 1,
        },
      },
    });
    const emitted = generateQuietNarrativeCallback(withReview)!;
    const replayState = gameState({
      ...withReview,
      currentWeek: 25,
      narrativeEvents: [{ ...emitted, week: 20 }],
      eventDirector: { ...director, quietWeeks: 5 },
    });
    expect(getNarrativeCallbackSignals(replayState)).toEqual([]);
    expect(generateQuietNarrativeCallback(replayState)).toBeNull();

    const overloaded = gameState({
      ...withReview,
      narrativeEvents: Array.from({ length: 3 }, (_, index) => ({
        id: `info-${index}`,
        type: "exclusiveTip" as const,
        week: 10 + index,
        season: 1,
        title: "Recorded update",
        description: "A prior update remains unread.",
        relatedIds: [],
        acknowledged: false,
      })),
    });
    expect(generateQuietNarrativeCallback(overloaded)).toBeNull();
    expect(generateQuietNarrativeCallback(gameState({
      ...withReview,
      eventDirector: { ...director, tension: 80 },
    }))).toBeNull();
  });
});
