import type { GameState, Player, Position } from "@/engine/core/types";
import { formationPositions, parseFormation } from "@/engine/firstTeam/systemFit";
import { getCurrentSeasonAppearances } from "@/engine/transfers/appearanceLedger";

export interface TransferMotivation {
  score: number;
  willingToMove: boolean;
  weeklyMoveProbability: number;
  components: {
    contractPressure: number;
    moralePressure: number;
    playingTimePressure: number;
    squadSurplusPressure: number;
    ambitionPressure: number;
    tacticalPressure: number;
    personalityPressure: number;
    agePressure: number;
  };
  reasons: string[];
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export type TransferMotivationWorldContext =
  Pick<GameState, "currentSeason" | "players" | "clubs">
  & Partial<Pick<GameState, "currentWeek" | "fixtures" | "matchRatings" | "managerProfiles">>;

function tacticalPositions(formation?: string): ReadonlySet<Position> {
  if (!formation) return new Set<Position>();
  const parsed = parseFormation(formation);
  return parsed
    ? formationPositions(parsed.defenders, parsed.midfielders, parsed.forwards)
    : new Set<Position>();
}

function positionCoverage(
  clubId: string,
  player: Player,
  state: TransferMotivationWorldContext,
): number {
  const club = state.clubs[clubId];
  if (!club) return 0;
  return club.playerIds.reduce((coverage, playerId) => {
    if (playerId === player.id) return coverage;
    const teammate = state.players[playerId];
    if (!teammate) return coverage;
    if (teammate.position === player.position) return coverage + 1;
    if (teammate.secondaryPositions?.includes(player.position)) return coverage + 0.35;
    return coverage;
  }, 0);
}

function careerStagePressure(player: Player, contractYears: number): number {
  if (player.age <= 20) return 34;
  if (player.age <= 24) return 26;
  if (player.age <= 29) return 16;
  if (player.age <= 32) return contractYears <= 1 ? 12 : 6;
  return contractYears <= 1 ? 22 : 10;
}

/**
 * Explainable transfer intent derived from contract, role and career context.
 * It decides whether a player enters the market; destination selection and the
 * authoritative movement lifecycle remain separate concerns.
 */
export function calculateTransferMotivation(
  player: Player,
  state: TransferMotivationWorldContext,
): TransferMotivation {
  const ownerClubId = player.contractClubId ?? player.loanParentClubId ?? player.clubId;
  const club = ownerClubId ? state.clubs[ownerClubId] : undefined;
  if (!club || player.onLoan || player.injured || player.age < 16) {
    return {
      score: 0,
      willingToMove: false,
      weeklyMoveProbability: 0,
      components: {
        contractPressure: 0,
        moralePressure: 0,
        playingTimePressure: 0,
        squadSurplusPressure: 0,
        ambitionPressure: 0,
        tacticalPressure: 0,
        personalityPressure: 0,
        agePressure: 0,
      },
      reasons: ["The player is not currently available for a permanent move."],
    };
  }

  const contractYears = player.contractExpiry - state.currentSeason;
  const contractPressure = contractYears <= 0 ? 100 : contractYears === 1 ? 78 : contractYears === 2 ? 35 : 8;
  const moralePressure = clamp((6 - (player.morale ?? 5)) * 18);
  const appearances = getCurrentSeasonAppearances(player, club.id, state);
  const elapsedWeeks = Math.max(1, state.currentWeek ?? 0);
  const appearanceShare = appearances / Math.max(1, Math.floor(elapsedWeeks / 2));
  const agePressure = careerStagePressure(player, contractYears);
  const playingTimePressure = player.age <= 20 && appearances === 0
    ? 45
    : clamp((0.65 - Math.min(1, appearanceShare)) * 120 + agePressure * 0.25);
  const coverage = positionCoverage(club.id, player, state);
  const squadSurplusPressure = coverage >= 4 ? 85
    : coverage >= 3 ? 60
      : coverage >= 2 ? 25
        : 5;
  const personalityPressure = clamp(
    ((player.personalityProfile?.transferWillingness ?? 0.45) - 0.18) * 100,
  );
  const playerLevel = player.currentAbility / 2;
  const ambitionPressure = clamp(
    (playerLevel - club.reputation - 5) * 3
    + personalityPressure * 0.35
    + agePressure * 0.45,
  );
  const manager = state.managerProfiles?.[club.id];
  const requiredPositions = manager
    ? tacticalPositions(manager.preferredFormation)
    : new Set<Position>();
  const primaryManagerFit = requiredPositions.has(player.position);
  const secondaryManagerFit = (player.secondaryPositions ?? []).some((position) => requiredPositions.has(position));
  const tacticalPressure = !manager ? 8
    : primaryManagerFit ? 8
      : secondaryManagerFit ? 32
        : 78;

  const score = clamp(
    contractPressure * 0.22
    + moralePressure * 0.16
    + playingTimePressure * 0.18
    + squadSurplusPressure * 0.12
    + ambitionPressure * 0.11
    + tacticalPressure * 0.09
    + personalityPressure * 0.07
    + agePressure * 0.05,
  );
  const willingToMove = score >= 42;
  const weeklyMoveProbability = willingToMove
    ? Math.min(0.14, Math.max(0.015, 0.015 + (score - 42) / 100 * 0.22))
    : 0;
  const reasons = [
    ...(contractPressure >= 70 ? ["The contract is close to expiry."] : []),
    ...(moralePressure >= 50 ? ["Low morale is pushing the player toward a change."] : []),
    ...(playingTimePressure >= 50 ? ["The player is not receiving enough first-team football."] : []),
    ...(squadSurplusPressure >= 60 ? ["The club has significant depth in this position."] : []),
    ...(ambitionPressure >= 50 ? ["The player's level is beginning to outgrow the club's standing."] : []),
    ...(tacticalPressure >= 50 ? ["The current manager has no natural role for the player."] : []),
    ...(personalityPressure >= 55 ? ["The player's temperament makes a move more likely."] : []),
    ...(agePressure >= 25 && playingTimePressure >= 40
      ? ["The player's career stage increases the urgency of finding the right pathway."]
      : []),
  ];

  return {
    score,
    willingToMove,
    weeklyMoveProbability,
    components: {
      contractPressure,
      moralePressure,
      playingTimePressure,
      squadSurplusPressure,
      ambitionPressure,
      tacticalPressure,
      personalityPressure,
      agePressure,
    },
    reasons: reasons.length > 0 ? reasons : ["The player remains broadly settled at the club."],
  };
}
