import { gameWeeksBetween, getSeasonLength } from "@/engine/core/gameDate";
import type { GameState, InboxMessage } from "@/engine/core/types";

function hasOfferedConsequenceDecision(state: GameState, relatedId: string): boolean {
  return Object.values(state.consequenceState?.decisions ?? {}).some((decision) =>
    decision.status === "offered"
    && (decision.id === relatedId || decision.source.id === relatedId)
  );
}

function hasLiveRelatedAction(state: GameState, message: InboxMessage): boolean | undefined {
  const relatedId = message.relatedId;
  if (!relatedId) return undefined;
  const kind = message.relatedEntityType;

  if (kind === "jobOffer" || message.type === "jobOffer") {
    return state.jobOffers.some((offer) => offer.id === relatedId);
  }
  if (kind === "narrative") {
    const event = state.narrativeEvents.find((candidate) => candidate.id === relatedId);
    return Boolean(
      event && event.selectedChoice === undefined && (event.choices?.length ?? 0) > 0,
    ) || hasOfferedConsequenceDecision(state, relatedId);
  }
  if (kind === "directive") {
    return state.managerDirectives.some((directive) =>
      directive.id === relatedId && !directive.fulfilled
    ) || (state.scout.boardDirectives ?? []).some((directive) =>
      directive.id === relatedId && !directive.completed
    );
  }
  if (kind === "seasonEvent") {
    return state.seasonEvents.some((event) => event.id === relatedId && !event.resolved);
  }
  if (kind === "assignment") {
    return state.activeInternationalAssignment?.id === relatedId
      || state.internationalAssignments.some((assignment) =>
        assignment.id === relatedId && !assignment.outcome
      );
  }
  if (kind === "gossip") {
    return Object.values(state.contacts).some((contact) =>
      (contact.gossipQueue ?? []).some((gossip) =>
        gossip.id === relatedId && !gossip.actionTaken && !gossip.dismissed
      )
    );
  }
  if (kind === "transfer") {
    return state.activeNegotiations.some((negotiation) =>
      (negotiation.id === relatedId || negotiation.playerId === relatedId)
      && negotiation.phase !== "completed"
      && negotiation.phase !== "collapsed"
    ) || state.freeAgentNegotiations.some((negotiation) =>
      negotiation.freeAgentId === relatedId
      && negotiation.status !== "accepted"
      && negotiation.status !== "rejected"
    );
  }
  if (kind === "bid") {
    return (state.finances?.reportListings ?? []).some((listing) =>
      listing.bids.some((bid) => bid.id === relatedId && bid.status === "pending")
    );
  }

  return undefined;
}

/**
 * Reconcile the inbox badge against authoritative action state. Unknown legacy
 * actions receive a generous one-season grace period, then become ordinary
 * unread history instead of remaining permanently pinned.
 */
export function reconcileInboxActionRequirements(
  state: GameState,
  maxUnknownAgeWeeks?: number,
): InboxMessage[] {
  const now = { season: state.currentSeason, week: state.currentWeek };
  const defaultMaximumAge = maxUnknownAgeWeeks
    ?? getSeasonLength(state.fixtures, Math.max(1, state.currentSeason - 1));
  let changed = false;
  const reconciled = state.inbox.map((message) => {
    if (!message.actionRequired) return message;
    const live = hasLiveRelatedAction(state, message);
    const age = Math.max(
      0,
      gameWeeksBetween(
        state.fixtures,
        { season: message.season, week: message.week },
        now,
      ),
    );
    if (live === true || (live === undefined && age <= defaultMaximumAge)) return message;
    changed = true;
    return { ...message, actionRequired: false };
  });
  return changed ? reconciled : state.inbox;
}
