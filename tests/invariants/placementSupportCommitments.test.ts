import { describe, expect, it } from "vitest";
import type { GameState, Observation, PlacementReport } from "@/engine/core/types";
import { applyPlacementSupportCommitments, createPlacementSupportCommitment, scorePlacementSupport } from "@/engine/youth/placementSupport";

function state(): GameState {
  return {
    currentWeek: 38, currentSeason: 1, fixtures: {}, observations: {},
    scout: { id: "scout", reputation: 50 },
    players: { player: { id: "player", firstName: "Alex", lastName: "Youth" } },
    clubs: { club: { id: "club", name: "Academy" } },
    contacts: { coach: { id: "coach", organization: "Academy", relationship: 50 } },
    reports: {}, scoutingCases: {}, inbox: [],
    placementReports: {
      placement: { id: "placement", scoutId: "scout", unsignedYouthId: "youth", targetClubId: "club", clubResponse: "accepted", supportCondition: "familySupport",
        supportCommitment: createPlacementSupportCommitment("familySupport", "player", { week: 37, season: 1 }, 38),
      } as PlacementReport,
    },
  } as unknown as GameState;
}
function observation(id: string, playerId: string, week: number, season = 1, context: Observation["context"] = "parentCoachMeeting"): Observation {
  return { id, playerId, scoutId: "scout", activityInstanceId: `activity:${id}`, week, season, context } as Observation;
}
describe("placement support accountability", () => {
  it("does not create retrospective promises on legacy accepted placements", () => {
    const initial = state();
    delete initial.placementReports.placement.supportCommitment;
    expect(applyPlacementSupportCommitments(initial)).toBe(initial);
  });
  it("only awards support scoring when both need and relevant evidence are present", () => {
    expect(scorePlacementSupport("none", [], 80)).toBe(0);
    expect(scorePlacementSupport("familySupport", [], 80)).toBeLessThan(0);
    expect(scorePlacementSupport("familySupport", [observation("o", "player", 1)], 80)).toBeGreaterThan(0);
    expect(scorePlacementSupport("familySupport", [observation("o", "player", 1)], 0)).toBeLessThanOrEqual(0);
    expect(scorePlacementSupport("playingPathway", [observation("o", "player", 1)], 80)).toBeLessThan(0);
  });
  it("ignores unrelated, pre-placement, wrong-context, and late records", () => {
    const initial = state();
    initial.observations = {
      unrelated: observation("unrelated", "other", 38),
      old: observation("old", "player", 36),
      wrong: observation("wrong", "player", 38, 1, "followUpSession"),
      future: observation("future", "player", 8, 2),
    };
    const next = applyPlacementSupportCommitments(initial);
    expect(next.placementReports.placement.supportCommitment?.status).toBe("open");
    expect(next.scout.reputation).toBe(50);
  });
  it("fulfills on executed evidence through the deadline and applies its reward exactly once", () => {
    const initial = state();
    initial.currentWeek = 6; initial.currentSeason = 2;
    initial.observations.valid = observation("valid", "player", 5, 2);
    const next = applyPlacementSupportCommitments(initial);
    expect(next.placementReports.placement.supportCommitment).toMatchObject({ status: "fulfilled", evidenceId: "valid" });
    expect(next.scout.reputation).toBe(51);
    expect(next.contacts.coach.relationship).toBe(53);
    expect(applyPlacementSupportCommitments(JSON.parse(JSON.stringify(next)) as GameState)).toEqual(next);
  });
  it("misses only after the full deadline week and never repeats the consequence", () => {
    const initial = state();
    initial.currentWeek = 5; initial.currentSeason = 2;
    const due = applyPlacementSupportCommitments(initial);
    expect(due.placementReports.placement.supportCommitment?.status).toBe("open");
    const late = applyPlacementSupportCommitments({ ...due, currentWeek: 6 });
    expect(late.placementReports.placement.supportCommitment?.status).toBe("missed");
    expect(late.scout.reputation).toBe(48);
    expect(late.contacts.coach.relationship).toBe(42);
    expect(applyPlacementSupportCommitments(late)).toBe(late);
  });
  it("does not activate a condition on a rejected placement", () => {
    const initial = state();
    initial.currentWeek = 10; initial.currentSeason = 2;
    initial.placementReports.placement.clubResponse = "rejected";
    expect(applyPlacementSupportCommitments(initial)).toBe(initial);
  });

  it("counts a newly executed review in the acceptance week after save and reload", () => {
    const initial = state();
    initial.currentWeek = 37;
    const existing = observation("before-acceptance", "player", 37);
    initial.placementReports.placement.supportCommitment = createPlacementSupportCommitment(
      "familySupport", "player", { week: 37, season: 1 }, 38, [existing],
    );
    initial.observations[existing.id] = existing;
    const reloaded = JSON.parse(JSON.stringify(initial)) as GameState;
    reloaded.observations.after = observation("after-acceptance", "player", 37);
    const fulfilled = applyPlacementSupportCommitments(reloaded);
    expect(fulfilled.placementReports.placement.supportCommitment).toMatchObject({
      status: "fulfilled", evidenceId: "after-acceptance", preAcceptanceObservationIds: ["before-acceptance"],
    });
    expect(fulfilled.scout.reputation).toBe(51);
    expect(applyPlacementSupportCommitments(fulfilled)).toBe(fulfilled);
  });

  it("excludes evidence already present at acceptance while retaining a bounded relevant snapshot", () => {
    const initial = state();
    initial.currentWeek = 37;
    const prior = observation("before-acceptance", "player", 37);
    initial.placementReports.placement.supportCommitment = createPlacementSupportCommitment(
      "familySupport", "player", { week: 37, season: 1 }, 38, [
        prior, observation("older", "player", 36), observation("other-player", "other", 37),
        observation("other-context", "player", 37, 1, "followUpSession"),
      ],
    );
    expect(initial.placementReports.placement.supportCommitment?.preAcceptanceObservationIds).toEqual([prior.id]);
    initial.observations[prior.id] = prior;
    expect(applyPlacementSupportCommitments(initial)).toBe(initial);
  });

  it("keeps conservative same-week behavior for old promises lacking chronology", () => {
    const initial = state();
    initial.currentWeek = 37;
    expect(initial.placementReports.placement.supportCommitment?.preAcceptanceObservationIds).toBeUndefined();
    initial.observations.unknownOrder = observation("unknown-order", "player", 37);
    expect(applyPlacementSupportCommitments(initial)).toBe(initial);
    initial.currentWeek = 38;
    initial.observations.later = observation("later-week", "player", 38);
    expect(applyPlacementSupportCommitments(initial).placementReports.placement.supportCommitment)
      .toMatchObject({ status: "fulfilled", evidenceId: "later-week" });
  });

  it("requires execution attribution even when a same-week review has a new ID", () => {
    const initial = state();
    initial.currentWeek = 37;
    initial.placementReports.placement.supportCommitment = createPlacementSupportCommitment(
      "familySupport", "player", { week: 37, season: 1 }, 38, [],
    );
    initial.observations.unattributed = { ...observation("unattributed", "player", 37), activityInstanceId: undefined };
    expect(applyPlacementSupportCommitments(initial)).toBe(initial);
    initial.observations.unattributed.sourceSessionId = "finished-session";
    expect(applyPlacementSupportCommitments(initial).placementReports.placement.supportCommitment?.status).toBe("fulfilled");
  });

  it("shows the completed action and date while retaining the evidence ID only in state", () => {
    const initial = state();
    initial.observations.valid = observation("internal-record-identifier", "player", 38);
    const fulfilled = applyPlacementSupportCommitments(initial);
    expect(fulfilled.placementReports.placement.supportCommitment?.evidenceId).toBe("internal-record-identifier");
    expect(fulfilled.inbox.at(-1)?.body).toContain("parent/coach meeting");
    expect(fulfilled.inbox.at(-1)?.body).toContain("season 1, week 38");
    expect(fulfilled.inbox.at(-1)?.body).not.toContain("internal-record-identifier");
  });
});
