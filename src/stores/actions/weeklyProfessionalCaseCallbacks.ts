import type { GameState, InboxMessage, ScoutingCase } from "@/engine/core/types";

function playerName(state: GameState, playerId: string): string {
  const player = state.players[playerId]
    ?? state.retiredPlayers?.[playerId]
    ?? Object.values(state.unsignedYouth ?? {})
      .find((candidate) => candidate.player.id === playerId)?.player;
  return player
    ? `${player.firstName} ${player.lastName}`.trim()
    : "The prospect";
}

/** Turn delayed case facts into idempotent callbacks without inventing or rerolling outcomes. */
export function emitProfessionalCaseCallbacks(state: GameState): GameState {
  const existingMessageIds = new Set(state.inbox.map((message) => message.id));
  const callbacks = Object.values(state.consequenceState?.facts ?? {})
    .filter((fact) =>
      fact.kind === "professionalCaseCallback"
      && fact.observedAt.week === state.currentWeek
      && fact.observedAt.season === state.currentSeason
      && typeof fact.metadata?.caseId === "string"
      && !existingMessageIds.has(`professional-case-callback:${fact.id}`),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  if (callbacks.length === 0) return state;

  const scoutingCases = { ...state.scoutingCases };
  const messages: InboxMessage[] = [];
  for (const fact of callbacks) {
    const caseId = String(fact.metadata?.caseId);
    const scoutingCase = scoutingCases[caseId];
    if (!scoutingCase) continue;
    const decision = fact.sourceDecisionId
      ? state.consequenceState.decisions[fact.sourceDecisionId]
      : undefined;
    const selected = decision?.options.find((option) =>
      option.id === decision.selectedOptionId,
    );
    const isSetback = fact.metadata?.outcome === "setback" || fact.value === "setback";
    const outcomeDetail = typeof fact.metadata?.detail === "string"
      ? fact.metadata.detail
      : undefined;
    const name = playerName(state, scoutingCase.playerId);
    const title = scoutingCase.professionalContext?.title ?? "Professional case";
    messages.push({
      id: `professional-case-callback:${fact.id}`,
      week: state.currentWeek,
      season: state.currentSeason,
      type: "feedback",
      title: isSetback
        ? `${name}: the accepted risk came due`
        : `${name}: the earlier judgment mattered`,
      body: isSetback
        ? `${title} has exposed the downside you accepted.${outcomeDetail ? ` ${outcomeDetail}.` : ""} ${selected
          ? `Your decision to “${selected.label}” remains part of the permanent case record.`
          : "The recorded approach remains part of the permanent case record."}`
        : `${title} has produced a concrete opening.${outcomeDetail ? ` ${outcomeDetail}.` : ""} ${selected
          ? `Your decision to “${selected.label}” is now part of why the case moved.`
          : "The approach recorded in the case has now created a follow-up opportunity."} The result is preserved in the living casebook rather than awarded as an unexplained bonus.`,
      read: false,
      actionRequired: false,
      relatedId: scoutingCase.playerId,
      relatedEntityType: "player",
    });
    const updated: ScoutingCase = {
      ...scoutingCase,
      lastUpdatedWeek: state.currentWeek,
      lastUpdatedSeason: state.currentSeason,
    };
    scoutingCases[caseId] = updated;
  }
  if (messages.length === 0) return state;
  return {
    ...state,
    scoutingCases,
    inbox: [...state.inbox, ...messages],
  };
}
