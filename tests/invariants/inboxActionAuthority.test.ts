import { describe, expect, it } from "vitest";
import type { GameState, InboxMessage } from "@/engine/core/types";
import { reconcileInboxActionRequirements } from "@/engine/world/inboxActionAuthority";

function message(id: string, relatedId: string): InboxMessage {
  return {
    id,
    week: 2,
    season: 2,
    type: "jobOffer",
    title: "Decision needed",
    body: "Choose before the deadline.",
    read: false,
    actionRequired: true,
    relatedId,
    relatedEntityType: "jobOffer",
  };
}

describe("inbox action authority", () => {
  it("keeps live actions pinned and demotes expired references", () => {
    const active = message("active-message", "active-offer");
    const expired = message("expired-message", "missing-offer");
    const state = {
      currentSeason: 2,
      currentWeek: 5,
      fixtures: {},
      inbox: [active, expired],
      jobOffers: [{ id: "active-offer" }],
    } as unknown as GameState;

    const reconciled = reconcileInboxActionRequirements(state);

    expect(reconciled.find((item) => item.id === active.id)?.actionRequired).toBe(true);
    expect(reconciled.find((item) => item.id === expired.id)?.actionRequired).toBe(false);
  });

  it("bounds an unknown legacy action after its grace period", () => {
    const legacy = {
      ...message("legacy", "player-1"),
      type: "warning" as const,
      relatedEntityType: "player" as const,
      season: 1,
      week: 1,
    };
    const state = {
      currentSeason: 3,
      currentWeek: 5,
      fixtures: {},
      inbox: [legacy],
      jobOffers: [],
    } as unknown as GameState;

    expect(reconcileInboxActionRequirements(state)[0].actionRequired).toBe(false);
  });
});
