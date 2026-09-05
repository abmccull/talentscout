import { describe, expect, it } from "vitest";
import type {
  AlumniRecord,
  InboxMessage,
  Observation,
  PlacementReport,
  Scout,
  UnsignedYouth,
} from "@/engine/core/types";
import {
  collectYouthCasePlayerIds,
  findYouthCaseWatchDay,
  shouldShowYouthInboxMessage,
} from "@/engine/youth/youthCaseFocus";
import {
  listYouthCases,
  buildYouthCaseListItem,
  rivalHeatFromYouth,
} from "@/engine/youth/youthCaseList";
import {
  buildYouthDeskStakes,
  shouldShowYouthDeskStakes,
} from "@/engine/youth/youthDeskStakes";
import {
  deriveYouthSeasonCaseReview,
  formatYouthSeasonReviewBody,
} from "@/engine/youth/youthSeasonReview";

function scout(overrides: Partial<Scout> = {}): Scout {
  return {
    id: "scout-1",
    firstName: "Casey",
    lastName: "Reader",
    reputation: 18,
    ...overrides,
  } as Scout;
}

function youth(id: string, playerId: string, overrides: Partial<UnsignedYouth> = {}): UnsignedYouth {
  return {
    id,
    buzzLevel: 40,
    visibility: 30,
    discoveredBy: ["scout-1"],
    retired: false,
    player: {
      id: playerId,
      firstName: "Milo",
      lastName: "Hart",
      age: 16,
      position: "ST",
    },
    ...overrides,
  } as UnsignedYouth;
}

function observation(playerId: string): Observation {
  return {
    id: `obs-${playerId}`,
    playerId,
    scoutId: "scout-1",
    week: 3,
    season: 1,
  } as Observation;
}

function inbox(partial: Partial<InboxMessage>): InboxMessage {
  return {
    id: "msg-1",
    week: 3,
    season: 1,
    type: "news",
    title: "Noise",
    body: "A random 19-year-old scored.",
    read: false,
    actionRequired: false,
    ...partial,
  };
}

describe("youth case loop", () => {
  it("uses the person's latest saved unknown and next test rather than another case or hidden ability", () => {
    const state = {
      observations: { o1: observation("p-1") }, reflectionJournal: {}, rivalActivities: [], currentWeek: 4, currentSeason: 2,
      reports: {
        old: { playerId: "p-1", submittedWeek: 38, submittedSeason: 1, evidenceAssessment: { unknowns: [{ statement: "Old question" }], nextTest: { label: "Old test" } } },
        current: { playerId: "p-1", submittedWeek: 3, submittedSeason: 2, evidenceAssessment: { unknowns: [{ statement: "Does the first touch survive pressure?" }], nextTest: { label: "Watch against a stronger midfield" } } },
        other: { playerId: "p-2", submittedWeek: 4, submittedSeason: 2, evidenceAssessment: { unknowns: [{ statement: "Someone else's question" }], nextTest: { label: "Someone else's test" } } },
      },
    } as unknown as Parameters<typeof buildYouthCaseListItem>[1];
    const subject = youth("y-1", "p-1");
    const item = buildYouthCaseListItem(subject, state);
    expect(item.questionLabel).toBe("Still to test");
    expect(item.openQuestion).toBe("Does the first touch survive pressure?");
    expect(item.nextTest).toBe("Watch against a stronger midfield");
    expect(buildYouthCaseListItem({ ...subject, player: { ...subject.player, potentialAbility: 199, currentAbility: 199 } }, state)).toEqual(item);
  });

  it("labels a saved witnessed note as evidence and does not call an unwatched person a second look", () => {
    const state = { observations: {}, reflectionJournal: {}, rivalActivities: [], currentWeek: 3, currentSeason: 1 };
    expect(buildYouthCaseListItem(youth("y-1", "p-1"), state).nextTest).toBe("Plan a first observation.");
    const item = buildYouthCaseListItem(youth("y-1", "p-1"), { ...state, observations: { o1: { ...observation("p-1"), notes: ["Turned away from the first challenge."] } } });
    expect(item.questionLabel).toBe("Latest evidence");
    expect(item.openQuestion).toBe("Turned away from the first challenge.");
  });
  it("collects opening, discovered, observed, placed, and alumni names", () => {
    const ids = collectYouthCasePlayerIds({
      scout: scout(),
      openingCase: { playerId: "p-open" } as never,
      unsignedYouth: {
        "y-1": youth("y-1", "p-1"),
      },
      observations: { o1: observation("p-obs") },
      reports: {},
      placementReports: {
        pl1: {
          id: "pl1",
          unsignedYouthId: "y-1",
          scoutId: "scout-1",
        } as PlacementReport,
      },
      alumniRecords: [{ playerId: "p-alum" } as AlumniRecord],
      discoveryRecords: [{ playerId: "p-found" }] as never,
    });

    expect([...ids]).toEqual(
      expect.arrayContaining(["p-open", "p-1", "y-1", "p-obs", "p-alum", "p-found"]),
    );
  });

  it("keeps action-required and case-linked mail, drops random breakthroughs", () => {
    const state = {
      scout: scout(),
      openingCase: { playerId: "p-1" } as never,
      unsignedYouth: { "y-1": youth("y-1", "p-1") },
      observations: {},
      reports: {},
      placementReports: {},
      alumniRecords: [],
      discoveryRecords: [],
      inbox: [],
    };

    expect(shouldShowYouthInboxMessage(state, inbox({ actionRequired: true }))).toBe(true);
    expect(shouldShowYouthInboxMessage(state, inbox({ id: "opening-choice:keep" }))).toBe(true);
    expect(shouldShowYouthInboxMessage(state, inbox({ relatedId: "p-1", relatedEntityType: "player" }))).toBe(true);
    expect(shouldShowYouthInboxMessage(state, inbox({ id: "review-s1", title: "Season 1" }))).toBe(true);
    expect(shouldShowYouthInboxMessage(state, inbox({ relatedId: "stranger-17" }))).toBe(false);
  });

  it("lands Advance Week on the booked case watch, not day 0", () => {
    expect(findYouthCaseWatchDay([
      { type: "rest" },
      { type: "networkMeeting" },
      { type: "followUpSession", targetId: "p-1" },
    ], ["p-1"])).toBe(2);
    expect(findYouthCaseWatchDay([{ type: "rest" }], ["p-1"])).toBe(0);
  });

  it("builds case cards with last look, question, next test, and rival heat", () => {
    const item = listYouthCases({
      scout: scout(),
      openingCase: undefined,
      unsignedYouth: { "y-1": youth("y-1", "p-1") },
      observations: { o1: observation("p-1") },
      reports: {},
      placementReports: {},
      alumniRecords: [],
      discoveryRecords: [],
      reflectionJournal: {
        j1: {
          id: "j1",
          sessionId: "s1",
          activityType: "followUpSession",
          week: 3,
          season: 1,
          playerIds: ["p-1"],
          notes: ["Does he travel?"],
          hypotheses: [{
            id: "h1",
            playerId: "p-1",
            text: "Does the first touch survive a better midfield?",
            domain: "technical",
            state: "open",
            createdAtWeek: 3,
          }],
          createdAt: 1,
        },
      },
      rivalActivities: [
        { rivalId: "r1", type: "spotted", playerId: "p-1", week: 2, season: 1 },
        { rivalId: "r1", type: "playerSigned", playerId: "p-1", week: 3, season: 1 },
      ],
      currentWeek: 3,
      currentSeason: 1,
    })[0];

    expect(item.lastLookLabel).toBe("Week 3, S1");
    expect(item.openQuestion).toContain("first touch");
    expect(item.nextTest).toContain("hypothesis");
    expect(item.rivalHeat).toBe("contested");
    expect(rivalHeatFromYouth(youth("y-1", "p-1"), [])).toBe("quiet");
  });

  it("keeps placed kids off the working list so Prospects stays open cases only", () => {
    const items = listYouthCases({
      scout: scout(),
      openingCase: undefined,
      unsignedYouth: {
        "y-open": youth("y-open", "p-open"),
        "y-placed": youth("y-placed", "p-placed", { placed: true }),
      },
      observations: {
        o1: observation("p-open"),
        o2: observation("p-placed"),
      },
      reports: {},
      placementReports: {},
      alumniRecords: [],
      discoveryRecords: [],
      reflectionJournal: {},
      rivalActivities: [],
      currentWeek: 4,
      currentSeason: 1,
    });

    expect(items.map((item) => item.playerId)).toEqual(["p-open"]);
  });

  it("puts alumni, file money, and reputation on the desk stakes model", () => {
    const stakes = buildYouthDeskStakes({
      scout: scout(),
      unsignedYouth: { "y-1": youth("y-1", "p-alum") },
      players: {},
      alumniRecords: [{
        id: "alumni_y-1",
        playerId: "p-alum",
        placedClubId: "club-1",
        currentClubId: "club-1",
        milestones: [{
          type: "firstTeamDebut",
          week: 20,
          season: 2,
          description: "Debuted for the first team.",
          notified: true,
        }],
        careerSnapshots: [],
        placedWeek: 10,
        placedSeason: 1,
        careerUpdates: [],
        currentStatus: "firstTeam",
        seasonStats: [],
        becameContact: false,
      }],
      placementReports: {
        pl1: {
          id: "pl1",
          unsignedYouthId: "y-1",
          scoutId: "scout-1",
          clubResponse: "pending",
        } as PlacementReport,
      },
      finances: {
        reportListings: [{
          id: "list-1",
          reportId: "rep-1",
          price: 2500,
          isExclusive: false,
          status: "active",
          listedWeek: 4,
          listedSeason: 1,
          bids: [],
          biddingEndsWeek: 6,
          biddingEndsSeason: 1,
        }],
        placementFeeRecords: [{
          id: "fee-1",
          playerId: "p-alum",
          clubId: "club-1",
          transferFee: 0,
          earnedFee: 4000,
          hasSellOnClause: false,
          sellOnPercentage: 0,
          week: 12,
          season: 1,
        }],
      } as never,
    });

    expect(shouldShowYouthDeskStakes(stakes)).toBe(true);
    expect(stakes.alumni[0]?.name).toBe("Milo Hart");
    expect(stakes.alumni[0]?.statusLabel).toBe("First team");
    expect(stakes.fileMoney.listed).toBe(2500);
    expect(stakes.fileMoney.paid).toBe(4000);
    expect(stakes.fileMoney.stillOut).toBe(1);
    expect(stakes.reputationLine).toContain("debuted");
  });

  it("writes season review in case language, not tab language", () => {
    const review = deriveYouthSeasonCaseReview({
      scout: scout(),
      openingCase: undefined,
      unsignedYouth: { "y-1": youth("y-1", "p-1") },
      observations: { o1: observation("p-1") },
      reports: {},
      placementReports: {},
      alumniRecords: [{
        id: "alumni_y-2",
        playerId: "p-alum",
        placedClubId: "club-1",
        currentClubId: "club-1",
        milestones: [],
        careerSnapshots: [],
        placedWeek: 8,
        placedSeason: 1,
        careerUpdates: [{
          week: 20,
          season: 1,
          type: "debut",
          description: "Debuted in the cup.",
        }],
        currentStatus: "firstTeam",
        seasonStats: [],
        becameContact: false,
      }],
      discoveryRecords: [],
      reflectionJournal: {},
      rivalActivities: [
        { rivalId: "r1", type: "reportSubmitted", playerId: "p-1", week: 4, season: 1 },
      ],
      currentWeek: 38,
      currentSeason: 1,
      players: {
        "p-alum": {
          id: "p-alum",
          firstName: "Jonah",
          lastName: "Pell",
        } as never,
      },
      finances: {
        reportListings: [],
        placementFeeRecords: [],
      } as never,
    }, 1);

    expect(review.headline).toContain("2 names");
    expect(review.caseLines.find((line) => line.playerId === "p-1")?.line).toContain("Milo Hart");
    expect(review.caseLines.find((line) => line.playerId === "p-alum")?.line).toContain("Placed");
    expect(review.rivalLine).toContain("contested");
    expect(review.alumniLine).toContain("Jonah Pell");
    expect(formatYouthSeasonReviewBody(review)).toContain("This file:");
    expect(formatYouthSeasonReviewBody(review)).not.toMatch(/skill tree|command center|tabs/i);
  });

  it("does not let last season's looks inflate this season's review", () => {
    const review = deriveYouthSeasonCaseReview({
      scout: scout(),
      openingCase: undefined,
      unsignedYouth: {
        "y-old": youth("y-old", "p-old", {
          player: { id: "p-old", firstName: "Old", lastName: "Name", age: 17, position: "CM" },
        } as never),
        "y-now": youth("y-now", "p-1"),
      },
      observations: {
        old: { ...observation("p-old"), season: 1, week: 10 },
        now: { ...observation("p-1"), season: 2, week: 3 },
      },
      reports: {},
      placementReports: {},
      alumniRecords: [],
      discoveryRecords: [],
      reflectionJournal: {},
      rivalActivities: [],
      currentWeek: 8,
      currentSeason: 2,
      players: {},
      finances: { reportListings: [], placementFeeRecords: [] } as never,
    }, 2);

    expect(review.caseLines.map((line) => line.playerId)).toEqual(["p-1"]);
    expect(review.headline).toContain("1 name");
  });

  it("strips hidden ability numbers from desk alumni copy", () => {
    const stakes = buildYouthDeskStakes({
      scout: scout(),
      unsignedYouth: { "y-1": youth("y-1", "p-alum") },
      players: {},
      alumniRecords: [{
        id: "alumni_y-1",
        playerId: "p-alum",
        placedClubId: "club-1",
        currentClubId: "club-1",
        milestones: [{
          type: "wonderkidStatus",
          week: 12,
          season: 2,
          description: "Recognised as a wonderkid — potential of 168 with current ability already at 112.",
          notified: true,
        }],
        careerSnapshots: [],
        placedWeek: 4,
        placedSeason: 1,
        careerUpdates: [],
        currentStatus: "firstTeam",
        seasonStats: [],
        becameContact: false,
      }],
      placementReports: {},
      finances: { reportListings: [], placementFeeRecords: [] } as never,
    });

    expect(stakes.alumni[0]?.lastLine).toContain("wonderkid");
    expect(stakes.alumni[0]?.lastLine).not.toMatch(/168|112|potential of|current ability/i);
  });
});
