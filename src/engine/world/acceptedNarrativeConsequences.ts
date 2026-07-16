import type { Club, GameState, NarrativeEvent } from "@/engine/core/types";
import {
  applyNarrativeManagerTurnovers,
  type ManagerTurnoverRecord,
} from "@/engine/world/managerTurnover";

interface BudgetConsequenceConfig {
  clubBudgetMultiplier: number;
  scoutingBudgetMultiplier: number;
}

const MATERIAL_EVENT_BUDGET_CONSEQUENCES: Partial<
  Record<NarrativeEvent["type"], BudgetConsequenceConfig>
> = {
  budgetCut: {
    clubBudgetMultiplier: 0.92,
    scoutingBudgetMultiplier: 0.8,
  },
  clubFinancialTrouble: {
    clubBudgetMultiplier: 0.8,
    scoutingBudgetMultiplier: 0.6,
  },
};

export interface AcceptedNarrativeConsequencesResult {
  state: GameState;
  appliedBudgetEventIds: string[];
  managerTurnovers: ManagerTurnoverRecord[];
}

function resolveEventClubId(
  state: GameState,
  event: NarrativeEvent,
): string | undefined {
  return event.relatedIds.find((id) => Boolean(state.clubs[id]))
    ?? state.scout.currentClubId;
}

function applyBudgetConsequence(
  club: Club,
  config: BudgetConsequenceConfig,
): Club {
  return {
    ...club,
    budget: Math.max(
      0,
      Math.round(Math.max(0, club.budget) * config.clubBudgetMultiplier),
    ),
    scoutingBudget: Number.isFinite(club.scoutingBudget)
      ? Math.max(
          0,
          Math.round(
            Math.max(0, club.scoutingBudget ?? 0) * config.scoutingBudgetMultiplier,
          ),
        )
      : club.scoutingBudget,
  };
}

/**
 * Material narrative beats become authoritative only when the weekly director
 * accepts them for publication. Reprocessing an already published event id is
 * a no-op so the same story cannot cut budgets twice.
 */
export function applyAcceptedNarrativeConsequences(
  state: GameState,
  acceptedEvents: readonly NarrativeEvent[],
): AcceptedNarrativeConsequencesResult {
  const publishedEventIds = new Set(state.narrativeEvents.map((event) => event.id));
  const uniqueAcceptedEvents = acceptedEvents.filter((event, index, events) =>
    events.findIndex((candidate) => candidate.id === event.id) === index
  );
  const unpublishedEvents = uniqueAcceptedEvents.filter((event) =>
    !publishedEventIds.has(event.id)
  );

  const turnoverResult = applyNarrativeManagerTurnovers(state, unpublishedEvents);
  let updated = turnoverResult.state;
  const appliedBudgetEventIds: string[] = [];

  for (const event of unpublishedEvents) {
    const config = MATERIAL_EVENT_BUDGET_CONSEQUENCES[event.type];
    if (!config) continue;

    const clubId = resolveEventClubId(updated, event);
    if (!clubId) continue;
    const club = updated.clubs[clubId];
    if (!club) continue;

    updated = {
      ...updated,
      clubs: {
        ...updated.clubs,
        [clubId]: applyBudgetConsequence(club, config),
      },
    };
    appliedBudgetEventIds.push(event.id);
  }

  return {
    state: updated,
    appliedBudgetEventIds,
    managerTurnovers: turnoverResult.turnovers,
  };
}
