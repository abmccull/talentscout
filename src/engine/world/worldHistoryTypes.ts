import type { Player } from "@/engine/core/types";

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
  /** Exact movement-ledger entries which occurred during this season. */
  movementEventIds: string[];
  /** Omitted when no explicit match participation exists. */
  performance?: PlayerSeasonPerformance;
}
