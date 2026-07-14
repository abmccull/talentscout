import { describe, expect, it } from "vitest";
import type { InboxMessage, NarrativeEvent } from "@/engine/core/types";
import { clearTerminalNarrativeInboxActions } from "@/stores/actions/narrativeInboxState";
import { getNarrativeRetentionAge } from "@/stores/actions/weeklyActions";

function narrativeEvent(
  id: string,
  overrides: Partial<NarrativeEvent> = {},
): NarrativeEvent {
  return {
    id,
    type: "exclusiveTip",
    week: 1,
    season: 2,
    title: "Decision",
    description: "A persistent decision.",
    relatedIds: [],
    acknowledged: false,
    choices: [
      { label: "Act", effect: "investigate" },
      { label: "Wait", effect: "ignore" },
    ],
    ...overrides,
  };
}

function narrativeMessage(
  id: string,
  relatedId: string,
  overrides: Partial<InboxMessage> = {},
): InboxMessage {
  return {
    id,
    week: 1,
    season: 2,
    type: "event",
    title: "Decision required",
    body: "Choose a response.",
    read: false,
    actionRequired: true,
    relatedId,
    relatedEntityType: "narrative",
    ...overrides,
  };
}

describe("weekly maintenance integrity", () => {
  it("computes the narrative retention boundary in constant time", () => {
    const current = { season: 3, week: 5 };

    expect(getNarrativeRetentionAge(
      { season: 3, week: 1 },
      current,
      46,
    )).toBe(4);
    expect(getNarrativeRetentionAge(
      { season: 2, week: 42 },
      current,
      46,
    )).toBe(9);
    expect(getNarrativeRetentionAge(
      { season: 2, week: 41 },
      current,
      46,
    )).toBe(10);
    expect(getNarrativeRetentionAge(
      { season: 1, week: 46 },
      current,
      46,
    )).toBe(Number.POSITIVE_INFINITY);
    expect(getNarrativeRetentionAge(
      { season: 4, week: 1 },
      current,
      46,
    )).toBe(Number.NEGATIVE_INFINITY);
  });

  it("unpins resolved and orphaned narrative actions without hiding messages", () => {
    const unresolved = narrativeEvent("unresolved");
    const selected = narrativeEvent("selected", { selectedChoice: 0 });
    const acknowledged = narrativeEvent("acknowledged", { acknowledged: true });
    const messages = [
      narrativeMessage("unresolved-message", unresolved.id),
      narrativeMessage("selected-message", selected.id),
      narrativeMessage("acknowledged-message", acknowledged.id, { read: true }),
      narrativeMessage("orphaned-message", "missing"),
      narrativeMessage("unrelated-message", selected.id, {
        relatedEntityType: "player",
      }),
    ];

    const repaired = clearTerminalNarrativeInboxActions(
      messages,
      [unresolved, selected, acknowledged],
    );

    expect(repaired[0]).toBe(messages[0]);
    expect(repaired[0].actionRequired).toBe(true);
    expect(repaired[1]).toMatchObject({ actionRequired: false, read: false });
    expect(repaired[2]).toMatchObject({ actionRequired: false, read: true });
    expect(repaired[3]).toMatchObject({ actionRequired: false, read: false });
    expect(repaired[4]).toBe(messages[4]);
  });

  it("preserves array identity when no narrative action needs repair", () => {
    const unresolved = narrativeEvent("unresolved");
    const messages = [narrativeMessage("message", unresolved.id)];

    expect(clearTerminalNarrativeInboxActions(messages, [unresolved])).toBe(messages);
  });
});
