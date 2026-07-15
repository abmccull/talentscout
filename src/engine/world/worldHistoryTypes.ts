import type {
  Player,
  PlayerMovementEvent,
  PlayerMovementType,
} from "@/engine/core/types";

export type PlayerCareerStatus =
  | "contracted"
  | "onLoan"
  | "freeAgent"
  | "retired"
  | "exitedFootball";

export interface PlayerSeasonPerformance {
  appearances: number;
  starts: number;
  /** Present only when every appearance has an explicit minutes value. */
  minutesPlayed?: number;
  appearancesWithoutMinutes: number;
  averageRating: number;
  goals: number;
  assists: number;
  cleanSheets: number;
}

/**
 * Compact, player-safe projection of an immutable movement-ledger row.
 *
 * The owning WorldSeasonHistory supplies the season; the summary retains its
 * player ID for archive rows that are outside the bounded comparison list. We
 * intentionally omit the raw event's
 * `reason` and `loanDealId`: neither is needed by the durable archive or the
 * comparison UI, and keeping them for every historic move defeats the point
 * of the archival tier.
 */
export interface PlayerMovementArchiveSummary {
  /** Stable source event id; lets legacy callers retain their history links. */
  id: string;
  playerId: string;
  type: PlayerMovementType;
  week: number;
  fromClubId?: string;
  toClubId?: string;
  contractClubId?: string;
  fee?: number;
}

/** Project only the durable, player-facing facts from a raw ledger event. */
export function summarizePlayerMovement(
  movement: PlayerMovementEvent,
): PlayerMovementArchiveSummary {
  return {
    id: movement.id,
    playerId: movement.playerId,
    type: movement.type,
    week: movement.week,
    ...(movement.fromClubId ? { fromClubId: movement.fromClubId } : {}),
    ...(movement.toClubId ? { toClubId: movement.toClubId } : {}),
    ...(movement.contractClubId ? { contractClubId: movement.contractClubId } : {}),
    ...(movement.fee !== undefined ? { fee: movement.fee } : {}),
  };
}

/** Stable archive order makes save compaction reproducible across reloads. */
export function sortPlayerMovementArchiveSummaries(
  summaries: readonly PlayerMovementArchiveSummary[],
): PlayerMovementArchiveSummary[] {
  return [...summaries].sort(
    (left, right) =>
      left.playerId.localeCompare(right.playerId)
      || left.week - right.week
      || left.id.localeCompare(right.id),
  );
}

export interface PlayerSeasonHistory {
  playerId: string;
  /** Stable display identity survives retirement-record compaction. */
  firstName?: string;
  lastName?: string;
  nationality?: string;
  age: number;
  position: Player["position"];
  currentAbility: number;
  marketValue: number;
  registeredClubId?: string;
  contractClubId?: string;
  loanParentClubId?: string;
  status: PlayerCareerStatus;
  /**
   * Stable movement IDs for this player-season. Old IDs resolve through the
   * parent season's compact `playerMovementSummaries` after raw ledger detail
   * has aged out.
   */
  movementEventIds: string[];
  /** Omitted when no explicit match participation exists. */
  performance?: PlayerSeasonPerformance;
}
