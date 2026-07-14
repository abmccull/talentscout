import type { InboxMessage, NarrativeEvent } from "@/engine/core/types";

/**
 * Clear inbox action pins whose narrative decision is already terminal or no
 * longer exists. Read state is intentionally preserved so resolved stories
 * remain visible until normal inbox retention removes them.
 */
export function clearTerminalNarrativeInboxActions(
  inbox: InboxMessage[],
  narrativeEvents: NarrativeEvent[],
): InboxMessage[] {
  const eventById = new Map(narrativeEvents.map((event) => [event.id, event]));
  let changed = false;
  const repaired = inbox.map((message) => {
    if (
      !message.actionRequired
      || message.relatedEntityType !== "narrative"
      || !message.relatedId
    ) {
      return message;
    }

    const event = eventById.get(message.relatedId);
    const terminal = !event
      || event.selectedChoice !== undefined
      || event.acknowledged
      || event.resolved;
    if (!terminal) return message;

    changed = true;
    return { ...message, actionRequired: false };
  });
  return changed ? repaired : inbox;
}
