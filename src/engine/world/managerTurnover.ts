import { generateManagerProfile } from "@/engine/analytics";
import type {
  GameState,
  ManagerProfile,
  NarrativeEvent,
} from "@/engine/core/types";
import { generateDirectives } from "@/engine/firstTeam";
import { createRNG } from "@/engine/rng";

const MANAGER_TURNOVER_EVENT_TYPES = new Set<NarrativeEvent["type"]>([
  "managerFired",
  "managerSacked",
]);

export interface ManagerTurnoverRecord {
  eventId: string;
  clubId: string;
  outgoing: ManagerProfile | undefined;
  incoming: ManagerProfile;
}

export interface ManagerTurnoverResult {
  state: GameState;
  turnovers: ManagerTurnoverRecord[];
}

function eventClubId(state: GameState, event: NarrativeEvent): string | undefined {
  return event.relatedIds.find((id) => Boolean(state.clubs[id]))
    ?? state.scout.currentClubId;
}

function generateDistinctReplacement(
  state: GameState,
  event: NarrativeEvent,
  clubId: string,
  outgoing: ManagerProfile | undefined,
): ManagerProfile {
  const club = state.clubs[clubId];
  const managerId = `manager:${clubId}:s${event.season}w${event.week}:${event.id}`;
  let incoming = generateManagerProfile(
    createRNG(`${state.seed}:manager-turnover:${event.id}:0`),
    { ...club, managerId },
  );

  // A dismissal must visibly replace the person, even when the deterministic
  // name pool initially returns the incumbent's name.
  for (let attempt = 1; incoming.managerName === outgoing?.managerName && attempt < 6; attempt += 1) {
    incoming = generateManagerProfile(
      createRNG(`${state.seed}:manager-turnover:${event.id}:${attempt}`),
      { ...club, managerId },
    );
  }

  return { ...incoming, managerId };
}

/**
 * Apply factual manager-dismissal stories to the authoritative football world.
 * Both legacy event names remain supported for save compatibility, but they
 * converge on this single mutation path.
 */
export function applyNarrativeManagerTurnovers(
  state: GameState,
  events: readonly NarrativeEvent[],
): ManagerTurnoverResult {
  let updated = state;
  const turnovers: ManagerTurnoverRecord[] = [];

  for (const event of events) {
    if (!MANAGER_TURNOVER_EVENT_TYPES.has(event.type)) continue;
    const clubId = eventClubId(updated, event);
    if (!clubId || !updated.clubs[clubId]) continue;

    const outgoing = updated.managerProfiles[clubId];
    const incoming = generateDistinctReplacement(updated, event, clubId, outgoing);
    const club = { ...updated.clubs[clubId], managerId: incoming.managerId ?? incoming.clubId };
    const managerProfiles = { ...updated.managerProfiles, [clubId]: incoming };

    let managerDirectives = updated.managerDirectives;
    if (updated.scout.currentClubId === clubId && updated.scout.primarySpecialization === "firstTeam") {
      managerDirectives = generateDirectives(
        createRNG(`${updated.seed}:manager-directives:${event.id}`),
        club,
        incoming,
        updated.players,
        updated.currentSeason,
        updated.boardProfile,
      );
    }

    updated = {
      ...updated,
      clubs: { ...updated.clubs, [clubId]: club },
      managerProfiles,
      managerDirectives,
    };
    turnovers.push({ eventId: event.id, clubId, outgoing, incoming });
  }

  return { state: updated, turnovers };
}
