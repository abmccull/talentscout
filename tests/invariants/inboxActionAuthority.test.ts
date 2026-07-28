import { describe, expect, it } from "vitest";
import type { GameState, InboxMessage } from "@/engine/core/types";
import type { DecisionRecord } from "@/engine/consequences/types";
import {
  reconcileInboxActionRequirements,
  selectActiveInboxNarrativeEvents,
  selectLiveInboxActionMessages,
  selectOfferedInboxCareerDecisions,
} from "@/engine/world/inboxActionAuthority";

function inboxMessage(
  id: string,
  overrides: Partial<InboxMessage> = {},
): InboxMessage {
  return {
    id,
    week: 2,
    season: 2,
    type: "jobOffer",
    title: "Decision needed",
    body: "Choose before the deadline.",
    read: false,
    actionRequired: true,
    relatedId: `${id}-related`,
    relatedEntityType: "jobOffer",
    ...overrides,
  };
}

function consequenceDecision(
  id: string,
  sourceKind: string,
  overrides: Partial<DecisionRecord> = {},
): DecisionRecord {
  return {
    id,
    source: { kind: sourceKind, id: `source-${id}` },
    offeredAt: { season: 2, week: 1 },
    deadlineAt: { season: 2, week: 4 },
    status: "offered",
    visibility: "private",
    stakeholders: [],
    options: [],
    outcomeRoll: 0.42,
    consequenceIds: [],
    ...overrides,
  } satisfies DecisionRecord;
}

function gameState(overrides: Partial<GameState> = {}): GameState {
  return {
    currentSeason: 2,
    currentWeek: 5,
    fixtures: {},
    inbox: [],
    jobOffers: [],
    narrativeEvents: [],
    consequenceState: {
      decisions: {},
      history: [],
    },
    ...overrides,
  } as unknown as GameState;
}

describe("inbox action authority", () => {
  it("keeps live actions pinned and demotes expired references", () => {
    const active = inboxMessage("active-message", { relatedId: "active-offer" });
    const expired = inboxMessage("expired-message", { relatedId: "missing-offer" });
    const state = gameState({
      inbox: [active, expired],
      jobOffers: [{ id: "active-offer" } as GameState["jobOffers"][number]],
    });

    const reconciled = reconcileInboxActionRequirements(state);

    expect(reconciled.find((item) => item.id === active.id)?.actionRequired).toBe(true);
    expect(reconciled.find((item) => item.id === expired.id)?.actionRequired).toBe(false);
  });

  it("bounds an unknown legacy action after its grace period", () => {
    const legacy = inboxMessage("legacy", {
      type: "warning",
      relatedId: "player-1",
      relatedEntityType: "player",
      season: 1,
      week: 1,
    });
    const state = gameState({
      currentSeason: 3,
      inbox: [legacy],
    });

    expect(reconcileInboxActionRequirements(state)[0].actionRequired).toBe(false);
  });

  it("selects only authoritative live inbox actions", () => {
    const liveAction = inboxMessage("live-action", { relatedId: "active-offer" });
    const staleAction = inboxMessage("stale-action", { relatedId: "missing-offer" });
    const unreadMail = inboxMessage("unread-mail", {
      type: "news",
      read: false,
      actionRequired: false,
      relatedId: undefined,
      relatedEntityType: undefined,
    });
    const state = gameState({
      inbox: [liveAction, staleAction, unreadMail],
      jobOffers: [{ id: "active-offer" } as GameState["jobOffers"][number]],
    });

    const liveMessages = selectLiveInboxActionMessages(state);

    expect(liveMessages.map((message) => message.id)).toEqual(["live-action"]);
  });

  it("keeps offered inbox career decisions on a stable source-kind and deadline order", () => {
    const state = gameState({
      consequenceState: {
        decisions: {
          zeta: consequenceDecision("zeta", "relationshipConflict", {
            deadlineAt: { season: 2, week: 6 },
          }),
          beta: consequenceDecision("beta", "worldConditionArc", {
            deadlineAt: { season: 2, week: 4 },
          }),
          alpha: consequenceDecision("alpha", "professionalCase", {
            deadlineAt: { season: 2, week: 4 },
          }),
          gamma: consequenceDecision("gamma", "agencyDilemma", {
            deadlineAt: { season: 2, week: 3 },
          }),
          resolved: consequenceDecision("resolved", "rivalCampaign", {
            status: "resolved",
            deadlineAt: { season: 2, week: 2 },
          }),
        },
        history: [],
      } as unknown as GameState["consequenceState"],
    });

    const decisions = selectOfferedInboxCareerDecisions(state);

    expect(decisions.map((decision) => decision.id)).toEqual(["alpha", "beta", "zeta"]);
    expect(decisions.map((decision) => decision.source.kind)).toEqual([
      "professionalCase",
      "worldConditionArc",
      "relationshipConflict",
    ]);
  });

  it("selects only unacknowledged inbox narrative events", () => {
    const state = gameState({
      narrativeEvents: [
        { id: "open-event", acknowledged: false, title: "Open" },
        { id: "closed-event", acknowledged: true, title: "Closed" },
      ] as unknown as GameState["narrativeEvents"],
    });

    const events = selectActiveInboxNarrativeEvents(state);

    expect(events.map((event) => event.id)).toEqual(["open-event"]);
  });

  it("does not mutate state while reconciling or selecting", () => {
    const staleAction = inboxMessage("stale-action", { relatedId: "missing-offer" });
    const openDecision = consequenceDecision("decision-a", "lateCareerDilemma");
    const state = gameState({
      inbox: [staleAction],
      consequenceState: {
        decisions: { "decision-a": openDecision },
        history: [],
      } as unknown as GameState["consequenceState"],
      narrativeEvents: [{ id: "event-a", acknowledged: false }] as unknown as GameState["narrativeEvents"],
    });
    const snapshot = JSON.stringify(state);

    reconcileInboxActionRequirements(state);
    selectLiveInboxActionMessages(state);
    selectOfferedInboxCareerDecisions(state);
    selectActiveInboxNarrativeEvents(state);

    expect(JSON.stringify(state)).toBe(snapshot);
    expect(state.inbox[0].actionRequired).toBe(true);
    expect(state.narrativeEvents[0]?.acknowledged).toBe(false);
    expect(state.consequenceState.decisions["decision-a"]).toBe(openDecision);
  });
});
