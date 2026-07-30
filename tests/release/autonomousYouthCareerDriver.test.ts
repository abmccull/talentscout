import { afterEach, describe, expect, it, vi } from "vitest";

import type { GameState } from "@/engine/core/types";
import type { DecisionRecord } from "@/engine/consequences/types";
import { useGameStore } from "@/stores/gameStore";
import {
  chooseAutonomousOptionIndex,
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
          id: "season-1",
          choices: [
            { label: "Verify privately", description: "Protect the source and wait for proof." },
            { label: "Take the offer", description: "Accept the agency fee under exclusive terms." },
            { label: "Exploit the leak publicly", description: "Threaten an ultimatum, force the move, and cash-out now." },
          ],
        },
      ];
      const store = {
        gameState,
        getActiveSeasonEvents: () => seasonEvents,
        getActiveNarrativeEvents: () => [],
        resolveSeasonEvent: vi.fn((eventId: string, choiceIndex: number) => {
          (gameState.finances as unknown as Record<string, unknown>)[`season:${eventId}`] = choiceIndex;
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
