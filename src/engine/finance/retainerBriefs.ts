import type {
  Club,
  FinancialRecord,
  Player,
  Position,
  RetainerBrief,
  RetainerContract,
} from "../core/types";

const YOUTH_RETAINER_POSITIONS: Position[] = [
  "GK",
  "CB",
  "LB",
  "RB",
  "CDM",
  "CM",
  "CAM",
  "LW",
  "RW",
  "ST",
];

/** Build the only retainer brief supported by the Youth Early Access career. */
export function buildYouthRetainerBrief(
  club: Pick<Club, "name" | "playerIds">,
  players: Record<string, Player>,
  tier: RetainerContract["tier"],
): RetainerBrief {
  const roster = club.playerIds
    .map((playerId) => players[playerId])
    .filter((player): player is Player => Boolean(player));
  const targetPosition = YOUTH_RETAINER_POSITIONS
    .map((position) => ({
      position,
      count: roster.filter((player) => player.position === position).length,
    }))
    .sort((left, right) =>
      left.count - right.count || left.position.localeCompare(right.position)
    )[0].position;

  return {
    focus: "academy",
    targetPositions: [targetPosition],
    ageRange: [15, 20],
    minimumReportQuality: 48 + tier * 6,
    description: `${club.name} needs youth-pathway intelligence at ${targetPosition} for its academy planning.`,
  };
}

/** Reject dormant Data/First Team work and malformed legacy briefs at boundaries. */
export function isValidYouthRetainerBrief(
  brief: RetainerBrief | undefined,
): brief is RetainerBrief {
  return Boolean(
    brief
    && brief.focus === "academy"
    && Array.isArray(brief.targetPositions)
    && brief.targetPositions.length > 0
    && Array.isArray(brief.ageRange)
    && brief.ageRange.length >= 2
    && brief.ageRange[0] >= 15
    && brief.ageRange[1] <= 20
    && brief.ageRange[0] <= brief.ageRange[1]
    && Number.isFinite(brief.minimumReportQuality)
    && brief.minimumReportQuality >= 0,
  );
}

export function ensureYouthRetainerBrief(
  contract: RetainerContract,
  club: Pick<Club, "name" | "playerIds">,
  players: Record<string, Player>,
): RetainerContract {
  if (isValidYouthRetainerBrief(contract.brief)) return contract;
  return {
    ...contract,
    brief: buildYouthRetainerBrief(club, players, contract.tier),
  };
}

/** Repair prelaunch saves only when canonical club/roster context is available. */
export function normalizeYouthRetainerContracts(
  finances: FinancialRecord,
  clubs: Record<string, Club>,
  players: Record<string, Player>,
): FinancialRecord {
  const normalize = (contract: RetainerContract): RetainerContract => {
    const club = clubs[contract.clubId];
    return club ? ensureYouthRetainerBrief(contract, club, players) : contract;
  };

  return {
    ...finances,
    retainerContracts: finances.retainerContracts.map(normalize),
    pendingRetainerOffers: (finances.pendingRetainerOffers ?? []).map(normalize),
  };
}

