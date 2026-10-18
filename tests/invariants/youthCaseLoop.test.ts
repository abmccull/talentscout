import { describe, expect, it } from "vitest";
import type {
  AlumniRecord,
  InboxMessage,
  Observation,
  PlacementReport,
  ReflectionJournalEntry,
  Scout,
  UnsignedYouth,
} from "@/engine/core/types";
import {
  collectYouthCasePlayerIds,
  findYouthCaseWatchDay,
  shouldShowYouthInboxMessage,
} from "@/engine/youth/youthCaseFocus";
import {
  buildYouthCaseListItem,
  listYouthCases,
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
    context: "followUpSession",
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
  it("keeps unanswered hypotheses across later visits and respects their latest resolution", () => {
    const question = { id: "h-1", playerId: "p-1", text: "Does his movement work against a deeper defence?",
      domain: "tactical" as const, state: "open" as const, createdAtWeek: 2 };
    const first: ReflectionJournalEntry = { id: "first", sessionId: "first", activityType: "followUpSession",
      week: 2, season: 1, playerIds: ["p-1"], notes: [], hypotheses: [question], createdAt: 10 };
    const later: ReflectionJournalEntry = { ...first, id: "later", sessionId: "later", week: 3,
      hypotheses: [], scoutingQuestionId: "decisions", createdAt: 20 };
    const state = { scout: scout(), currentWeek: 4, currentSeason: 1, rivalActivities: [],
      observations: { live: observation("p-1") }, reflectionJournal: { later, first } };
    const item = buildYouthCaseListItem(youth("y-1", "p-1"), state);
    expect(item.openQuestion).toBe(question.text);
    expect(item.nextTest).toBe("Test that hypothesis in a new context.");
    for (const resolution of ["confirmed", "debunked"] as const) {
      const resolved = { ...later, id: "resolution", createdAt: 21, hypotheses: [{ ...question, state: resolution }] };
      const closed = buildYouthCaseListItem(youth("y-1", "p-1"), { ...state,
        reflectionJournal: { resolved, later, first } });
      expect(closed.openQuestion).toBe("How quickly does the player read danger?");
      expect(closed.nextTest).toContain("second look");
    }
    const future = { ...later, id: "future", week: 5, hypotheses: [{ ...question, state: "confirmed" as const }] };
    expect(buildYouthCaseListItem(youth("y-1", "p-1"), { ...state,
      reflectionJournal: { ...state.reflectionJournal, future } }).openQuestion).toBe(question.text);
    expect(state.reflectionJournal.first.hypotheses[0].state).toBe("open");
  });

  it("keeps a private pass on the case list without reviving its earlier next-test prompt", () => {
    const pass = {
      id: "pass-p1", playerId: "p-1", scoutId: "scout-1", submittedWeek: 3, submittedSeason: 1,
      recommendedAction: "pass", summary: "The first look did not justify another allocation of attention.",
      decisionReceipt: { id: "scouting_decision_pass-p1", action: "pass", week: 3, season: 1, conviction: "note",
        evidenceObservationIds: ["obs-p-1"], evidenceCardIds: [],
        summary: "The first look did not justify another allocation of attention." },
      evidenceObservationIds: ["obs-p-1"],
      evidenceAssessment: { recommendation: "pass", unknowns: [{ statement: "Pressure response remains uncertain." }], nextTest: { label: "Book another look" } },
    };
    const state = {
      scout: scout(), unsignedYouth: { "y-1": youth("y-1", "p-1") },
      observations: { old: observation("p-1") }, reports: { pass },
      reflectionJournal: {}, rivalActivities: [], currentWeek: 3, currentSeason: 1,
      placementReports: {}, alumniRecords: [], discoveryRecords: [],
    } as unknown as Parameters<typeof listYouthCases>[0];
    const item = listYouthCases(state)[0];
    expect(item.playerId).toBe("p-1");
    expect(item.questionLabel).toBe("Passed for now");
    expect(item.openQuestion).toContain(pass.summary);
    expect(item.nextTest).toBe("No next look planned; spend attention elsewhere.");
    const seasonReview = deriveYouthSeasonCaseReview({ ...state, players: {}, finances: undefined }, 1);
    expect(seasonReview.caseLines[0].line).toContain("Passed for now.");
    expect(seasonReview.caseLines[0].line).toContain(pass.summary);
    expect(state.reports.pass).toBe(pass);
    // Reopening the journal later is not new first-hand evidence.
    expect(buildYouthCaseListItem(youth("y-1", "p-1"), { ...state, currentWeek: 5 }).nextTest).toBe(item.nextTest);
    const fresh = { ...observation("p-1"), id: "new-same-week-evidence" };
    const changed = buildYouthCaseListItem(youth("y-1", "p-1"), { ...state, observations: { ...state.observations, fresh } });
    expect(changed.questionLabel).toBe("Reconsideration available");
    expect(changed.nextTest).toBe("Optional: reconsider this pass against the new first-hand evidence.");
    expect(changed.openQuestion).toContain(pass.summary);
    const otherScout = { ...fresh, scoutId: "scout-2" };
    expect(buildYouthCaseListItem(youth("y-1", "p-1"), { ...state, observations: { ...state.observations, otherScout } }).nextTest).toBe(item.nextTest);
  });

  it("honors a latest private receipt without structured assessment and restores normal prompts after a fresh-evidence revision", () => {
    const pass = { id: "pass", playerId: "p-1", scoutId: "scout-1", submittedWeek: 3, submittedSeason: 1,
      recommendedAction: "pass", summary: "No next look planned.",
      decisionReceipt: { id: "scouting_decision_pass", action: "pass", week: 3, season: 1, conviction: "note",
        evidenceObservationIds: ["obs-p-1"], evidenceCardIds: [], summary: "No next look planned." },
      revision: 1, evidenceObservationIds: ["obs-p-1"] };
    const state = { scout: scout(), observations: { old: observation("p-1") }, reflectionJournal: {}, rivalActivities: [], currentWeek: 3, currentSeason: 1,
      reports: { pass } } as unknown as Parameters<typeof buildYouthCaseListItem>[1];
    expect(buildYouthCaseListItem(youth("y-1", "p-1"), state).questionLabel).toBe("Passed for now");
    const revision = { ...pass, id: "reconsidered", revision: 2, recommendedAction: "monitor",
      decisionReceipt: { id: "scouting_decision_reconsidered", action: "monitor", week: 3, season: 1, conviction: "recommend",
        evidenceObservationIds: ["obs-p-1", "fresh-look"], evidenceCardIds: [], summary: "Improved in a fresh context." },
      evidenceObservationIds: ["obs-p-1", "fresh-look"],
      evidenceAssessment: { unknowns: [{ statement: "Does the improvement persist?" }], nextTest: { label: "Watch against stronger opponents" } } };
    const revisedState = { ...state, observations: { ...state.observations, fresh: { ...observation("p-1"), id: "fresh-look" } }, reports: { ...state.reports, revision } } as unknown as Parameters<typeof buildYouthCaseListItem>[1];
    const item = buildYouthCaseListItem(youth("y-1", "p-1"), revisedState);
    expect(item.questionLabel).toBe("Still to test");
    expect(item.nextTest).toBe("Watch against stronger opponents");
  });

  it("does not rewrite a receipt-less historical professional pass as a private decision", () => {
    const legacy = { id: "legacy", playerId: "p-1", scoutId: "scout-1", submittedWeek: 3, submittedSeason: 1,
      recommendedAction: "pass", evidenceObservationIds: ["obs-p-1"],
      evidenceAssessment: { unknowns: [{ statement: "Does the improvement persist?" }], nextTest: { label: "Watch against stronger opponents" } } };
    const state = { scout: scout(), observations: { old: observation("p-1") }, reflectionJournal: {}, rivalActivities: [], currentWeek: 3, currentSeason: 1,
      reports: { legacy } } as unknown as Parameters<typeof buildYouthCaseListItem>[1];
    const before = JSON.stringify(state);
    const item = buildYouthCaseListItem(youth("y-1", "p-1"), state);
    expect(item.questionLabel).toBe("Still to test");
    expect(item.openQuestion).toBe("Does the improvement persist?");
    expect(item.nextTest).toBe("Watch against stronger opponents");
    expect(state.reports!.legacy.decisionReceipt).toBeUndefined();
    expect(JSON.stringify(state)).toBe(before);
  });

  it("uses the person's latest saved unknown and next test rather than another case or hidden ability", () => {
    const state = {
      scout: scout(), observations: { o1: observation("p-1") }, reflectionJournal: {}, rivalActivities: [], currentWeek: 4, currentSeason: 2,
      reports: {
        old: { id: "old", scoutId: "scout-1", playerId: "p-1", submittedWeek: 38, submittedSeason: 1, evidenceAssessment: { unknowns: [{ statement: "Old question" }], nextTest: { label: "Old test" } } },
        current: { id: "current", scoutId: "scout-1", playerId: "p-1", submittedWeek: 3, submittedSeason: 2, evidenceAssessment: { unknowns: [{ statement: "Does the first touch survive pressure?" }], nextTest: { label: "Watch against a stronger midfield" } } },
        other: { id: "other", scoutId: "scout-1", playerId: "p-2", submittedWeek: 4, submittedSeason: 2, evidenceAssessment: { unknowns: [{ statement: "Someone else's question" }], nextTest: { label: "Someone else's test" } } },
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
    const state = { scout: scout(), observations: {}, reflectionJournal: {}, rivalActivities: [], currentWeek: 3, currentSeason: 1 };
    expect(buildYouthCaseListItem(youth("y-1", "p-1"), state).nextTest).toBe("Arrange a first live observation before judging the player.");
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

  it("counts distinct current-scout live looks and keeps the authored question instead of private notes", () => {
    const live = { ...observation("p-1"), sourceSessionId: "live-session" };
    const state = {
      scout: scout(), currentWeek: 4, currentSeason: 1, rivalActivities: [],
      observations: {
        live,
        replay: { ...live, id: "replay" },
        video: { ...live, id: "video", sourceSessionId: "video", context: "videoAnalysis" as const },
        meeting: { ...live, id: "meeting", sourceSessionId: "meeting", context: "parentCoachMeeting" as const },
        otherScout: { ...live, id: "other", sourceSessionId: "other", scoutId: "other" },
        future: { ...live, id: "future", sourceSessionId: "future", week: 8 },
      },
      reflectionJournal: { journal: {
        id: "journal", sessionId: "live-session", activityType: "followUpSession" as const,
        season: 1, week: 3, playerIds: ["p-1"], notes: ["Private speculation"],
        hypotheses: [], scoutingQuestionId: "decisions" as const, createdAt: 1,
      } },
    };
    const item = buildYouthCaseListItem(youth("y-1", "p-1"), state);
    expect(item.observationCount).toBe(1);
    expect(item.lastLookLabel).toBe("Week 3, S1");
    expect(item.openQuestion).toBe("How quickly does the player read danger?");
    expect(item.nextTest).toContain("second look");
    const repeated = buildYouthCaseListItem(youth("y-1", "p-1"), { ...state,
      observations: { ...state.observations, next: { ...live, id: "next", sourceSessionId: "next", week: 4 } },
    });
    expect(repeated.observationCount).toBe(2);
    expect(repeated.nextTest).toContain("different opposition or a different role");
    const unseen = buildYouthCaseListItem(youth("y-1", "p-1"), { ...state,
      observations: { video: state.observations.video, meeting: state.observations.meeting },
    });
    expect(unseen.observationCount).toBe(0);
    expect(unseen.lastLookLabel).toBe("No look yet");
    expect(unseen.nextTest).toContain("first live observation");
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
          sourceId: "fixture-s2-w20-p-alum-debut",
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
