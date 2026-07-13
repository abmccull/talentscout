import { describe, expect, it } from "vitest";
import type {
  BoardProfile,
  Club,
  FinancialRecord,
  Fixture,
  FreeAgent,
  GameState,
  LoanDeal,
  Player,
  Scout,
} from "@/engine/core/types";
import type { RNG } from "@/engine/rng";
import {
  addGameWeeks,
  formatRelativeGameDate,
  gameWeeksBetweenWithSeasonLength,
  getSeasonEndWindow,
  getSeasonLength,
  isGameSeasonComplete,
  normalizeGameWeek,
} from "@/engine/core/gameDate";
import { initiateFreeAgentNegotiation } from "@/engine/freeAgents/negotiation";
import { initiateNegotiation } from "@/engine/firstTeam/negotiation";
import {
  calculateLoanTerms,
  evaluateLoanOutcome,
} from "@/engine/world/loans";
import {
  expireOldListings,
  listReport,
} from "@/engine/finance/reportMarketplace";
import { expireEconomicEvents } from "@/engine/events/economicEvents";
import {
  evaluateBoardSatisfaction,
  generateBoardReaction,
  processBoardMeeting,
} from "@/engine/firstTeam/boardAI";
import { migrateReportListingBids } from "@/engine/finance/saveMigration";
import {
  generateSeasonEvents,
  getSeasonPhase,
  getSeasonSegmentWidthPercent,
  getSeasonTimelineLabelWeeks,
  getSeasonWeekProgressPercent,
  scaleAuthoredSeasonWeek,
} from "@/engine/core/seasonEvents";
import { generateJobOffers } from "@/engine/career/progression";
import { bookTravel } from "@/engine/world/travel";
import { annualizeMonthlyAmount } from "@/engine/core/annualization";
import { createConsequenceEngineState } from "@/engine/consequences";

const CALENDAR_LENGTHS = [38, 46, 50] as const;

const deterministicRng = {
  chance: () => false,
  next: () => 0,
  nextFloat: (minimum: number) => minimum,
  nextInt: (minimum: number) => minimum,
  pick: <T>(items: T[]) => items[0],
  pickWeighted: <T>(items: Array<{ item: T }>) => items[0].item,
  shuffle: <T>(items: T[]) => [...items],
} as unknown as RNG;

function fixturesFor(seasonLength: number, season = 1): Record<string, Fixture> {
  return {
    [`fixture-s${season}-w${seasonLength}`]: {
      id: `fixture-s${season}-w${seasonLength}`,
      homeClubId: "home",
      awayClubId: "away",
      leagueId: "league",
      season,
      week: seasonLength,
      played: false,
    },
  };
}

function club(id: string, reputation: number): Club {
  return {
    id,
    name: id,
    shortName: id,
    leagueId: "league",
    reputation,
    budget: 5_000_000,
    scoutingPhilosophy: "academyFirst",
    managerId: `manager-${id}`,
    playerIds: [],
    youthAcademyRating: 10,
  } as unknown as Club;
}

function player(): Player {
  return {
    id: "player",
    firstName: "Calendar",
    lastName: "Prospect",
    age: 22,
    position: "CM",
    clubId: "seller",
    contractClubId: "seller",
    contractExpiry: 4,
    wage: 1_000,
    marketValue: 1_000_000,
    currentAbility: 100,
    potentialAbility: 140,
    form: 0,
    morale: 5,
    injured: false,
    injuryWeeksRemaining: 0,
    personalityTraits: [],
    personalityRevealed: [],
    playerTraits: [],
    playerTraitsRevealed: [],
    recentMatchRatings: [],
    seasonRatings: [],
  } as unknown as Player;
}

function emptyFinances(): FinancialRecord {
  return {
    reportListings: [],
    activeEconomicEvents: [],
  } as unknown as FinancialRecord;
}

describe.each(CALENDAR_LENGTHS)("calendar authority (%i-week season)", (seasonLength) => {
  const fixtures = fixturesFor(seasonLength);

  it("derives the boundary from fixtures and rolls dates over without changing 38-week behavior", () => {
    expect(getSeasonLength(fixtures, 1)).toBe(seasonLength);
    expect(addGameWeeks(
      fixtures,
      { season: 1, week: seasonLength - 2 },
      4,
    )).toEqual({ season: 2, week: 2 });
    expect(isGameSeasonComplete(fixtures, { season: 1, week: seasonLength - 1 }))
      .toBe(false);
    expect(isGameSeasonComplete(fixtures, { season: 1, week: seasonLength }))
      .toBe(true);
  });

  it("scales authored events, phases, and timeline labels to the active calendar", () => {
    const events = generateSeasonEvents(1, seasonLength);
    const endReview = events.find((event) => event.type === "endOfSeasonReview");
    expect(endReview).toMatchObject({ startWeek: seasonLength, endWeek: seasonLength });
    expect(events.every((event) => (
      event.startWeek >= 1
      && event.endWeek >= event.startWeek
      && event.endWeek <= seasonLength
    ))).toBe(true);
    expect(scaleAuthoredSeasonWeek(38, seasonLength)).toBe(seasonLength);
    expect(getSeasonPhase(seasonLength, seasonLength)).toBe("endseason");
    expect(getSeasonTimelineLabelWeeks(seasonLength).at(-1)).toBe(seasonLength);
    expect(getSeasonWeekProgressPercent(seasonLength, seasonLength)).toBe(100);
    expect(getSeasonSegmentWidthPercent(
      seasonLength,
      seasonLength,
      seasonLength,
    )).toBeGreaterThan(0);
  });

  it("places job-offer expiry in the real final-four-week window", () => {
    const employer = club("employer", 30);
    const scout = {
      id: "scout",
      careerTier: 1,
      reputation: 30,
      primarySpecialization: "youth",
    } as unknown as Scout;
    const offers = generateJobOffers(
      deterministicRng,
      scout,
      { [employer.id]: employer },
      2,
      seasonLength,
    );
    const window = getSeasonEndWindow(seasonLength, 4);
    expect(offers).toHaveLength(1);
    expect(offers[0].expiresWeek).toBeGreaterThanOrEqual(window.startWeek);
    expect(offers[0].expiresWeek).toBeLessThanOrEqual(window.endWeek);
  });

  it("normalizes travel and inbox age using the active boundary", () => {
    const scout = {
      countryReputations: {
        england: {
          country: "england",
          familiarity: 50,
          reportsSubmitted: 0,
          successfulFinds: 0,
          contactCount: 0,
        },
      },
    } as unknown as Scout;
    const booked = bookTravel(
      scout,
      "france",
      seasonLength + 1,
      3,
      seasonLength,
    );
    expect(booked.travelBooking).toMatchObject({ departureWeek: 1, returnWeek: 4 });
    expect(normalizeGameWeek(seasonLength + 1, seasonLength)).toBe(1);
    expect(formatRelativeGameDate(
      { season: 1, week: seasonLength },
      { season: 2, week: 1 },
      seasonLength,
    )).toBe("1 week ago");
  });

  it("annualizes monthly salary independently of competition length", () => {
    expect(annualizeMonthlyAmount(1_000)).toBe(12_000);
    expect(annualizeMonthlyAmount(1_000, 3)).toBe(36_000);
  });

  it("normalizes free-agent and first-team negotiation deadlines", () => {
    const prospect = player();
    const freeAgent = {
      playerId: prospect.id,
      wageExpectation: 2_000,
      signingBonusExpectation: 5_000,
    } as FreeAgent;
    const freeAgentTalks = initiateFreeAgentNegotiation(
      freeAgent,
      prospect,
      1_000,
      1_000,
      2,
      seasonLength - 2,
      1,
      deterministicRng,
      seasonLength,
    );
    expect(freeAgentTalks).toMatchObject({ deadlineSeason: 2, deadline: 1 });

    const seller = club("seller", 60);
    seller.playerIds = [prospect.id];
    const buyer = club("buyer", 70);
    const state = {
      currentWeek: seasonLength - 2,
      currentSeason: 1,
      fixtures,
      players: { [prospect.id]: prospect },
      clubs: { seller, buyer },
      activeNegotiations: [],
    } as unknown as GameState;
    const transferTalks = initiateNegotiation(
      deterministicRng,
      state,
      prospect.id,
      buyer.id,
    );
    expect(transferTalks).toMatchObject({ deadlineSeason: 2, deadline: 2 });
  });

  it("normalizes listing windows and expires listings by real cross-season age", () => {
    const listed = listReport(
      emptyFinances(),
      "report",
      500,
      false,
      undefined,
      seasonLength - 1,
      1,
      undefined,
      seasonLength,
    );
    expect(listed.reportListings[0]).toMatchObject({
      biddingEndsSeason: 2,
      biddingEndsWeek: 1,
    });

    const aging = {
      ...listed,
      reportListings: [{
        ...listed.reportListings[0],
        listedWeek: seasonLength - 3,
        listedSeason: 1,
      }],
    };
    expect(expireOldListings(aging, 4, 2, seasonLength).reportListings[0].status)
      .toBe("active");
    expect(expireOldListings(aging, 5, 2, seasonLength).reportListings[0].status)
      .toBe("expired");
  });

  it("calculates loan end dates, duration, and outcome against the real season", () => {
    const prospect = player();
    const parent = club("seller", 70);
    const host = club("host", 50);
    const terms = calculateLoanTerms(
      prospect,
      parent,
      host,
      seasonLength - 2,
      1,
      deterministicRng,
      seasonLength,
    );
    expect(terms).toMatchObject({ endSeason: 2, endWeek: 2 });

    const deal = {
      id: "loan",
      playerId: prospect.id,
      parentClubId: parent.id,
      loanClubId: host.id,
      startWeek: seasonLength - 2,
      startSeason: 1,
      endWeek: 6,
      endSeason: 2,
      loanFee: 0,
      wageContribution: 50,
      recallClause: false,
      status: "active",
      performanceRecord: {
        appearances: 2,
        goals: 0,
        assists: 0,
        avgRating: 6.5,
        developmentDelta: 1,
        parentClubSatisfaction: 50,
        loanClubSatisfaction: 50,
      },
    } as LoanDeal;
    expect(gameWeeksBetweenWithSeasonLength(
      { week: deal.startWeek, season: deal.startSeason },
      { week: deal.endWeek, season: deal.endSeason },
      seasonLength,
    )).toBe(8);
    expect(evaluateLoanOutcome(deal, seasonLength)).toBe("neutral");
  });

  it("uses the same boundary for economic-event age and board ultimatums", () => {
    const finances = {
      ...emptyFinances(),
      activeEconomicEvents: [{
        id: "event",
        type: "marketCrash" as const,
        description: "test",
        multiplier: 0.8,
        startWeek: seasonLength - 3,
        startSeason: 1,
        durationWeeks: 8,
      }],
    };
    expect(expireEconomicEvents(finances, 4, 2, seasonLength).activeEconomicEvents)
      .toHaveLength(1);
    expect(expireEconomicEvents(finances, 5, 2, seasonLength).activeEconomicEvents)
      .toHaveLength(0);

    const profile = {
      personality: "patient",
      patience: 50,
      satisfactionLevel: 10,
      budgetMultiplier: 1,
      ultimatumIssued: false,
      recentDirectives: [],
    } as BoardProfile;
    const state = {
      seed: `calendar-${seasonLength}`,
      currentWeek: seasonLength - 3,
      currentSeason: 1,
      fixtures,
      boardProfile: profile,
      scout: {
        id: "calendar-scout",
        careerTier: 5,
        careerPath: "club",
        currentClubId: "club-1",
        fatigue: 0,
        reputation: 50,
        attributes: { networking: 10, persuasion: 10 },
      },
      schedule: {
        week: seasonLength - 3,
        season: 1,
        activities: [null, null, null, null, null, null, null],
        completed: false,
      },
      consequenceState: createConsequenceEngineState(),
      inbox: [],
      satisfactionHistory: [],
    } as unknown as GameState;

    const directiveState = {
      ...state,
      boardProfile: { ...profile, satisfactionLevel: 60, patience: 70 },
      reports: {},
      observations: {},
      transferRecords: [],
      managerDirectives: [{ id: "directive", season: 1, fulfilled: false }],
    } as unknown as GameState;
    const beforePressure = evaluateBoardSatisfaction(
      { ...directiveState, currentWeek: seasonLength - 3 },
      deterministicRng,
    );
    const atPressure = evaluateBoardSatisfaction(
      { ...directiveState, currentWeek: seasonLength - 2 },
      deterministicRng,
    );
    expect(atPressure.satisfactionLevel).toBeLessThanOrEqual(
      beforePressure.satisfactionLevel - 9,
    );

    const reaction = generateBoardReaction(state, deterministicRng);
    expect(reaction?.updatedProfile).toMatchObject({
      ultimatumDeadlineSeason: 2,
      ultimatumDeadline: 5,
    });
    const meeting = processBoardMeeting(
      { ...state, boardProfile: reaction?.updatedProfile } as GameState,
      deterministicRng,
    );
    expect(meeting?.updatedProfile).toMatchObject({
      ultimatumDeadlineSeason: 2,
      ultimatumDeadline: 5,
    });
  });

  it("preserves normalized dates through save/reload and idempotent migration", () => {
    const legacyFinances = {
      ...emptyFinances(),
      reportListings: [{
        id: "legacy-listing",
        reportId: "report",
        price: 500,
        isExclusive: false,
        status: "active" as const,
        listedWeek: seasonLength - 1,
        listedSeason: 1,
      }],
    } as unknown as FinancialRecord;
    const migrated = migrateReportListingBids(legacyFinances, seasonLength);
    const reloaded = JSON.parse(JSON.stringify(migrated)) as FinancialRecord;
    const migratedAgain = migrateReportListingBids(reloaded, seasonLength);

    expect(migratedAgain).toEqual(migrated);
    expect(migratedAgain.reportListings[0]).toMatchObject({
      biddingEndsSeason: 2,
      biddingEndsWeek: 1,
    });
  });
});
