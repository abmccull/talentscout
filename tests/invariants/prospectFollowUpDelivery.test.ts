// Failure contracts were drafted in delivery-authority/helper-edge-test-draft.md
// before implementation. The behavioral eviction baseline uses existing exports.
import { describe, expect, it } from "vitest";
import type { GameState, ScoutingCase } from "@/engine/core/types";
import {
  InvalidProspectFollowUpDeliveryError,
  prospectFollowUpMessageId,
  reconcileProspectFollowUpDeliveries,
  recordProspectFollowUpDelivery,
} from "@/engine/youth/prospectFollowUpDelivery";

const caseId = "case:1";
const sourceId = "decision:1";
const receipt = {
  sourceId, stage: "early-check" as const, deliveredWeek: 3, deliveredSeason: 1,
};

function legacyState(): GameState {
  return {
    scoutingCases: {
      [caseId]: {
        id: caseId, scoutId: "scout", playerId: "player", status: "placed",
        openedWeek: 1, openedSeason: 1, lastUpdatedWeek: 1, lastUpdatedSeason: 1,
        reportIds: [], listingIds: [], deliveryIds: [], decisionIds: [sourceId],
        placementReportIds: [],
      },
    },
    clubDecisions: {
      [sourceId]: { id: sourceId, caseId, outcome: "accepted" },
    },
    reports: {},
    inbox: [],
  } as unknown as GameState;
}

function addMessage(state: GameState, stage: "early-check" | "decision-point" | "accountability") {
  state.inbox.push({
    id: prospectFollowUpMessageId(caseId, sourceId, stage),
    week: stage === "accountability" ? 19 : 3, season: 1,
    type: "feedback", title: "Authored update", body: "Preserve this body",
    actionRequired: false, read: true,
  });
}

describe("prospect follow-up delivery authority", () => {
  it("uses complete IDs with separators and preserves the first actual delivery date and extension data", () => {
    const state = legacyState();
    addMessage(state, "early-check");
    const original = structuredClone(state);
    const cases = reconcileProspectFollowUpDeliveries(state);
    expect(cases[caseId].prospectFollowUpDeliveries).toEqual([receipt]);
    expect(state).toEqual(original);
    const recorded = {
      ...cases[caseId],
      prospectFollowUpDeliveries: [{ ...receipt, extension: { proof: "keep" } }],
    };
    expect(recordProspectFollowUpDelivery(recorded, { ...receipt, deliveredWeek: 7 }))
      .toBe(recorded);
    expect(recorded.prospectFollowUpDeliveries[0]).toMatchObject({
      deliveredWeek: 3, extension: { proof: "keep" },
    });
  });

  it("records later retained proof without inferring earlier stages or a professional opportunity", () => {
    const state = legacyState();
    addMessage(state, "accountability");
    state.inbox.push({ ...state.inbox[0], id: `prospect-follow-up:${caseId}:professional-lock` });
    expect(reconcileProspectFollowUpDeliveries(state)[caseId].prospectFollowUpDeliveries)
      .toEqual([{ sourceId, stage: "accountability", deliveredWeek: 19, deliveredSeason: 1 }]);
  });

  it("keeps already recorded orphan proof when source and inbox are absent", () => {
    const state = legacyState();
    state.clubDecisions = {};
    state.scoutingCases[caseId].prospectFollowUpDeliveries = [receipt];
    expect(reconcileProspectFollowUpDeliveries(state)).toBe(state.scoutingCases);
    expect(recordProspectFollowUpDelivery(state.scoutingCases[caseId], {
      ...receipt, sourceId: "new-anchor", deliveredWeek: 6,
    }).prospectFollowUpDeliveries).toEqual([
      receipt, { ...receipt, sourceId: "new-anchor", deliveredWeek: 6 },
    ]);
  });

  it("does not guess an owner when two known pairs share one full historical message ID", () => {
    const state = legacyState();
    const otherCaseId = "case";
    const otherSourceId = "1:decision:1";
    state.scoutingCases[otherCaseId] = {
      ...state.scoutingCases[caseId], id: otherCaseId, decisionIds: [otherSourceId],
    };
    state.clubDecisions[otherSourceId] = {
      ...state.clubDecisions[sourceId], id: otherSourceId, caseId: otherCaseId,
    };
    addMessage(state, "early-check");
    const cases = reconcileProspectFollowUpDeliveries(state);
    expect(cases[caseId].prospectFollowUpDeliveries).toEqual([]);
    expect(cases[otherCaseId].prospectFollowUpDeliveries).toEqual([]);
    expect(reconcileProspectFollowUpDeliveries({ ...state, scoutingCases: cases })).toBe(cases);
  });

  it("can backfill a newly reconstructed legacy case before its default empty authority becomes final", () => {
    const state = legacyState();
    state.scoutingCases[caseId].prospectFollowUpDeliveries = [];
    addMessage(state, "early-check");
    expect(reconcileProspectFollowUpDeliveries(state)).toBe(state.scoutingCases);
    expect(reconcileProspectFollowUpDeliveries(state, undefined, new Set([caseId]))[caseId]
      .prospectFollowUpDeliveries).toEqual([receipt]);
  });

  it.each([0, -1, 3.5, Number.POSITIVE_INFINITY])("ignores a retained witness with an invalid actual week %s", (week) => {
    const state = legacyState();
    addMessage(state, "early-check");
    state.inbox[0].week = week;
    expect(reconcileProspectFollowUpDeliveries(state)[caseId].prospectFollowUpDeliveries)
      .toEqual([]);
  });

  it.each([
    null,
    "invalid",
    [{ ...receipt, stage: "other" }],
    [{ ...receipt, deliveredSeason: 0 }],
    [{ ...receipt, sourceId: " " }],
    [receipt, { ...receipt, deliveredWeek: 5 }],
  ])("rejects malformed present authority without resetting it: %j", (bad) => {
    const state = legacyState();
    Object.assign(state.scoutingCases[caseId], { prospectFollowUpDeliveries: bad });
    const original = structuredClone(state);
    expect(() => reconcileProspectFollowUpDeliveries(state))
      .toThrow(InvalidProspectFollowUpDeliveryError);
    expect(state).toEqual(original);
  });
});
