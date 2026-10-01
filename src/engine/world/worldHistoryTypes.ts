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

/** Lossless compact storage; objects remain readable for legacy and extension data. */
export type StoredPlayerMovementSummary = PlayerMovementArchiveSummary | [
  id: string | [prefix: string, suffix: string], playerId: string, type: PlayerMovementType, week: number, fields: number,
  ...values: (string | number)[],
];
const movementOptionalFields = ["fromClubId", "toClubId", "contractClubId", "fee"] as const;
const movementFields = new Set(["id", "playerId", "type", "week", ...movementOptionalFields]);

export function expandPlayerMovementSummary(stored: StoredPlayerMovementSummary): PlayerMovementArchiveSummary {
  if (!Array.isArray(stored)) return stored;
  const [id, playerId, type, week, fields, ...values] = stored;
  const result: PlayerMovementArchiveSummary = { id: Array.isArray(id) ? id[0] + playerId + id[1] : id, playerId, type, week };
  let index = 0;
  movementOptionalFields.forEach((key, bit) => {
    if (fields & (1 << bit)) Object.assign(result, { [key]: values[index++] });
  });
  return result;
}

export function compactPlayerMovementSummary(stored: StoredPlayerMovementSummary): StoredPlayerMovementSummary {
  if (Array.isArray(stored) || Object.keys(stored).some(key => !movementFields.has(key))) return stored;
  let fields = 0;
  const values: (string | number)[] = [];
  movementOptionalFields.forEach((key, bit) => {
    if (stored[key] !== undefined) { fields |= 1 << bit; values.push(stored[key]); }
  });
  // Generated movement IDs embed the full player ID. Store that occurrence once,
  // retaining arbitrary prefixes and suffixes so every source ID reconstructs exactly.
  const offset = stored.playerId ? stored.id.indexOf(stored.playerId) : -1;
  const id: string | [string, string] = offset >= 0 && stored.playerId.length > 8
    ? [stored.id.slice(0, offset), stored.id.slice(offset + stored.playerId.length)] : stored.id;
  return [id, stored.playerId, stored.type, stored.week, fields, ...values];
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
