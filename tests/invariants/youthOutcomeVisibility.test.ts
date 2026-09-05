import { describe, expect, it } from "vitest";
import type { GameState, InboxMessage } from "@/engine/core/types";
import { shouldShowYouthInboxMessage } from "@/engine/youth/youthCaseFocus";
import { deriveYouthFileMoney } from "@/engine/youth/youthDeskStakes";
import { deriveYouthSeasonCaseReview } from "@/engine/youth/youthSeasonReview";

function career(): GameState {
  return {
    scout: { id: "scout", reputation: 20 },
    currentWeek: 38,
    currentSeason: 2,
    unsignedYouth: {}, players: {}, observations: {}, reports: {},
    placementReports: {}, alumniRecords: [], discoveryRecords: [],
    reflectionJournal: {}, rivalActivities: [], inbox: [],
    finances: { reportListings: [], placementFeeRecords: [], reportSalesRevenue: 0, placementFeeRevenue: 0 },
  } as unknown as GameState;
}

describe("Youth career outcome feedback", () => {
  it.each([
    ["consulting:contract:failed", "financial", "Consulting Deadline Missed"],
    ["retainer-renewal:contract:s2w38", "financial", "Retainer Not Renewed"],
    ["course_complete_38_technique", "event", "Course Completed"],
    ["first-sale-bonus", "financial", "First Sale Bonus"],
    ["expired-bid", "marketplaceBid", "Offer Expired"],
    ["assignment-complete", "assignment", "Assignment Complete"],
    ["career-era-beat-season-2", "news", "Your career is changing"],
  ] as const)("keeps resolved operational message %s visible", (id, type, title) => {
    const message: InboxMessage = { id, type, title, body: "Outcome", week: 38, season: 2, read: false, actionRequired: false };
    expect(shouldShowYouthInboxMessage(career(), message)).toBe(true);
    expect(shouldShowYouthInboxMessage(career(), { ...message, read: true })).toBe(true);
  });

  it("keeps unrelated ambient news out of the case inbox", () => {
    expect(shouldShowYouthInboxMessage(career(), {
      id: "news-other-player", type: "news", title: "A transfer elsewhere", body: "News",
      week: 38, season: 2, read: false, actionRequired: false, relatedId: "other-player",
    })).toBe(false);
  });

  it("reports settled revenue even when bids differ from asking prices or listings expire", () => {
    const state = career();
    state.finances!.reportSalesRevenue = 2150; // 650 exclusive + two nonexclusive sales of 750.
    state.finances!.placementFeeRevenue = 4000;
    state.finances!.reportListings = [
      { id: "exclusive", price: 500, status: "sold", isExclusive: true },
      { id: "nonexclusive", price: 800, status: "active", isExclusive: false },
      { id: "expired", price: 900, status: "expired", isExclusive: false },
    ] as NonNullable<GameState["finances"]>["reportListings"];
    expect(deriveYouthFileMoney(state)).toMatchObject({ paid: 6150, listed: 800, stillOut: 0 });
    // Listing status is inventory, not payment history.
    state.finances!.reportListings[1].status = "withdrawn";
    expect(deriveYouthFileMoney(state).paid).toBe(6150);
  });

  it("retains the only successfully placed prospect after removal from the unsigned pool", () => {
    const state = career();
    state.players = { prospect: { id: "prospect", firstName: "Milo", lastName: "Hart" } } as unknown as GameState["players"];
    state.observations = { look: { playerId: "prospect", scoutId: "scout", season: 2, week: 4 } } as unknown as GameState["observations"];
    state.alumniRecords = [{ playerId: "prospect", placedSeason: 2, placedWeek: 9, milestones: [], careerUpdates: [] }] as unknown as GameState["alumniRecords"];
    const review = deriveYouthSeasonCaseReview(state, 2);
    expect(review.headline).toContain("1 name");
    expect(review.caseLines).toEqual([{ playerId: "prospect", name: "Milo Hart", line: "Milo Hart: Placed with an academy in Week 9." }]);
    expect(review.moneyLine).toMatch(/^Career totals:/);
  });

  it("counts all seasonal names while showing a bounded list, without counting old work", () => {
    const state = career();
    state.reports = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i), {
      playerId: `p${i}`, scoutId: "scout", submittedSeason: i === 7 ? 1 : 2,
    }])) as GameState["reports"];
    const review = deriveYouthSeasonCaseReview(state, 2);
    expect(review.headline).toContain("7 names");
    expect(review.caseLines).toHaveLength(6);
    expect(review.caseLines.some((line) => line.playerId === "p7")).toBe(false);
  });
});
