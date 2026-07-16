import type { GameState, InboxMessage } from "@/engine/core/types";
import { getSeasonLength } from "@/engine/core/gameLoop";
import { registerDecision } from "@/engine/consequences";
import {
  createWorldConditionArcState,
  closeOrphanedWorldConditionArcDecisions,
  getDueWorldConditionArcBeats,
  reconcileWorldConditionArcDecisions,
  recordWorldConditionArcBeat,
  startWorldConditionArcs,
  type DueWorldConditionArcBeat,
} from "@/engine/world/worldConditionArcs";

export interface PreparedWorldConditionArcWeek {
  state: GameState;
  beats: DueWorldConditionArcBeat[];
}

/**
 * Start newly eligible arcs and expose only beats due at the authoritative
 * current date. The function is pure and is shared by every weekly execution
 * route through createWeeklyActions.
 */
export function prepareWorldConditionArcWeek(
  state: GameState,
): PreparedWorldConditionArcWeek {
  const now = { week: state.currentWeek, season: state.currentSeason };
  const seasonLength = getSeasonLength(state.fixtures, state.currentSeason);
  const migrated = createWorldConditionArcState(
    state.worldConditionArcState,
    state.countries,
  );
  const repairedDecisions = closeOrphanedWorldConditionArcDecisions({
    state: migrated,
    decisions: state.consequenceState.decisions,
    now,
  });
  const repairedState = repairedDecisions.closedDecisionIds.length > 0
    ? {
        ...state,
        consequenceState: {
          ...state.consequenceState,
          decisions: repairedDecisions.decisions,
        },
        inbox: state.inbox.map((message) =>
          message.relatedId
          && repairedDecisions.closedDecisionIds.includes(message.relatedId)
            ? { ...message, actionRequired: false }
            : message,
        ),
      }
    : state;
  const reconciled = reconcileWorldConditionArcDecisions({
    state: migrated,
    decisions: repairedState.consequenceState.decisions,
    now,
    seasonLength,
  });
  const worldConditionArcState = startWorldConditionArcs({
    state: reconciled,
    rootSeed: state.runManifest.rootSeed,
    conditions: state.worldConditionState?.active ?? [],
    now,
    seasonLength,
  });
  const preparedState = { ...repairedState, worldConditionArcState };
  return {
    state: preparedState,
    beats: getDueWorldConditionArcBeats({
      state: worldConditionArcState,
      now,
      seasonLength,
    }),
  };
}

function beatMessage(
  beat: DueWorldConditionArcBeat,
  now: { week: number; season: number },
): InboxMessage {
  const decisionId = beat.decision?.id;
  return {
    id: `world-arc-beat:${beat.beatId}`,
    week: now.week,
    season: now.season,
    type: beat.phase === "signal"
      ? "news"
      : beat.phase === "decision"
        ? "event"
        : "feedback",
    title: beat.title,
    body: beat.body,
    read: false,
    actionRequired: beat.phase === "decision" && Boolean(decisionId),
    relatedId: decisionId ?? beat.arc.id,
    relatedEntityType: "narrative",
  };
}

/**
 * Materialize only beats accepted by Story Director V2. Recording and decision
 * registration happen atomically in this projection, preventing duplicate
 * prompts if a week is replayed or reloaded.
 */
export function applyDirectedWorldConditionArcBeats(input: {
  state: GameState;
  beats: readonly DueWorldConditionArcBeat[];
  acceptedBeatIds: ReadonlySet<string>;
}): GameState {
  const now = {
    week: input.state.currentWeek,
    season: input.state.currentSeason,
  };
  let arcState = createWorldConditionArcState(
    input.state.worldConditionArcState,
    input.state.countries,
  );
  let consequenceState = input.state.consequenceState;
  let inbox = input.state.inbox;

  for (const beat of [...input.beats]
    .filter((candidate) => input.acceptedBeatIds.has(candidate.beatId))
    .sort((left, right) => left.beatId.localeCompare(right.beatId))) {
    if (beat.decision) {
      const registered = registerDecision(consequenceState, beat.decision);
      if (registered.error) {
        // A conflicting persisted ID means this authored prompt cannot be made
        // trustworthy. Close the arc rather than leaving an immortal action-
        // required card that the player can never resolve.
        const warningId = `world-arc-conflict:${beat.arc.id}`;
        if (!inbox.some((message) => message.id === warningId)) {
          inbox = [...inbox, {
            id: warningId,
            week: now.week,
            season: now.season,
            type: "warning",
            title: "A world event was safely closed",
            body: "A conflicting decision record prevented this world-condition event from being resolved reliably. The event was closed without applying a choice.",
            read: false,
            actionRequired: false,
          }];
        }
        arcState = recordWorldConditionArcBeat(arcState, beat.arc.id, "decision", now);
        arcState = recordWorldConditionArcBeat(arcState, beat.arc.id, "aftermath", now);
        continue;
      }
      consequenceState = registered.state;
    }

    const message = beatMessage(beat, now);
    if (!inbox.some((entry) => entry.id === message.id)) {
      inbox = [...inbox, message];
    }
    arcState = recordWorldConditionArcBeat(
      arcState,
      beat.arc.id,
      beat.phase,
      now,
    );
  }

  return {
    ...input.state,
    worldConditionArcState: arcState,
    consequenceState,
    inbox,
  };
}
