import { afterEach, describe, expect, it, vi } from "vitest";

import type { GameState, SeasonEvent } from "@/engine/core/types";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SeasonTimeline } from "@/components/game/SeasonTimeline";
import { RNG } from "@/engine/rng";
import { generateSeasonEvents, getActiveSeasonEvents, isInternationalBreak } from "@/engine/core/seasonEvents";
import { applySeasonEventEffects, canResolveSeasonEvent, getSeasonEventChoiceOptions,
  getActiveSeasonEventDisplayEffects, resolveSeasonEventChoice } from "@/engine/core/seasonEventEffects";
import { reconcileInboxActionRequirements } from "@/engine/world/inboxActionAuthority";
import { migrateSaveState } from "@/lib/db";
import goldenSave from "../fixtures/saves/v0-save-record.json";
import type { DecisionRecord } from "@/engine/consequences/types";
import { useGameStore } from "@/stores/gameStore";
import {
  authorAutonomousReportForPlayer,
  chooseAutonomousOptionIndex,
  chooseAutonomousPlacementDestination,
  completeScheduledPlacementDestinations,
  chooseAutonomousDecisionOption,
  collectAutonomousCareerPresentationSignals,
  createAutonomousCareerTelemetry,
  ensureCourseStudyScheduled,
  reviewActionableInbox,
  resolveCommercialInbox,
  stabilizeAutonomousCareerState,
} from "./autonomousYouthCareerDriver";

afterEach(() => {
  vi.restoreAllMocks();
});

function placementState(): GameState {
  return {
    currentSeason: 1, currentWeek: 3, scout: { id: "scout" },
    unsignedYouth: { youth: { id: "youth", country: "england", placed: false,
      player: { id: "player", age: 15, position: "CM", secondaryPositions: ["DM"] } } },
    reports: { report: { id: "report", playerId: "player", scoutId: "scout", submittedSeason: 1, submittedWeek: 2 } },
    clubs: {
      quality: { id: "quality", leagueId: "england", youthAcademyRating: 20, playerIds: [] },
      need: { id: "need", leagueId: "england", youthAcademyRating: 8, playerIds: [] },
      foreign: { id: "foreign", leagueId: "france", youthAcademyRating: 20, playerIds: [] },
      full: { id: "full", leagueId: "england", youthAcademyRating: 20, playerIds: Array(40).fill("owned") },
    },
    leagues: { england: { country: "england" }, france: { country: "france" } },
    youthRecruitmentBriefs: { need: { clubId: "need", status: "open", maxAge: 17,
      requiredPositions: ["DM"], expiresSeason: 1, expiresWeek: 8 } },
    schedule: { week: 3, activities: [null, { type: "writePlacementReport", targetId: "player", slots: 1,
      description: "Existing pitch", instanceId: "pitch-original" }, null, null, null, null, null] },
  } as unknown as GameState;
}

describe("autonomous placement audience", () => {
  it("uses a current public position need from the UI's legal shortlist without reading hidden ability", () => {
    const state = placementState();
    for (const key of ["currentAbility", "potentialAbility", "attributes"]) {
      Object.defineProperty(state.unsignedYouth.youth.player, key, { get: () => { throw new Error("hidden truth read"); } });
    }
    expect(chooseAutonomousPlacementDestination(state, "player")).toBe("need");
    state.youthRecruitmentBriefs.need.expiresWeek = 3;
    expect(chooseAutonomousPlacementDestination(state, "player")).toBe("quality");
  });

  it("preserves the authored audience and rejects full, underage foreign, closed and unreported cases", () => {
    const state = placementState();
    state.reports.report.intendedClubId = "quality";
    expect(chooseAutonomousPlacementDestination(state, "player")).toBe("quality");
    for (const clubId of ["full", "foreign"]) {
      state.reports.report.intendedClubId = clubId;
      expect(chooseAutonomousPlacementDestination(state, "player")).toBeUndefined();
    }
    delete state.reports.report.intendedClubId;
    state.reports.report.recommendedAction = "pass";
    expect(chooseAutonomousPlacementDestination(state, "player")).toBeUndefined();
    state.reports.older = { ...state.reports.report, id: "older", submittedWeek: 1, recommendedAction: "inviteForTrial" };
    expect(chooseAutonomousPlacementDestination(state, "player")).toBeUndefined();
    delete state.reports.older;
    delete state.reports.report.recommendedAction;
    state.unsignedYouth.youth.retired = true;
    expect(chooseAutonomousPlacementDestination(state, "player")).toBeUndefined();
    state.unsignedYouth.youth.retired = false;
    state.reports = {};
    expect(chooseAutonomousPlacementDestination(state, "player")).toBeUndefined();
  });

  it("fills only the already selected pitch, retaining its slot and identity across repeated calls", () => {
    const gameState = placementState();
    const original = { ...gameState.schedule.activities[1]! };
    const store = { gameState,
      unscheduleActivity: vi.fn((index: number) => { gameState.schedule.activities[index] = null; }),
      scheduleActivity: vi.fn((activity, index: number) => { gameState.schedule.activities[index] = activity; }),
    };
    vi.spyOn(useGameStore, "getState").mockImplementation(() => store as never);
    completeScheduledPlacementDestinations();
    completeScheduledPlacementDestinations();
    expect(gameState.schedule.activities[1]).toEqual({ ...original, destinationClubId: "need" });
    expect(gameState.schedule.activities.filter(Boolean)).toHaveLength(1);
    expect(store.unscheduleActivity).toHaveBeenCalledTimes(1);
    expect(store.scheduleActivity).toHaveBeenCalledTimes(1);
  });
});

describe("explicit autonomous case authoring", () => {
  it("files the chosen observable case despite a higher-ranked alternative, and cannot reuse the same evidence", () => {
    const gameState = placementState();
    gameState.players = {};
    gameState.reports = {};
    gameState.unsignedYouth.youth.player.firstName = "Selected";
    gameState.unsignedYouth.youth.player.lastName = "Prospect";
    gameState.unsignedYouth.other = { ...gameState.unsignedYouth.youth, id: "other-youth",
      player: { ...gameState.unsignedYouth.youth.player, id: "other-player" } };
    gameState.observations = Object.fromEntries(["player", "other-player"].flatMap((playerId) =>
      Array.from({ length: playerId === "player" ? 3 : 8 }, (_, index) => {
        const id = `${playerId}-observation-${index}`;
        return [id, { id, playerId, scoutId: "scout", week: index + 1, season: 1,
          context: "liveMatch", attributeReadings: [], notes: [], flaggedMoments: [] }];
      }))) as GameState["observations"];
    let selectedPlayerId = "";
    const store = { gameState,
      startReport: vi.fn((id: string) => { selectedPlayerId = id; }),
      submitReport: vi.fn((conviction: string, summary: string) => {
        gameState.reports["filed-selected"] = { id: "filed-selected", scoutId: "scout", playerId: selectedPlayerId,
          submittedWeek: 3, submittedSeason: 1, conviction, summary,
          evidenceObservationIds: Object.values(gameState.observations).filter((observation) => observation.playerId === selectedPlayerId).map((observation) => observation.id),
        } as GameState["reports"][string];
      }),
    };
    vi.spyOn(useGameStore, "getState").mockImplementation(() => store as never);
    const telemetry = createAutonomousCareerTelemetry("cautious");
    expect(authorAutonomousReportForPlayer("player", telemetry)?.playerId).toBe("player");
    expect(store.startReport).toHaveBeenCalledWith("player");
    expect(store.submitReport.mock.calls[0][0]).toBe("recommend");
    expect(store.submitReport.mock.calls[0][1]).toContain("3 direct observations");
    expect(authorAutonomousReportForPlayer("player", telemetry)).toBeUndefined();
    expect(store.submitReport).toHaveBeenCalledTimes(1);
    expect(telemetry.authoredReports).toBe(1);
  });

  it("does not manufacture a report when the selected case lacks three earned samples", () => {
    const gameState = placementState();
    gameState.players = {};
    gameState.reports = {};
    gameState.observations = {};
    const store = { gameState, startReport: vi.fn(), submitReport: vi.fn() };
    vi.spyOn(useGameStore, "getState").mockImplementation(() => store as never);
    expect(authorAutonomousReportForPlayer("player", createAutonomousCareerTelemetry("cautious"))).toBeUndefined();
    expect(store.startReport).not.toHaveBeenCalled();
    expect(store.submitReport).not.toHaveBeenCalled();
  });
});

describe("autonomous youth career driver profiles", () => {
  it("keeps the existing commercial profile as the default", () => {
    expect(createAutonomousCareerTelemetry().chooserProfile).toBe("commercial");
    expect(createAutonomousCareerTelemetry("cautious").chooserProfile).toBe("cautious");
    expect(createAutonomousCareerTelemetry("aggressive").chooserProfile).toBe("aggressive");
  });

  it("lets cautious and commercial choosers diverge on the same visible options", () => {
    const choices = [
      {
        label: "Verify privately",
        description: "Protect the source, wait for another viewing, and document the concern.",
      },
      {
        label: "Sell the exclusive listing",
        description: "Push the offer now, take the agency fee, and close the sale.",
      },
    ];

    expect(chooseAutonomousOptionIndex(choices, "cautious")).toBe(0);
    expect(chooseAutonomousOptionIndex(choices, "commercial")).toBe(1);
    expect(chooseAutonomousOptionIndex(choices, "aggressive")).toBe(1);
  });

  it("scores default consequence options by profile instead of always taking them", () => {
    const decision = {
      id: "decision-1",
      status: "offered",
      source: { kind: "rival", id: "r1" },
      offeredAt: { season: 1, week: 1 },
      deadlineAt: { season: 1, week: 2 },
      visibility: "private",
      stakeholders: [],
      outcomeRoll: 0.4,
      consequenceIds: [],
      defaultOptionId: "verify",
      options: [
        {
          id: "verify",
          label: "Verify privately",
          knownTradeoffs: ["protect the source", "wait for proof"],
          immediateEffects: [],
          scheduledConsequences: [],
        },
        {
          id: "sell",
          label: "Take the offer",
          knownTradeoffs: ["agency fee", "exclusive terms"],
          immediateEffects: [],
          scheduledConsequences: [],
        },
        {
          id: "exploit",
          label: "Exploit the leak publicly",
          knownTradeoffs: [
            "exploit the leak",
            "public expose",
            "threaten an ultimatum",
            "force the move",
            "cash-out now",
            "bluff hard",
          ],
          immediateEffects: [],
          scheduledConsequences: [],
        },
      ],
    } as DecisionRecord;

    expect(chooseAutonomousDecisionOption(decision, "cautious").id).toBe("verify");
    expect(chooseAutonomousDecisionOption(decision, "commercial").id).toBe("sell");
    expect(chooseAutonomousDecisionOption(decision, "aggressive").id).toBe("exploit");
  });

  it("changes persisted downstream state across profiles during stabilization", () => {
    const runProfile = (profile: "commercial" | "cautious" | "aggressive") => {
      const telemetry = createAutonomousCareerTelemetry(profile);
      const gameState = {
        currentSeason: 2,
        currentWeek: 8,
        scout: {
          id: "scout-1",
          careerPath: "club",
          careerTier: 3,
          careerPathChosen: false,
          reputation: 30,
          reportsSubmitted: 6,
        },
        finances: {
          balance: 1300,
          activeEnrollment: undefined,
          completedCourses: [],
          reportListings: [],
          retainerContracts: [],
          pendingRetainerOffers: [],
          pendingConsultingOffers: [],
          consultingContracts: [],
          employees: [],
        },
        observations: {},
        reports: {},
        unsignedYouth: {},
        players: {},
        openingCase: undefined,
        consequenceState: {
          decisions: {
            "decision-1": {
              id: "decision-1",
              status: "offered",
              source: { kind: "rival", id: "r1" },
              offeredAt: { season: 2, week: 8 },
              deadlineAt: { season: 2, week: 9 },
              visibility: "private",
              stakeholders: [],
              outcomeRoll: 0.4,
              consequenceIds: [],
              defaultOptionId: "verify",
              options: [
                {
                  id: "verify",
                  label: "Verify privately",
                  knownTradeoffs: ["protect the source", "wait for proof"],
                  immediateEffects: [],
                  scheduledConsequences: [],
                },
                {
                  id: "sell",
                  label: "Take the offer",
                  knownTradeoffs: ["agency fee", "exclusive terms"],
                  immediateEffects: [],
                  scheduledConsequences: [],
                },
                {
                  id: "exploit",
                  label: "Exploit the leak publicly",
                  knownTradeoffs: [
                    "exploit the leak",
                    "public expose",
                    "threaten an ultimatum",
                    "force the move",
                    "cash-out now",
                    "bluff hard",
                  ],
                  immediateEffects: [],
                  scheduledConsequences: [],
                },
              ],
            },
          },
        },
      } as unknown as GameState;

      const seasonEvents = [
        {
          id: "season-1", type: "midSeasonReview", name: "Review", startWeek: 8, endWeek: 8,
          description: "Review", resolved: false, choiceSelected: undefined as number | undefined,
          choices: [
            { label: "Verify privately", description: "Protect the source and wait for proof.", effects: [{ type: "reputationBonus", value: 1 }, { type: "fatigueModifier", value: 0.1 }] },
            { label: "Take the offer", description: "Accept the agency fee under exclusive terms.", effects: [{ type: "reputationBonus", value: 2 }, { type: "fatigueModifier", value: 0.2 }] },
            { label: "Exploit the leak publicly", description: "Threaten an ultimatum, force the move, and cash-out now.", effects: [{ type: "reputationBonus", value: 3 }, { type: "fatigueModifier", value: 0.3 }] },
          ],
        },
      ];
      gameState.seasonEvents = seasonEvents as GameState["seasonEvents"];
      const store = {
        gameState,
        getActiveSeasonEvents: () => seasonEvents,
        getActiveNarrativeEvents: () => [],
        resolveSeasonEvent: vi.fn((eventId: string, choiceIndex: number) => {
          (gameState.finances as unknown as Record<string, unknown>)[`season:${eventId}`] = choiceIndex;
          seasonEvents[0].resolved = true;
          seasonEvents[0].choiceSelected = choiceIndex;
        }),
        resolveNarrativeEventChoice: vi.fn(),
        acknowledgeNarrativeEvent: vi.fn(),
        resolveOpeningDiscoveryChoice: vi.fn(),
        resolveConsequenceDecision: vi.fn((decisionId: string, optionId: string) => {
          const decision = gameState.consequenceState.decisions[
            decisionId as keyof typeof gameState.consequenceState.decisions
          ] as DecisionRecord & { selectedOptionId?: string; selectionKind?: string; status: string };
          decision.selectedOptionId = optionId;
          decision.selectionKind = "player";
          decision.status = "selected";
        }),
        startReport: vi.fn(),
        submitReport: vi.fn(),
        chooseCareerPath: vi.fn((path: "club" | "independent") => {
          gameState.scout.careerPath = path;
          gameState.scout.careerPathChosen = true;
        }),
        listReportForSale: vi.fn(),
        dismissPendingListing: vi.fn(),
        acceptMarketplaceBid: vi.fn(),
        acceptExclusiveUpgradeBid: vi.fn(),
        acceptRetainerContract: vi.fn(),
        declineRetainerOffer: vi.fn(),
        declineConsultingOffer: vi.fn(),
        enrollInCourse: vi.fn((courseId: string) => {
          gameState.finances!.activeEnrollment = {
            courseId,
            startWeek: gameState.currentWeek,
            startSeason: gameState.currentSeason,
            completionWeek: gameState.currentWeek + 4,
            completionSeason: gameState.currentSeason,
            studyWeeksCompleted: 0,
            requiredStudyWeeks: 4,
          };
        }),
        markMessageRead: vi.fn(),
      };

      vi.spyOn(useGameStore, "getState").mockImplementation(() => store as never);
      stabilizeAutonomousCareerState(telemetry);

      return {
        seasonChoice: (gameState.finances as unknown as Record<string, unknown>)["season:season-1"],
        careerPath: gameState.scout.careerPath,
        selectedDecision:
          gameState.consequenceState.decisions["decision-1"].selectedOptionId,
        activeEnrollment: gameState.finances?.activeEnrollment?.courseId ?? null,
      };
    };

    expect(runProfile("cautious")).toEqual({
      seasonChoice: 0,
      careerPath: "club",
      selectedDecision: "verify",
      activeEnrollment: null,
    });
    expect(runProfile("commercial")).toEqual({
      seasonChoice: 1,
      careerPath: "independent",
      selectedDecision: "sell",
      activeEnrollment: null,
    });
    expect(runProfile("aggressive")).toEqual({
      seasonChoice: 2,
      careerPath: "independent",
      selectedDecision: "exploit",
      activeEnrollment: "fa_level_1",
    });
  });

  it("reserves a real planner slot for an active course", () => {
    const schedule = {
      activities: Array.from({ length: 7 }, (_, index) => ({
        type: "rest",
        slots: 1,
        description: `Rest ${index}`,
      })),
    };
    const store = {
      gameState: {
        finances: {
          activeEnrollment: { courseId: "fa_level_1" },
        },
        schedule,
      },
      unscheduleActivity: vi.fn((dayIndex: number) => {
        schedule.activities[dayIndex] = null as never;
      }),
      scheduleActivity: vi.fn((activity: GameState["schedule"]["activities"][number], dayIndex: number) => {
        schedule.activities[dayIndex] = activity as never;
      }),
    };
    vi.spyOn(useGameStore, "getState").mockImplementation(() => store as never);

    ensureCourseStudyScheduled();

    expect(store.unscheduleActivity).toHaveBeenCalledWith(6);
    expect(store.scheduleActivity).toHaveBeenCalledWith(
      expect.objectContaining({ type: "study", slots: 1 }),
      6,
    );
  });

  it("reviews live actionable inbox notices instead of accumulating unseen work", () => {
    const inbox = [{
      id: "directive-1",
      week: 3,
      season: 2,
      type: "assignment",
      title: "Review the academy",
      body: "A live directive still needs work.",
      read: false,
      actionRequired: true,
      relatedId: "directive-1",
      relatedEntityType: "directive",
    }];
    const state = {
      currentSeason: 2,
      currentWeek: 3,
      fixtures: {},
      inbox,
      managerDirectives: [{ id: "directive-1", fulfilled: false }],
      scout: { boardDirectives: [] },
      consequenceState: { decisions: {} },
      jobOffers: [],
      narrativeEvents: [],
      seasonEvents: [],
      internationalAssignments: [],
      activeInternationalAssignment: null,
      contacts: {},
      activeNegotiations: [],
      freeAgentNegotiations: [],
      finances: { reportListings: [] },
    } as unknown as GameState;
    const store = {
      gameState: state,
      markMessageRead: vi.fn((messageId: string) => {
        const message = inbox.find((candidate) => candidate.id === messageId);
        if (message) message.read = true;
      }),
    };
    vi.spyOn(useGameStore, "getState").mockImplementation(() => store as never);

    reviewActionableInbox();

    expect(store.markMessageRead).toHaveBeenCalledWith("directive-1");
    expect(inbox[0].read).toBe(true);
    expect(inbox[0].actionRequired).toBe(true);
  });

  it("drains every pending non-exclusive marketplace bid during weekly review", () => {
    const bids = [
      { id: "bid-1", status: "pending", amount: 500, isExclusiveUpgrade: false },
      { id: "bid-2", status: "pending", amount: 450, isExclusiveUpgrade: false },
    ];
    const state = {
      finances: {
        reportListings: [{ id: "listing-1", bids }],
      },
    } as unknown as GameState;
    const store = {
      gameState: state,
      acceptMarketplaceBid: vi.fn((bidId: string) => {
        const bid = bids.find((candidate) => candidate.id === bidId);
        if (bid) bid.status = "accepted";
      }),
      acceptExclusiveUpgradeBid: vi.fn(),
    };
    vi.spyOn(useGameStore, "getState").mockImplementation(() => store as never);

    resolveCommercialInbox(createAutonomousCareerTelemetry());

    expect(store.acceptMarketplaceBid).toHaveBeenCalledTimes(2);
    expect(bids.map((bid) => bid.status)).toEqual(["accepted", "accepted"]);
  });
});

describe("autonomous career presentation signals", () => {
  it("surfaces player-facing fingerprint and callback counts from visible state", () => {
    const state = {
      runManifest: {
        originId: "grassroots-organizer",
        doctrineIds: ["relationships-first"],
        worldTraitIds: ["golden-generation", "trusted-circuit", "boom-bust-market"],
      },
      scout: {
        careerPath: "independent",
        careerTier: 4,
      },
      careerEraDirectorState: {
        current: {
          theme: "relationshipDebt",
          title: "Promises are becoming leverage",
          primaryCountryId: "portugal",
        },
      },
      careerRecovery: undefined,
      consequenceState: {
        obligations: {
          one: {
            id: "one",
            status: "active",
            debtor: { kind: "scout", id: "you" },
            creditor: { kind: "family", id: "family-1" },
          },
        },
        memories: {
          one: {
            id: "memory-1",
            stakeholder: { kind: "family", id: "family-1" },
            salience: 64,
          },
        },
      },
      rivalOrganizationState: {
        currentPressure: {},
        organizations: {},
      },
      currentSeason: 4,
      currentWeek: 12,
      regionalKnowledge: {
        portugal: { countryId: "portugal", knowledgeLevel: 72, knowledgeLedger: [] },
      },
      countries: ["portugal", "spain"],
      contacts: {},
      finances: {
        employees: [],
      },
      assistantScouts: [],
      npcScouts: {},
      discoveryRecords: [
        {
          playerId: "player-1",
          discoveredSeason: 1,
          discoveredWeek: 6,
          placementSeason: 2,
          placementWeek: 18,
        },
      ],
      playerMovementHistory: [
        {
          id: "movement-1",
          playerId: "player-1",
          type: "transfer",
          season: 3,
          week: 9,
        },
      ],
      performanceReviews: [
        {
          id: "review-1",
          season: 3,
          outcome: "excellent",
        },
      ],
    } as unknown as Pick<
      GameState,
      | "assistantScouts"
      | "careerEraDirectorState"
      | "careerRecovery"
      | "consequenceState"
      | "contacts"
      | "countries"
      | "currentSeason"
      | "currentWeek"
      | "discoveryRecords"
      | "finances"
      | "npcScouts"
      | "performanceReviews"
      | "playerMovementHistory"
      | "regionalKnowledge"
      | "rivalOrganizationState"
      | "runManifest"
      | "scout"
    >;

    const signals = collectAutonomousCareerPresentationSignals(state);

    expect(signals.careerFingerprintTitle).toBe("Relationships First");
    expect(signals.careerFingerprintId).toHaveLength(16);
    expect(signals.visibleCareerCallbackCount).toBe(3);
  });
});


describe("season event promises follow actual consequences", () => {
  function stateFor(event: SeasonEvent): GameState {
    return { currentSeason: 1, currentWeek: event.startWeek,
      scout: { primarySpecialization: "youth", reputation: 20, fatigue: 40 },
      seasonEvents: [event], players: { prospect: { id: "prospect", injured: false } },
      fixtures: { fixture: { id: "fixture", season: 1, week: event.startWeek, played: false } },
      inbox: [] } as unknown as GameState;
  }

  it("does not offer or resolve decorative price/reveal choices and demotes legacy inbox prompts", () => {
    const event = generateSeasonEvents(1).find((candidate) => candidate.type === "winterTransferWindow")!;
    const state = stateFor(event);
    state.scout.primarySpecialization = "firstTeam";
    expect(getSeasonEventChoiceOptions(event)).toEqual([]);
    expect(canResolveSeasonEvent(event, state.currentWeek, "firstTeam")).toBe(false);
    expect(resolveSeasonEventChoice(state, event.id, 0)).toBe(state);
    const message = { id: "legacy", type: "event", title: `${event.name} — Decision Required`,
      body: "Old promise", week: state.currentWeek, season: 1, read: false,
      actionRequired: true, relatedId: event.id, relatedEntityType: "seasonEvent" } as const;
    state.inbox = [{ ...message }];
    expect(reconcileInboxActionRequirements(state)[0].actionRequired).toBe(false);
    const applied = applySeasonEventEffects(state, [event], new RNG("decorative-window"));
    expect(applied.messages[0].actionRequired).toBe(false);
    expect(applied.messages[0].title).toBe(event.name);
    expect(applied.state.scout).toEqual(state.scout);
  });

  it("suppresses all current dominated calendar choices without selecting a winner or changing base effects", () => {
    const events = generateSeasonEvents(1);
    expect(events).toHaveLength(21);
    expect(events.filter((event) => event.choices?.length)).toHaveLength(10);
    expect(events.flatMap(getSeasonEventChoiceOptions)).toEqual([]);
    const calendar = renderToStaticMarkup(createElement(SeasonTimeline, { seasonEvents: events, currentWeek: 2, seasonLength: 38, onResolveEvent: () => {} }));
    expect(calendar).not.toContain(">Choose<");
    for (const event of events.filter((candidate) => candidate.choices?.length)) {
      const state = stateFor(event);
      state.scout.primarySpecialization = "firstTeam";
      const before = JSON.stringify(state);
      for (let index = 0; index < event.choices!.length; index += 1) {
        expect(resolveSeasonEventChoice(state, event.id, index)).toBe(state);
      }
      expect(JSON.stringify(state)).toBe(before);
      expect(event.resolved).toBe(false);
      const base = applySeasonEventEffects(state, [event], new RNG(event.id));
      const baseEffectsOnly = applySeasonEventEffects(state, [{ ...event, choices: undefined }], new RNG(event.id));
      expect(base.state.scout).toEqual(baseEffectsOnly.state.scout);
      expect(base.messages.every((message) => !message.actionRequired)).toBe(true);
    }
  });

  it("keeps genuine reputation-for-fatigue tradeoffs while removing a dominated original index", () => {
    const event: SeasonEvent = { id: "tradeoff", name: "Present findings", type: "midSeasonReview",
      startWeek: 2, endWeek: 2, description: "Choose workload", choices: [
        { label: "Focused presentation", description: "Reward with work", effects: [{ type: "reputationBonus", value: 3 }, { type: "fatigueModifier", value: 0.2 }] },
        { label: "Less effective presentation", description: "Strictly worse", effects: [{ type: "reputationBonus", value: 2 }, { type: "fatigueModifier", value: 0.3 }] },
        { label: "Rest", description: "Recovery", effects: [{ type: "fatigueModifier", value: -0.1 }] },
      ] };
    expect(getSeasonEventChoiceOptions(event).map((option) => option.index)).toEqual([0, 2]);
    const state = stateFor(event);
    expect(resolveSeasonEventChoice(state, event.id, 1)).toBe(state);
    const rendered = renderToStaticMarkup(createElement(SeasonTimeline, { seasonEvents: [event], currentWeek: 2, seasonLength: 38, onResolveEvent: () => {} }));
    expect(rendered).toContain(">Choose<");
    const resolved = resolveSeasonEventChoice(state, event.id, 0);
    expect(resolved.seasonEvents[0].choiceSelected).toBe(0);
    expect(applySeasonEventEffects(resolved, resolved.seasonEvents, new RNG("tradeoff")).state.scout)
      .toMatchObject({ reputation: 23, fatigue: 42 });
  });

  it("retains real effects, original indices and an immutable already-resolved selection", () => {
    const event: SeasonEvent = { id: "choice", name: "Review", type: "midSeasonReview", startWeek: 2, endWeek: 3,
      description: "Review", effects: [{ type: "reputationBonus", value: 1 }], choices: [
        { label: "One", description: "One", effects: [{ type: "reputationBonus", value: 2 }] },
        { label: "Duplicate", description: "Duplicate", effects: [{ type: "reputationBonus", value: 2 }, { type: "attributeRevealBonus", value: 1 }] },
        { label: "Rest", description: "Rest", effects: [{ type: "fatigueModifier", value: -0.3 }] },
      ] };
    const state = stateFor(event);
    expect(getSeasonEventChoiceOptions(event).map((option) => option.index)).toEqual([0, 2]);
    expect(resolveSeasonEventChoice(state, event.id, 1)).toBe(state);
    const resolved = resolveSeasonEventChoice(state, event.id, 2);
    expect(resolved.seasonEvents[0].choiceSelected).toBe(2);
    expect(resolved.seasonEvents[0].choices).toEqual(event.choices);
    expect(applySeasonEventEffects(resolved, resolved.seasonEvents, new RNG("rest")).state.scout)
      .toMatchObject({ fatigue: 37, reputation: 20 });
    expect(resolveSeasonEventChoice(resolved, event.id, 0)).toBe(resolved);
    const historical = { ...state, seasonEvents: [{ ...event, resolved: true, choiceSelected: 1 }] };
    expect(applySeasonEventEffects(historical, historical.seasonEvents, new RNG("historical")).state.scout.reputation).toBe(22);
    expect(historical.seasonEvents[0].choiceSelected).toBe(1);
  });

  it("rejects expired, future, wrong-specialization and fractional choice bypasses", () => {
    const event = generateSeasonEvents(1).find((candidate) => candidate.type === "preSeasonTournament")!;
    event.choices![0].effects = [{ type: "reputationBonus", value: 5 }, { type: "fatigueModifier", value: 0.2 }];
    event.choices![1].effects = [{ type: "reputationBonus", value: 3 }];
    const state = stateFor(event);
    expect(resolveSeasonEventChoice(state, event.id, 1)).toBe(state);
    state.scout.primarySpecialization = "firstTeam";
    expect(canResolveSeasonEvent(event, state.currentWeek, "firstTeam")).toBe(true);
    expect(resolveSeasonEventChoice(state, event.id, 0.5)).toBe(state);
    for (const week of [event.startWeek - 1, event.endWeek + 1]) {
      state.currentWeek = week;
      expect(resolveSeasonEventChoice(state, event.id, 1)).toBe(state);
    }
  });

  it("shows actual combined fatigue points and no unsupported badges in the rendered timeline", () => {
    const events: SeasonEvent[] = [0, 1].map((index) => ({ id: `active-${index}`, name: "Workload",
      type: "fixtureCongestion", startWeek: 2, endWeek: 2, description: "Workload", effects: [
        { type: "fatigueModifier", value: 0.15 }, { type: "attributeRevealBonus", value: 0.5 },
        { type: "playerAvailability", value: -0.2 },
      ] }));
    const state = stateFor(events[0]); state.seasonEvents = events;
    expect(applySeasonEventEffects(state, events, new RNG("sum")).state.scout.fatigue).toBe(43);
    expect(getActiveSeasonEventDisplayEffects(events)).toEqual([{ type: "fatigueModifier", value: 0.3 }]);
    const rendered = renderToStaticMarkup(createElement(SeasonTimeline, { seasonEvents: events, currentWeek: 2, seasonLength: 38, onResolveEvent: () => {} }));
    expect(rendered).toContain("Scout fatigue");
    expect(rendered).toContain("+3 / week");
    expect(rendered).not.toMatch(/Reveal Quality|Availability|15%|20%/);
  });

  it("keeps international-period fixtures and player availability intact while applying actual fatigue", () => {
    const event = generateSeasonEvents(1).find((candidate) => candidate.type === "internationalBreak")!;
    const state = stateFor(event);
    expect(isInternationalBreak(state.seasonEvents, state.currentWeek)).toBe(true);
    const active = getActiveSeasonEvents(state.seasonEvents, state.currentWeek);
    const applied = applySeasonEventEffects(state, active, new RNG("international-context"));
    expect(applied.state.scout.fatigue).toBe(39);
    expect(applied.state.fixtures).toBe(state.fixtures);
    expect(applied.state.players).toBe(state.players);
    expect(event.description).toContain("Listed club fixtures remain scheduled");
    expect(event.description).not.toMatch(/unavailable|higher-quality|suspended/);
  });

  it("does not resurrect decorative prompts on migration or rewrite historical selected effects", () => {
    const state = migrateSaveState(goldenSave.state);
    const events = generateSeasonEvents(state.currentSeason, 38);
    const winter = events.find((event) => event.type === "winterTransferWindow")!;
    const review = events.find((event) => event.type === "endOfSeasonReview")!;
    review.resolved = true; review.choiceSelected = 1;
    review.choices![1] = { label: "Original saved choice", description: "Original saved explanation",
      effects: [{ type: "reputationBonus", value: 7 }, { type: "attributeRevealBonus", value: 0.8 }] };
    state.seasonEvents = events;
    state.currentWeek = winter.startWeek;
    state.scout.primarySpecialization = "firstTeam";
    state.inbox = [{ id: "old-season-prompt", type: "event", title: `${winter.name} — Decision Required`,
      body: "Old scouting discount promise", week: state.currentWeek, season: state.currentSeason,
      read: false, actionRequired: true, relatedId: winter.id, relatedEntityType: "seasonEvent" }];
    const loaded = migrateSaveState(state);
    const restoredReview = loaded.seasonEvents.find((event) => event.name === review.name)!;
    expect(restoredReview.choiceSelected).toBe(1);
    expect(restoredReview.choices).toEqual(review.choices);
    expect(restoredReview.effects).toEqual(review.effects);
    expect(loaded.inbox.find((message) => message.id === "old-season-prompt"))
      .toMatchObject({ title: winter.name, actionRequired: false });
  });
});
