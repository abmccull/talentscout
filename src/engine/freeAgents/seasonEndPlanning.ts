import type { GameState } from "@/engine/core/types";
import { expandClubFinancialObligation } from "@/engine/finance/terminalRecordArchive";

/** Planning only: the lifecycle resolver still owns the actual transactions. */
export function projectSeasonEndRecruitmentState(
  state: GameState,
  departingPlayerIds: ReadonlySet<string>,
  renewals: readonly { playerId: string; clubId: string; contractLength: number; wage: number }[],
  terminalDeparturePlayerIds: ReadonlySet<string> = new Set(),
): GameState {
  const players = { ...state.players };
  for (const id of departingPlayerIds) delete players[id];
  for (const renewal of renewals) {
    const player = players[renewal.playerId];
    if (!player) continue;
    players[player.id] = { ...player, wage: renewal.wage,
      contractExpiry: state.currentSeason + renewal.contractLength };
  }
  // A confirmed retirement terminates its loan and weekly contribution. A
  // merely planned release can lose to a buy option, so it receives no credit.
  const terminatingLoans = new Map<string, Map<string, string>>();
  for (const deal of state.activeLoans ?? []) {
    if (deal.status !== "active" || !departingPlayerIds.has(deal.playerId)
      || !terminalDeparturePlayerIds.has(deal.playerId)) continue;
    const contributions = terminatingLoans.get(deal.loanClubId) ?? new Map<string, string>();
    contributions.set(deal.playerId, deal.parentClubId);
    terminatingLoans.set(deal.loanClubId, contributions);
  }
  const clubs = Object.fromEntries(Object.entries(state.clubs).map(([id, club]) => [id, {
    ...club,
    playerIds: club.playerIds.filter(id => !departingPlayerIds.has(id)),
    academyPlayerIds: club.academyPlayerIds?.filter(id => !departingPlayerIds.has(id)),
    loanedOutPlayerIds: club.loanedOutPlayerIds?.filter(id => !departingPlayerIds.has(id)),
    loanedInPlayerIds: club.loanedInPlayerIds?.filter(id => !departingPlayerIds.has(id)),
    financialObligations: terminatingLoans.has(id)
      ? club.financialObligations?.filter(stored => {
          const obligation = expandClubFinancialObligation(stored);
          return obligation.type !== "loanWageContribution" || obligation.status !== "active"
            || !obligation.playerId
            || terminatingLoans.get(id)?.get(obligation.playerId) !== obligation.creditorClubId;
        })
      : club.financialObligations,
  }]));
  return { ...state, players, clubs };
}
